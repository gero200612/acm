// Referencias: reels de otros (de cualquier red) que el equipo marca como inspiración para el editor, con una nota de qué tomar
// («el ritmo», «cómo arranca», «los subtítulos»). Le llegan al editor en sus aprendizajes.
const NETWORK_OF = [[/instagram\.com/i, 'instagram'], [/tiktok\.com/i, 'tiktok'], [/youtube\.com|youtu\.be/i, 'youtube'], [/facebook\.com|fb\.watch/i, 'facebook'], [/x\.com|twitter\.com/i, 'x']];
export function initRefs(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS refs (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, url TEXT NOT NULL, note TEXT DEFAULT '',
    network TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), UNIQUE (project_id, url));`);
}
export const referencesOf = (db, projectId) => db.prepare('SELECT url, note, network FROM refs WHERE project_id = ? ORDER BY id DESC LIMIT 40').all(projectId);
export function mountRefs(app, { get, all, run }) {
  app.get('/api/projects/:id/refs', (req, res) => res.json(all('SELECT id, url, note, network, created_at FROM refs WHERE project_id = ? ORDER BY id DESC', req.params.id)));
  app.post('/api/projects/:id/refs', (req, res) => {
    if (!get('SELECT 1 FROM projects WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'No existe el proyecto' });
    let u;
    try { u = new URL(String(req.body?.url || '').trim()); } catch { return res.status(400).json({ error: 'Pegá el link completo del reel (https://…)' }); }
    if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: 'El link tiene que empezar con https://' });
    const url = u.toString().slice(0, 500), note = String(req.body?.note || '').trim().slice(0, 300);
    const network = (NETWORK_OF.find(([re]) => re.test(u.hostname)) || [, 'otra'])[1];
    try { run('INSERT INTO refs (project_id, url, note, network) VALUES (?, ?, ?, ?)', req.params.id, url, note, network); }
    catch { return res.status(409).json({ error: 'Esa referencia ya está' }); }
    res.json({ ok: true });
  });
  app.delete('/api/refs/:id', (req, res) => { run('DELETE FROM refs WHERE id = ?', req.params.id); res.json({ ok: true }); });
}
