// Reglas compartidas entre el servidor y el banco de pruebas.

// Por qué no se publica una publicación que ya llegó a su hora (null = se puede publicar)
export function postBlocked(p) {
  if (p.propaganda_until && String(p.scheduled_at).slice(0, 10) > p.propaganda_until) return `Cae después del ${p.propaganda_until}, la fecha máxima de propaganda.`;
  if (p.acc_status === 'pausada') return 'La cuenta está pausada.';
  if (p.acc_status !== 'conectada') return 'La cuenta no está conectada: conectala y tocá Reintentar.';
  return null;
}

// Números de la pauta (los mismos que muestra la pestaña Pauta). Fechas YYYY-MM-DD.
export const PAUTA = { cpm: 6, match: 0.6, iva: 0.21 };
export function pautaNumbers({ budget, from, to, padron, contacts }) {
  const days = Math.max(1, Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / 864e5) + 1);
  const net = (Number(budget) || 0) / (1 + PAUTA.iva);
  const imps = net / PAUTA.cpm * 1000;
  const people = Math.round((contacts || padron || 0) * PAUTA.match);
  const freq = people ? imps / people : 0;
  return { days, net, imps, people, freq, perWeek: freq / Math.max(1, days / 7) };
}

// ---------- circuito: tipo de proyecto y reglas duras de publicación ----------
export const PROJECT_KINDS = ['club', 'politica', 'comercial'];
// TikTok no acepta pauta política: en un proyecto político arranca apagada
export function defaultAdsNetworks(kind) { return { meta: true, youtube: true, tiktok: kind !== 'politica' }; }

// tope diario de publicaciones por red (youtube: null = lo reparte youtubeShare según la cuota)
export const NETWORK_CAPS = { instagram: 100, facebook: 30, tiktok: 15, youtube: null };
export const youtubeShare = (totalQuota, activeProjects) => Math.floor((Number(totalQuota) || 0) / Math.max(1, Number(activeProjects) || 1));

export const SPACING_MIN = 180;            // misma red, hermanas del mismo recorte: 3 h entre una y otra
export const WINDOW = ['08:00', '23:00'];  // horario permitido, hora local (ambos extremos valen)
// hm = 'HH:MM' (o una fecha-hora local 'YYYY-MM-DD HH:MM'): ¿está dentro del horario de publicación?
export function withinWindow(hm) { const t = String(hm).slice(-5); return t >= WINDOW[0] && t <= WINDOW[1]; }
const toMin = (s) => new Date(String(s).replace(' ', 'T') + ':00Z').getTime() / 6e4; // 'YYYY-MM-DD HH:MM' como minutos (la hora local no cambia con el huso)

// Por qué no se puede programar (o publicar) esta publicación (null = se puede). Pura: todo lo que necesita viene en ctx.
// post = {reel_id, account_id, network, scheduled_at 'YYYY-MM-DD HH:MM' local, clip_id, review}
// ctx = {siblings:[{network, scheduled_at, account_id}], sameReelSameNetwork, dayCount, networkCap, tz}
export function scheduleBlocked(post, ctx = {}) {
  const at = String(post.scheduled_at || '').slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at)) return 'La fecha no es válida.';
  if (post.review !== 'aprobado') return 'El recorte todavía no está aprobado: aprobalo antes de programarlo.';
  const hm = at.slice(11);
  if (!withinWindow(hm)) return `Solo se publica entre las ${WINDOW[0]} y las ${WINDOW[1]} (hora de Argentina).`;
  if (ctx.sameReelSameNetwork) return 'El mismo reel en dos cuentas de la misma red hace que la red las bloquee.';
  for (const s of ctx.siblings || []) {
    if (s.network !== post.network) continue;
    const gap = Math.abs(toMin(at) - toMin(String(s.scheduled_at).slice(0, 16)));
    if (gap < SPACING_MIN) return `Tiene que haber al menos 3 horas entre las versiones del mismo recorte en la misma red (la otra sale ${String(s.scheduled_at).slice(0, 16)}).`;
  }
  if (ctx.networkCap != null && (ctx.dayCount || 0) >= ctx.networkCap) return `Ya se llegó al tope de ${ctx.networkCap} publicaciones por día en esta red.`;
  return null;
}

// Modo de revisión de los recortes. `decisiones` son las decisiones de Gero sobre recortes, de la más nueva a la más vieja
// ('aprobar' | 'rechazar'; rechazar una o más ediciones del recorte cuenta como rechazo).
// manual → auto con 19 de los últimos 20 recortes aprobados; en auto, un rechazo lo vuelve a manual.
export const REVIEW_WINDOW = 20, REVIEW_MIN_OK = 19;
export function reviewMode(current, decisiones = []) {
  if (current === 'auto') return decisiones[0] === 'rechazar' ? 'manual' : 'auto';
  const last = decisiones.slice(0, REVIEW_WINDOW);
  return last.length >= REVIEW_WINDOW && last.filter((d) => d === 'aprobar').length >= REVIEW_MIN_OK ? 'auto' : 'manual';
}
