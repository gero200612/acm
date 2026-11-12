// Cuentas vigiladas: cada tanto se releen por la API de Instagram (business_discovery, con una cuenta de Instagram conectada del
// propio proyecto) las cuentas que ya están en la Investigación, y si una publicación reciente rinde mucho más que lo normal de
// su cuenta, se avisa por Telegram (una sola vez por publicación).
import { bases } from './connections.js';
import { addInstagram, outliers } from './knowledge.js';
import { addAlert } from './alerts.js';

export const WATCH_MAX_HANDLES = 15;   // por proyecto y por vuelta (cuida el cupo de la API)
export const WATCH_ALERT_SCORE = 3;    // 3× lo normal de la cuenta
export const WATCH_RECENT_DAYS = 3;    // solo publicaciones de los últimos días (lo viejo no es noticia)

export function initWatch(db) {
  db.exec('CREATE TABLE IF NOT EXISTS watch_alerted (project_id INTEGER NOT NULL, url TEXT NOT NULL, at TEXT DEFAULT (datetime(\'now\')), PRIMARY KEY (project_id, url))');
}

async function discover(igId, token, handle) {
  const fields = `business_discovery.username(${handle}){username,followers_count,media.limit(30){caption,like_count,comments_count,timestamp,permalink,media_type,media_product_type}}`;
  const r = await fetch(`${bases().graph}/${encodeURIComponent(igId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.business_discovery) throw new Error(j.error?.message || `Instagram respondió ${r.status}`);
  const d = j.business_discovery;
  return { username: d.username || handle, followers_count: d.followers_count || 0, posts: d.media?.data || [] };
}

/**
 * Una vuelta por todos los proyectos (no demo). `credsOf(account)` devuelve las credenciales abiertas de una cuenta.
 * Devuelve { refreshed, alerts, errors }. Una cuenta que falla no frena a las demás.
 */
export async function watchCycle(db, credsOf, { now = new Date() } = {}) {
  const out = { refreshed: 0, alerts: 0, errors: [] };
  const projects = db.prepare('SELECT id, name FROM projects WHERE demo = 0').all();
  for (const p of projects) {
    const handles = db.prepare("SELECT DISTINCT handle FROM knowledge WHERE project_id = ? AND kind = 'publicacion' AND handle != '' ORDER BY handle LIMIT ?").all(p.id, WATCH_MAX_HANDLES).map((r) => r.handle);
    if (!handles.length) continue;
    const acc = db.prepare("SELECT * FROM accounts WHERE project_id = ? AND network = 'instagram' AND status = 'conectada' ORDER BY id").all(p.id)
      .map((a) => ({ a, c: credsOf(a) })).find(({ c }) => c?.pageAccessToken && c?.instagramBusinessId);
    if (!acc) continue;
    for (const h of handles) {
      try {
        addInstagram(p.id, await discover(acc.c.instagramBusinessId, acc.c.pageAccessToken, h));
        out.refreshed++;
      } catch (e) { out.errors.push(`@${h}: ${String(e.message).replace(acc.c.pageAccessToken, '***')}`); }
    }
    const since = new Date(now.getTime() - WATCH_RECENT_DAYS * 864e5).toISOString().slice(0, 10);
    const seen = db.prepare('INSERT OR IGNORE INTO watch_alerted (project_id, url) VALUES (?, ?)');
    for (const o of outliers(p.id, { limit: 50 })) {
      if (o.score < WATCH_ALERT_SCORE || !o.date || o.date < since || !o.url) continue;
      if (!seen.run(p.id, o.url).changes) continue; // ya se avisó
      const n = (x) => Number(x).toLocaleString('es-AR');
      addAlert(db, 'rival_explota', p.id, `@${o.handle} publicó algo que rinde ${String(o.score).replace('.', ',')}× lo normal de su cuenta: ${n(o.eng)} interacciones (lo normal: ${n(o.median)}). «${o.text.slice(0, 140)}${o.text.length > 140 ? '…' : ''}» ${o.url}`, undefined, o.url);
      out.alerts++;
    }
  }
  return out;
}
