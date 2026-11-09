// Arma los adaptadores de pauta de un proyecto a partir de sus credenciales (selladas con la bóveda).
// Solo para redes con pauta encendida en el proyecto (o con anuncios todavía activos, que hay que poder pausar) y con credenciales completas.
// Los proyectos de demostración nunca arman adaptadores reales.
import { metaAdapter } from './ads.js';
import { tiktokAdapter } from './ads-tiktok.js';
import { googleAdapter } from './ads-google.js';
import { addAlert } from './alerts.js';

// campos de pauta que acepta cada red (true = secreto: nunca vuelve a la pantalla)
export const ADS_FIELDS = {
  meta: { adAccountId: false, accessToken: true },
  tiktok: { ttAdvertiserId: false, ttAccessToken: true, ttIdentityId: false, ttBcId: false },
  youtube: { gCustomerId: false, gLoginCustomerId: false, gDeveloperToken: true, gRefreshToken: true, gClientId: false, gClientSecret: true },
};
export const hasAdsCreds = {
  meta: (c) => !!(c.adAccountId && c.accessToken),
  tiktok: (c) => !!(c.ttAdvertiserId && c.ttAccessToken && c.ttIdentityId && c.ttBcId),
  youtube: (c) => !!(c.gCustomerId && c.gDeveloperToken && c.gRefreshToken),
};
export const parseObj = (t, d = {}) => { try { const v = typeof t === 'string' ? JSON.parse(t || 'null') : t; return v && typeof v === 'object' ? v : d; } catch { return d; } };

// db: base de ACM. vault: { open }. today: () => 'YYYY-MM-DD' en hora local.
export function buildAdapters(db, vault, projectId, today = () => new Date().toISOString().slice(0, 10)) {
  const project = () => db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const p = project();
  if (!p || p.demo) return {};
  const creds = vault.open(p.ads_creds);
  const enabled = parseObj(p.ads_networks);
  const active = new Set(db.prepare("SELECT DISTINCT network FROM promotions WHERE project_id = ? AND status = 'activa'").all(projectId).map((r) => r.network));
  const ctx = {
    creds, project, today,
    state: {
      get: (net) => parseObj(project().ads_state)[net] || {},
      set: (net, obj) => { const all = parseObj(project().ads_state); all[net] = obj; db.prepare('UPDATE projects SET ads_state = ? WHERE id = ?').run(JSON.stringify(all), projectId); },
    },
    endDate() {
      const pa = db.prepare('SELECT end_date FROM pauta WHERE project_id = ?').get(projectId) || {};
      return [pa.end_date, project().propaganda_until].filter(Boolean).map((d) => d.slice(0, 10)).sort()[0] || '';
    },
    accountCreds: (network) => { const a = db.prepare("SELECT creds FROM accounts WHERE project_id = ? AND network = ? AND status = 'conectada' ORDER BY id LIMIT 1").get(projectId, network); return a ? vault.open(a.creds) : null; },
    // solo el ID real del video (network_video_id); el external_id de TikTok es el publish_id y no sirve
    videoId: (postId) => db.prepare('SELECT network_video_id FROM posts WHERE id = ?').get(postId)?.network_video_id || '',
    padron: () => db.prepare('SELECT em, ph FROM padron WHERE project_id = ?').all(projectId),
  };
  const make = { meta: metaAdapter, tiktok: tiktokAdapter, youtube: googleAdapter };
  const out = {};
  for (const n of Object.keys(make)) {
    if (!((enabled[n] || active.has(n)) && hasAdsCreds[n](creds))) continue;
    // TikTok y Google solo pautan en dólares: una cuenta probada en otra moneda no arma adaptador (y se avisa)
    const cur = (n === 'tiktok' || n === 'youtube') ? ctx.state.get(n).currency : '';
    if (cur && cur !== 'USD') {
      try { addAlert(db, 'moneda_no_usd', projectId, `La cuenta de pauta de ${n === 'tiktok' ? 'TikTok' : 'Google'} está en ${cur}: ACM solo pauta en dólares en esa red, no se promociona ahí.`); } catch {}
      continue;
    }
    out[n] = make[n](ctx);
  }
  return out;
}
