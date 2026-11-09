// Avisos para Gero (el envío por Telegram llega con la Tarea 13: acá solo se anotan).
export function initAlerts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT NOT NULL, text TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);
  CREATE INDEX IF NOT EXISTS alerts_project ON alerts(project_id, kind, at);`);
}

// Anota un aviso. No repite: un solo aviso por proyecto, tipo y día. Devuelve el id, o null si ya estaba.
export function addAlert(db, kind, projectId, text, at = new Date().toISOString().replace('T', ' ').slice(0, 19)) {
  const day = String(at).slice(0, 10);
  const ya = db.prepare('SELECT 1 FROM alerts WHERE project_id IS ? AND kind = ? AND substr(at, 1, 10) = ?').get(projectId ?? null, kind, day);
  if (ya) return null;
  return Number(db.prepare('INSERT INTO alerts (project_id, kind, text, at) VALUES (?, ?, ?, ?)').run(projectId ?? null, kind, String(text), at).lastInsertRowid);
}
