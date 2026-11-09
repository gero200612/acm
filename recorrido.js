// Recorrido completo del banco de pruebas: levanta una copia aislada de ACM (base temporal, APIs apuntando al simulador,
// contraseña al azar) y la usa por HTTP como lo haría una persona: login, proyecto, padrón, cuentas, reels, publicación,
// Meta Ads, trazas e investigación. Nunca toca la base real ni las redes reales; al terminar la copia se borra.
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { als } from './trace.js';
import { withinWindow } from './rules.js';

const APP = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MP4 mínimo con las cajas que lee mp4probe (ftyp, moov → mvhd, trak → tkhd + mdia/hdlr 'vide') y un mdat de relleno
export function fakeMp4(width, height, seconds) {
  const box = (type, ...parts) => { const body = Buffer.concat(parts); const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(seconds * 1000, 16);
  const tkhd = Buffer.alloc(84);
  [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].forEach((v, i) => tkhd.writeInt32BE(v, 40 + i * 4)); // matriz identidad (sin rotar)
  tkhd.writeUInt32BE(width * 65536, 76); tkhd.writeUInt32BE(height * 65536, 80);
  const hdlr = Buffer.alloc(25); hdlr.write('vide', 8, 'latin1');
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2mp41', 'latin1')), box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('mdia', box('hdlr', hdlr)))), box('mdat', Buffer.alloc(64 * 1024, 7))]);
}

export const EDITOR_TOKEN = 'tok-editor-prueba';
// Editor de mentira: guarda lo que ACM le manda y sirve un video para que ACM lo baje
export function startFakeEditor() {
  const jobs = [];
  const video = fakeMp4(1080, 1920, 6);
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      if (req.url === '/video.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': video.length }); return res.end(video); }
      if (req.url === '/portada.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); }
      if (req.method === 'POST' && req.url === '/trabajos') {
        jobs.push({ auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') });
        res.writeHead(202, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'T1' }));
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, jobs, video, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) });
  }));
}

