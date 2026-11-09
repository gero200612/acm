// Interfaz de los adaptadores de pauta (los reales llegan con la Tarea 11; el banco usa falsos).
// Un adaptador por red de pauta: 'meta' (cubre publicaciones de Instagram y Facebook), 'youtube' y 'tiktok'.
//   ensureCampaign(project) -> { campaignId }
//   promote(post, dailyUsd) -> { adId }         (lanza AdRejected si la red rechaza el anuncio)
//   setBudget(adId, dailyUsd)
//   pause(adId)
//   insights(adId) -> { spend, impressions, reach, target_reach | null }   (acumulados desde que arrancó)
export class AdRejected extends Error {}
export const AD_NETWORKS = ['meta', 'youtube', 'tiktok'];
// red de la cuenta -> red de pauta
export const adNetworkOf = (accountNetwork) => ({ instagram: 'meta', facebook: 'meta', youtube: 'youtube', tiktok: 'tiktok' })[accountNetwork] || null;
