// Meta Ads: público personalizado con el padrón (solo huellas SHA-256) y campaña creada EN PAUSA para revisar.
import { bases } from './connections.js';
import { AdRejected, endOfDay, usdToLocal, localToUsd } from './ads-iface.js';
import { mask } from './trace.js';

async function g(method, path, token, params = {}, json) {
  const url = `${bases().graph}/${path}`;
  const opt = { method, signal: AbortSignal.timeout(60000) };
  if (method === 'GET') {
    const q = new URLSearchParams({ ...params, access_token: token });
    return send(`${url}?${q}`, opt);
  }
  if (json) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify({ ...json, access_token: token }); }
  else opt.body = new URLSearchParams(Object.fromEntries(Object.entries({ ...params, access_token: token }).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])));
  return send(url, opt);
}
async function send(url, opt) {
  let res;
  try { res = await fetch(url, opt); } catch (e) { throw new Error(e.name === 'TimeoutError' ? 'Meta no respondió a tiempo.' : 'No pudimos conectar con Meta.'); }
  const body = await res.json().catch(() => ({}));
  if (res.ok && !body.error) return body;
  const err = new Error(`Meta respondió: ${body.error?.error_user_msg || body.error?.message || 'error ' + res.status}`);
  err.metaCode = body.error?.code;
  err.metaSub = body.error?.error_subcode;
  throw err;
}
const act = (id) => (String(id).startsWith('act_') ? String(id) : 'act_' + id);

export async function testAds(c) {
  if (!c.adAccountId || !c.accessToken) throw new Error('Falta el ID de la cuenta publicitaria o el token.');
  const a = await g('GET', act(c.adAccountId), c.accessToken, { fields: 'name,currency,account_status,timezone_name' });
  if (a.account_status !== 1) throw new Error(`La cuenta publicitaria «${a.name}» no está activa (estado ${a.account_status}).`);
  return { name: a.name, currency: a.currency };
}

