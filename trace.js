// Corridas del Laboratorio: cada publicación, prueba de conexión o acción de Meta Ads queda registrada con su traza.
// Las llamadas a las APIs se capturan envolviendo fetch dentro de la corrida (AsyncLocalStorage), sin tocar cada módulo.
import { AsyncLocalStorage } from 'node:async_hooks';

export const als = new AsyncLocalStorage();
let db = null;

export function initTrace(database) {
  db = database;
  db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, project_id INTEGER, account_id INTEGER, post_id INTEGER, network TEXT DEFAULT '',
  title TEXT DEFAULT '', status TEXT DEFAULT 'corriendo', summary TEXT DEFAULT '', error TEXT DEFAULT '',
  started_at TEXT DEFAULT (datetime('now')), ms INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS run_steps (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE, at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL, label TEXT DEFAULT '', status TEXT DEFAULT '', ms INTEGER, detail TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS run_steps_run ON run_steps(run_id);`);
  // si el servidor se cortó a mitad de una corrida
  db.exec("UPDATE runs SET status = 'cortada' WHERE status = 'corriendo'");
  // se guardan las últimas 2.000 corridas
  db.exec('DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 2000)');
}

// nunca se guardan tokens: ni en la URL, ni en el cuerpo, ni en la respuesta
export function mask(text, secrets = []) {
  let t = String(text ?? '');
  for (const s of secrets) if (s && s.length > 6) t = t.split(s).join('••••');
  return t
    .replace(/(access_token|client_secret|refresh_token|client_key|token|secret|password)(\s*["']?\s*[=:]\s*["']?)[^"&,\s}]+/gi, '$1$2••••')
    .replace(/\bEAA[A-Za-z0-9_-]{4,}/g, '••••')
    .replace(/\bya29\.[A-Za-z0-9_.-]+/g, '••••')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/g, 'Bearer ••••');
}

export function step(kind, label, status = '', ms = null, detail = '') {
  const s = als.getStore();
  if (!s?.runId || !db) return;
  db.prepare('INSERT INTO run_steps (run_id, kind, label, status, ms, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.runId, kind, mask(label, s.secrets).slice(0, 400), String(status), ms, mask(detail, s.secrets).slice(0, 1500));
}

// Corre fn dentro de una corrida. meta: { kind, title, project_id, account_id, post_id, network, secrets, bases }
export async function traced(meta, fn) {
  const r = db.prepare('INSERT INTO runs (kind, title, project_id, account_id, post_id, network) VALUES (?, ?, ?, ?, ?, ?)')
    .run(meta.kind, meta.title || '', meta.project_id ?? null, meta.account_id ?? null, meta.post_id ?? null, meta.network || '');
  const runId = Number(r.lastInsertRowid), t0 = Date.now();
  const store = { runId, secrets: (meta.secrets || []).filter(Boolean), bases: meta.bases };
  try {
    const out = await als.run(store, fn);
    db.prepare("UPDATE runs SET status = 'ok', summary = ?, ms = ? WHERE id = ?").run(mask(typeof out === 'string' ? out : out?.summary || '', store.secrets).slice(0, 400), Date.now() - t0, runId);
    return out;
  } catch (e) {
    db.prepare("UPDATE runs SET status = 'error', error = ?, ms = ? WHERE id = ?").run(mask(e.message, store.secrets).slice(0, 600), Date.now() - t0, runId);
    throw e;
  }
}

// fetch envuelto: dentro de una corrida, cada llamada deja un paso con método, destino, estado y tiempo
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const s = als.getStore();
  if (!s?.runId) return realFetch(url, opt);
  const u = new URL(String(url));
  const label = `${opt.method || 'GET'} ${u.host}${u.pathname}`;
  const sent = typeof opt.body === 'string' ? opt.body : opt.body instanceof URLSearchParams ? opt.body.toString() : opt.body ? `[${opt.body.length ?? '?'} bytes]` : '';
  const t0 = Date.now();
  try {
    const res = await realFetch(url, opt);
    const copy = res.clone();
    let text = '';
    try { text = await copy.text(); } catch {}
    step('http', label, res.status, Date.now() - t0, (sent ? `→ ${sent.slice(0, 500)}\n` : '') + `← ${text.slice(0, 800)}`);
    return res;
  } catch (e) {
    step('http', label, 'sin respuesta', Date.now() - t0, e.message);
    throw e;
  }
};
