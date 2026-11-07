// ACM — Agentic Campaign Manager. Servidor: API JSON + archivos + login de un solo administrador.
import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readPadron } from './padron.js';
import { FIELDS, makeVault, publicFields, mergeFields, testConnection } from './connections.js';

const PORT = Number(process.env.PORT || 3000);
const DATA = path.resolve(process.env.ACM_DATA || './data');
const UPLOADS = path.join(DATA, 'uploads');
const PROD = process.env.NODE_ENV === 'production';
const PASSWORD = process.env.ACM_PASSWORD || (PROD ? '' : 'admin');
if (!PASSWORD) { console.error('Falta ACM_PASSWORD'); process.exit(1); }
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
app.use(express.json({ limit: '1mb' }));
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

function projectSummary(p) {
  const c = (sql) => get(sql, p.id).n;
  return {
    ...p,
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
      WHERE p.status = 'programado' AND p.scheduled_at >= strftime('%Y-%m-%d %H:%M', 'now', 'localtime', '-1 hour') ORDER BY p.scheduled_at LIMIT 14`),
    upcoming14: all(`SELECT project_id, scheduled_at FROM posts WHERE scheduled_at >= date('now', 'localtime') AND scheduled_at < date('now', 'localtime', '+14 days')`),
    networks: all(`SELECT network, count(*) AS total, sum(status = 'conectada') AS live, sum(CASE WHEN status = 'conectada' THEN followers ELSE 0 END) AS followers FROM accounts GROUP BY network`),
    byProject: all(`SELECT project_id, network, count(*) AS n FROM accounts GROUP BY project_id, network`),
    next: all(`SELECT project_id, min(scheduled_at) AS at FROM posts WHERE status = 'programado' AND scheduled_at >= strftime('%Y-%m-%d %H:%M', 'now', 'localtime') GROUP BY project_id`),
  });
});

// proyectos
app.get('/api/projects', (req, res) => res.json(all('SELECT * FROM projects ORDER BY created_at DESC').map(projectSummary)));
app.post('/api/projects', upload.single('photo'), (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Falta el nombre' });
  const r = run('INSERT INTO projects (name, role, org, election_date, padron, color, notes, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    b.name.trim(), b.role || '', b.org || '', b.election_date || '', Number(b.padron) || 0, b.color || '#ff5a1f', b.notes || '', req.file?.filename || '');
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
    const r = await testConnection(a.network, creds);
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
    const r = run('INSERT INTO reels (project_id, title, caption, file, original_name, size) VALUES (?, ?, ?, ?, ?, ?)',
      req.params.id, title, req.body?.caption || '', f.filename, f.originalname, f.size);
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
      ins.run(req.params.id, it.reel_id, it.account_id, it.scheduled_at);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true, created: items.length });
});
app.put('/api/posts/:id', (req, res) => { update('posts', req.params.id, pick(req.body || {}, ['scheduled_at', 'status'])); res.json({ ok: true }); });
app.delete('/api/posts/:id', (req, res) => { run('DELETE FROM posts WHERE id = ?', req.params.id); res.json({ ok: true }); });

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

app.listen(PORT, () => console.log(`ACM en http://localhost:${PORT} (datos en ${DATA})`));