// Sube el padrón: crea el público (o lo reemplaza) y manda las huellas en tandas de 10.000 dentro de una sesión.
export async function uploadAudience(c, name, rows, existingId) {
  let id = existingId;
  if (!id) id = (await g('POST', `${act(c.adAccountId)}/customaudiences`, c.accessToken, { name, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', description: 'Padrón cargado desde ACM (huellas SHA-256)' })).id;
  const B = 10000, total = Math.ceil(rows.length / B), session = Date.now();
  let received = 0;
  for (let i = 0; i < total; i++) {
    const r = await g('POST', `${id}/usersreplace`, c.accessToken, {}, {
      session: { session_id: session, batch_seq: i + 1, last_batch_flag: i === total - 1, estimated_num_total: rows.length },
      payload: { schema: ['EMAIL_SHA256', 'PHONE_SHA256'], data: rows.slice(i * B, (i + 1) * B).map((x) => [x.em || '', x.ph || '']) },
    });
    received += r.num_received || 0;
  }
  return { id, received };
}

// Campaña de alcance con tope de frecuencia, todo en pausa. Presupuesto total en la moneda de la cuenta.
export async function createCampaign(c, o) {
  const special = o.political ? ['ISSUES_ELECTIONS_POLITICS'] : [];
  const camp = await g('POST', `${act(c.adAccountId)}/campaigns`, c.accessToken, {
    name: o.name, objective: 'OUTCOME_AWARENESS', status: 'PAUSED', special_ad_categories: special, special_ad_category_country: o.political ? ['AR'] : [],
  });
  const adset = await g('POST', `${act(c.adAccountId)}/adsets`, c.accessToken, {
    name: `${o.name} · padrón`, campaign_id: camp.id, status: 'PAUSED',
    lifetime_budget: Math.round(o.budget * 100), start_time: o.start, end_time: o.end,
    billing_event: 'IMPRESSIONS', optimization_goal: 'REACH', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    frequency_control_specs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: Math.max(1, Math.ceil(o.perWeek)) }],
    targeting: { custom_audiences: [{ id: o.audienceId }], geo_locations: { countries: ['AR'] }, age_min: 18 },
  });
  const ads = [];
  for (const m of o.media) {
    const cr = await g('POST', `${act(c.adAccountId)}/adcreatives`, c.accessToken, {
      name: `${o.name} · ${m.title}`, object_id: c.pageId, instagram_user_id: c.instagramId, source_instagram_media_id: m.id,
    });
    const ad = await g('POST', `${act(c.adAccountId)}/ads`, c.accessToken, { name: m.title, adset_id: adset.id, creative: { creative_id: cr.id }, status: 'PAUSED' });
    ads.push(ad.id);
  }
  return { campaignId: camp.id, adsetId: adset.id, ads };
}

// Gasto real de una campaña (en la moneda de la cuenta publicitaria), con impresiones y alcance
export async function campaignInsights(c, id) {
  const r = await g('GET', `${id}/insights`, c.accessToken, { fields: 'spend,impressions,reach', date_preset: 'maximum' });
  const d = r.data?.[0] || {};
  return { spend: Number(d.spend) || 0, impressions: Number(d.impressions) || 0, reach: Number(d.reach) || 0 };
}

// ---- Adaptador del ciclo de marketing (interfaz de ads-iface.js): promociona una publicación que YA existe ----
// Rechazo de política: por código de error de Meta (368 = bloqueo temporal por infringir políticas) y, de respaldo y solo al crear el
// creativo o el anuncio, por el texto del mensaje. Cualquier otro error nunca bloquea la red.
export const isPolicyReject = (e, creating) => e.metaCode === 368 || (!!creating && /\bpolicy\b|pol[ií]ticas de (anuncios|publicidad)/i.test(e.message || ''));

export function metaAdapter(ctx) {
  const c = ctx.creds, secrets = [c.accessToken];
  const call = async (...a) => {
    try { return await g(...a); }
    catch (e) {
      const msg = mask(e.message, secrets);
      if (isPolicyReject(e, /\/(adcreatives|ads)$/.test(String(a[1])))) throw new AdRejected(msg);
      throw new Error(msg);
    }
  };
  const ensureCampaign = async (project) => {
    const st = ctx.state.get('meta');
    if (st.campaignId) return { campaignId: st.campaignId };
    const p = project || ctx.project(), pol = !!p.ads_political;
    const r = await call('POST', `${act(c.adAccountId)}/campaigns`, c.accessToken, {
      name: `ACM · ${p.name}`, objective: 'OUTCOME_AWARENESS', status: 'ACTIVE',
      special_ad_categories: pol ? ['ISSUES_ELECTIONS_POLITICS'] : [], special_ad_category_country: pol ? ['AR'] : [],
    });
    ctx.state.set('meta', { ...st, campaignId: r.id });
    return { campaignId: r.id };
  };
  return {
    ensureCampaign,
    // el adId es el ID del conjunto de anuncios: ahí viven el presupuesto diario, el fin y el pausado
    async promote(post, dailyUsd) {
      const p = ctx.project(), { campaignId } = await ensureCampaign(p);
      const acc = ctx.accountCreds(post.network) || {};
      const creative = post.network === 'facebook'
        ? { object_story_id: String(post.external_id).includes('_') ? post.external_id : `${acc.pageId}_${post.external_id}` }
        : { object_id: acc.pageId, instagram_user_id: acc.instagramBusinessId, source_instagram_media_id: post.external_id };
      const end = ctx.endDate();
      if (!end) throw new Error('Falta la fecha de fin de la pauta.');
      const cr = await call('POST', `${act(c.adAccountId)}/adcreatives`, c.accessToken, { name: `ACM · post ${post.id}`, ...creative });
      const targeting = { geo_locations: { countries: ['AR'] }, age_min: 18, ...(p.ads_audience_id ? { custom_audiences: [{ id: p.ads_audience_id }] } : {}) };
      const set = await call('POST', `${act(c.adAccountId)}/adsets`, c.accessToken, {
        name: `ACM · post ${post.id}`, campaign_id: campaignId, status: 'ACTIVE',
        daily_budget: Math.round(usdToLocal(p, dailyUsd) * 100), end_time: endOfDay(end),
        billing_event: 'IMPRESSIONS', optimization_goal: 'REACH', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting,
      });
      try { await call('POST', `${act(c.adAccountId)}/ads`, c.accessToken, { name: `ACM · post ${post.id}`, adset_id: set.id, creative: { creative_id: cr.id }, status: 'ACTIVE' }); }
      catch (e) { try { await call('POST', set.id, c.accessToken, { status: 'PAUSED' }); } catch {} throw e; }
      return { adId: set.id };
    },
    async setBudget(adId, dailyUsd) { await call('POST', adId, c.accessToken, { daily_budget: Math.round(usdToLocal(ctx.project(), dailyUsd) * 100) }); },
    async pause(adId) { await call('POST', adId, c.accessToken, { status: 'PAUSED' }); },
    async insights(adId) {
      const p = ctx.project();
      const r = await call('GET', `${adId}/insights`, c.accessToken, { fields: 'spend,impressions,reach', date_preset: 'maximum' });
      const d = r.data?.[0] || {}, reach = Number(d.reach) || 0;
      // con el público del padrón en la segmentación, todo el alcance cae dentro del padrón; sin él, no hay forma de saberlo
      return { spend: localToUsd(p, d.spend), impressions: Number(d.impressions) || 0, reach, target_reach: p.ads_audience_id ? reach : null };
    },
  };
}
