// Google Ads (REST): el Short ya publicado en YouTube como anuncio de video, con lista de Customer Match del padrón.
// Aislado para poder corregir la forma de la API sin tocar el resto.
// Credenciales de pauta del proyecto: gCustomerId, gDeveloperToken, gRefreshToken, (gLoginCustomerId, gClientId, gClientSecret; si faltan, la app de Google de ACM).
// Diferencia con Meta/TikTok: el presupuesto diario de Google vive en la campaña, así que cada Short promocionado tiene su propia campaña
// (con su presupuesto y su end_date). Lo único que se reusa por proyecto ("ensureCampaign") es la lista de Customer Match.
import { bases, getGoogleToken } from './connections.js';
import { AdRejected, callJson, adName } from './ads-iface.js';

// solo el pedido que crea el anuncio puede ser un rechazo de política: cualquier otro error nunca bloquea la red
export const isPolicyReject = (path, txt) => path === 'adGroupAds:mutate' && /policyViolationError|policyFindingError|POLICY_/i.test(txt);

const API = 'v18';
const SUBTYPE = 'VIDEO_ACTION';
const micros = (usd) => Math.round(usd * 1e6);
const dash = (d) => String(d).slice(0, 10);       // 'YYYY-MM-DD' (la API pide el mismo formato con guiones)
const idOf = (resourceName) => String(resourceName).split('/').pop();

