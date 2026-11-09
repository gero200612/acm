// Simulador de las APIs de Meta, TikTok y Google. Lo usa el banco de pruebas del Laboratorio (dentro del servidor)
// y se puede levantar solo con: node tools/simulador.mjs  (puerto 3999).
// Datos de prueba: Página PAGE1 (Instagram IG1), PAGEBAD devuelve un error con el token; TikTok con token TT_OK
// (cualquier otro se renueva); YouTube con cualquier dato; Meta Ads con la cuenta act_999.
import http from 'node:http';
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
export function startSimulator(port = 0) {
  const log = [];
  const objects = new Map(); // R2 de mentira: bucket acm-test
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
    if (p === '/tt/v2/post/publish/status/fetch/') return send(res, 200, { data: { status: 'PUBLISH_COMPLETE' }, ...ok });
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
    if (p === '/graph/act_999/campaigns') return params.status === 'PAUSED' ? send(res, 200, { id: 'CAMP1' }) : send(res, 400, { error: { message: 'no en pausa' } });
    if (p === '/graph/act_999/adsets') { log.push('adset ' + JSON.stringify({ b: params.lifetime_budget, s: params.start_time, e: params.end_time, f: params.frequency_control_specs, t: params.targeting })); return send(res, 200, { id: 'SET1' }); }
    if (p === '/graph/act_999/adcreatives') return params.source_instagram_media_id ? send(res, 200, { id: 'CR1' }) : send(res, 400, { error: { message: 'sin media' } });
    if (p === '/graph/act_999/ads') return send(res, 200, { id: 'AD1' });
    if (p === '/graph/CAMP1/insights') return send(res, 200, { data: [{ spend: '121000', impressions: '34000', reach: '21000' }] });
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
      url: B, log,
      bases: { graph: `${B}/graph`, rupload: `${B}/rup`, tiktok: `${B}/tt`, googleOauth: `${B}/goauth`, youtube: `${B}/yt`, youtubeAnalytics: `${B}/ytan`, ytUpload: `${B}/ytup`, tiktokAuth: `${B}/ttauth`, googleAuth: `${B}/gauth`, anthropic: `${B}/anthropic`, r2: B },
      close: () => new Promise((r) => server.close(r)),
    });
  }));
}
