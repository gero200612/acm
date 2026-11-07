// Conexión de cada cuenta con su red (como las integraciones de Efaysto): los datos se guardan cifrados
// y "Probar conexión" consulta la API oficial de la red para confirmar a qué cuenta se entra.
import crypto from 'node:crypto';

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

const GRAPH = 'https://graph.facebook.com/v21.0';

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
    const p = await getJson('Meta', `${GRAPH}/${encodeURIComponent(c.pageId)}?fields=name,instagram_business_account{id,username,followers_count}&access_token=${encodeURIComponent(c.pageAccessToken)}`);
    const ig = p.instagram_business_account;
    if (!ig) throw new Error(`La Página «${p.name}» no tiene una cuenta de Instagram profesional vinculada.`);
    return { connectedAs: '@' + ig.username, followers: ig.followers_count || 0, extra: { instagramBusinessId: ig.id } };
  },
  async facebook(c) {
    need(c, ['pageId', 'pageAccessToken'], LABELS);
    const p = await getJson('Meta', `${GRAPH}/${encodeURIComponent(c.pageId)}?fields=name,followers_count,fan_count&access_token=${encodeURIComponent(c.pageAccessToken)}`);
    return { connectedAs: p.name, followers: p.followers_count ?? p.fan_count ?? 0 };
  },
  async tiktok(c) {
    need(c, ['accessToken'], LABELS);
    let token = c.accessToken, extra = {};
    const info = async () => getJson('TikTok', 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count', { headers: { Authorization: `Bearer ${token}` } });
    let u;
    try { u = await info(); }
    catch (e) {
      // el token de acceso de TikTok dura 24 h: si están los datos para renovarlo, se renueva solo
      if (!(c.clientKey && c.clientSecret && c.refreshToken)) throw e;
      const t = await getJson('TikTok', 'https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: c.clientKey, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: c.refreshToken }),
      });
      token = t.access_token; extra = { accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken };
      u = await info();
    }
    const d = u.data?.user || {};
    return { connectedAs: d.username ? '@' + d.username : d.display_name || 'cuenta de TikTok', followers: d.follower_count || 0, extra };
  },
  async youtube(c) {
    need(c, ['clientId', 'clientSecret', 'refreshToken'], LABELS);
    const t = await getJson('Google', 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }),
    });
    const r = await getJson('YouTube', 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${t.access_token}` } });
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
