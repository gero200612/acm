// Simulador de las APIs de Meta, TikTok y Google. Lo usa el banco de pruebas del Laboratorio (dentro del servidor)
// y se puede levantar solo con: node tools/simulador.mjs  (puerto 3999).
// Datos de prueba: Página PAGE1 (Instagram IG1), PAGEBAD devuelve un error con el token; TikTok con token TT_OK
// (cualquier otro se renueva); YouTube con cualquier dato; Meta Ads con la cuenta act_999.
import http from 'node:http';
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
export function startSimulator(port = 0) {
  const log = [];
  const adsets = new Map(), tt = { groups: 0 }, g = { campaigns: 0, budgets: 0, lists: 0 }; // anuncios de mentira
  const objects = new Map(); // R2 de mentira: bucket acm-test
  // modo desaprobación: IDs de anuncio (conjunto de Meta, grupo de TikTok, campaña de Google) que la red desaprueba DESPUÉS de crearlos
  const disapproved = new Set();
  let B = '';
  const server = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks); const u = new URL(req.url, B); const p = u.pathname;
    const params = req.headers['content-type']?.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(body.toString())) : {};
    log.push(`${req.method} ${p} ${body.length}b`);
    const ok = { error: { code: 'ok' } };
    if (p === '/log') return send(res, 200, log);
    // R2 (S3) de mentira: links firmados (X-Amz-Signature) o pedidos firmados del servidor (Authorization AWS4)
    if (p.startsWith('/acm-test/')) {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, HEAD', 'Access-Control-Allow-Headers': 'Content-Type' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
      const key = decodeURIComponent(p.slice('/acm-test/'.length));
      const signed = u.searchParams.has('X-Amz-Signature') || /^AWS4-HMAC-SHA256 /.test(req.headers.authorization || '');
      if (!signed) { res.writeHead(403); return res.end('sin firma'); }
      log.push(`r2 ${req.method} ${key}`);
      if (req.method === 'PUT') { objects.set(key, { body, type: req.headers['content-type'] || '' }); res.writeHead(200, { ETag: '"x"' }); return res.end(); }
      const o = objects.get(key);
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
      if (!o) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'video/mp4' });
      return res.end(req.method === 'HEAD' ? undefined : o.body);
    }
    // Meta
    if (p === '/graph/PAGEBAD') return send(res, 400, { error: { message: `Malformed access token ${u.searchParams.get('access_token')}` } });
    // cuentas vigiladas: business_discovery de una cuenta ajena (la 1.ª publicación, de ayer, rinde 6× lo normal)
    if (p === '/graph/IG1' && /business_discovery\.username\(/.test(u.searchParams.get('fields') || '')) {
      const user = (u.searchParams.get('fields').match(/business_discovery\.username\(([^)]+)\)/) || [])[1];
      if (user === 'no.existe') return send(res, 400, { error: { message: 'Invalid user id', code: 110 } });
      const day = (n) => new Date(Date.now() - n * 864e5).toISOString().replace(/\.\d+Z$/, '+0000');
      const media = Array.from({ length: 12 }, (_, i) => ({ id: `${user}-${i}`, caption: `Publicación ${i} de ${user}`, like_count: i === 0 ? 600 : 90 + i, comments_count: 10, timestamp: day(i + 1), permalink: `https://www.instagram.com/p/${user}${i}/`, media_type: 'VIDEO', media_product_type: 'REELS' }));
      return send(res, 200, { business_discovery: { username: user, followers_count: 20000, media: { data: media } }, id: 'IG1' });
    }
    if (p === '/graph/PAGE1' && req.method === 'GET') return send(res, 200, { name: 'Página Mock', followers_count: 999, instagram_business_account: { id: 'IG1', username: 'mock.ig', followers_count: 1234 } });
    if (p === '/graph/IG1/media') return params.upload_type === 'resumable' && params.media_type === 'REELS' ? send(res, 200, { id: 'C1', uri: `${B}/rup/ig/C1` }) : send(res, 400, { error: { message: 'faltan params' } });
    if (p === '/rup/ig/C1') return req.headers.authorization?.startsWith('OAuth ') && Number(req.headers.file_size) === body.length ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'subida mal: ' + req.headers.file_size + ' vs ' + body.length } });
    if (p === '/graph/C1') return send(res, 200, { status_code: 'FINISHED' });
    if (p === '/graph/IG1/media_publish') return params.creation_id === 'C1' ? send(res, 200, { id: 'M1' }) : send(res, 400, { error: { message: 'sin creation_id' } });
    if (p === '/graph/M1') return send(res, 200, { permalink: 'https://www.instagram.com/reel/M1/' });
    if (p === '/graph/PAGE1/video_reels') return params.upload_phase === 'start' ? send(res, 200, { video_id: 'V1', upload_url: `${B}/rup/fb/V1` }) : params.upload_phase === 'finish' && params.video_state === 'PUBLISHED' ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'fase' } });
    if (p === '/rup/fb/V1') return Number(req.headers.file_size) === body.length ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'tamaño' } });
    // TikTok
    if (p === '/tt/v2/user/info/') return ['Bearer TT_OK', 'Bearer TT_PUBLICA'].includes(req.headers.authorization) ? send(res, 200, { data: { user: { username: 'mock.tt', follower_count: 50 } }, ...ok }) : send(res, 401, { error: { code: 'access_token_invalid', message: 'vencido' } });
    if (p === '/tt/v2/oauth/token/') {
      if (params.grant_type === 'authorization_code') return params.code === 'TTCODE' && params.client_key === 'tt-app' && params.redirect_uri ? send(res, 200, { access_token: 'TT_OK', refresh_token: 'TT_R2', open_id: 'OPEN1', scope: 'user.info.basic,user.info.profile,user.info.stats,video.publish,video.upload' }) : send(res, 400, { error: 'invalid_grant', error_description: 'código o app incorrectos' });
      return send(res, 200, { access_token: 'TT_OK', refresh_token: 'TT_R2' });
    }
    // pantallas de autorizar (conectar con un clic): aprueban solas y vuelven con el código
    if (p === '/ttauth/v2/auth/authorize/' || p === '/gauth/o/oauth2/v2/auth') {
      const q = u.searchParams, back = new URL(q.get('redirect_uri'));
      if (q.get('client_key') !== 'tt-app' && q.get('client_id') !== 'g-app') return send(res, 400, { error: { message: 'app desconocida' } });
      back.searchParams.set('code', p.startsWith('/tt') ? 'TTCODE' : 'GCODE'); back.searchParams.set('state', q.get('state'));
      log.push(`authorize ${p.startsWith('/tt') ? 'tiktok' : 'google'} scope=${q.get('scope')} offline=${q.get('access_type') || ''}`);
      res.writeHead(302, { Location: back.toString() }); return res.end();
    }
    if (p === '/tt/v2/post/publish/creator_info/query/') return send(res, 200, { data: { creator_nickname: 'Cuenta Mock', creator_username: 'mock.tt', creator_avatar_url: 'https://example.com/a.png', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 }, ...ok });
    if (p === '/tt/v2/post/publish/video/init/') {
      const j = JSON.parse(body); log.push('ttinit ' + JSON.stringify(j.post_info));
      // como el Sandbox real: una app sin auditar solo publica en privado
      if (j.post_info?.privacy_level !== 'SELF_ONLY' || req.headers.authorization === 'Bearer TT_PUBLICA') return send(res, 403, { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines' } });
      return send(res, 200, { data: { publish_id: 'P1', upload_url: `${B}/tt-up` }, ...ok });
    }
    if (p === '/tt-up') return send(res, 201, {});
    if (p === '/tt/v2/post/publish/status/fetch/') return send(res, 200, { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['TV1'] }, ...ok });
    // Google
    if (p === '/goauth/token') {
      if (params.grant_type === 'authorization_code') return params.code === 'GCODE' && params.client_id === 'g-app' ? send(res, 200, { access_token: 'ya29.mock', refresh_token: 'G_REFRESH', scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' }) : send(res, 400, { error: 'invalid_grant', error_description: 'código o app incorrectos' });
      return params.client_id && params.refresh_token ? send(res, 200, { access_token: 'ya29.mock' }) : send(res, 400, { error: 'invalid_request', error_description: 'falta la app o el token' });
    }
    if (p === '/yt/youtube/v3/channels') return send(res, 200, { items: [{ snippet: { title: 'Canal Mock', customUrl: '@canalmock' }, statistics: { subscriberCount: '321' } }] });
    if (p === '/ytup/upload/youtube/v3/videos') return send(res, 200, {}, { Location: `${B}/ytup/put/1` });
    if (p === '/ytup/put/1') return send(res, 200, { id: 'Y1' });
    // Métricas por publicación (organicas). El ID BAD falla con un error que repite el token, para probar que no se muestra.
    if (/^\/graph\/(M1|V1|BAD)\/(insights|video_insights)$/.test(p)) {
      if (p.includes('/BAD/')) return send(res, 400, { error: { message: `Invalid OAuth access token ${u.searchParams.get('access_token')}` } });
      if (p === '/graph/M1/insights') return send(res, 200, { data: [['views', 1500], ['reach', 1100], ['ig_reels_avg_watch_time', 4500], ['likes', 90], ['comments', 12], ['shares', 8]].map(([name, value]) => ({ name, period: 'lifetime', values: [{ value }] })) });
      return send(res, 200, { data: [['blue_reels_play_count', 800], ['post_impressions_unique', 600], ['post_video_avg_time_watched', 3000]].map(([name, value]) => ({ name, period: 'lifetime', values: [{ value }] })) });
    }
    if (p === '/graph/V1' && req.method === 'GET') return send(res, 200, { likes: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } }, shares: { count: 3 } });
    if (p === '/yt/youtube/v3/videos' && req.method === 'GET') return u.searchParams.get('id') === 'YBAD' ? send(res, 403, { error: { message: 'quota' } }) : send(res, 200, { items: [{ id: u.searchParams.get('id'), statistics: { viewCount: '2000', likeCount: '150', commentCount: '20' } }] });
    if (p === '/ytan/v2/reports') return u.searchParams.get('filters') === 'video==YNOAN' ? send(res, 403, { error: { message: 'sin permiso de Analytics' } })
      : send(res, 200, { columnHeaders: [{ name: 'views' }, { name: 'averageViewDuration' }, { name: 'averageViewPercentage' }, { name: 'shares' }], rows: [[2000, 9, 60, 30]] });
    if (p === '/tt/v2/video/query/') { const j = JSON.parse(body); return j.filters?.video_ids?.[0] === 'TV1' ? send(res, 200, { data: { videos: [{ id: 'TV1', view_count: 5000, like_count: 400, comment_count: 30, share_count: 60 }] }, ...ok }) : send(res, 200, { data: { videos: [] }, ...ok }); }
    // Meta Ads
    if (p === '/graph/act_999' && req.method === 'GET') return send(res, 200, { name: 'Cuenta Mock', currency: 'ARS', account_status: 1 });
    if (p === '/graph/act_999/customaudiences') return send(res, 200, { id: 'AUD1' });
    if (p === '/graph/AUD1/usersreplace') { const j = JSON.parse(body); return send(res, 200, { num_received: j.payload.data.length, session_id: j.session.session_id }); }
    if (p === '/graph/act_999/campaigns' && req.method === 'POST') log.push('campaign ' + JSON.stringify({ name: params.name, sac: params.special_ad_categories }));
    if (p === '/graph/act_999/campaigns') return ['PAUSED', 'ACTIVE'].includes(params.status) ? send(res, 200, { id: 'CAMP1' }) : send(res, 400, { error: { message: 'estado inválido' } });
    if (p === '/graph/act_999/adsets') {
      log.push('adset ' + JSON.stringify({ b: params.lifetime_budget, db: params.daily_budget, s: params.start_time, e: params.end_time, f: params.frequency_control_specs, t: params.targeting }));
      const id = 'SET' + (adsets.size + 1); adsets.set(id, { daily_budget: params.daily_budget, end_time: params.end_time, status: params.status, targeting: params.targeting }); return send(res, 200, { id });
    }
    if (p === '/graph/act_999/adcreatives') return params.source_instagram_media_id === 'MBAD' ? send(res, 400, { error: { code: 368, message: 'El anuncio infringe las políticas (policy)' } })
      : params.source_instagram_media_id || params.object_story_id ? send(res, 200, { id: 'CR1' }) : send(res, 400, { error: { message: 'sin media' } });
    if (p === '/graph/act_999/ads') { log.push('ad ' + JSON.stringify({ name: params.name })); return send(res, 200, { id: 'AD1' }); }
    if (/^\/graph\/SET\d+\/ads$/.test(p) && req.method === 'GET') { const id = p.slice(7, -4); return send(res, 200, { data: [{ id: 'AD1', effective_status: disapproved.has(id) ? 'DISAPPROVED' : 'ACTIVE' }] }); }
    if (/^\/graph\/SET\d+$/.test(p) && req.method === 'POST') { const a = adsets.get(p.slice(7)); if (!a) return send(res, 404, { error: { message: 'no existe el conjunto' } }); Object.assign(a, params); log.push(`adset-update ${p.slice(7)} ${JSON.stringify(params)}`); return send(res, 200, { success: true }); }
    if (/^\/graph\/SET\d+\/insights$/.test(p)) return send(res, 200, { data: [{ spend: '30000', impressions: '8000', reach: '5000' }] });
    if (p === '/graph/CAMP1/insights') return send(res, 200, { data: [{ spend: '121000', impressions: '34000', reach: '21000' }] });
    // TikTok Ads (Marketing API): código 0 = bien; el anuncio del video TVBAD se rechaza por política
    if (p.startsWith('/ttads/v1.3/')) {
      const route = p.slice('/ttads/v1.3/'.length), ok0 = (data) => send(res, 200, { code: 0, message: 'OK', data });
      if (req.headers['access-token'] !== 'TTADS_OK') return send(res, 200, { code: 40105, message: 'Access-Token inválido' });
      const j = req.method === 'POST' ? JSON.parse(body) : {};
      log.push(`ttads ${route} ${JSON.stringify(req.method === 'POST' ? j : Object.fromEntries(u.searchParams))}`);
      if (route === 'advertiser/info/') return ok0({ list: [{ name: 'Anunciante Mock', currency: 'USD', status: 'STATUS_ENABLE' }] });
      if (route === 'campaign/create/') return ok0({ campaign_id: 'TTC1' });
      if (route === 'adgroup/create/') return j.budget > 0 && j.schedule_end_time ? ok0({ adgroup_id: 'TTG' + (++tt.groups) }) : send(res, 200, { code: 40002, message: 'falta presupuesto o fin de programación' });
      if (route === 'ad/create/') return j.creatives?.[0]?.tiktok_item_id === 'TVBAD' ? send(res, 200, { code: 40911, message: 'Ad rejected: violates advertising policy' }) : ok0({ ad_ids: ['TTA1'] });
      if (route === 'adgroup/budget/update/' || route === 'adgroup/status/update/') return ok0({});
      if (route === 'ad/get/') { const ids = JSON.parse(u.searchParams.get('filtering') || '{}').adgroup_ids || []; return ok0({ list: ids.map((id) => ({ ad_id: 'TTA1', adgroup_id: id, secondary_status: disapproved.has(id) ? 'AD_STATUS_REJECT' : 'AD_STATUS_DELIVERY_OK' })) }); }
      if (route === 'report/integrated/get/') return ok0({ list: [{ dimensions: { adgroup_id: 'TTG1' }, metrics: { spend: '7.50', impressions: '3000', reach: '2100' } }] });
      return send(res, 200, { code: 40001, message: 'mock: no conozco ' + route });
    }
    // Google Ads (REST): el video YBADPOL se rechaza por política
    if (p.startsWith('/gads/v18/customers/')) {
      const [cid, ...rest] = p.slice('/gads/v18/customers/'.length).split('/'), route = rest.join('/'), j = JSON.parse(body || '{}');
      if (req.headers.authorization !== 'Bearer ya29.mock' || req.headers['developer-token'] !== 'DEVTOK') return send(res, 401, { error: { message: 'credenciales de Google Ads inválidas' } });
      log.push(`gads ${route} ${JSON.stringify(j).slice(0, 600)}`);
      const rn = (kind, n) => `customers/${cid}/${kind}/${n}`;
      const op = j.operations?.[0] || {};
      if (route === 'googleAds:search' && /FROM ad_group_ad/.test(j.query)) { const camp = (j.query.match(/campaign\.id = (\d+)/) || [])[1]; return send(res, 200, { results: [{ adGroupAd: { policySummary: { approvalStatus: disapproved.has(camp) ? 'DISAPPROVED' : 'APPROVED' } } }] }); }
      if (route === 'googleAds:search') return /FROM customer/.test(j.query) ? send(res, 200, { results: [{ customer: { descriptiveName: 'Cuenta Google Mock', currencyCode: 'USD' } }] })
        : send(res, 200, { results: [{ metrics: { costMicros: '12500000', impressions: '4000', uniqueUsers: '2500' } }] });
      if (route === 'userLists:mutate') return send(res, 200, { results: [{ resourceName: rn('userLists', ++g.lists) }] });
      if (route === 'offlineUserDataJobs:create') return send(res, 200, { resourceName: rn('offlineUserDataJobs', 'J1') });
      if (/^offlineUserDataJobs\/J1:(addOperations|run)$/.test(route)) return send(res, 200, {});
      if (route === 'campaignBudgets:mutate') return send(res, 200, { results: [{ resourceName: op.update?.resourceName || rn('campaignBudgets', ++g.budgets) }] });
      if (route === 'campaigns:mutate') return send(res, 200, { results: [{ resourceName: op.update?.resourceName || rn('campaigns', 700 + ++g.campaigns) }] });
      if (route === 'adGroupAds:mutate') return JSON.stringify(op).includes('YBADPOL') ? send(res, 400, { error: { code: 400, message: 'El anuncio infringe una política', details: [{ errors: [{ errorCode: { policyViolationError: 'POLICY_ERROR' } }] }] } }) : send(res, 200, { results: [{ resourceName: rn('adGroupAds', 'AG1~AD1') }] });
      if (route === 'assets:mutate') return send(res, 200, { results: [{ resourceName: rn('assets', op.create?.youtubeVideoAsset?.youtubeVideoId || 1) }] });
      if (['campaignCriteria', 'adGroups', 'adGroupCriteria'].some((r) => route === r + ':mutate')) return send(res, 200, { results: [{ resourceName: rn(route.split(':')[0], 1) }] });
      return send(res, 404, { error: { message: 'mock: no conozco ' + route } });
    }
    // Telegram de mentira: cuenta los mensajes (token 123:ABC-bueno, cualquier otro da 401)
    if (/^\/telegram\/bot[^/]+\/sendMessage$/.test(p)) { const j = JSON.parse(body); if (!p.includes('bot123:ABC-bueno/')) return send(res, 401, { ok: false, description: 'Unauthorized' }); log.push('telegram ' + JSON.stringify({ chat: j.chat_id, text: j.text })); return send(res, 200, { ok: true, result: { message_id: log.length } }); }
    // Claude: responde citando la primera ficha, y si se le pide, se niega
    if (p === '/anthropic/v1/messages') {
      const j = JSON.parse(body); log.push('claude ' + JSON.stringify({ model: j.model, effort: j.output_config?.effort, fallbacks: j.fallbacks, beta: req.headers['anthropic-beta'], key: !!(req.headers['x-api-key'] || /^Bearer sk-ant-/.test(req.headers.authorization || '')), turns: j.messages.length }));
      const pregunta = String(j.messages.at(-1).content);
      const primera = (pregunta.match(/\[1\] \([^)]*\) ([^\n]+)/) || [])[1] || 'sin fichas';
      if (/NEGATE/.test(pregunta)) return send(res, 200, { id: 'msg_2', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } });
      return send(res, 200, { id: 'msg_1', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: `Según la investigación, ${primera} [1].` }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } });
    }
    send(res, 404, { error: { message: 'mock: no conozco ' + p } });
  });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    B = `http://127.0.0.1:${server.address().port}`;
    resolve({
      url: B, log, disapproved,
      bases: { graph: `${B}/graph`, rupload: `${B}/rup`, tiktok: `${B}/tt`, googleOauth: `${B}/goauth`, youtube: `${B}/yt`, youtubeAnalytics: `${B}/ytan`, ytUpload: `${B}/ytup`, tiktokAds: `${B}/ttads`, googleAds: `${B}/gads`, tiktokAuth: `${B}/ttauth`, googleAuth: `${B}/gauth`, anthropic: `${B}/anthropic`, telegram: `${B}/telegram`, r2: B },
      close: () => new Promise((r) => server.close(r)),
    });
  }));
}
