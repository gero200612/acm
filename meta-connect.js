// «Conectar con Facebook»: Facebook Login for Business con la app de Sincro (aprobada por Meta el 17/11/2026).
// El navegador abre el diálogo de Meta con el SDK de JavaScript y trae un código; el canje lo hace sincro-wa, que es el único
// que tiene el secreto de la app (capacidad `autorizar`: devuelve el token y no registra la página como canal).
// Sin las variables queda la conexión a mano, como antes.
import { bases } from './connections.js';

export function metaApp(env = process.env) {
  return {
    appId: env.ACM_META_APP_ID || '',
    pagesConfigId: env.ACM_META_PAGES_CONFIG_ID || '',
    adsConfigId: env.ACM_META_ADS_CONFIG_ID || '',
    waKey: env.ACM_SINCRO_WA_KEY || '',
  };
}
const waUrl = () => (bases().sincroWa || '').replace(/\/+$/, '');

// lo que necesita la pantalla para abrir el diálogo (nada secreto)
export function metaPublic() {
  const m = metaApp();
  const ready = !!(m.appId && waUrl() && m.waKey);
  return { appId: ready ? m.appId : '', pages: ready && m.pagesConfigId ? m.pagesConfigId : '', ads: ready && m.adsConfigId ? m.adsConfigId : '' };
}

// error de sincro-wa que la pantalla tiene que resolver (elegir página o cuenta): lleva la lista
export class MetaChoice extends Error {
  constructor(message, kind, options) { super(message); this.kind = kind; this.options = options; }
}

async function wa(path, body) {
  const m = metaApp();
  if (!waUrl() || !m.waKey) throw new Error('Falta configurar la conexión con Meta en el servidor: por ahora conectala a mano.');
  let r;
  try {
    r = await fetch(`${waUrl()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m.waKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch { throw new Error('No pudimos conectar con el servidor de Meta de Sincro. Probá de nuevo en un rato.'); }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  if (j.code === 'elegir_pagina') throw new MetaChoice(j.mensaje, 'pagina', j.paginas || []);
  if (j.code === 'elegir_cuenta') throw new MetaChoice(j.mensaje, 'cuenta', j.cuentas || []);
  throw new Error(j.mensaje || (r.status === 404 ? 'El servidor de Meta de Sincro no tiene habilitada la conexión para ACM.' : `Meta respondió con un error (${r.status}).`));
}

const Code = (code) => {
  const c = String(code || '').trim();
  if (c.length < 10 || c.length > 2000) throw new Error('Facebook no devolvió el código. Probá conectar de nuevo.');
  return c;
};

// página (y su Instagram) → los datos que guarda la cuenta de ACM para esa red
export async function authorizePage(network, code, pageId) {
  const r = await wa('/autorizar-pagina', { codigo: Code(code), ...(pageId ? { pagina_id: String(pageId) } : {}) });
  if (network === 'instagram' && !r.instagram) throw new Error(`La Página «${r.pagina.nombre}» no tiene una cuenta de Instagram profesional vinculada: vinculala en Meta y conectá de nuevo.`);
  const creds = { pageId: r.pagina.id, pageAccessToken: r.token_pagina, via: 'oauth' };
  if (network === 'instagram') creds.instagramBusinessId = r.instagram.id;
  return creds;
}

// cuenta publicitaria → los datos de Meta Ads del proyecto
export async function authorizeAds(code, accountId) {
  const r = await wa('/conectar-anuncios', { codigo: Code(code), ...(accountId ? { cuenta_id: 'act_' + String(accountId).replace(/^act_/, '') } : {}) });
  return { adAccountId: String(r.cuenta.id).replace(/^act_/, ''), accessToken: r.token, name: r.cuenta.nombre, currency: r.cuenta.moneda };
}
