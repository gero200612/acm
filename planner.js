// Planificador del día del agente de marketing: reparte el banco de ediciones aprobadas entre las cuentas conectadas.
// planDay es puro (se prueba en el banco); planProject lo conecta con la base. Las reglas duras viven en rules.js (scheduleBlocked).
import { scheduleBlocked, NETWORK_CAPS, youtubeShare, WINDOW, bestSlots } from './rules.js';
import { addAlert } from './alerts.js';
import { winningVariables } from './memory.js';

const LIVE = new Set(['programado', 'publicando', 'publicado']);
const GRID = 15; // minutos
const OWN_GAP = 60; // minutos entre dos publicaciones de la misma cuenta
const hmMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const minHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const absMin = (at) => new Date(String(at).slice(0, 16).replace(' ', 'T') + ':00Z').getTime() / 6e4;

// 'YYYY-MM-DD HH:MM' (o ISO) de vencimiento; solo fecha = vale todo ese día. '' = no vence.
export function expiryOf(e) {
  const s = String(e || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
  return s.length <= 10 ? `${s} 23:59` : s.slice(0, 16).replace('T', ' ');
}

// El editor manda el vencimiento como ISO en UTC (con Z u offset); acá todo es hora local sin zona ('YYYY-MM-DD HH:MM' en ACM_TZ).
// Un ISO con zona se pasa a hora local; cualquier otra cosa (ya local, solo fecha, vacío) queda como vino.
export function localExpiry(v, tz = 'America/Argentina/Buenos_Aires') {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
}

// por qué una edición ya no se publica por vencida (null = vigente); lo usa el programador al publicar
export function expiredBlocked(expires_at, now) {
  const exp = expiryOf(expires_at);
  return exp && exp < String(now).slice(0, 16) ? `La edición venció el ${exp}: ya no se publica.` : null;
}

// ¿la edición todavía puede salir ese día? (no venció y le queda algún horario del día a repartir)
export function stillUsable(e, now, date) {
  const exp = expiryOf(e.expires_at);
  return !exp || (exp >= now && exp >= `${date} ${WINDOW[0]}`);
}

// puntaje de una edición: actualidad que vence pronto primero, después lo que dicen los aprendizajes
function scoreOf(ed, learnings, now) {
  let s = 0;
  const exp = expiryOf(ed.expires_at);
  if (exp) {
    const hours = (absMin(exp) - absMin(now)) / 60;
    if (hours <= 72) s += 100 - hours / 72 * 50; // cuanto antes vence, más arriba
  }
  const vars = (ed.recipe && typeof ed.recipe === 'object' ? ed.recipe : (() => { try { return JSON.parse(ed.recipe || 'null'); } catch { return null; } })())?.variables || {};
  for (const [k, v] of Object.entries(vars)) s += Number(learnings?.valores?.[k]?.[v]) || 0; // valores: {variable: {valor: puntaje 0..1}}
  return s;
}

// planDay({project, accounts, bank, existingPosts, learnings, date, now, youtubeQuota, activeProjects}) -> [{reel_id, account_id, scheduled_at}]
// accounts: [{id, network, status, posts_per_day}]; bank: ediciones [{id, clip_id, review, expires_at, recipe}]
// existingPosts: todas las publicaciones ya creadas de esas ediciones, de cualquier día [{reel_id, account_id, scheduled_at, status}]
// date 'YYYY-MM-DD' (el día a repartir); now 'YYYY-MM-DD HH:MM' local. Idempotente: solo agrega lo que falta.
export function planDay({ project, accounts = [], bank = [], existingPosts = [], learnings = {}, date, now, youtubeQuota = 100, activeProjects = 1, tz }) {
  const accs = accounts.filter((a) => a.status === 'conectada');
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const cand = bank.filter((e) => e.review === 'aprobado' && stillUsable(e, now, date))
    .map((e) => ({ e, score: scoreOf(e, learnings, now) }))
    .sort((a, b) => b.score - a.score || a.e.id - b.e.id).map((x) => x.e);

  const posts = existingPosts.map((p) => ({ ...p, network: byId.get(p.account_id)?.network }));
  const usedNet = new Set(posts.map((p) => `${p.reel_id}|${p.network}`)); // una edición, una vez por red (haya salido o no)
  const bySlot = new Map(); // account_id -> horarios (min absolutos) ocupados
  const dayCount = new Map(); // account_id -> cuántas hay ese día
  let ytDay = 0;
  const clipOf = new Map(bank.map((e) => [e.id, e.clip_id]));
  const sibs = new Map(); // clip_id -> [{network, scheduled_at, account_id}] vivos
  for (const p of posts) {
    if (!LIVE.has(p.status || 'programado')) continue;
    const day = String(p.scheduled_at).slice(0, 10) === date;
    if (day) { dayCount.set(p.account_id, (dayCount.get(p.account_id) || 0) + 1); if (p.network === 'youtube') ytDay++; }
    if (!bySlot.has(p.account_id)) bySlot.set(p.account_id, []);
    bySlot.get(p.account_id).push(absMin(p.scheduled_at));
    const c = clipOf.get(p.reel_id);
    if (c) { if (!sibs.has(c)) sibs.set(c, []); sibs.get(c).push({ network: p.network, scheduled_at: String(p.scheduled_at).slice(0, 16), account_id: p.account_id }); }
  }
  const ytCap = youtubeShare(youtubeQuota, activeProjects);

  // horarios ideales: aprendido (de mejor a peor, por cercanía) o repartido parejo en la ventana y escalonado entre cuentas
  const lo = hmMin(WINDOW[0]), hi = hmMin(WINDOW[1]);
  const grid = []; for (let m = lo; m <= hi; m += GRID) grid.push(m);
  const nowMin = date === now.slice(0, 10) ? hmMin(now.slice(11, 16)) : -1;
  const sameNet = (net) => accs.filter((a) => a.network === net);
  const timesFor = (a, j) => {
    const learned = learnings?.horario?.[a.network];
    const ideal = /^\d{2}:\d{2}$/.test(learned || '') ? hmMin(learned) : lo + ((j + (sameNet(a.network).indexOf(a) + 0.5) / sameNet(a.network).length) / (a.posts_per_day || 3)) * (hi - lo);
    return grid.filter((m) => m > nowMin).sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal) || x - y);
  };

  const out = [];
  // intenta poner una edición en una cuenta: el primer horario (de mejor a peor) que cumple las reglas duras
  const place = (a, ed) => {
    const exp = expiryOf(ed.expires_at);
    let times = timesFor(a, dayCount.get(a.id) || 0);
    if (exp) { times = times.filter((m) => `${date} ${minHm(m)}` <= exp); if (exp.slice(0, 10) === date) times = times.sort((x, y) => x - y); } // lo que vence hoy sale lo antes posible
    for (const m of times) {
      const at = `${date} ${minHm(m)}`, abs = absMin(at);
      if ((bySlot.get(a.id) || []).some((x) => Math.abs(x - abs) < OWN_GAP)) continue;
      const why = scheduleBlocked({ reel_id: ed.id, account_id: a.id, network: a.network, scheduled_at: at, clip_id: ed.clip_id, review: ed.review },
        { siblings: (ed.clip_id && sibs.get(ed.clip_id)) || [], sameReelSameNetwork: false, dayCount: dayCount.get(a.id) || 0, networkCap: NETWORK_CAPS[a.network], tz });
      if (why) continue;
      out.push({ reel_id: ed.id, account_id: a.id, scheduled_at: at });
      usedNet.add(`${ed.id}|${a.network}`);
      dayCount.set(a.id, (dayCount.get(a.id) || 0) + 1);
      if (a.network === 'youtube') ytDay++;
      if (!bySlot.has(a.id)) bySlot.set(a.id, []);
      bySlot.get(a.id).push(abs);
      if (ed.clip_id) { if (!sibs.has(ed.clip_id)) sibs.set(ed.clip_id, []); sibs.get(ed.clip_id).push({ network: a.network, scheduled_at: at, account_id: a.id }); }
      return true;
    }
    return false;
  };
  const hasRoom = (a) => (dayCount.get(a.id) || 0) < (a.posts_per_day || 3) && !(a.network === 'youtube' && ytDay >= ytCap);
  const maxPpd = Math.max(0, ...accs.map((a) => a.posts_per_day || 3));
  for (let j = 0; j < maxPpd; j++) { // vuelta a vuelta entre cuentas: nadie se queda sin nada si el banco es corto
    for (const a of accs) {
      if (!hasRoom(a)) continue;
      for (const ed of cand) if (!usedNet.has(`${ed.id}|${a.network}`) && place(a, ed)) break;
    }
  }
  // segunda pasada: lo que quedó afuera por las separaciones busca cualquier cuenta con lugar
  for (const ed of cand) for (const a of accs) if (hasRoom(a) && !usedNet.has(`${ed.id}|${a.network}`) && place(a, ed)) break;
  return out;
}

