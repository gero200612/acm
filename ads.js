// Meta Ads: público personalizado con el padrón (solo huellas SHA-256) y campaña creada EN PAUSA para revisar.
import { bases } from './connections.js';

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
  throw new Error(`Meta respondió: ${body.error?.error_user_msg || body.error?.message || 'error ' + res.status}`);
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
