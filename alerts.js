// Avisos para Gero: acá se anotan; notify.js los manda por Telegram.
// Ojo con la hora: `at` por defecto es UTC, pero los avisos del ciclo de pauta y del servidor pasan hora local (la del ACM_TZ); el dedupe diario usa la fecha de `at` tal cual.
export function initAlerts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT NOT NULL, text TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);
  CREATE INDEX IF NOT EXISTS alerts_project ON alerts(project_id, kind, at);`);
  if (!db.prepare('PRAGMA table_info(alerts)').all().some((c) => c.name === 'dedupe_key')) db.exec("ALTER TABLE alerts ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''");
}

// Anota un aviso. No repite: un solo aviso por proyecto, tipo, clave y día. Devuelve el id, o null si ya estaba.
// key (opcional): separa avisos distintos del mismo tipo, p. ej. 'pausa_imposible:<ad_id>' o 'red_bloqueada:<red>' (dos anuncios que no se
// pueden pausar son dos avisos, no uno). Sin clave vale '' y queda el dedupe de siempre.
export function addAlert(db, kind, projectId, text, at = new Date().toISOString().replace('T', ' ').slice(0, 19), key = '') {
  const day = String(at).slice(0, 10), k = String(key || '');
  const ya = db.prepare('SELECT 1 FROM alerts WHERE project_id IS ? AND kind = ? AND dedupe_key = ? AND substr(at, 1, 10) = ?').get(projectId ?? null, kind, k, day);
  if (ya) return null;
  return Number(db.prepare('INSERT INTO alerts (project_id, kind, text, at, dedupe_key) VALUES (?, ?, ?, ?, ?)').run(projectId ?? null, kind, String(text), at, k).lastInsertRowid);
}
