import { mask } from './trace.js';
// Interfaz de los adaptadores de pauta (los reales llegan con la Tarea 11; el banco usa falsos).
// Un adaptador por red de pauta: 'meta' (cubre publicaciones de Instagram y Facebook), 'youtube' y 'tiktok'.
//   ensureCampaign(project) -> { campaignId | null, listId? }   (Google: sin campaña por proyecto, solo la lista de Customer Match)
//   promote(post, dailyUsd) -> { adId }         (lanza AdRejected si la red rechaza el anuncio)
//   setBudget(adId, dailyUsd)
//   pause(adId)
//   (opcional) pauseOnly: true -> el adaptador solo pausa y lee; el ciclo no promociona ni cambia presupuestos con él
//   insights(adId) -> { spend, impressions, reach, target_reach | null }   (acumulados desde que arrancó)
export class AdRejected extends Error {}
// la red no puede promocionar ESTE post todavía (p. ej. falta el ID del video): se saltea en este ciclo, sin bloquear la red
export class AdSkip extends Error {}
export const AD_NETWORKS = ['meta', 'youtube', 'tiktok'];
// red de la cuenta -> red de pauta
export const adNetworkOf = (accountNetwork) => ({ instagram: 'meta', facebook: 'meta', youtube: 'youtube', tiktok: 'tiktok' })[accountNetwork] || null;

// Contexto que recibe cada adaptador (lo arma ads-factory.js; el banco arma uno de mentira):
//   creds: credenciales de pauta del proyecto (nunca se muestran)     project(): fila fresca del proyecto
//   state: { get(red) -> objeto, set(red, objeto) }                    endDate(): 'YYYY-MM-DD' (el menor entre fin de pauta y propaganda_until)
//   today(): 'YYYY-MM-DD'     accountCreds(redDeLaCuenta) -> credenciales de la cuenta conectada     videoId(postId) -> ID del video en la red
//   padron(): [{ em, ph }] (huellas SHA-256)
// Corte del lado de la red: el fin (end_time / schedule_end_time / end_date) y el presupuesto diario viajan SIEMPRE con el anuncio,
// así el gasto se detiene aunque un ciclo de 6 h llegue tarde.
export const endOfDay = (d) => `${d}T23:59:00-03:00`;

// fetch con tiempo máximo; los errores nunca llevan tokens
export async function callJson(who, url, opt = {}, secrets = []) {
  let res;
  try { res = await fetch(url, { ...opt, signal: AbortSignal.timeout(60000) }); }
  catch (e) { throw new Error(e.name === 'TimeoutError' ? `${who} no respondió a tiempo.` : `No pudimos conectar con ${who}.`); }
  const body = await res.json().catch(() => ({}));
  return { res, body, fail: (msg) => new Error(mask(`${who} respondió: ${msg}`, secrets)) };
}

// dólares -> moneda de la cuenta publicitaria
export function usdToLocal(project, usd) {
  const cur = project.ads_currency || '';
  if (!cur) throw new Error('Probá la cuenta publicitaria primero: no sabemos en qué moneda está.');
  if (cur === 'USD') return Number(usd);
  if (!(Number(project.ads_rate) > 0)) throw new Error(`La cuenta publicitaria está en ${cur}: cargá la cotización del dólar.`);
  return Number(usd) * Number(project.ads_rate);
}
export function localToUsd(project, amount) {
  const cur = project.ads_currency || 'USD';
  return cur === 'USD' || !(Number(project.ads_rate) > 0) ? Number(amount) || 0 : (Number(amount) || 0) / Number(project.ads_rate);
}
