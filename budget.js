// Matemática de la plata de la pauta. Todo lo que mueve dinero se decide acá, con código: nunca lo decide un modelo.
import { AD_NETWORKS } from './ads-iface.js';

const DAY = 864e5;
const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
const cents = (x) => Math.floor(Math.round((Number(x) || 0) * 1e6) / 1e4); // hacia abajo, nunca redondea para arriba
export const usd = (c) => c / 100;

// Tope diario: lo que queda al empezar el día ÷ los días que quedan (hoy incluido), nunca más de 2× el tope base
// (el base es el total repartido en todos los días de la pauta). `spent` incluye lo gastado hoy (`spentToday`).
export function dailyCap({ budget, spent = 0, from, to, today, spentToday = 0 }) {
  if (!to || !today || today > to) return 0;
  const left = dayNum(to) - dayNum(today) + 1;
  const remainingAtDawn = Math.max(0, (Number(budget) || 0) - Math.max(0, (Number(spent) || 0) - (Number(spentToday) || 0)));
  const base = remainingAtDawn / left;
  const total = from && from <= to ? dayNum(to) - dayNum(from) + 1 : left;
  const hardMax = 2 * ((Number(budget) || 0) / Math.max(1, total));
  return Math.floor(Math.min(base, hardMax) * 100) / 100;
}

export const MIN_SHARE = 10;
const STEP = 10; // puntos que puede moverse una red por ciclo
// Reparto de la plata entre redes, en porcentajes enteros que suman 100. Las apagadas reciben 0 y las habilitadas nunca bajan de 10.
// perf: puntaje por red ({meta: 0.4, ...}, null/ausente = sin dato). prev: reparto anterior.
export function splitNetworks({ enabled = {}, perf = {}, prev = null }) {
  const on = AD_NETWORKS.filter((n) => enabled[n]);
  const out = { meta: 0, youtube: 0, tiktok: 0 };
  if (!on.length) return out;
  if (on.length === 1) { out[on[0]] = 100; return out; }
  const even = Object.fromEntries(on.map((n) => [n, 100 / on.length]));
  let base = even;
  if (prev && on.every((n) => Number.isFinite(Number(prev[n])))) {
    const sum = on.reduce((a, n) => a + Number(prev[n]), 0);
    if (sum > 0) base = Object.fromEntries(on.map((n) => [n, (Number(prev[n]) / sum) * 100]));
  }
  const sc = on.map((n) => (Number.isFinite(Number(perf[n])) && perf[n] !== null ? Math.max(0, Number(perf[n])) : null));
  const known = sc.filter((x) => x !== null);
  let target = base;
  if (known.length && known.reduce((a, x) => a + x, 0) > 0) {
    const avg = known.reduce((a, x) => a + x, 0) / known.length;
    const val = sc.map((x) => (x === null ? avg : x));
    const tot = val.reduce((a, x) => a + x, 0), free = 100 - on.length * MIN_SHARE;
    target = Object.fromEntries(on.map((n, i) => [n, MIN_SHARE + (free * val[i]) / tot]));
  }
  const next = Object.fromEntries(on.map((n) => [n, Math.max(MIN_SHARE, base[n] + Math.max(-STEP, Math.min(STEP, target[n] - base[n])))]));
  const tot = on.reduce((a, n) => a + next[n], 0);
  for (const n of on) next[n] = (next[n] / tot) * 100;
  // el piso se reimpone tras normalizar y el resto se reparte entre las que están por encima
  for (let k = 0; k < 5; k++) {
    const low = on.filter((n) => next[n] < MIN_SHARE), hi = on.filter((n) => next[n] > MIN_SHARE);
    if (!low.length) break;
    const need = low.reduce((a, n) => a + (MIN_SHARE - next[n]), 0), room = hi.reduce((a, n) => a + (next[n] - MIN_SHARE), 0) || 1;
    for (const n of low) next[n] = MIN_SHARE;
    for (const n of hi) next[n] -= (need * (next[n] - MIN_SHARE)) / room;
  }
  // enteros que suman 100 (mayores restos)
  const fl = on.map((n) => ({ n, v: Math.floor(next[n] + 1e-9), r: next[n] - Math.floor(next[n] + 1e-9) }));
  let rest = 100 - fl.reduce((a, x) => a + x.v, 0);
  for (const x of [...fl].sort((a, b) => b.r - a.r)) { if (rest <= 0) break; x.v++; rest--; }
  for (const x of fl) out[x.n] = x.v;
  return out;
}

// Regla de corte: solo se juzga un anuncio con USD 5 gastados o 48 h al aire
export const canJudge = ({ spend, promotedHours }) => (Number(spend) || 0) >= 5 || (Number(promotedHours) || 0) >= 48;

// El único paso por donde pasa toda acción que gasta plata. Bajar o pausar siempre se permite.
// action: { kind, dailyUsd (presupuesto diario que se pide para el anuncio), currentUsd (el que tiene hoy, 0 si es nuevo) }
// state:  { remainingTotal (pauta total − gastado), cap (dailyCap de hoy), spentToday (ya gastado hoy por todos los anuncios, incluso los cortados),
//          committedOthers (suma diaria de los demás anuncios activos) }
// Devuelve { ok, usd, clamped, reason }. El pedido se baja a lo que entra en: lo que queda del total, el tope de hoy y 2× el tope base.
export function guardSpend(action, state) {
  const want = cents(action.dailyUsd), cur = cents(action.currentUsd);
  if (want <= 0 || want <= cur) return { ok: true, usd: usd(Math.max(0, want)), clamped: false, reason: '' };
  const others = cents(state.committedOthers);
  const limits = [['lo que queda de la pauta', cents(state.remainingTotal)], ['el tope diario (menos lo ya gastado hoy)', cents(state.cap) - cents(state.spentToday)]];
  if (state.baseCap !== undefined) limits.push(['el doble del tope base', 2 * cents(state.baseCap)]);
  let allowed = want, why = '';
  for (const [name, lim] of limits) if (lim - others < allowed) { allowed = lim - others; why = name; }
  allowed = Math.max(0, allowed);
  if (allowed <= 0) return { ok: false, usd: 0, clamped: true, reason: `sin lugar: ${why} ya está comprometido` };
  return { ok: true, usd: usd(allowed), clamped: allowed < want, reason: allowed < want ? `se bajó de USD ${usd(want)} a USD ${usd(allowed)} por ${why}` : '' };
}
