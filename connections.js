// Conexión de cada cuenta con su red (como las integraciones de Efaysto): los datos se guardan cifrados
// y "Probar conexión" consulta la API oficial de la red para confirmar a qué cuenta se entra.
import crypto from 'node:crypto';
import { als } from './trace.js';

// campos que acepta cada red; los secretos nunca vuelven a la pantalla
export const FIELDS = {
  instagram: { pageId: false, pageAccessToken: true, instagramBusinessId: false },
  facebook: { pageId: false, pageAccessToken: true },
  tiktok: { clientKey: false, clientSecret: true, accessToken: true, refreshToken: true },
  youtube: { clientId: false, clientSecret: true, refreshToken: true },
};

export function makeVault(secret) {
  const key = crypto.createHash('sha256').update('acm-vault:' + secret).digest();
  return {
    seal(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
    },
    open(text) {
      if (!text) return {};
      try {
        const [iv, tag, data] = text.split('.').map((s) => Buffer.from(s, 'base64'));
        const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
        d.setAuthTag(tag);
        return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
      } catch { return {}; }
    },
  };
}

// lo que ve la pantalla: los valores comunes tal cual, de los secretos solo si hay uno guardado
export function publicFields(network, creds) {
  const out = {};
  for (const [k, secret] of Object.entries(FIELDS[network] || {})) out[k] = secret ? { set: !!creds[k] } : { value: creds[k] || '' };
  return out;
}

// mezcla lo nuevo con lo guardado: un secreto vacío conserva el anterior
export function mergeFields(network, saved, incoming) {
  const out = { ...saved };
  for (const [k, secret] of Object.entries(FIELDS[network] || {})) {
    if (!(k in (incoming || {}))) continue;
    const v = String(incoming[k] ?? '').trim();
    if (secret && !v) continue;
    out[k] = v;
  }
  return out;
}

// direcciones de las APIs (se pueden cambiar por variables para probar contra un simulador)
export const BASES = {
  graph: process.env.ACM_GRAPH_URL || 'https://graph.facebook.com/v21.0',
  rupload: process.env.ACM_RUPLOAD_URL || 'https://rupload.facebook.com',
  tiktok: process.env.ACM_TIKTOK_URL || 'https://open.tiktokapis.com',
  googleOauth: process.env.ACM_GOOGLE_OAUTH_URL || 'https://oauth2.googleapis.com',
  youtube: process.env.ACM_YOUTUBE_URL || 'https://www.googleapis.com',
  ytUpload: process.env.ACM_YT_UPLOAD_URL || 'https://www.googleapis.com',
};
// dentro de una corrida del banco de pruebas las APIs apuntan al simulador; afuera, a las reales
export const bases = () => als.getStore()?.bases || BASES;

async function getJson(who, url, opt = {}) {
  let res;
  try { res = await fetch(url, { ...opt, signal: AbortSignal.timeout(10000) }); }
  catch (e) { throw new Error(e.name === 'TimeoutError' ? `${who} no respondió en 10 segundos. Probá de nuevo en un rato.` : `No pudimos conectar con ${who}.`); }
  const body = await res.json().catch(() => null);
  // TikTok responde 200 con error.code = "ok" cuando sale bien
  if (res.ok && body && (!body.error || body.error.code === 'ok')) return body;
  const msg = body?.error?.message || body?.error_description || body?.error?.code || `error ${res.status}`;
  throw new Error(`${who} respondió: ${msg}`);
}

const need = (c, keys, labels) => {
  const miss = keys.filter((k) => !c[k]).map((k) => labels[k]);
  if (miss.length) throw new Error('Falta completar: ' + miss.join(', ') + '.');
};
const LABELS = {
  pageId: 'ID de la Página', pageAccessToken: 'token de la Página', clientKey: 'Client key', clientSecret: 'Client secret',
  accessToken: 'token de acceso', refreshToken: 'token de renovación', clientId: 'ID de cliente',
};