// ---------- con la base ----------
export function initPlanner(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS plan_runs (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, date TEXT NOT NULL, bank_empty INTEGER DEFAULT 0, planned INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, date))`);
}

// lo que dicen los aprendizajes del proyecto: mejor horario por red y puntaje (0..1) por valor de cada variable
export function learningsOf(db, projectId) {
  const rows = db.prepare('SELECT variable, value, network, wins, trials FROM learnings WHERE project_id = ?').all(projectId);
  const valores = {};
  for (const r of rows) {
    if (r.variable === 'horario') continue; // el horario sale de las variables ganadoras (memoria)
    const v = (valores[r.variable] ||= {}); const t = (v[r.value] ||= { w: 0, n: 0 }); t.w += r.wins; t.n += r.trials;
  }
  for (const k of Object.keys(valores)) for (const x of Object.keys(valores[k])) valores[k][x] = (valores[k][x].w + 1) / (valores[k][x].n + 2); // suavizado: sin datos vale 0,5
  const horario = { ...(winningVariables(db, projectId).horario || {}) };
  // sin un horario aprendido por la memoria, la franja que más vistas da según lo ya publicado (si rinde al menos 15 % sobre lo normal)
  for (const [net, x] of Object.entries(bestSlotsOf(db, projectId))) {
    const top = x.slots?.[0];
    if (!horario[net] && top && top.lift >= BEST_MIN_LIFT) {
      const mid = Math.round((hmMin(top.from) + hmMin(top.to)) / 2 / GRID) * GRID;
      horario[net] = `${String(Math.floor(mid / 60)).padStart(2, '0')}:${String(mid % 60).padStart(2, '0')}`;
    }
  }
  return { horario, valores };
}
export const BEST_MIN_LIFT = 1.15;
// las vistas de lo ya publicado del proyecto (última medición de cada publicación), por franja y red
export function bestSlotsOf(db, projectId) {
  // sin la tabla de métricas (bases de prueba viejas) no hay de dónde sacar horarios
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'post_metrics'").get()) return {};
  const rows = db.prepare(`SELECT a.network, p.scheduled_at, COALESCE(m.views, m.reach) AS views FROM posts p JOIN accounts a ON a.id = p.account_id
    JOIN post_metrics m ON m.id = (SELECT max(id) FROM post_metrics WHERE post_id = p.id)
    WHERE p.project_id = ? AND p.status = 'publicado'`).all(projectId);
  return bestSlots(rows);
}

// Reparte el día de un proyecto y guarda las publicaciones. now = 'YYYY-MM-DD HH:MM' local. Devuelve lo programado.
export function planProject(db, projectId, { now, date, tz, youtubeQuota = Number(process.env.YOUTUBE_DAILY_QUOTA) || 100 } = {}) {
  const pr = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!pr || pr.demo) return [];
  const day = date || (now.slice(11, 16) > '22:30' ? new Date(absMin(now) * 6e4 + 864e5).toISOString().slice(0, 10) : now.slice(0, 10));
  const accounts = db.prepare('SELECT id, network, status, posts_per_day FROM accounts WHERE project_id = ?').all(projectId);
  const bank = db.prepare("SELECT id, clip_id, review, expires_at, recipe FROM reels WHERE project_id = ? AND kind = 'listo' AND review = 'aprobado' AND archived_at = ''").all(projectId);
  const existing = db.prepare('SELECT reel_id, account_id, scheduled_at, status FROM posts WHERE project_id = ?').all(projectId);
  const activeProjects = db.prepare("SELECT count(*) n FROM projects p WHERE p.demo = 0 AND EXISTS (SELECT 1 FROM accounts a WHERE a.project_id = p.id AND a.status = 'conectada')").get().n;
  const plan = planDay({ project: pr, accounts, bank, existingPosts: existing, learnings: learningsOf(db, projectId), date: day, now, youtubeQuota, activeProjects, tz });
  const ins = db.prepare('INSERT INTO posts (project_id, reel_id, account_id, scheduled_at) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  try { for (const p of plan) ins.run(projectId, p.reel_id, p.account_id, p.scheduled_at); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }

  // banco vacío: quedan lugares sin llenar y no hay ninguna edición que todavía pueda ir a alguna red conectada
  const used = new Set([...existing, ...plan].map((p) => `${p.reel_id}|${accounts.find((a) => a.id === p.account_id)?.network}`));
  const nets = [...new Set(accounts.filter((a) => a.status === 'conectada').map((a) => a.network))];
  const left = bank.some((e) => stillUsable(e, now, day) && nets.some((n) => !used.has(`${e.id}|${n}`)));
  const free = accounts.filter((a) => a.status === 'conectada').reduce((s, a) => s + Math.max(0, (a.posts_per_day || 3) - [...existing, ...plan].filter((p) => p.account_id === a.id && String(p.scheduled_at).slice(0, 10) === day && LIVE.has(p.status || 'programado')).length), 0);
  const empty = nets.length > 0 && !left && free > 0 ? 1 : 0;
  db.prepare('INSERT INTO plan_runs (project_id, date, bank_empty, planned) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, date) DO UPDATE SET bank_empty = excluded.bank_empty, planned = planned + excluded.planned')
    .run(projectId, day, empty, plan.length);
  if (empty) {
    const ayer = new Date(absMin(`${day} 00:00`) * 6e4 - 864e5).toISOString().slice(0, 10);
    if (db.prepare('SELECT bank_empty FROM plan_runs WHERE project_id = ? AND date = ?').get(projectId, ayer)?.bank_empty)
      addAlert(db, 'falta_material', projectId, `Se quedó sin ediciones aprobadas para ${pr.name}: dos días seguidos sin material para llenar las cuentas. Hay que cargar crudos o aprobar recortes.`, `${day} ${now.slice(11, 16)}:00`);
  }
  return plan;
}
