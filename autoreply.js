// Comentarios de nuestros reels de Instagram y respuestas automáticas por palabra clave: alguien comenta «PROPUESTAS» y le llega
// un mensaje privado (y opcional, una respuesta pública). Se leen los comentarios cada tanto (sin webhooks: no hace falta exponer nada)
// de los reels publicados en los últimos días. Cada regla nace apagada; mandar mensajes necesita el permiso
// instagram_manage_messages de Meta y la respuesta pública, instagram_manage_comments.
import { bases } from './connections.js';

export const INBOX_DAYS = 14;        // reels publicados hace menos de esto
export const INBOX_MAX_REPLIES = 40; // respuestas por vuelta (cuida el cupo y no parecer spam)

export function initAutoreply(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS autoreplies (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, keyword TEXT NOT NULL,
    dm TEXT DEFAULT '', public_reply TEXT DEFAULT '', active INTEGER DEFAULT 0, hits INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (project_id, keyword));
  CREATE TABLE IF NOT EXISTS inbox (
    comment_id TEXT PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, post_id INTEGER, media_id TEXT,
    username TEXT DEFAULT '', text TEXT DEFAULT '', at TEXT DEFAULT '', rule_id INTEGER, replied TEXT DEFAULT '', error TEXT DEFAULT '',
    read_at TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS inbox_project ON inbox(project_id, at);`);
}

// minúsculas y sin tildes: «Propuestas», «PROPUESTAS» y «propuéstas» son lo mismo
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matchRule(rules, text) {
  const t = ` ${norm(text).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  return rules.find((r) => { const k = norm(r.keyword).replace(/[^a-z0-9ñ]+/g, ' ').trim(); return k && t.includes(` ${k} `); }) || null;
}
const fill = (tpl, c) => String(tpl || '').replaceAll('{usuario}', c.username ? '@' + c.username : '').trim();

async function graph(method, path, token, params = {}) {
  const u = new URL(`${bases().graph}/${path}`);
  const opt = { method };
  if (method === 'GET') { for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('access_token', token); }
  else { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify({ ...params, access_token: token }); }
  const r = await fetch(u, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram respondió ${r.status}`);
  return j;
}

/**
 * Una vuelta: lee los comentarios nuevos de los reels de Instagram de cada proyecto (no demo) y responde los que tienen una palabra
 * clave de una regla activa. Cada comentario se procesa una sola vez. Devuelve { read, replied, errors }.
 */
export async function inboxCycle(db, credsOf, { now = new Date() } = {}) {
  const out = { read: 0, replied: 0, errors: [] };
  const since = new Date(now.getTime() - INBOX_DAYS * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const posts = db.prepare(`SELECT po.id, po.project_id, po.external_id, a.id AS account_id, a.handle, a.creds FROM posts po JOIN accounts a ON a.id = po.account_id JOIN projects p ON p.id = po.project_id
    WHERE p.demo = 0 AND a.network = 'instagram' AND a.status = 'conectada' AND po.status = 'publicado' AND po.external_id != '' AND po.published_at >= ?`).all(since);
  const seen = db.prepare('SELECT 1 FROM inbox WHERE comment_id = ?');
  const save = db.prepare('INSERT OR IGNORE INTO inbox (comment_id, project_id, post_id, media_id, username, text, at, rule_id, replied, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const rulesOf = new Map();
  for (const po of posts) {
    let c; try { c = credsOf(po); } catch { c = null; }
    if (!c?.pageAccessToken || !c?.instagramBusinessId) continue;
    const tok = c.pageAccessToken, hide = (m) => String(m).replaceAll(tok, '***');
    if (!rulesOf.has(po.project_id)) rulesOf.set(po.project_id, db.prepare('SELECT * FROM autoreplies WHERE project_id = ? AND active = 1 ORDER BY id').all(po.project_id));
    const rules = rulesOf.get(po.project_id);
    let list;
    try { list = (await graph('GET', `${encodeURIComponent(po.external_id)}/comments`, tok, { fields: 'id,text,username,timestamp', limit: '50' })).data || []; }
    catch (e) { out.errors.push(`reel ${po.external_id}: ${hide(e.message)}`); continue; }
    for (const m of list) {
      if (!m.id || seen.get(String(m.id))) continue;
      out.read++;
      const own = po.handle && norm(m.username) === norm(String(po.handle).replace(/^@/, ''));
      const rule = own ? null : matchRule(rules, m.text);
      let replied = [], error = '';
      if (rule && out.replied < INBOX_MAX_REPLIES) {
        try {
          if (rule.dm) { await graph('POST', `${encodeURIComponent(c.instagramBusinessId)}/messages`, tok, { recipient: { comment_id: String(m.id) }, message: { text: fill(rule.dm, m) } }); replied.push('mensaje'); }
          if (rule.public_reply) { await graph('POST', `${encodeURIComponent(m.id)}/replies`, tok, { message: fill(rule.public_reply, m) }); replied.push('respuesta'); }
          db.prepare('UPDATE autoreplies SET hits = hits + 1 WHERE id = ?').run(rule.id);
          out.replied++;
        } catch (e) { error = hide(e.message); out.errors.push(`comentario ${m.id}: ${error}`); }
      }
      save.run(String(m.id), po.project_id, po.id, po.external_id, String(m.username || ''), String(m.text || '').slice(0, 2000), String(m.timestamp || '').replace('T', ' ').slice(0, 19), rule?.id ?? null, replied.join('+'), error);
    }
  }
  return out;
}

// Rutas con sesión (van después de app.use('/api', requireAuth)).
export function mountAutoreply(app, { get, all, run, cycle }) {
  const clean = (b) => {
    const keyword = String(b?.keyword || '').trim().slice(0, 40), dm = String(b?.dm || '').trim().slice(0, 900), public_reply = String(b?.public_reply || '').trim().slice(0, 300);
    if (!norm(keyword).replace(/[^a-z0-9ñ]/g, '')) return { error: 'Poné la palabra clave' };
    if (!dm && !public_reply) return { error: 'Escribí el mensaje privado o la respuesta pública' };
    return { keyword, dm, public_reply };
  };
  app.get('/api/projects/:id/inbox', (req, res) => {
    const rules = all('SELECT * FROM autoreplies WHERE project_id = ? ORDER BY id', req.params.id);
    const items = all(`SELECT i.*, r.title AS reel FROM inbox i LEFT JOIN posts po ON po.id = i.post_id LEFT JOIN reels r ON r.id = po.reel_id
      WHERE i.project_id = ? ORDER BY i.at DESC, i.read_at DESC LIMIT 200`, req.params.id);
    res.json({ rules, items });
  });
  app.post('/api/projects/:id/autoreplies', (req, res) => {
    if (!get('SELECT 1 FROM projects WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'No existe el proyecto' });
    const c = clean(req.body); if (c.error) return res.status(400).json(c);
    if (all('SELECT keyword FROM autoreplies WHERE project_id = ?', req.params.id).some((r) => norm(r.keyword).trim() === norm(c.keyword).trim())) return res.status(409).json({ error: 'Ya hay una regla con esa palabra' });
    try { run('INSERT INTO autoreplies (project_id, keyword, dm, public_reply, active) VALUES (?, ?, ?, ?, 0)', req.params.id, c.keyword, c.dm, c.public_reply); }
    catch { return res.status(409).json({ error: 'Ya hay una regla con esa palabra' }); }
    res.json({ ok: true });
  });
  app.put('/api/autoreplies/:id', (req, res) => {
    const r = get('SELECT * FROM autoreplies WHERE id = ?', req.params.id);
    if (!r) return res.status(404).json({ error: 'No existe la regla' });
    if ('active' in (req.body || {}) && Object.keys(req.body).length === 1) { run('UPDATE autoreplies SET active = ? WHERE id = ?', req.body.active ? 1 : 0, r.id); return res.json({ ok: true }); }
    const c = clean({ ...r, ...req.body }); if (c.error) return res.status(400).json(c);
    run('UPDATE autoreplies SET keyword = ?, dm = ?, public_reply = ? WHERE id = ?', c.keyword, c.dm, c.public_reply, r.id);
    res.json({ ok: true });
  });
  app.delete('/api/autoreplies/:id', (req, res) => { run('DELETE FROM autoreplies WHERE id = ?', req.params.id); res.json({ ok: true }); });
  app.post('/api/inbox/run', async (req, res) => {
    try { res.json(await cycle()); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
}
