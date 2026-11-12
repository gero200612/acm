// Investigación del proyecto: fichas (historia, elección, candidatos, cuentas, publicaciones de la competencia) con búsqueda
// por significado. Los vectores los calcula ACM solo, con multilingual-e5-small (el mismo modelo que la memoria de Sincro Agents),
// sin mandar nada afuera. Si el modelo no está, la búsqueda cae a palabras y las fichas quedan pendientes de vector.
import path from 'node:path';
import fs from 'node:fs';

const MODEL = 'Xenova/multilingual-e5-small';
const MODELS_DIR = path.resolve(process.env.ACM_MODELS || './models');
let db = null;
let pipe = null, loading = null, failed = '';

export const KINDS = {
  eleccion: 'Elección', candidato: 'Candidatos', propuesta: 'Propuestas', apoyos: 'Apoyos', politica: 'Política',
  economia: 'Economía', historia: 'Historia', deportivo: 'Deportivo', tema: 'Temas del socio', cuenta: 'Cuentas',
  medio: 'Medios', aprendizaje: 'Qué funciona', publicacion: 'Publicaciones', nota: 'Notas',
};

export function initKnowledge(database) {
  db = database;
  db.exec(`CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'nota', title TEXT NOT NULL, text TEXT DEFAULT '', source TEXT DEFAULT '', confidence TEXT DEFAULT '',
    date TEXT DEFAULT '', handle TEXT DEFAULT '', data TEXT DEFAULT '', vec BLOB, created_at TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS knowledge_project ON knowledge(project_id, kind);`);
}

export function modelStatus() {
  return { model: MODEL, ready: !!pipe, loading: !!loading && !pipe, error: failed, present: fs.existsSync(path.join(MODELS_DIR, MODEL, 'onnx', 'model_quantized.onnx')) };
}

async function load() {
  if (pipe) return pipe;
  if (!loading) loading = (async () => {
    try {
      if (!fs.existsSync(path.join(MODELS_DIR, MODEL, 'onnx', 'model_quantized.onnx'))) throw new Error(`no está el modelo en ${MODELS_DIR}`);
      const { pipeline, env } = await import('@huggingface/transformers');
      env.localModelPath = MODELS_DIR + '/'; env.allowRemoteModels = false;
      pipe = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
      failed = '';
      return pipe;
    } catch (e) { failed = e.message; loading = null; throw e; }
  })();
  return loading;
}

// e5 pide "query: " para lo que se busca y "passage: " para lo que se guarda
// de a un cálculo por vez: dos corridas simultáneas sobre la misma sesión del modelo pueden quedar colgadas
let queue = Promise.resolve();
export function embed(texts, mode = 'passage') {
  const job = queue.then(() => embedNow(texts, mode));
  queue = job.catch(() => {});
  return job;
}
async function embedNow(texts, mode) {
  const p = await load();
  const out = [];
  for (let i = 0; i < texts.length; i += 16) {
    const t = await p(texts.slice(i, i + 16).map((x) => `${mode}: ${String(x).slice(0, 1800)}`), { pooling: 'mean', normalize: true });
    const dim = t.dims[1];
    for (let j = 0; j < t.dims[0]; j++) out.push(new Float32Array(t.data.slice(j * dim, (j + 1) * dim)));
  }
  return out;
}
const toBlob = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const passage = (r) => `${r.title}. ${r.text}`;

// calcula los vectores que falten (al importar o cuando el modelo vuelve a estar)
let filling = null;
export function fillVectors() {
  if (filling) return filling;
  filling = (async () => {
    // sin este await, si no hay nada pendiente el finally corre antes de asignar filling y el candado queda puesto para siempre
    await null;
    try {
      for (;;) {
        const rows = db.prepare('SELECT id, title, text FROM knowledge WHERE vec IS NULL LIMIT 16').all();
        if (!rows.length) break;
        const V = await embed(rows.map(passage));
        const up = db.prepare('UPDATE knowledge SET vec = ? WHERE id = ?');
        rows.forEach((r, i) => up.run(toBlob(V[i]), r.id));
      }
    } catch (e) { console.error('vectores:', e.message); }
    finally { filling = null; }
  })();
  return filling;
}

