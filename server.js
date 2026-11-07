// ACM — Agentic Campaign Manager. Servidor: API JSON + archivos + login de un solo administrador.
import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const DATA = path.resolve(process.env.ACM_DATA || './data');
const UPLOADS = path.join(DATA, 'uploads');
const PROD = process.env.NODE_ENV === 'production';
const PASSWORD = process.env.ACM_PASSWORD || (PROD ? '' : 'admin');
if (!PASSWORD) { console.error('Falta ACM_PASSWORD'); process.exit(1); }
const SECRET = process.env.ACM_SECRET || crypto.createHash('sha256').update('acm:' + PASSWORD).digest('hex');

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
app.post('/api/login', (req, res) => {
  const now = Date.now();
  if (now - total.t > 15 * 60e3) { total.n = 0; total.t = now; attempts.clear(); }
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0 };
  if (a.n >= 10 || total.n >= 50) return res.status(429).json({ error: 'Demasiados intentos. Probá en 15 minutos.' });
  const given = Buffer.from(String(req.body?.password || ''));
  const want = Buffer.from(PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) { a.n++; total.n++; attempts.set(ip, a); return res.status(401).json({ error: 'Contraseña incorrecta' }); }
  attempts.delete(ip);
  res.set('Set-Cookie', `acm=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});
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
const P_FIELDS = ['name', 'role', 'org', 'election_date', 'padron', 'color', 'notes'];
const A_FIELDS = ['network', 'handle', 'kind', 'status', 'followers', 'posts_per_day', 'notes'];
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

// proyectos
app.get('/api/projects', (req, res) => res.json(all('SELECT * FROM projects ORDER BY created_at DESC').map(projectSummary)));
app.post('/api/projects', upload.single('photo'), (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Falta el nombre' });
  const r = run('INSERT INTO projects (name, role, org, election_date, padron, color, notes, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    b.name.trim(), b.role || '', b.org || '', b.election_date || '', Number(b.padron) || 0, b.color || '#3842f3', b.notes || '', req.file?.filename || '');
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

// cuentas
app.get('/api/projects/:id/accounts', (req, res) => res.json(all('SELECT * FROM accounts WHERE project_id = ? ORDER BY network, created_at', req.params.id)));
app.post('/api/projects/:id/accounts', (req, res) => {
  const b = pick(req.body || {}, A_FIELDS);
  if (!NETWORKS.includes(b.network) || !String(b.handle || '').trim()) return res.status(400).json({ error: 'Falta la red o el usuario' });
  const r = run('INSERT INTO accounts (project_id, network, handle, kind, status, followers, posts_per_day, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    req.params.id, b.network, b.handle.trim().replace(/^@/, ''), b.kind || 'apoyo', b.status || 'pendiente', Number(b.followers) || 0, Number(b.posts_per_day) || 3, b.notes || '');
  res.json(get('SELECT * FROM accounts WHERE id = ?', r.lastInsertRowid));
});
app.put('/api/accounts/:id', (req, res) => {
  const data = pick(req.body || {}, A_FIELDS);
  if (data.handle) data.handle = String(data.handle).trim().replace(/^@/, '');
  update('accounts', req.params.id, data);
  res.json(get('SELECT * FROM accounts WHERE id = ?', req.params.id));
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
  const d = pick(req.body || {}, ['match_pct', 'frequency', 'cpm', 'iva', 'start_date', 'networks']);
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
