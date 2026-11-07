// Conectar con un clic: «Conectar con TikTok» y «Conectar con Google» (YouTube). La persona autoriza en la red,
// la red vuelve a /oauth/<red>/callback con un código, ACM lo cambia por los tokens y los guarda cifrados en la cuenta.
// Las apps de desarrollador (una de TikTok y una de Google) van por variables; sin ellas queda la conexión a mano.
import crypto from 'node:crypto';
import { bases, appCreds } from './connections.js';
export { appCreds };

export const PUBLIC_URL = (process.env.ACM_PUBLIC_URL || (process.env.NODE_ENV === 'production' ? 'https://acm.punchi.dev' : `http://localhost:${process.env.PORT || 3000}`)).replace(/\/$/, '');

export const oauthReady = (network) => { const a = appCreds(network); return !!(a.key && a.secret); };
export const redirectUri = (network) => `${PUBLIC_URL}/oauth/${network}/callback`;

// lo mínimo para publicar y saber a qué cuenta se entró
export const SCOPES = {
  tiktok: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.publish', 'video.upload'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
};

// state firmado: a qué cuenta vuelve y hasta cuándo vale (10 minutos); así nadie puede colgar un código en otra cuenta
export function makeState(secret, accountId) {
  const body = `${accountId}.${Date.now() + 10 * 60e3}.${crypto.randomBytes(8).toString('hex')}`;
  return `${body}.${crypto.createHmac('sha256', secret).update('oauth:' + body).digest('base64url')}`;
}
export function readState(secret, state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join('.');
  const want = Buffer.from(crypto.createHmac('sha256', secret).update('oauth:' + body).digest('base64url'));
  const got = Buffer.from(parts[3]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return { accountId: Number(parts[0]) };
}

export function authUrl(network, state) {
  const a = appCreds(network);
  if (network === 'tiktok') {
    const q = new URLSearchParams({ client_key: a.key, scope: SCOPES.tiktok.join(','), response_type: 'code', redirect_uri: redirectUri('tiktok'), state });
    return `${bases().tiktokAuth}/v2/auth/authorize/?${q}`;
  }
  if (network === 'youtube') {
    // offline + consent: Google solo entrega el token de renovación así
    const q = new URLSearchParams({ client_id: a.key, redirect_uri: redirectUri('youtube'), response_type: 'code', scope: SCOPES.youtube.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, hl: process.env.ACM_GOOGLE_HL || 'en' }); // en inglés: lo piden los revisores de Google
    return `${bases().googleAuth}/o/oauth2/v2/auth?${q}`;
  }
  throw new Error('Esta red no se conecta con un clic.');
}

async function post(who, url, form) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error(`No pudimos conectar con ${who}.`); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${who} respondió: ${j.error_description || j.error?.message || j.error || 'error ' + r.status}`);
  return j;
}

// cambia el código por los tokens; devuelve lo que se guarda en la cuenta (la app no: se toma de las variables)
export async function exchange(network, code) {
  const a = appCreds(network);
  if (network === 'tiktok') {
    const t = await post('TikTok', `${bases().tiktok}/v2/oauth/token/`, { client_key: a.key, client_secret: a.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri('tiktok') });
    if (!t.access_token) throw new Error('TikTok no devolvió el token.');
    const missing = SCOPES.tiktok.filter((s) => t.scope && !t.scope.split(',').includes(s));
    return { creds: { accessToken: t.access_token, refreshToken: t.refresh_token || '', openId: t.open_id || '', via: 'oauth' }, missing };
  }
  if (network === 'youtube') {
    const t = await post('Google', `${bases().googleOauth}/token`, { client_id: a.key, client_secret: a.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri('youtube') });
    if (!t.refresh_token) throw new Error('Google no devolvió el token de renovación: sacale el acceso a ACM en myaccount.google.com/permissions y conectá de nuevo.');
    const missing = SCOPES.youtube.filter((s) => t.scope && !t.scope.split(' ').includes(s));
    return { creds: { refreshToken: t.refresh_token, via: 'oauth' }, missing };
  }
  throw new Error('Red desconocida.');
}
