// Simulador de las APIs de Meta, TikTok y Google para probar la publicación sin cuentas reales.
// Uso: node tools/simulador.mjs  y levantar ACM con ACM_GRAPH_URL=http://localhost:3999/graph ACM_RUPLOAD_URL=http://localhost:3999/rup
//      ACM_TIKTOK_URL=http://localhost:3999/tt ACM_GOOGLE_OAUTH_URL=http://localhost:3999/goauth ACM_YOUTUBE_URL=http://localhost:3999/yt ACM_YT_UPLOAD_URL=http://localhost:3999/ytup
// Datos de prueba: Página PAGE1 (Instagram IG1); TikTok con token TT_OK (cualquier otro se renueva); YouTube con cualquier dato.
import http from 'node:http';
const B = 'http://localhost:3999';
const log = [];
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks); const u = new URL(req.url, B); const p = u.pathname;
    const params = req.headers['content-type']?.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(body.toString())) : {};
    log.push(`${req.method} ${p} ${body.length}b`);
    const ok = { error: { code: 'ok' } };
    if (p === '/log') return send(res, 200, log);
    // Meta
    if (p === '/graph/PAGE1' && req.method === 'GET') return send(res, 200, { name: 'Página Mock', followers_count: 999, instagram_business_account: { id: 'IG1', username: 'mock.ig', followers_count: 1234 } });
    if (p === '/graph/IG1/media') return params.upload_type === 'resumable' && params.media_type === 'REELS' ? send(res, 200, { id: 'C1', uri: `${B}/rup/ig/C1` }) : send(res, 400, { error: { message: 'faltan params' } });
    if (p === '/rup/ig/C1') return req.headers.authorization?.startsWith('OAuth ') && Number(req.headers.file_size) === body.length ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'subida mal: ' + req.headers.file_size + ' vs ' + body.length } });
    if (p === '/graph/C1') return send(res, 200, { status_code: 'FINISHED' });
    if (p === '/graph/IG1/media_publish') return params.creation_id === 'C1' ? send(res, 200, { id: 'M1' }) : send(res, 400, { error: { message: 'sin creation_id' } });
    if (p === '/graph/M1') return send(res, 200, { permalink: 'https://www.instagram.com/reel/M1/' });
    if (p === '/graph/PAGE1/video_reels') return params.upload_phase === 'start' ? send(res, 200, { video_id: 'V1', upload_url: `${B}/rup/fb/V1` }) : params.upload_phase === 'finish' && params.video_state === 'PUBLISHED' ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'fase' } });
    if (p === '/rup/fb/V1') return Number(req.headers.file_size) === body.length ? send(res, 200, { success: true }) : send(res, 400, { error: { message: 'tamaño' } });
    // TikTok
    if (p === '/tt/v2/user/info/') return req.headers.authorization === 'Bearer TT_OK' ? send(res, 200, { data: { user: { username: 'mock.tt', follower_count: 50 } }, ...ok }) : send(res, 401, { error: { code: 'access_token_invalid', message: 'vencido' } });
    if (p === '/tt/v2/oauth/token/') return send(res, 200, { access_token: 'TT_OK', refresh_token: 'TT_R2' });
    if (p === '/tt/v2/post/publish/creator_info/query/') return send(res, 200, { data: { privacy_level_options: ['SELF_ONLY'] }, ...ok });
    if (p === '/tt/v2/post/publish/video/init/') { const j = JSON.parse(body); return send(res, 200, { data: { publish_id: 'P1', upload_url: `${B}/tt-up` }, ...ok, _j: j }); }
    if (p === '/tt-up') return send(res, 201, {});
    if (p === '/tt/v2/post/publish/status/fetch/') return send(res, 200, { data: { status: 'PUBLISH_COMPLETE' }, ...ok });
    // Google
    if (p === '/goauth/token') return send(res, 200, { access_token: 'ya29.mock' });
    if (p === '/yt/youtube/v3/channels') return send(res, 200, { items: [{ snippet: { title: 'Canal Mock', customUrl: '@canalmock' }, statistics: { subscriberCount: '321' } }] });
    if (p === '/ytup/upload/youtube/v3/videos') return send(res, 200, {}, { Location: `${B}/ytup/put/1` });
    if (p === '/ytup/put/1') return send(res, 200, { id: 'Y1' });
    send(res, 404, { error: { message: 'mock: no conozco ' + p } });
  });
}).listen(3999, () => console.log('mock en 3999'));
