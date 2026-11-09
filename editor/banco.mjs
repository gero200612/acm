// Banco del orquestador: corre con `node editor/banco.mjs` contra un Estudio falso y un ACM falso (servidores locales).
// Imprime cada caso y «pasaron X de Y»; sale con código 1 si alguno falla.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirDb } from './db.js';
import { crearEstudio } from './estudio.js';
import { crearAcm } from './acm.js';
import { crearEditor } from './server.js';
import { crearRunner } from './runner.js';
import { repo } from './db.js';

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)}`); };
const yes = (c, what) => { if (!c) throw new Error(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escuchar = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => { s.closeAllConnections(); s.close(r); }) })); });
const cuerpo = (req) => new Promise((r) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => r(Buffer.concat(c).toString())); });
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

const TOKEN = 'tok-editor', CLAVE = 'clave-estudio', EMPRESA = 'empresa-1';
const VIDEO = Buffer.alloc(2048, 5);

// Estudio falso: respeta el contrato (202 {id}, estados en_cola → procesando → listo, descargas con autenticación)
async function estudioFalso(opc = {}) {
  const log = [], tareas = new Map(); let n = 0;
  const srv = await escuchar(async (req, res) => {
    const u = new URL(req.url, 'http://x'), b = await cuerpo(req);
    const authOk = req.headers['x-empresa'] === EMPRESA && req.headers.authorization === `Bearer ${CLAVE}`;
    if (!authOk) { log.push(`sin-auth ${req.method} ${u.pathname}`); return json(res, 401, { error: 'auth' }); }
    log.push(`${req.method} ${u.pathname}`);
    if (req.method === 'POST' && (u.pathname === '/v1/transcribir' || u.pathname === '/v1/editar-recorte')) {
      const id = `t${++n}`; tareas.set(id, { tipo: u.pathname, pedido: JSON.parse(b), polls: 0 }); log.push(`pedido ${u.pathname} ${b}`);
      return json(res, 202, { id });
    }
    const m = u.pathname.match(/^\/v1\/(transcribir|editar-recorte)\/(t\d+)$/);
    if (m) {
      const t = tareas.get(m[2]); t.polls++;
      if (t.polls === 1) return json(res, 200, { estado: 'en_cola', progreso: 0 });
      if (t.polls === 2) return json(res, 200, { estado: 'procesando', progreso: 0.5 });
      if (m[1] === 'transcribir') {
        if (opc.falloTranscribir) return json(res, 200, { estado: 'fallo', error: 'whisper se cayó' });
        return json(res, 200, { estado: 'listo', progreso: 1, resultado: { duracion_s: 60, palabras: [{ inicio_s: 1, fin_s: 2, texto: 'hola' }, { inicio_s: 10, fin_s: 11, texto: 'chau' }, { inicio_s: 30, fin_s: 31, texto: 'afuera' }], audio: { lufs: -20 } } });
      }
      return json(res, 200, { estado: 'listo', resultado: { archivo: `/archivos/${m[2]}.mp4`, portada: `/archivos/${m[2]}.jpg`, duracion_s: t.pedido.fin_s - t.pedido.inicio_s, receta: t.pedido.receta, tecnica: {}, cuadros: [] } });
    }
    if (u.pathname.startsWith('/archivos/')) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(VIDEO); }
    json(res, 404, {});
  });
  return { ...srv, log, pedidos: (ruta) => log.filter((l) => l.startsWith(`pedido ${ruta} `)).map((l) => JSON.parse(l.slice(`pedido ${ruta} `.length))) };
}

// ACM falso: guarda los avisos y, al recibir una edición, baja el video del link (como hace ACM de verdad)
async function acmFalso() {
  const estados = [], ediciones = [];
  const srv = await escuchar(async (req, res) => {
    const b = await cuerpo(req);
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: 'sin token' });
    if (req.url === '/api/editor/estado') { const o = JSON.parse(b); estados.push(`${o.reel_id}:${o.estado}`); return json(res, 200, { ok: true }); }
    if (req.url === '/api/editor/edicion') {
      const o = JSON.parse(b);
      const f = await fetch(o.file_url); o.bajado = f.ok ? (await f.arrayBuffer()).byteLength : -f.status;
      if (o.cover_url) o.portada_bajada = (await fetch(o.cover_url)).ok;
      ediciones.push(o); return json(res, 200, { id: ediciones.length });
    }
    json(res, 404, {});
  });
  return { ...srv, estados, ediciones };
}

async function montar({ estudioOpc, hooks } = {}) {
  const est = await estudioFalso(estudioOpc), acm = await acmFalso();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-banco-'));
  let app; // el editor necesita saber su dirección pública, que recién existe al escuchar
  const srv = await escuchar((req, res) => app(req, res));
  const editor = crearEditor({
    token: TOKEN, db: abrirDb(), dir: path.join(dir, 'entregas'), log: () => {}, hooks, publicUrl: srv.base,
    estudio: crearEstudio({ url: est.base, empresa: EMPRESA, clave: CLAVE, intervaloMs: 5 }),
    acm: crearAcm({ url: acm.base, token: TOKEN, reintentos: 2, esperaMs: 5 }),
  });
  app = editor.app;
  const fin = async () => { editor.runner.detener(); await sleep(20); await Promise.all([est.close(), acm.close(), srv.close()]); fs.rmSync(dir, { recursive: true, force: true }); };
  return { est, acm, srv, editor, dir, fin };
}
const esperarEstado = async (m, id, estados, ms = 5000) => {
  for (let t = 0; t < ms; t += 20) { const j = m.editor.runner.trabajo(id); if (estados.includes(j.estado) && m.acm.estados.at(-1) === `${j.reel_id}:${j.estado}`) return j; await sleep(20); }
  throw new Error(`el trabajo ${id} no llegó a ${estados} (va por «${m.editor.runner.trabajo(id).estado}»)`);
};
const post = (m, ruta, body, token = TOKEN) => fetch(m.srv.base + ruta, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const TRABAJO = { project_id: 7, reel_id: 42, url: 'http://r2.test/crudo.mp4', duracion_s: 60, aprendizajes_url: '' };

// momentos y recetas de prueba: lo que enchufan las tareas siguientes
const hooksDePrueba = {
  elegirMomentos: async ({ transcripcion }) => { yes(transcripcion.palabras.length === 3, 'no llegó la transcripción'); return [{ inicio_s: 0, fin_s: 12, caption: 'Un corte', hashtags: '#club' }]; },
  armarRecetas: async () => [{ id: 'rapido' }, { id: 'calmo' }],
  revisar: async () => ({ review: 'aprobado', caption: 'Texto revisado' }),
};

const casos = [
  ['Servidor', 'POST /trabajos sin token da 401 y con token 202 {id}', async () => {
    const m = await montar();
    try {
      eq((await post(m, '/trabajos', TRABAJO, null)).status, 401, 'sin token');
      eq((await post(m, '/trabajos', TRABAJO, 'otro')).status, 401, 'token malo');
      eq((await post(m, '/trabajos', { reel_id: 1 })).status, 400, 'datos incompletos');
      const r = await post(m, '/trabajos', TRABAJO); eq(r.status, 202, 'con token'); yes((await r.json()).id, 'sin id');
      const r2 = await post(m, '/trabajos', TRABAJO); eq((await r2.json()).id, 1, 'el mismo crudo en marcha no se duplica');
    } finally { await m.fin(); }
  }],
  ['Tubería', 'Un trabajo completo avisa cada etapa a ACM, entrega las ediciones y termina en listo', async () => {
    const m = await montar({ hooks: hooksDePrueba });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['listo', 'error']);
      eq([j.estado, j.detalle], ['listo', '2 ediciones'], 'estado final');
      eq(m.acm.estados, ['42:transcribiendo', '42:buscando_momentos', '42:editando', '42:revisando', '42:listo'], 'etapas avisadas a ACM');
      eq(m.est.log.filter((l) => l.startsWith('sin-auth')), [], 'todo pedido al Estudio lleva X-Empresa y Bearer');
      const peds = m.est.pedidos('/v1/editar-recorte');
      eq(peds.map((p) => p.receta.id), ['rapido', 'calmo'], 'recetas pedidas');
      eq([peds[0].inicio_s, peds[0].fin_s, peds[0].palabras.map((p) => p.texto)], [0, 12, ['hola', 'chau']], 'solo las palabras del momento');
      eq(m.acm.ediciones.length, 2, 'ediciones entregadas');
      const e = m.acm.ediciones[0];
      yes(e.edicion_id > 0, 'falta edicion_id'); eq([e.crudo_id, e.clip_id, e.review, e.caption, e.duration, e.bajado, e.portada_bajada], [42, 'c42-1', 'aprobado', 'Texto revisado', 12, VIDEO.length, true], 'entrega con archivo bajable');
      eq(m.acm.ediciones.map((x) => x.clip_id), ['c42-1', 'c42-1'], 'las dos versiones comparten clip_id');
      eq(fs.readdirSync(path.join(m.dir, 'entregas')), [], 'los archivos entregados se borran');
      const g = await (await fetch(`${m.srv.base}/trabajos/${id}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
      eq(g.estado, 'listo', 'GET del trabajo');
    } finally { await m.fin(); }
  }],
  ['Tubería', 'Con los rellenos (sin momentos) el trabajo termina en sin_momentos', async () => {
    const m = await montar();
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['sin_momentos', 'error']);
      eq(j.estado, 'sin_momentos', 'estado'); eq(m.acm.estados.at(-1), '42:sin_momentos', 'ACM avisado'); eq(m.acm.ediciones.length, 0, 'nada entregado');
    } finally { await m.fin(); }
  }],
  ['Tubería', 'Si el Estudio falla el trabajo termina en error con el motivo, avisado a ACM', async () => {
    const m = await montar({ estudioOpc: { falloTranscribir: true } });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['error', 'listo']);
      eq([j.estado, j.detalle], ['error', 'whisper se cayó'], 'estado'); eq(m.acm.estados.at(-1), '42:error', 'ACM avisado');
    } finally { await m.fin(); }
  }],
  ['Tubería', 'Un trabajo a medias se retoma sin repetir la transcripción', async () => {
    const m = await montar({ hooks: { ...hooksDePrueba, elegirMomentos: async () => { throw new Error('se cortó la luz'); } } });
    try {
      const id = m.editor.runner.encolar(TRABAJO);
      eq((await m.editor.runner.procesar(id)).estado, 'error', 'primera vuelta falla');
      // el servidor se reinició a mitad de camino: el trabajo quedó en buscando_momentos con la transcripción guardada
      const db = m.editor.db;
      db.prepare("UPDATE trabajos SET estado = 'buscando_momentos' WHERE id = ?").run(id);
      const runner2 = crearRunner({ db, estudio: crearEstudio({ url: m.est.base, empresa: EMPRESA, clave: CLAVE, intervaloMs: 5 }), acm: crearAcm({ url: m.acm.base, token: TOKEN }), publicUrl: m.srv.base, dir: path.join(m.dir, 'entregas'), log: () => {}, ...hooksDePrueba });
      eq(runner2.pendientes(), [id], 'el trabajo a medias figura pendiente');
      eq((await runner2.procesar(id)).estado, 'listo', 'segunda vuelta');
      eq(m.est.log.filter((l) => l === 'POST /v1/transcribir').length, 1, 'transcribió una sola vez');
    } finally { await m.fin(); }
  }],
];

