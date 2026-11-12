// Links para compartir sin cuenta: el dirigente (o quien sea) abre /s/<token> en el navegador y ve los recortes que esperan
// aprobación y, si se eligió, el calendario de lo que viene. Con permiso «revisar» aprueba o rechaza (con comentario).
// Nada se publica ni se programa desde un link. Cada link ve SOLO su proyecto; opcional: código y vencimiento.
import crypto from 'node:crypto';

const CAN = ['ver', 'revisar'];
const MAX_TRIES = 8; // intentos de código por link y por IP cada 15 minutos
const MAX_LINK_FAILS = 25; // fallos en total por link (de cualquier IP): se traba una hora
const MIN_CODE = 6;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function initShare(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS share_links (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE,
    can TEXT NOT NULL DEFAULT 'revisar', calendar INTEGER NOT NULL DEFAULT 1, code_hash TEXT DEFAULT '', label TEXT DEFAULT '',
    expires_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), revoked_at TEXT DEFAULT '', last_seen_at TEXT DEFAULT '');
  CREATE INDEX IF NOT EXISTS share_links_project ON share_links(project_id);`);
  if (!db.prepare('PRAGMA table_info(projects)').all().some((c) => c.name === 'ics_token')) db.exec("ALTER TABLE projects ADD COLUMN ics_token TEXT DEFAULT ''");
}

const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (s) => s.replace(/[-:]/g, '').replace(' ', 'T').slice(0, 15).padEnd(15, '0');
// Partir líneas largas a 75 octetos (RFC 5545).
const fold = (line) => { const out = []; let rest = line; while (Buffer.byteLength(rest) > 75) { let n = 75; while (Buffer.byteLength(rest.slice(0, n)) > 75) n--; out.push(rest.slice(0, n)); rest = ' ' + rest.slice(n); } out.push(rest); return out.join('\r\n'); };
const NET = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

/**
 * Monta las rutas. `d`: { db helpers get/all/run, reviewClip, sendMedia(res, file, next) }.
 * Las de gestión van bajo /api (con sesión); las públicas, bajo /s y /pub (sin sesión, con el token).
 */
export function mountShare(app, d) {
  const { get, all, run, reviewClip, sendMedia } = d;
  const tries = new Map(); // `${token}|${ip}` y `${token}|*` -> { n, until }
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // los contadores vencidos se limpian solos
  setInterval(() => { const now = Date.now(); for (const [k, v] of tries) if (v.until <= now) tries.delete(k); }, 10 * 60 * 1000).unref();

  const view = (l) => ({
    id: l.id, can: l.can, calendar: !!l.calendar, label: l.label, has_code: !!l.code_hash, expires_at: l.expires_at, created_at: l.created_at,
    last_seen_at: l.last_seen_at, path: `/s/${l.token}`,
  });

  // ---- gestión (con sesión) ----
  app.get('/api/projects/:id/shares', (req, res) => {
    res.json(all("SELECT * FROM share_links WHERE project_id = ? AND revoked_at = '' ORDER BY id DESC", req.params.id).map(view));
  });
  app.post('/api/projects/:id/shares', (req, res) => {
    const p = get('SELECT id FROM projects WHERE id = ?', req.params.id);
    if (!p) return res.status(404).json({ error: 'No existe el proyecto' });
    const b = req.body || {};
    const can = CAN.includes(b.can) ? b.can : 'revisar';
    const code = String(b.code || '').trim();
    if (code && (code.length < MIN_CODE || code.length > 40)) return res.status(400).json({ error: `El código tiene que tener entre ${MIN_CODE} y 40 caracteres` });
    const days = Number(b.days || 0);
    if (!Number.isFinite(days) || days < 0 || days > 365) return res.status(400).json({ error: 'El vencimiento va de 0 (nunca) a 365 días' });
    const expires = days ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 19).replace('T', ' ') : '';
    const token = crypto.randomBytes(24).toString('base64url');
    const r = run('INSERT INTO share_links (project_id, token, can, calendar, code_hash, label, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      p.id, token, can, b.calendar === false ? 0 : 1, code ? sha(token + code) : '', String(b.label || '').slice(0, 80), expires);
    res.json(view(get('SELECT * FROM share_links WHERE id = ?', r.lastInsertRowid)));
  });
  app.delete('/api/shares/:id', (req, res) => {
    run("UPDATE share_links SET revoked_at = datetime('now') WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  // ---- calendario para Google Calendar / Apple / Outlook (suscripción .ics) ----
  // GET solo lee; crear o cambiar el link es POST (nunca un cambio de estado por GET).
  app.get('/api/projects/:id/ics', (req, res) => {
    const p = get('SELECT id, ics_token FROM projects WHERE id = ?', req.params.id);
    if (!p) return res.status(404).json({ error: 'No existe el proyecto' });
    res.json({ path: p.ics_token ? `/ics/${p.ics_token}.ics` : '' });
  });
  app.post('/api/projects/:id/ics', (req, res) => {
    const p = get('SELECT id, ics_token FROM projects WHERE id = ?', req.params.id);
    if (!p) return res.status(404).json({ error: 'No existe el proyecto' });
    let t = p.ics_token;
    if (!t || req.body?.nuevo === true) { t = crypto.randomBytes(24).toString('base64url'); run('UPDATE projects SET ics_token = ? WHERE id = ?', t, p.id); }
    res.json({ path: `/ics/${t}.ics` });
  });
  app.delete('/api/projects/:id/ics', (req, res) => { run("UPDATE projects SET ics_token = '' WHERE id = ?", req.params.id); res.json({ ok: true }); });
  app.get('/ics/:file', (req, res) => {
    const token = String(req.params.file || '').replace(/\.ics$/, '');
    const p = token && get("SELECT id, name FROM projects WHERE ics_token = ? AND ics_token != ''", token);
    if (!p) return res.status(404).end();
    const posts = all(`SELECT p.id, p.scheduled_at, p.status, p.external_url, a.network, a.handle, a.connected_as, r.title
      FROM posts p JOIN accounts a ON a.id = p.account_id JOIN reels r ON r.id = p.reel_id
      WHERE p.project_id = ? AND p.scheduled_at >= datetime('now', '-30 days') ORDER BY p.scheduled_at LIMIT 2000`, p.id);
    const tz = d.tz || 'America/Argentina/Buenos_Aires';
    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ACM//Agentic Campaign Manager//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEsc('ACM · ' + p.name)}`, `X-WR-TIMEZONE:${tz}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    for (const x of posts) {
      const end = new Date(x.scheduled_at.replace(' ', 'T') + ':00Z'); end.setUTCMinutes(end.getUTCMinutes() + 15);
      const endS = end.toISOString().slice(0, 16).replace('T', ' ');
      const who = x.connected_as || (x.handle ? '@' + x.handle : NET[x.network]);
      lines.push('BEGIN:VEVENT', `UID:acm-post-${x.id}@acm`, `DTSTAMP:${now}`, `DTSTART;TZID=${tz}:${icsTime(x.scheduled_at)}`, `DTEND;TZID=${tz}:${icsTime(endS)}`,
        `SUMMARY:${icsEsc(`${NET[x.network] || x.network} · ${x.title}`)}`, `DESCRIPTION:${icsEsc(`${who} · ${x.status}${x.external_url ? ' · ' + x.external_url : ''}`)}`,
        `STATUS:${x.status === 'bloqueado' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.set('Content-Type', 'text/calendar; charset=utf-8').set('Cache-Control', 'no-cache').send(lines.map(fold).join('\r\n') + '\r\n');
  });

  // ---- públicas (sin sesión) ----
  // El link vigente para este token, o el motivo. Con código, lo pide (cabecera X-Share-Code) y limita los intentos.
  async function open(req, res) {
    const l = get('SELECT * FROM share_links WHERE token = ?', String(req.params.token || ''));
    const gone = () => res.status(404).json({ error: 'Este link no existe o ya no está activo.' });
    if (!l || l.revoked_at) return gone();
    if (l.expires_at && new Date(l.expires_at.replace(' ', 'T') + 'Z') < new Date()) return res.status(410).json({ error: 'Este link venció. Pedile uno nuevo a quien te lo mandó.' });
    if (l.code_hash) {
      const now = Date.now(), key = `${l.token}|${req.ip}`, all_ = `${l.token}|*`;
      const t = tries.get(key), g = tries.get(all_);
      if (g && g.n >= MAX_LINK_FAILS && g.until > now) return res.status(429).json({ error: 'Este link se trabó por muchos intentos. Probá en una hora o pedí uno nuevo.' });
      if (t && t.n >= MAX_TRIES && t.until > now) return res.status(429).json({ error: 'Demasiados intentos. Probá en 15 minutos.' });
      const code = String(req.get('x-share-code') || '');
      const ok = code && crypto.timingSafeEqual(Buffer.from(sha(l.token + code)), Buffer.from(l.code_hash));
      if (!ok) {
        if (code) {
          tries.set(key, { n: (t && t.until > now ? t.n : 0) + 1, until: now + 15 * 60 * 1000 });
          tries.set(all_, { n: (g && g.until > now ? g.n : 0) + 1, until: now + 60 * 60 * 1000 });
          await sleep(400); // cada intento fallido cuesta
        }
        return res.status(401).json({ error: code ? 'Código incorrecto.' : 'Este link pide un código.', needs_code: true });
      }
      tries.delete(key);
    }
    return l;
  }

  app.get('/pub/share/:token', async (req, res) => {
    const l = await open(req, res); if (!l?.id) return;
    run("UPDATE share_links SET last_seen_at = datetime('now') WHERE id = ?", l.id);
    const p = get('SELECT id, name, role, org, color, photo, election_date, propaganda_until FROM projects WHERE id = ?', l.project_id);
    const reels = all("SELECT id, caption, hashtags, file, cover, duration, clip_id, moment, review, created_at FROM reels WHERE project_id = ? AND kind = 'listo' AND clip_id IS NOT NULL ORDER BY id", p.id);
    const clips = new Map();
    for (const r of reels) { if (!clips.has(r.clip_id)) clips.set(r.clip_id, []); clips.get(r.clip_id).push(r); }
    const pending = [...clips.entries()].filter(([, rs]) => rs.some((r) => r.review === 'pendiente')).map(([clip_id, rs]) => ({
      clip_id, tema: parse(rs[0].moment)?.tema || '',
      reels: rs.map((r) => ({ id: r.id, caption: r.caption, hashtags: r.hashtags, duration: r.duration, review: r.review, video: `/s/${l.token}/media/${r.file}`, cover: r.cover ? `/s/${l.token}/media/${r.cover}` : '' })),
    }));
    const upcoming = l.calendar ? all(`SELECT p.id, p.scheduled_at, p.status, a.network, a.handle, a.connected_as, r.title
      FROM posts p JOIN accounts a ON a.id = p.account_id JOIN reels r ON r.id = p.reel_id
      WHERE p.project_id = ? AND p.scheduled_at >= datetime('now', '-1 day') AND p.status IN ('programado', 'publicado', 'publicando') ORDER BY p.scheduled_at LIMIT 200`, p.id) : [];
    res.json({
      project: { name: p.name, role: p.role, org: p.org, color: p.color, photo: p.photo ? `/s/${l.token}/media/${p.photo}` : '', election_date: p.election_date, propaganda_until: p.propaganda_until },
      can: l.can, calendar: !!l.calendar, pending, upcoming,
    });
  });

  app.post('/pub/share/:token/clips/:clip_id', async (req, res) => {
    const l = await open(req, res); if (!l?.id) return;
    if (l.can !== 'revisar') return res.status(403).json({ error: 'Este link es solo para mirar.' });
    const who = String(req.body?.nombre || '').trim().slice(0, 60);
    const out = reviewClip(String(req.params.clip_id), req.body || {}, { onlyProject: l.project_id, onlyPending: true, origin: 'opinion_dirigente', who: who || 'link compartido' });
    res.status(out.status).json(out.body);
  });

  // Los videos de un link: solo archivos de reels (o la foto) de SU proyecto.
  app.get('/s/:token/media/:file', (req, res, next) => {
    const l = get("SELECT * FROM share_links WHERE token = ? AND revoked_at = ''", String(req.params.token || ''));
    if (!l || (l.expires_at && new Date(l.expires_at.replace(' ', 'T') + 'Z') < new Date())) return res.status(404).end();
    const f = String(req.params.file || '');
    const mine = get('SELECT 1 FROM reels WHERE project_id = ? AND (file = ? OR cover = ?)', l.project_id, f, f) || get('SELECT 1 FROM projects WHERE id = ? AND photo = ?', l.project_id, f);
    if (!mine) return res.status(404).end();
    sendMedia(res, f, next);
  });
}

function parse(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
