// ACM — Agentic Campaign Manager. Servidor: API JSON + archivos + login de un solo administrador.
import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readPadron } from './padron.js';
import { publish, tiktokOptions, tiktokCreator } from './publisher.js';
import { testAds, uploadAudience, createCampaign, campaignInsights } from './ads.js';
import { ask, askError, agentReady } from './agent.js';
import { initTrace, traced } from './trace.js';
import { runBanco } from './banco.js';
import { probe, review } from './mp4probe.js';
import { r2Ready, putUrl, getUrl, head as r2Head, remove as r2Remove, download as r2Download, MAX_UPLOAD } from './storage.js';
import { postBlocked, pautaNumbers, PROJECT_KINDS, defaultAdsNetworks, scheduleBlocked, NETWORK_CAPS } from './rules.js';
import { FIELDS, makeVault, publicFields, mergeFields, testConnection } from './connections.js';
import { makeState, readState, authUrl, exchange, oauthReady, redirectUri } from './oauth.js';
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
for (const [c, def] of [['options', "TEXT DEFAULT ''"], ['external_id', "TEXT DEFAULT ''"], ['external_url', "TEXT DEFAULT ''"], ['error', "TEXT DEFAULT ''"], ['note', "TEXT DEFAULT ''"], ['published_at', "TEXT DEFAULT ''"], ['attempts', 'INTEGER DEFAULT 0']])
  if (!cols('posts').includes(c)) db.exec(`ALTER TABLE posts ADD COLUMN ${c} ${def}`);
// si el servidor se reinició a mitad de una subida, esas vuelven a la fila
db.exec("UPDATE posts SET status = 'programado' WHERE status = 'publicando'");
for (const [c, def] of [['ads_creds', "TEXT DEFAULT ''"], ['ads_name', "TEXT DEFAULT ''"], ['ads_currency', "TEXT DEFAULT ''"], ['ads_rate', 'REAL DEFAULT 0'], ['ads_political', 'INTEGER DEFAULT 1'],
  ['ads_audience_id', "TEXT DEFAULT ''"], ['ads_audience_count', 'INTEGER DEFAULT 0'], ['ads_campaign_id', "TEXT DEFAULT ''"], ['ads_ads', 'INTEGER DEFAULT 0'], ['ads_error', "TEXT DEFAULT ''"], ['ads_at', "TEXT DEFAULT ''"]])
  if (!cols('projects').includes(c)) db.exec(`ALTER TABLE projects ADD COLUMN ${c} ${def}`);
// proyecto de demostración: se ve completo pero no publica ni pauta nada
if (!cols('projects').includes('demo')) db.exec('ALTER TABLE projects ADD COLUMN demo INTEGER DEFAULT 0');
for (const [c, def] of [['duration', 'REAL'], ['width', 'INTEGER'], ['height', 'INTEGER'], ['kind', "TEXT DEFAULT 'listo'"], ['hashtags', "TEXT DEFAULT ''"], ['source_id', 'INTEGER'], ['storage', "TEXT DEFAULT 'local'"], ['archived_at', "TEXT DEFAULT ''"]])
  if (!cols('reels').includes(c)) db.exec(`ALTER TABLE reels ADD COLUMN ${c} ${def}`);
// circuito: tipo de proyecto, redes con pauta y modelo de recortes (3 hermanas por recorte)
for (const [c, def] of [['kind', "TEXT DEFAULT 'club'"], ['ads_networks', `TEXT DEFAULT '${JSON.stringify(defaultAdsNetworks('club'))}'`], ['review_mode', "TEXT DEFAULT 'manual'"]])
  if (!cols('projects').includes(c)) db.exec(`ALTER TABLE projects ADD COLUMN ${c} ${def}`);
for (const [c, def] of [['clip_id', 'TEXT'], ['moment', 'TEXT'], ['recipe', 'TEXT'], ['review', "TEXT DEFAULT 'pendiente'"], ['expires_at', "TEXT DEFAULT ''"], ['cover', "TEXT DEFAULT ''"]])
  if (!cols('reels').includes(c)) db.exec(`ALTER TABLE reels ADD COLUMN ${c} ${def}`);
initTrace(db);
initKnowledge(db);
// campañas: el presupuesto total del proyecto (pauta.budget) se reparte en campañas con sus cuentas y su contenido
db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
  budget REAL DEFAULT 0, start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', accounts TEXT DEFAULT '[]', reels TEXT DEFAULT '[]',
  notes TEXT DEFAULT '', meta_campaign_id TEXT DEFAULT '', meta_ads INTEGER DEFAULT 0, spent REAL DEFAULT 0, impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0, spent_at TEXT DEFAULT '', error TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
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
// la ruta de importar no pasa por acá: su cuerpo se lee recién después de comprobar la sesión (ver la ruta)
app.use((req, res, next) => (/\/knowledge\/import$/.test(req.path) ? next() : jsonSmall(req, res, next)));
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