const S = (v, n = 20000) => String(v ?? '').trim().slice(0, n);
// fichas sueltas (formato de las investigaciones de Sincro: tipo, titulo, texto, fuente, confianza, fecha)
export function addItems(projectId, items) {
  const ins = db.prepare('INSERT INTO knowledge (project_id, kind, title, text, source, confidence, date, handle, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const it of items) {
      const title = S(it.titulo ?? it.title, 300); const text = S(it.texto ?? it.text);
      if (!title || !text) continue;
      const kind = S(it.tipo ?? it.kind, 40).toLowerCase() || 'nota';
      ins.run(projectId, kind, title, text, S(it.fuente ?? it.source, 500), S(it.confianza ?? it.confidence, 20), S(it.fecha ?? it.date, 20), S(it.handle, 80).replace(/^@/, ''), it.data ? JSON.stringify(it.data).slice(0, 20000) : '');
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}

// una cuenta de Instagram leída con business_discovery: cada publicación pasa a ser una ficha (lo que dijo, cuándo y cuánto rindió)
export function addInstagram(projectId, ds) {
  const h = S(ds.username, 80);
  if (!h || !Array.isArray(ds.posts)) return 0;
  // reemplaza las publicaciones viejas de esa cuenta
  db.prepare("DELETE FROM knowledge WHERE project_id = ? AND kind = 'publicacion' AND handle = ?").run(projectId, h);
  const F = Number(ds.followers_count) || 0;
  const items = ds.posts.filter((p) => (p.caption || '').trim()).map((p) => {
    const eng = (p.like_count || 0) + (p.comments_count || 0);
    const type = p.media_product_type === 'REELS' ? 'reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'carrusel' : 'foto';
    return { tipo: 'publicacion', handle: h, fecha: String(p.timestamp || '').slice(0, 10), fuente: p.permalink || '', confianza: 'alta',
      titulo: `@${h} · ${type} del ${String(p.timestamp || '').slice(0, 10)} · ${eng} interacciones`,
      texto: S(p.caption, 2200), data: { likes: p.like_count || 0, comments: p.comments_count || 0, eng, rate: F ? eng / F : 0, type, followers: F } };
  });
  return addItems(projectId, items);
}

const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const out = (r, score) => { const { vec, data, project_id, ...x } = r; return { ...x, data: data ? JSON.parse(data) : null, score }; };

export async function search(projectId, q, { kind = '', handle = '', limit = 40 } = {}) {
  const where = ['project_id = ?'], args = [projectId];
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (handle) { where.push('handle = ?'); args.push(handle.replace(/^@/, '')); }
  const rows = db.prepare(`SELECT * FROM knowledge WHERE ${where.join(' AND ')}`).all(...args);
  q = String(q || '').trim();
  if (!q) return { mode: 'todo', items: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id).slice(0, limit).map((r) => out(r, null)) };
  // palabras: siempre suman (nombres propios, cuentas); el significado ordena el resto
  const words = norm(q).split(/\s+/).filter((w) => w.length > 2);
  const kw = (r) => { const t = norm(`${r.title} ${r.text} ${r.handle}`); return words.length ? words.filter((w) => t.includes(w)).length / words.length : 0; };
  let qv = null;
  try { [qv] = await embed([q], 'query'); } catch {}
  const scored = rows.map((r) => {
    const k = kw(r);
    const s = qv && r.vec ? cos(qv, fromBlob(r.vec)) : 0;
    // e5 da parecidos entre 0,7 y 0,9: se estira ese rango y las palabras exactas suman un poco
    return [r, qv ? Math.max(0, (s - 0.72) / 0.2) + 0.25 * k : k];
  }).filter(([, s]) => s > 0.05).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return { mode: qv ? 'significado' : 'palabras', items: scored.map(([r, s]) => out(r, Math.round(s * 100) / 100)) };
}

export function stats(projectId) {
  const kinds = db.prepare('SELECT kind, count(*) n FROM knowledge WHERE project_id = ? GROUP BY kind').all(projectId);
  const accounts = db.prepare(`SELECT handle, count(*) posts, max(date) last, sum(json_extract(data, '$.eng')) eng, max(json_extract(data, '$.followers')) followers,
      avg(json_extract(data, '$.eng')) avg_eng FROM knowledge WHERE project_id = ? AND kind = 'publicacion' GROUP BY handle ORDER BY followers DESC`).all(projectId);
  const pending = db.prepare('SELECT count(*) n FROM knowledge WHERE project_id = ? AND vec IS NULL').get(projectId).n;
  return { kinds, accounts, pending, model: modelStatus() };
}

// Publicaciones que rindieron muy por encima de lo normal de su propia cuenta (como el «outlier score»): interacciones de la publicación
// contra la mediana de esa cuenta. Solo cuentas con al menos MIN_POSTS publicaciones leídas (con menos, la mediana no dice nada).
export const OUTLIER_MIN_POSTS = 8, OUTLIER_MIN_SCORE = 2;
export function outliers(projectId, { limit = 12, handle = '' } = {}) {
  const rows = db.prepare(`SELECT id, handle, date, source, text, json_extract(data, '$.eng') eng, json_extract(data, '$.type') type, json_extract(data, '$.likes') likes, json_extract(data, '$.comments') comments
    FROM knowledge WHERE project_id = ? AND kind = 'publicacion' AND (? = '' OR handle = ?)`).all(projectId, handle, handle);
  const byHandle = new Map();
  for (const r of rows) { if (!byHandle.has(r.handle)) byHandle.set(r.handle, []); byHandle.get(r.handle).push(r); }
  const out = [];
  for (const [h, L] of byHandle) {
    if (L.length < OUTLIER_MIN_POSTS) continue;
    const s = L.map((r) => Number(r.eng) || 0).sort((a, b) => a - b), n = s.length;
    const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    if (med <= 0) continue;
    for (const r of L) {
      const score = (Number(r.eng) || 0) / med;
      if (score >= OUTLIER_MIN_SCORE) out.push({ id: r.id, handle: h, date: r.date, url: /^https?:\/\//i.test(r.source || '') ? r.source : '', text: String(r.text || '').slice(0, 280), type: r.type, eng: r.eng, likes: r.likes, comments: r.comments, median: med, score: Math.round(score * 10) / 10 });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, limit)));
}
