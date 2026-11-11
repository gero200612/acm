// Banco de pruebas del Laboratorio: casos que corren contra el simulador de las APIs (nunca contra las redes reales).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSimulator } from './simulator.js';
import { traced, step, mask } from './trace.js';
import { publicUrl } from './oauth.js';
import { testConnection } from './connections.js';
import { publish } from './publisher.js';
import { uploadAudience, createCampaign, testAds } from './ads.js';
import ExcelJS from 'exceljs';
import { readPadron, normPhone } from './padron.js';
import { postBlocked, pautaNumbers, defaultAdsNetworks, scheduleBlocked, withinWindow, youtubeShare, NETWORK_CAPS } from './rules.js';
import { embed } from './knowledge.js';
import { DatabaseSync } from 'node:sqlite';
import { planDay, planProject, initPlanner, expiredBlocked, localExpiry } from './planner.js';
import { initAlerts, addAlert } from './alerts.js';
import { initMetrics, readMetrics, readDue, score, DEFAULT_WEIGHTS } from './metrics.js';
import { makeVault } from './connections.js';
import { dailyCap, splitNetworks, canJudge, guardSpend } from './budget.js';
import { initMarketing, marketingCycle, projectsToCycle, UNTARGETED_REACH_WEIGHT } from './marketing.js';
import { AdRejected, AdSkip } from './ads-iface.js';
import { isPolicyReject as metaPolicy } from './ads.js';
import { isPolicyReject as ttPolicy } from './ads-tiktok.js';
import { isPolicyReject as gPolicy } from './ads-google.js';
import { tiktokAdapter } from './ads-tiktok.js';
import { googleAdapter } from './ads-google.js';
import { buildAdapters } from './ads-factory.js';
import { initMemory, compareSiblings, winningVariables, memoryCycle } from './memory.js';
import { flushAlerts, alert as alert_, dailySummary, editorAtrasado, cuentaAlert, AUTH_ERROR } from './notify.js';
import { startSandbox, startFakeEditor, recorridoCases } from './recorrido.js';

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)}`); };
const yes = (cond, what) => { if (!cond) throw new Error(what); };

// cuentas de IG y ediciones aprobadas en recortes de a 3 hermanas (para los casos del planificador)
function planFixture(nAccounts, nClips) {
  const accounts = Array.from({ length: nAccounts }, (_, i) => ({ id: i + 1, network: 'instagram', status: 'conectada', posts_per_day: 3 }));
  const bank = Array.from({ length: nClips * 3 }, (_, i) => ({ id: 100 + i, clip_id: `clip${Math.floor(i / 3)}`, review: 'aprobado', expires_at: '', recipe: null }));
  return { accounts, bank };
}
// ¿las hermanas de cada recorte están a 3 h o más entre sí?
function siblingsOk(plan, bank) {
  const clip = new Map(bank.map((e) => [e.id, e.clip_id]));
  const t = (at) => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
  return plan.every((a) => plan.every((b) => a === b || clip.get(a.reel_id) !== clip.get(b.reel_id) || a.scheduled_at.slice(0, 10) !== b.scheduled_at.slice(0, 10) || Math.abs(t(a.scheduled_at) - t(b.scheduled_at)) >= 180));
}

// proyecto con pauta, cuentas y publicaciones para el ciclo de marketing; adaptadores falsos que anotan lo que se les pide
function mktFixture({ budget = 100, end = '2026-11-30', until = '', nets = '{"meta":true,"youtube":true,"tiktok":false}', demo = 0 } = {}) {
  const d = new DatabaseSync(':memory:');
  d.exec(`PRAGMA foreign_keys = ON; CREATE TABLE projects (id INTEGER PRIMARY KEY, demo INTEGER DEFAULT 0, ads_networks TEXT, score_weights TEXT DEFAULT '', propaganda_until TEXT DEFAULT '', ads_blocked TEXT DEFAULT '');
    CREATE TABLE pauta (project_id INTEGER PRIMARY KEY, budget REAL, start_date TEXT DEFAULT '', end_date TEXT DEFAULT '');
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, network TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, account_id INT, status TEXT DEFAULT 'publicado', external_id TEXT, published_at TEXT, network_video_id TEXT DEFAULT '');`);
  initMetrics(d); initAlerts(d); initMarketing(d);
  d.prepare('INSERT INTO projects (id, demo, ads_networks, propaganda_until) VALUES (1, ?, ?, ?)').run(demo, nets, until);
  d.prepare("INSERT INTO pauta (project_id, budget, start_date, end_date) VALUES (1, ?, '2026-11-01', ?)").run(budget, end);
  d.exec("INSERT INTO accounts VALUES (1, 'instagram'), (2, 'youtube'), (3, 'tiktok')");
  const log = [], spend = {};
  const mk = (net) => ({
    async ensureCampaign() { log.push(`${net}:campaña`); return { campaignId: `C${net}` }; },
    async promote(post, usd) { log.push(`${net}:promote:${post.id}:${usd}`); return { adId: `${net}-${post.id}` }; },
    async setBudget(ad, usd) { log.push(`${net}:budget:${ad}:${usd}`); },
    async pause(ad) { log.push(`${net}:pause:${ad}`); },
    async insights(ad) { return { spend: spend[ad] || 0, impressions: (spend[ad] || 0) * 100, reach: 50, target_reach: null }; },
  });
  const deps = { db: d, adapters: { meta: mk('meta'), youtube: mk('youtube'), tiktok: mk('tiktok') }, now: () => '2026-11-21 10:00' };
  const post = (id, acc, at, views, likes = 0, completion = 0.3) => {
    d.prepare('INSERT INTO posts (id, project_id, account_id, external_id, published_at) VALUES (?, 1, ?, ?, ?)').run(id, acc, `X${id}`, at);
    d.prepare('INSERT INTO post_metrics (post_id, views, completion, likes, comments, shares) VALUES (?, ?, ?, ?, 0, 0)').run(id, views, completion, likes);
  };
  return { d, log, spend, deps, post };
}

// proyecto con un recorte de 3 hermanas publicadas hace 3 días en Instagram, a distinta hora y con distinto rendimiento
const RECIPES = [
  { variables: { gancho: 'directo', subtitulos: 'karaoke', musica: 'sin', ritmo: 'rapido', largo: 'corto' } },
  { variables: { gancho: 'pregunta', subtitulos: 'placa', musica: 'calido', ritmo: 'normal', largo: 'completo' } },
  { variables: { gancho: 'directo', subtitulos: 'minimo', musica: 'calido', ritmo: 'lento', largo: 'medio' } },
];
function memFixture({ demo = 0, hoursOld = 72 } = {}) {
  const d = new DatabaseSync(':memory:');
  d.exec(`PRAGMA foreign_keys = ON; CREATE TABLE projects (id INTEGER PRIMARY KEY, demo INTEGER DEFAULT 0, score_weights TEXT DEFAULT '');
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, project_id INT, network TEXT);
    CREATE TABLE reels (id INTEGER PRIMARY KEY, project_id INT, kind TEXT, clip_id TEXT, recipe TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, reel_id INT, account_id INT, scheduled_at TEXT, published_at TEXT DEFAULT '');
    CREATE TABLE learnings (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, variable TEXT NOT NULL, value TEXT NOT NULL, network TEXT, wins REAL DEFAULT 0, trials REAL DEFAULT 0, origin TEXT NOT NULL DEFAULT 'opinion_dueno', updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE decisions (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, target TEXT DEFAULT '', data TEXT DEFAULT '{}', reason TEXT DEFAULT '');
    CREATE TABLE knowledge (id INTEGER PRIMARY KEY, project_id INT, kind TEXT, title TEXT, text TEXT);`);
  initMetrics(d); initMemory(d);
  d.exec(`INSERT INTO projects (id, demo) VALUES (1, ${demo}), (2, 0); INSERT INTO accounts VALUES (1, 1, 'instagram'), (2, 2, 'instagram')`);
  const at = (h) => { const t = new Date(Date.UTC(2026, 10, 20, 12, 0) - h * 3600e3); return t.toISOString().slice(0, 16).replace('T', ' '); };
  const clip = (clipId, project, base, views) => RECIPES.forEach((rc, i) => {
    const rid = base + i;
    d.prepare("INSERT INTO reels (id, project_id, kind, clip_id, recipe) VALUES (?, ?, 'listo', ?, ?)").run(rid, project, clipId, JSON.stringify(rc));
    d.prepare('INSERT INTO posts (id, project_id, reel_id, account_id, scheduled_at, published_at) VALUES (?, ?, ?, ?, ?, ?)').run(rid, project, rid, project, at(hoursOld).slice(0, 11) + `${10 + i * 4}:00`, at(hoursOld));
    d.prepare('INSERT INTO post_metrics (post_id, views, completion, likes, comments, shares) VALUES (?, ?, ?, ?, 0, 0)').run(rid, views[i], 0.2 + i * 0.1 * (i === 1 ? 3 : 1), views[i] / 10);
  });
  return { d, clip, now: () => at(0) };
}
const hypo = async ({ winner }) => `hipótesis de prueba: ganó la versión ${winner.n}`;

// proyecto con credenciales de pauta reales (selladas) y adaptadores reales contra el simulador
const ADS_VAULT = makeVault('banco-pauta');
const ADS_CREDS = { adAccountId: '999', accessToken: 'EAAadsSecreto123', ttAdvertiserId: '70001', ttAccessToken: 'TTADS_OK', ttIdentityId: 'ID1', ttBcId: 'BC1',
  gCustomerId: '123-456-7890', gDeveloperToken: 'DEVTOK', gRefreshToken: 'GREFRESH-secreto', gClientId: 'g-app', gClientSecret: 'g-secreto-1' };
// las cuentas de TikTok y Google ya probadas en dólares (sin moneda guardada solo pausan)
const USD_STATE = JSON.stringify({ tiktok: { currency: 'USD' }, youtube: { currency: 'USD' } });
function adsFixture({ nets = '{"meta":true,"youtube":true,"tiktok":true}', demo = 0, creds = ADS_CREDS, audience = 'AUD1', until = '2026-11-30', budget = 900, kind = 'club', state = USD_STATE } = {}) {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, kind TEXT DEFAULT 'club', demo INTEGER DEFAULT 0, ads_networks TEXT, score_weights TEXT DEFAULT '', propaganda_until TEXT DEFAULT '',
      ads_creds TEXT DEFAULT '', ads_state TEXT DEFAULT '', ads_blocked TEXT DEFAULT '', ads_currency TEXT DEFAULT '', ads_rate REAL DEFAULT 0, ads_audience_id TEXT DEFAULT '', ads_political INTEGER DEFAULT 1);
    CREATE TABLE pauta (project_id INTEGER PRIMARY KEY, budget REAL, start_date TEXT DEFAULT '', end_date TEXT DEFAULT '');
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, project_id INT, network TEXT, status TEXT DEFAULT 'conectada', creds TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, account_id INT, status TEXT DEFAULT 'publicado', external_id TEXT, network_video_id TEXT DEFAULT '', published_at TEXT);
    CREATE TABLE padron (project_id INT, em TEXT, ph TEXT);`);
  initMetrics(d); initAlerts(d); initMarketing(d);
  d.prepare("INSERT INTO projects (id, name, kind, demo, ads_networks, propaganda_until, ads_creds, ads_currency, ads_rate, ads_audience_id, ads_state) VALUES (1, 'Proyecto Mock', ?, ?, ?, ?, ?, 'ARS', 1000, ?, ?)").run(kind, demo, nets, until, ADS_VAULT.seal(creds), audience, state);
  d.prepare("INSERT INTO pauta (project_id, budget, start_date, end_date) VALUES (1, ?, '2026-11-01', '2026-12-31')").run(budget);
  const igc = ADS_VAULT.seal({ pageId: 'PAGE1', instagramBusinessId: 'IG1' });
  d.prepare("INSERT INTO accounts (id, project_id, network, creds) VALUES (1, 1, 'instagram', ?), (2, 1, 'youtube', ''), (3, 1, 'tiktok', ''), (4, 1, 'facebook', ?)").run(igc, ADS_VAULT.seal({ pageId: 'PAGE1' }));
  for (let i = 0; i < 25; i++) d.prepare('INSERT INTO padron VALUES (1, ?, ?)').run(`e${i}`.padEnd(16, 'a'), `p${i}`.padEnd(16, 'b'));
  const post = (id, acc, ext, vid = '') => {
    d.prepare("INSERT INTO posts (id, project_id, account_id, external_id, network_video_id, published_at) VALUES (?, 1, ?, ?, ?, '2026-11-18 03:00')").run(id, acc, ext, vid);
    d.prepare('INSERT INTO post_metrics (post_id, views, completion, likes, comments, shares) VALUES (?, 3000, 0.5, 300, 0, 0)').run(id);
  };
  const now = () => '2026-11-21 10:00';
  const run = (deps = {}) => marketingCycle(1, { db: d, adapters: buildAdapters(d, ADS_VAULT, 1, () => '2026-11-21'), now, ...deps });
  return { d, post, run, adapters: () => buildAdapters(d, ADS_VAULT, 1, () => '2026-11-21') };
}