// Arranca la copia aislada y devuelve un cliente HTTP con su sesión
export async function startSandbox(bases) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-recorrido-'));
  const password = crypto.randomBytes(12).toString('hex');
  // puerto libre elegido antes: la vuelta de «conectar con un clic» necesita la dirección pública de la copia
  const free = await new Promise((r) => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => r(p)); }); });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: APP, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(free), ACM_PUBLIC_URL: `http://127.0.0.1:${free}`, ACM_DATA: data, NODE_ENV: 'test',
      ACM_TIKTOK_CLIENT_KEY: 'tt-app', ACM_TIKTOK_CLIENT_SECRET: 'tt-secret', ACM_GOOGLE_CLIENT_ID: 'g-app', ACM_GOOGLE_CLIENT_SECRET: 'g-secret',
      ACM_TIKTOK_AUTH_URL: bases.tiktokAuth, ACM_GOOGLE_AUTH_URL: bases.googleAuth, ANTHROPIC_BASE_URL: bases.anthropic, ACM_R2_ENDPOINT: bases.r2, ACM_R2_BUCKET: 'acm-test', ACM_R2_ACCESS_KEY_ID: 'r2-key', ACM_R2_SECRET_ACCESS_KEY: 'r2-secret-simulador', ACM_CLEANUP: 'off', ANTHROPIC_API_KEY: 'sk-ant-simulador', ANTHROPIC_AUTH_TOKEN: '', ACM_PASSWORD: password, ACM_SECRET: crypto.randomBytes(32).toString('hex'), ACM_TICK_MS: '1000', ACM_FILL_MS: '50', ACM_SCHEDULER: 'on',
      ACM_GRAPH_URL: bases.graph, ACM_RUPLOAD_URL: bases.rupload, ACM_TIKTOK_URL: bases.tiktok, ACM_GOOGLE_OAUTH_URL: bases.googleOauth, ACM_YOUTUBE_URL: bases.youtube, ACM_YT_UPLOAD_URL: bases.ytUpload,
      EDITOR_URL: bases.editor || '', EDITOR_TOKEN: EDITOR_TOKEN },
  });
  let log = '';
  const port = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('la copia aislada no arrancó en 20 s: ' + log.slice(-300))), 20000);
    const read = (b) => { log += b; const m = log.match(/localhost:(\d+)/); if (m) { clearTimeout(t); resolve(Number(m[1])); } };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`la copia aislada se cerró (código ${c}): ${log.slice(-300)}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  // las llamadas a la copia no ensucian la traza del banco: se hacen fuera de la corrida
  const api = (method, url, body, isForm) => als.exit(async () => {
    const opt = { method, headers: { cookie }, signal: AbortSignal.timeout(60000) };
    if (body !== undefined && !isForm) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (isForm) opt.body = body;
    const r = await fetch(base + url, opt);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, j };
  });
  const raw = (url, withCookie = true) => als.exit(() => fetch(url.startsWith('http') ? url : base + url, { redirect: 'manual', headers: withCookie ? { cookie } : {}, signal: AbortSignal.timeout(20000) }));
  const stop = async () => { child.kill(); await sleep(300); fs.rmSync(data, { recursive: true, force: true }); };
  const editorApi = (url, body) => als.exit(async () => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${EDITOR_TOKEN}` }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; });
  return { api, raw, editorApi, password, stop, base, simLog: () => bases.__log || [] };
}

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)}`); };
const yes = (cond, what) => { if (!cond) throw new Error(what); };
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) Array.isArray(v) ? v.forEach(([b, n]) => f.append(k, b, n)) : f.set(k, v); return f; };

// Casos en orden: cada uno usa lo que dejó el anterior (c guarda el estado compartido)
export function recorridoCases(sb) {
  const c = {};
  const G = (g) => `Recorrido: ${g}`;
  const api = (...a) => { if (!sb.box) throw new Error(sb.error || 'no hay copia aislada'); return sb.box.api(...a); };
  const SECRETS = ['EAAtokendeprueba123', 'EAAsecretomalo999', 'EAAadsprueba12345', 'TT_OK', 'ya29.mock'];
  return [
    [G('acceso'), 'Sin sesión no entra, con la contraseña mala tampoco', async () => {
      eq((await api('GET', '/api/projects')).status, 401, 'sin sesión');
      eq((await api('POST', '/api/login', { password: 'mala' })).status, 401, 'contraseña mala');
      eq((await api('POST', '/api/login', { password: sb.box.password })).status, 200, 'contraseña buena');
    }],
    [G('acceso'), 'Importar investigación sin sesión corta antes de leer el archivo', async () => {
      if (!sb.box) throw new Error(sb.error || 'no hay copia aislada');
      const raw = await als.exit(() => fetch(sb.box.base + '/api/projects/1/knowledge/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(3 * 1024 * 1024) }));
      eq(raw.status, 401, 'sin sesión');
    }],
    [G('proyecto'), 'Crea el proyecto y rechaza uno sin nombre', async () => {
      const r = await api('POST', '/api/projects', form({ name: 'Recorrido', election_date: '2026-12-13', propaganda_until: '2026-12-10' }), true);
      yes(r.j?.id, 'no devolvió el proyecto'); c.p = r.j.id;
      eq((await api('POST', '/api/projects', { name: '  ' })).status, 400, 'sin nombre');
    }],
    [G('circuito'), 'Proyecto político: TikTok sin pauta; el tipo inválido da 400; al cambiar de tipo vuelven los valores por defecto', async () => {
      const r = await api('POST', '/api/projects', form({ name: 'Política', kind: 'politica' }), true);
      eq([r.status, r.j?.kind, r.j?.ads_networks, r.j?.review_mode], [200, 'politica', { meta: true, youtube: true, tiktok: false }, 'manual'], 'creado');
      c.pol = r.j.id;
      const g = (await api('GET', `/api/projects/${c.pol}`)).j;
      eq([g.kind, g.ads_networks.tiktok], ['politica', false], 'leído');
      eq((await api('PUT', `/api/projects/${c.pol}`, { kind: 'otro' })).status, 400, 'tipo inválido');
      eq((await api('PUT', `/api/projects/${c.pol}`, { review_mode: 'x' })).status, 400, 'revisión inválida');
      eq((await api('POST', '/api/projects', { name: 'X', kind: 'otro' })).status, 400, 'crear con tipo inválido');
      eq((await api('PUT', `/api/projects/${c.pol}`, { kind: 'comercial' })).j?.ads_networks.tiktok, true, 'comercial con las tres');
      const m = await api('PUT', `/api/projects/${c.pol}`, { ads_networks: { meta: true, youtube: false } });
      eq(m.j?.ads_networks, { meta: true, youtube: false, tiktok: false }, 'interruptores a mano');
      eq((await api('GET', `/api/projects/${c.p}`)).j.kind, 'club', 'los proyectos existentes quedan como club');
    }],
    [G('circuito'), 'Dos versiones del mismo recorte en dos cuentas de Instagram: a +1 h 400, a +3 h 200', async () => {
      const mk = async (n) => (await api('POST', `/api/projects/${c.pol}/accounts`, { network: 'instagram' })).j.id;
      const [a1, a2] = [await mk(), await mk()];
      const up = await api('POST', `/api/projects/${c.pol}/reels`, form({ files: [[new Blob([fakeMp4(1080, 1920, 8)], { type: 'video/mp4' }), 'v1.mp4'], [new Blob([fakeMp4(1080, 1920, 9)], { type: 'video/mp4' }), 'v2.mp4']] }), true);
      const [r1, r2] = up.j.map((x) => x.id); c.cl = [r1, r2];
      eq((await api('PUT', `/api/reels/${r1}`, { review: 'otra' })).status, 400, 'revisión inválida');
      for (const id of [r1, r2]) await api('PUT', `/api/reels/${id}`, { clip_id: 'clip-prueba', moment: { inicio_s: 10, fin_s: 40, tema: 't', motivo: 'm' } });
      const P = (reel, acc, at) => api('POST', `/api/projects/${c.pol}/posts`, [{ reel_id: reel, account_id: acc, scheduled_at: at }]);
      const sin = await P(r1, a1, '2030-01-10 10:00');
      yes(sin.status === 400 && /aprobado/.test(sin.j?.error), `sin aprobar: ${sin.j?.error}`);
      for (const id of [r1, r2]) eq((await api('PUT', `/api/reels/${id}`, { review: 'aprobado' })).j?.review, 'aprobado', 'aprobado');
      eq((await P(r1, a1, '2030-01-10 07:00')).status, 400, 'fuera de horario');
      eq((await P(r1, a1, '2030-01-10 10:00')).status, 200, 'la primera');
      const uno = await P(r2, a2, '2030-01-10 11:00');
      yes(uno.status === 400 && /3 horas/.test(uno.j?.error), `a +1 h: ${uno.status} ${uno.j?.error}`);
      eq((await P(r2, a2, '2030-01-10 13:00')).status, 200, 'a +3 h');
      c.clipAcc = [a1, a2];
    }],
    [G('circuito'), 'Un reel con recorte no puede cambiar ni quitar su clip_id', async () => {
      eq((await api('PUT', `/api/reels/${c.cl[0]}`, { clip_id: '' })).status, 400, 'quitar');
      eq((await api('PUT', `/api/reels/${c.cl[0]}`, { clip_id: 'otro' })).status, 400, 'cambiar');
      eq((await api('PUT', `/api/reels/${c.cl[0]}`, { clip_id: 'clip-prueba', title: 'V1' })).status, 200, 'el mismo valor sigue valiendo');
    }],
    [G('circuito'), 'Una publicación programada antes de un rechazo no sale: queda bloqueada con la nota', async () => {
      const posts = (await api('GET', `/api/projects/${c.pol}/posts`)).j;
      const p = posts.find((x) => x.reel_id === c.cl[0]); yes(p, 'no está la publicación');
      eq((await api('PUT', `/api/reels/${c.cl[0]}`, { review: 'rechazado' })).status, 200, 'rechazo');
      eq((await api('POST', `/api/posts/${p.id}/now`, {})).status, 200, 'publicar ahora');
      try {
        // dentro del horario (08:00-23:00 hora local) el tick la bloquea; fuera, la deja programada hasta que se abra la ventana
        const inside = withinWindow((await api('GET', '/api/clock')).j.now);
        let q; for (let i = 0; i < 20; i++) { await sleep(500); q = (await api('GET', `/api/projects/${c.pol}/posts`)).j.find((x) => x.id === p.id); if (q.status !== 'programado') break; }
        if (inside) yes(q.status === 'bloqueado' && /aprobado/.test(q.note), `estado ${q.status}, nota ${q.note}`);
        else eq([q.status, q.note], ['programado', ''], 'fuera de horario no se publica ni se bloquea');
      } finally { await api('DELETE', `/api/projects/${c.pol}`); } // que no queden publicaciones de este recorrido para el caso de borrar
    }],
    [G('padrón'), 'CSV: cuenta socios, teléfonos y mails; rechaza .xls', async () => {
      const csv = 'Nro Socio;Apellido y Nombre;DNI;Teléfono;Email\n1;Pérez Ana;30111222;11 15 1234-5678;ANA@x.com\n2;Gómez B;30111223;;\n3;López C;30111224;0351 15 555 1234;caro@y.com.ar\n4;X;1;+54 9 11 2222 3333;malo@\n';
      const r = await api('POST', `/api/projects/${c.p}/padron`, form({ file: [[new Blob([csv], { type: 'text/csv' }), 'padron.csv']] }), true);
      eq([r.status, r.j?.padron, r.j?.padron_phones, r.j?.padron_emails, r.j?.padron_contacts], [200, 4, 3, 2, 3], 'estado, socios, teléfonos, mails, contactables');
      eq((await api('POST', `/api/projects/${c.p}/padron`, form({ file: [[new Blob(['x']), 'padron.xls']] }), true)).status, 400, '.xls');
    }],
    [G('cuentas'), 'Conecta Instagram, Facebook, TikTok y YouTube sin devolver secretos', async () => {
      eq((await api('POST', `/api/projects/${c.p}/accounts`, { network: 'x' })).status, 400, 'red inválida');
      const creds = { instagram: { pageId: 'PAGE1', pageAccessToken: SECRETS[0] }, facebook: { pageId: 'PAGE1', pageAccessToken: SECRETS[0] },
        tiktok: { accessToken: 'TT_VIEJO', refreshToken: 'R', clientKey: 'k', clientSecret: 's' }, youtube: { clientId: 'c', clientSecret: 's', refreshToken: 'r' } };
      c.acc = {};
      for (const [n, cr] of Object.entries(creds)) {
        const a = (await api('POST', `/api/projects/${c.p}/accounts`, { network: n })).j; c.acc[n] = a.id;
        await api('PUT', `/api/accounts/${a.id}/connection`, cr);
        const t = (await api('POST', `/api/accounts/${a.id}/test`, {})).j;
        eq(t.status, 'conectada', `${n} (${t.last_error})`);
        yes(!SECRETS.some((s) => JSON.stringify(t).includes(s)), `${n}: la respuesta trae un secreto`);
      }
    }],
    [G('cuentas'), 'Una conexión mala queda con error y sin mostrar el token', async () => {
      const a = (await api('POST', `/api/projects/${c.p}/accounts`, { network: 'facebook' })).j; c.bad = a.id;
      await api('PUT', `/api/accounts/${a.id}/connection`, { pageId: 'PAGEBAD', pageAccessToken: SECRETS[1] });
      const t = (await api('POST', `/api/accounts/${a.id}/test`, {})).j;
      eq(t.status, 'error', 'estado'); yes(!t.last_error.includes(SECRETS[1]), `el error muestra el token: ${t.last_error}`);
    }],
    [G('reels'), 'Sube dos reels y lee medidas y duración', async () => {
      const r = await api('POST', `/api/projects/${c.p}/reels`, form({ files: [[new Blob([fakeMp4(1080, 1920, 8)], { type: 'video/mp4' }), 'vertical.mp4'], [new Blob([fakeMp4(1920, 1080, 2)], { type: 'video/mp4' }), 'horizontal.mp4']] }), true);
      eq(r.j?.length, 2, 'reels subidos');
      const v = r.j.find((x) => x.original_name === 'vertical.mp4'); c.reel = v.id;
      // dos ediciones más del mismo crudo: un reel distinto por cada cuenta extra de la misma red
      const e = await api('POST', `/api/projects/${c.p}/reels`, form({ files: [[new Blob([fakeMp4(1080, 1920, 8)], { type: 'video/mp4' }), 'edicion-2.mp4'], [new Blob([fakeMp4(1080, 1920, 9)], { type: 'video/mp4' }), 'edicion-3.mp4']] }), true);
      [c.reel2, c.reel3] = e.j.map((x) => x.id);
      eq([v.width, v.height, v.duration], [1080, 1920, 8], 'medidas del vertical');
    }],
    [G('reels'), 'La revisión técnica rechaza el horizontal corto y aprueba el vertical', async () => {
      const L = (await api('GET', '/api/lab/reels')).j;
      const h = L.find((x) => x.original_name === 'horizontal.mp4'), v = L.find((x) => x.id === c.reel);
      yes(!h.review.instagram.ok && h.review.instagram.why.some((w) => /horizontal/.test(w)), 'el horizontal pasó la revisión');
      yes(v.review.instagram.ok, `el vertical no pasó: ${v.review.instagram.why}`);
    }],
    [G('publicación'), 'Valida fechas, proyecto y datos al programar', async () => {
      c.now = (await api('GET', '/api/clock')).j.now;
      eq((await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel }])).status, 400, 'publicación incompleta');
      eq((await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel, account_id: c.acc.instagram, scheduled_at: 'mañana' }])).status, 400, 'fecha inválida');
      const o = (await api('POST', '/api/projects', form({ name: 'Otro' }), true)).j;
      eq((await api('POST', `/api/projects/${o.id}/posts`, [{ reel_id: c.reel, account_id: c.acc.instagram, scheduled_at: c.now }])).status, 400, 'reel de otro proyecto');
      await api('DELETE', `/api/projects/${o.id}`);
    }],
    [G('publicación'), 'Publica en las 4 redes y falla la cuenta con error', async () => {
      const items = Object.values(c.acc).map((id) => ({ reel_id: c.reel, account_id: id, scheduled_at: c.now, ...(id === c.acc.tiktok ? { options: { privacy: 'SELF_ONLY' } } : {}) }));
      items.push({ reel_id: c.reel2, account_id: c.bad, scheduled_at: c.now });
      items.push({ reel_id: c.reel2, account_id: c.acc.instagram, scheduled_at: '2026-12-11T10:00' }); // con T, como el navegador
      eq((await api('POST', `/api/projects/${c.p}/posts`, items)).j?.created, 6, 'programadas');
      let P = [];
      for (let i = 0; i < 40; i++) { await sleep(1000); P = (await api('GET', `/api/projects/${c.p}/posts`)).j; if (P.filter((x) => x.scheduled_at <= c.now).every((x) => !['programado', 'publicando'].includes(x.status))) break; }
      for (const x of P.filter((x) => x.scheduled_at <= c.now)) eq(x.status, x.account_id === c.bad ? 'fallido' : 'publicado', `${x.network} (${x.error})`);
      c.future = P.find((x) => x.scheduled_at === '2026-12-11 10:00');
      yes(c.future, 'la fecha con T no se guardó como AAAA-MM-DD HH:MM');
      eq(c.future.status, 'programado', 'la de después de la fecha máxima');
    }],
    [G('publicación'), 'Un mismo reel va a una sola cuenta por red', async () => {
      const r = await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel, account_id: c.bad, scheduled_at: c.now }]);
      yes(r.status === 400 && /ya está en .* de Facebook/.test(r.j?.error), `otra cuenta de Facebook con el mismo reel: ${r.j?.error}`);
      const t = await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel3, account_id: c.acc.facebook, scheduled_at: '2026-12-11 11:00' }, { reel_id: c.reel3, account_id: c.bad, scheduled_at: '2026-12-11 12:00' }]);
      eq(t.status, 400, 'dos cuentas de la misma red en el mismo pedido');
      eq((await api('GET', `/api/projects/${c.p}/posts`)).j.filter((x) => x.reel_id === c.reel3).length, 0, 'el pedido rechazado dejó publicaciones a medias');
    }],
    [G('reels'), 'Un crudo no se publica; sus ediciones sí, con descripción y hashtags', async () => {
      const up = await api('POST', `/api/projects/${c.p}/reels`, form({ kind: 'crudo', files: [[new Blob([fakeMp4(1080, 1920, 30)], { type: 'video/mp4' }), 'crudo.mp4']] }), true);
      const crudo = up.j[0]; eq(crudo.kind, 'crudo', 'se subió como crudo');
      const p = await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: crudo.id, account_id: c.acc.instagram, scheduled_at: '2026-12-11 10:00' }]);
      yes(p.status === 400 && /es un crudo/.test(p.j?.error), `publicar un crudo: ${p.j?.error}`);
      const e = await api('PUT', `/api/reels/${c.reel3}`, { caption: 'Votá a la Azul #ListaAzul', hashtags: 'ListaAzul, #socios  elecciones', source_id: crudo.id });
      eq([e.status, e.j?.hashtags, e.j?.source_id], [200, '#ListaAzul #socios #elecciones', crudo.id], 'hashtags ordenados y edición del crudo');
      eq((await api('PUT', `/api/reels/${c.reel3}`, { source_id: c.reel })).status, 400, 'edición de algo que no es un crudo');
      eq((await api('PUT', `/api/reels/${c.reel}`, { kind: 'crudo' })).status, 400, 'pasar a crudo un reel ya publicado');
      eq((await api('PUT', `/api/reels/${c.reel3}`, { title: ' ' })).status, 400, 'sin título');
    }],
    [G('publicación'), '«Publicar ahora» la sube en el momento', async () => {
      eq((await api('POST', `/api/posts/${c.future.id}/now`)).status, 200, 'publicar ahora');
      let x; for (let i = 0; i < 20; i++) { await sleep(1000); x = (await api('GET', `/api/projects/${c.p}/posts`)).j.find((y) => y.id === c.future.id); if (x.status === 'publicado' || x.status === 'fallido') break; }
      eq(x.status, 'publicado', `estado (${x.error})`);
      eq((await api('POST', `/api/posts/${c.future.id}/now`)).status, 409, 'publicar de nuevo una ya publicada');
    }],
    [G('Meta Ads'), 'Prueba la cuenta, sube el padrón y crea la campaña en pausa', async () => {
      eq((await api('PUT', `/api/projects/${c.p}/pauta`, { budget: 3000, start_date: '2026-11-10', end_date: '2026-12-10' })).j?.budget, 3000, 'pauta');
      await api('PUT', `/api/projects/${c.p}/ads`, { adAccountId: 'act_999', accessToken: SECRETS[2], rate: 1200 });
      const t = await api('POST', `/api/projects/${c.p}/ads/test`); eq([t.status, t.j?.ads_currency], [200, 'ARS'], `cuenta publicitaria (${t.j?.error})`);
      const a = await api('POST', `/api/projects/${c.p}/ads/audience`); eq([a.status, a.j?.ads_audience_count], [200, 3], `público (${a.j?.error})`);
      const k = await api('POST', `/api/projects/${c.p}/ads/campaign`); eq([k.status, k.j?.ads_campaign_id], [200, 'CAMP1'], `campaña (${k.j?.error})`);
      yes(!JSON.stringify((await api('GET', `/api/projects/${c.p}`)).j).includes(SECRETS[2]), 'el proyecto devuelve el token de Ads');
    }],
    [G('Laboratorio'), 'Las trazas no guardan tokens ni huellas del padrón', async () => {
      const R = (await api('GET', '/api/lab/runs')).j;
      yes(R.length >= 8, `pocas corridas: ${R.length}`);
      let leak = '';
      for (const r of R) { const d = JSON.stringify((await api('GET', `/api/lab/runs/${r.id}`)).j); for (const s of SECRETS) if (d.includes(s)) leak += ` ${s} en la corrida ${r.id}`; if (/[0-9a-f]{64}/.test(d)) leak += ` huella en la corrida ${r.id}`; }
      yes(!leak, 'se filtró:' + leak);
    }],
    [G('cuentas'), 'Pausar y reanudar; el estado no se puede forzar', async () => {
      eq((await api('PUT', `/api/accounts/${c.acc.tiktok}`, { status: 'pausada' })).j?.status, 'pausada', 'pausar');
      eq((await api('PUT', `/api/accounts/${c.acc.tiktok}`, { status: 'activa' })).j?.status, 'conectada', 'reanudar');
      eq((await api('PUT', `/api/accounts/${c.bad}`, { status: 'conectada' })).j?.status, 'error', 'forzar conectada');
    }],
    [G('investigación'), 'Importa fichas y publicaciones y calcula los vectores solo', async () => {
      const r = await api('POST', `/api/projects/${c.p}/knowledge/import`, {
        items: [{ tipo: 'candidato', titulo: 'Nakis', texto: 'Prosecretario de la AFA, cercano a Tapia', confianza: 'alta' }, { tipo: 'economia', titulo: 'Deuda', texto: 'Inhibición de FIFA por la deuda con Bragantino' }, { tipo: 'x', titulo: '', texto: 'sin título no entra' }],
        instagram: [{ username: 'cuenta.prueba', followers_count: 1000, posts: [{ caption: 'Bochini asesor del fútbol', like_count: 90, comments_count: 10, timestamp: '2026-10-01T10:00:00Z', media_product_type: 'REELS' }, { caption: '', like_count: 1 }] }],
      });
      eq([r.j?.added, r.j?.posts], [2, 1], 'fichas y publicaciones (vacías afuera)');
      let pend = 99; for (let i = 0; i < 40 && pend; i++) { await sleep(1000); pend = (await api('GET', `/api/projects/${c.p}/knowledge`)).j.pending; }
      eq(pend, 0, 'vectores pendientes');
    }],
    [G('investigación'), 'Busca por significado y filtra por cuenta', async () => {
      const q = (await api('GET', `/api/projects/${c.p}/knowledge?q=${encodeURIComponent('quién tiene relación con la AFA')}`)).j;
      eq([q.mode, q.items[0]?.title], ['significado', 'Nakis'], 'modo y primer resultado');
      const h = (await api('GET', `/api/projects/${c.p}/knowledge?handle=cuenta.prueba`)).j;
      eq(h.items.map((x) => x.kind), ['publicacion'], 'filtro por cuenta');
      eq([h.accounts[0]?.handle, h.accounts[0]?.followers], ['cuenta.prueba', 1000], 'resumen de la cuenta');
    }],
    [G('investigación'), 'Volver a importar una cuenta reemplaza sus publicaciones', async () => {
      await api('POST', `/api/projects/${c.p}/knowledge/import`, { instagram: [{ username: 'cuenta.prueba', followers_count: 1200, posts: [{ caption: 'otra', like_count: 5, timestamp: '2026-11-01T10:00:00Z' }] }] });
      const h = (await api('GET', `/api/projects/${c.p}/knowledge?handle=cuenta.prueba`)).j;
      eq(h.items.map((x) => x.text), ['otra'], 'publicaciones de la cuenta');
    }],
    [G('conectar con un clic'), 'TikTok: autoriza, vuelve y queda conectada', async () => {
      const o = (await api('GET', '/api/oauth')).j;
      eq([o.tiktok, o.youtube], [true, true], 'apps cargadas');
      const a = (await api('POST', `/api/projects/${c.p}/accounts`, { network: 'tiktok' })).j; c.ttq = a.id;
      const url = (await api('POST', `/api/accounts/${a.id}/oauth`)).j?.url;
      yes(/\/v2\/auth\/authorize\/\?.*client_key=tt-app/.test(url) && /video\.publish/.test(url), `link de autorizar: ${url}`);
      const auth = await sb.box.raw(url, false);
      const back = auth.headers.get('location'); yes(back?.includes('/oauth/tiktok/callback?code=TTCODE'), `TikTok no volvió a ACM: ${back}`);
      const done = (await sb.box.raw(back)).headers.get('location') || '';
      yes(done.includes('conexion=ok') && done.includes(`#/p/${c.p}/cuentas`), `vuelta: ${decodeURIComponent(done)}`);
      const acc = (await api('GET', `/api/projects/${c.p}/accounts`)).j.find((x) => x.id === a.id);
      eq([acc.status, acc.handle, acc.fields.accessToken.set, acc.fields.clientKey.value], ['conectada', 'mock.tt', true, ''], 'estado, usuario, token y app (la app no se guarda en la cuenta)');
    }],
    [G('conectar con un clic'), 'YouTube: pide acceso sin vencimiento y queda conectado', async () => {
      const a = (await api('POST', `/api/projects/${c.p}/accounts`, { network: 'youtube' })).j; c.ytq = a.id;
      const url = (await api('POST', `/api/accounts/${a.id}/oauth`)).j?.url;
      yes(/access_type=offline/.test(url) && /prompt=consent/.test(url) && /youtube\.upload/.test(url) && /hl=en/.test(url), `link de autorizar: ${url}`);
      const back = (await sb.box.raw(url, false)).headers.get('location');
      const done = (await sb.box.raw(back)).headers.get('location') || '';
      yes(done.includes('conexion=ok'), `vuelta: ${decodeURIComponent(done)}`);
      const acc = (await api('GET', `/api/projects/${c.p}/accounts`)).j.find((x) => x.id === a.id);
      eq([acc.status, acc.handle], ['conectada', 'canalmock'], 'estado y canal');
    }],
    [G('conectar con un clic'), 'Publica en las cuentas conectadas con un clic (renueva con la app del servidor)', async () => {
      const now = (await api('GET', '/api/clock')).j.now;
      await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel3, account_id: c.ttq, scheduled_at: now, options: { privacy: 'PUBLIC_TO_EVERYONE' } }, { reel_id: c.reel3, account_id: c.ytq, scheduled_at: now }]);
      let P = []; for (let i = 0; i < 30; i++) { await sleep(1000); P = (await api('GET', `/api/projects/${c.p}/posts`)).j.filter((x) => [c.ttq, c.ytq].includes(x.account_id)); if (P.every((x) => !['programado', 'publicando'].includes(x.status))) break; }
      for (const x of P) eq(x.status, 'publicado', `${x.network} (${x.error})`);
    }],
    [G('conectar con un clic'), 'Rechaza un pedido vencido, de otra cuenta, cancelado o sin sesión', async () => {
      const bad = async (q, withCookie = true) => decodeURIComponent(((await sb.box.raw(`/oauth/tiktok/callback?${q}`, withCookie)).headers.get('location') || '').replace(/\+/g, ' '));
      yes((await bad(`code=TTCODE&state=${c.ttq}.9999999999999.ab.firmafalsa`)).includes('conexion=error'), 'aceptó un pedido con firma falsa para la cuenta correcta');
      const url = (await api('POST', `/api/accounts/${c.ytq}/oauth`)).j.url; // pedido de YouTube usado en la vuelta de TikTok
      const st = new URL(url).searchParams.get('state');
      yes((await bad(`code=TTCODE&state=${encodeURIComponent(st)}`)).includes('no es de esta cuenta'), 'aceptó el pedido de otra cuenta');
      const st2 = new URL((await api('POST', `/api/accounts/${c.ttq}/oauth`)).j.url).searchParams.get('state');
      yes((await bad(`error=access_denied&error_description=cancelado&state=${encodeURIComponent(st2)}`)).includes('No se autorizó'), 'no avisó que se canceló');
      yes((await bad(`code=TTCODE&state=${encodeURIComponent(st2)}`, false)).includes('sesión'), 'aceptó la vuelta sin sesión de ACM');
      const acc = (await api('GET', `/api/projects/${c.p}/accounts`)).j.find((x) => x.id === c.ttq);
      eq(acc.status, 'conectada', 'la cuenta tendría que seguir conectada');
    }],
    [G('conectar con un clic'), 'TikTok: muestra la cuenta y sus opciones antes de publicar', async () => {
      const r = (await api('GET', `/api/accounts/${c.ttq}/tiktok`)).j;
      eq([r.nickname, r.username, r.duetDisabled], ['Cuenta Mock', 'mock.tt', true], 'nombre, usuario y dúos apagados por la cuenta');
      yes(r.privacyOptions.includes('SELF_ONLY'), 'faltan las privacidades');
      const P = (await api('GET', `/api/projects/${c.p}/posts`)).j.find((x) => x.account_id === c.ttq);
      yes(/privado/.test(P.note), `la publicación pública tendría que haber salido privada y avisar: ${P.note}`);
    }],
    [G('páginas públicas'), 'Qué es ACM, privacidad y términos se ven sin entrar', async () => {
      for (const [u, want] of [['/acerca', 'Agentic Campaign Manager'], ['/privacidad', 'Limited Use'], ['/terminos', 'YouTube Terms of Service']]) {
        const r = await sb.box.raw(u, false); const t = await r.text();
        eq(r.status, 200, u); yes(t.includes(want), `${u} no dice «${want}»`);
      }
    }],
    [G('investigación'), 'El agente responde con las fichas y las cita', async () => {
      const r = await api('POST', `/api/projects/${c.p}/knowledge/ask`, { question: 'quién tiene relación con la AFA', history: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola, ¿qué querés saber?' }] });
      eq(r.status, 200, `respuesta (${r.j?.error})`);
      yes(/\[1\]/.test(r.j.answer) && r.j.sources[0]?.title === 'Nakis', `tendría que citar la ficha de Nakis: ${JSON.stringify(r.j)}`);
      const R = (await api('GET', '/api/lab/runs?kind=agente')).j;
      yes(R[0]?.status === 'ok', 'la pregunta no quedó en el Laboratorio');
      const d = JSON.stringify((await api('GET', `/api/lab/runs/${R[0].id}`)).j);
      yes(!d.includes('sk-ant-simulador'), 'la traza guarda la clave de Claude');
    }],
    [G('investigación'), 'El agente usa el modelo, el esfuerzo y el respaldo pedidos, y avisa si se niega', async () => {
      const L = (sb.simLog?.() || []).filter((l) => l.startsWith('claude '));
      const last = JSON.parse(L.at(-1).slice(7));
      eq([last.model, last.effort, last.fallbacks, /server-side-fallback-2026-07-01/.test(last.beta), last.key, last.turns], ['claude-opus-5-5', 'medium', 'default', true, true, 3], 'modelo, esfuerzo, respaldo, cabecera, clave y turnos');
      const r = await api('POST', `/api/projects/${c.p}/knowledge/ask`, { question: 'NEGATE esto' });
      yes(r.status === 400 && /no quiso responder/.test(r.j?.error), `tendría que avisar el rechazo: ${r.j?.error}`);
      eq((await api('POST', `/api/projects/${c.p}/knowledge/ask`, { question: '  ' })).status, 400, 'pregunta vacía');
    }],
    [G('campañas'), 'Reparte el presupuesto total sin pasarse', async () => {
      await api('PUT', `/api/projects/${c.p}/pauta`, { budget: 3000 });
      const a = await api('POST', `/api/projects/${c.p}/campaigns`, { name: 'Socios jóvenes', budget: 2000, accounts: [c.acc.instagram], reels: [c.reel], start_date: '2026-11-20', end_date: '2026-12-10' });
      eq(a.status, 200, `crear (${a.j?.error})`); c.camp = a.j.id;
      const b = await api('POST', `/api/projects/${c.p}/campaigns`, { name: 'Interior', budget: 1500 });
      yes(b.status === 400 && /quedan USD 1000/.test(b.j.error), `tendría que avisar que se pasa: ${b.j?.error}`);
      const b2 = await api('POST', `/api/projects/${c.p}/campaigns`, { name: 'Interior', budget: 1000 }); eq(b2.status, 200, 'la que entra justo');
      eq((await api('PUT', `/api/campaigns/${c.camp}`, { budget: 2500 })).status, 400, 'subir una campaña por encima del total');
      eq((await api('PUT', `/api/campaigns/${c.camp}`, { start_date: '2026-12-11' })).status, 400, 'termina antes de empezar');
      eq((await api('POST', `/api/projects/${c.p}/campaigns`, { name: 'X', budget: 10, accounts: [99999] })).status, 400, 'cuenta de otro proyecto');
      await api('DELETE', `/api/campaigns/${b2.j.id}`);
      const L = (await api('GET', `/api/projects/${c.p}/campaigns`)).j;
      eq([L.total, L.campaigns.length, L.campaigns[0].accounts, L.campaigns[0].reels], [3000, 1, [c.acc.instagram], [c.reel]], 'total, campañas, cuentas y reels');
    }],
    [G('campañas'), 'Crea la campaña en Meta en pausa y trae cuánto gastó', async () => {
      const m = await api('POST', `/api/campaigns/${c.camp}/meta`);
      eq([m.status, m.j?.meta_campaign_id, m.j?.meta_ads], [200, 'CAMP1', 1], `en Meta (${m.j?.error})`);
      const s = await api('POST', `/api/projects/${c.p}/campaigns/spend`);
      eq([s.status, s.j?.updated], [200, 1], 'actualizar gasto');
      const C = (await api('GET', `/api/projects/${c.p}/campaigns`)).j.campaigns[0];
      eq([C.spent, C.impressions, C.reach], [Math.round(121000 / 1200 * 1.21 * 100) / 100, 34000, 21000], 'gasto en USD con IVA, impresiones y alcance');
    }],
    [G('demo'), 'Un proyecto de demostración no publica ni pauta nada', async () => {
      eq((await api('PUT', `/api/projects/${c.p}`, { demo: '1' })).j?.demo, 1, 'modo demo prendido');
      await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.reel3, account_id: c.acc.instagram, scheduled_at: c.now }]);
      const x = (await api('GET', `/api/projects/${c.p}/posts`)).j.filter((y) => y.status === 'programado').at(-1);
      await sleep(2500);
      eq((await api('GET', `/api/projects/${c.p}/posts`)).j.find((y) => y.id === x.id).status, 'programado', 'el programador la publicó igual');
      const r = await api('POST', `/api/posts/${x.id}/now`); yes(r.status === 400 && /demostración/.test(r.j?.error), `publicar ahora: ${r.j?.error}`);
      eq((await api('POST', `/api/projects/${c.p}/campaigns/spend`)).status, 400, 'actualizar gasto en Meta');
      eq((await api('POST', `/api/campaigns/${c.camp}/meta`)).status, 400, 'crear campaña en Meta');
      await api('DELETE', `/api/posts/${x.id}`);
      eq((await api('PUT', `/api/projects/${c.p}`, { demo: '0' })).j?.demo, 0, 'modo demo apagado');
    }],
    [G('almacenamiento'), 'Sube directo a R2 con link firmado, lo muestra y lo publica desde ahí', async () => {
      eq((await api('GET', '/api/storage')).j?.r2, true, 'R2 configurado');
      const mp4 = fakeMp4(1080, 1920, 12);
      const up = await api('POST', `/api/projects/${c.p}/reels/uploads`, { files: [{ name: 'edicion-r2.mp4', size: mp4.length, type: 'video/mp4' }] });
      eq(up.status, 200, `links firmados (${up.j?.error})`);
      const { key, url } = up.j[0];
      yes(/X-Amz-Signature=/.test(url) && !url.includes('r2-secret-simulador'), 'el link no está firmado o trae la clave');
      eq((await api('POST', `/api/projects/${c.p}/reels/complete`, { items: [{ key, name: 'edicion-r2.mp4' }] })).status, 400, 'avisar antes de subir');
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: mp4 }); eq(put.status, 200, 'subida directa del navegador');
      const done = await api('POST', `/api/projects/${c.p}/reels/complete`, { kind: 'listo', items: [{ key, name: 'edicion-r2.mp4', duration: 12, width: 1080, height: 1920 }] });
      eq([done.status, done.j?.[0]?.storage, done.j?.[0]?.size, done.j?.[0]?.duration], [200, 'r2', mp4.length, 12], `reel en R2 (${done.j?.error})`);
      c.r2reel = done.j[0].id;
      eq((await api('POST', `/api/projects/${c.p}/reels/complete`, { items: [{ key, name: 'otra.mp4' }] })).status, 400, 'el mismo archivo dos veces');
      eq((await api('POST', `/api/projects/${c.p}/reels/uploads`, { files: [{ name: 'virus.exe', size: 10 }] })).status, 400, 'archivo que no es video');
      const m = await sb.box.raw(`/media/${key}`); yes(m.status === 302 && /X-Amz-Signature=/.test(m.headers.get('location') || ''), `ver el video: ${m.status}`);
      eq((await sb.box.raw(`/media/${key}`, false)).status, 401, 'ver el video sin sesión');
      await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.r2reel, account_id: c.acc.facebook, scheduled_at: (await api('GET', '/api/clock')).j.now }]);
      let x; for (let i = 0; i < 20; i++) { await sleep(1000); x = (await api('GET', `/api/projects/${c.p}/posts`)).j.find((y) => y.reel_id === c.r2reel); if (x && !['programado', 'publicando'].includes(x.status)) break; }
      eq(x?.status, 'publicado', `publicar desde R2 (${x?.error})`);
    }],
    [G('almacenamiento'), 'La limpieza borra los videos ya publicados y deja la ficha', async () => {
      const r = await api('POST', '/api/maintenance/cleanup', { days: 0 });
      yes(r.status === 200 && r.j.ediciones >= 1, `limpieza: ${JSON.stringify(r.j)}`);
      const R = (await api('GET', `/api/projects/${c.p}/reels`)).j;
      const a = R.find((y) => y.id === c.r2reel);
      yes(a.archived_at, 'el reel de R2 no quedó archivado');
      eq((await sb.box.raw(`/media/${a.file}`)).status, 302, 'la ficha sigue');
      yes((sb.simLog?.() || []).some((l) => l === `r2 DELETE ${a.file}`), 'no se borró de R2');
      const p = await api('POST', `/api/projects/${c.p}/posts`, [{ reel_id: c.r2reel, account_id: c.acc.youtube, scheduled_at: '2026-12-11 10:00' }]);
      yes(p.status === 400 && /ya se borró/.test(p.j?.error), `programar un video borrado: ${p.j?.error}`);
      eq((await api('POST', '/api/maintenance/cleanup', { days: 30 })).j, { ediciones: 0, crudos: 0 }, 'con 30 días no tendría que borrar nada');
    }],
    [G('editor'), 'Las rutas del editor piden la clave del editor: sin ella, 401', async () => {
      const raw = (path, body, auth) => als.exit(() => fetch(sb.box.base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }));
      eq((await raw('/api/editor/edicion', { crudo_id: 1, clip_id: 'x', file_url: 'http://x/y.mp4' })).status, 401, 'edicion sin token');
      eq((await raw('/api/editor/edicion', { crudo_id: 1 }, 'Bearer otro')).status, 401, 'edicion con token malo');
      eq((await raw('/api/editor/estado', { reel_id: 1, estado: 'listo' })).status, 401, 'estado sin token');
    }],
    [G('editor'), 'Completar la subida de un crudo manda el trabajo al editor con el token', async () => {
      yes(sb.editor, 'no hay editor de mentira');
      const mp4 = fakeMp4(1080, 1920, 30);
      const up = await api('POST', `/api/projects/${c.p}/reels/uploads`, { files: [{ name: 'crudo-editor.mp4', size: mp4.length, type: 'video/mp4' }] });
      const { key, url } = up.j[0];
      eq((await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: mp4 })).status, 200, 'subida');
      const done = await api('POST', `/api/projects/${c.p}/reels/complete`, { kind: 'crudo', items: [{ key, name: 'crudo-editor.mp4', duration: 30 }] });
      eq([done.status, done.j?.[0]?.kind, done.j?.[0]?.status], [200, 'crudo', 'en_cola'], 'crudo en cola');
      c.crudo = done.j[0].id;
      for (let i = 0; i < 40 && !sb.editor.jobs.length; i++) await sleep(100);
      const job = sb.editor.jobs[0]; yes(job, 'el editor no recibió el trabajo');
      eq(job.auth, `Bearer ${EDITOR_TOKEN}`, 'token');
      eq([job.body.project_id, job.body.reel_id, job.body.duracion_s], [c.p, c.crudo, 30], 'datos del trabajo');
      yes(/X-Amz-Signature=/.test(job.body.url), 'el link del crudo no está firmado');
      yes(/\/api\/editor\/aprendizajes\/\d+$/.test(job.body.aprendizajes_url), `aprendizajes_url: ${job.body.aprendizajes_url}`);
    }],
    [G('editor'), 'El estado del crudo avanza con los avisos del editor y rechaza uno inventado', async () => {
      const post = (b) => sb.box.editorApi('/api/editor/estado', b);
      eq((await post({ reel_id: c.crudo, estado: 'transcribiendo', detalle: 'Escuchando' })).status, 200, 'transcribiendo');
      let r = (await api('GET', `/api/projects/${c.p}/reels`)).j.find((x) => x.id === c.crudo);
      eq([r.status, r.status_detail], ['transcribiendo', 'Escuchando'], 'estado guardado');
      eq((await post({ reel_id: c.crudo, estado: 'inventado' })).status, 400, 'estado inválido');
      eq((await post({ reel_id: 999999, estado: 'listo' })).status, 404, 'crudo inexistente');
      eq((await post({ reel_id: c.crudo, estado: 'listo' })).status, 200, 'listo');
    }],
    [G('editor'), 'POST /api/editor/edicion con token crea el reel listo con source_id, clip_id y review pendiente', async () => {
      const b = { crudo_id: c.crudo, clip_id: 'clip-abc', moment: { inicio_s: 1, fin_s: 9 }, recipe: { id: 'rapido' }, caption: 'Un corte', hashtags: 'club, deporte', file_url: `${sb.editor.base}/video.mp4`, cover_url: `${sb.editor.base}/portada.jpg`, duration: 8, expires_at: '2026-12-01 12:00' };
      const r = await sb.box.editorApi('/api/editor/edicion', b);
      eq(r.status, 200, `entrega (${r.j?.error})`);
      eq([r.j.kind, r.j.source_id, r.j.clip_id, r.j.review, r.j.storage, r.j.expires_at], ['listo', c.crudo, 'clip-abc', 'pendiente', 'r2', '2026-12-01 12:00'], 'reel creado');
      eq([JSON.parse(r.j.moment).fin_s, JSON.parse(r.j.recipe).id, r.j.hashtags, r.j.duration], [9, 'rapido', '#club #deporte', 8], 'datos');
      yes(r.j.cover && (await sb.box.raw(`/media/${r.j.cover}`)).status === 200, 'la portada no se sirve');
      eq((await sb.box.raw(`/media/${r.j.file}`)).status, 302, 'el video quedó en R2');
      yes((sb.simLog?.() || []).some((l) => l === `r2 PUT ${r.j.file}`), 'no se subió a R2');
      eq((await sb.box.editorApi('/api/editor/edicion', { ...b, crudo_id: 999999 })).status, 404, 'crudo inexistente');
      eq((await sb.box.editorApi('/api/editor/edicion', { ...b, clip_id: '' })).status, 400, 'sin clip_id');
      eq((await sb.box.editorApi('/api/editor/edicion', { ...b, review: 'x' })).status, 400, 'revisión inválida');
    }],
    [G('editor'), 'Sin EDITOR_URL el crudo queda en cola y no hay error', async () => {
      const box = await startSandbox({ ...sb.bases, editor: '' });
      try {
        const p = (await box.api('POST', '/api/login', { password: box.password }), (await box.api('POST', '/api/projects', (() => { const f = new FormData(); f.set('name', 'Sin editor'); return f; })(), true)).j.id);
        const mp4 = fakeMp4(1080, 1920, 20);
        const up = await box.api('POST', `/api/projects/${p}/reels/uploads`, { files: [{ name: 'c.mp4', size: mp4.length, type: 'video/mp4' }] });
        await fetch(up.j[0].url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: mp4 });
        const done = await box.api('POST', `/api/projects/${p}/reels/complete`, { kind: 'crudo', items: [{ key: up.j[0].key, name: 'c.mp4', duration: 20 }] });
        eq([done.status, done.j?.[0]?.status], [200, 'en_cola'], 'en cola');
        await sleep(300);
        eq((await box.api('GET', `/api/projects/${p}/reels`)).j[0].status, 'en_cola', 'sigue en cola, sin error');
      } finally { await box.stop(); }
    }],
    [G('proyecto'), 'Borrar el proyecto se lleva todo lo suyo', async () => {
      eq((await api('DELETE', `/api/projects/${c.p}`)).j?.ok, true, 'borrar');
      eq((await api('GET', `/api/projects/${c.p}`)).status, 404, 'el proyecto sigue');
      eq((await api('GET', '/api/overview')).j?.upcoming?.length, 0, 'quedaron publicaciones');
      eq((await api('GET', '/api/nada')).status, 404, '404 de la API');
    }],
  ];
}