const TESTERS = {
  async instagram(c) {
    need(c, ['pageId', 'pageAccessToken'], LABELS);
    const p = await getJson('Meta', `${bases().graph}/${encodeURIComponent(c.pageId)}?fields=name,instagram_business_account{id,username,followers_count}&access_token=${encodeURIComponent(c.pageAccessToken)}`);
    const ig = p.instagram_business_account;
    if (!ig) throw new Error(`La Página «${p.name}» no tiene una cuenta de Instagram profesional vinculada.`);
    return { connectedAs: '@' + ig.username, followers: ig.followers_count || 0, extra: { instagramBusinessId: ig.id } };
  },
  async facebook(c) {
    need(c, ['pageId', 'pageAccessToken'], LABELS);
    const p = await getJson('Meta', `${bases().graph}/${encodeURIComponent(c.pageId)}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(c.pageAccessToken)}`);
    return { connectedAs: p.name, followers: p.followers_count ?? p.fan_count ?? 0 };
  },
  async tiktok(c) {
    need(c, ['accessToken'], LABELS);
    const extra = {};
    const token = await getTikTokToken(c, (x) => Object.assign(extra, x));
    const u = await getJson('TikTok', `${bases().tiktok}/v2/user/info/?fields=open_id,display_name,username,follower_count`, { headers: { Authorization: `Bearer ${token}` } });
    const d = u.data?.user || {};
    return { connectedAs: d.username ? '@' + d.username : d.display_name || 'cuenta de TikTok', followers: d.follower_count || 0, extra };
  },
  async youtube(c) {
    const token = await getGoogleToken(c);
    const r = await getJson('YouTube', `${bases().youtube}/youtube/v3/channels?part=snippet,statistics&mine=true`, { headers: { Authorization: `Bearer ${token}` } });
    const ch = r.items?.[0];
    if (!ch) throw new Error('La cuenta de Google autorizada no tiene un canal de YouTube.');
    return { connectedAs: ch.snippet?.customUrl || ch.snippet?.title, followers: Number(ch.statistics?.subscriberCount) || 0 };
  },
};

export async function testConnection(network, creds) {
  const tester = TESTERS[network];
  if (!tester) throw new Error('Red desconocida.');
  try { return await tester(creds); }
  catch (e) {
    // las redes a veces repiten el token en el error: nunca se muestra
    let msg = e.message || 'Algo falló.';
    for (const [k, secret] of Object.entries(FIELDS[network])) if (secret && creds[k]) msg = msg.split(creds[k]).join('••••');
    msg = msg.replace(/\bEAA[A-Za-z0-9_-]{4,}/g, '••••').replace(/\bact\.[A-Za-z0-9_.-]{8,}/g, '••••');
    throw new Error(msg);
  }
}

// TikTok: el token de acceso dura 24 h. Se prueba y, si venció y están los datos, se renueva y se avisa con save().
const tiktokCache = new Map();
export async function getTikTokToken(c, save = () => {}) {
  need(c, ['accessToken'], LABELS);
  const ok = async (t) => { try { await getJson('TikTok', `${bases().tiktok}/v2/user/info/?fields=open_id`, { headers: { Authorization: `Bearer ${t}` } }); return true; } catch { return false; } };
  if (tiktokCache.get(c.accessToken) > Date.now() || await ok(c.accessToken)) { tiktokCache.set(c.accessToken, Date.now() + 30 * 60e3); return c.accessToken; }
  if (!(c.clientKey && c.clientSecret && c.refreshToken)) throw new Error('El token de TikTok venció y faltan el Client key, el Client secret o el token de renovación para renovarlo.');
  const t = await getJson('TikTok', `${bases().tiktok}/v2/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: c.clientKey, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: c.refreshToken }),
  });
  if (!t.access_token) throw new Error('TikTok no devolvió un token nuevo.');
  const fresh = { accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken };
  Object.assign(c, fresh); save(fresh);
  return t.access_token;
}

// Google: con el token de renovación se pide uno de acceso (dura 1 h)
export async function getGoogleToken(c) {
  need(c, ['clientId', 'clientSecret', 'refreshToken'], LABELS);
  const t = await getJson('Google', `${bases().googleOauth}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }),
  });
  return t.access_token;
}
