// Base del orquestador (node:sqlite). Un trabajo es un crudo; de cada crudo salen momentos, y de cada momento, ediciones (hasta 3 recetas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function abrirDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS trabajos (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, reel_id INTEGER NOT NULL, url TEXT NOT NULL,
  duracion_s REAL, aprendizajes_url TEXT DEFAULT '', estado TEXT NOT NULL DEFAULT 'en_cola', detalle TEXT DEFAULT '',
  transcripcion TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS momentos (
  id INTEGER PRIMARY KEY, trabajo_id INTEGER NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, clip_id TEXT NOT NULL, inicio_s REAL NOT NULL, fin_s REAL NOT NULL, datos TEXT DEFAULT '{}',
  UNIQUE (trabajo_id, idx));
CREATE TABLE IF NOT EXISTS ediciones (
  id INTEGER PRIMARY KEY, trabajo_id INTEGER NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  momento_id INTEGER NOT NULL REFERENCES momentos(id) ON DELETE CASCADE, idx INTEGER NOT NULL,
  receta TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', resultado TEXT, revision TEXT, error TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), UNIQUE (momento_id, idx));
`);
  return db;
}

export const TERMINALES = ['listo', 'sin_momentos', 'error'];
const J = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const P = (v) => (v ? JSON.parse(v) : null);

export function repo(db) {
  const get = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const trabajo = (t) => t && { ...t, transcripcion: P(t.transcripcion) };
  return {
    crearTrabajo({ project_id, reel_id, url, duracion_s, aprendizajes_url }) {
      // un crudo con un trabajo en marcha no se duplica
      const vivo = get(`SELECT id FROM trabajos WHERE reel_id = ? AND estado NOT IN ('listo','sin_momentos','error')`, reel_id);
      if (vivo) return vivo.id;
      return Number(run('INSERT INTO trabajos (project_id, reel_id, url, duracion_s, aprendizajes_url) VALUES (?, ?, ?, ?, ?)',
        project_id, reel_id, url, duracion_s ?? null, aprendizajes_url || '').lastInsertRowid);
    },
    trabajo: (id) => trabajo(get('SELECT * FROM trabajos WHERE id = ?', id)),
    siguiente: () => get(`SELECT id FROM trabajos WHERE estado NOT IN ('listo','sin_momentos','error') ORDER BY id LIMIT 1`)?.id ?? null,
    pendientes: () => all(`SELECT id FROM trabajos WHERE estado NOT IN ('listo','sin_momentos','error') ORDER BY id`).map((r) => r.id),
    estado(id, estado, detalle = '') { run("UPDATE trabajos SET estado = ?, detalle = ?, updated_at = datetime('now') WHERE id = ?", estado, detalle, id); },
    guardarTranscripcion(id, t) { run('UPDATE trabajos SET transcripcion = ? WHERE id = ?', J(t), id); },
    // los momentos se guardan una sola vez: si el trabajo se retoma, se reusan (y con ellos el clip_id)
    momentos: (tid) => all('SELECT * FROM momentos WHERE trabajo_id = ? ORDER BY idx', tid).map((m) => ({ ...m, datos: P(m.datos) || {} })),
    guardarMomento(tid, idx, clip_id, inicio_s, fin_s, datos) {
      return Number(run('INSERT INTO momentos (trabajo_id, idx, clip_id, inicio_s, fin_s, datos) VALUES (?, ?, ?, ?, ?, ?)', tid, idx, clip_id, inicio_s, fin_s, J(datos) || '{}').lastInsertRowid);
    },
    ediciones: (tid) => all('SELECT * FROM ediciones WHERE trabajo_id = ? ORDER BY momento_id, idx', tid)
      .map((e) => ({ ...e, receta: P(e.receta), resultado: P(e.resultado), revision: P(e.revision) })),
    guardarEdicion(tid, momento_id, idx, receta) {
      return Number(run('INSERT INTO ediciones (trabajo_id, momento_id, idx, receta) VALUES (?, ?, ?, ?)', tid, momento_id, idx, J(receta)).lastInsertRowid);
    },
    edicion(id, campos) {
      const k = Object.keys(campos);
      run(`UPDATE ediciones SET ${k.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...k.map((c) => (typeof campos[c] === 'object' && campos[c] !== null ? J(campos[c]) : campos[c])), id);
    },
  };
}