// proyecto con todo lo que cuenta el resumen diario y los avisos de Telegram
function notifyFixture() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, demo INTEGER DEFAULT 0, score_weights TEXT DEFAULT '');
    CREATE TABLE pauta (project_id INTEGER PRIMARY KEY, budget REAL);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, network TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, account_id INT, status TEXT DEFAULT 'publicado', published_at TEXT DEFAULT '');
    CREATE TABLE reels (id INTEGER PRIMARY KEY, project_id INT, kind TEXT, title TEXT, status TEXT, status_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE learnings (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, variable TEXT NOT NULL, value TEXT NOT NULL, network TEXT, wins REAL DEFAULT 0, trials REAL DEFAULT 0, origin TEXT NOT NULL DEFAULT 'opinion_dueno', updated_at TEXT DEFAULT (datetime('now')));`);
  initAlerts(d); initMarketing(d); initMemory(d);
  d.exec("INSERT INTO projects (id, name) VALUES (1, 'Club Mock'), (2, 'Demo Mock'); UPDATE projects SET demo = 1 WHERE id = 2; INSERT INTO pauta VALUES (1, 100); INSERT INTO accounts VALUES (1, 'instagram'), (2, 'tiktok')");
  return d;
}
const TG = { token: '123:ABC-bueno', chat: '777' };
const tgLog = (sim) => sim.log.filter((l) => l.startsWith('telegram '));

function cases(video, sim) {
  const IG = { pageId: 'PAGE1', pageAccessToken: 'EAAprueba1234567', instagramBusinessId: 'IG1' };
  return [
    ['Memoria', 'Con 3 hermanas y datos simulados compareSiblings elige la de mayor score, guarda la comparación una sola vez y actualiza learnings', async () => {
      const f = memFixture(); f.clip('c1', 1, 10, [1000, 5000, 2000]);
      let calls = 0;
      const r = await compareSiblings('c1', { db: f.d, now: f.now, hypothesize: async (i) => { calls++; return hypo(i); } });
      eq([r.compared, r.winner_reel_id], [true, 11], 'ganadora = la de mayor score');
      const cmp = f.d.prepare('SELECT * FROM comparisons').all();
      eq([cmp.length, cmp[0].winner_reel_id, cmp[0].hypothesis, cmp[0].diff > 0], [1, 11, 'hipótesis de prueba: ganó la versión 2', true], 'comparación guardada');
      eq(JSON.parse(cmp[0].winner_recipe).variables.gancho, 'pregunta', 'receta ganadora');
      const gan = f.d.prepare("SELECT variable, value, wins, trials FROM learnings WHERE origin = 'comparacion' AND variable = 'gancho' ORDER BY value, wins").all();
      eq(gan, [{ variable: 'gancho', value: 'directo', wins: 0, trials: 1 }, { variable: 'gancho', value: 'directo', wins: 0, trials: 1 }, { variable: 'gancho', value: 'pregunta', wins: 1, trials: 1 }], 'trials a las 3, wins a la ganadora');
      const hor = f.d.prepare("SELECT value, network, wins FROM learnings WHERE variable = 'horario' ORDER BY value").all();
      eq(hor, [{ value: '10:00', network: 'instagram', wins: 0 }, { value: '14:00', network: 'instagram', wins: 1 }, { value: '18:00', network: 'instagram', wins: 0 }], 'horario por red');
      const otra = await compareSiblings('c1', { db: f.d, now: f.now, hypothesize: hypo });
      eq([otra.skipped, calls, f.d.prepare('SELECT count(*) n FROM learnings').get().n], ['ya comparado', 1, 3 * 5 + 3], 'una sola vez por recorte');
    }],
    ['Memoria', 'No compara si falta alguna hermana con 48 h de datos, en proyectos de demostración, y sin clave de Anthropic arma la hipótesis con los números', async () => {
      const joven = memFixture({ hoursOld: 30 }); joven.clip('c1', 1, 10, [1, 2, 3]);
      yes(/48 h/.test((await compareSiblings('c1', { db: joven.d, now: joven.now, hypothesize: hypo })).skipped), 'con 30 h no compara');
      const demo = memFixture({ demo: 1 }); demo.clip('c1', 1, 10, [1, 2, 3]);
      eq((await compareSiblings('c1', { db: demo.d, now: demo.now, hypothesize: hypo })).skipped, 'proyecto de demostración', 'demo');
      eq((await memoryCycle(demo.d, { now: demo.now, hypothesize: hypo })).compared, 0, 'el ciclo saltea demos');
      const f = memFixture(); f.clip('c1', 1, 10, [1000, 5000, 2000]);
      const k = [process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN]; delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
      try { await compareSiblings('c1', { db: f.d, now: f.now }); } finally { if (k[0]) process.env.ANTHROPIC_API_KEY = k[0]; if (k[1]) process.env.ANTHROPIC_AUTH_TOKEN = k[1]; }
      const h = f.d.prepare('SELECT hypothesis FROM comparisons').get().hypothesis;
      yes(/^La versión 2 ganó con un puntaje de/.test(h) && /gancho/.test(h), `hipótesis sin clave: ${h}`);
      const roto = memFixture(); roto.clip('c1', 1, 10, [1000, 5000, 2000]);
      await compareSiblings('c1', { db: roto.d, now: roto.now, hypothesize: async () => { throw new Error('caído'); } });
      yes(/^La versión 2 ganó/.test(roto.d.prepare('SELECT hypothesis FROM comparisons').get().hypothesis), 'si Sonnet falla queda el texto armado con los números');
    }],
    ['Memoria', 'R20: con 2 hermanas publicadas (la tercera rechazada) se compara; con 3 publicadas y una a 30 h se espera; ya comparado con 2 ediciones', async () => {
      const f = memFixture(); f.clip('c1', 1, 10, [1000, 5000, 2000]);
      f.d.prepare('DELETE FROM posts WHERE reel_id = 12').run(); // la tercera nunca se publicó
      const r = await compareSiblings('c1', { db: f.d, now: f.now, hypothesize: hypo });
      eq([r.compared, r.winner_reel_id], [true, 11], 'compara con 2');
      eq((await compareSiblings('c1', { db: f.d, now: f.now, hypothesize: hypo })).skipped, 'ya comparado', 'ya comparado con 2');
      const g = memFixture(); g.clip('c2', 1, 20, [1000, 5000, 2000]);
      g.d.prepare("UPDATE posts SET published_at = ? WHERE reel_id = 22").run('2026-11-19 06:00'); // ~30 h antes de now
      yes(/48 h/.test((await compareSiblings('c2', { db: g.d, now: g.now, hypothesize: hypo })).skipped), 'espera a la inmadura');
      eq(g.d.prepare('SELECT count(*) n FROM comparisons').get().n, 0, 'sin comparación');
      eq((await memoryCycle(g.d, { now: g.now, hypothesize: hypo })).compared, 0, 'el ciclo también espera');
      const h = memFixture(); h.clip('c3', 1, 30, [1, 2, 3]); h.d.prepare('DELETE FROM posts WHERE reel_id IN (31, 32)').run();
      eq((await compareSiblings('c3', { db: h.d, now: h.now, hypothesize: hypo })).skipped, 'menos de 2 hermanas publicadas', 'con 1 no compara');
    }],
    ['Memoria', 'Un 👎 de Gero cuenta 3×; winningVariables no devuelve nada con menos de 5 intentos, elige la mayor tasa y no mezcla proyectos', async () => {
      const f = memFixture(); const d = f.d;
      const L = (p, variable, value, wins, trials, origin, network = null) => d.prepare('INSERT INTO learnings (project_id, variable, value, network, wins, trials, origin) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p, variable, value, network, wins, trials, origin);
      eq(winningVariables(d, 1), {}, 'sin datos');
      for (let i = 0; i < 4; i++) L(1, 'gancho', 'directo', 1, 1, 'comparacion');
      eq(winningVariables(d, 1), {}, '4 intentos no alcanzan');
      L(1, 'gancho', 'directo', 1, 1, 'comparacion');
      eq(winningVariables(d, 1), { gancho: 'directo' }, '5 intentos');
      L(1, 'ritmo', 'lento', 0, 1, 'opinion_dueno');
      eq(winningVariables(d, 1).ritmo, undefined, 'un 👎 solo son 3 intentos');
      L(1, 'ritmo', 'lento', 0, 1, 'opinion_dueno');
      eq(winningVariables(d, 1).ritmo, 'lento', 'dos 👎 son 6 intentos ponderados (único valor con intentos)');
      for (let i = 0; i < 5; i++) L(1, 'ritmo', 'rapido', i < 4 ? 1 : 0, 1, 'comparacion');
      eq(winningVariables(d, 1).ritmo, 'rapido', 'gana la mayor tasa (4/5 contra 0/6)');
      for (let i = 0; i < 6; i++) L(1, 'horario', '20:00', i < 5 ? 1 : 0, 1, 'comparacion', 'instagram');
      for (let i = 0; i < 5; i++) L(1, 'horario', '09:00', 0, 1, 'comparacion', 'instagram');
      L(1, 'horario', '12:00', 1, 1, 'comparacion', 'tiktok');
      eq(winningVariables(d, 1).horario, { instagram: '20:00' }, 'horario por red (tiktok sin intentos suficientes)');
      for (let i = 0; i < 5; i++) L(2, 'largo', 'corto', 1, 1, 'comparacion');
      eq([winningVariables(d, 1).largo, winningVariables(d, 2)], [undefined, { largo: 'corto' }], 'cada proyecto ve solo lo suyo');
      // el planificador recibe el horario aprendido desde las variables ganadoras
      const db = new DatabaseSync(':memory:'); db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, demo INTEGER DEFAULT 0, kind TEXT DEFAULT 'club');
        CREATE TABLE accounts (id INTEGER PRIMARY KEY, project_id INTEGER, network TEXT, status TEXT, posts_per_day INTEGER DEFAULT 3);
        CREATE TABLE reels (id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT, clip_id TEXT, review TEXT, expires_at TEXT DEFAULT '', recipe TEXT, archived_at TEXT DEFAULT '');
        CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INTEGER, reel_id INTEGER, account_id INTEGER, scheduled_at TEXT, status TEXT DEFAULT 'programado');
        CREATE TABLE learnings (project_id INTEGER, variable TEXT, value TEXT, network TEXT, wins REAL, trials REAL, origin TEXT DEFAULT 'comparacion');
        INSERT INTO projects (id, name) VALUES (1, 'Club'); INSERT INTO accounts (project_id, network, status, posts_per_day) VALUES (1, 'instagram', 'conectada', 1);
        INSERT INTO reels (id, project_id, kind, clip_id, review) VALUES (1, 1, 'listo', 'c', 'aprobado');`);
      initPlanner(db); initAlerts(db);
      for (let i = 0; i < 5; i++) db.prepare("INSERT INTO learnings (project_id, variable, value, network, wins, trials) VALUES (1, 'horario', '20:00', 'instagram', 1, 1)").run();
      eq(planProject(db, 1, { now: '2026-12-01 07:30', date: '2026-12-01' }).map((p) => p.scheduled_at), ['2026-12-01 20:00'], 'el planificador usa el horario ganador');
    }],
    ['Conexiones', 'Instagram: trae el usuario y los seguidores', async () => { const r = await testConnection('instagram', { pageId: 'PAGE1', pageAccessToken: IG.pageAccessToken }); eq(r.connectedAs, '@mock.ig', 'usuario'); eq(r.extra.instagramBusinessId, 'IG1', 'ID de Instagram'); }],
    ['Conexiones', 'Facebook: trae el nombre de la Página', async () => { const r = await testConnection('facebook', { pageId: 'PAGE1', pageAccessToken: IG.pageAccessToken }); eq(r.connectedAs, 'Página Mock', 'nombre'); }],
    ['Conexiones', 'TikTok: renueva solo el token vencido', async () => { const r = await testConnection('tiktok', { accessToken: 'TT_VIEJO', refreshToken: 'R', clientKey: 'k', clientSecret: 's' }); eq(r.connectedAs, '@mock.tt', 'usuario'); eq(r.extra.accessToken, 'TT_OK', 'token nuevo'); }],
    ['Conexiones', 'YouTube: trae el canal', async () => { const r = await testConnection('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }); eq(r.connectedAs, '@canalmock', 'canal'); }],
    ['Métricas', 'Cada red devuelve sus métricas', async () => {
      const ig = await readMetrics('instagram', IG, 'M1', { duration: 15 });
      eq([ig.views, ig.reach, ig.avg_watch_s, ig.completion, ig.likes, ig.comments, ig.shares], [1500, 1100, 4.5, 0.3, 90, 12, 8], 'Instagram');
      const fb = await readMetrics('facebook', IG, 'V1', { duration: 12 });
      eq([fb.views, fb.reach, fb.avg_watch_s, fb.completion, fb.likes, fb.comments, fb.shares], [800, 600, 3, 0.25, 40, 5, 3], 'Facebook');
      process.env.ACM_YT_ANALYTICS = '1';
      const yt = await readMetrics('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 'Y1');
      eq([yt.views, yt.avg_watch_s, yt.completion, yt.likes, yt.comments, yt.shares], [2000, 9, 0.6, 150, 20, 30], 'YouTube');
      delete process.env.ACM_YT_ANALYTICS;
      const yt0 = await readMetrics('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 'Y1');
      eq([yt0.views, yt0.avg_watch_s, yt0.shares], [2000, null, null], 'YouTube sin Analytics (no se llama)');
      const tt = await readMetrics('tiktok', { accessToken: 'TT_OK' }, 'TV1');
      eq([tt.views, tt.likes, tt.comments, tt.shares, tt.reach], [5000, 400, 30, 60, null], 'TikTok');
    }],
    ['Métricas', 'La lectura guarda una fila por publicación y un error no frena a las otras ni muestra el token', async () => {
      const vault = makeVault('banco'), d = new DatabaseSync(':memory:');
      d.exec("PRAGMA foreign_keys = ON; CREATE TABLE projects (id INTEGER PRIMARY KEY, demo INTEGER DEFAULT 0); CREATE TABLE accounts (id INTEGER PRIMARY KEY, network TEXT, creds TEXT);"
        + "CREATE TABLE reels (id INTEGER PRIMARY KEY, duration REAL); CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, reel_id INT, account_id INT, status TEXT, external_id TEXT, published_at TEXT, network_video_id TEXT DEFAULT '');");
      initMetrics(d);
      d.exec("INSERT INTO projects (id, demo) VALUES (1, 0), (2, 1); INSERT INTO reels VALUES (1, 15)");
      const acc = d.prepare('INSERT INTO accounts (id, network, creds) VALUES (?, ?, ?)');
      acc.run(1, 'instagram', vault.seal(IG)); acc.run(2, 'instagram', vault.seal({ ...IG, pageAccessToken: 'EAAsecretoNoVisible99' })); acc.run(3, 'tiktok', vault.seal({ accessToken: 'TT_OK' }));
      const post = d.prepare("INSERT INTO posts (id, project_id, reel_id, account_id, status, external_id, published_at) VALUES (?, ?, 1, ?, 'publicado', ?, ?)");
      const pub = await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'SELF_ONLY' });
      eq(pub.id, 'P1', 'publish_id');
      post.run(1, 1, 2, 'BAD', '2030-01-10 10:00'); post.run(2, 1, 1, 'M1', '2030-01-10 11:00'); post.run(3, 1, 3, pub.id, '2030-01-10 12:00');
      post.run(4, 2, 1, 'M1', '2030-01-10 12:00'); post.run(5, 1, 1, 'M1', '2029-12-01 12:00');
      const r = await readDue(d, vault, { since: '2030-01-05 00:00' });
      eq(r, { read: 2, failed: 1 }, 'resultado');
      const rows = d.prepare('SELECT * FROM post_metrics ORDER BY post_id').all();
      eq(rows.map((x) => x.post_id), [1, 2, 3], 'filas (la demo y la vieja no se leen)');
      yes(rows[0].note && rows[0].views === null && !rows[0].note.includes('EAAsecretoNoVisible99'), `nota con el token: ${rows[0].note}`);
      eq([rows[1].views, rows[1].spend, rows[1].target_reach, rows[2].views], [1500, 0, 0, 5000], 'valores');
      eq(d.prepare('SELECT network_video_id v FROM posts WHERE id = 3').get().v, 'TV1', 'el ID del video queda guardado');
      const n = sim.log.filter((l) => l.includes('/tt/v2/post/publish/status/fetch/')).length;
      await readDue(d, vault, { since: '2030-01-05 00:00' });
      eq(sim.log.filter((l) => l.includes('/tt/v2/post/publish/status/fetch/')).length, n, 'la segunda lectura ya no pregunta el estado');
      // el corte va en hora local 'YYYY-MM-DD HH:MM', igual que published_at
      d.exec("DELETE FROM post_metrics; INSERT INTO posts (id, project_id, reel_id, account_id, status, external_id, published_at) VALUES (6, 1, 1, 1, 'publicado', 'M1', '2030-01-05 00:00'), (7, 1, 1, 1, 'publicado', 'M1', '2030-01-04 23:59')");
      await readDue(d, vault, { since: '2030-01-05 00:00' });
      yes(d.prepare('SELECT count(*) n FROM post_metrics WHERE post_id = 6').get().n === 1 && d.prepare('SELECT count(*) n FROM post_metrics WHERE post_id = 7').get().n === 0, 'corte inclusivo en el límite');
      let bad = ''; try { await readDue(d, vault, { since: '2030-01-05T00:00:00Z' }); } catch (e) { bad = e.message; }
      yes(/since/.test(bad), 'formato ISO rechazado');
    }],
    ['Métricas', 'El puntaje premia más personas del público por dólar con los pesos por defecto', () => {
      const base = { views: 1000, likes: 50, comments: 5, shares: 5, completion: 0.4, spend: 10, impressions: 5000 };
      const a = score({ ...base, target_reach: 100 }, DEFAULT_WEIGHTS), b = score({ ...base, target_reach: 400 }, DEFAULT_WEIGHTS);
      yes(b > a, `400 personas tendría que puntuar más que 100: ${b} vs ${a}`);
      const sin = score({ views: 1000, likes: 50, comments: 5, shares: 5, completion: 0.4 }, DEFAULT_WEIGHTS);
      yes(sin > 0 && sin <= 1, `sin gasto usa la parte orgánica: ${sin}`);
      yes(score({ ...base, target_reach: 100 }, { target_reach_per_usd: 0, impressions_per_usd: 0, completion: 1, engagement: 0 }) === 0.4, 'pesos propios');
    }],
    ['Conexiones', 'Un error de Meta no muestra el token', async () => {
      let msg = '';
      try { await testConnection('facebook', { pageId: 'PAGEBAD', pageAccessToken: 'EAAsecretoNoVisible99' }); } catch (e) { msg = e.message; }
      yes(msg, 'tendría que haber fallado'); yes(!msg.includes('EAAsecretoNoVisible99'), `el error muestra el token: ${msg}`);
    }],
    ['Publicación', 'Instagram: sube el video y publica el Reel', async () => { const r = await publish('instagram', IG, video, 'Prueba', 'Prueba'); eq(r.id, 'M1', 'publicación'); yes(r.url.includes('instagram.com'), 'sin link'); }],
    ['Publicación', 'Facebook: publica el Reel de la Página', async () => { const r = await publish('facebook', IG, video, 'Prueba', 'Prueba'); eq(r.id, 'V1', 'video'); }],
    ['Publicación', 'TikTok: sin app aprobada pasa a privado y avisa', async () => { const r = await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'PUBLIC_TO_EVERYONE', allowComment: true }); eq(r.id, 'P1', 'publicación'); yes(/privado/.test(r.note), 'no avisó que sale privado'); }],
    ['Publicación', 'TikTok: sin privacidad elegida no publica (regla de TikTok)', async () => {
      let msg = ''; try { await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba'); } catch (e) { msg = e.message; }
      yes(/privacidad/.test(msg), `tendría que pedir la privacidad: ${msg}`);
    }],
    ['Publicación', 'TikTok: con cuenta pública y app sin aprobar explica cómo hacerla privada', async () => {
      let msg = ''; try { await publish('tiktok', { accessToken: 'TT_PUBLICA' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'SELF_ONLY' }); } catch (e) { msg = e.message; }
      yes(/Cuenta privada/.test(msg), `tendría que explicar cómo hacer privada la cuenta: ${msg}`);
    }],
    ['Publicación', 'TikTok: comentarios, dúos y stitch apagados salvo que se pidan', async () => {
      await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'SELF_ONLY', allowComment: true });
      const last = JSON.parse(sim.log.filter((l) => l.startsWith('ttinit ')).pop().slice(7));
      eq([last.disable_comment, last.disable_duet, last.disable_stitch], [false, true, true], 'comentarios, dúos, stitch apagados');
    }],
    ['Publicación', 'YouTube: sube el Short', async () => { const r = await publish('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }, video, 'Prueba', 'Prueba'); eq(r.id, 'Y1', 'video'); }],
    ['Reglas', 'No publica con la cuenta pausada, desconectada ni fuera de fecha', async () => {
      eq(postBlocked({ scheduled_at: '2026-12-01 10:00', propaganda_until: '2026-12-10', acc_status: 'conectada' }), null, 'cuenta conectada en fecha');
      yes(/pausada/.test(postBlocked({ scheduled_at: '2026-12-01 10:00', acc_status: 'pausada' })), 'cuenta pausada');
      yes(/no está conectada/.test(postBlocked({ scheduled_at: '2026-12-01 10:00', acc_status: 'pendiente' })), 'cuenta sin conectar');
      yes(/fecha máxima/.test(postBlocked({ scheduled_at: '2026-12-11 10:00', propaganda_until: '2026-12-10', acc_status: 'conectada' })), 'fuera de la fecha de propaganda');
    }],
    ['Padrón', 'Pasa los celulares al formato de Meta y descarta los DNI', async () => {
      eq(['11 15 6789-0123', '+54 9 351 555 1234', '0351 15 555 1234', '011 4555-1234', '30123456'].map(normPhone),
        ['5491167890123', '5493515551234', '5493515551234', '5491145551234', ''], 'teléfonos');
    }],
    ['Padrón', 'Lee un CSV y encuentra solas las columnas', async () => {
      const csv = 'Socio;Nombre;DNI;Celular;Correo\n1;Ana;30111222;11 15 1234-5678;ana@x.com\n2;Beto;30111223;;\n3;Caro;30111224;;caro@y.com.ar\n';
      const r = await readPadron(Buffer.from(csv), 'padron.csv');
      eq([r.total, r.phones, r.emails, r.contacts], [3, 1, 2, 2], 'socios, teléfonos, mails, contactables');
      yes(r.hashes.every(([em, ph]) => (!em || em.length === 64) && (!ph || ph.length === 64)), 'no son huellas SHA-256');
    }],
    ['Padrón', 'Lee Excel con mails con formato, links y números', async () => {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Padrón');
      ws.addRow(['Socio', 'DNI', 'Celular', 'E-mail']);
      ws.addRow([1, 30111222, 1167890123, { text: 'ana@x.com', hyperlink: 'mailto:ana@x.com' }]);
      ws.addRow([2, 30111223, '11 15 2222-3333', { richText: [{ text: 'beto' }, { font: { bold: true }, text: '@y.com' }] }]);
      ws.addRow([3, 30111224, null, { formula: 'LOWER("CARO@Z.COM")', result: 'caro@z.com' }]);
      const r = await readPadron(Buffer.from(await wb.xlsx.writeBuffer()), 'padron.xlsx');
      eq([r.total, r.phones, r.emails, r.contacts], [3, 2, 3, 3], 'socios, teléfonos, mails, contactables');
    }],
    ['Padrón', 'Lee un CSV de Excel en Latin-1 sin romper los encabezados', async () => {
      const r = await readPadron(Buffer.from('Nº;Móvil;Dirección de correo\n1;1167890123;a@x.com\n2;;b@y.com\n3;;c@y.com\n4;;d@y.com\n', 'latin1'), 'padron.csv');
      eq([r.total, r.phones, r.emails], [4, 1, 4], 'socios, teléfonos, mails');
    }],
    ['Pauta', 'USD 3.000 en 33 días sobre el padrón de 65.000', async () => {
      const n = pautaNumbers({ budget: 3000, from: '2026-11-08', to: '2026-12-10', padron: 65000, contacts: 59584 });
      eq(n.days, 33, 'días'); eq(n.people, 35750, 'socios alcanzados'); eq(Math.round(n.freq), 19, 'veces por socio');
    }],
    ['Investigación', 'El modelo de vectores está y busca por significado', async () => {
      const docs = ['Gaudio promete el sponsor más grande de la historia del club', 'La FIFA inhibió al club por la deuda con Bragantino', 'Nakis es prosecretario de la AFA y cercano a Tapia'];
      const [q] = await embed(['quién tiene relación con la AFA'], 'query');
      const D = await embed(docs);
      const s = D.map((v) => v.reduce((a, x, i) => a + x * q[i], 0));
      eq(s.indexOf(Math.max(...s)), 2, 'la ficha más parecida');
    }],
    ['Meta Ads', 'Sube el padrón como público en tandas', async () => {
      const rows = Array.from({ length: 25000 }, (_, i) => ({ em: 'e' + i, ph: '' }));
      const r = await uploadAudience({ adAccountId: '999', accessToken: 'EAAads' }, 'Prueba', rows);
      eq(r.id, 'AUD1', 'público'); eq(r.received, 25000, 'contactos recibidos');
    }],
    ['Meta Ads', 'Crea la campaña en pausa con su anuncio', async () => {
      const c = { adAccountId: '999', accessToken: 'EAAads', pageId: 'PAGE1', instagramId: 'IG1' };
      eq((await testAds(c)).currency, 'ARS', 'moneda');
      const r = await createCampaign(c, { name: 'Prueba', budget: 1000, start: '2026-11-08T00:00:00-03:00', end: '2026-12-10T23:59:00-03:00', perWeek: 2.5, audienceId: 'AUD1', political: true, media: [{ id: 'M1', title: 'Reel' }] });
      eq(r.campaignId, 'CAMP1', 'campaña'); eq(r.ads.length, 1, 'anuncios');
    }],
    ['Circuito', 'Redes con pauta por defecto: política sin TikTok, el resto con las tres', async () => {
      eq(defaultAdsNetworks('politica'), { meta: true, youtube: true, tiktok: false }, 'política');
      eq(defaultAdsNetworks('club'), { meta: true, youtube: true, tiktok: true }, 'club');
      eq(defaultAdsNetworks('comercial'), { meta: true, youtube: true, tiktok: true }, 'comercial');
    }],
    ['Circuito', 'Regla: dos versiones del recorte en la misma red van con 3 h de distancia, en otra red no importa', async () => {
      const post = (at, network = 'instagram', account_id = 1) => ({ reel_id: 1, account_id, network, scheduled_at: at, clip_id: 'c1', review: 'aprobado' });
      const ctx = (sib) => ({ siblings: sib, dayCount: 0, networkCap: 100, tz: 'America/Argentina/Buenos_Aires' });
      const otra = { network: 'instagram', scheduled_at: '2026-12-01 10:00', account_id: 2 };
      yes(/3 horas/.test(scheduleBlocked(post('2026-12-01 12:59'), ctx([otra]))), 'a 2 h 59 min tendría que bloquear');
      yes(/3 horas/.test(scheduleBlocked(post('2026-12-01 09:01'), ctx([{ ...otra, scheduled_at: '2026-12-01 12:00' }]))), 'la hermana sale 2 h 59 min después: también bloquea');
      eq(scheduleBlocked(post('2026-12-01 13:00'), ctx([otra])), null, 'a 3 h');
      eq(scheduleBlocked(post('2026-12-01 10:00', 'facebook', 3), ctx([otra])), null, 'otra red a 0 min');
    }],
    ['Circuito', 'Regla: solo de 08:00 a 23:00 hora local', async () => {
      const at = (hm) => scheduleBlocked({ reel_id: 1, account_id: 1, network: 'tiktok', scheduled_at: `2026-12-01 ${hm}`, clip_id: 'c', review: 'aprobado' }, { siblings: [], dayCount: 0, networkCap: 15 });
      yes(at('07:59'), '07:59'); yes(at('23:01'), '23:01'); eq(at('08:00'), null, '08:00'); eq(at('23:00'), null, '23:00');
    }],
    ['Circuito', 'withinWindow: la hora real también respeta 08:00-23:00', async () => {
      eq(['07:59', '08:00', '23:00', '23:01'].map(withinWindow), [false, true, true, false], 'ventana');
      eq(withinWindow('2026-12-01 12:00'), true, 'con fecha');
    }],
    ['Circuito', 'Regla: sin aprobar no se programa', async () => {
      const p = { reel_id: 1, account_id: 1, network: 'instagram', scheduled_at: '2026-12-01 12:00', clip_id: 'c' };
      for (const review of ['pendiente', 'rechazado', undefined]) yes(/aprobado/.test(scheduleBlocked({ ...p, review }, { siblings: [], dayCount: 0, networkCap: 100 })), `review ${review}`);
      eq(scheduleBlocked({ ...p, review: 'aprobado' }, { siblings: [], dayCount: 0, networkCap: 100 }), null, 'aprobado');
    }],
    ['Circuito', 'Regla: tope diario por red y cuota de YouTube', async () => {
      const p = { reel_id: 1, account_id: 1, network: 'tiktok', scheduled_at: '2026-12-01 12:00', clip_id: 'c', review: 'aprobado' };
      yes(/tope/.test(scheduleBlocked(p, { siblings: [], dayCount: 15, networkCap: NETWORK_CAPS.tiktok })), 'en el tope');
      eq(scheduleBlocked(p, { siblings: [], dayCount: 14, networkCap: NETWORK_CAPS.tiktok }), null, 'debajo del tope');
      eq(NETWORK_CAPS, { instagram: 100, facebook: 30, tiktok: 15, youtube: null }, 'topes');
      eq(youtubeShare(100, 8), 12, 'cuota de YouTube');
    }],
    ['Circuito', 'Planificador: 7 cuentas de IG y 21 ediciones, 3 por cuenta, en horario, sin repetir edición y con las hermanas a 3 h', async () => {
      const { accounts, bank } = planFixture(7, 7);
      const plan = planDay({ accounts, bank, existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' });
      eq(plan.length, 21, 'publicaciones');
      for (const a of accounts) eq(plan.filter((p) => p.account_id === a.id).length, 3, `cuenta ${a.id}`);
      yes(plan.every((p) => withinWindow(p.scheduled_at)), 'fuera de 08:00-23:00');
      eq(new Set(plan.map((p) => p.reel_id)).size, 21, 'edición repetida en IG');
      yes(siblingsOk(plan, bank), 'hermanas a menos de 3 h');
    }],
    ['Circuito', 'Planificador: correr dos veces con una edición nueva en el medio agrega solo esa, sin mover ni duplicar', async () => {
      const { accounts, bank } = planFixture(7, 7);
      const first = planDay({ accounts, bank: bank.slice(0, 18), existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' });
      eq(first.length, 18, 'primera tanda');
      const again = planDay({ accounts, bank: bank.slice(0, 18), existingPosts: first.map((p) => ({ ...p, status: 'programado' })), date: '2026-12-01', now: '2026-12-01 07:31' });
      eq(again, [], 'repetir sin novedades no agrega nada');
      const nuevo = planDay({ accounts, bank: bank.slice(0, 19), existingPosts: first.map((p) => ({ ...p, status: 'programado' })), date: '2026-12-01', now: '2026-12-01 07:32' });
      eq(nuevo.map((p) => p.reel_id), [bank[18].id], 'solo la edición nueva');
      const todo = [...first, ...nuevo];
      eq(new Set(todo.map((p) => `${p.reel_id}|${p.account_id}`)).size, 19, 'sin duplicados');
      yes(siblingsOk(todo, bank), 'hermanas a menos de 3 h después de sumar la nueva');
    }],
    ['Circuito', 'Planificador: 10 ediciones para 21 lugares programa 10 sin repetir; vacío dos días seguidos alerta falta_material una vez', async () => {
      const { accounts, bank } = planFixture(7, 4);
      const plan = planDay({ accounts, bank: bank.slice(0, 10), existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' });
      eq(plan.length, 10, 'programadas'); eq(new Set(plan.map((p) => p.reel_id)).size, 10, 'repetidas');
      const db = new DatabaseSync(':memory:');
      db.exec(`PRAGMA foreign_keys = ON; CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, demo INTEGER DEFAULT 0);
        CREATE TABLE accounts (id INTEGER PRIMARY KEY, project_id INTEGER, network TEXT, status TEXT, posts_per_day INTEGER DEFAULT 3);
        CREATE TABLE reels (id INTEGER PRIMARY KEY, project_id INTEGER, kind TEXT, clip_id TEXT, review TEXT, expires_at TEXT DEFAULT '', recipe TEXT, archived_at TEXT DEFAULT '');
        CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INTEGER, reel_id INTEGER, account_id INTEGER, scheduled_at TEXT, status TEXT DEFAULT 'programado');
        CREATE TABLE learnings (project_id INTEGER, variable TEXT, value TEXT, network TEXT, wins REAL, trials REAL, origin TEXT DEFAULT 'comparacion');
        INSERT INTO projects (id, name) VALUES (1, 'Club'); INSERT INTO accounts (project_id, network, status) VALUES (1, 'instagram', 'conectada');`);
      initPlanner(db); initAlerts(db);
      const alertas = () => db.prepare("SELECT count(*) n FROM alerts WHERE kind = 'falta_material'").get().n;
      planProject(db, 1, { now: '2026-12-01 07:30' }); eq(alertas(), 0, 'el primer día vacío no alerta');
      planProject(db, 1, { now: '2026-12-01 09:00' }); eq(alertas(), 0, 'repetir el mismo día no cuenta como otro');
      planProject(db, 1, { now: '2026-12-02 07:30' }); eq(alertas(), 1, 'dos días seguidos vacíos alertan');
      planProject(db, 1, { now: '2026-12-02 10:00' }); eq(alertas(), 1, 'un aviso por día');
      planProject(db, 1, { now: '2026-12-04 07:30' }); eq(alertas(), 1, 'con un día de por medio no alerta');
      // un banco con solo ediciones que no pueden salir hoy (vencen antes de las 08:00) cuenta como vacío
      db.exec("INSERT INTO reels (id, project_id, kind, clip_id, review, expires_at) VALUES (1, 1, 'listo', 'x', 'aprobado', '2026-12-05 07:50')");
      planProject(db, 1, { now: '2026-12-05 07:30' }); // el 04 estaba vacío y el 05 solo tiene una edición que vence a las 07:50
      eq(alertas(), 2, 'ediciones imposibles de ubicar por vencimiento también dan falta_material');
    }],
    ['Circuito', 'Planificador: no programa reels vencidos ni sin aprobar, ni en cuentas no conectadas', async () => {
      const { accounts, bank } = planFixture(2, 2);
      bank[0].expires_at = '2026-12-01 06:00'; bank[1].review = 'pendiente'; bank[2].expires_at = '2026-12-01 23:59';
      accounts[1].status = 'pausada';
      const plan = planDay({ accounts, bank, existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' });
      yes(!plan.some((p) => p.reel_id === bank[0].id), 'programó un vencido'); yes(!plan.some((p) => p.reel_id === bank[1].id), 'programó uno sin aprobar');
      yes(plan.some((p) => p.reel_id === bank[2].id), 'el que vence a la noche sí va');
      yes(plan.every((p) => p.account_id === accounts[0].id), 'usó una cuenta no conectada');
    }],
    ['Circuito', 'Planificador: una edición que vence a las 10:00 no recibe horario después de las 10:00 y sale temprano; si no entra, no se programa', async () => {
      const acc = [{ id: 1, network: 'instagram', status: 'conectada', posts_per_day: 3 }];
      const mk = (id, expires_at) => ({ id, clip_id: `c${id}`, review: 'aprobado', expires_at, recipe: null });
      const plan = planDay({ accounts: acc, bank: [mk(1, ''), mk(2, '2026-12-01 10:00')], existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' });
      const v = plan.find((p) => p.reel_id === 2); yes(v && v.scheduled_at <= '2026-12-01 10:00', `la que vence a las 10: ${v?.scheduled_at}`);
      eq(plan.find((p) => p.reel_id === 1) && plan[0].reel_id, 2, 'la que vence primero va primero');
      eq(planDay({ accounts: acc, bank: [mk(2, '2026-12-01 07:45')], existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30' }), [], 'vence antes de abrir la ventana: no entra');
      eq(planDay({ accounts: acc, bank: [mk(2, '2026-12-01 23:59')], existingPosts: [], date: '2026-12-02', now: '2026-12-01 23:00' }), [], 'vence antes del día a repartir');
    }],
    ['Circuito', 'Al publicar, una edición vencida se bloquea (la regla del programador)', async () => {
      yes(/venció/.test(expiredBlocked('2026-12-01 10:00', '2026-12-01 10:01')), 'vencida');
      eq(expiredBlocked('2026-12-01 10:00', '2026-12-01 10:00'), null, 'justo a la hora');
      eq(expiredBlocked('', '2026-12-01 10:00'), null, 'sin vencimiento');
      eq(expiredBlocked('2026-12-01', '2026-12-01 23:30'), null, 'solo fecha: vale todo el día');
    }],
    ['Circuito', 'Presupuesto: tope diario (restante ÷ días) con techo de 2x y reparto entre redes con piso del 10 %', async () => {
      eq(dailyCap({ budget: 1000, spent: 400, from: '2026-11-01', to: '2026-11-30', today: '2026-11-21' }), 60, 'tope');
      yes(dailyCap({ budget: 1000, spent: 0, from: '2026-11-01', to: '2026-11-30', today: '2026-11-04' }) <= 120, '3 días sin gastar no pasa de 120');
      yes(dailyCap({ budget: 1000, spent: 0, from: '2026-11-01', to: '2026-11-30', today: '2026-11-29' }) <= 2 * 1000 / 30 + 0.01, 'techo de 2x el tope base aunque queden pocos días');
      eq(dailyCap({ budget: 1000, spent: 500, from: '2026-11-01', to: '2026-11-30', today: '2026-12-01' }), 0, 'pasada la fecha no hay tope');
      eq(dailyCap({ budget: 1000, spent: 430, from: '2026-11-01', to: '2026-11-30', today: '2026-11-21', spentToday: 30 }), 60, 'lo gastado hoy no mueve el tope del día');
      eq(splitNetworks({ enabled: { meta: true, youtube: true, tiktok: true } }), { meta: 34, youtube: 33, tiktok: 33 }, 'parejo');
      let sp = splitNetworks({ enabled: { meta: true, youtube: true, tiktok: false }, perf: { meta: 0.9, youtube: 0.01 } });
      eq(sp.tiktok, 0, 'TikTok apagado no recibe');
      let prev = null;
      for (let i = 0; i < 12; i++) { sp = splitNetworks({ enabled: { meta: true, youtube: true, tiktok: false }, perf: { meta: 0.99, youtube: 0.001 }, prev }); prev = sp; eq(sp.meta + sp.youtube + sp.tiktok, 100, 'suma 100'); }
      eq(sp, { meta: 90, youtube: 10, tiktok: 0 }, 'YouTube no baja del 10 %');
      eq(canJudge({ spend: 4, promotedHours: 47 }), false, 'sin base para juzgar');
      eq(canJudge({ spend: 5, promotedHours: 0 }), true, 'USD 5'); eq(canJudge({ spend: 0, promotedHours: 48 }), true, '48 h');
    }],
    ['Circuito', 'Ciclo de marketing: solo promociona reels de 24 h o más con el mejor puntaje, anota la decisión y no toca demos', async () => {
      const f = mktFixture();
      f.post(1, 1, '2026-11-21 00:00', 9000, 900, 0.9); // 10 h: no entra aunque sea el mejor
      f.post(2, 1, '2026-11-20 04:00', 1000, 20, 0.2);  // 30 h
      f.post(3, 1, '2026-11-20 03:00', 3000, 300, 0.8); // 31 h, el mejor
      const r = await marketingCycle(1, f.deps);
      eq(r.promoted, 2, 'promueve los dos de 24 h o más (tope de 2 por red)');
      yes(!f.log.some((l) => l.startsWith('meta:promote:1:')), 'el de 10 h no se promociona');
      yes(f.log.some((l) => l.startsWith('meta:promote:3:')), 'el de mejor puntaje sí');
      const dec = f.d.prepare("SELECT * FROM decisions WHERE kind = 'promover' ORDER BY id").all();
      yes(dec.length === 2 && dec[0].reason.includes('post 3') && dec[0].project_id === 1 && dec[0].at === '2026-11-21 10:00', 'decisión escrita en español');
      const tot = f.d.prepare("SELECT sum(daily_usd) t FROM promotions WHERE status = 'activa'").get().t;
      yes(tot <= dailyCap({ budget: 100, spent: 0, from: '2026-11-01', to: '2026-11-30', today: '2026-11-21' }) + 0.001, 'lo comprometido no pasa el tope de hoy');
      const demo = mktFixture({ demo: 1 }); demo.post(2, 1, '2026-11-20 04:00', 1000);
      eq((await marketingCycle(1, demo.deps)).skipped, 'proyecto de demostración', 'demo'); eq(demo.log, [], 'demo sin llamadas');
      const sin = mktFixture(); sin.post(2, 1, '2026-11-20 04:00', 1000);
      eq((await marketingCycle(1, { ...sin.deps, adapters: {} })).skipped, 'sin adaptadores', 'sin adaptadores no hace nada');
      eq(sin.d.prepare('SELECT count(*) n FROM promotions').get().n, 0, 'nada promovido');
    }],
    ['Circuito', 'Ciclo de marketing: guardSpend baja el pedido a lo que queda y, pasada la fecha máxima, se pausa todo', async () => {
      const g = guardSpend({ kind: 'raise', dailyUsd: 10, currentUsd: 0 }, { remainingTotal: 2, cap: 60, committedOthers: 0 });
      eq([g.ok, g.usd, g.clamped], [true, 2, true], 'queda USD 2 y pide 10');
      eq(guardSpend({ kind: 'raise', dailyUsd: 10, currentUsd: 0 }, { remainingTotal: 50, cap: 60, baseCap: 4, committedOthers: 0 }).usd, 8, 'nunca más de 2x el tope base');
      eq(guardSpend({ kind: 'raise', dailyUsd: 10, currentUsd: 5 }, { remainingTotal: 100, cap: 12, committedOthers: 8 }).usd, 4, 'el tope de hoy descuenta a los demás');
      eq(guardSpend({ kind: 'raise', dailyUsd: 10, currentUsd: 0 }, { remainingTotal: 100, cap: 12, committedOthers: 12 }).ok, false, 'sin lugar se rechaza');
      // quedan USD 2 de pauta: lo nuevo no pasa de 2 (y 2 >= mínimo para lanzar)
      const f = mktFixture({ budget: 100, end: '2026-11-21' });
      f.post(3, 1, '2026-11-20 03:00', 3000, 300, 0.8);
      f.d.exec("INSERT INTO posts (id, project_id, account_id, external_id, published_at) VALUES (9, 1, 1, 'X9', '2026-11-01 10:00')");
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at, spend) VALUES (1, 9, 'meta', 'meta-9', 0, 'cortada', '2026-11-02 10:00', '2026-11-05 10:00', 98)");
      const r = await marketingCycle(1, f.deps);
      eq(r.promoted, 1, 'promueve');
      const act = f.d.prepare("SELECT sum(daily_usd) t FROM promotions WHERE status = 'activa'").get().t;
      yes(act <= 2 + 1e-9, `lo comprometido (${act}) no pasa lo que queda (USD 2)`);
      // pasada la fecha máxima de propaganda: pausa todo en el mismo ciclo
      const h = mktFixture({ until: '2026-11-20' });
      h.post(3, 1, '2026-11-18 03:00', 3000, 300, 0.8);
      h.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'meta', 'meta-3', 10, 'activa', '2026-11-19 10:00', '2026-11-19 10:00'), (1, 3, 'youtube', 'youtube-3', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      const r2 = await marketingCycle(1, h.deps);
      eq(r2.paused, 2, 'pausó todo');
      eq(h.d.prepare("SELECT count(*) n FROM promotions WHERE status = 'activa'").get().n, 0, 'ninguna activa');
      yes(h.log.includes('meta:pause:meta-3') && h.log.includes('youtube:pause:youtube-3'), 'se pausó en las redes');
      yes(!h.log.some((l) => l.includes(':promote:')), 'no lanza nada nuevo');
      eq(h.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'pausa_total'").get().n, 2, 'decisiones anotadas');
      // el gasto real cuenta: con el total gastado también se pausa todo
      const k = mktFixture({ budget: 50 });
      k.post(3, 1, '2026-11-18 03:00', 3000, 300, 0.8);
      k.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'meta', 'meta-3', 10, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      k.spend['meta-3'] = 50;
      eq((await marketingCycle(1, k.deps)).paused, 1, 'se terminó la pauta');
      // un ciclo encima de otro no gasta dos veces; un anuncio rechazado se anota y no frena
      const m = mktFixture(); m.post(3, 1, '2026-11-18 03:00', 3000, 300, 0.8);
      m.deps.adapters.meta.promote = async () => { throw new AdRejected('contenido no permitido'); };
      const [a, b] = await Promise.all([marketingCycle(1, m.deps), marketingCycle(1, m.deps)]);
      yes([a.skipped, b.skipped].includes('ya hay un ciclo corriendo'), 'el segundo ciclo simultáneo se saltea');
      eq(m.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'rechazo'").get().n, 1, 'rechazo anotado');
    }],
    ['Circuito', 'Ciclo de marketing: el tope del día cuenta lo ya gastado, y corta, sube, baja y respeta redes apagadas y la fecha de inicio', async () => {
      const today = '2026-11-21';
      const gastadoHoy = (d) => d.prepare('SELECT spend, spend_day, spend_day_start FROM promotions').all().reduce((a, r) => a + (r.spend_day === today ? r.spend - r.spend_day_start : 0), 0);
      const comprometido = (d) => d.prepare("SELECT coalesce(sum(daily_usd), 0) t FROM promotions WHERE status = 'activa'").get().t;
      const ins = (d, post, net, daily, spend, startedAt = '2026-11-19 10:00') => d.prepare("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at, spend, spend_day, spend_day_start) VALUES (1, ?, ?, ?, ?, 'activa', ?, ?, ?, ?, 0)")
        .run(post, net, `${net}-${post}`, daily, startedAt, startedAt, spend, spend ? today : '');
      // corte + relanzamiento el mismo día: lo gastado por el anuncio cortado ocupa lugar en el tope (presupuesto 900 -> tope 60)
      const f = mktFixture({ budget: 900 });
      f.post(3, 1, '2026-11-18 03:00', 1000, 0, 0.02);   // flojo, ya gastó 25 hoy
      f.post(4, 2, '2026-11-18 03:00', 3000, 600, 0.9);  // bueno
      f.post(5, 1, '2026-11-20 03:00', 3000, 600, 0.9);  // candidato nuevo en Instagram
      ins(f.d, 3, 'meta', 30, 25); ins(f.d, 4, 'youtube', 20, 0);
      f.spend['meta-3'] = 25;
      const r = await marketingCycle(1, f.deps);
      eq(r.cut, 1, 'cortó el flojo'); yes(f.log.includes('meta:pause:meta-3'), 'lo pausó en la red');
      eq(f.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'corte'").get().n, 1, 'decisión de corte');
      yes(gastadoHoy(f.d) + comprometido(f.d) <= 60 + 1e-9, `gastado hoy + presupuestos activos (${gastadoHoy(f.d)} + ${comprometido(f.d)}) pasa el tope de 60`);
      // subir: con USD 10 gastados hoy, lo que sube no pasa el tope
      const u = mktFixture({ budget: 900 }); u.post(3, 1, '2026-11-18 03:00', 3000, 600, 0.9); ins(u.d, 3, 'meta', 5, 10); u.spend['meta-3'] = 10;
      eq((await marketingCycle(1, u.deps)).raised, 1, 'subió');
      yes(gastadoHoy(u.d) + comprometido(u.d) <= 60 + 1e-9, 'subir respeta el tope de hoy');
      // bajar: pasa del reparto entre redes y baja sin pedir permiso
      const b = mktFixture({ budget: 900 }); b.post(3, 1, '2026-11-18 03:00', 3000, 600, 0.9); ins(b.d, 3, 'meta', 55, 0);
      eq((await marketingCycle(1, b.deps)).lowered, 1, 'bajó'); yes(b.log.some((l) => l.startsWith('meta:budget:meta-3:')), 'llamó a setBudget');
      yes(comprometido(b.d) < 55, 'quedó más bajo'); eq(b.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'baja'").get().n, 1, 'decisión de baja');
      // red apagada: no se le promociona ni se le cambia el presupuesto, y lo activo se pausa
      const o = mktFixture({ budget: 900 }); o.post(7, 3, '2026-11-18 03:00', 3000, 600, 0.9); o.post(8, 3, '2026-11-18 04:00', 3000, 600, 0.9); ins(o.d, 7, 'tiktok', 10, 0);
      const ro = await marketingCycle(1, o.deps);
      eq(ro.paused, 1, 'pausó TikTok'); yes(o.log.includes('tiktok:pause:tiktok-7'), 'pausa en la red');
      yes(!o.log.some((l) => l.startsWith('tiktok:promote') || l.startsWith('tiktok:budget')), 'TikTok apagado no recibe promote ni setBudget');
      eq(o.d.prepare("SELECT status FROM promotions WHERE ad_id = 'tiktok-7'").get().status, 'pausada', 'estado');
      // antes de la fecha de inicio no se hace nada y queda anotado una sola vez por día
      const e = mktFixture(); e.post(3, 1, '2026-10-20 03:00', 3000, 600, 0.9); e.deps.now = () => '2026-10-30 10:00';
      eq((await marketingCycle(1, e.deps)).skipped, 'antes del inicio de la pauta', 'espera'); await marketingCycle(1, e.deps);
      eq(e.log, [], 'sin llamadas'); eq(e.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'espera'").get().n, 1, 'una decisión por día');
      // si la red lanza el anuncio pero no se puede registrar, se pausa y se avisa
      const q = mktFixture({ budget: 900 }); q.post(3, 1, '2026-11-18 03:00', 3000, 600, 0.9);
      q.d.exec("CREATE TRIGGER rompe BEFORE UPDATE OF ad_id ON promotions BEGIN SELECT RAISE(ABORT, 'disco lleno'); END");
      await marketingCycle(1, q.deps);
      yes(q.log.includes('meta:pause:meta-3'), 'se intentó pausar'); eq(q.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'anuncio_sin_registro'").get().n, 1, 'alerta');
    }],
    ['Pauta real', 'Meta (Instagram y Facebook): una campaña por proyecto, promueve la publicación con presupuesto diario y fin en la red, cambia, pausa y lee', async () => {
      const f = adsFixture(); const A = f.adapters().meta; const mark = sim.log.length;
      const c1 = await A.ensureCampaign({ name: 'Proyecto Mock' }), c2 = await f.adapters().meta.ensureCampaign({ name: 'Proyecto Mock' });
      eq([c1.campaignId, c2.campaignId], ['CAMP1', 'CAMP1'], 'la segunda llamada reusa la campaña');
      eq(sim.log.slice(mark).filter((l) => l.includes('/act_999/campaigns')).length, 1, 'una sola campaña creada');
      const ad = await A.promote({ id: 1, external_id: 'M1', network: 'instagram' }, 5);
      const adset = JSON.parse(sim.log.slice(mark).find((l) => l.startsWith('adset ')).slice(6));
      eq([adset.db, adset.e], ['500000', '2026-11-30T23:59:00-03:00'], 'presupuesto diario en centavos de ARS (USD 5 × 1000) y fin = propaganda_until');
      eq(JSON.parse(adset.t).custom_audiences, [{ id: 'AUD1' }], 'segmenta por el público del padrón');
      yes(/^SET\d+$/.test(ad.adId), 'el anuncio es el conjunto');
      await A.promote({ id: 2, external_id: 'V1', network: 'facebook' }, 4);
      await A.setBudget(ad.adId, 8); yes(sim.log.some((l) => l.startsWith(`adset-update ${ad.adId} `) && l.includes('800000')), 'cambió el presupuesto del conjunto');
      await A.pause(ad.adId); yes(sim.log.some((l) => l.startsWith(`adset-update ${ad.adId} `) && l.includes('PAUSED')), 'pausó');
      const i = await A.insights(ad.adId);
      eq(i, { spend: 30, impressions: 8000, reach: 5000, target_reach: 5000 }, 'insights en USD y alcance dentro del padrón');
      const sinPadron = adsFixture({ audience: '' });
      eq((await sinPadron.adapters().meta.insights(ad.adId)).target_reach, null, 'sin público no hay alcance dentro del padrón');
    }],
    ['Pauta real', 'TikTok (Spark Ads): una campaña por proyecto, grupo con presupuesto y fin, video del post, cambia, pausa y lee', async () => {
      const f = adsFixture(); const A = f.adapters().tiktok; const mark = sim.log.length;
      eq([(await A.ensureCampaign({ name: 'P' })).campaignId, (await f.adapters().tiktok.ensureCampaign({ name: 'P' })).campaignId], ['TTC1', 'TTC1'], 'reusa la campaña');
      eq(sim.log.slice(mark).filter((l) => l.startsWith('ttads campaign/create/')).length, 1, 'una sola campaña creada');
      f.post(3, 3, 'PUB1', 'TVOK');
      const ad = await A.promote({ id: 3, external_id: 'PUB1', network: 'tiktok' }, 6);
      const g = JSON.parse(sim.log.slice(mark).find((l) => l.startsWith('ttads adgroup/create/')).slice(22));
      eq([g.budget, g.budget_mode, g.schedule_type], [6, 'BUDGET_MODE_DAY', 'SCHEDULE_START_END'], 'presupuesto diario');
      eq(g.schedule_end_time, '2026-12-01 02:59:00', 'fin de la programación = fin del día 30/11 -03:00 en UTC');
      yes(sim.log.slice(mark).some((l) => l.startsWith('ttads ad/create/') && l.includes('"tiktok_item_id":"TVOK"')), 'usa el ID del video (network_video_id), no el publish_id');
      await A.setBudget(ad.adId, 3); yes(sim.log.some((l) => l.startsWith('ttads adgroup/budget/update/') && l.includes('"budget":3')), 'presupuesto');
      await A.pause(ad.adId); yes(sim.log.some((l) => l.startsWith('ttads adgroup/status/update/') && l.includes('DISABLE')), 'pausa');
      eq(await A.insights(ad.adId), { spend: 7.5, impressions: 3000, reach: 2100, target_reach: null }, 'insights sin alcance dentro del padrón');
    }],
    ['Pauta real', 'Google Ads (Shorts): reusa la lista Customer Match del padrón (una campaña por Short), campaña con presupuesto y end_date, cambia, pausa y lee', async () => {
      const f = adsFixture(); const A = f.adapters().youtube; const mark = sim.log.length;
      const c1 = await A.ensureCampaign({ name: 'P' }), c2 = await f.adapters().youtube.ensureCampaign({ name: 'P' });
      eq([c1.campaignId, c2.campaignId], [null, null], 'Google no tiene campaña por proyecto: cada Short lleva la suya');
      yes(c1.listId && c1.listId === c2.listId, 'la segunda llamada reusa la LISTA de Customer Match'); eq(sim.log.slice(mark).filter((l) => l.startsWith('gads userLists:mutate')).length, 1, 'una sola lista');
      const up = sim.log.slice(mark).find((l) => l.startsWith('gads offlineUserDataJobs/J1:addOperations'));
      yes(up && up.includes('hashedEmail') && !up.includes('@'), 'sube solo huellas');
      const ad = await A.promote({ id: 4, external_id: 'YOK', network: 'youtube' }, 5);
      const L = sim.log.slice(mark);
      yes(L.some((l) => l.startsWith('gads campaignBudgets:mutate') && l.includes('"amountMicros":5000000')), 'presupuesto diario en micros');
      yes(L.some((l) => l.startsWith('gads campaigns:mutate') && l.includes('"endDate":"2026-11-30"') && l.includes('"startDate":"2026-11-21"')), 'end_date de la campaña');
      yes(L.some((l) => l.startsWith('gads assets:mutate') && l.includes('"youtubeVideoId":"YOK"')), 'el Short');
      yes(L.some((l) => l.startsWith('gads adGroupCriteria:mutate') && l.includes('userList')), 'segmenta por la lista');
      await A.setBudget(ad.adId, 2); yes(sim.log.some((l) => l.startsWith('gads campaignBudgets:mutate') && l.includes('"amountMicros":2000000') && l.includes('updateMask')), 'cambia presupuesto');
      await A.pause(ad.adId); yes(sim.log.some((l) => l.startsWith('gads campaigns:mutate') && l.includes('PAUSED')), 'pausa');
      eq(await A.insights(ad.adId), { spend: 12.5, impressions: 4000, reach: 2500, target_reach: 2500 }, 'insights');
    }],
    ['Pauta real', 'Un rechazo de política en cada red se convierte en AdRejected y los errores no llevan secretos', async () => {
      const f = adsFixture();
      for (const [net, post] of [['meta', { id: 1, external_id: 'MBAD', network: 'instagram' }], ['youtube', { id: 4, external_id: 'YBADPOL', network: 'youtube' }]]) {
        let err; try { await f.adapters()[net].promote(post, 5); } catch (e) { err = e; }
        yes(err instanceof AdRejected, `${net} tendría que lanzar AdRejected: ${err?.message}`);
      }
      f.post(3, 3, 'P', 'TVBAD'); let e3; try { await f.adapters().tiktok.promote({ id: 3, external_id: 'P', network: 'tiktok' }, 5); } catch (e) { e3 = e; }
      yes(e3 instanceof AdRejected, `TikTok tendría que lanzar AdRejected: ${e3?.message}`);
      const mal = adsFixture({ creds: { ...ADS_CREDS, ttAccessToken: 'TT_TOKEN_MALO_999' } });
      let e4; try { await mal.adapters().tiktok.ensureCampaign({ name: 'P' }); } catch (e) { e4 = e; }
      yes(e4 && !e4.message.includes('TT_TOKEN_MALO_999'), 'el error no repite el token');
      eq(Object.keys(adsFixture({ demo: 1 }).adapters()), [], 'un demo nunca arma adaptadores');
      eq(Object.keys(adsFixture({ nets: '{"meta":true,"youtube":false,"tiktok":false}' }).adapters()), ['meta'], 'solo las redes encendidas');
      eq(Object.keys(adsFixture({ creds: { adAccountId: '999', accessToken: 'EAAx12345678' } }).adapters()), ['meta'], 'solo las redes con credenciales');
    }],
    ['Pauta real', 'Review Focus 3: TikTok rechaza el anuncio, queda bloqueada, el siguiente ciclo reparte entre Meta y YouTube, una alerta y no más intentos', async () => {
      const f = adsFixture();
      f.post(1, 1, 'M1'); f.post(2, 2, 'YOK'); f.post(3, 3, 'PUB', 'TVBAD');
      const r1 = await f.run();
      eq(r1.promoted, 2, 'Meta y YouTube salen; TikTok no');
      eq(JSON.parse(f.d.prepare('SELECT ads_blocked FROM projects').get().ads_blocked).tiktok.post_id, 3, 'TikTok bloqueada en el proyecto');
      eq(f.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'red_bloqueada'").get().n, 1, 'una alerta');
      const antes = sim.log.filter((l) => l.startsWith('ttads ')).length;
      const r2 = await f.run({ now: () => '2026-11-21 16:00' });
      const rep = JSON.parse(f.d.prepare("SELECT data FROM decisions WHERE kind = 'reparto' ORDER BY id DESC LIMIT 1").get().data).split;
      eq(rep.tiktok, 0, 'TikTok no recibe plata'); eq(rep.meta + rep.youtube, 100, 'se reparte entre Meta y YouTube');
      eq(sim.log.filter((l) => l.startsWith('ttads ')).length, antes, 'ni un llamado más a TikTok');
      eq(f.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'red_bloqueada'").get().n, 1, 'sigue habiendo una sola alerta');
      eq(f.d.prepare("SELECT count(*) n FROM promotions WHERE network = 'tiktok'").get().n, 0, 'sin promociones de TikTok');
      // Gero la reactiva: vuelve a intentarse
      f.d.prepare("UPDATE projects SET ads_blocked = ''").run(); f.d.prepare("DELETE FROM decisions WHERE kind = 'rechazo'").run();
      await f.run({ now: () => '2026-11-21 22:00' });
      eq(JSON.parse(f.d.prepare("SELECT data FROM decisions WHERE kind = 'reparto' ORDER BY id DESC LIMIT 1").get().data).split.tiktok > 0, true, 'reactivada, vuelve a recibir parte del reparto');
    }],
    ['Pauta real', 'Google: si el padrón se carga después de la primera promoción, el siguiente ensureCampaign arma la lista', async () => {
      const f = adsFixture(); f.d.exec('DELETE FROM padron'); const mark = sim.log.length;
      eq(await f.adapters().youtube.ensureCampaign({ name: 'P' }), { campaignId: null, listId: null }, 'sin padrón no hay lista');
      const ad = await f.adapters().youtube.promote({ id: 4, external_id: 'YOK', network: 'youtube' }, 5);
      yes(ad.adId, 'promueve igual, por geografía'); eq(sim.log.slice(mark).filter((l) => l.startsWith('gads userLists:mutate')).length, 0, 'todavía sin lista');
      for (let i = 0; i < 5; i++) f.d.prepare('INSERT INTO padron VALUES (1, ?, ?)').run(`z${i}`.padEnd(16, 'a'), `y${i}`.padEnd(16, 'b'));
      const r = await f.adapters().youtube.ensureCampaign({ name: 'P' });
      yes(r.listId, 'ahora arma la lista'); eq(sim.log.slice(mark).filter((l) => l.startsWith('gads userLists:mutate')).length, 1, 'una lista creada');
      eq((await f.adapters().youtube.ensureCampaign({ name: 'P' })).listId, r.listId, 'y después la reusa');
    }],
    ['Pauta real', 'TikTok sin ID de video se saltea sin llamar a la red; cuentas que no están en dólares no arman adaptador; rechazos solo por código o al crear', async () => {
      const f = adsFixture(); f.post(3, 3, 'PUBLISH_ID_9'); const mark = sim.log.length;
      let e; try { await f.adapters().tiktok.promote({ id: 3, external_id: 'PUBLISH_ID_9', network: 'tiktok' }, 5); } catch (x) { e = x; }
      yes(e instanceof AdSkip && /todavía no tiene ID/.test(e.message), 'AdSkip con motivo en español');
      eq(sim.log.slice(mark).filter((l) => l.startsWith('ttads ')).length, 0, 'no llama a TikTok ni usa el publish_id');
      const g = adsFixture({ nets: '{"meta":true,"youtube":false,"tiktok":true}' }); g.post(3, 3, 'PUBLISH_ID_9'); g.post(1, 1, 'M1');
      const r = await g.run(); eq(r.promoted, 1, 'sale Meta; el post de TikTok se saltea');
      eq(g.d.prepare("SELECT count(*) n FROM promotions WHERE network = 'tiktok'").get().n, 0, 'sin promoción de TikTok (ya se filtra antes de elegir)'); eq(g.d.prepare('SELECT ads_blocked FROM projects').get().ads_blocked, '', 'la red NO queda bloqueada');
      const m = adsFixture(); m.d.prepare("UPDATE projects SET ads_state = ?").run(JSON.stringify({ tiktok: { currency: 'ARS' }, youtube: { currency: 'USD' } }));
      eq(Object.keys(m.adapters()).sort(), ['meta', 'youtube'], 'TikTok en ARS no arma adaptador');
      eq(m.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'moneda_no_usd'").get().n, 1, 'alerta de moneda');
      const E = (code, message) => Object.assign(new Error(message), { metaCode: code });
      eq([metaPolicy(E(368, 'x'), false), metaPolicy(E(100, 'violates policy'), false), metaPolicy(E(100, 'violates policy'), true)], [true, false, true], 'Meta: código siempre; texto solo al crear');
      eq([ttPolicy('ad/create/', 40911, 'x'), ttPolicy('adgroup/create/', 40911, 'rejected policy'), ttPolicy('report/integrated/get/', 0, 'reject'), ttPolicy('ad/create/', 40002, 'Ad rejected')], [true, false, false, true], 'TikTok: solo ad/create');
      eq([gPolicy('adGroupAds:mutate', 'POLICY_ERROR'), gPolicy('campaigns:mutate', 'POLICY_ERROR')], [true, false], 'Google: solo adGroupAds');
    }],
    ['Pauta real', 'Una red apagada con un anuncio activo conserva el adaptador y el ciclo lo pausa', async () => {
      const f = adsFixture({ nets: '{"meta":true,"youtube":false,"tiktok":false}' });
      eq(Object.keys(f.adapters()), ['meta'], 'apagada y sin anuncios: no hay adaptador');
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 4, 'youtube', '701:5', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      eq(Object.keys(f.adapters()).sort(), ['meta', 'youtube'], 'con anuncio activo sí');
      const r = await f.run();
      eq(r.paused, 1, 'el ciclo la pausó');
      yes(sim.log.some((l) => l.startsWith('gads campaigns:mutate') && l.includes('customers/1234567890/campaigns/701') && l.includes('PAUSED')), 'pausó en Google');
      eq(f.d.prepare("SELECT status FROM promotions WHERE ad_id = '701:5'").get().status, 'pausada', 'estado');
    }],
    ['Pauta real', 'Cuenta que no está en dólares con un anuncio activo: el adaptador solo pausa y el ciclo lo pausa de verdad', async () => {
      const f = adsFixture(); f.d.prepare("UPDATE projects SET ads_state = ?").run(JSON.stringify({ tiktok: { currency: 'ARS' } }));
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'tiktok', 'TTG1', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      const A = f.adapters().tiktok; yes(A && A.pauseOnly === true, 'hay adaptador solo de pausa');
      let e; try { await A.promote({ id: 1, external_id: 'x', network: 'tiktok' }, 5); } catch (x) { e = x; } yes(e, 'no promociona');
      const mark = sim.log.length, r = await f.run();
      eq(r.paused, 1, 'pausó');
      yes(sim.log.slice(mark).some((l) => l.startsWith('ttads adgroup/status/update/') && l.includes('DISABLE') && l.includes('TTG1')), 'pausa real en TikTok');
      eq(f.d.prepare("SELECT status FROM promotions WHERE ad_id = 'TTG1'").get().status, 'pausada', 'estado');
      // credenciales incompletas para promocionar (falta la identidad) pero suficientes para pausar
      const g = adsFixture({ creds: { ...ADS_CREDS, ttIdentityId: '', ttBcId: '' } });
      g.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'tiktok', 'TTG1', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      yes(g.adapters().tiktok?.pauseOnly, 'incompleto para promocionar: solo pausa');
      eq(Object.keys(adsFixture({ creds: { ...ADS_CREDS, ttIdentityId: '', ttBcId: '' } }).adapters()).includes('tiktok'), false, 'sin anuncios activos no hay adaptador');
    }],
    ['Pauta real', 'Sin adaptador no se marca pausado: el anuncio queda activo y se avisa (pausa_imposible)', async () => {
      const f = mktFixture({ nets: '{"meta":true,"youtube":false,"tiktok":false}' }); f.post(3, 1, '2026-11-18 03:00', 3000, 300, 0.8);
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 9, 'youtube', 'yt-9', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      delete f.deps.adapters.youtube;
      const r = await marketingCycle(1, f.deps);
      eq(r.paused, 0, 'no pausó');
      const row = f.d.prepare("SELECT status, daily_usd FROM promotions WHERE ad_id = 'yt-9'").get();
      eq([row.status, row.daily_usd], ['activa', 5], 'sigue activa y con su presupuesto');
      eq(f.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'pausa_imposible'").get().n, 1, 'alerta');
    }],
    ['Pauta real', 'Un post de TikTok sin ID de video no ocupa el lugar: se promociona el próximo que sí lo tiene', async () => {
      const f = adsFixture({ nets: '{"meta":false,"youtube":false,"tiktok":true}' });
      f.post(3, 3, 'PUB3'); f.post(4, 3, 'PUB4'); f.post(6, 3, 'PUB6'); f.post(7, 3, 'PUB7', 'TV7');
      const r = await f.run();
      eq(r.promoted, 1, 'promovió uno');
      eq(f.d.prepare("SELECT post_id FROM promotions WHERE network = 'tiktok'").all().map((x) => x.post_id), [7], 'el que tiene ID de video');
    }],
    ['Pauta real', 'Una red sin target_reach usa el alcance total con peso 0,5', async () => {
      eq(UNTARGETED_REACH_WEIGHT, 0.5, 'peso');
      const f = mktFixture(); f.post(3, 1, '2026-11-18 03:00', 3000, 300, 0.8);
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'meta', 'meta-3', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      f.spend['meta-3'] = 4; await marketingCycle(1, f.deps);
      eq(f.d.prepare('SELECT target_reach FROM promotions').get().target_reach, 25, 'alcance 50 × 0,5');
    }],
    ['Telegram', 'Dos avisos iguales seguidos mandan 1 mensaje (el segundo, aunque sea otro día, se suprime dentro de 6 h); sin credenciales no manda nada; con token malo no filtra el token', async () => {
      const d = notifyFixture(), n0 = tgLog(sim).length, now = '2026-11-21 10:00';
      eq(await alert_(d, 'falta_material', 1, 'Sin material para mañana.', TG), 1, 'primer aviso anotado');
      eq(tgLog(sim).length - n0, 1, 'un mensaje');
      const msg = JSON.parse(tgLog(sim).at(-1).slice(9));
      eq(msg, { chat: '777', text: '[Club Mock] Sin material para mañana.' }, 'mensaje en español con el nombre del proyecto');
      d.exec("UPDATE alerts SET at = '2026-11-21 10:00:00', sent_at = '2026-11-21 10:00:00'"); // se fija la hora para que el resto sea determinista
      eq(addAlert(d, 'falta_material', 1, 'Sin material para mañana.', '2026-11-21 10:05:00'), null, 'el mismo día no se anota dos veces');
      d.prepare("INSERT INTO alerts (project_id, kind, text, at) VALUES (1, 'falta_material', 'otra vez', '2026-11-21 11:30:00')").run(); // otro registro, dentro de las 6 h
      const r = await flushAlerts(d, { ...TG, now: '2026-11-21 11:31' });
      eq([r.sent, r.suppressed, tgLog(sim).length - n0], [0, 1, 1], 'dentro de 6 h se suprime');
      d.prepare("INSERT INTO alerts (project_id, kind, text, at) VALUES (1, 'falta_material', 'a las 7 h', '2026-11-21 17:30:00')").run();
      eq((await flushAlerts(d, { ...TG, now: '2026-11-21 17:31' })).sent, 1, 'pasadas 6 h vuelve a avisar');
      d.prepare("INSERT INTO alerts (project_id, kind, text, at) VALUES (1, 'tope', 'otro tipo', '2026-11-21 17:32:00')").run();
      eq((await flushAlerts(d, { ...TG, now: '2026-11-21 17:33' })).sent, 1, 'otro tipo no se suprime');
      // sin credenciales no hace nada y los avisos quedan para cuando se configure
      const sin = notifyFixture(); addAlert(sin, 'tope', 1, 'sin telegram', '2026-11-21 10:00:00');
      eq([await flushAlerts(sin, { token: '', chat: '', now }), sin.prepare('SELECT sent_at FROM alerts').get().sent_at], [{ sent: 0, suppressed: 0, failed: 0 }, null], 'sin credenciales no hace nada');
      // token inválido: falla sin romper, queda sin enviar y el token no sale en el log
      const mal = notifyFixture(); addAlert(mal, 'tope', 1, 'x', '2026-11-21 10:00:00');
      const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
      let rr; try { rr = await flushAlerts(mal, { token: '999:SECRETO-malo', chat: '777', now }); } finally { console.error = ce; }
      eq([rr.failed, mal.prepare('SELECT sent_at FROM alerts').get().sent_at], [1, null], 'falla y queda pendiente');
      yes(errs.length && !errs.join('').includes('SECRETO-malo'), 'el token no aparece en el log');
    }],
    ['Telegram', 'El resumen diario tiene los 5 bloques: publicado, gastado, lo que queda, el ganador con su porqué y lo aprendido', async () => {
      const d = notifyFixture();
      d.exec("INSERT INTO posts (project_id, account_id, published_at) VALUES (1, 1, '2026-11-21 09:00'), (1, 1, '2026-11-21 12:00'), (1, 2, '2026-11-21 13:00'), (1, 1, '2026-11-20 13:00')");
      d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at, spend, spend_day, spend_day_start) VALUES (1, 1, 'meta', 'A1', 5, 'activa', '2026-11-20 10:00', '2026-11-21 10:00', 30, '2026-11-21', 22.5)");
      d.exec("INSERT INTO comparisons (project_id, clip_id, winner_reel_id, diff, hypothesis) VALUES (1, 'c1', 2, 0.25, 'La versión 2 ganó por el gancho en pregunta.')");
      d.exec("INSERT INTO learnings (project_id, variable, value, wins, trials, origin) VALUES (1, 'gancho', 'pregunta', 1, 1, 'comparacion')");
      const t = dailySummary(d, 1, '2026-11-22 22:00').split('\n');
      eq(dailySummary(d, 1, '2026-11-21 22:00').split('\n').length, 6, 'título + 5 bloques');
      const s = dailySummary(d, 1, '2026-11-21 22:00');
      for (const b of ['Publicado hoy: 3 publicaciones (Instagram: 2, TikTok: 1).', 'Gastado hoy: USD 7,50.', 'Queda de pauta: USD 70,00 de USD 100,00', 'Ganador: La versión 2 ganó por el gancho en pregunta.', 'Aprendido: gancho «pregunta»']) yes(s.includes(b), `falta «${b}» en:\n${s}`);
      yes(s.startsWith('Resumen del día 2026-11-21 de Club Mock'), 'título con el proyecto');
      yes(/Publicado hoy: ninguna/.test(t.join('\n')) && /Gastado hoy: USD 0,00/.test(t.join('\n')), 'otro día: nada publicado ni gastado');
      eq(dailySummary(notifyFixture(), 1, '2026-11-21 22:00').split('\n').slice(4).map((x) => x.slice(0, 23)), ['Ganador: todavía no hay', 'Aprendido: todavía no h'], 'sin datos no inventa');
    }],
    ['Telegram', 'Un crudo con más de 24 h en una etapa del editor genera editor_atrasado (una vez por día); los terminados y los de menos de 24 h no', async () => {
      const d = notifyFixture(), now = new Date('2026-11-21T12:00:00Z');
      d.exec(`INSERT INTO reels (id, project_id, kind, title, status, status_at, created_at) VALUES
        (1, 1, 'crudo', 'Entrevista', 'editando', '2026-11-20 10:00:00', '2026-11-20 09:00:00'),
        (2, 1, 'crudo', 'Reciente', 'en_cola', '2026-11-21 08:00:00', '2026-11-21 08:00:00'),
        (3, 1, 'crudo', 'Terminado', 'listo', '2026-11-18 08:00:00', '2026-11-18 08:00:00'),
        (4, 1, 'crudo', 'Sin hora', 'en_cola', '', '2026-11-19 08:00:00'),
        (5, 2, 'crudo', 'De demo', 'en_cola', '2026-11-10 08:00:00', '2026-11-10 08:00:00')`);
      eq(editorAtrasado(d, now), 1, 'un aviso por proyecto');
      const a = d.prepare("SELECT kind, project_id, text FROM alerts").all();
      eq([a.length, a[0].kind, a[0].project_id], [1, 'editor_atrasado', 1], 'editor_atrasado del proyecto 1');
      yes(a[0].text.includes('«Entrevista»') && a[0].text.includes('y 1 más') && a[0].text.includes('24 h'), `texto: ${a[0].text}`);
      eq(editorAtrasado(d, now), 0, 'no se repite el mismo día');
    }],
    ['Telegram', 'El tope de pauta que frena una promoción deja un aviso `tope` (uno por día)', async () => {
      const f = mktFixture({ budget: 0.5 }); f.post(2, 1, '2026-11-20 04:00', 1000); f.post(3, 1, '2026-11-20 03:00', 3000);
      await marketingCycle(1, f.deps); await marketingCycle(1, f.deps);
      yes(f.d.prepare("SELECT count(*) n FROM decisions WHERE kind = 'tope'").get().n >= 1, 'tiene que haber decisión de tope');
      const a = f.d.prepare("SELECT kind, text FROM alerts WHERE kind = 'tope'").all();
      eq(a.length, 1, 'un aviso tope por día'); yes(/tope/i.test(a[0].text), a[0].text);
    }],
    ['Telegram', 'Una cuenta que dejó de funcionar avisa `cuenta` con la red y el usuario, sin claves', async () => {
      const d = notifyFixture();
      cuentaAlert(d, 1, 'tiktok', '@clubmock', 'Token expirado: access_token=ABCDEF123456789');
      const a = d.prepare("SELECT kind, text FROM alerts").all();
      eq(a.length, 1, 'un aviso'); eq(a[0].kind, 'cuenta', 'tipo');
      yes(a[0].text.includes('TikTok (@clubmock)') && !a[0].text.includes('ABCDEF123456789'), a[0].text);
      yes(AUTH_ERROR.test('The token is expired') && AUTH_ERROR.test('Error 403: permission') && AUTH_ERROR.test('La cuenta no está conectada: conectala') && !AUTH_ERROR.test('timeout de red'), 'detecta errores de permiso');
    }],
    ['Telegram', 'Si falla la lectura de métricas de todas las publicaciones de una red avisa `falla`; si alguna anda, no', async () => {
      const vault = makeVault('banco'), d = new DatabaseSync(':memory:');
      d.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, demo INTEGER DEFAULT 0); CREATE TABLE accounts (id INTEGER PRIMARY KEY, network TEXT, creds TEXT); CREATE TABLE reels (id INTEGER PRIMARY KEY, duration REAL);"
        + "CREATE TABLE posts (id INTEGER PRIMARY KEY, project_id INT, reel_id INT, account_id INT, status TEXT, external_id TEXT, published_at TEXT, network_video_id TEXT DEFAULT '');");
      initMetrics(d); initAlerts(d);
      d.exec("INSERT INTO projects VALUES (1, 0); INSERT INTO reels VALUES (1, 15)");
      d.prepare('INSERT INTO accounts VALUES (1, ?, ?), (2, ?, ?)').run('instagram', vault.seal({ pageId: 'PAGE1', pageAccessToken: 'EAAmalo1234567', instagramBusinessId: 'IG1' }), 'tiktok', vault.seal({ accessToken: 'TT_OK' }));
      const post = d.prepare("INSERT INTO posts (id, project_id, reel_id, account_id, status, external_id, published_at) VALUES (?, 1, 1, ?, 'publicado', ?, '2030-01-10 10:00')");
      post.run(1, 1, 'BAD'); post.run(2, 1, 'BAD');
      await readDue(d, vault, { since: '2030-01-05 00:00' });
      const a = d.prepare("SELECT kind, text FROM alerts").all();
      eq([a.length, a[0]?.kind], [1, 'falla'], 'aviso falla de Instagram'); yes(/instagram/.test(a[0].text) && !a[0].text.includes('EAAmalo1234567'), a[0].text);
    }],
    ['Marketing', 'Sin ningún adaptador y con anuncios activos avisa pausa_imposible (una vez); sin anuncios activos no avisa', async () => {
      const f = mktFixture(); f.post(2, 1, '2026-11-20 04:00', 1000);
      eq((await marketingCycle(1, { ...f.deps, adapters: {} })).skipped, 'sin adaptadores', 'sin anuncios');
      eq(f.d.prepare('SELECT count(*) n FROM alerts').get().n, 0, 'sin anuncios activos no avisa');
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 2, 'meta', 'meta-2', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00')");
      await marketingCycle(1, { ...f.deps, adapters: {} }); await marketingCycle(1, { ...f.deps, adapters: {} });
      const a = f.d.prepare('SELECT kind, text FROM alerts').all();
      eq([a.length, a[0].kind], [1, 'pausa_imposible'], 'un aviso pausa_imposible por día');
      yes(/1 anuncio activo/.test(a[0].text), a[0].text);
      eq(f.d.prepare("SELECT status FROM promotions").get().status, 'activa', 'no toca el anuncio');
    }],
    // ---- revisión final: palancas de corte, rechazos después de crear, avisos con clave y lanzamientos cortados ----
    ['Palancas', 'El ciclo de 6 h recorre también los demos y los sin presupuesto que tienen anuncios activos o a medio lanzar', async () => {
      const d = new DatabaseSync(':memory:');
      d.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY, demo INTEGER DEFAULT 0); CREATE TABLE pauta (project_id INTEGER PRIMARY KEY, budget REAL);');
      initMarketing(d);
      d.exec(`INSERT INTO projects VALUES (1, 0), (2, 1), (3, 0), (4, 1), (5, 0), (6, 0), (7, 0);
        INSERT INTO pauta VALUES (1, 100), (2, 100), (3, 0), (4, 100), (5, 0), (7, 0);`);
      const pr = d.prepare("INSERT INTO promotions (project_id, post_id, network, ad_id, status, started_at, updated_at) VALUES (?, 1, 'meta', 'A', ?, '2026-11-21 10:00', '2026-11-21 10:00')");
      pr.run(2, 'activa'); pr.run(3, 'activa'); pr.run(5, 'pendiente'); pr.run(6, 'activa'); pr.run(7, 'pausada');
      eq(projectsToCycle(d), [1, 2, 3, 5, 6], 'el normal, el demo con anuncio, sin presupuesto con anuncio, a medio lanzar y sin fila de pauta; no el demo vacío ni el que solo tiene pausados');
    }],
    ['Palancas', 'Presupuesto en 0 con anuncios activos: se pausa todo y avisa pauta_terminada; sin anuncios solo se saltea', async () => {
      const f = mktFixture({ budget: 0 }); f.post(3, 1, '2026-11-18 03:00', 3000);
      eq((await marketingCycle(1, f.deps)).skipped, 'sin presupuesto', 'sin anuncios: se saltea'); eq(f.log, [], 'sin llamadas');
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'meta', 'meta-3', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00'), (1, 4, 'youtube', 'youtube-4', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00')");
      const r = await marketingCycle(1, f.deps);
      eq([r.paused, r.promoted], [2, 0], 'pausó los dos y no promocionó nada');
      yes(f.log.includes('meta:pause:meta-3') && f.log.includes('youtube:pause:youtube-4'), 'pausas en la red');
      eq(f.d.prepare("SELECT DISTINCT status FROM promotions").all().map((x) => x.status), ['pausada'], 'estado');
      const a = f.d.prepare("SELECT text FROM alerts WHERE kind = 'pauta_terminada'").all(); eq(a.length, 1, 'un aviso pauta_terminada'); yes(/presupuesto/.test(a[0].text), a[0].text);
    }],
    ['Palancas', 'Proyecto que pasó a demo con anuncios activos: arma adaptadores solo de pausa y el ciclo pausa de verdad', async () => {
      const m = mktFixture({ demo: 1 });
      m.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'meta', 'meta-3', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00')");
      eq((await marketingCycle(1, m.deps)).paused, 1, 'demo: pausa'); eq(m.d.prepare("SELECT count(*) n FROM alerts WHERE kind = 'pauta_terminada'").get().n, 1, 'aviso');
      const f = adsFixture({ demo: 1 });
      eq(Object.keys(f.adapters()), [], 'demo sin anuncios: nada');
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 4, 'youtube', '733:5', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      const A = f.adapters(); eq(Object.keys(A), ['youtube'], 'solo la red con el anuncio'); yes(A.youtube.pauseOnly, 'solo de pausa');
      let e; try { await A.youtube.promote({ id: 1, external_id: 'YOK', network: 'youtube' }, 5); } catch (x) { e = x; } yes(e, 'no promociona');
      const mark = sim.log.length; const r = await f.run();
      eq(r.paused, 1, 'pausó'); yes(sim.log.slice(mark).some((l) => l.startsWith('gads campaigns:mutate') && l.includes('campaigns/733') && l.includes('PAUSED')), 'pausa real en Google');
      eq(f.d.prepare("SELECT status FROM promotions").get().status, 'pausada', 'estado');
    }],
    ['Palancas', 'Sin fecha de fin igual se pausan las redes apagadas o bloqueadas antes de saltear', async () => {
      const f = mktFixture({ end: '', nets: '{"meta":true,"youtube":true,"tiktok":false}' });
      f.d.prepare('UPDATE projects SET ads_blocked = ?').run(JSON.stringify({ youtube: { at: '2026-11-20 10:00', post_id: 9 } }));
      f.d.exec(`INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES
        (1, 7, 'tiktok', 'tiktok-7', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00'), (1, 8, 'youtube', 'youtube-8', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00'), (1, 3, 'meta', 'meta-3', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00')`);
      const r = await marketingCycle(1, f.deps);
      eq([r.skipped, r.paused], ['sin fecha de fin de la pauta', 2], 'pausó TikTok (apagada) y YouTube (bloqueada), después salteó');
      yes(f.log.includes('tiktok:pause:tiktok-7') && f.log.includes('youtube:pause:youtube-8') && !f.log.includes('meta:pause:meta-3'), f.log.join(' '));
    }],
    ['Rechazos', 'Meta, TikTok y Google desaprueban un anuncio ya creado: decisión rechazo, se pausa, la red queda bloqueada y avisa red_bloqueada', async () => {
      for (const net of ['meta', 'tiktok', 'youtube']) {
        const f = adsFixture(); let adId;
        if (net === 'meta') adId = (await f.adapters().meta.promote({ id: 1, external_id: 'M1', network: 'instagram' }, 5)).adId;
        else adId = net === 'tiktok' ? 'TTG77' : '777:5';
        const i0 = await f.adapters()[net].insights(adId); yes(!('rejected' in i0), `${net}: aprobado no trae rejected`);
        sim.disapproved.add(net === 'youtube' ? '777' : adId);
        const i1 = await f.adapters()[net].insights(adId); yes(i1.rejected, `${net}: insights avisa el rechazo`);
        f.post(5, { meta: 1, youtube: 2, tiktok: 3 }[net], 'X5', 'TV5');
        f.d.prepare("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 5, ?, ?, 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')").run(net, adId);
        const mark = sim.log.length; const r = await f.run();
        eq(r.paused, 1, `${net}: pausó`);
        const pausa = { meta: (l) => l.startsWith(`adset-update ${adId} `) && l.includes('PAUSED'), tiktok: (l) => l.startsWith('ttads adgroup/status/update/') && l.includes(adId), youtube: (l) => l.startsWith('gads campaigns:mutate') && l.includes('campaigns/777') && l.includes('PAUSED') }[net];
        yes(sim.log.slice(mark).some(pausa), `${net}: pausa real en la red`);
        eq(f.d.prepare('SELECT status FROM promotions').get().status, 'pausada', `${net}: estado`);
        eq(f.d.prepare("SELECT target FROM decisions WHERE kind = 'rechazo'").all().map((x) => x.target), ['post 5'], `${net}: decisión rechazo`);
        eq(Object.keys(JSON.parse(f.d.prepare('SELECT ads_blocked FROM projects').get().ads_blocked)), [net], `${net}: bloqueada solo esa red`);
        eq(f.d.prepare("SELECT dedupe_key FROM alerts WHERE kind = 'red_bloqueada'").all().map((x) => x.dedupe_key), [`red_bloqueada:${net}`], `${net}: un aviso con clave`);
        sim.disapproved.clear();
      }
    }],
    ['Pauta real', 'TikTok y Google promocionan solo con la moneda guardada en USD; sin moneda conocida solo pausan', async () => {
      const f = adsFixture({ state: '' });
      eq(Object.keys(f.adapters()), ['meta'], 'sin moneda: ni TikTok ni Google promocionan');
      eq(f.d.prepare("SELECT dedupe_key FROM alerts WHERE kind = 'moneda_no_usd' ORDER BY id").all().map((x) => x.dedupe_key), ['moneda_no_usd:tiktok', 'moneda_no_usd:youtube'], 'un aviso por red');
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 3, 'tiktok', 'TTG5', 5, 'activa', '2026-11-19 10:00', '2026-11-19 10:00')");
      yes(f.adapters().tiktok?.pauseOnly, 'con anuncio activo: solo pausa');
      eq(Object.keys(adsFixture().adapters()).sort(), ['meta', 'tiktok', 'youtube'], 'en USD: las tres');
    }],
    ['Pauta real', 'La campaña de Meta es política solo si el proyecto es político (club y comercial nunca, aunque ads_political valga 1)', async () => {
      const cats = {};
      for (const kind of ['club', 'comercial', 'politica']) {
        const mark = sim.log.length; await adsFixture({ kind }).adapters().meta.ensureCampaign();
        cats[kind] = JSON.parse(sim.log.slice(mark).find((l) => l.startsWith('campaign ')).slice(9)).sac;
      }
      eq(cats, { club: '[]', comercial: '[]', politica: '["ISSUES_ELECTIONS_POLITICS"]' }, 'categoría especial');
    }],
    ['Avisos', 'El link de aprendizajes usa la dirección pública de oauth.js: en producción sin ACM_PUBLIC_URL no queda vacío', async () => {
      eq(publicUrl({ NODE_ENV: 'production' }), 'https://acm.punchi.dev', 'producción');
      eq(publicUrl({ ACM_PUBLIC_URL: 'https://acm.ejemplo.com//' }), 'https://acm.ejemplo.com', 'configurada');
      eq(publicUrl({ PORT: '4000' }), 'http://localhost:4000', 'local');
    }],
    ['Avisos', 'Avisos de plata con clave: dos anuncios que no se pueden pausar son dos avisos (y dos mensajes); la misma clave no se repite', async () => {
      const f = mktFixture({ budget: 900 });
      f.d.exec("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, 7, 'tiktok', 'tiktok-7', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00'), (1, 8, 'tiktok', 'tiktok-8', 5, 'activa', '2026-11-20 10:00', '2026-11-20 10:00')");
      f.deps.adapters.tiktok.pause = async () => { throw new Error('la red no contesta'); };
      await marketingCycle(1, f.deps); await marketingCycle(1, { ...f.deps, now: () => '2026-11-21 16:00' });
      eq(f.d.prepare("SELECT dedupe_key FROM alerts WHERE kind = 'pausa_imposible' ORDER BY id").all().map((x) => x.dedupe_key), ['pausa_imposible:tiktok-7', 'pausa_imposible:tiktok-8'], 'uno por anuncio, sin repetir en el segundo ciclo');
      const d = notifyFixture(), n0 = tgLog(sim).length;
      yes(addAlert(d, 'red_bloqueada', 1, 'Meta rechazó', '2026-11-21 10:00:00', 'red_bloqueada:meta'), 'meta');
      yes(addAlert(d, 'red_bloqueada', 1, 'TikTok rechazó', '2026-11-21 10:01:00', 'red_bloqueada:tiktok'), 'tiktok');
      eq(addAlert(d, 'red_bloqueada', 1, 'Meta otra vez', '2026-11-21 10:02:00', 'red_bloqueada:meta'), null, 'misma clave, mismo día: no');
      eq((await flushAlerts(d, { ...TG, now: '2026-11-21 10:05' })).sent, 2, 'dos mensajes: claves distintas no se suprimen');
      d.prepare("INSERT INTO alerts (project_id, kind, text, at, dedupe_key) VALUES (1, 'red_bloqueada', 'Meta de nuevo', '2026-11-21 11:00:00', 'red_bloqueada:meta')").run();
      eq((await flushAlerts(d, { ...TG, now: '2026-11-21 11:01' })).suppressed, 1, 'misma clave dentro de 6 h: se suprime');
      eq(tgLog(sim).length - n0, 2, 'mensajes en total');
    }],
    ['Lanzamiento', 'Una fila pendiente de más de 10 min (corte a mitad del lanzamiento) avisa anuncio_sin_registro, queda huérfana y no traba el post', async () => {
      const f = mktFixture({ budget: 900 }); f.post(3, 1, '2026-11-18 03:00', 3000, 600, 0.9);
      const pend = f.d.prepare("INSERT INTO promotions (project_id, post_id, network, ad_id, daily_usd, status, started_at, updated_at) VALUES (1, ?, 'meta', '', 5, 'pendiente', ?, ?)");
      const viejo = pend.run(3, '2026-11-21 09:30', '2026-11-21 09:30').lastInsertRowid, nuevo = pend.run(4, '2026-11-21 09:55', '2026-11-21 09:55').lastInsertRowid;
      const r = await marketingCycle(1, f.deps);
      eq(f.d.prepare('SELECT status FROM promotions WHERE id = ?').get(viejo).status, 'huerfana', 'la vieja queda huérfana');
      eq(f.d.prepare('SELECT status FROM promotions WHERE id = ?').get(nuevo).status, 'pendiente', 'la de 5 min no se toca');
      const a = f.d.prepare("SELECT text, dedupe_key FROM alerts WHERE kind = 'anuncio_sin_registro'").all();
      eq(a.length, 1, 'un aviso'); yes(a[0].text.includes('meta') && a[0].text.includes('post 3') && a[0].text.includes(`fila ${viejo}`), a[0].text);
      eq(a[0].dedupe_key, 'anuncio_sin_registro:3', 'clave por post');
      eq(r.promoted, 1, 'el post vuelve a ser candidato'); yes(f.log.some((l) => l.startsWith('meta:promote:3:')), 'se promociona');
    }],
    ['Lanzamiento', 'El nombre del anuncio en las 3 redes lleva el post y la fila de promotions («ACM · post X · fila N»)', async () => {
      const f = adsFixture(); f.post(1, 1, 'M1'); f.post(2, 2, 'YOK'); f.post(3, 3, 'PUB', 'TVOK');
      const mark = sim.log.length; const r = await f.run(); eq(r.promoted, 3, 'las tres');
      const filas = Object.fromEntries(f.d.prepare('SELECT network, id FROM promotions').all().map((x) => [x.network, x.id]));
      const L = sim.log.slice(mark);
      yes(L.some((l) => l.startsWith('ad ') && l.includes(`ACM · post 1 · fila ${filas.meta}`)), 'Meta');
      yes(L.some((l) => l.startsWith('ttads adgroup/create/') && l.includes(`ACM · post 3 · fila ${filas.tiktok}`)), 'TikTok');
      yes(L.some((l) => l.startsWith('gads campaigns:mutate') && l.includes(`post 2 · fila ${filas.youtube}`)), 'Google');
    }],
    ['Editor', 'El vencimiento ISO en UTC se pasa a hora local; lo ya local, solo fecha o vacío queda igual', async () => {
      const BA = 'America/Argentina/Buenos_Aires';
      eq([localExpiry('2026-12-01T15:00:00.000Z', BA), localExpiry('2026-12-01T15:00:00+00:00', BA), localExpiry('2026-12-02T01:30Z', BA)], ['2026-12-01 12:00', '2026-12-01 12:00', '2026-12-01 22:30'], 'UTC a local');
      eq([localExpiry('2026-12-01 12:00', BA), localExpiry('2026-12-01', BA), localExpiry('', BA), localExpiry(undefined, BA)], ['2026-12-01 12:00', '2026-12-01', '', ''], 'sin zona queda igual');
    }],
    ['Seguridad', 'mask tapa la firma, la credencial y el token de sesión de los links firmados', async () => {
      const t = mask('No se pudo: https://r2.ejemplo/acm/v.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEJEMPLO%2F20261109%2Fauto%2Fs3&X-Amz-Date=20261109T000000Z&X-Amz-Expires=600&X-Amz-Security-Token=FQoGZXIvYXdzEJr&X-Amz-Signature=deadbeefcafe&X-Amz-SignedHeaders=host');
      yes(!/AKIAEJEMPLO|FQoGZXIvYXdzEJr|deadbeefcafe/.test(t), t);
      yes(t.includes('X-Amz-Credential=••••') && t.includes('X-Amz-Signature=••••') && t.includes('X-Amz-Security-Token=••••') && t.includes('X-Amz-Expires=600'), t);
    }],
    ['Circuito', 'Planificador: YouTube respeta su cuota por proyecto y usa el mejor horario aprendido', async () => {
      const yt = [{ id: 1, network: 'youtube', status: 'conectada', posts_per_day: 3 }];
      const { bank } = planFixture(1, 3);
      const plan = planDay({ accounts: yt, bank, existingPosts: [], date: '2026-12-01', now: '2026-12-01 07:30', youtubeQuota: 8, activeProjects: 4 });
      eq(plan.length, 2, 'cuota 8/4 = 2');
      const ig = [{ id: 1, network: 'instagram', status: 'conectada', posts_per_day: 1 }];
      eq(planDay({ accounts: ig, bank, existingPosts: [], learnings: { horario: { instagram: '20:30' } }, date: '2026-12-01', now: '2026-12-01 07:30' })[0].scheduled_at, '2026-12-01 20:30', 'horario aprendido');
    }],
  ];
}

export async function runBanco() {
  const sim = await startSimulator(0);
  const video = path.join(os.tmpdir(), `acm-banco-${process.pid}.mp4`);
  fs.writeFileSync(video, Buffer.alloc(256 * 1024, 7));
  let ok = 0, total = 0;
  // la copia aislada de ACM para el recorrido completo (si no arranca, esos casos fallan con el motivo)
  const sb = {};
  try {
    sb.editor = await startFakeEditor(); sb.bases = { ...sim.bases, __log: sim.log };
    sb.box = await startSandbox({ ...sb.bases, editor: sb.editor.base }); sb.simLog = () => sim.log;
  } catch (e) { sb.error = e.message; }
  try {
    await traced({ kind: 'banco', title: 'Banco de pruebas', bases: sim.bases }, async () => {
      for (const [group, name, fn] of [...cases(video, sim), ...recorridoCases(sb)]) {
        total++;
        const t0 = Date.now();
        try { await fn(); ok++; step('caso', `${group} · ${name}`, 'ok', Date.now() - t0); }
        catch (e) { step('caso', `${group} · ${name}`, 'falló', Date.now() - t0, e.message); }
      }
      if (ok < total) throw new Error(`Pasaron ${ok} de ${total} casos`);
      return `Pasaron los ${total} casos`;
    });
  } catch {}
  finally { await sb.box?.stop(); await sb.editor?.close(); await sim.close(); fs.rmSync(video, { force: true }); }
  return { ok, total };
}