export function googleAdapter(ctx) {
  const c = ctx.creds, secrets = [c.gRefreshToken, c.gDeveloperToken, c.gClientSecret];
  const cid = String(c.gCustomerId || '').replace(/-/g, '');
  const token = () => getGoogleToken({ clientId: c.gClientId, clientSecret: c.gClientSecret, refreshToken: c.gRefreshToken });
  const call = async (path, body) => {
    const headers = { Authorization: `Bearer ${await token()}`, 'developer-token': c.gDeveloperToken, 'Content-Type': 'application/json' };
    if (c.gLoginCustomerId) headers['login-customer-id'] = String(c.gLoginCustomerId).replace(/-/g, '');
    const { res, body: out, fail } = await callJson('Google Ads', `${bases().googleAds}/${API}/${path.startsWith('customers/') ? path : `customers/${cid}/${path}`}`, { method: 'POST', headers, body: JSON.stringify(body) }, secrets);
    if (res.ok) return out;
    const txt = JSON.stringify(out.error || {});
    const msg = out.error?.message || `error ${res.status}`;
    if (isPolicyReject(path, txt)) throw new AdRejected(fail(msg).message);
    throw fail(msg);
  };
  const mutate = async (resource, operation) => (await call(`${resource}:mutate`, { operations: [operation] })).results?.[0]?.resourceName;

  // lista de Customer Match con las huellas del padrón (solo hashedEmail / hashedPhoneNumber)
  const uploadList = async (name, rows) => {
    const list = await mutate('userLists', { create: { name, membershipLifeSpan: 10000, crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' } } });
    const job = (await call('offlineUserDataJobs:create', { job: { type: 'CUSTOMER_MATCH_USER_LIST', customerMatchUserListMetadata: { userList: list } } })).resourceName;
    const B = 10000;
    for (let i = 0; i < rows.length; i += B) {
      const operations = rows.slice(i, i + B).map((x) => ({ create: { userIdentifiers: [x.em && { hashedEmail: x.em }, x.ph && { hashedPhoneNumber: x.ph }].filter(Boolean) } })).filter((o) => o.create.userIdentifiers.length);
      if (operations.length) await call(`${job}:addOperations`, { operations, enablePartialFailure: true });
    }
    await call(`${job}:run`, {});
    return list;
  };

  // Google no tiene "una campaña por proyecto": cada Short lleva la suya. Lo que se reusa es la lista de Customer Match del padrón.
  // Devuelve { campaignId: null, listId }; listId es null mientras no haya padrón cargado (se arma apenas aparece).
  const ensureCampaign = async (project) => {
    const st = ctx.state.get('youtube');
    if (st.userList) return { campaignId: null, listId: idOf(st.userList) };
    const rows = ctx.padron();
    if (!rows.length) return { campaignId: null, listId: null };
    const list = await uploadList(`ACM · ${(project || ctx.project()).name} · padrón`, rows);
    ctx.state.set('youtube', { ...st, userList: list });
    return { campaignId: null, listId: idOf(list) };
  };

  return {
    _search: (query) => call('googleAds:search', { query }),
    ensureCampaign,
    // el adId es "campaña:presupuesto" (la campaña lleva el end_date, el presupuesto diario y el estado)
    async promote(post, dailyUsd) {
      await ensureCampaign();
      const st = ctx.state.get('youtube'), end = ctx.endDate(), p = ctx.project();
      if (!end) throw new Error('Falta la fecha de fin de la pauta.');
      const videoId = post.external_id;
      const budget = await mutate('campaignBudgets', { create: { name: `${adName(post)} · ${Date.now()}`, amountMicros: micros(dailyUsd), deliveryMethod: 'STANDARD', explicitlyShared: false } });
      const campaign = await mutate('campaigns', { create: {
        name: `ACM · ${p.name} · ${adName(post).slice('ACM · '.length)}`, advertisingChannelType: 'VIDEO', advertisingChannelSubType: SUBTYPE, status: 'ENABLED',
        campaignBudget: budget, startDate: ctx.today(), endDate: dash(end),
        // con lista, los anuncios salen SOLO para el padrón
        ...(st.userList ? { targetingSetting: { targetRestrictions: [{ targetingDimension: 'AUDIENCE', bidOnly: false }] } } : {}),
      } });
      try {
        await mutate('campaignCriteria', { create: { campaign, location: { geoTargetConstant: 'geoTargetConstants/2032' } } });  // Argentina
        const group = await mutate('adGroups', { create: { name: adName(post), campaign, status: 'ENABLED', type: 'VIDEO_RESPONSIVE' } });
        if (st.userList) await mutate('adGroupCriteria', { create: { adGroup: group, userList: { userList: st.userList } } });
        const asset = await mutate('assets', { create: { youtubeVideoAsset: { youtubeVideoId: videoId } } });
        await mutate('adGroupAds', { create: { adGroup: group, status: 'ENABLED', ad: { name: adName(post), videoResponsiveAd: { videos: [{ asset }] } } } });
      } catch (e) { try { await mutate('campaigns', { update: { resourceName: campaign, status: 'PAUSED' }, updateMask: 'status' }); } catch {} throw e; }
      return { adId: `${idOf(campaign)}:${idOf(budget)}` };
    },
    async setBudget(adId, dailyUsd) {
      const [, budget] = adId.split(':');
      await mutate('campaignBudgets', { update: { resourceName: `customers/${cid}/campaignBudgets/${budget}`, amountMicros: micros(dailyUsd) }, updateMask: 'amountMicros' });
    },
    async pause(adId) {
      const [campaign] = adId.split(':');
      await mutate('campaigns', { update: { resourceName: `customers/${cid}/campaigns/${campaign}`, status: 'PAUSED' }, updateMask: 'status' });
    },
    async insights(adId) {
      const [campaign] = adId.split(':');
      const r = await call('googleAds:search', { query: `SELECT metrics.cost_micros, metrics.impressions, metrics.unique_users FROM campaign WHERE campaign.id = ${Number(campaign)}` });
      const m = r.results?.[0]?.metrics || {}, reach = Number(m.uniqueUsers) || 0;
      const out = { spend: (Number(m.costMicros) || 0) / 1e6, impressions: Number(m.impressions) || 0, reach, target_reach: ctx.state.get('youtube').userList ? reach : null };
      // la revisión de políticas es asincrónica: el anuncio puede quedar DISAPPROVED después de creado
      try {
        const a = await call('googleAds:search', { query: `SELECT ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.id = ${Number(campaign)}` });
        if ((a.results || []).some((x) => x.adGroupAd?.policySummary?.approvalStatus === 'DISAPPROVED')) out.rejected = 'Google Ads desaprobó el anuncio (DISAPPROVED)';
      } catch (e) { out.status_error = e.message; }
      return out;
    },
  };
}

export async function testGoogleAds(c) {
  if (!c.gCustomerId || !c.gDeveloperToken || !c.gRefreshToken) throw new Error('Falta el ID de cliente, el token de desarrollador o el token de renovación de Google Ads.');
  const ctx = { creds: c, state: { get: () => ({}), set() {} }, project: () => ({}), padron: () => [] };
  const a = googleAdapter(ctx);
  const r = await a._search('SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
  const cu = r.results?.[0]?.customer;
  if (!cu) throw new Error('Google Ads no devolvió la cuenta.');
  return { name: cu.descriptiveName, currency: cu.currencyCode };
}
