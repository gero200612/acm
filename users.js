// Usuarios y permisos. Cuatro roles:
//   general → ve y maneja todo (hasta 3: Gero y dos más). La contraseña maestra (ACM_PASSWORD) solo entra mientras no haya ninguno.
//   admin   → administrador de UN dirigente: todo su proyecto, nada de los otros, sin Laboratorio ni proyectos nuevos.
//   editor  → de UN dirigente: dice qué reel va y cuál no (aprueba, rechaza, comenta) y también sube crudos. No ve números.
//   sombra  → de UN dirigente: solo sube crudos (y mira el calendario). No ve números.
// El servidor niega por defecto: cada pedido tiene que caer en una regla que lo permita (no alcanza con esconder botones).
import crypto from 'node:crypto';

export const ROLES = ['general', 'admin', 'editor', 'sombra'];
// equipo de contenido de un dirigente: no ve números (padrón, pauta, cuentas, publicaciones)
export const isContent = (u) => u?.role === 'sombra' || u?.role === 'editor';
export const MAX_GENERALES = 3; // Gero y dos más (la contraseña maestra se cierra con el primero)
export const OWNER = Object.freeze({ id: 0, email: '', name: 'Dueño', role: 'general', project_id: null });

export function initUsers(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('general', 'admin', 'editor', 'sombra')),
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, pass_hash TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), last_login_at TEXT DEFAULT '');`);
  // bases de antes del rol editor: el CHECK viejo no lo deja guardar → se rehace la tabla con los mismos datos
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
  if (!sql.includes("'editor'")) {
    db.exec('BEGIN');
    try {
      db.exec(`ALTER TABLE users RENAME TO users_viejo;
        ${sql.replace(/CREATE TABLE "?users_viejo"?|CREATE TABLE "?users"?/, 'CREATE TABLE users').replace("CHECK (role IN ('general', 'admin', 'sombra'))", "CHECK (role IN ('general', 'admin', 'editor', 'sombra'))")};
        INSERT INTO users SELECT * FROM users_viejo; DROP TABLE users_viejo;`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // quién aprobó o rechazó cada recorte
  if (!db.prepare('PRAGMA table_info(clip_reviews)').all().some((c) => c.name === 'reviewer')) db.exec("ALTER TABLE clip_reviews ADD COLUMN reviewer TEXT DEFAULT ''");
}

// ---------- contraseñas ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${crypto.scryptSync(String(pw), salt, 32).toString('base64url')}`;
}
export function checkPassword(pw, stored) {
  const [k, salt, h] = String(stored || '').split('$');
  if (k !== 'scrypt' || !salt || !h) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64url'), 32), b = Buffer.from(h, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- sesión: u<id>.<ver>.<vence>.<firma> (el formato viejo <vence>.<firma> es del dueño) ----------
export function makeSession(secret) {
  const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  return {
    token(user) { const exp = String(Date.now() + 30 * 864e5); const body = `u${user.id}.${user.ver || 1}.${exp}`; return `${body}.${sign(body)}`; },
    // devuelve { id, ver } o null
    read(t) {
      if (!t) return null;
      const parts = String(t).split('.');
      if (parts.length === 2) { const [exp, sig] = parts; return Number(exp) > Date.now() && eq(sig, sign(exp)) ? { id: 0, ver: 1 } : null; }
      if (parts.length !== 4 || !/^u\d+$/.test(parts[0])) return null;
      const [u, ver, exp, sig] = parts;
      if (!(Number(exp) > Date.now()) || !eq(sig, sign(`${u}.${ver}.${exp}`))) return null;
      return { id: Number(u.slice(1)), ver: Number(ver) };
    },
  };
}
// la sesión vale mientras el usuario exista y no le hayan cambiado la contraseña o el rol (ver)
export function userFromSession(db, s) {
  if (!s) return null;
  if (s.id === 0) return OWNER;
  const u = db.prepare('SELECT id, email, name, role, project_id, ver FROM users WHERE id = ?').get(s.id);
  return u && u.ver === s.ver ? u : null;
}

// ---------- permisos ----------
// De qué proyecto es lo que se pide. undefined = la ruta no es de un proyecto; null = no existe.
const OWNERS = [
  [/^\/api\/projects\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT id AS p FROM projects WHERE id = ?').get(id)],
  [/^\/api\/accounts\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM accounts WHERE id = ?').get(id)],
  [/^\/api\/reels\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM reels WHERE id = ?').get(id)],
  [/^\/api\/posts\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM posts WHERE id = ?').get(id)],
  [/^\/api\/campaigns\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM campaigns WHERE id = ?').get(id)],
  [/^\/api\/knowledge\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM knowledge WHERE id = ?').get(id)],
  // un recorte es de un proyecto solo si TODAS sus ediciones son de ese proyecto
  [/^\/api\/clips\/([^/]+)\/review$/, (db, id) => { const ps = db.prepare('SELECT DISTINCT project_id AS p FROM reels WHERE clip_id = ?').all(decodeURIComponent(id)); return ps.length === 1 ? ps[0] : null; }],
  [/^\/api\/autoreplies\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM autoreplies WHERE id = ?').get(id)],
  [/^\/api\/shares\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM share_links WHERE id = ?').get(id)],
  [/^\/api\/refs\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM refs WHERE id = ?').get(id)],
  [/^\/api\/reel-comments\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT r.project_id AS p FROM reel_comments c JOIN reels r ON r.id = c.reel_id WHERE c.id = ?').get(id)],
  [/^\/api\/users\/(\d+)(?:\/|$)/, (db, id) => db.prepare('SELECT project_id AS p FROM users WHERE id = ?').get(id)],
];
export function projectOf(db, p, body) {
  // cambiar de lugar dos publicaciones: las dos tienen que ser del mismo proyecto
  if (p === '/api/posts/swap') {
    const ids = [Number(body?.a), Number(body?.b)];
    const ps = ids.map((id) => db.prepare('SELECT project_id AS p FROM posts WHERE id = ?').get(id)?.p);
    return ps[0] != null && ps[0] === ps[1] ? ps[0] : null;
  }
  for (const [re, f] of OWNERS) { const m = p.match(re); if (m) { try { return f(db, m[1])?.p ?? null; } catch { return null; } } }
  return undefined;
}
// Rutas que no son de un proyecto y que un administrador de dirigente sí puede usar (las que listan vienen filtradas en la ruta).
const ADMIN_GLOBAL = [['GET', /^\/api\/(projects|overview|storage|clock|oauth|agent|search|me|session)$/], ['GET', /^\/api\/users$/], ['POST', /^\/api\/users$/]];
// Lo único que puede hacer una sombra (además, todo dentro de su proyecto): subir crudos y mirar el calendario.
const SOMBRA = [
  ['GET', /^\/api\/(projects|storage|me|session)$/],
  ['GET', /^\/api\/projects\/\d+$/],
  ['GET', /^\/api\/projects\/\d+\/(reels|posts|accounts)$/], // el calendario: solo mirar, sin números
  ['POST', /^\/api\/projects\/\d+\/reels(\/uploads|\/complete)?$/],
];
// El editor: lo de la sombra y además decide qué reel va (Para aprobar, aprobar/rechazar, comentar).
const EDITOR = [
  ...SOMBRA,
  ['GET', /^\/api\/projects\/\d+\/review$/],
  ['POST', /^\/api\/clips\/[^/]+\/review$/],
  ['GET', /^\/api\/reels\/\d+\/comments$/],
  ['POST', /^\/api\/reels\/\d+\/comments$/],
  ['PUT', /^\/api\/reels\/\d+$/], // solo el texto y los hashtags (lo limita la ruta)
  ['POST', /^\/api\/reels\/\d+\/rehacer$/],
];
const CONTENT = { sombra: SOMBRA, editor: EDITOR };
// Rutas de proyecto que el administrador de dirigente NO usa: las de usuarios van por su propia regla.
// también lo técnico que su pantalla no muestra: conectar anuncios, importar investigación y la memoria del agente
const ADMIN_DENY = [['DELETE', /^\/api\/projects\/\d+$/], ['PUT', /^\/api\/projects\/\d+\/ads$/], ['POST', /^\/api\/projects\/\d+\/ads(\/[a-z]+)?$/],
  ['POST', /^\/api\/projects\/\d+\/knowledge\/import$/], ['GET', /^\/api\/projects\/\d+\/memory$/]];
const hit = (list, m, p) => list.some(([mm, re]) => mm === m && re.test(p));

// ¿Puede este usuario hacer este pedido? → null si sí, o { status, error }.
export function permit(db, user, method, p, body) {
  if (!user) return { status: 401, error: 'Sin sesión' };
  if (user.role === 'general') return null;
  const m = method === 'HEAD' ? 'GET' : method;
  if (user.role === 'sombra' && !hit(SOMBRA, m, p)) return { status: 403, error: 'Tu usuario solo sube crudos' };
  if (user.role === 'editor' && !hit(EDITOR, m, p)) return { status: 403, error: 'Tu usuario solo aprueba reels y sube crudos' };
  // Express no distingue mayúsculas ni la barra final: lo prohibido se compara contra la ruta normalizada (si no, «/ADS/» pasaría)
  if (user.role === 'admin' && hit(ADMIN_DENY, m, String(p).toLowerCase().replace(/\/+$/, ''))) return { status: 403, error: 'Eso lo hace un administrador general' };
  const pid = projectOf(db, p, body);
  if (pid === undefined) return (user.role === 'admin' ? hit(ADMIN_GLOBAL, m, p) : hit(CONTENT[user.role] || [], m, p)) ? null : { status: 403, error: 'Eso lo hace un administrador general' };
  if (pid === null || pid !== user.project_id) return { status: 404, error: 'No existe' };
  return null;
}
// Los archivos (/media/<archivo>): solo los del proyecto del usuario.
export function mediaAllowed(db, user, file) {
  if (!user) return false;
  if (user.role === 'general') return true;
  // todas las filas que nombran ese archivo tienen que ser de su proyecto (una portada apuntando a un archivo ajeno no abre nada)
  const ps = [...db.prepare('SELECT project_id AS p FROM reels WHERE file = ? OR cover = ?').all(file, file), ...db.prepare('SELECT id AS p FROM projects WHERE photo = ?').all(file)];
  return ps.length > 0 && ps.every((r) => r.p === user.project_id);
}
// A qué proyectos llega (null = a todos).
export const scopeOf = (user) => (user.role === 'general' ? null : [user.project_id]);

// Lo que ve el equipo de contenido (sombra o editor) de su proyecto: nada de números (padrón, pauta, cuentas, publicaciones).
export const sombraProject = (p) => ({ id: p.id, name: p.name, role: p.role, org: p.org, color: p.color, photo: p.photo, review_mode: p.review_mode, review_pending: p.review_pending, kind: p.kind });
export const sombraReel = (r) => ({ id: r.id, title: r.title, kind: r.kind, file: r.file, cover: r.cover, size: r.size, duration: r.duration, status: r.status, status_detail: r.status_detail, created_at: r.created_at, source_id: r.source_id, etiqueta: r.etiqueta });

// ---------- rutas de usuarios ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, project_id: u.project_id, created_at: u.created_at, last_login_at: u.last_login_at });
export function mountUsers(app, { db }) {
  const get = (s, ...a) => db.prepare(s).get(...a), all = (s, ...a) => db.prepare(s).all(...a), run = (s, ...a) => db.prepare(s).run(...a);
  app.get('/api/me', (req, res) => res.json(pub({ ...req.user, created_at: '', last_login_at: '' })));
  app.get('/api/users', (req, res) => {
    const u = req.user;
    if (u.role === 'general') return res.json(all('SELECT * FROM users ORDER BY role, name').map(pub));
    if (u.role === 'admin') return res.json(all("SELECT * FROM users WHERE project_id = ? AND role IN ('admin', 'editor', 'sombra') ORDER BY role, name", u.project_id).map(pub));
    res.status(403).json({ error: 'No' });
  });
  // qué puede tocar `me` sobre un usuario con rol `role` del proyecto `pid`
  const canManage = (me, role, pid) => me.role === 'general' || (me.role === 'admin' && (role === 'sombra' || role === 'editor') && pid === me.project_id);
  const check = (b, me, isNew) => {
    const role = b.role, pid = role === 'general' ? null : Number(b.project_id) || null;
    const no = (error, status = 400) => ({ status, error });
    if (!ROLES.includes(role)) return no('El rol es general, admin, editor o sombra');
    if (role !== 'general' && (!pid || !get('SELECT id FROM projects WHERE id = ?', pid))) return no('Elegí de qué dirigente es');
    if (!canManage(me, role, pid)) return no(me.role === 'admin' ? 'Solo podés dar de alta editores y sombras de tu dirigente' : 'No podés', 403);
    if ((isNew || b.password) && String(b.password || '').length < 8) return no('La contraseña tiene que tener al menos 8 caracteres');
    return null;
  };
  app.post('/api/users', (req, res) => {
    const b = req.body || {}, me = req.user;
    if (me.role === 'admin' && !b.role) b.role = 'sombra';
    if (me.role === 'admin' && !b.project_id) b.project_id = me.project_id;
    const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim().slice(0, 80);
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Poné un mail válido' });
    if (!name) return res.status(400).json({ error: 'Falta el nombre' });
    const bad = check(b, me, true); if (bad) return res.status(bad.status).json({ error: bad.error });
    if (b.role === 'general' && get("SELECT count(*) n FROM users WHERE role = 'general'").n >= MAX_GENERALES) return res.status(400).json({ error: `Ya hay ${MAX_GENERALES} administradores generales, que es el tope` });
    if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Ya hay un usuario con ese mail' });
    const r = run('INSERT INTO users (email, name, role, project_id, pass_hash, created_by, ver) VALUES (?, ?, ?, ?, ?, ?, ?)', email, name, b.role, b.role === 'general' ? null : Number(b.project_id), hashPassword(b.password), me.id, crypto.randomInt(1, 2 ** 31));
    res.json(pub(get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid)));
  });
  app.put('/api/users/:id', (req, res) => {
    const me = req.user, u = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!u || !canManage(me, u.role, u.project_id)) return res.status(404).json({ error: 'No existe' });
    const b = { role: u.role, project_id: u.project_id, ...pickDefined(req.body || {}, ['name', 'role', 'project_id', 'password']) };
    const bad = check(b, me, false); if (bad) return res.status(bad.status).json({ error: bad.error });
    if (b.role === 'general' && u.role !== 'general' && get("SELECT count(*) n FROM users WHERE role = 'general'").n >= MAX_GENERALES) return res.status(400).json({ error: `Ya hay ${MAX_GENERALES} administradores generales, que es el tope` });
    const name = b.name != null ? String(b.name).trim().slice(0, 80) || u.name : u.name;
    const changed = b.password || b.role !== u.role || (b.role === 'general' ? null : Number(b.project_id)) !== u.project_id;
    run('UPDATE users SET name = ?, role = ?, project_id = ?, pass_hash = ?, ver = ver + ? WHERE id = ?', name, b.role, b.role === 'general' ? null : Number(b.project_id),
      b.password ? hashPassword(b.password) : u.pass_hash, changed ? 1 : 0, u.id);
    res.json(pub(get('SELECT * FROM users WHERE id = ?', u.id)));
  });
  app.delete('/api/users/:id', (req, res) => {
    const me = req.user, u = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!u || !canManage(me, u.role, u.project_id)) return res.status(404).json({ error: 'No existe' });
    if (u.id === me.id) return res.status(400).json({ error: 'No podés borrarte a vos mismo' });
    run('DELETE FROM users WHERE id = ?', u.id);
    res.json({ ok: true });
  });
}
const pickDefined = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== '').map((k) => [k, o[k]]));