casos.push(['Cola', 'Primero los cortos (sin duración al final); el que espera 2 h o más compite como corto', async () => {
  const db = abrirDb(), R = repo(db);
  const mk = (reel_id, duracion_s) => R.crearTrabajo({ project_id: 1, reel_id, url: 'http://x/y.mp4', duracion_s });
  const largo = mk(1, 3600), corto = mk(2, 60), medio = mk(3, 600), sinDur = mk(4, null);
  const orden = () => { const o = []; for (let id; (id = R.siguiente());) { o.push(id); R.estado(id, 'listo'); } return o; };
  eq(orden(), [corto, medio, largo, sinDur], 'por duración');
  const a = mk(5, 3600), b = mk(6, 60);
  db.prepare("UPDATE trabajos SET created_at = datetime('now', '-3 hours') WHERE id = ?").run(a);
  eq(orden(), [a, b], 'el largo que espera hace 3 h pasa adelante');
}]);

let ok = 0;
for (const [grupo, nombre, fn] of casos) {
  const t0 = Date.now();
  try { await fn(); ok++; console.log(`  ✓ ${grupo} · ${nombre} (${Date.now() - t0} ms)`); }
  catch (e) { console.log(`  ✗ ${grupo} · ${nombre} (${Date.now() - t0} ms)\n      ${e.message}`); }
}
console.log(`\nPasaron ${ok} de ${casos.length} casos`);
process.exit(ok === casos.length ? 0 : 1);
