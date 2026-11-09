// Avisos a Gero por Telegram: manda los avisos anotados en `alerts` y el resumen diario.
// Sin TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID no hace nada (los avisos quedan anotados y se mandan cuando se configure, si tienen menos de 24 h).
// Dedupe, de lo más estricto a lo más suelto: addAlert anota un solo aviso por proyecto, tipo, clave y día; y acá, además, un aviso del mismo tipo,
// clave y proyecto no se manda si ya salió otro hace menos de 6 h (cruzando la medianoche el segundo se anota pero no se manda: queda sent_at = 'suprimida').
import { bases } from './connections.js';
import { mask } from './trace.js';
import { addAlert } from './alerts.js';
import { learningsSummary } from './memory.js';

export const DEDUPE_HOURS = 6;
export const MAX_AGE_HOURS = 24;       // un aviso que no se pudo mandar en 24 h ya no sirve: se deja
export const STALE_EDITOR_HOURS = 24;  // un crudo así de tiempo en una etapa del editor es un aviso
export const EDITOR_BUSY = ['en_cola', 'transcribiendo', 'buscando_momentos', 'editando', 'revisando'];

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const minutes = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0) / 6e4;
const shift = (s, hours) => { const t = new Date(minutes(s) * 6e4 + hours * 3600e3); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`; };

const creds = (deps) => ({ token: String(deps.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim(), chat: String(deps.chat ?? process.env.TELEGRAM_CHAT_ID ?? '').trim() });
export const telegramReady = (deps = {}) => { const c = creds(deps); return !!(c.token && c.chat); };

async function sendTelegram(token, chat, text) {
  const r = await fetch(`${bases().telegram}/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 4000) }), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram respondió ${r.status}`);
}

// Manda los avisos sin enviar. deps: { now?: 'YYYY-MM-DD HH:MM[:SS]' local, token?, chat? }. Devuelve { sent, suppressed, failed }.
export async function flushAlerts(db, deps = {}) {
  const out = { sent: 0, suppressed: 0, failed: 0 };
  const { token, chat } = creds(deps);
  if (!token || !chat) return out;
  const now = (typeof deps.now === 'function' ? deps.now() : deps.now) || stamp();
  const rows = db.prepare('SELECT a.id, a.project_id, a.kind, a.text, a.dedupe_key, p.name FROM alerts a LEFT JOIN projects p ON p.id = a.project_id WHERE a.sent_at IS NULL AND a.at >= ? ORDER BY a.id')
    .all(shift(now, -MAX_AGE_HOURS));
  const recent = db.prepare("SELECT 1 FROM alerts WHERE project_id IS ? AND kind = ? AND dedupe_key = ? AND sent_at GLOB '2*' AND sent_at >= ? AND id != ?");
  const mark = db.prepare('UPDATE alerts SET sent_at = ? WHERE id = ?');
  for (const a of rows) {
    if (recent.get(a.project_id ?? null, a.kind, a.dedupe_key || '', shift(now, -DEDUPE_HOURS), a.id)) { mark.run('suprimida', a.id); out.suppressed++; continue; }
    try {
      await sendTelegram(token, chat, `${a.name ? `[${a.name}] ` : ''}${a.text}`);
      mark.run(now.length === 16 ? now + ':00' : now, a.id); out.sent++;
    } catch (e) {
      out.failed++;
      console.error('telegram:', mask(e.message, [token, chat]));
      break; // sin red o con el token mal: se reintenta en la próxima vuelta, en orden
    }
  }
  return out;
}

// Anota un aviso y lo manda enseguida (si hay Telegram). Devuelve el id o null si ya estaba anotado hoy.
export async function alert(db, kind, projectId, text, deps = {}) {
  const id = addAlert(db, kind, projectId, text);
  if (id) await flushAlerts(db, deps).catch((e) => console.error('telegram:', mask(e.message)));
  return id;
}

const usd = (n) => `USD ${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',')}`;
const NETS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

// Resumen del día en 5 bloques: publicado, gastado, lo que queda, el ganador (y por qué) y lo aprendido. now: 'YYYY-MM-DD HH:MM' local.
export function dailySummary(db, projectId, now = stamp()) {
  const today = now.slice(0, 10);
  const p = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
  const pub = db.prepare(`SELECT a.network, count(*) n FROM posts po LEFT JOIN accounts a ON a.id = po.account_id
    WHERE po.project_id = ? AND po.status = 'publicado' AND substr(po.published_at, 1, 10) = ? GROUP BY a.network`).all(projectId, today);
  const total = pub.reduce((a, r) => a + r.n, 0);
  const publicado = total ? `${total} ${total === 1 ? 'publicación' : 'publicaciones'} (${pub.map((r) => `${NETS[r.network] || r.network || 'otra red'}: ${r.n}`).join(', ')}).` : 'ninguna publicación.';
  const promos = db.prepare('SELECT spend, spend_day, spend_day_start FROM promotions WHERE project_id = ?').all(projectId);
  const spent = promos.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const spentToday = promos.reduce((a, r) => a + (r.spend_day === today ? Math.max(0, (Number(r.spend) || 0) - (Number(r.spend_day_start) || 0)) : 0), 0);
  const budget = Number(db.prepare('SELECT budget FROM pauta WHERE project_id = ?').get(projectId)?.budget) || 0;
  const queda = budget > 0 ? `${usd(Math.max(0, budget - spent))} de ${usd(budget)} (ya se gastaron ${usd(spent)}).` : 'sin presupuesto de pauta cargado.';
  const c = db.prepare('SELECT hypothesis, diff, created_at FROM comparisons WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId);
  const ganador = c ? `${c.hypothesis || 'ganó una versión, sin explicación guardada.'} (comparación del ${String(c.created_at).slice(0, 10)}, diferencia de puntaje ${Number(c.diff).toFixed(2)}).`
    : 'todavía no hay ninguna comparación de versiones terminada.';
  const aprendido = learningsSummary(db, projectId).filter((l) => l.trials >= 1 && l.variable !== 'horario').sort((a, b) => b.rate - a.rate || b.trials - a.trials).slice(0, 3);
  const lo = aprendido.length ? aprendido.map((l) => `${l.variable} «${l.value}» (${Math.round(l.rate * 100)} % de victorias en ${Math.round(l.trials)} intentos)`).join('; ') + '.' : 'todavía no hay aprendizajes.';
  return [`Resumen del día ${today}${p ? ` de ${p.name}` : ''}`, `Publicado hoy: ${publicado}`, `Gastado hoy: ${usd(spentToday)}.`, `Queda de pauta: ${queda}`, `Ganador: ${ganador}`, `Aprendido: ${lo}`].join('\n');
}

// Crudos que llevan más de 24 h en una etapa del editor sin terminar: un aviso por proyecto (con el primero que se encuentre y cuántos más hay).
// now: Date. La hora de la etapa es reels.status_at (UTC, la pone ACM al cambiar de estado); si falta, la de creación.
export function editorAtrasado(db, now = new Date()) {
  const lim = new Date(now.getTime() - STALE_EDITOR_HOURS * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
  const rows = db.prepare(`SELECT r.id, r.project_id, r.title, r.status FROM reels r JOIN projects p ON p.id = r.project_id
    WHERE r.kind = 'crudo' AND p.demo = 0 AND r.status IN (${EDITOR_BUSY.map(() => '?').join(',')}) AND coalesce(nullif(r.status_at, ''), r.created_at) <= ? ORDER BY r.id`).all(...EDITOR_BUSY, lim);
  const by = new Map();
  for (const r of rows) (by.get(r.project_id) || by.set(r.project_id, []).get(r.project_id)).push(r);
  let n = 0;
  for (const [pid, list] of by) {
    const r = list[0], mas = list.length > 1 ? ` (y ${list.length - 1} más)` : '';
    if (addAlert(db, 'editor_atrasado', pid, `El crudo «${r.title}»${mas} lleva más de ${STALE_EDITOR_HOURS} h en «${r.status.replace(/_/g, ' ')}» sin terminar: revisá el editor.`)) n++;
  }
  return n;
}

// La cuenta se desconectó o la red le negó el permiso: aviso `cuenta` con la red y el usuario (nunca claves). Un solo aviso por proyecto y día.
export const AUTH_ERROR = /token|permiso|permission|autoriz|authori|unauthori|expir|invalid_grant|revoc|\b(401|403)\b|OAuth|no est[aá] conectada/i;
export function cuentaAlert(db, projectId, network, handle, msg) {
  const quien = `${NETS[network] || network}${handle ? ` (${handle})` : ''}`;
  return addAlert(db, 'cuenta', projectId, `La cuenta de ${quien} dejó de funcionar: ${mask(String(msg), []).slice(0, 200)} Reconectala en Cuentas.`);
}
