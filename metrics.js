// Métricas por publicación (orgánicas): se leen de cada red, se guardan una fila por lectura y se resumen en un puntaje
// con pesos por proyecto. Cada red tiene su lector aparte para corregirlo sin tocar a las otras si la API cambia.
// Los campos spend, impressions y target_reach los completa el lado de la pauta (Tareas 10 y 11); acá quedan en 0.
import { getTikTokToken, getGoogleToken, bases } from './connections.js';
import { mask } from './trace.js';

export const DEFAULT_WEIGHTS = { target_reach_per_usd: 0.5, impressions_per_usd: 0.2, completion: 0.2, engagement: 0.1 };
export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS);

export function initMetrics(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  views INTEGER, reach INTEGER, avg_watch_s REAL, completion REAL, likes INTEGER, comments INTEGER, shares INTEGER,
  spend REAL DEFAULT 0, impressions INTEGER DEFAULT 0, target_reach INTEGER DEFAULT 0, note TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS post_metrics_post ON post_metrics(post_id, id);`);
}

// --- HTTP ---
async function getJson(who, url, opt = {}) {
  let res;
  try { res = await fetch(url, { ...opt, signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw new Error(e.name === 'TimeoutError' ? `${who} no respondió a tiempo.` : `No pudimos conectar con ${who}.`); }
  const text = await res.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (res.ok && !(body.error && body.error.code && body.error.code !== 'ok') && !(body.error && typeof body.error === 'string')) return body;
  const e = body.error;
  throw new Error(`${who} respondió: ${(typeof e === 'object' ? e?.message || e?.code : e) || `error ${res.status}`}`);
}
const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const completionOf = (avg, duration) => (num(avg) !== null && Number(duration) > 0 ? Math.min(1, Math.round((avg / duration) * 1000) / 1000) : null);

// --- un lector por red; todos devuelven {views, reach, avg_watch_s, completion, likes, comments, shares} (null = la red no lo da) ---
const READERS = {
  // Graph API: /{media-id}/insights (views, reach, ig_reels_avg_watch_time en milisegundos, likes, comments, shares)
  async instagram(c, id, o) {
    const q = new URLSearchParams({ metric: 'views,reach,ig_reels_avg_watch_time,likes,comments,shares', access_token: c.pageAccessToken });
    const r = await getJson('Meta', `${bases().graph}/${encodeURIComponent(id)}/insights?${q}`);
    const m = Object.fromEntries((r.data || []).map((x) => [x.name, num(x.values?.[0]?.value ?? x.total_value?.value)]));
    const avg = m.ig_reels_avg_watch_time === null || m.ig_reels_avg_watch_time === undefined ? null : m.ig_reels_avg_watch_time / 1000;
    return { views: m.views ?? null, reach: m.reach ?? null, avg_watch_s: avg, completion: completionOf(avg, o.duration), likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null };
  },
  // Reels de Página: /{video-id}/video_insights (tiempo medio en ms) y los conteos sociales del propio video
  async facebook(c, id, o) {
    const q = new URLSearchParams({ metric: 'blue_reels_play_count,post_impressions_unique,post_video_avg_time_watched', access_token: c.pageAccessToken });
    const r = await getJson('Meta', `${bases().graph}/${encodeURIComponent(id)}/video_insights?${q}`);
    const m = Object.fromEntries((r.data || []).map((x) => [x.name, num(x.values?.[0]?.value)]));
    const avg = m.post_video_avg_time_watched === null || m.post_video_avg_time_watched === undefined ? null : m.post_video_avg_time_watched / 1000;
    const f = new URLSearchParams({ fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares', access_token: c.pageAccessToken });
    const s = await getJson('Meta', `${bases().graph}/${encodeURIComponent(id)}?${f}`);
    return { views: m.blue_reels_play_count ?? null, reach: m.post_impressions_unique ?? null, avg_watch_s: avg, completion: completionOf(avg, o.duration),
      likes: num(s.likes?.summary?.total_count), comments: num(s.comments?.summary?.total_count), shares: num(s.shares?.count) };
  },
  // YouTube Data API (videos?part=statistics) y, para el tiempo de visualización, YouTube Analytics (si falla, se devuelve lo de Data con una nota)
  async youtube(c, id, o) {
    const token = await getGoogleToken(c);
    const h = { Authorization: `Bearer ${token}` };
    const d = await getJson('YouTube', `${bases().youtube}/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: h });
    const st = d.items?.[0]?.statistics;
    if (!st) throw new Error('YouTube no encontró el video.');
    const out = { views: num(st.viewCount), reach: null, avg_watch_s: null, completion: null, likes: num(st.likeCount), comments: num(st.commentCount), shares: null };
    // Analytics pide un permiso aparte que hoy no se pide (R16): solo con ACM_YT_ANALYTICS=1
    if (process.env.ACM_YT_ANALYTICS === '1') try {
      const day = (t) => new Date(t).toISOString().slice(0, 10);
      const q = new URLSearchParams({ ids: 'channel==MINE', metrics: 'views,averageViewDuration,averageViewPercentage,shares', filters: `video==${id}`, startDate: day(Date.now() - 30 * 864e5), endDate: day(Date.now()) });
      const a = await getJson('YouTube Analytics', `${bases().youtubeAnalytics}/v2/reports?${q}`, { headers: h });
      const row = a.rows?.[0];
      if (row) {
        const col = Object.fromEntries((a.columnHeaders || []).map((x, i) => [x.name, num(row[i])]));
        out.avg_watch_s = col.averageViewDuration ?? null;
        out.completion = col.averageViewPercentage !== null && col.averageViewPercentage !== undefined ? Math.min(1, col.averageViewPercentage / 100) : completionOf(out.avg_watch_s, o.duration);
        out.shares = col.shares ?? null;
      }
    } catch (e) { out.note = mask(`sin Analytics: ${e.message}`, [token]); }
    return out;
  },
  // TikTok: POST /v2/video/query/ (view, like, comment, share; la API no da alcance ni tiempo de visualización)
  async tiktok(c, id, o) {
    const token = await getTikTokToken(c, o.save);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    // lo que se guarda al publicar es el publish_id: se cambia por el ID del video una sola vez y se recuerda
    let videoId = o.videoId;
    if (!videoId) {
      const st = await getJson('TikTok', `${bases().tiktok}/v2/post/publish/status/fetch/`, { method: 'POST', headers, body: JSON.stringify({ publish_id: id }) });
      videoId = [].concat(st.data?.publicaly_available_post_id || [])[0];
      if (!videoId) throw new Error('TikTok todavía no dio el ID del video (puede estar procesándose o en privado).');
      videoId = String(videoId);
      o.onVideoId?.(videoId);
    }
    const r = await getJson('TikTok', `${bases().tiktok}/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count`, {
      method: 'POST', headers, body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    });
    const v = r.data?.videos?.[0];
    if (!v) throw new Error('TikTok no devolvió el video (puede que todavía se esté procesando).');
    return { views: num(v.view_count), reach: null, avg_watch_s: null, completion: null, likes: num(v.like_count), comments: num(v.comment_count), shares: num(v.share_count) };
  },
};

