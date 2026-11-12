// Memoria del proyecto: compara las 3 ediciones hermanas de un recorte, acumula lo aprendido y se lo devuelve al editor.
// La memoria es de cada proyecto: nunca se mezclan datos entre proyectos.
import Anthropic from '@anthropic-ai/sdk';
import { score, weightsOf } from './metrics.js';

export const MIN_DATA_HOURS = 48;   // cada hermana necesita al menos 48 h desde que se publicó
export const MIN_TRIALS = 5;        // una variable gana con 5 intentos (ponderados) o más
export const OWNER_WEIGHT = 3;      // la opinión del dueño pesa 3×
export const VARIABLES = ['gancho', 'subtitulos', 'musica', 'ritmo', 'largo'];
const MODEL = process.env.ACM_MEMORY_MODEL || 'claude-sonnet-5-5';

export function initMemory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS comparisons (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, clip_id TEXT NOT NULL UNIQUE, winner_reel_id INTEGER NOT NULL, winner_recipe TEXT DEFAULT '{}',
  diff REAL NOT NULL DEFAULT 0, scores TEXT DEFAULT '[]', hypothesis TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS comparisons_project ON comparisons(project_id, id);`);
}

const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
const minutes = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0) / 6e4;
const pad = (n) => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// las variables de una receta (el editor las manda en recipe.variables; si faltan, se leen de los campos sueltos)
export function recipeVars(recipe) {
  const r = recipe || {}, v = r.variables || {}, out = {};
  const fallback = { subtitulos: r.subtitulos, musica: r.musica === null ? 'sin' : r.musica?.clima, ritmo: r.ritmo };
  for (const k of VARIABLES) { const x = v[k] ?? fallback[k]; if (typeof x === 'string' && x) out[k] = x; }
  return out;
}

// La opinión del dueño (Gero) y la del dirigente (desde un link compartido) pesan igual: los dos deciden qué sale.
const weightOf = (origin) => (origin === 'opinion_dueno' || origin === 'opinion_dirigente' ? OWNER_WEIGHT : 1);

// Ganadora = variable (o, por red, horario) con trials >= 5 y la mayor tasa de victorias. Las opiniones del dueño pesan 3×.
export function winningVariables(db, projectId) {
  const rows = db.prepare('SELECT variable, value, network, wins, trials, origin FROM learnings WHERE project_id = ?').all(projectId);
  const tally = new Map(); // variable|network -> value -> {w, n}
  for (const r of rows) {
    const k = r.variable === 'horario' ? `horario|${r.network || ''}` : r.variable;
    const m = tally.get(k) || tally.set(k, new Map()).get(k);
    const t = m.get(r.value) || m.set(r.value, { w: 0, n: 0 }).get(r.value);
    const f = weightOf(r.origin); t.w += (Number(r.wins) || 0) * f; t.n += (Number(r.trials) || 0) * f;
  }
  const best = (m) => {
    let top = null;
    for (const [value, t] of m) {
      if (t.n < MIN_TRIALS) continue;
      const rate = t.w / t.n;
      if (!top || rate > top.rate || (rate === top.rate && t.n > top.n)) top = { value, rate, n: t.n };
    }
    return top?.value;
  };
  const out = {};
  for (const v of VARIABLES) { const x = tally.has(v) && best(tally.get(v)); if (x) out[v] = x; }
  const horario = {};
  for (const [k, m] of tally) if (k.startsWith('horario|') && k.length > 8) { const x = best(m); if (x && /^\d{2}:\d{2}$/.test(x)) horario[k.slice(8)] = x; }
  if (Object.keys(horario).length) out.horario = horario;
  return out;
}

// todo lo acumulado, agregado por variable/valor/red, para mostrarlo
export function learningsSummary(db, projectId) {
  const rows = db.prepare('SELECT variable, value, network, wins, trials, origin FROM learnings WHERE project_id = ?').all(projectId);
  const m = new Map();
  for (const r of rows) {
    const k = `${r.variable}|${r.value}|${r.network || ''}`;
    const t = m.get(k) || m.set(k, { variable: r.variable, value: r.value, network: r.network || null, wins: 0, trials: 0 }).get(k);
    const f = weightOf(r.origin); t.wins += (Number(r.wins) || 0) * f; t.trials += (Number(r.trials) || 0) * f;
  }
  return [...m.values()].map((t) => ({ ...t, rate: t.trials > 0 ? Math.round((t.wins / t.trials) * 1000) / 1000 : 0 }))
    .sort((a, b) => a.variable.localeCompare(b.variable) || b.rate - a.rate || b.trials - a.trials);
}

// --- hipótesis ---
function plainHypothesis({ winner, others }) {
  const dif = [];
  for (const o of others) for (const k of VARIABLES) if (winner.vars[k] && o.vars[k] && winner.vars[k] !== o.vars[k]) dif.push(`${k} «${winner.vars[k]}» en vez de «${o.vars[k]}»`);
  const lista = [...new Set(dif)];
  const nums = others.map((o) => o.score.toFixed(2)).join(' y ');
  return `La versión ${winner.n} ganó con un puntaje de ${winner.score.toFixed(2)} contra ${nums}.`
    + (lista.length ? ` Se diferenció en: ${lista.join('; ')}. Puede ser lo que hizo la diferencia, pero con un solo recorte es solo una pista.` : ' Las recetas eran casi iguales: la diferencia puede ser azar u horario.');
}
let client = null;
const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
// Sonnet escribe la hipótesis; sin clave o ante cualquier error queda el texto armado con los números (nunca rompe la comparación)
export async function sonnetHypothesis(info) {
  const plain = plainHypothesis(info);
  if (!hasKey()) return plain;
  try {
    client ||= new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const desc = [info.winner, ...info.others].map((e) => `Versión ${e.n}${e === info.winner ? ' (GANADORA)' : ''}: puntaje ${e.score.toFixed(3)}, receta ${JSON.stringify(e.vars)}`).join('\n');
    const r = await client.messages.create({
      model: MODEL, max_tokens: 400,
      system: 'Sos el analista de ACM. Te paso las 3 ediciones de un mismo recorte y su puntaje. Escribí en castellano rioplatense una hipótesis de 2 o 3 oraciones sobre qué variable de la receta explicaría la diferencia. Es una hipótesis, no una certeza: no afirmes causas, no inventes datos.',
      messages: [{ role: 'user', content: desc }],
    });
    const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return text || plain;
  } catch { return plain; }
}

// deps: { db, now?: 'YYYY-MM-DD HH:MM' local, hypothesize?: async (info) => string }
// Compara las hermanas publicadas de un recorte (2 o más; las no publicadas quedan afuera) y espera mientras alguna publicada tenga menos de 48 h de datos. Una sola vez por recorte.
export async function compareSiblings(clipId, deps = {}) {
  const { db } = deps, now = (typeof deps.now === 'function' ? deps.now() : deps.now) || nowLocal();
  if (db.prepare('SELECT 1 FROM comparisons WHERE clip_id = ?').get(clipId)) return { skipped: 'ya comparado' };
  const reels = db.prepare("SELECT id, project_id, recipe FROM reels WHERE clip_id = ? AND kind = 'listo' ORDER BY id").all(clipId);
  if (reels.length < 2) return { skipped: 'no hay hermanas para comparar' };
  const projectId = reels[0].project_id;
  if (reels.some((r) => r.project_id !== projectId)) return { skipped: 'hermanas de proyectos distintos' };
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!p) return { skipped: 'no existe el proyecto' };
  if (p.demo) return { skipped: 'proyecto de demostración' };
  const weights = weightsOf(p.score_weights);
  const eds = [];
  // las hermanas que nunca se publicaron (rechazadas, sin programar) quedan afuera; las publicadas tienen que tener todas 48 h de datos
  for (const [i, r] of reels.entries()) {
    const publicados = db.prepare("SELECT po.id, po.scheduled_at, po.published_at, a.network FROM posts po LEFT JOIN accounts a ON a.id = po.account_id WHERE po.reel_id = ? AND po.published_at IS NOT NULL AND po.published_at != ''").all(r.id);
    if (!publicados.length) continue;
    const posts = publicados.filter((po) => minutes(now) - minutes(po.published_at) >= MIN_DATA_HOURS * 60);
    const scores = [], hours = [];
    for (const po of posts) {
      const m = db.prepare("SELECT * FROM post_metrics WHERE post_id = ? AND views IS NOT NULL AND note != 'pauta' ORDER BY id DESC LIMIT 1").get(po.id);
      if (!m) continue;
      scores.push(score(m, weights));
      if (po.network) hours.push({ network: po.network, hour: `${String(po.scheduled_at || po.published_at).slice(11, 13)}:00` });
    }
    if (!scores.length) return { skipped: `la versión ${i + 1} todavía no tiene ${MIN_DATA_HOURS} h de datos` }; // la comparación es definitiva: se espera
    eds.push({ n: i + 1, reel_id: r.id, recipe: parse(r.recipe), vars: recipeVars(parse(r.recipe)), score: scores.reduce((a, b) => a + b, 0) / scores.length, hours });
  }
  if (eds.length < 2) return { skipped: 'menos de 2 hermanas publicadas' };
  const sorted = [...eds].sort((a, b) => b.score - a.score || a.reel_id - b.reel_id);
  const winner = sorted[0], others = eds.filter((e) => e !== winner);
  const diff = Math.round((winner.score - sorted[1].score) * 10000) / 10000;
  let hypothesis;
  try { hypothesis = await (deps.hypothesize || sonnetHypothesis)({ clip_id: clipId, winner, others }); } catch { hypothesis = ''; }
  if (!hypothesis || typeof hypothesis !== 'string') hypothesis = plainHypothesis({ winner, others });
  // guardar todo junto; si otra corrida ya comparó este recorte, no se suma dos veces
  db.exec('BEGIN');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO comparisons (project_id, clip_id, winner_reel_id, winner_recipe, diff, scores, hypothesis) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, clipId, winner.reel_id, JSON.stringify(winner.recipe || {}), diff, JSON.stringify(eds.map((e) => ({ reel_id: e.reel_id, score: Math.round(e.score * 10000) / 10000 }))), hypothesis.slice(0, 2000));
    if (ins.changes) {
      const add = db.prepare("INSERT INTO learnings (project_id, variable, value, network, wins, trials, origin) VALUES (?, ?, ?, ?, ?, 1, 'comparacion')");
      for (const e of eds) {
        const w = e === winner ? 1 : 0;
        for (const [variable, value] of Object.entries(e.vars)) add.run(projectId, variable, value, null, w);
        for (const h of new Map(e.hours.map((x) => [`${x.network}|${x.hour}`, x])).values()) add.run(projectId, 'horario', h.hour, h.network, w);
      }
    }
    db.exec('COMMIT');
    if (!ins.changes) return { skipped: 'ya comparado' };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { compared: true, winner_reel_id: winner.reel_id, diff, hypothesis };
}

// dentro del ciclo de 6 h: compara los recortes que ya se pueden comparar (sin demos); un error en uno no frena a los otros
export async function memoryCycle(db, deps = {}) {
  const clips = db.prepare(`SELECT DISTINCT r.clip_id FROM reels r JOIN projects p ON p.id = r.project_id
    WHERE p.demo = 0 AND r.kind = 'listo' AND r.clip_id IS NOT NULL AND r.clip_id != ''
      AND NOT EXISTS (SELECT 1 FROM comparisons c WHERE c.clip_id = r.clip_id)
      AND EXISTS (SELECT 1 FROM posts po WHERE po.reel_id = r.id AND po.published_at IS NOT NULL AND po.published_at != '')
    GROUP BY r.clip_id HAVING count(DISTINCT r.id) >= 2`).all();
  let compared = 0;
  for (const { clip_id } of clips) {
    try { if ((await compareSiblings(clip_id, { ...deps, db })).compared) compared++; } catch (e) { console.error('memoria:', e.message); }
  }
  return { compared };
}

// lo que muestra la pestaña Memoria
export function memoryOf(db, projectId) {
  const decisions = db.prepare('SELECT id, at, kind, target, data, reason FROM decisions WHERE project_id = ? ORDER BY id DESC LIMIT 50').all(projectId).map((d) => ({ ...d, data: parse(d.data) || {} }));
  const comparisons = db.prepare('SELECT id, clip_id, winner_reel_id, winner_recipe, diff, scores, hypothesis, created_at FROM comparisons WHERE project_id = ? ORDER BY id DESC LIMIT 30').all(projectId)
    .map((c) => ({ ...c, winner_recipe: parse(c.winner_recipe) || {}, scores: parse(c.scores) || [] }));
  return { decisions, comparisons, aprendizajes: learningsSummary(db, projectId), ganadoras: winningVariables(db, projectId) };
}

// la investigación del proyecto para el editor: fichas (título + texto), con tope de cantidad y de tamaño
export function investigationOf(db, projectId, { maxItems = 40, maxChars = 12000 } = {}) {
  const rows = db.prepare("SELECT kind, title, text FROM knowledge WHERE project_id = ? AND kind != 'publicacion' ORDER BY id DESC LIMIT ?").all(projectId, maxItems);
  const out = []; let used = 0;
  for (const r of rows) {
    const line = `${r.title}: ${String(r.text || '').replace(/\s+/g, ' ').slice(0, 500)}`;
    if (used + line.length > maxChars) break;
    out.push(line); used += line.length;
  }
  return out;
}