// vuelta de la pantalla de autorizar de TikTok o Google
app.get('/oauth/:network/callback', async (req, res) => {
  const back = (pid, q) => res.redirect(`/?${new URLSearchParams(q)}${pid ? `#/p/${pid}/cuentas` : ''}`);
  if (!authed(req)) return back(null, { conexion: 'error', motivo: 'Se cerró la sesión de ACM: entrá y volvé a tocar Conectar.' });
  const st = readState(SECRET, req.query.state);
  const a = st && get('SELECT * FROM accounts WHERE id = ?', st.accountId);
  if (!a || a.network !== req.params.network) return back(a?.project_id, { conexion: 'error', motivo: 'El pedido de conexión venció o no es de esta cuenta. Probá de nuevo.' });
  // la persona dijo que no, o la red devolvió un error
  if (req.query.error || !req.query.code) return back(a.project_id, { conexion: 'error', motivo: `No se autorizó: ${String(req.query.error_description || req.query.error || 'sin código').slice(0, 200)}` });
  let got;
  try { got = await traced({ kind: 'conexion', title: `Conectar ${a.network === 'tiktok' ? 'TikTok' : 'YouTube'} con un clic`, project_id: a.project_id, account_id: a.id, network: a.network }, async () => { const x = await exchange(a.network, String(req.query.code)); return { ...x, summary: 'Tokens recibidos' }; }); }
  catch (e) { run("UPDATE accounts SET last_error = ?, status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'error' END WHERE id = ?", e.message, a.id); return back(a.project_id, { conexion: 'error', motivo: e.message }); }
  const err = await testAccount(a, { ...vault.open(a.creds), ...got.creds });
  if (err) return back(a.project_id, { conexion: 'error', motivo: err });
  const missing = got.missing.length ? ` Faltó autorizar: ${got.missing.join(', ')}.` : '';
  back(a.project_id, { conexion: 'ok', cuenta: get('SELECT connected_as FROM accounts WHERE id = ?', a.id).connected_as + missing });
});
// los videos en R2 se ven con un link firmado de una hora; los del disco, directo
app.get('/media/:file', requireAuth, async (req, res, next) => {
  const r = get("SELECT file FROM reels WHERE file = ? AND storage = 'r2'", req.params.file);
  if (!r) return next();
  try { res.redirect(302, await getUrl(r.file)); } catch { res.status(502).json({ error: 'No pudimos abrir el video en el almacenamiento' }); }
});
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
// borra el video de un reel donde esté (disco o R2)
const dropFile = async (r) => { if (!r?.file) return; if (r.storage === 'r2') await r2Remove(r.file).catch((e) => console.error('R2 borrar:', e.message)); else rmFile(r.file); };

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}
const P_FIELDS = ['name', 'role', 'org', 'election_date', 'propaganda_until', 'padron', 'color', 'notes', 'demo', 'kind', 'ads_networks', 'review_mode'];
// valida tipo, redes con pauta y modo de revisión; devuelve el motivo del error o '' (y normaliza ads_networks a JSON)
function circuitFields(d, kindBefore) {
  if ('kind' in d && !PROJECT_KINDS.includes(d.kind)) return 'Tipo de proyecto inválido: club, politica o comercial';
  if ('review_mode' in d && !['manual', 'auto'].includes(d.review_mode)) return 'Modo de revisión inválido: manual o auto';
  if ('ads_networks' in d) {
    let v = d.ads_networks; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return 'Redes con pauta inválidas'; } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Redes con pauta inválidas';
    d.ads_networks = JSON.stringify(Object.fromEntries(['meta', 'youtube', 'tiktok'].map((k) => [k, !!v[k]])));
  } else if (d.kind && d.kind !== kindBefore) d.ads_networks = JSON.stringify(defaultAdsNetworks(d.kind)); // al cambiar el tipo, las redes vuelven a su valor por defecto
  return '';
}
const NET_NAME = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
const DEMO_MSG = 'Es un proyecto de demostración: no publica ni pauta nada. Se apaga en Ajustes.';
const isDemo = (projectId) => !!get('SELECT demo FROM projects WHERE id = ?', projectId)?.demo;
// corta la ruta si el proyecto (por :id o por la fila que se pasa) es de demostración
const demoGuard = (req, res, next) => (isDemo(req.params.id) ? res.status(400).json({ error: DEMO_MSG }) : next());
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
    ads_networks: (() => { try { return JSON.parse(p.ads_networks); } catch { return defaultAdsNetworks(p.kind); } })(),
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
  const cf = pick(b, ['kind', 'ads_networks', 'review_mode']);
  const bad = circuitFields(cf, undefined); if (bad) return res.status(400).json({ error: bad });
  const kind = cf.kind || 'club';
  const r = run('INSERT INTO projects (name, role, org, election_date, propaganda_until, padron, color, notes, photo, kind, ads_networks, review_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    b.name.trim(), b.role || '', b.org || '', b.election_date || '', b.propaganda_until || '', Number(b.padron) || 0, b.color || '#ff5a1f', b.notes || '', req.file?.filename || '',
    kind, cf.ads_networks || JSON.stringify(defaultAdsNetworks(kind)), cf.review_mode || 'manual');
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
  if ('demo' in data) data.demo = String(data.demo) === '1' ? 1 : 0;
  const bad = circuitFields(data, p.kind); if (bad) return res.status(400).json({ error: bad });
  if (req.file) { rmFile(p.photo); data.photo = req.file.filename; }
  update('projects', p.id, data);
  res.json(projectSummary(get('SELECT * FROM projects WHERE id = ?', p.id)));
});
app.delete('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  all('SELECT file, storage FROM reels WHERE project_id = ?', p.id).forEach((r) => dropFile(r));
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
// prueba la conexión con la red y deja la cuenta conectada (o con el error); la usan «Probar conexión» y la vuelta del clic
async function testAccount(a, creds) {
  const now = new Date().toISOString();
  try {
    const r = await traced({ kind: 'conexion', title: `Probar conexión de ${({ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' })[a.network]}`, project_id: a.project_id, account_id: a.id, network: a.network, secrets: Object.values(creds) },
      async () => { const x = await testConnection(a.network, creds); return { ...x, summary: `Conectada como ${x.connectedAs}` }; });
    if (r.extra) creds = { ...creds, ...r.extra };
    run(`UPDATE accounts SET creds = ?, connected_as = ?, handle = ?, followers = ?, last_error = '', last_checked_at = ?,
         status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'conectada' END WHERE id = ?`,
      vault.seal(creds), r.connectedAs || '', String(r.connectedAs || '').replace(/^@/, ''), r.followers || a.followers, now, a.id);
    return null;
  } catch (e) {
    run(`UPDATE accounts SET creds = ?, last_error = ?, last_checked_at = ?, status = CASE WHEN status = 'pausada' THEN 'pausada' ELSE 'error' END WHERE id = ?`,
      vault.seal(creds), e.message, now, a.id);
    return e.message;
  }
}
app.post('/api/accounts/:id/test', async (req, res) => {
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  await testAccount(a, mergeFields(a.network, vault.open(a.creds), req.body || {}));
  res.json(accountOut(get('SELECT * FROM accounts WHERE id = ?', a.id)));
});

// conectar con un clic (TikTok y YouTube): qué redes tienen app cargada, y el link a la pantalla de autorizar
app.get('/api/oauth', (req, res) => res.json({ tiktok: oauthReady('tiktok'), youtube: oauthReady('youtube'), redirect: { tiktok: redirectUri('tiktok'), youtube: redirectUri('youtube') } }));
app.post('/api/accounts/:id/oauth', (req, res) => {
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  if (!oauthReady(a.network)) return res.status(400).json({ error: `Falta cargar la app de ${a.network === 'tiktok' ? 'TikTok' : 'Google'} en el servidor: por ahora conectala a mano.` });
  res.json({ url: authUrl(a.network, makeState(SECRET, a.id)) });
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
    const r = run('INSERT INTO reels (project_id, title, caption, file, original_name, size, duration, width, height, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      req.params.id, title, req.body?.caption || '', f.filename, f.originalname, f.size, m.duration ?? null, m.width ?? null, m.height ?? null, req.body?.kind === 'crudo' ? 'crudo' : 'listo');
    return get('SELECT *, 0 AS posts FROM reels WHERE id = ?', r.lastInsertRowid);
  });
  res.json(out);
});
// «#uno dos,#tres» → «#uno #dos #tres» (sin repetidos)
const tags = (v) => [...new Set(String(v || '').split(/[\s,]+/).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean).map((t) => '#' + t))].join(' ');
// el texto que sale en la red: descripción + hashtags (los que no estén ya escritos en la descripción)
const postText = (r) => { const cap = (r.caption || '').trim(); const extra = tags(r.hashtags).split(' ').filter((t) => t && !cap.toLowerCase().includes(t.toLowerCase())).join(' '); return [cap || r.title || '', extra].filter(Boolean).join('\n\n').trim(); };
// subida directa a R2: 1) el navegador pide links firmados, 2) sube cada video, 3) avisa y se crean los reels
app.get('/api/storage', (req, res) => res.json({ r2: r2Ready(), max: r2Ready() ? MAX_UPLOAD : 1024 ** 3, retentionDays: RETENTION_DAYS }));
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
app.post('/api/projects/:id/reels/uploads', async (req, res) => {
  if (!get('SELECT id FROM projects WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'No existe' });
  if (!r2Ready()) return res.status(400).json({ error: 'El almacenamiento de videos (R2) no está configurado' });
  const files = Array.isArray(req.body?.files) ? req.body.files.slice(0, 50) : [];
  if (!files.length) return res.status(400).json({ error: 'No llegó ningún video' });
  const out = [];
  for (const f of files) {
    const name = String(f?.name || '');
    if (!VIDEO_EXT.test(name)) return res.status(400).json({ error: `«${name}» no es un video MP4, MOV o WEBM` });
    if (!(Number(f.size) > 0) || Number(f.size) > MAX_UPLOAD) return res.status(400).json({ error: `«${name}» pesa más de 5 GB` });
    const key = `p${req.params.id}-${crypto.randomUUID()}${path.extname(name).toLowerCase()}`;
    out.push({ name, key, url: await putUrl(key, String(f.type || 'video/mp4')) });
  }
  res.json(out);
});
app.post('/api/projects/:id/reels/complete', async (req, res) => {
  const pid = Number(req.params.id);
  if (!get('SELECT id FROM projects WHERE id = ?', pid)) return res.status(404).json({ error: 'No existe' });
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  const kind = req.body?.kind === 'crudo' ? 'crudo' : 'listo';
  const out = [];
  for (const it of items) {
    const key = String(it?.key || '');
    if (!key.startsWith(`p${pid}-`) || get('SELECT 1 FROM reels WHERE file = ?', key)) return res.status(400).json({ error: 'Subida inválida' });
    const h = await r2Head(key);
    if (!h) return res.status(400).json({ error: `«${it.name}» no terminó de subir` });
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const title = path.parse(String(it.name || 'reel')).name.replace(/[_-]+/g, ' ');
    const r = run("INSERT INTO reels (project_id, title, file, original_name, size, duration, width, height, kind, storage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'r2')",
      pid, title, key, String(it.name || ''), h.size, num(it.duration) && Math.round(num(it.duration) * 10) / 10, num(it.width), num(it.height), kind);
    out.push(get('SELECT *, 0 AS posts FROM reels WHERE id = ?', r.lastInsertRowid));
  }
  res.json(out);
});

// limpieza: el video de una edición se borra N días después de su última publicación, el de un crudo N días después
// de su última edición (o 2N si nunca tuvo). La fila queda (título, texto, publicaciones); solo se va el archivo.
const RETENTION_DAYS = Math.max(0, Number(process.env.ACM_RETENTION_DAYS ?? 7));
const daysAgo = (d) => localNow(-d * 1440);
async function cleanup(days = RETENTION_DAYS) {
  const lim = daysAgo(days); // publicaciones: hora argentina, como el programador
  const ago = (d) => `-${d} days`; // reels: created_at está en UTC (datetime('now'))
  const ed = all(`SELECT r.* FROM reels r JOIN projects pr ON pr.id = r.project_id
    WHERE pr.demo = 0 AND r.archived_at = '' AND r.kind != 'crudo'
      AND EXISTS (SELECT 1 FROM posts WHERE reel_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM posts WHERE reel_id = r.id AND status IN ('programado', 'publicando'))
      AND (SELECT max(CASE WHEN published_at != '' THEN published_at ELSE scheduled_at END) FROM posts WHERE reel_id = r.id) <= ?`, lim);
  const cr = all(`SELECT r.* FROM reels r JOIN projects pr ON pr.id = r.project_id
    WHERE pr.demo = 0 AND r.archived_at = '' AND r.kind = 'crudo' AND r.created_at <= datetime('now', ?)
      AND ((SELECT max(created_at) FROM reels e WHERE e.source_id = r.id) <= datetime('now', ?)
        OR (NOT EXISTS (SELECT 1 FROM reels e WHERE e.source_id = r.id) AND r.created_at <= datetime('now', ?)))`, ago(days), ago(days), ago(days * 2));
  for (const r of [...ed, ...cr]) { await dropFile(r); run('UPDATE reels SET archived_at = ? WHERE id = ?', localNow(), r.id); }
  if (ed.length || cr.length) console.log(`[limpieza] ${ed.length} ediciones y ${cr.length} crudos sin archivo (más de ${days} días)`);
  return { ediciones: ed.length, crudos: cr.length };
}
app.post('/api/maintenance/cleanup', async (req, res) => {
  const d = req.body?.days; res.json(await cleanup(d === undefined ? RETENTION_DAYS : Math.max(0, Number(d) || 0)));
});
if (process.env.ACM_CLEANUP !== 'off') setInterval(() => cleanup().catch((e) => console.error('limpieza:', e)), 6 * 3600e3);

app.put('/api/reels/:id', (req, res) => {
  const r = get('SELECT * FROM reels WHERE id = ?', req.params.id); if (!r) return res.status(404).json({ error: 'No existe' });
  const d = pick(req.body || {}, ['title', 'caption', 'hashtags', 'status', 'kind', 'source_id', 'clip_id', 'moment', 'recipe', 'review', 'expires_at', 'cover']);
  if ('review' in d && !['pendiente', 'aprobado', 'rechazado'].includes(d.review)) return res.status(400).json({ error: 'Revisión inválida: pendiente, aprobado o rechazado' });
  for (const k of ['moment', 'recipe']) if (k in d && d[k] !== null && typeof d[k] !== 'string') d[k] = JSON.stringify(d[k]);
  if ('title' in d && !String(d.title).trim()) return res.status(400).json({ error: 'El reel necesita un título' });
  if ('hashtags' in d) d.hashtags = tags(d.hashtags);
  if ('kind' in d) {
    d.kind = d.kind === 'crudo' ? 'crudo' : 'listo';
    if (d.kind === 'crudo' && get('SELECT 1 FROM posts WHERE reel_id = ?', r.id)) return res.status(400).json({ error: 'Ya tiene publicaciones: no puede pasar a crudo. Quitalas primero.' });
    if (d.kind === 'crudo') d.source_id = null;
  }
  if ('source_id' in d && d.source_id) {
    d.source_id = Number(d.source_id);
    const src = get('SELECT kind FROM reels WHERE id = ? AND project_id = ?', d.source_id, r.project_id);
    if (!src || src.kind !== 'crudo' || d.source_id === r.id) return res.status(400).json({ error: 'Elegí un crudo de este proyecto' });
  } else if ('source_id' in d) d.source_id = null;
  update('reels', r.id, d);
  res.json(get('SELECT * FROM reels WHERE id = ?', r.id));
});
app.delete('/api/reels/:id', (req, res) => {
  const r = get('SELECT * FROM reels WHERE id = ?', req.params.id);
  if (r) { dropFile(r); run('DELETE FROM reels WHERE id = ?', r.id); }
  res.json({ ok: true });
});

// publicaciones
// el programador compara fechas como texto en hora argentina: todas van como "AAAA-MM-DD HH:MM" (sin T ni segundos)
// reglas duras de publicación (rules.scheduleBlocked) con lo que hay en la base; solo rigen para reels que vienen de un recorte (tienen clip_id)
function scheduleCheck({ id, reel_id, account_id, scheduled_at }) {
  const reel = get('SELECT clip_id, review FROM reels WHERE id = ?', reel_id);
  if (!reel?.clip_id) return null;
  const network = get('SELECT network FROM accounts WHERE id = ?', account_id).network;
  const live = "p.status IN ('programado', 'publicando', 'publicado')";
  const siblings = all(`SELECT a.network, p.scheduled_at, p.account_id FROM posts p JOIN reels r ON r.id = p.reel_id JOIN accounts a ON a.id = p.account_id
    WHERE r.clip_id = ? AND p.id IS NOT ? AND ${live}`, reel.clip_id, id ?? null);
  const dayCount = get(`SELECT count(*) n FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.account_id = ? AND substr(p.scheduled_at, 1, 10) = ? AND p.id IS NOT ? AND ${live}`,
    account_id, String(scheduled_at).slice(0, 10), id ?? null).n;
  return scheduleBlocked({ reel_id, account_id, network, scheduled_at, clip_id: reel.clip_id, review: reel.review },
    { siblings, sameReelSameNetwork: false, dayCount, networkCap: NETWORK_CAPS[network], tz: TZ });
}
const schedAt = (v) => { const m = String(v || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[1]} ${m[2]}` : ''; };
app.get('/api/projects/:id/posts', (req, res) => res.json(all(`
  SELECT p.*, r.title AS reel_title, r.file AS reel_file, a.network, a.handle
  FROM posts p JOIN reels r ON r.id = p.reel_id JOIN accounts a ON a.id = p.account_id
  WHERE p.project_id = ? ORDER BY p.scheduled_at`, req.params.id)));
app.post('/api/projects/:id/posts', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const ins = db.prepare('INSERT INTO posts (project_id, reel_id, account_id, scheduled_at, options) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const it of items) {
      if (!it?.reel_id || !it?.account_id || !it?.scheduled_at) throw new Error('Faltan datos de la publicación');
      const at = schedAt(it.scheduled_at);
      if (!at) throw new Error('Fecha inválida: tiene que ser AAAA-MM-DD HH:MM');
      if (!get('SELECT 1 FROM reels WHERE id = ? AND project_id = ?', it.reel_id, req.params.id) || !get('SELECT 1 FROM accounts WHERE id = ? AND project_id = ?', it.account_id, req.params.id))
        throw new Error('El reel o la cuenta no son de este proyecto');
      const reel = get('SELECT title, kind, archived_at FROM reels WHERE id = ?', it.reel_id);
      if (reel.archived_at) throw new Error(`El video de «${reel.title}» ya se borró del almacenamiento: subilo de nuevo.`);
      if (reel.kind === 'crudo') throw new Error(`«${reel.title}» es un crudo: subí una edición lista para publicarla.`);
      // el mismo video en dos cuentas de la misma red hace que la red bloquee las cuentas: una sola por red
      const net = get('SELECT network FROM accounts WHERE id = ?', it.account_id).network;
      const ya = get('SELECT a.handle, a.connected_as FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.reel_id = ? AND a.network = ?', it.reel_id, net);
      if (ya) throw new Error(`«${reel.title}» ya está en ${ya.connected_as || '@' + ya.handle} de ${NET_NAME[net]}. El mismo reel en dos cuentas de la misma red hace que la red las bloquee: subí otra edición del crudo.`);
      const why = scheduleCheck({ reel_id: it.reel_id, account_id: it.account_id, scheduled_at: at }); if (why) throw new Error(`«${reel.title}»: ${why}`);
      ins.run(req.params.id, it.reel_id, it.account_id, at, it.options ? JSON.stringify(tiktokOptions(it.options)) : '');
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
  if (req.body?.options) d.options = JSON.stringify(tiktokOptions(req.body.options));
  if ('scheduled_at' in d && !(d.scheduled_at = schedAt(d.scheduled_at))) return res.status(400).json({ error: 'Fecha inválida: tiene que ser AAAA-MM-DD HH:MM' });
  if (d.status && !['programado', 'publicado', 'fallido'].includes(d.status)) return res.status(400).json({ error: 'Estado inválido' });
  if (d.status === 'programado') d.error = '';
  if ('scheduled_at' in d || d.status === 'programado') {
    const why = scheduleCheck({ id: p.id, reel_id: p.reel_id, account_id: p.account_id, scheduled_at: d.scheduled_at || p.scheduled_at });
    if (why) return res.status(400).json({ error: why });
  }
  update('posts', p.id, d);
  res.json({ ok: true });
});
app.delete('/api/posts/:id', (req, res) => { run('DELETE FROM posts WHERE id = ?', req.params.id); res.json({ ok: true }); });

app.post('/api/posts/:id/now', (req, res) => {
  const p = get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  if (p.status === 'publicando') return res.status(409).json({ error: 'Ya se está publicando' });
  if (p.status === 'publicado') return res.status(409).json({ error: 'Ya está publicada' });
  if (isDemo(p.project_id)) return res.status(400).json({ error: DEMO_MSG });
  if (req.body?.options) run('UPDATE posts SET options = ? WHERE id = ?', JSON.stringify(tiktokOptions(req.body.options)), p.id);
  run("UPDATE posts SET status = 'programado', scheduled_at = ?, error = '' WHERE id = ?", localNow(), p.id);
  setImmediate(tick);
  res.json({ ok: true });
});
// TikTok pide mostrar la cuenta y sus opciones antes de publicar (creator_info)
app.get('/api/accounts/:id/tiktok', async (req, res) => {
  const a = get('SELECT * FROM accounts WHERE id = ?', req.params.id);
  if (!a || a.network !== 'tiktok') return res.status(404).json({ error: 'No es una cuenta de TikTok' });
  const creds = vault.open(a.creds);
  const save = (fresh) => run('UPDATE accounts SET creds = ? WHERE id = ?', vault.seal({ ...vault.open(get('SELECT creds FROM accounts WHERE id = ?', a.id).creds), ...fresh }), a.id);
  try { res.json(await tiktokCreator(creds, save)); } catch (e) { res.status(400).json({ error: e.message }); }
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
app.post('/api/projects/:id/ads/audience', demoGuard, async (req, res) => {
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
app.post('/api/projects/:id/ads/campaign', demoGuard, async (req, res) => {
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
app.post('/api/projects/:id/knowledge/import', requireAuth, jsonBig, async (req, res) => {
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

// preguntarle a la investigación (agente con las fichas del proyecto)
app.post('/api/projects/:id/knowledge/ask', async (req, res) => {
  const p = need(req, res); if (!p) return;
  const question = String(req.body?.question || '').trim().slice(0, 2000);
  if (!question) return res.status(400).json({ error: 'Escribí la pregunta' });
  if (!agentReady()) return res.status(400).json({ error: 'Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY).' });
  // las fichas más parecidas: primero las de investigación, después publicaciones de las cuentas
  const fichas = (await search(p.id, question, { limit: 30 })).items;
  const pubs = fichas.filter((f) => f.kind === 'publicacion').slice(0, 10);
  const elegidas = [...fichas.filter((f) => f.kind !== 'publicacion').slice(0, 20), ...pubs];
  try {
    const r = await traced({ kind: 'agente', title: `Pregunta a la investigación: ${question.slice(0, 80)}`, project_id: p.id },
      async () => { const x = await ask({ question, history: Array.isArray(req.body?.history) ? req.body.history : [], fichas: elegidas, proyecto: p.name }); return { ...x, summary: `${x.sources.length} fichas citadas` }; });
    res.json(r);
  } catch (e) { res.status(400).json({ error: askError(e) }); }
});
app.get('/api/agent', (req, res) => res.json({ ready: agentReady() }));

// campañas y presupuesto
const J = (v, d = []) => { try { return JSON.parse(v); } catch { return d; } };
const campOut = (c) => ({ ...c, accounts: J(c.accounts), reels: J(c.reels) });
const pautaRow = (pid) => get('SELECT * FROM pauta WHERE project_id = ?', pid) || {};
app.get('/api/projects/:id/campaigns', (req, res) => {
  const p = need(req, res); if (!p) return;
  res.json({ total: pautaRow(p.id).budget || 0, currency: p.ads_currency || '', rate: p.ads_rate || 0, campaigns: all('SELECT * FROM campaigns WHERE project_id = ? ORDER BY created_at', p.id).map(campOut) });
});
function campData(p, b, self = null) {
  const d = {};
  if (b.name !== undefined) { d.name = String(b.name).trim().slice(0, 120); if (!d.name) throw new Error('Ponele un nombre a la campaña'); }
  if (b.budget !== undefined) { d.budget = Math.max(0, Math.round(Number(b.budget) * 100) / 100 || 0); if (!d.budget) throw new Error('Poné cuánto se invierte en la campaña'); }
  for (const k of ['start_date', 'end_date']) if (b[k] !== undefined) { d[k] = String(b[k] || ''); if (d[k] && !/^\d{4}-\d{2}-\d{2}$/.test(d[k])) throw new Error('Fecha inválida'); }
  if ((d.start_date || self?.start_date) && (d.end_date || self?.end_date) && (d.start_date ?? self.start_date) > (d.end_date ?? self.end_date)) throw new Error('La campaña termina antes de empezar');
  if (b.notes !== undefined) d.notes = String(b.notes).slice(0, 2000);
  if (b.accounts !== undefined) {
    const ids = [...new Set((b.accounts || []).map(Number))];
    if (ids.some((i) => !get('SELECT 1 FROM accounts WHERE id = ? AND project_id = ?', i, p.id))) throw new Error('Hay cuentas que no son de este proyecto');
    d.accounts = JSON.stringify(ids);
  }
  if (b.reels !== undefined) {
    const ids = [...new Set((b.reels || []).map(Number))];
    if (ids.some((i) => !get('SELECT 1 FROM reels WHERE id = ? AND project_id = ?', i, p.id))) throw new Error('Hay reels que no son de este proyecto');
    d.reels = JSON.stringify(ids);
  }
  // las campañas no pueden repartir más que el presupuesto total
  const total = pautaRow(p.id).budget || 0;
  if (d.budget !== undefined && total) {
    const otras = get('SELECT coalesce(sum(budget), 0) s FROM campaigns WHERE project_id = ? AND id != ?', p.id, self?.id || 0).s;
    if (otras + d.budget > total + 0.001) throw new Error(`Con esta campaña te pasás del presupuesto total: quedan USD ${Math.max(0, total - otras).toFixed(0)} sin asignar.`);
  }
  return d;
}
app.post('/api/projects/:id/campaigns', (req, res) => {
  const p = need(req, res); if (!p) return;
  let d; try { d = campData(p, { accounts: [], reels: [], ...req.body }); if (!d.name || !d.budget) throw new Error('Faltan el nombre o la inversión'); } catch (e) { return res.status(400).json({ error: e.message }); }
  const keys = Object.keys(d);
  const r = run(`INSERT INTO campaigns (project_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, p.id, ...keys.map((k) => d[k]));
  res.json(campOut(get('SELECT * FROM campaigns WHERE id = ?', r.lastInsertRowid)));
});
app.put('/api/campaigns/:id', (req, res) => {
  const c = get('SELECT * FROM campaigns WHERE id = ?', req.params.id); if (!c) return res.status(404).json({ error: 'No existe' });
  let d; try { d = campData(projectRow(c.project_id), req.body || {}, c); } catch (e) { return res.status(400).json({ error: e.message }); }
  update('campaigns', c.id, d);
  res.json(campOut(get('SELECT * FROM campaigns WHERE id = ?', c.id)));
});
app.delete('/api/campaigns/:id', (req, res) => { run('DELETE FROM campaigns WHERE id = ?', req.params.id); res.json({ ok: true }); });

// crea la campaña en Meta (en pausa) con su presupuesto, el padrón como público y un anuncio por reel publicado en sus cuentas de Instagram
app.post('/api/campaigns/:id/meta', async (req, res) => {
  const c = get('SELECT * FROM campaigns WHERE id = ?', req.params.id); if (!c) return res.status(404).json({ error: 'No existe' });
  const p = projectRow(c.project_id);
  if (p.demo) return res.status(400).json({ error: DEMO_MSG });
  if (!p.ads_audience_id) return res.status(400).json({ error: 'Primero subí el padrón como público en Pauta → Meta Ads.' });
  const cur = p.ads_currency || 'USD';
  if (cur !== 'USD' && !p.ads_rate) return res.status(400).json({ error: `La cuenta publicitaria está en ${cur}: cargá la cotización del dólar en Pauta.` });
  const today = localNow().slice(0, 10);
  const from = c.start_date && c.start_date > today ? c.start_date : today;
  const to = c.end_date || [p.propaganda_until, p.election_date].filter(Boolean).sort()[0];
  if (!to || to < from) return res.status(400).json({ error: 'Revisá las fechas de la campaña.' });
  const accs = J(c.accounts), reels = J(c.reels);
  const igRows = all("SELECT id, creds FROM accounts WHERE project_id = ? AND network = 'instagram' AND status = 'conectada'", p.id).filter((a) => !accs.length || accs.includes(a.id));
  const ig = igRows.map((a) => vault.open(a.creds))[0] || {};
  const media = all(`SELECT po.external_id AS id, r.title, po.reel_id, po.account_id FROM posts po JOIN reels r ON r.id = po.reel_id JOIN accounts a ON a.id = po.account_id
    WHERE po.project_id = ? AND a.network = 'instagram' AND po.status = 'publicado' AND po.external_id != ''`, p.id)
    .filter((m) => (!reels.length || reels.includes(m.reel_id)) && (!accs.length || accs.includes(m.account_id)))
    .filter((m, i, A) => A.findIndex((x) => x.reel_id === m.reel_id) === i); // un anuncio por reel aunque se haya publicado dos veces
  const { perWeek } = pautaNumbers({ budget: c.budget, from, to, padron: p.padron, contacts: p.padron_contacts });
  const usdNet = c.budget / 1.21;
  try {
    const cr = { ...vault.open(p.ads_creds), pageId: ig.pageId, instagramId: ig.instagramBusinessId };
    const start = from === today ? new Date(Date.now() + 15 * 6e4).toISOString() : `${from}T00:00:00-03:00`;
    const r = await traced({ kind: 'meta_ads', title: `Crear campaña «${c.name}» en pausa`, project_id: p.id, network: 'meta', secrets: Object.values(cr) },
      async () => { const x = await createCampaign(cr, { name: `ACM · ${p.name} · ${c.name}`, budget: cur === 'USD' ? usdNet : usdNet * p.ads_rate, start, end: `${to}T23:59:00-03:00`, perWeek, audienceId: p.ads_audience_id, political: !!p.ads_political, media: ig.pageId ? media : [] }); return { ...x, summary: `Campaña ${x.campaignId} con ${x.ads.length} anuncios` }; });
    run("UPDATE campaigns SET meta_campaign_id = ?, meta_ads = ?, error = '' WHERE id = ?", r.campaignId, r.ads.length, c.id);
    res.json(campOut(get('SELECT * FROM campaigns WHERE id = ?', c.id)));
  } catch (e) { run('UPDATE campaigns SET error = ? WHERE id = ?', e.message, c.id); res.status(400).json({ error: e.message }); }
});

// trae de Meta cuánto gastó cada campaña (en USD con IVA, para comparar con el presupuesto)
app.post('/api/projects/:id/campaigns/spend', demoGuard, async (req, res) => {
  const p = need(req, res); if (!p) return;
  const cr = vault.open(p.ads_creds);
  const C = all("SELECT * FROM campaigns WHERE project_id = ? AND meta_campaign_id != ''", p.id);
  const cur = p.ads_currency || 'USD';
  const errores = [];
  for (const c of C) {
    try {
      const x = await traced({ kind: 'meta_ads', title: `Gasto de «${c.name}»`, project_id: p.id, network: 'meta', secrets: Object.values(cr) }, async () => { const i = await campaignInsights(cr, c.meta_campaign_id); return { ...i, summary: `${i.spend} ${cur}` }; });
      const usd = cur === 'USD' ? x.spend : (p.ads_rate ? x.spend / p.ads_rate : 0);
      run("UPDATE campaigns SET spent = ?, impressions = ?, reach = ?, spent_at = ?, error = '' WHERE id = ?", Math.round(usd * 1.21 * 100) / 100, x.impressions, x.reach, localNow(), c.id);
    } catch (e) { errores.push(`${c.name}: ${e.message}`); run('UPDATE campaigns SET error = ? WHERE id = ?', e.message, c.id); }
  }
  res.json({ ok: !errores.length, updated: C.length - errores.length, errors: errores });
});

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

// páginas públicas (las piden TikTok y Google para aprobar las apps): qué es ACM, privacidad y términos
for (const [route, file] of [['/acerca', 'acerca.html'], ['/privacidad', 'privacidad.html'], ['/terminos', 'terminos.html']])
  app.get(route, (req, res) => res.sendFile(path.resolve('public/legal', file)));
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
      const p = get(`SELECT p.*, a.network, a.status AS acc_status, a.creds, a.id AS acc_id, r.file, r.storage, r.archived_at, r.title, r.caption, r.hashtags, pr.propaganda_until
        FROM posts p JOIN accounts a ON a.id = p.account_id JOIN reels r ON r.id = p.reel_id JOIN projects pr ON pr.id = p.project_id
        WHERE p.status = 'programado' AND pr.demo = 0 AND p.scheduled_at <= ? ORDER BY p.scheduled_at LIMIT 1`, now);
      if (!p) break;
      // se marca antes de subir: si dos vueltas se cruzan, solo una la toma
      if (!run("UPDATE posts SET status = 'publicando', attempts = attempts + 1 WHERE id = ? AND status = 'programado'", p.id).changes) continue;
      const fail = (msg) => run("UPDATE posts SET status = 'fallido', error = ? WHERE id = ?", msg, p.id);
      // una publicación programada antes de un rechazo (o que ya no cumple las reglas) no sale
      const hard = scheduleCheck({ id: p.id, reel_id: p.reel_id, account_id: p.account_id, scheduled_at: p.scheduled_at });
      if (hard) { run("UPDATE posts SET status = 'bloqueado', note = ? WHERE id = ?", hard, p.id); console.log(`[publicar ${p.id}] bloqueada: ${hard}`); continue; }
      const blocked = p.archived_at ? 'El video ya se borró del almacenamiento: subilo de nuevo.' : postBlocked(p);
      if (blocked) { fail(blocked); continue; }
      // de R2 se baja a un archivo temporal solo para esta subida
      let file = path.join(UPLOADS, path.basename(p.file)), tmp = '';
      if (p.storage === 'r2') {
        tmp = path.join(UPLOADS, `tmp-${p.id}-${path.basename(p.file)}`);
        try { file = await r2Download(p.file, tmp); } catch (e) { fs.rm(tmp, { force: true }, () => {}); fail('No pudimos bajar el video del almacenamiento: ' + e.message); continue; }
      }
      const creds = vault.open(p.creds);
      const save = (fresh) => run('UPDATE accounts SET creds = ? WHERE id = ?', vault.seal({ ...vault.open(get('SELECT creds FROM accounts WHERE id = ?', p.acc_id).creds), ...fresh }), p.acc_id);
      try {
        const r = await traced({ kind: 'publicacion', title: `${p.title} en ${({ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' })[p.network]}`, project_id: p.project_id, account_id: p.acc_id, post_id: p.id, network: p.network, secrets: Object.values(creds) },
          async () => { let opts = {}; try { opts = p.options ? JSON.parse(p.options) : {}; } catch {}
            const x = await publish(p.network, creds, file, postText(p), p.title, save, (m) => console.log(`[publicar ${p.id}] ${m}`), opts); return { ...x, summary: x.url || x.note || 'Publicado' }; });
        run("UPDATE posts SET status = 'publicado', external_id = ?, external_url = ?, note = ?, error = '', published_at = ? WHERE id = ?", String(r.id || ''), r.url || '', r.note || '', localNow(), p.id);
        console.log(`[publicar ${p.id}] publicado en ${p.network}`);
      } catch (e) {
        fail(e.message);
        console.log(`[publicar ${p.id}] falló: ${e.message}`);
      } finally { if (tmp) fs.rm(tmp, { force: true }, () => {}); }
    }
  } catch (e) { console.error('programador:', e); }
  finally { busy = false; }
}
// ACM_TICK_MS: la copia aislada del banco de pruebas lo baja para no esperar 30 s
if (process.env.ACM_SCHEDULER !== 'off') { setInterval(tick, Number(process.env.ACM_TICK_MS) || 30000); setTimeout(tick, 3000); }

// al arrancar completa vectores pendientes (la copia del banco lo hace enseguida para reproducir el orden de producción: primero este, después las importaciones)
setTimeout(fillVectors, Number(process.env.ACM_FILL_MS) || 5000);
const srv = app.listen(PORT, () => console.log(`ACM en http://localhost:${srv.address().port} (datos en ${DATA})`));
