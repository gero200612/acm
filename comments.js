// Comentarios en un segundo exacto de un reel («en el 0:12 tapa la cara»): los deja el equipo en Para aprobar o el dirigente desde
// el link compartido. Le llegan al editor en sus aprendizajes, junto con los motivos de los rechazos.
export function initComments(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS reel_comments (
    id INTEGER PRIMARY KEY, reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    at_s REAL NOT NULL, text TEXT NOT NULL, author TEXT DEFAULT 'equipo', created_at TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS reel_comments_reel ON reel_comments(reel_id, at_s);`);
}

const clean = (body) => {
  const text = String(body?.text || '').trim(), at = Number(body?.at_s);
  if (!text) return { error: 'Escribí el comentario' };
  if (text.length > 600) return { error: 'El comentario pasa de 600 caracteres' };
  if (!Number.isFinite(at) || at < 0 || at > 3600) return { error: 'El segundo no es válido' };
  return { text, at: Math.round(at * 10) / 10 };
};

export function addComment(db, reel, body, author) {
  const c = clean(body);
  if (c.error) return { status: 400, body: { error: c.error } };
  if (reel.duration && c.at > reel.duration + 1) return { status: 400, body: { error: 'Ese segundo pasa el largo del video' } };
  const r = db.prepare('INSERT INTO reel_comments (reel_id, project_id, at_s, text, author) VALUES (?, ?, ?, ?, ?)').run(reel.id, reel.project_id, c.at, c.text, String(author || 'equipo').slice(0, 60));
  return { status: 200, body: db.prepare('SELECT id, at_s, text, author, created_at FROM reel_comments WHERE id = ?').get(r.lastInsertRowid) };
}
export const commentsOf = (db, reelIds) => {
  if (!reelIds.length) return {};
  const rows = db.prepare(`SELECT id, reel_id, at_s, text, author, created_at FROM reel_comments WHERE reel_id IN (${reelIds.map(() => '?').join(',')}) ORDER BY at_s, id`).all(...reelIds);
  const out = {}; for (const r of rows) (out[r.reel_id] ||= []).push(r);
  return out;
};

// Rutas con sesión: van montadas después de app.use('/api', requireAuth).
export function mountComments(app, { get, run, db }) {
  app.get('/api/reels/:id/comments', (req, res) => res.json(commentsOf(db, [Number(req.params.id)])[Number(req.params.id)] || []));
  app.post('/api/reels/:id/comments', (req, res) => {
    const reel = get('SELECT id, project_id, duration FROM reels WHERE id = ?', req.params.id);
    if (!reel) return res.status(404).json({ error: 'No existe el reel' });
    const out = addComment(db, reel, req.body, 'equipo');
    res.status(out.status).json(out.body);
  });
  app.delete('/api/reel-comments/:id', (req, res) => { run('DELETE FROM reel_comments WHERE id = ?', req.params.id); res.json({ ok: true }); });
}

// Lo que el editor necesita saber de los pedidos de cambio: comentarios por segundo y motivos de rechazo de los últimos 30 días.
export function feedbackOf(db, projectId) {
  const comentarios = db.prepare(`SELECT c.at_s, c.text, c.author, r.title, r.clip_id, r.recipe FROM reel_comments c JOIN reels r ON r.id = c.reel_id
    WHERE c.project_id = ? AND c.created_at >= datetime('now', '-30 days') ORDER BY c.id DESC LIMIT 60`).all(projectId)
    .map((c) => ({ segundo: c.at_s, texto: c.text, quien: c.author, reel: c.title, recorte: c.clip_id, variables: (() => { try { return JSON.parse(c.recipe || 'null')?.variables || null; } catch { return null; } })() }));
  const rechazos = db.prepare(`SELECT clip_id, comentario, at FROM clip_reviews WHERE project_id = ? AND decision = 'rechazar' AND comentario != '' AND at >= datetime('now', '-30 days') ORDER BY id DESC LIMIT 30`).all(projectId)
    .map((r) => ({ recorte: r.clip_id, motivo: r.comentario, cuando: r.at }));
  return { comentarios, rechazos };
}
