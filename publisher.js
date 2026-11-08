// Publicación automática: sube cada reel a su red por la API oficial cuando llega su hora.
import fs from 'node:fs';
import { getTikTokToken, getGoogleToken, bases } from './connections.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(who, url, opt = {}, timeout = 60000) {
  let res;
  try { res = await fetch(url, { ...opt, signal: AbortSignal.timeout(timeout) }); }
  catch (e) { throw new Error(e.name === 'TimeoutError' ? `${who} no respondió a tiempo.` : `No pudimos conectar con ${who}.`); }
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : {}; } catch { body = null; }
  if (res.ok && (!body || !body.error || body.error.code === 'ok')) return { body: body || {}, res };
  const msg = body?.error?.error_user_msg || body?.error?.message || body?.error_description || body?.error?.code || `error ${res.status}`;
  const err = new Error(`${who} respondió: ${msg}`); err.code = body?.error?.code || ''; throw err;
}
const form = (o) => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')));

// --- Instagram Reels (subida reanudable: el video va directo a Meta, sin link público) ---
async function instagram(c, file, caption, log) {
  const igId = c.instagramBusinessId;
  if (!igId) throw new Error('Falta el ID de Instagram: probá la conexión de la cuenta.');
  const size = fs.statSync(file).size;
  const { body: ct } = await call('Meta', `${bases().graph}/${igId}/media`, { method: 'POST', body: form({ media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true', access_token: c.pageAccessToken }) });
  log('contenedor creado');
  await call('Meta', ct.uri, { method: 'POST', headers: { Authorization: `OAuth ${c.pageAccessToken}`, offset: '0', file_size: String(size) }, body: fs.readFileSync(file) }, 600000);
  log('video subido');
  for (let i = 0; i < 60; i++) { // hasta 5 minutos procesando
    const { body: st } = await call('Meta', `${bases().graph}/${ct.id}?fields=status_code,status&access_token=${encodeURIComponent(c.pageAccessToken)}`);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`Meta no pudo procesar el video: ${st.status || st.status_code}`);
    if (i === 59) throw new Error('Meta tardó más de 5 minutos en procesar el video.');
    await sleep(5000);
  }
  const { body: pub } = await call('Meta', `${bases().graph}/${igId}/media_publish`, { method: 'POST', body: form({ creation_id: ct.id, access_token: c.pageAccessToken }) });
  let url = '';
  try { url = (await call('Meta', `${bases().graph}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(c.pageAccessToken)}`)).body.permalink || ''; } catch {}
  return { id: pub.id, url };
}

// --- Facebook: Reels de la Página ---
async function facebook(c, file, caption, log) {
  const size = fs.statSync(file).size;
  const { body: st } = await call('Meta', `${bases().graph}/${c.pageId}/video_reels`, { method: 'POST', body: form({ upload_phase: 'start', access_token: c.pageAccessToken }) });
  await call('Meta', st.upload_url || `${bases().rupload}/video-upload/v21.0/${st.video_id}`, { method: 'POST', headers: { Authorization: `OAuth ${c.pageAccessToken}`, offset: '0', file_size: String(size) }, body: fs.readFileSync(file) }, 600000);
  log('video subido');
  await call('Meta', `${bases().graph}/${c.pageId}/video_reels`, { method: 'POST', body: form({ upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description: caption, access_token: c.pageAccessToken }) });
  return { id: st.video_id, url: `https://www.facebook.com/reel/${st.video_id}` };
}

// --- YouTube Shorts (vertical y de menos de 3 minutos: YouTube lo trata como Short) ---
async function youtube(c, file, caption, log, title) {
  const token = await getGoogleToken(c);
  const size = fs.statSync(file).size;
  const base = (title || caption || 'Short').replace(/\s+/g, ' ').trim();
  const ytTitle = /#shorts/i.test(base) ? base.slice(0, 100) : base.slice(0, 92) + ' #shorts';
  const meta = { snippet: { title: ytTitle, description: caption, categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
  const { res } = await call('YouTube', `${bases().ytUpload}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/*' }, body: JSON.stringify(meta),
  });
  const loc = res.headers.get('location');
  if (!loc) throw new Error('YouTube no devolvió dónde subir el video.');
  const { body } = await call('YouTube', loc, { method: 'PUT', headers: { 'Content-Type': 'video/*', 'Content-Length': String(size) }, body: fs.readFileSync(file) }, 900000);
  log('video subido');
  return { id: body.id, url: body.id ? `https://youtube.com/shorts/${body.id}` : '' };
}

// --- TikTok (Content Posting API, subida directa del archivo) ---
// Las reglas de TikTok para publicar directo: la persona elige la privacidad (sin una elegida de antemano), decide si
// permite comentarios, dúos y stitch (apagados de entrada) y declara si es contenido comercial. Eso viaja en cada publicación.
const PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
export function tiktokOptions(o = {}) {
  return {
    privacy: PRIVACY.includes(o.privacy) ? o.privacy : '',
    allowComment: !!o.allowComment, allowDuet: !!o.allowDuet, allowStitch: !!o.allowStitch,
    brandOrganic: !!o.brandOrganic, brandContent: !!o.brandContent,
  };
}
async function tiktokAuth(c, save) {
  const token = await getTikTokToken(c, save);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
}
// lo que TikTok dice de la cuenta antes de publicar: nombre, foto, privacidades posibles y qué interacciones tiene apagadas
export async function tiktokCreator(c, save = () => {}) {
  const { body } = await call('TikTok', `${bases().tiktok}/v2/post/publish/creator_info/query/`, { method: 'POST', headers: await tiktokAuth(c, save), body: '{}' });
  const d = body.data || {};
  return { nickname: d.creator_nickname || '', username: d.creator_username || '', avatar: d.creator_avatar_url || '', privacyOptions: d.privacy_level_options || [],
    commentDisabled: !!d.comment_disabled, duetDisabled: !!d.duet_disabled, stitchDisabled: !!d.stitch_disabled, maxDuration: d.max_video_post_duration_sec || 0 };
}
async function tiktok(c, file, caption, log, _title, save, opts = {}) {
  const auth = await tiktokAuth(c, save);
  const o = tiktokOptions(opts);
  if (!o.privacy) throw new Error('Falta elegir quién puede ver el video en TikTok: abrí la publicación y elegí la privacidad.');
  if (o.brandContent && o.privacy === 'SELF_ONLY') throw new Error('TikTok no deja que el contenido de marca sea privado: elegí otra privacidad.');
  const { body: ci } = await call('TikTok', `${bases().tiktok}/v2/post/publish/creator_info/query/`, { method: 'POST', headers: auth, body: '{}' });
  const opciones = ci.data?.privacy_level_options || [];
  if (opciones.length && !opciones.includes(o.privacy)) throw new Error(`Esta cuenta de TikTok no permite esa privacidad (puede: ${opciones.join(', ')}).`);
  const size = fs.statSync(file).size;
  // TikTok: un solo pedazo hasta 64 MB; si no, pedazos de 10 MB y el último se lleva el resto
  const chunk = size <= 64 * 1024 * 1024 ? size : 10 * 1024 * 1024;
  const count = Math.max(1, Math.floor(size / chunk));
  const init = async (privacy) => (await call('TikTok', `${bases().tiktok}/v2/post/publish/video/init/`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ post_info: { title: caption.slice(0, 2200), privacy_level: privacy,
      disable_comment: !o.allowComment || !!ci.data?.comment_disabled, disable_duet: !o.allowDuet || !!ci.data?.duet_disabled, disable_stitch: !o.allowStitch || !!ci.data?.stitch_disabled,
      brand_content_toggle: o.brandContent, brand_organic_toggle: o.brandOrganic },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count } }),
  })).body;
  let privacy = o.privacy, aviso = '', ini;
  try { ini = await init(privacy); }
  catch (e) {
    // mientras TikTok no aprueba la app, solo deja publicar en privado
    if (!/unaudited_client_can_only_post_to_private_accounts|can only post to private/i.test(e.message + (e.code || '')) || privacy === 'SELF_ONLY') throw e;
    privacy = 'SELF_ONLY'; aviso = 'publicado como privado: la app de TikTok todavía no está aprobada';
    ini = await init(privacy);
  }
  const buf = fs.readFileSync(file);
  for (let i = 0; i < count; i++) {
    const a = i * chunk, b = i === count - 1 ? size : a + chunk;
    await call('TikTok', ini.data.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(b - a), 'Content-Range': `bytes ${a}-${b - 1}/${size}` }, body: buf.subarray(a, b) }, 600000);
  }
  log('video subido');
  const id = ini.data.publish_id;
  for (let i = 0; i < 36; i++) { // hasta 3 minutos
    const { body: st } = await call('TikTok', `${bases().tiktok}/v2/post/publish/status/fetch/`, { method: 'POST', headers: auth, body: JSON.stringify({ publish_id: id }) });
    const s = st.data?.status;
    if (s === 'PUBLISH_COMPLETE') return { id, url: '', note: aviso || (privacy === 'SELF_ONLY' ? 'publicado como privado (así lo elegiste)' : '') };
    if (s === 'FAILED') throw new Error(`TikTok no lo publicó: ${st.data?.fail_reason || 'sin motivo'}`);
    await sleep(5000);
  }
  return { id, url: '', note: aviso || 'TikTok lo sigue procesando' };
}

const PUBLISHERS = { instagram, facebook, youtube, tiktok };

export async function publish(network, creds, file, caption, title, save, log = () => {}, opts = {}) {
  const fn = PUBLISHERS[network];
  if (!fn) throw new Error('Red desconocida.');
  try { return await fn(creds, file, caption, log, title, save, opts); }
  catch (e) {
    let msg = e.message || 'Algo falló.';
    for (const v of Object.values(creds)) if (typeof v === 'string' && v.length > 12) msg = msg.split(v).join('••••');
    throw new Error(msg.replace(/\bEAA[A-Za-z0-9_-]{4,}/g, '••••'));
  }
}
