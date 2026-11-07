// ACM — Agentic Campaign Manager. Servidor: API JSON + archivos + login de un solo administrador.
import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readPadron } from './padron.js';
import { publish } from './publisher.js';
import { testAds, uploadAudience, createCampaign } from './ads.js';
import { initTrace, traced } from './trace.js';
import { runBanco } from './banco.js';
import { probe, review } from './mp4probe.js';
import { postBlocked, pautaNumbers } from './rules.js';
import { FIELDS, makeVault, publicFields, mergeFields, testConnection } from './connections.js';
import { initKnowledge, addItems, addInstagram, search, stats, fillVectors, KINDS } from './knowledge.js';

const PORT = Number(process.env.PORT || 3000);
const DATA = path.resolve(process.env.ACM_DATA || './data');
const UPLOADS = path.join(DATA, 'uploads');
const PROD = process.env.NODE_ENV === 'production';
const PASSWORD = process.env.ACM_PASSWORD || (PROD ? '' : 'admin');
if (!PASSWORD) { console.error('Falta ACM_PASSWORD'); process.exit(1); }
// Las fechas se guardan en hora de la campaña (Argentina), no en la del servidor.
const TZ = process.env.ACM_TZ || 'America/Argentina/Buenos_Aires';
const tzFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const localNow = (offsetMin = 0) => tzFmt.format(new Date(Date.now() + offsetMin * 6e4)).replace(',', '');
const SECRET = process.env.ACM_SECRET || crypto.createHash('sha256').update('acm:' + PASSWORD).digest('hex');
const vault = makeVault(SECRET);

fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- base ----------
const db = new DatabaseSync(path.join(DATA, 'acm.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '', org TEXT DEFAULT '',
  election_date TEXT DEFAULT '', padron INTEGER DEFAULT 0, color TEXT DEFAULT '#3842f3',
  photo TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  network TEXT NOT NULL, handle TEXT NOT NULL, kind TEXT DEFAULT 'apoyo', status TEXT DEFAULT 'pendiente',
  followers INTEGER DEFAULT 0, posts_per_day INTEGER DEFAULT 3, notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, caption TEXT DEFAULT '', file TEXT NOT NULL, original_name TEXT DEFAULT '',
  size INTEGER DEFAULT 0, status TEXT DEFAULT 'borrador', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL, status TEXT DEFAULT 'programado', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pauta (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  match_pct REAL DEFAULT 60, frequency REAL DEFAULT 10, cpm REAL DEFAULT 6, iva INTEGER DEFAULT 1,
  start_date TEXT DEFAULT '', networks TEXT DEFAULT 'meta');
`);

// columnas agregadas después de la primera versión
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
if (!cols('pauta').includes('budget')) db.exec('ALTER TABLE pauta ADD COLUMN budget REAL DEFAULT 0');
if (!cols('pauta').includes('end_date')) db.exec("ALTER TABLE pauta ADD COLUMN end_date TEXT DEFAULT ''");
for (const [c, def] of [['propaganda_until', "TEXT DEFAULT ''"], ['padron_contacts', 'INTEGER DEFAULT 0'], ['padron_phones', 'INTEGER DEFAULT 0'], ['padron_emails', 'INTEGER DEFAULT 0'], ['padron_file', "TEXT DEFAULT ''"], ['padron_at', "TEXT DEFAULT ''"]])
  if (!cols('projects').includes(c)) db.exec(`ALTER TABLE projects ADD COLUMN ${c} ${def}`);
for (const [c, def] of [['external_id', "TEXT DEFAULT ''"], ['external_url', "TEXT DEFAULT ''"], ['error', "TEXT DEFAULT ''"], ['note', "TEXT DEFAULT ''"], ['published_at', "TEXT DEFAULT ''"], ['attempts', 'INTEGER DEFAULT 0']])
  if (!cols('posts').includes(c)) db.exec(`ALTER TABLE posts ADD COLUMN ${c} ${def}`);
// si el servidor se reinició a mitad de una subida, esas vuelven a la fila
db.exec("UPDATE posts SET status = 'programado' WHERE status = 'publicando'");
for (const [c, def] of [['ads_creds', "TEXT DEFAULT ''"], ['ads_name', "TEXT DEFAULT ''"], ['ads_currency', "TEXT DEFAULT ''"], ['ads_rate', 'REAL DEFAULT 0'], ['ads_political', 'INTEGER DEFAULT 1'],
  ['ads_audience_id', "TEXT DEFAULT ''"], ['ads_audience_count', 'INTEGER DEFAULT 0'], ['ads_campaign_id', "TEXT DEFAULT ''"], ['ads_ads', 'INTEGER DEFAULT 0'], ['ads_error', "TEXT DEFAULT ''"], ['ads_at', "TEXT DEFAULT ''"]])
  if (!cols('projects').includes(c)) db.exec(`ALTER TABLE projects ADD COLUMN ${c} ${def}`);
for (const [c, def] of [['duration', 'REAL'], ['width', 'INTEGER'], ['height', 'INTEGER']])
  if (!cols('reels').includes(c)) db.exec(`ALTER TABLE reels ADD COLUMN ${c} ${def}`);
initTrace(db);
initKnowledge(db);
db.exec('CREATE TABLE IF NOT EXISTS padron (project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, em TEXT, ph TEXT)');
db.exec('CREATE INDEX IF NOT EXISTS padron_project ON padron(project_id)');
for (const [c, def] of [['creds', "TEXT DEFAULT ''"], ['connected_as', "TEXT DEFAULT ''"], ['last_error', "TEXT DEFAULT ''"], ['last_checked_at', "TEXT DEFAULT ''"]])
  if (!cols('accounts').includes(c)) db.exec(`ALTER TABLE accounts ADD COLUMN ${c} ${def}`);

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---------- sesión (cookie firmada) ----------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeToken() { const exp = String(Date.now() + 30 * 864e5); return `${exp}.${sign(exp)}`; }
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const authed = (req) => validToken(cookie(req).acm);
function requireAuth(req, res, next) { if (authed(req)) return next(); res.status(401).json({ error: 'Sin sesión' }); }

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
// la investigación se importa en un solo JSON grande (fichas + publicaciones de las cuentas)
const jsonSmall = express.json({ limit: '1mb' }), jsonBig = express.json({ limit: '25mb' });
app.use((req, res, next) => (/\/knowledge\/import$/.test(req.path) ? jsonBig : jsonSmall)(req, res, next));
app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// Delante hay un solo proxy (Traefik de Coolify): req.ip toma la IP que agrega él, no la que mande el cliente.
app.set('trust proxy', 1);
const attempts = new Map();
const total = { n: 0, t: Date.now() };
// Los intentos se atienden de a uno (en fila), así la demora limita cuántos por segundo entran aunque vengan de muchas IPs.
let loginQueue = Promise.resolve();
app.post('/api/login', (req, res) => {
  loginQueue = loginQueue.then(() => login(req, res)).catch(() => {});
});
async function login(req, res) {
  const now = Date.now();
  if (now - total.t > 15 * 60e3) { total.n = 0; total.t = now; attempts.clear(); }
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0 };
  if (a.n >= 10) return res.status(429).json({ error: 'Demasiados intentos. Probá en 15 minutos.' });
  // se cuenta el intento antes de esperar; si la contraseña es correcta se descuenta
  a.n++; total.n++; attempts.set(ip, a);
  // el contador global no bloquea (no puede dejar afuera al dueño): solo frena, y como van en fila, frena a todos
  await new Promise((r) => setTimeout(r, total.n > 20 ? Math.min(5000, (total.n - 20) * 250) : 300));
  const given = Buffer.from(String(req.body?.password || ''));
  const want = Buffer.from(PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  attempts.delete(ip); total.n = Math.max(0, total.n - 1);
  res.set('Set-Cookie', `acm=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
}
app.post('/api/logout', (req, res) => { res.set('Set-Cookie', 'acm=; Path=/; HttpOnly; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/session', (req, res) => res.json({ ok: authed(req) }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);
app.use('/media', requireAuth, express.static(UPLOADS, { maxAge: '7d', immutable: true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, f, cb) => cb(null, crypto.randomUUID() + (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '')),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^(video|image)\//.test(f.mimetype) || /\.(mp4|mov|m4v|webm|jpe?g|png|webp)$/i.test(f.originalname)),
});
const rmFile = (f) => { if (f) fs.rm(path.join(UPLOADS, path.basename(f)), { force: true }, () => {}); };

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}
const P_FIELDS = ['name', 'role', 'org', 'election_date', 'propaganda_until', 'padron', 'color', 'notes'];
const A_FIELDS = ['network', 'posts_per_day'];
// la cuenta que ve la pantalla: sin los datos cifrados, con qué campos de conexión hay cargados
function accountOut(a) {
  if (!a) return a;
  const { creds, ...rest } = a;
  return { ...rest, fields: publicFields(a.network, vault.open(creds)) };
}
const NETWORKS = ['instagram', 'facebook', 'tiktok', 'youtube'];

function projectSummary(full) {
  const { ads_creds, ...p } = full;
  const ac = vault.open(ads_creds);
  const c = (sql) => get(sql, p.id).n;
  return {
    ...p,
    ads: { adAccountId: ac.adAccountId || '', token: !!ac.accessToken },
    accounts: c('SELECT count(*) n FROM accounts WHERE project_id = ?'),
    accounts_live: c("SELECT count(*) n FROM accounts WHERE project_id = ? AND status = 'conectada'"),
    reels: c('SELECT count(*) n FROM reels WHERE project_id = ?'),
    scheduled: c("SELECT count(*) n FROM posts WHERE project_id = ? AND status = 'programado'"),
    published: c("SELECT count(*) n FROM posts WHERE project_id = ? AND status = 'publicado'"),
    pauta: get('SELECT * FROM pauta WHERE project_id = ?', p.id) || null,
  };
}

// vista general de todos los proyectos (Inicio)
app.get('/api/overview', (req, res) => {
  res.json({
    upcoming: all(`SELECT p.id, p.scheduled_at, p.status, p.project_id, pr.name AS project, pr.color, r.title AS reel_title, a.network, a.handle
      FROM posts p JOIN reels r ON r.id = p.reel_id JOIN accounts a ON a.id = p.account_id JOIN projects pr ON pr.id = p.project_id
      WHERE p.status IN ('programado', 'publicando') AND p.scheduled_at >= ? ORDER BY p.scheduled_at LIMIT 14`, localNow(-60)),
    upcoming14: all(`SELECT project_id, scheduled_at FROM posts WHERE scheduled_at >= ? AND scheduled_at < ?`, localNow().slice(0, 10), localNow(14 * 1440).slice(0, 10)),
    networks: all(`SELECT network, count(*) AS total, sum(status = 'conectada') AS live, sum(CASE WHEN status = 'conectada' THEN followers ELSE 0 END) AS followers FROM accounts GROUP BY network`),
    byProject: all(`SELECT project_id, network, count(*) AS n FROM accounts GROUP BY project_id, network`),
    next: all(`SELECT project_id, min(scheduled_at) AS at FROM posts WHERE status = 'programado' AND scheduled_at >= ? GROUP BY project_id`, localNow()),
  });
});

// proyectos
app.get('/api/projects', (req, res) => res.json(all('SELECT * FROM projects ORDER BY created_at DESC').map(projectSummary)));
app.post('/api/projects', upload.single('photo'), (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Falta el nombre' });
  const r = run('INSERT INTO projects (name, role, org, election_date, propaganda_until, padron, color, notes, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    b.name.trim(), b.role || '', b.org || '', b.election_date || '', b.propaganda_until || '', Number(b.padron) || 0, b.color || '#ff5a1f', b.notes || '', req.file?.filename || '');
  run('INSERT INTO pauta (project_id) VALUES (?)', r.lastInsertRowid);
  res.json(projectSummary(get('SELECT * FROM projects WHERE id = ?', r.lastInsertRowid)));
});
app.get('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  res.json(projectSummary(p));
});
app.put('/api/projects/:id', upload.single('photo'), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  const data = pick(req.body || {}, P_FIELDS);
  if ('padron' in data) data.padron = Number(data.padron) || 0;
  if (req.file) { rmFile(p.photo); data.photo = req.file.filename; }
  update('projects', p.id, data);
  res.json(projectSummary(get('SELECT * FROM projects WHERE id = ?', p.id)));
});
app.delete('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  all('SELECT file FROM reels WHERE project_id = ?', p.id).forEach((r) => rmFile(r.file));
  rmFile(p.photo);
  run('DELETE FROM projects WHERE id = ?', p.id);
  res.json({ ok: true });
});

// padrón
const padronUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
app.post('/api/projects/:id/padron', padronUpload.single('file'), async (req, res) => {
  const p = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  if (!req.file) return res.status(400).json({ error: 'No llegó el archivo' });
  let r;
  try { r = await readPadron(req.file.buffer, req.file.originalname); } catch (e) { return res.status(400).json({ error: e.message }); }
  db.exec('BEGIN');
  try {
    run('DELETE FROM padron WHERE project_id = ?', p.id);
    const ins = db.prepare('INSERT INTO padron (project_id, em, ph) VALUES (?, ?, ?)');
    for (const [em, ph] of r.hashes) ins.run(p.id, em, ph);
    run("UPDATE projects SET padron = ?, padron_contacts = ?, padron_phones = ?, padron_emails = ?, padron_file = ?, padron_at = datetime('now') WHERE id = ?",
      r.total, r.contacts, r.phones, r.emails, path.basename(req.file.originalname).slice(0, 120), p.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ...projectSummary(get('SELECT * FROM projects WHERE id = ?', p.id)), columns: r.columns });
});
app.delete('/api/projects/:id/padron', (req, res) => {
  run('DELETE FROM padron WHERE project_id = ?', req.params.id);
  run("UPDATE projects SET padron_contacts = 0, padron_phones = 0, padron_emails = 0, padron_file = '', padron_at = '' WHERE id = ?", req.params.id);
  res.json(projectSummary(get('SELECT * FROM projects WHERE id = ?', req.params.id)));
});

// cuentas
app.get('/api/projects/:id/accounts', (req, res) => res.json(all('SELECT * FROM accounts WHERE project_id = ? ORDER BY network, created_at', req.params.id).map(accountOut)));
app.post('/api/projects/:id/accounts', (req, res) => {
  const b = pick(req.body || {}, A_FIELDS);
  if (!NETWORKS.includes(b.network)) return res.status(400).json({ error: 'Falta la red' });
  // el nombre de la cuenta lo trae la conexión
  const r = run("INSERT INTO accounts (project_id, network, handle, kind, status, posts_per_day) VALUES (?, ?, '', 'secundaria', 'pendiente', ?)",
    req.params.id, b.network, Number(b.posts_per_day) || 3);
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', r.lastInsertRowid)));
});
app.put('/api/accounts/:id', (req, res) => {
  const data = pick(req.body || {}, A_FIELDS);
  delete data.network; // la red no cambia: sus datos de conexión son de esa red
  // pausar y reanudar es lo único del estado que se toca a mano; "conectada" sale de probar la conexión
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  if (req.body?.status === 'pausada') data.status = 'pausada';
  if (req.body?.status === 'activa' && a.status === 'pausada') data.status = a.connected_as ? 'conectada' : 'pendiente';
  update('accounts', a.id, data);
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', a.id)));
});
app.put('/api/accounts/:id/connection', (req, res) => {
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  const creds = mergeFields(a.network, vault.open(a.creds), req.body || {});
  run('UPDATE accounts SET creds = ? WHERE id = ?', vault.seal(creds), a.id);
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', a.id)));
});
app.post('/api/accounts/:id/test', async (req, res) => {
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  let creds = mergeFields(a.network, vault.open(a.creds), req.body || {});
  const now = new Date().toISOString();
  try {
    const r = await traced({ kind: 'conexion', title: `Probar conexión de ${({ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' })[a.network]}`, project_id: a.project_id, account_id: a.id, network: a.network, secrets: Object.values(creds) },
      async () => { const x = await testConnection(a.network, creds); return { ...x, summary: `Conectada como ${x.connectedAs}` }; });
    if (r.extra) creds = { ...creds, ...r.extra };
    run(`UPDATE accounts SET creds = ?, connected_as = ?, handle = ?, followers = ?, last_error = '', last_checked_at = ?,
         status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'conectada' END WHERE id = ?`,
      vault.seal(creds), r.connectedAs || '', String(r.connectedAs || '').replace(/^@/, ''), r.followers || a.followers, now, a.id);
  } catch (e) {
    run(`UPDATE accounts SET creds = ?, last_error = ?, last_checked_at = ?, status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'error' END WHERE id = ?`,
      vault.seal(creds), e.message, now, a.id);
  }
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', a.id)));
});
app.delete('/api/accounts/:id/connection', (req, res) => {
  run("UPDATE accounts SET creds = '', connected_as = '', last_error = '', status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'pendiente' END WHERE id = ?", req.params.id);
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', req.params.id)));
});
app.delete('/api/accounts/:id', (req, res) => { run('DELETE FROM accounts WHERE id = ?', req.params.id); res.json({ ok: true }); });

// reels
app.get('/api/projects/:id/reels', (req, res) => res.json(all(`SELECT r.*, (SELECT count(*) FROM posts WHERE reel_id = r.id) AS posts FROM reels r WHERE project_id = ? ORDER BY created_at DESC`, req.params.id)));
app.post('/api/projects/:id/reels', upload.array('files', 30), (req, res) => {
  if (!get('SELECT id FROM projects WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'No existe' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No llegó ningún video' });
  const out = files.map((f) => {
    const title = (req.body?.title && files.length === 1) ? req.body.title : path.parse(f.originalname).name.replace(/[_-]+/g, ' ');
    const m = probe(f.path) || {};
    const r = run('INSERT INTO reels (project_id, title, caption, file, original_name, size, duration, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      req.params.id, title, req.body?.caption || '', f.filename, f.originalname, f.size, m.duration ?? null, m.width ?? null, m.height ?? null);
    return get('SELECT *, 0 AS posts FROM reels WHERE id = ?', r.lastInsertRowid);
  });
  res.json(out);
});
app.put('/api/reels/:id', (req, res) => {
  update('reels', req.params.id, pick(req.body || {}, ['title', 'caption', 'status']));
  res.json(get('SELECT * FROM reels WHERE id = ?', req.params.id));
});
app.delete('/api/reels/:id', (req, res) => {
  const r = get('SELECT * FROM reels WHERE id = ?', req.params.id);
  if (r) { rmFile(r.file); run('DELETE FROM reels WHERE id = ?', r.id); }
  res.json({ ok: true });
});

// publicaciones
// el programador compara fechas como texto en hora argentina: todas van como "AAAA-MM-DD HH:MM" (sin T ni segundos)
const schedAt = (v) => { const m = String(v || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[1]} ${m[2]}` : ''; };
app.get('/api/projects/:id/posts', (req, res) => res.json(all(`
  SELECT p.*, r.title AS reel_title, r.file AS reel_file, a.network, a.handle
  FROM posts p JOIN reels r ON r.id = p.reel_id JOIN accounts a ON a.id = p.account_id
  WHERE p.project_id = ? ORDER BY p.scheduled_at`, req.params.id)));
app.post('/api/projects/:id/posts', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const ins = db.prepare('INSERT INTO posts (project_id, reel_id, account_id, scheduled_at) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const it of items) {
      if (!it?.reel_id || !it?.account_id || !it?.scheduled_at) throw new Error('Faltan datos de la publicación');
      const at = schedAt(it.scheduled_at);
      if (!at) throw new Error('Fecha inválida: tiene que ser AAAA-MM-DD HH:MM');
      if (!get('SELECT 1 FROM reels WHERE id = ? AND project_id = ?', it.reel_id, req.params.id) || !get('SELECT 1 FROM accounts WHERE id = ? AND project_id = ?', it.account_id, req.params.id))
        throw new Error('El reel o la cuenta no son de este proyecto');
      ins.run(req.params.id, it.reel_id, it.account_id, at);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true, created: items.length });
});
app.put('/api/posts/:id', (req, res) => {
  const p = get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  if (p.status === 'publicando') return res.status(409).json({ error: 'Se está publicando en este momento' });
  const d = pick(req.body || {}, ['scheduled_at', 'status']);
  if ('scheduled_at' in d && !(d.scheduled_at = schedAt(d.scheduled_at))) return res.status(400).json({ error: 'Fecha inválida: tiene que ser AAAA-MM-DD HH:MM' });
  if (d.status && !['programado', 'publicado', 'fallido'].includes(d.status)) return res.status(400).json({ error: 'Estado inválido' });
  if (d.status === 'programado') d.error = '';
  update('posts', p.id, d);
  res.json({ ok: true });
});
app.delete('/api/posts/:id', (req, res) => { run('DELETE FROM posts WHERE id = ?', req.params.id); res.json({ ok: true }); });

app.post('/api/posts/:id/now', (req, res) => {
  const p = get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  if (p.status === 'publicando') return res.status(409).json({ error: 'Ya se está publicando' });
  if (p.status === 'publicado') return res.status(409).json({ error: 'Ya está publicada' });
  run("UPDATE posts SET status = 'programado', scheduled_at = ?, error = '' WHERE id = ?", localNow(), p.id);
  setImmediate(tick);
  res.json({ ok: true });
});
app.get('/api/clock', (req, res) => res.json({ now: localNow(), tz: TZ }));

// Meta Ads del proyecto
const projectRow = (id) => get('SELECT * FROM projects WHERE id = ?', id);
const sendProject = (res, id) => res.json(projectSummary(projectRow(id)));
app.put('/api/projects/:id/ads', (req, res) => {
  const p = projectRow(req.params.id); if (!p) return res.status(404).json({ error: 'No existe' });
  const c = vault.open(p.ads_creds), b = req.body || {};
  if (b.adAccountId !== undefined) c.adAccountId = String(b.adAccountId).trim().replace(/^act_/, '');
  if (b.accessToken) c.accessToken = String(b.accessToken).trim();
  run('UPDATE projects SET ads_creds = ?, ads_rate = ?, ads_political = ? WHERE id = ?', vault.seal(c), Number(b.rate ?? p.ads_rate) || 0, b.political === undefined ? p.ads_political : (b.political ? 1 : 0), p.id);
  sendProject(res, p.id);
});
const adsFail = (res, id, e) => { run('UPDATE projects SET ads_error = ? WHERE id = ?', e.message, id); res.status(400).json({ error: e.message }); };
app.post('/api/projects/:id/ads/test', async (req, res) => {
  const p = projectRow(req.params.id); if (!p) return res.status(404).json({ error: 'No existe' });
  const adsRun = (title, fn) => traced({ kind: 'meta_ads', title, project_id: p.id, network: 'meta', secrets: Object.values(vault.open(p.ads_creds)) }, fn);
  try { const r = await adsRun('Probar cuenta publicitaria', async () => { const x = await testAds(vault.open(p.ads_creds)); return { ...x, summary: `${x.name} (${x.currency})` }; }); run("UPDATE projects SET ads_name = ?, ads_currency = ?, ads_error = '' WHERE id = ?", r.name, r.currency, p.id); sendProject(res, p.id); }
  catch (e) { adsFail(res, p.id, e); }
});
app.post('/api/projects/:id/ads/audience', async (req, res) => {
  const p = projectRow(req.params.id); if (!p) return res.status(404).json({ error: 'No existe' });
  const rows = all('SELECT em, ph FROM padron WHERE project_id = ?', p.id);
  if (!rows.length) return res.status(400).json({ error: 'Primero subí el padrón con teléfonos o mails en Ajustes.' });
  try {
    const r = await traced({ kind: 'meta_ads', title: 'Subir padrón como público', project_id: p.id, network: 'meta', secrets: Object.values(vault.open(p.ads_creds)) },
      async () => { const x = await uploadAudience(vault.open(p.ads_creds), `ACM · ${p.name} · padrón`, rows, p.ads_audience_id); return { ...x, summary: `${x.received} contactos` }; });
    run("UPDATE projects SET ads_audience_id = ?, ads_audience_count = ?, ads_error = '', ads_at = ? WHERE id = ?", r.id, r.received || rows.length, localNow(), p.id);
    sendProject(res, p.id);
  } catch (e) { adsFail(res, p.id, e); }
});
app.post('/api/projects/:id/ads/campaign', async (req, res) => {
  const p = projectRow(req.params.id); if (!p) return res.status(404).json({ error: 'No existe' });
  const pa = get('SELECT * FROM pauta WHERE project_id = ?', p.id) || {};
  if (!p.ads_audience_id) return res.status(400).json({ error: 'Primero subí el padrón como público.' });
  if (!pa.budget) return res.status(400).json({ error: 'Cargá la inversión en la pestaña Pauta.' });
  const usdNet = pa.budget / 1.21; // Meta factura el IVA aparte
  const cur = p.ads_currency || 'USD';
  if (cur !== 'USD' && !p.ads_rate) return res.status(400).json({ error: `La cuenta publicitaria está en ${cur}: cargá la cotización del dólar.` });
  const today = localNow().slice(0, 10);
  const from = pa.start_date && pa.start_date > today ? pa.start_date : today;
  const to = [pa.end_date, p.propaganda_until, p.election_date].filter(Boolean).sort()[0];
  if (!to || to < from) return res.status(400).json({ error: 'Revisá las fechas de la pauta.' });
  const { perWeek } = pautaNumbers({ budget: pa.budget, from, to, padron: p.padron, contacts: p.padron_contacts });
  const ig = all("SELECT creds FROM accounts WHERE project_id = ? AND network = 'instagram' AND status = 'conectada'", p.id).map((a) => vault.open(a.creds))[0] || {};
  const media = all(`SELECT DISTINCT po.external_id AS id, r.title FROM posts po JOIN reels r ON r.id = po.reel_id JOIN accounts a ON a.id = po.account_id
    WHERE po.project_id = ? AND a.network = 'instagram' AND po.status = 'publicado' AND po.external_id != '' GROUP BY po.reel_id`, p.id);
  try {
    const c = { ...vault.open(p.ads_creds), pageId: ig.pageId, instagramId: ig.instagramBusinessId };
    const startNow = from === today ? new Date(Date.now() + 15 * 6e4).toISOString() : `${from}T00:00:00-03:00`;
    const r = await traced({ kind: 'meta_ads', title: 'Crear campaña en pausa', project_id: p.id, network: 'meta', secrets: Object.values(c) }, async () => { const x = await createCampaign(c, { name: `ACM · ${p.name}`, budget: cur === 'USD' ? usdNet : usdNet * p.ads_rate, start: startNow, end: `${to}T23:59:00-03:00`, perWeek, audienceId: p.ads_audience_id, political: !!p.ads_political, media: ig.pageId ? media : [] }); return { ...x, summary: `Campaña ${x.campaignId} con ${x.ads.length} anuncios` }; });
    run("UPDATE projects SET ads_campaign_id = ?, ads_ads = ?, ads_error = '', ads_at = ? WHERE id = ?", r.campaignId, r.ads.length, localNow(), p.id);
    sendProject(res, p.id);
  } catch (e) { adsFail(res, p.id, e); }
});

// laboratorio
app.get('/api/lab/runs', (req, res) => {
  const kind = String(req.query.kind || '');
  res.json(all(`SELECT r.*, pr.name AS project, pr.color, (SELECT count(*) FROM run_steps s WHERE s.run_id = r.id) AS steps
    FROM runs r LEFT JOIN projects pr ON pr.id = r.project_id ${kind ? 'WHERE r.kind = ?' : ''} ORDER BY r.id DESC LIMIT 200`, ...(kind ? [kind] : [])));
});
app.get('/api/lab/runs/:id', (req, res) => {
  const r = get('SELECT r.*, pr.name AS project FROM runs r LEFT JOIN projects pr ON pr.id = r.project_id WHERE r.id = ?', req.params.id);
  if (!r) return res.status(404).json({ error: 'No existe' });
  res.json({ run: r, steps: all('SELECT * FROM run_steps WHERE run_id = ? ORDER BY id', r.id) });
});
let bancoBusy = false;
app.post('/api/lab/banco', async (req, res) => {
  if (bancoBusy) return res.status(409).json({ error: 'El banco ya está corriendo' });
  bancoBusy = true;
  try { const r = await runBanco(); res.json({ ...r, run: get("SELECT * FROM runs WHERE kind = 'banco' ORDER BY id DESC LIMIT 1") }); }
  finally { bancoBusy = false; }
});
app.get('/api/lab/reels', (req, res) => {
  const R = all('SELECT r.*, pr.name AS project, pr.color FROM reels r JOIN projects pr ON pr.id = r.project_id ORDER BY r.created_at DESC');
  for (const r of R) {
    if (r.duration == null) {
      const m = probe(path.join(UPLOADS, path.basename(r.file)));
      if (m) { run('UPDATE reels SET duration = ?, width = ?, height = ? WHERE id = ?', m.duration, m.width, m.height, r.id); Object.assign(r, m, { size: r.size }); }
    }
    r.review = review(r.duration == null ? null : { duration: r.duration, width: r.width, height: r.height, size: r.size });
  }
  res.json(R);
});

// investigación del proyecto (fichas con búsqueda por significado)
const need = (req, res) => { const p = projectRow(req.params.id); if (!p) res.status(404).json({ error: 'No existe' }); return p; };
app.get('/api/projects/:id/knowledge', async (req, res) => {
  if (!need(req, res)) return;
  const r = await search(Number(req.params.id), req.query.q, { kind: String(req.query.kind || ''), handle: String(req.query.handle || ''), limit: Math.min(200, Number(req.query.limit) || 40) });
  res.json({ ...r, ...stats(Number(req.params.id)), kindNames: KINDS });
});
app.post('/api/projects/:id/knowledge/import', async (req, res) => {
  if (!need(req, res)) return;
  const b = req.body || {};
  const items = Array.isArray(b) ? b : Array.isArray(b.items) ? b.items : [];
  const ig = Array.isArray(b.instagram) ? b.instagram : b.username && Array.isArray(b.posts) ? [b] : [];
  if (b.replace) run("DELETE FROM knowledge WHERE project_id = ? AND kind != 'publicacion'", req.params.id);
  const added = addItems(Number(req.params.id), items);
  let posts = 0; for (const d of ig) posts += addInstagram(Number(req.params.id), d);
  if (!added && !posts) return res.status(400).json({ error: 'No vino ninguna ficha: el JSON tiene que traer items (tipo, titulo, texto) o instagram (cuentas con posts).' });
  fillVectors(); // en segundo plano
  res.json({ ok: true, added, posts });
});
app.post('/api/projects/:id/knowledge', (req, res) => {
  if (!need(req, res)) return;
  const n = addItems(Number(req.params.id), [req.body || {}]);
  if (!n) return res.status(400).json({ error: 'Falta el título o el texto' });
  fillVectors();
  res.json({ ok: true });
});
app.delete('/api/knowledge/:id', (req, res) => { run('DELETE FROM knowledge WHERE id = ?', req.params.id); res.json({ ok: true }); });

// pauta
app.put('/api/projects/:id/pauta', (req, res) => {
  const d = pick(req.body || {}, ['budget', 'start_date', 'end_date']);
  if ('budget' in d) d.budget = Math.max(0, Number(d.budget) || 0);
  if (!get('SELECT 1 FROM pauta WHERE project_id = ?', req.params.id)) run('INSERT INTO pauta (project_id) VALUES (?)', req.params.id);
  const keys = Object.keys(d);
  if (keys.length) run(`UPDATE pauta SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE project_id = ?`, ...keys.map((k) => d[k]), req.params.id);
  res.json(get('SELECT * FROM pauta WHERE project_id = ?', req.params.id));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No existe' }));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pasa de 1 GB' : 'Error del servidor' }); });

app.use(express.static(path.resolve('public'), { index: 'index.html', setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
app.get('/{*splat}', (req, res) => res.sendFile(path.resolve('public/index.html')));

// ---------- programador: publica lo que ya llegó a su hora, de a una ----------
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (;;) {
      const now = localNow();
      const p = get(`SELECT p.*, a.network, a.status AS acc_status, a.creds, a.id AS acc_id, r.file, r.title, r.caption, pr.propaganda_until
        FROM posts p JOIN accounts a ON a.id = p.account_id JOIN reels r ON r.id = p.reel_id JOIN projects pr ON pr.id = p.project_id
        WHERE p.status = 'programado' AND p.scheduled_at <= ? ORDER BY p.scheduled_at LIMIT 1`, now);
      if (!p) break;
      // se marca antes de subir: si dos vueltas se cruzan, solo una la toma
      if (!run("UPDATE posts SET status = 'publicando', attempts = attempts + 1 WHERE id = ? AND status = 'programado'", p.id).changes) continue;
      const fail = (msg) => run("UPDATE posts SET status = 'fallido', error = ? WHERE id = ?", msg, p.id);
      const blocked = postBlocked(p);
      if (blocked) { fail(blocked); continue; }
      const creds = vault.open(p.creds);
      const save = (fresh) => run('UPDATE accounts SET creds = ? WHERE id = ?', vault.seal({ ...vault.open(get('SELECT creds FROM accounts WHERE id = ?', p.acc_id).creds), ...fresh }), p.acc_id);
      try {
        const r = await traced({ kind: 'publicacion', title: `${p.title} en ${({ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' })[p.network]}`, project_id: p.project_id, account_id: p.acc_id, post_id: p.id, network: p.network, secrets: Object.values(creds) },
          async () => { const x = await publish(p.network, creds, path.join(UPLOADS, path.basename(p.file)), (p.caption || p.title || '').trim(), p.title, save, (m) => console.log(`[publicar ${p.id}] ${m}`)); return { ...x, summary: x.url || x.note || 'Publicado' }; });
        run("UPDATE posts SET status = 'publicado', external_id = ?, external_url = ?, note = ?, error = '', published_at = ? WHERE id = ?", String(r.id || ''), r.url || '', r.note || '', localNow(), p.id);
        console.log(`[publicar ${p.id}] publicado en ${p.network}`);
      } catch (e) {
        fail(e.message);
        console.log(`[publicar ${p.id}] falló: ${e.message}`);
      }
    }
  } catch (e) { console.error('programador:', e); }
  finally { busy = false; }
}
if (process.env.ACM_SCHEDULER !== 'off') { setInterval(tick, 30000); setTimeout(tick, 3000); }

setTimeout(fillVectors, 5000);
app.listen(PORT, () => console.log(`ACM en http://localhost:${PORT} (datos en ${DATA})`));
