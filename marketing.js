// Ciclo de marketing (cada 6 h): decide qué promocionar, mueve la plata entre reels y redes, corta lo que no rinde y anota cada decisión.
// Los límites de plata los pone el código (budget.js: guardSpend); acá nada gasta sin pasar por ahí.
import { score, weightsOf } from './metrics.js';
import { addAlert } from './alerts.js';
import { AD_NETWORKS, AdRejected, adNetworkOf } from './ads-iface.js';
import { dailyCap, splitNetworks, canJudge, guardSpend } from './budget.js';

export const MIN_ORGANIC_HOURS = 24;   // un reel se promociona recién con 24 h de vida orgánica
export const MIN_DAILY_USD = 1;        // menos que esto no vale la pena lanzarlo
export const MAX_ACTIVE_PER_NETWORK = 2;

export function initMarketing(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, post_id INTEGER NOT NULL, network TEXT NOT NULL, ad_id TEXT NOT NULL,
  daily_usd REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'activa', started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  spend REAL DEFAULT 0, impressions INTEGER DEFAULT 0, reach INTEGER DEFAULT 0, target_reach INTEGER DEFAULT 0, spend_day TEXT DEFAULT '', spend_day_start REAL DEFAULT 0);
CREATE INDEX IF NOT EXISTS promotions_project ON promotions(project_id, status);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, target TEXT DEFAULT '', data TEXT DEFAULT '{}', reason TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS decisions_project ON decisions(project_id, id);`);
}

const pad = (n) => String(n).padStart(2, '0');
export const localStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minutes = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0) / 6e4;
const hoursBetween = (from, to) => (minutes(to) - minutes(from)) / 60;
const round2 = (x) => Math.round(x * 100) / 100;

const running = new Set(); // un solo ciclo por proyecto a la vez: dos ciclos pisándose podrían pasar el total

// deps: { db, adapters: {meta, youtube, tiktok}, now?: () => 'YYYY-MM-DD HH:MM' (hora local) }
export async function marketingCycle(projectId, deps = {}) {
  const nowStr = (deps.now ? deps.now() : localStamp()).slice(0, 16);
  if (running.has(projectId)) return { skipped: 'ya hay un ciclo corriendo' };
  running.add(projectId);
  try { return await cycle(deps.db, projectId, deps.adapters || {}, nowStr, nowStr.slice(0, 10)); }
  finally { running.delete(projectId); }
}

async function cycle(db, projectId, adapters, nowStr, today) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!p) return { skipped: 'no existe el proyecto' };
  if (p.demo) return { skipped: 'proyecto de demostración' };
  const pa = db.prepare('SELECT * FROM pauta WHERE project_id = ?').get(projectId) || {};
  const budget = Number(pa.budget) || 0;
  if (budget <= 0) return { skipped: 'sin presupuesto' };
  if (!AD_NETWORKS.some((n) => adapters[n])) return { skipped: 'sin adaptadores' };

  const decide = (kind, target, data, reason) => db.prepare('INSERT INTO decisions (project_id, at, kind, target, data, reason) VALUES (?, ?, ?, ?, ?, ?)')
    .run(projectId, nowStr, kind, String(target ?? ''), JSON.stringify(data || {}), reason);
  let enabled; try { enabled = typeof p.ads_networks === 'string' ? JSON.parse(p.ads_networks) : p.ads_networks; } catch { enabled = null; }
  enabled = { meta: !!enabled?.meta, youtube: !!enabled?.youtube, tiktok: !!enabled?.tiktok };
  const weights = weightsOf(p.score_weights);
  const to = [pa.end_date, p.propaganda_until].filter(Boolean).map((d) => d.slice(0, 10)).sort()[0] || '';
  const from = (pa.start_date || '').slice(0, 10) || today;
  const promos = () => db.prepare("SELECT * FROM promotions WHERE project_id = ? AND status = 'activa' ORDER BY id").all(projectId);
  const setPromo = (id, fields) => { const ks = Object.keys(fields); db.prepare(`UPDATE promotions SET ${ks.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...ks.map((k) => fields[k]), nowStr, id); };
  const out = { promoted: 0, raised: 0, lowered: 0, cut: 0, paused: 0 };

  // 1) leer lo gastado de cada anuncio activo (acumulado) y llevar la cuenta del día
  for (const pr of promos()) {
    const ad = adapters[pr.network];
    if (!ad) continue;
    try {
      const i = await ad.insights(pr.ad_id);
      const spend = Math.max(Number(pr.spend) || 0, Number(i.spend) || 0);
      const f = { spend, impressions: Number(i.impressions) || 0, reach: Number(i.reach) || 0, target_reach: Number(i.target_reach) || 0 };
      if (pr.spend_day !== today) { f.spend_day = today; f.spend_day_start = Number(pr.spend) || 0; }
      setPromo(pr.id, f);
      const last = db.prepare('SELECT * FROM post_metrics WHERE post_id = ? AND views IS NOT NULL ORDER BY id DESC LIMIT 1').get(pr.post_id) || {};
      db.prepare('INSERT INTO post_metrics (post_id, views, reach, avg_watch_s, completion, likes, comments, shares, spend, impressions, target_reach, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(pr.post_id, last.views ?? null, last.reach ?? null, last.avg_watch_s ?? null, last.completion ?? null, last.likes ?? null, last.comments ?? null, last.shares ?? null, spend, f.impressions, f.target_reach, 'pauta');
    } catch (e) { decide('error', pr.ad_id, { network: pr.network }, `No se pudo leer lo gastado en ${pr.network}: ${e.message}`.slice(0, 300)); }
  }
  const all = db.prepare('SELECT * FROM promotions WHERE project_id = ?').all(projectId);
  const spent = all.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const spentToday = all.reduce((a, r) => a + (r.spend_day === today ? Math.max(0, (Number(r.spend) || 0) - (Number(r.spend_day_start) || 0)) : 0), 0);
  const remaining = Math.max(0, budget - spent);

  const pausePromo = async (pr, kind, reason, status) => {
    try { await adapters[pr.network]?.pause(pr.ad_id); }
    catch (e) {
      decide('error', pr.ad_id, { network: pr.network }, `No se pudo pausar en ${pr.network}: ${e.message}`.slice(0, 300));
      addAlert(db, 'pauta_no_pausa', projectId, `No se pudo pausar un anuncio de ${pr.network} (${pr.ad_id}); pausalo a mano.`, `${nowStr}:00`);
      return false;
    }
    setPromo(pr.id, { status, daily_usd: 0 });
    decide(kind, pr.ad_id, { network: pr.network, post_id: pr.post_id, spend: pr.spend }, reason);
    return true;
  };

  // 2) tope duro: pasada la fecha máxima o sin plata, se pausa todo en este mismo ciclo
  const expired = !!to && today > to;
  if (expired || remaining <= 0.005) {
    const why = expired ? `Pasó la fecha máxima de propaganda (${to}): se pausa toda la pauta.` : 'Se terminó la pauta total: se pausa todo.';
    for (const pr of promos()) if (await pausePromo(pr, 'pausa_total', why, 'pausada')) out.paused++;
    if (out.paused) addAlert(db, 'pauta_terminada', projectId, why, `${nowStr}:00`);
    return out;
  }
  if (!to) return { ...out, skipped: 'sin fecha de fin de la pauta' };

  // 3) redes apagadas: no se usan
  for (const pr of promos()) if (!enabled[pr.network] && adapters[pr.network]) if (await pausePromo(pr, 'pausa', `La red ${pr.network} está apagada en el proyecto.`, 'pausada')) out.paused++;

  // 4) corte: con gasto o tiempo suficientes, se corta lo que rinde bajo el promedio o viene cayendo en 3 lecturas
  const metricsOf = (postId, pr) => {
    const organic = db.prepare('SELECT * FROM post_metrics WHERE post_id = ? AND views IS NOT NULL ORDER BY id DESC LIMIT 1').get(postId) || {};
    return { ...organic, spend: pr ? pr.spend : 0, impressions: pr ? pr.impressions : 0, target_reach: pr ? pr.target_reach : 0 };
  };
  const scoreOf = (pr) => score(metricsOf(pr.post_id, pr), weights);
  const falling = (pr) => {
    const rows = db.prepare('SELECT * FROM post_metrics WHERE post_id = ? AND views IS NOT NULL ORDER BY id DESC LIMIT 3').all(pr.post_id).reverse();
    if (rows.length < 3) return false;
    const s = rows.map((r) => score({ ...r, spend: pr.spend, impressions: pr.impressions, target_reach: pr.target_reach }, weights));
    return s[0] > s[1] && s[1] > s[2];
  };
  let active = promos().filter((r) => enabled[r.network]);
  if (active.length) {
    const scores = new Map(active.map((r) => [r.id, scoreOf(r)]));
    const avg = [...scores.values()].reduce((a, x) => a + x, 0) / scores.size;
    for (const pr of active) {
      if (!canJudge({ spend: pr.spend, promotedHours: hoursBetween(pr.started_at, nowStr) })) continue;
      const s = scores.get(pr.id), low = active.length > 1 && s < avg - 1e-9;
      if (low || falling(pr)) {
        const reason = low ? `Se corta: puntaje ${s} bajo el promedio ${round2(avg)} con USD ${round2(pr.spend)} gastados.` : 'Se corta: el puntaje cayó en las últimas 3 lecturas.';
        if (await pausePromo(pr, 'corte', reason, 'cortada')) out.cut++;
      }
    }
    active = promos().filter((r) => enabled[r.network]);
  }

  // 5) tope de hoy y reparto entre redes
  const cap = dailyCap({ budget, spent, from, to, today, spentToday });
  const state = (excludeId) => ({ remainingTotal: remaining, cap, baseCap: cap, committedOthers: round2(promos().filter((r) => r.id !== excludeId).reduce((a, r) => a + r.daily_usd, 0)) });
  const usable = Object.fromEntries(AD_NETWORKS.map((n) => [n, !!(enabled[n] && adapters[n])]));
  const perf = {};
  for (const n of AD_NETWORKS) { const rs = active.filter((r) => r.network === n); if (rs.length) perf[n] = rs.reduce((a, r) => a + scoreOf(r), 0) / rs.length; }
  const dsum = active.reduce((a, r) => a + r.daily_usd, 0), prev = {};
  for (const n of AD_NETWORKS) prev[n] = dsum > 0 ? (active.filter((r) => r.network === n).reduce((a, r) => a + r.daily_usd, 0) / dsum) * 100 : 0;
  const split = splitNetworks({ enabled: usable, perf, prev: dsum > 0 ? prev : null });
  decide('reparto', 'redes', { split, cap, spent: round2(spent), remaining: round2(remaining), spentToday: round2(spentToday) },
    `Reparto de hoy entre redes: ${AD_NETWORKS.filter((n) => usable[n]).map((n) => `${n} ${split[n]} %`).join(', ')} (tope diario USD ${cap}).`);

  // candidatos: publicados hace 24 h o más, con ID en la red, nunca promocionados ni rechazados, de una red habilitada y con adaptador
  const ever = new Set(all.map((r) => r.post_id));
  const rejected = new Set(db.prepare("SELECT target FROM decisions WHERE project_id = ? AND kind = 'rechazo'").all(projectId).map((r) => r.target));
  const cands = db.prepare(`SELECT po.id, po.external_id, po.published_at, a.network FROM posts po JOIN accounts a ON a.id = po.account_id
    WHERE po.project_id = ? AND po.status = 'publicado' AND po.external_id != '' ORDER BY po.id`).all(projectId)
    .map((c) => ({ ...c, net: adNetworkOf(c.network) }))
    .filter((c) => c.net && usable[c.net] && !ever.has(c.id) && !rejected.has(`post ${c.id}`) && c.published_at && hoursBetween(c.published_at, nowStr) >= MIN_ORGANIC_HOURS)
    .map((c) => ({ ...c, s: score(metricsOf(c.id, null), weights) })).sort((a, b) => b.s - a.s || a.id - b.id);

  // 6) objetivo diario por anuncio: la parte de cada red repartida entre sus anuncios (los activos y los nuevos que entran)
  const targets = new Map(), launch = [];
  for (const n of AD_NETWORKS) {
    if (!usable[n]) continue;
    const rs = active.filter((r) => r.network === n);
    const fresh = cands.filter((c) => c.net === n).slice(0, Math.max(0, MAX_ACTIVE_PER_NETWORK - rs.length));
    const each = Math.floor((((cap * split[n]) / 100) / ((rs.length + fresh.length) || 1)) * 100) / 100;
    for (const r of rs) targets.set(r.id, each);
    for (const c of fresh) launch.push({ ...c, each });
  }
  // primero se baja lo que sobra, después se sube y se lanza (así el total comprometido nunca pasa el tope)
  for (const pr of active) {
    const want = targets.get(pr.id) ?? 0;
    if (want >= pr.daily_usd - 0.005) continue;
    try { await adapters[pr.network].setBudget(pr.ad_id, want); } catch (e) { decide('error', pr.ad_id, {}, `No se pudo bajar el presupuesto: ${e.message}`.slice(0, 300)); continue; }
    setPromo(pr.id, { daily_usd: want });
    decide('baja', pr.ad_id, { network: pr.network, from: pr.daily_usd, to: want }, `Baja el presupuesto diario de USD ${pr.daily_usd} a USD ${want} por el reparto entre redes.`);
    out.lowered++;
  }
  for (const pr of promos().filter((r) => enabled[r.network]).sort((a, b) => scoreOf(b) - scoreOf(a))) {
    const want = targets.get(pr.id) ?? 0;
    if (want <= pr.daily_usd + 0.005) continue;
    const g = guardSpend({ kind: 'raise', dailyUsd: want, currentUsd: pr.daily_usd }, state(pr.id));
    if (!g.ok || g.usd <= pr.daily_usd + 0.005) { decide('tope', pr.ad_id, { want }, `No se sube el anuncio: ${g.reason || 'sin lugar en el tope'}.`); continue; }
    try { await adapters[pr.network].setBudget(pr.ad_id, g.usd); } catch (e) { decide('error', pr.ad_id, {}, `No se pudo subir el presupuesto: ${e.message}`.slice(0, 300)); continue; }
    setPromo(pr.id, { daily_usd: g.usd });
    decide('suba', pr.ad_id, { network: pr.network, from: pr.daily_usd, to: g.usd, want }, `Sube el presupuesto diario de USD ${pr.daily_usd} a USD ${g.usd}${g.clamped ? ` (${g.reason})` : ''}.`);
    out.raised++;
  }
  const ensured = new Set();
  for (const c of launch) {
    const g = guardSpend({ kind: 'promote', dailyUsd: c.each, currentUsd: 0 }, state(0));
    if (!g.ok || g.usd < MIN_DAILY_USD) { decide('tope', `post ${c.id}`, { want: c.each }, `No se promociona el post ${c.id}: ${g.reason || `quedan menos de USD ${MIN_DAILY_USD} para hoy`}.`); continue; }
    try {
      if (!ensured.has(c.net)) { await adapters[c.net].ensureCampaign(p); ensured.add(c.net); }
      const { adId } = await adapters[c.net].promote({ id: c.id, external_id: c.external_id, network: c.network }, g.usd);
      db.prepare('INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at, spend_day, spend_day_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
        .run(projectId, c.id, c.net, String(adId), g.usd, 'activa', nowStr, nowStr, today);
      decide('promover', String(adId), { post_id: c.id, network: c.net, daily_usd: g.usd, score: c.s },
        `Se promociona el post ${c.id} en ${c.net} con USD ${g.usd} por día: tiene el mejor puntaje (${c.s}) entre los de más de ${MIN_ORGANIC_HOURS} h orgánicas${g.clamped ? ` (${g.reason})` : ''}.`);
      out.promoted++;
    } catch (e) {
      if (e instanceof AdRejected) {
        decide('rechazo', `post ${c.id}`, { network: c.net }, `${c.net} rechazó el anuncio del post ${c.id}: ${e.message}`.slice(0, 300));
        addAlert(db, 'anuncio_rechazado', projectId, `Anuncio rechazado en ${c.net} (post ${c.id}): ${e.message}`.slice(0, 300), `${nowStr}:00`);
      } else decide('error', `post ${c.id}`, { network: c.net }, `No se pudo promocionar en ${c.net}: ${e.message}`.slice(0, 300));
    }
  }
  return out;
}
