// Banco de pruebas del Laboratorio: casos que corren contra el simulador de las APIs (nunca contra las redes reales).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSimulator } from './simulator.js';
import { traced, step } from './trace.js';
import { testConnection } from './connections.js';
import { publish } from './publisher.js';
import { uploadAudience, createCampaign, testAds } from './ads.js';
import ExcelJS from 'exceljs';
import { readPadron, normPhone } from './padron.js';
import { postBlocked, pautaNumbers, defaultAdsNetworks, scheduleBlocked, withinWindow, youtubeShare, NETWORK_CAPS } from './rules.js';
import { embed } from './knowledge.js';
import { DatabaseSync } from 'node:sqlite';
import { planDay, planProject, initPlanner, expiredBlocked } from './planner.js';
import { initAlerts } from './alerts.js';
import { initMetrics, readMetrics, readDue, score, DEFAULT_WEIGHTS } from './metrics.js';
import { makeVault } from './connections.js';
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

function cases(video, sim) {
  const IG = { pageId: 'PAGE1', pageAccessToken: 'EAAprueba1234567', instagramBusinessId: 'IG1' };
  return [
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
      eq(n.days, 33, 'días'); eq(n.people, 35750, 'socios alcanzados'); eq(Math.round(n.freq), 12, 'veces por socio');
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
        CREATE TABLE learnings (project_id INTEGER, variable TEXT, value TEXT, network TEXT, wins REAL, trials REAL);
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
