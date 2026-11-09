// TikTok Ads (Marketing API v1.3): Spark Ads con el video orgánico ya publicado. Todo lo que depende de la forma de la API está acá,
// aislado para corregirlo sin tocar el resto. Credenciales de pauta del proyecto: ttAdvertiserId, ttAccessToken, ttIdentityId, ttBcId.
import { bases } from './connections.js';
import { AdRejected, AdSkip, callJson, endOfDay } from './ads-iface.js';

const V = 'v1.3';
const AR_LOCATION = '3865483'; // Argentina
// Rechazo de política: solo al crear el anuncio (ad/create). Por código de error de la API (40911 es el que usa el simulador; confirmar con la API real)
// y, de respaldo y solo en ese pedido, por el texto del mensaje. Cualquier otro error nunca bloquea la red.
const REJECT_CODES = new Set([40911]);
const REJECT = /reject|polic|violat|disapprov|prohibit/i;
export const isPolicyReject = (path, code, msg) => path === 'ad/create/' && (REJECT_CODES.has(code) || REJECT.test(msg));
// TikTok manda la fecha como 'YYYY-MM-DD HH:MM:SS' en UTC
const utc = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

export function tiktokAdapter(ctx) {
  const c = ctx.creds, secrets = [c.ttAccessToken];
  const call = async (method, path, params = {}) => {
    const url = `${bases().tiktokAds}/${V}/${path}`;
    const opt = { method, headers: { 'Access-Token': c.ttAccessToken } };
    let u = url;
    if (method === 'GET') u += '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])));
    else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(params); }
    const { res, body, fail } = await callJson('TikTok Ads', u, opt, secrets);
    if (res.ok && body.code === 0) return body.data || {};
    const msg = body.message || `error ${res.status}`;
    if (isPolicyReject(path, body.code, msg)) throw new AdRejected(fail(msg).message);
    throw fail(msg);
  };
  const adv = { advertiser_id: c.ttAdvertiserId };
  const ensureCampaign = async (project) => {
    const st = ctx.state.get('tiktok');
    if (st.campaignId) return { campaignId: st.campaignId };
    const p = project || ctx.project();
    const r = await call('POST', 'campaign/create/', { ...adv, campaign_name: `ACM · ${p.name}`, objective_type: 'REACH', budget_mode: 'BUDGET_MODE_INFINITE', operation_status: 'ENABLE' });
    ctx.state.set('tiktok', { ...st, campaignId: String(r.campaign_id) });
    return { campaignId: String(r.campaign_id) };
  };
  return {
    ensureCampaign,
    // el adId es el ID del grupo de anuncios (presupuesto diario y fin de la programación viven ahí)
    async promote(post, dailyUsd) {
      const video = ctx.videoId(post.id);
      // el external_id de TikTok es el publish_id: no sirve como ID de video. Sin ID de video se espera al próximo ciclo
      if (!video) throw new AdSkip('el video de TikTok todavía no tiene ID');
      const { campaignId } = await ensureCampaign();
      const end = ctx.endDate();
      if (!end) throw new Error('Falta la fecha de fin de la pauta.');
      const group = await call('POST', 'adgroup/create/', {
        ...adv, campaign_id: campaignId, adgroup_name: `ACM · post ${post.id}`, placement_type: 'PLACEMENT_TYPE_NORMAL', placements: ['PLACEMENT_TIKTOK'],
        budget_mode: 'BUDGET_MODE_DAY', budget: Number(dailyUsd.toFixed(2)),
        schedule_type: 'SCHEDULE_START_END', schedule_start_time: utc(new Date()), schedule_end_time: utc(endOfDay(end)),
        optimization_goal: 'REACH', billing_event: 'CPM', pacing: 'PACING_MODE_SMOOTH', location_ids: [AR_LOCATION], operation_status: 'ENABLE',
      });
      const groupId = String(group.adgroup_id);
      try {
        // Spark Ad: se usa el video orgánico de la cuenta vinculada (identidad autorizada en el Business Center)
        await call('POST', 'ad/create/', { ...adv, adgroup_id: groupId, creatives: [{
          ad_name: `ACM · post ${post.id}`, ad_format: 'SINGLE_VIDEO', tiktok_item_id: String(video),
          identity_type: 'BC_AUTH_TTO', identity_id: c.ttIdentityId, identity_authorized_bc_id: c.ttBcId,
        }] });
      } catch (e) { try { await this.pause(groupId); } catch {} throw e; }
      return { adId: groupId };
    },
    async setBudget(adId, dailyUsd) { await call('POST', 'adgroup/budget/update/', { ...adv, budget: [{ adgroup_id: adId, budget: Number(dailyUsd.toFixed(2)) }] }); },
    async pause(adId) { await call('POST', 'adgroup/status/update/', { ...adv, adgroup_ids: [adId], operation_status: 'DISABLE' }); },
    async insights(adId) {
      const r = await call('GET', 'report/integrated/get/', {
        ...adv, report_type: 'BASIC', data_level: 'AUCTION_ADGROUP', dimensions: ['adgroup_id'], metrics: ['spend', 'impressions', 'reach'],
        filtering: [{ field_name: 'adgroup_ids', filter_type: 'IN', filter_value: JSON.stringify([adId]) }], query_lifetime: true, page_size: 1,
      });
      const m = r.list?.[0]?.metrics || {};
      // TikTok no cruza el alcance con un público propio: sin dato de alcance dentro del padrón
      return { spend: Number(m.spend) || 0, impressions: Number(m.impressions) || 0, reach: Number(m.reach) || 0, target_reach: null };
    },
  };
}

export async function testTikTokAds(c) {
  if (!c.ttAdvertiserId || !c.ttAccessToken) throw new Error('Falta el ID del anunciante o el token de TikTok Ads.');
  const url = `${bases().tiktokAds}/${V}/advertiser/info/?` + new URLSearchParams({ advertiser_ids: JSON.stringify([c.ttAdvertiserId]), fields: JSON.stringify(['name', 'currency', 'status']) });
  const { res, body, fail } = await callJson('TikTok Ads', url, { headers: { 'Access-Token': c.ttAccessToken } }, [c.ttAccessToken]);
  if (!res.ok || body.code !== 0) throw fail(body.message || `error ${res.status}`);
  const a = body.data?.list?.[0];
  if (!a) throw new Error('TikTok Ads no devolvió la cuenta del anunciante.');
  if (a.status && a.status !== 'STATUS_ENABLE') throw new Error(`La cuenta «${a.name}» no está activa (${a.status}).`);
  return { name: a.name, currency: a.currency || 'USD' };
}