// opts: { duration (segundos del video, para la finalización), save (guarda credenciales renovadas) }
export async function readMetrics(network, creds, externalId, opts = {}) {
  const fn = READERS[network];
  if (!fn) throw new Error('Red desconocida.');
  if (!externalId) throw new Error('La publicación no tiene ID en la red.');
  try { return await fn(creds, String(externalId), opts); }
  catch (e) {
    throw new Error(mask(e.message || 'Algo falló.', Object.values(creds).filter((v) => typeof v === 'string')));
  }
}

// --- puntaje ---
export function weightsOf(text) {
  let v = text; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const out = { ...DEFAULT_WEIGHTS };
  if (v && typeof v === 'object') for (const k of WEIGHT_KEYS) if (Number.isFinite(Number(v[k])) && Number(v[k]) >= 0 && v[k] !== '' && v[k] !== null) out[k] = Number(v[k]);
  return out;
}
const sat = (x, ref) => (x > 0 ? x / (x + ref) : 0); // 0 a 1, siempre creciente
// metrics: {views, likes, comments, shares, completion, spend, impressions, target_reach}. Resultado entre 0 y 1.
// Con gasto suman las 4 partes; sin gasto, solo la parte orgánica (finalización y interacción) normalizada por sus pesos.
export function score(metrics, weights = DEFAULT_WEIGHTS) {
  const w = weightsOf(weights), m = metrics || {};
  const spend = Number(m.spend) || 0, views = Number(m.views) || 0;
  const engagement = views > 0 ? ((Number(m.likes) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0)) / views : 0;
  const parts = [[w.completion, Math.min(1, Number(m.completion) || 0)], [w.engagement, sat(engagement, 0.05)]];
  if (spend > 0) parts.push([w.target_reach_per_usd, sat((Number(m.target_reach) || 0) / spend, 10)], [w.impressions_per_usd, sat((Number(m.impressions) || 0) / spend, 50)]);
  const total = parts.reduce((a, [x]) => a + x, 0);
  if (total <= 0) return 0;
  return Math.round((parts.reduce((a, [x, n]) => a + x * n, 0) / total) * 10000) / 10000;
}

// --- lectura periódica ---
// Publicaciones desde `since` (el servidor pasa 7 días atrás) en proyectos que no son de demostración. Un error en una no frena a las demás:
// queda una fila con la nota (sin secretos). Devuelve {read, failed}.
// `since` es obligatorio y va en el mismo formato en que se guarda posts.published_at: hora local 'YYYY-MM-DD HH:MM'
export async function readDue(db, vault, { since } = {}) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(since || '')) throw new Error("readDue pide 'since' en hora local 'YYYY-MM-DD HH:MM'");
  const cutoff = since;
  const posts = db.prepare(`SELECT po.id, po.external_id, po.account_id, a.network, a.creds, po.network_video_id, r.duration FROM posts po
    JOIN accounts a ON a.id = po.account_id JOIN projects p ON p.id = po.project_id JOIN reels r ON r.id = po.reel_id
    WHERE po.status = 'publicado' AND po.external_id != '' AND p.demo = 0 AND po.published_at >= ? ORDER BY po.id`).all(cutoff);
  const ins = db.prepare('INSERT INTO post_metrics (post_id, views, reach, avg_watch_s, completion, likes, comments, shares, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  let read = 0, failed = 0;
  for (const po of posts) {
    try {
      const creds = vault.open(po.creds);
      const save = (fresh) => db.prepare('UPDATE accounts SET creds = ? WHERE id = ?').run(vault.seal({ ...vault.open(db.prepare('SELECT creds FROM accounts WHERE id = ?').get(po.account_id).creds), ...fresh }), po.account_id);
      const m = await readMetrics(po.network, creds, po.external_id, { duration: po.duration, save, videoId: po.network_video_id || '', onVideoId: (v) => db.prepare('UPDATE posts SET network_video_id = ? WHERE id = ?').run(v, po.id) });
      ins.run(po.id, m.views, m.reach, m.avg_watch_s, m.completion, m.likes, m.comments, m.shares, m.note || '');
      read++;
    } catch (e) {
      ins.run(po.id, null, null, null, null, null, null, null, mask(e.message, []).slice(0, 300));
      failed++;
    }
  }
  return { read, failed };
}
