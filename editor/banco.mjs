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
import { validarMomentos, crearElegirMomentos, ajustarAFrases } from './momentos.js';
import { herramientaMomentos, HERRAMIENTA_MOMENTOS, usuarioMomentos, usuarioTextos } from './prompts.js';
import { crearArmarRecetas, elegirVariables, normalizarAprendizajes, opcionesPermitidas, construirReceta, cartelCorto, frasesCandidatas } from './recetas.js';
import { finDeFrase, inicioDeFrase } from './frases.js';
import { crearCriterio } from './criterio.js';
import { crearClaude } from './claude.js';
import { paraEstudio } from './runner.js';
import { crearAnalista, corregirReceta, elegirCuadros } from './analista.js';
import { tramosAEstado, notasDe } from './mirar.js';

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)}`); };
const yes = (c, what) => { if (!c) throw new Error(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escuchar = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => { s.closeAllConnections(); s.close(r); }) })); });
const cuerpo = (req) => new Promise((r) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => r(Buffer.concat(c).toString())); });
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

const TOKEN = 'tok-editor', CLAVE = 'clave-estudio', EMPRESA = 'empresa-1';
const VIDEO = Buffer.alloc(2048, 5);

// planillas de 16 cuadros como las del Estudio: un cuadro cada cada_s entre desde_s y hasta_s (el video falso dura 60 s)
function planillasFalsas({ desde_s = 0, hasta_s = 60, cada_s = 2 }) {
  const ts = []; for (let x = desde_s; x < hasta_s - 1e-9; x += cada_s) ts.push(Math.round(x * 100) / 100);
  const planillas = [];
  for (let i = 0; i < ts.length; i += 16) { const tt = ts.slice(i, i + 16); planillas.push({ ruta: `/cuadros/p${planillas.length + 1}.jpg`, desde_s: tt[0], hasta_s: Math.min(hasta_s, tt.at(-1) + cada_s), tiempos_s: tt }); }
  return { version: 1, duracion_s: 60, cada_s, planillas };
}

// Estudio falso: respeta el contrato (202 {id}, estados en_cola → procesando → listo, descargas con autenticación)
async function estudioFalso(opc = {}) {
  const log = [], tareas = new Map(); let n = 0;
  const srv = await escuchar(async (req, res) => {
    const u = new URL(req.url, 'http://x'), b = await cuerpo(req);
    const authOk = req.headers['x-empresa'] === EMPRESA && req.headers.authorization === `Bearer ${CLAVE}`;
    if (!authOk) { log.push(`sin-auth ${req.method} ${u.pathname}`); return json(res, 401, { error: 'auth' }); }
    log.push(`${req.method} ${u.pathname}`);
    if (req.method === 'POST' && (u.pathname === '/v1/transcribir' || u.pathname === '/v1/editar-recorte' || u.pathname === '/v1/mirar')) {
      const id = `t${++n}`; tareas.set(id, { tipo: u.pathname, pedido: JSON.parse(b), polls: 0 }); log.push(`pedido ${u.pathname} ${b}`);
      return json(res, 202, { id });
    }
    const m = u.pathname.match(/^\/v1\/(transcribir|editar-recorte|mirar)\/(t\d+)$/);
    if (m) {
      const t = tareas.get(m[2]); t.polls++;
      if (t.polls === 1) return json(res, 200, { estado: 'en_cola', progreso: 0 });
      if (t.polls === 2) return json(res, 200, { estado: 'procesando', progreso: 0.5 });
      if (m[1] === 'mirar') {
        if (opc.falloMirar) return json(res, 200, { estado: 'fallo', error: 'ffmpeg no pudo con el video' });
        return json(res, 200, { estado: 'listo', progreso: 1, resultado: planillasFalsas(t.pedido) });
      }
      if (m[1] === 'transcribir') {
        if (opc.falloTranscribir) return json(res, 200, { estado: 'fallo', error: 'whisper se cayó' });
        if (opc.sinAudio) return json(res, 200, { estado: 'fallo', error: 'El video no tiene audio: sin habla, no hay nada que transcribir.' });
        return json(res, 200, { estado: 'listo', progreso: 1, resultado: { duracion_s: 60, palabras: opc.palabras || [{ inicio_s: 1, fin_s: 2, texto: 'hola' }, { inicio_s: 10, fin_s: 11, texto: 'chau' }, { inicio_s: 30, fin_s: 31, texto: 'afuera' }], audio: { lufs: -20 } } });
      }
      return json(res, 200, { estado: 'listo', resultado: { archivo: `/archivos/${m[2]}.mp4`, portada: `/archivos/${m[2]}.jpg`, duracion_s: t.pedido.fin_s - t.pedido.inicio_s, receta: t.pedido.receta, tecnica: opc.tecnica ? opc.tecnica(t.pedido) : {}, cuadros: opc.cuadros ? opc.cuadros : [] } });
    }
    if (u.pathname.startsWith('/cuadros/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); }
    if (u.pathname.startsWith('/archivos/')) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(VIDEO); }
    json(res, 404, {});
  });
  return { ...srv, log, pedidos: (ruta) => log.filter((l) => l.startsWith(`pedido ${ruta} `)).map((l) => JSON.parse(l.slice(`pedido ${ruta} `.length))) };
}

// ACM falso: guarda los avisos y, al recibir una edición, baja el video del link (como hace ACM de verdad)
async function acmFalso(opc = {}) {
  const estados = [], detalles = [], ediciones = [], rehechos = [];
  const srv = await escuchar(async (req, res) => {
    const b = await cuerpo(req);
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: 'sin token' });
    if (req.url === '/api/editor/estado') { const o = JSON.parse(b); estados.push(`${o.reel_id}:${o.estado}`); detalles.push(`${o.estado}:${o.detalle || ''}`); return json(res, 200, { ok: true }); }
    if (req.url === '/api/editor/rehecho') { rehechos.push(JSON.parse(b)); return json(res, 200, { ok: true }); }
    if (req.url === '/api/editor/edicion') {
      const o = JSON.parse(b);
      const f = await fetch(o.file_url); o.bajado = f.ok ? (await f.arrayBuffer()).byteLength : -f.status;
      if (o.cover_url) o.portada_bajada = (await fetch(o.cover_url)).ok;
      ediciones.push(o); return json(res, 200, { id: ediciones.length });
    }
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/editor/aprendizajes/7') return json(res, 200, { project_id: 7, descripcion: opc.descripcion || '', buscar: opc.buscar || '', aprendizajes: [{ ritmo: 'rapido', horario: { instagram: '20:00' } }], investigacion: ['Candidato X: pide más seguridad'] });
    json(res, 404, {});
  });
  return { ...srv, estados, detalles, ediciones, rehechos };
}

async function montar({ estudioOpc, hooks, acmOpc } = {}) {
  const est = await estudioFalso(estudioOpc), acm = await acmFalso(acmOpc);
  const estudio = crearEstudio({ url: est.base, empresa: EMPRESA, clave: CLAVE, intervaloMs: 5 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-banco-'));
  let app; // el editor necesita saber su dirección pública, que recién existe al escuchar
  const srv = await escuchar((req, res) => app(req, res));
  const editor = crearEditor({
    token: TOKEN, db: abrirDb(), dir: path.join(dir, 'entregas'), log: () => {}, hooks: typeof hooks === 'function' ? hooks(estudio) : hooks, publicUrl: srv.base,
    estudio,
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
  ['Tubería', 'El editor trae de ACM lo aprendido y la investigación del proyecto y se los pasa a elegirMomentos y armarRecetas', async () => {
    const vistos = {};
    const m = await montar({ hooks: { ...hooksDePrueba,
      elegirMomentos: async (a) => { vistos.momentos = { aprendizajes: a.aprendizajes, investigacion: a.investigacion }; return [{ inicio_s: 0, fin_s: 12 }]; },
      armarRecetas: async (a) => { vistos.recetas = a.aprendizajes; return [{ id: 'rapido' }]; } } });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', { ...TRABAJO, aprendizajes_url: `${m.acm.base}/api/editor/aprendizajes/7` })).json()).id;
      await esperarEstado(m, id, ['listo', 'error']);
      eq(vistos.momentos.investigacion, ['Candidato X: pide más seguridad'], 'investigación a elegirMomentos');
      eq(vistos.momentos.aprendizajes[0].ritmo, 'rapido', 'aprendizajes a elegirMomentos');
      eq(vistos.recetas[0].ritmo, 'rapido', 'aprendizajes a armarRecetas');
      eq(normalizarAprendizajes(vistos.recetas).horario, { instagram: '20:00' }, 'el horario por red se conserva');
    } finally { await m.fin(); }
  }],
  ['Tubería', 'Un trabajo completo avisa cada etapa a ACM, entrega las ediciones y termina en listo', async () => {
    const m = await montar({ hooks: hooksDePrueba });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['listo', 'error']);
      eq([j.estado, j.detalle], ['listo', '2 ediciones'], 'estado final');
      // «editando» se repite: después de cada edición va el avance («1 de 2 editadas»)
      eq(m.acm.estados.filter((x, i, a) => x !== a[i - 1]), ['42:transcribiendo', '42:buscando_momentos', '42:editando', '42:revisando', '42:listo'], 'etapas avisadas a ACM');
      const avance = m.acm.detalles.filter((x) => x.startsWith('editando:'));
      if (!avance.length || !/^editando:\d+ de \d+ editadas$/.test(avance.at(-1)) || avance.at(-1).split(':')[1].split(' de ')[0] !== avance.at(-1).split(' de ')[1].split(' ')[0]) throw new Error(`el avance de la edición no llegó a ACM: ${JSON.stringify(avance)}`);
      eq(m.est.log.filter((l) => l.startsWith('sin-auth')), [], 'todo pedido al Estudio lleva X-Empresa y Bearer');
      const peds = m.est.pedidos('/v1/editar-recorte');
      eq(peds.map((p) => p.receta.id), ['rapido', 'calmo'], 'recetas pedidas');
      eq([peds[0].inicio_s, peds[0].fin_s, peds[0].palabras.map((p) => p.texto)], [0, 13, ['hola', 'chau']], 'solo las palabras del momento, con un segundo de aire al final');
      eq(m.acm.ediciones.length, 2, 'ediciones entregadas');
      const e = m.acm.ediciones[0];
      yes(/^[0-9a-f-]{36}$/.test(e.edicion_id) && e.edicion_id !== m.acm.ediciones[1].edicion_id, 'edicion_id: un UUID distinto por edición'); eq([e.crudo_id, e.clip_id, e.review, e.caption, e.duration, e.bajado, e.portada_bajada], [42, `c42-${id}-1`, 'aprobado', 'Texto revisado', 13, VIDEO.length, true], 'entrega con archivo bajable');
      eq(m.acm.ediciones.map((x) => x.clip_id), [`c42-${id}-1`, `c42-${id}-1`], 'las dos versiones comparten clip_id');
      eq(fs.readdirSync(path.join(m.dir, 'entregas')), [], 'los archivos entregados se borran');
      const g = await (await fetch(`${m.srv.base}/trabajos/${id}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
      eq(g.estado, 'listo', 'GET del trabajo');
    } finally { await m.fin(); }
  }],
  ['Rehacer', 'Rehacer a pedido: la edición rechazada se vuelve a editar con lo pedido y llega a ACM como versión nueva del mismo recorte, pendiente', async () => {
    const m = await montar({ hooks: { ...hooksDePrueba, armarRecetas: async () => [{ subtitulos: 'karaoke', musica: { clima: 'energico', volumen: 0.25 }, ritmo: 'rapido', zoom: true, largo_s: 12, gancho: { desde_s: 0 }, variables: { subtitulos: 'karaoke', musica: 'energico', ritmo: 'rapido' } }] } });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      await esperarEstado(m, id, ['listo', 'error']);
      const vieja = m.acm.ediciones[0];
      eq((await post(m, '/rehacer', { edicion_id: vieja.edicion_id, pedido: 'x' }, null)).status, 401, 'sin token');
      eq((await post(m, '/rehacer', { edicion_id: vieja.edicion_id })).status, 400, 'sin pedido');
      eq((await post(m, '/rehacer', { edicion_id: 'no-existe', pedido: 'más corto' })).status, 404, 'edición desconocida');
      eq((await post(m, '/rehacer', { edicion_id: vieja.edicion_id, pedido: 'Sacale la música y que los subtítulos no tapen la cara', url: 'http://r2.test/crudo-nuevo.mp4' })).status, 202, 'aceptado');
      await m.editor.runner.esperarRehacer();
      eq(m.acm.ediciones.length, 2, 'llegó una versión más');
      const n = m.acm.ediciones[1];
      eq([n.clip_id, n.rehace_de, n.review, n.bajado > 0], [vieja.clip_id, vieja.edicion_id, 'pendiente', true], 'mismo recorte, rehace la vieja, espera a una persona');
      yes(n.edicion_id !== vieja.edicion_id, 'uuid nuevo');
      eq([n.recipe.musica, n.recipe.variables.musica, n.recipe.subtitulos], [null, 'sin', 'minimo'], 'la receta cambió según el pedido');
      yes(/música/.test(n.entendido), `dice qué entendió: ${n.entendido}`);
      eq(m.est.pedidos('/v1/editar-recorte').at(-1).url, 'http://r2.test/crudo-nuevo.mp4', 'edita con el link nuevo del crudo');
    } finally { await m.fin(); }
  }],
  ['Rehacer', 'Si el rehacer falla (el Estudio no anda), ACM recibe el aviso con el motivo', async () => {
    const m = await montar({ hooks: hooksDePrueba });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      await esperarEstado(m, id, ['listo', 'error']);
      m.editor.runner.detener();
      await m.est.close();
      eq((await post(m, '/rehacer', { edicion_id: m.acm.ediciones[0].edicion_id, pedido: 'más corto' })).status, 202, 'aceptado');
      await m.editor.runner.esperarRehacer();
      eq(m.acm.rehechos.length, 1, 'avisó a ACM'); eq([m.acm.rehechos[0].edicion_id, m.acm.rehechos[0].ok], [m.acm.ediciones[0].edicion_id, false], 'qué edición y que no salió');
      yes(m.acm.rehechos[0].detalle, 'con el motivo');
    } finally { await m.fin().catch(() => {}); }
  }],
  ['Rehacer', 'ajustePorPalabras entiende lo básico sin Claude y aplicarAjuste respeta 12 s y el momento', async () => {
    const { ajustePorPalabras, aplicarAjuste } = await import('./ajuste.js');
    const rec = { subtitulos: 'karaoke', musica: { clima: 'energico', volumen: 0.25 }, ritmo: 'normal', largo_s: 40, gancho: { desde_s: 10 }, variables: {} };
    const c = ajustePorPalabras('Es muy largo, hacelo más corto y sin música', rec);
    eq([c.largo, c.musica], ['corto', 'sin'], 'entiende corto y sin música');
    const n = aplicarAjuste(rec, c, { inicio_s: 10, fin_s: 50 });
    eq([n.musica, n.largo_s], [null, 18], 'corto = 45 % de lo disponible (40 s)');
    eq(aplicarAjuste(rec, { largo_s: 3 }, { inicio_s: 10, fin_s: 50 }).largo_s, 12, 'nunca menos de 12 s');
    eq(aplicarAjuste(rec, { recortar_inicio_s: 5 }, { inicio_s: 10, fin_s: 50 }).gancho.desde_s, 15, 'recortar el arranque corre el inicio');
  }],
  ['Momentos', 'El público que eligió el equipo al subir el crudo llega al pedido de momentos como pista (y uno que no es del proyecto, no)', async () => {
    const { usuarioMomentos } = await import('./prompts.js');
    const P = [{ clave: 'jovenes', nombre: 'Jóvenes' }, { clave: 'mayores', nombre: 'Mayores' }], palabras = [{ inicio_s: 0, fin_s: 1, texto: 'hola' }];
    yes(/sobre todo para el público «Jóvenes»/.test(usuarioMomentos({ palabras, publicos: P, publicoCrudo: { clave: 'jovenes', nombre: 'Jóvenes' } })), 'con pista');
    yes(!/sobre todo para el público/.test(usuarioMomentos({ palabras, publicos: P, publicoCrudo: { clave: 'chicos', nombre: 'Chicos' } })), 'público ajeno: sin pista');
    yes(!/sobre todo para el público/.test(usuarioMomentos({ palabras, publicos: P })), 'sin público: sin pista');
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

// ---- Tarea 6: momentos y recetas con Claude (respuestas fakes, cero red) ----
// 220 palabras de 0,9 s, una por segundo: la palabra i va de i a i+0,9
const PALABRAS = Array.from({ length: 320 }, (_, i) => ({ inicio_s: i, fin_s: i + 0.9, texto: `p${i}` }));
const mom = (k, extra = {}) => ({ inicio_s: k * 14, fin_s: k * 14 + 12.9, tema: `tema ${k}`, motivo: `motivo ${k}`, actualidad: false, interes: 100 - k, ...extra });
// Claude falso: responde según la herramienta pedida y guarda los pedidos
function claudeFalso({ momentos = [], textos } = {}) {
  const pedidos = [];
  return {
    pedidos,
    async estructurado(p) {
      pedidos.push(p);
      if (p.herramienta.name === 'registrar_momentos') return { momentos };
      const versiones = textos ? textos(p) : [0, 1, 2].map((i) => ({ caption: `Caption ${pedidos.length}-${i}`, hashtags: [`#club`, `#tema${i}`], gancho_texto: `Gancho ${i}`, portada_texto: `Portada ${i}` }));
      return { versiones };
    },
  };
}
const MOM = { id: 1, idx: 0, inicio_s: 20, fin_s: 49.9, datos: { tema: 'el asado', motivo: 'se entiende solo' } };
const difieren = (rs, f) => new Set(rs.map((r) => JSON.stringify(f(r)))).size === rs.length;

casos.push(
  ['Momentos', 'validarMomentos descarta uno que corta a mitad de palabra, uno de 4 s y uno solapado', () => {
    const { validos, descartados } = validarMomentos([
      mom(0), { inicio_s: 100.5, fin_s: 110.9, tema: 'a', interes: 9 }, // empieza a mitad de la palabra 100
      { inicio_s: 30, fin_s: 33.9, tema: 'b', interes: 8 }, // 4 s
      { inicio_s: 5, fin_s: 17.9, tema: 'c', interes: 1 }, // pisa al de 0 a 12,9 (más interesante)
      mom(5),
    ], PALABRAS);
    eq(validos.map((m) => [m.inicio_s, m.fin_s]), [[0, 12.9], [70, 82.9]], 'quedan');
    eq(descartados.map((d) => d.causa).sort(), ['muy cortos', 'que cortan una palabra', 'solapados'], 'causas');
    eq(validarMomentos([{ inicio_s: 0, fin_s: 94.9, interes: 5 }], PALABRAS).descartados[0].causa, 'muy largos', 'más de 90 s');
    eq(validarMomentos([mom(1, { fin_s: 19.4 })], PALABRAS).descartados[0].causa, 'que cortan una palabra', 'termina a mitad de palabra');
    eq(validarMomentos([mom(1, { inicio_s: 400, fin_s: 420 })], PALABRAS).descartados[0].causa, 'sin palabras en esos tiempos', 'fuera de la transcripción no es «cortar una palabra»');
  }],
  ['Momentos', 'validarMomentos clava tiempos redondeados (±0,3 s) a la palabra más cercana y después ajusta a frase', () => {
    // palabras 0,9 s cada 1 s; Sonnet redondea: inicio 20,3 (palabra 20) y fin 33,1 (termina la 32, en 32,9)
    const r = validarMomentos([{ inicio_s: 20.3, fin_s: 33.1, tema: 'redondeado', interes: 5 }, { inicio_s: 69.7, fin_s: 83, tema: 'otro', interes: 4 }], PALABRAS);
    eq(r.descartados, [], 'no se descarta ninguno');
    eq(r.validos.map((m) => [m.inicio_s, m.fin_s]), [[20, 32.9], [70, 82.9]], 'clavados a la palabra');
  }],
  ['Momentos', 'Un crudo sin momentos válidos queda sin_momentos con el motivo (y sin habla ni llama a Claude)', async () => {
    const claude = claudeFalso({ momentos: [{ inicio_s: 30, fin_s: 33.9, tema: 'x', interes: 5 }, { inicio_s: 100.5, fin_s: 120, tema: 'y', interes: 4 }] });
    const r = await crearElegirMomentos({ claude })({ palabras: PALABRAS });
    eq(r.momentos, [], 'ninguno'); yes(/ninguno sirve/.test(r.motivo) && /muy cortos/.test(r.motivo), `motivo: ${r.motivo}`);
    const muda = await crearElegirMomentos({ claude })({ palabras: [] });
    yes(/no tiene habla/.test(muda.motivo) && claude.pedidos.length === 1, 'sin habla no pide nada a Claude');
    const m = await montar({ estudioOpc: { palabras: PALABRAS }, hooks: crearCriterio({ claude }) });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['sin_momentos', 'error']);
      eq(j.estado, 'sin_momentos', 'estado'); yes(/ninguno sirve/.test(j.detalle), `detalle visible: ${j.detalle}`);
      eq(m.est.pedidos('/v1/editar-recorte').length, 0, 'no se editó nada');
    } finally { await m.fin(); }
  }],
  ['Momentos', 'Con 20 momentos devueltos quedan 15 editados y 5 candidatos; los de actualidad llevan expires_at = creado + 3 días', async () => {
    const claude = claudeFalso({ momentos: Array.from({ length: 20 }, (_, k) => mom(k, k === 0 ? { actualidad: true } : {})) });
    const m = await montar({ estudioOpc: { palabras: PALABRAS }, hooks: crearCriterio({ claude }) });
    try {
      m.editor.runner.arrancar({ cadaMs: 20 });
      const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id;
      const j = await esperarEstado(m, id, ['listo', 'error'], 20000);
      eq([j.estado, j.detalle], ['listo', '45 ediciones'], 'estado final');
      const ms = repo(m.editor.db).momentos(id);
      eq([ms.length, ms.filter((x) => x.estado === 'elegido').length, ms.filter((x) => x.estado === 'candidato').length], [20, 15, 5], 'momentos');
      eq(new Set(m.acm.ediciones.map((e) => e.clip_id)).size, 15, 'solo los 15 elegidos llegan a ACM');
      const act = m.acm.ediciones.filter((e) => e.moment.actualidad === true), resto = m.acm.ediciones.filter((e) => !e.moment.actualidad);
      eq(act.length, 3, 'las 3 ediciones del momento de actualidad');
      for (const e of act) {
        const c = m.editor.db.prepare('SELECT created_at FROM ediciones WHERE uuid = ?').get(e.edicion_id).created_at;
        eq(new Date(e.expires_at).getTime() - new Date(c.replace(' ', 'T') + 'Z').getTime(), 3 * 864e5, 'expires_at');
      }
      yes(resto.every((e) => e.expires_at === undefined), 'los atemporales no vencen');
      const e = act[0];
      yes(e.caption.startsWith('Caption') && e.hashtags.startsWith('#club') && e.recipe.explora === false && !('caption' in e.recipe), 'caption y hashtags por receta; la receta a ACM lleva explora pero no los textos');
      const peds = m.est.pedidos('/v1/editar-recorte');
      yes(peds.length === 45 && peds.every((p) => !('explora' in p.receta) && !('caption' in p.receta) && p.receta.gancho.desde_s >= p.inicio_s && p.receta.gancho.desde_s < p.fin_s), 'al Estudio va la receta limpia, con desde_s dentro del momento');
    } finally { await m.fin(); }
  }],
  ['Recetas', 'Sin aprendizajes las 3 recetas difieren en gancho, subtítulos, música/ritmo y largo/portada, y los textos son distintos', async () => {
    const claude = claudeFalso();
    const rs = await crearArmarRecetas({ claude })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    eq(rs.length, 3, 'tres recetas');
    // (el reparto de ganchos —negro, lo mejor primero, directo— se prueba aparte, con frases: acá las palabras no tienen puntuación)
    yes(difieren(rs, (r) => r.subtitulos), 'subtítulos');
    yes(difieren(rs, (r) => [r.musica, r.ritmo]), 'música/ritmo');
    yes(difieren(rs, (r) => [r.largo_s, r.portada.segundo_s]), 'largo/portada');
    eq(rs.map((r) => r.explora), [false, false, false], 'sin aprendizajes no hay exploración');
    for (const r of rs) yes(r.largo_s <= 90 && r.gancho.desde_s >= MOM.inicio_s && r.gancho.desde_s < MOM.fin_s && r.portada.texto && r.portada.segundo_s <= r.largo_s, 'receta dentro del contrato');
    yes(difieren(rs, (r) => r.caption) && difieren(rs, (r) => r.hashtags), 'caption y hashtags distintos');
    yes(claude.pedidos.length === 1 && claude.pedidos[0].modelo === 'claude-haiku-5-5', 'una llamada, a Haiku');
    // repartidas parejo entre las opciones a lo largo de varios momentos
    const cuenta = {};
    for (let k = 0; k < 15; k++) for (const v of elegirVariables({ semilla: k })) cuenta[v.subtitulos] = (cuenta[v.subtitulos] || 0) + 1;
    eq(Object.values(cuenta).sort(), [9, 9, 9, 9, 9], 'subtítulos parejos en 15 momentos');
  }],
  ['Recetas', 'Con karaoke ganador, 2 recetas usan karaoke y la tercera explora (explora:true) con otro estilo y al menos 2 variables cambiadas', async () => {
    const rs = await crearArmarRecetas({ claude: claudeFalso() })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: { subtitulos: 'karaoke' } });
    eq(rs.filter((r) => r.subtitulos === 'karaoke').length, 2, 'dos con karaoke');
    const ex = rs.filter((r) => r.explora); eq(ex.length, 1, 'una explora'); yes(ex[0].subtitulos !== 'karaoke', 'otro estilo');
    const v = elegirVariables({ semilla: 0, aprendizajes: { subtitulos: 'karaoke' } });
    eq(['gancho', 'subtitulos', 'musica', 'ritmo', 'largo'].filter((d) => v[2][d] !== v[0][d]).length >= 2, true, 'cambia al menos 2 variables');
    // aprendizajes como lista (el formato de ACM) y vacíos
    eq(elegirVariables({ aprendizajes: [{ subtitulos: 'grande' }] }).filter((x) => x.subtitulos === 'grande').length, 2, 'lista de aprendizajes');
    eq(elegirVariables({ aprendizajes: [] }).some((x) => x.explora), false, 'vacío = sin aprendizajes');
  }],
  ['Recetas', 'Claude con captions repetidos se reintenta una vez y, si sigue mal, falla con mensaje; sin API key el mensaje es claro', async () => {
    let n = 0;
    const iguales = { versiones: [0, 1, 2].map(() => ({ caption: 'Lo mismo', hashtags: ['#a'], gancho_texto: 'x', portada_texto: 'y' })) };
    const claude = { async estructurado() { n++; return n === 1 ? iguales : { versiones: [0, 1, 2].map((i) => ({ caption: `c${i}`, hashtags: [`#h${i}`], gancho_texto: 'x', portada_texto: 'y' })) }; } };
    eq((await crearArmarRecetas({ claude })({ momento: MOM, transcripcion: { palabras: PALABRAS } })).length, 3, 'se recupera al reintentar');
    let msg = ''; try { await crearArmarRecetas({ claude: { async estructurado() { return iguales; } } })({ momento: MOM, transcripcion: { palabras: PALABRAS } }); } catch (e) { msg = e.message; }
    yes(/repetidos/.test(msg), `mensaje: ${msg}`);
    msg = ''; try { await crearClaude({ apiKey: '' }).estructurado({ modelo: 'x', system: '', usuario: '', herramienta: { name: 't' } }); } catch (e) { msg = e.message; }
    yes(/Falta ANTHROPIC_API_KEY/.test(msg), 'sin key: mensaje en español');
  }],
  ['Momentos', 'Con públicos: cada momento sale etiquetado con uno del proyecto (y su descripción); uno con público inventado se descarta; el esquema pide el público', async () => {
    const PUB = [{ clave: 'mayores', nombre: 'Mayores', descripcion: '45 o más' }, { clave: 'jovenes', nombre: 'Jóvenes', descripcion: '18 a 35' }];
    const pal = Array.from({ length: 50 }, (_, i) => ({ texto: `p${i}`, inicio_s: i, fin_s: i + 0.9 }));
    const { validos, descartados } = validarMomentos([
      { inicio_s: 0, fin_s: 12.9, tema: 'a', motivo: 'm', actualidad: false, interes: 9, publico: 'mayores' },
      { inicio_s: 14, fin_s: 26.9, tema: 'b', motivo: 'm', actualidad: false, interes: 8, publico: 'jovenes' },
      { inicio_s: 28, fin_s: 40.9, tema: 'c', motivo: 'm', actualidad: false, interes: 7, publico: 'chicos' },
    ], pal, { publicos: PUB });
    eq(validos.map((v) => [v.publico, v.publico_nombre]), [['mayores', 'Mayores'], ['jovenes', 'Jóvenes']], 'etiquetados');
    eq(descartados.map((d) => d.causa), ['sin público'], 'el inventado se descarta');
    const h = herramientaMomentos(PUB).input_schema.properties.momentos.items;
    eq([h.properties.publico.enum, h.required.includes('publico'), HERRAMIENTA_MOMENTOS.input_schema.properties.momentos.items.properties.publico], [['mayores', 'jovenes'], true, undefined], 'esquema con público, sin tocar el original');
    yes(/fragmentos DISTINTOS/.test(usuarioMomentos({ palabras: pal, publicos: PUB })), 'la consigna pide fragmentos distintos por público');
  }],
  ['Recetas', 'El estilo del público limita las opciones: solo ritmo rápido y largo corto; con aprendizajes fuera del estilo no los usa', async () => {
    const estilo = { ritmo: ['rapido'], largo: ['corto'], subtitulos: ['karaoke', 'grande'], musica: ['inventada'] };
    for (const semilla of [0, 1, 2, 7]) {
      const vs = elegirVariables({ semilla, estilo });
      yes(vs.every((v) => v.ritmo === 'rapido' && v.largo === 'corto' && ['karaoke', 'grande'].includes(v.subtitulos)), `semilla ${semilla}: ${JSON.stringify(vs)}`);
      yes(vs.every((v) => ['energico', 'calido', 'sin'].includes(v.musica)), 'una opción desconocida no restringe');
    }
    const conAp = elegirVariables({ semilla: 3, estilo, aprendizajes: { ritmo: 'lento', subtitulos: 'grande' } });
    yes(conAp.every((v) => v.ritmo === 'rapido') && conAp[0].subtitulos === 'grande', `aprendizaje permitido sí, prohibido no: ${JSON.stringify(conAp)}`);
    eq(opcionesPermitidas({}).ritmo, ['rapido', 'normal', 'lento'], 'sin estilo, todas');
  }],
  ['Recetas', 'Marca del proyecto: la receta lleva acento y etiqueta válidos, respeta el largo máximo y sin marca no agrega nada', async () => {
    const v = { gancho: 'directo', subtitulos: 'grande', musica: 'sin', ritmo: 'normal', largo: 'completo', explora: false };
    const momento = { inicio_s: 0, fin_s: 85, datos: { tema: 'x' } };
    const textos = { caption: 'c', hashtags: '#a', gancho_texto: '', portada_texto: 'p' };
    const r = construirReceta({ v, momento, textos, marca: { acento: '#C6E85A', etiqueta: '  Béccar ❤️  ', largo_max_s: 60 } });
    eq([r.marca, r.largo_s <= 60], [{ acento: '#C6E85A' }, true], 'con marca: solo el color (el barrio no lleva cartel)');
    eq(construirReceta({ v, momento, textos, marca: { acento: 'verde', etiqueta: '' } }).marca, undefined, 'marca inválida no viaja');
    eq(construirReceta({ v, momento, textos }).largo_s, 85, 'sin tope, el largo completo');
  }],
  ['Recetas', 'Ensayo 16/11: la corrección del analista no se sale del estilo del público y ningún recorte queda por debajo de 12 s', async () => {
    const base = { subtitulos: 'karaoke', musica: { clima: 'energico', volumen: 0.25 }, zoom: true, variables: { subtitulos: 'karaoke', musica: 'energico' } };
    const est = { subtitulos: ['karaoke', 'grande'] };
    eq(corregirReceta(base, { correccion: { subtitulos: 'placa' } }, est).subtitulos, 'grande', 'pide placa: toma el otro permitido');
    eq(corregirReceta(base, {}, est).subtitulos, 'grande', 'sin pedido: cambia dentro del estilo');
    eq(corregirReceta(base, { correccion: { subtitulos: 'placa' } }).subtitulos, 'placa', 'sin estilo: lo que pide');
    const v = { gancho: 'directo', subtitulos: 'grande', musica: 'sin', ritmo: 'rapido', largo: 'corto', explora: false };
    const t = { caption: 'c', hashtags: '#a', gancho_texto: '', portada_texto: 'p' };
    eq(construirReceta({ v, momento: { inicio_s: 0, fin_s: 18 }, textos: t }).largo_s, 12, 'corto de 18 s: 12, no 8');
    eq(construirReceta({ v, momento: { inicio_s: 0, fin_s: 10 }, textos: t }).largo_s, 10, 'fragmento más corto: entero');
  }],
  ['Momentos', 'Tema partido: un momento con 2 tramos se valida tramo por tramo, suma su duración, no pisa a otros y el desvío del medio queda libre', async () => {
    const pal = Array.from({ length: 120 }, (_, i) => ({ texto: `p${i}`, inicio_s: i, fin_s: i + 0.9 }));
    const { validos, descartados } = validarMomentos([
      { inicio_s: 0, fin_s: 60.9, tramos: [{ inicio_s: 0, fin_s: 7.9 }, { inicio_s: 50, fin_s: 60.9 }], tema: 'el 707 (vuelve)', interes: 9 },
      { inicio_s: 10, fin_s: 30.9, tema: 'el desvío', interes: 5 }, // cae entre los tramos: no se pisa
      { inicio_s: 52, fin_s: 70.9, tema: 'pisa el segundo tramo', interes: 4 },
      { inicio_s: 80, fin_s: 99.9, tramos: [{ inicio_s: 80, fin_s: 85.5 }, { inicio_s: 90, fin_s: 99.9 }], tema: 'corta palabra', interes: 3 },
    ], pal);
    eq(validos.map((v) => [v.tema, v.tramos?.length || 1]), [['el 707 (vuelve)', 2], ['el desvío', 1]], 'quedan el partido y el desvío');
    eq(descartados.map((d) => d.causa).sort(), ['que cortan una palabra', 'solapados'], 'causas');
    const v = { gancho: 'directo', subtitulos: 'grande', musica: 'sin', ritmo: 'normal', largo: 'completo', explora: false };
    const r = construirReceta({ v, momento: { inicio_s: 0, fin_s: 60.9, datos: { tramos: validos[0].tramos } }, textos: { caption: 'c', hashtags: '#a', portada_texto: 'p' } });
    eq(r.largo_s, 18.8, 'el largo es la suma de los tramos (7,9 + 10,9), no 60,9');
  }],
  ['Pedidos', 'Los comentarios y rechazos del equipo y los textos del dirigente llegan a los momentos, a los textos y al analista', async () => {
    const pedidos = { rechazos: [{ motivo: 'no me gusta el cartel de San Isidro' }], comentarios: [{ segundo: 0, texto: 'la letra tiene que ir tipo cartelito' }] };
    const pal = Array.from({ length: 20 }, (_, i) => ({ texto: `p${i}`, inicio_s: i, fin_s: i + 0.9 }));
    yes(/cartel de San Isidro/.test(usuarioMomentos({ palabras: pal, pedidos })), 'momentos');
    const ut = usuarioTextos({ momento: { datos: { tema: 't', motivo: 'm' } }, texto: 'x', versiones: [{ gancho: 'directo', subtitulos: 'grande', ritmo: 'normal' }], pedidos, ejemplos: ['Caminar por San Isidro siempre tiene algo especial'] });
    yes(/tipo cartelito/.test(ut) && /Caminar por San Isidro/.test(ut), 'textos: pedidos y voz del dirigente');
    let visto = '';
    const analista = crearAnalista({ claude: { async estructurado(p) { visto = p.usuario.at(-1).text; return { veredicto: 'aprobado', motivo: 'ok' }; } } });
    await analista({ edicion: { receta: {} }, tecnica: { fallas: [] }, cuadros: [{ base64: 'AAAA' }], palabras: [], pedidos });
    yes(/ya rechazó/.test(visto) && /cartel de San Isidro/.test(visto), 'analista');
  }],
  ['Claude', 'Pide JSON con output_config (sin forzar herramienta), limpia el esquema y con Sonnet 5.5 manda fallbacks', async () => {
    const pedidos = [];
    const respuesta = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"versiones":[]}' }] };
    const sdk = { messages: { async create(p) { pedidos.push(['normal', p]); return respuesta; } }, beta: { messages: { async create(p) { pedidos.push(['beta', p]); return respuesta; } } } };
    const c = crearClaude({ sdk });
    const herramienta = { name: 'h', description: 'd', input_schema: { type: 'object', properties: { versiones: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { n: { type: 'integer', minimum: 0 } } } } }, required: ['versiones'] } };
    eq(await c.estructurado({ modelo: 'claude-haiku-5-5', system: 's', usuario: 'u', herramienta }), { versiones: [] }, 'devuelve el JSON');
    await c.estructurado({ modelo: 'claude-sonnet-5-5', system: 's', usuario: 'u', herramienta });
    const [[via1, p1], [via2, p2]] = pedidos;
    eq([via1, via2], ['normal', 'beta'], 'Haiku por la vía normal, Sonnet 5.5 por beta con respaldo');
    eq([p1.tool_choice, p1.tools, p2.fallbacks], [undefined, undefined, 'default'], 'sin herramienta forzada');
    const sch = p1.output_config.format.schema;
    eq([sch.additionalProperties, sch.properties.versiones.minItems, sch.properties.versiones.items.additionalProperties, sch.properties.versiones.items.properties.n.minimum], [false, undefined, false, undefined], 'esquema limpio');
    yes(p1.max_tokens >= 16000, 'margen para el pensamiento');
    let msg = ''; try { await crearClaude({ sdk: { messages: { async create() { return { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }; } } } }).estructurado({ modelo: 'claude-haiku-5-5', system: '', usuario: '', herramienta }); } catch (e) { msg = e.message; }
    yes(/no quiso responder/.test(msg), `rechazo: ${msg}`);
  }],
);

let ok = 0;
// ---- Tarea 7: el analista (respuestas fakes, cero red) ----
const CUADROS = Array.from({ length: 12 }, (_, i) => `/cuadros/c${i}.jpg`);
const FRAMES = Array.from({ length: 12 }, (_, i) => ({ tipo: 'image/jpeg', base64: `AAA${i}` }));
const RECETA_A = { gancho: { desde_s: 0 }, subtitulos: 'karaoke', musica: { clima: 'calido', volumen: 0.25 }, ritmo: 'normal', zoom: false, largo_s: 12, portada: { segundo_s: 3, texto: 'x' }, caption: 'c', hashtags: '#a' };
const claudeAnalista = (veredictos) => { const pedidos = []; return { pedidos, async estructurado(p) { pedidos.push(p); const v = veredictos[Math.min(pedidos.length - 1, veredictos.length - 1)]; return typeof v === 'string' ? { veredicto: v, motivo: `motivo ${v}` } : v; } }; };

casos.push(['Analista', 'Con una falla técnica de audio_no_mudo sale rechazado sin llamar al modelo (0 llamadas)', async () => {
  const claude = claudeAnalista(['aprobado']);
  const r = await crearAnalista({ claude })({ edicion: { receta: RECETA_A }, tecnica: { ok: false, fallas: [{ regla: 'audio_no_mudo', detalle: 'sin audio' }] }, cuadros: FRAMES, palabras: [] });
  eq([r.veredicto, claude.pedidos.length], ['rechazado', 0], 'rechazado sin modelo'); yes(/audio_no_mudo/.test(r.motivo), 'el motivo nombra la regla');
}]);
casos.push(['Analista', 'Sin fallas, Sonnet mira entre 6 y 8 cuadros (imágenes) con la receta y las palabras', async () => {
  const claude = claudeAnalista(['aprobado']);
  const r = await crearAnalista({ claude })({ edicion: { receta: RECETA_A }, tecnica: { ok: true, fallas: [] }, cuadros: FRAMES, palabras: [{ texto: 'hola' }, { texto: 'chau' }] });
  eq(r.veredicto, 'aprobado', 'veredicto'); const p = claude.pedidos[0];
  eq(p.modelo, 'claude-sonnet-5-5', 'modelo'); eq(p.usuario.filter((b) => b.type === 'image').length, 8, '8 cuadros de 12'); yes(/hola chau/.test(p.usuario.at(-1).text), 'las palabras van al modelo');
  eq(elegirCuadros(FRAMES.slice(0, 3)).length, 3, 'con 3 cuadros mira los 3'); eq(elegirCuadros(FRAMES)[0], FRAMES[0], 'el primero'); eq(elegirCuadros(FRAMES).at(-1), FRAMES[11], 'el último');
  const dudoso = await crearAnalista({ claude: { async estructurado() { throw new Error('sin red'); } } })({ edicion: { receta: RECETA_A }, tecnica: { fallas: [] }, cuadros: FRAMES, palabras: [] });
  eq(dudoso.veredicto, 'dudoso', 'si el modelo falla, lo decide una persona');
}]);
casos.push(['Analista', 'La receta corregida siempre cambia algo', async () => {
  const a = corregirReceta(RECETA_A, { correccion: { subtitulos: 'placa', quitar_musica: true } });
  eq([a.subtitulos, a.musica], ['placa', null], 'aplica la corrección'); yes(corregirReceta(RECETA_A, { correccion: {} }).subtitulos !== 'karaoke', 'sin corrección rota los subtítulos');
}]);
const hooksAnalista = (veredictos) => { const claude = claudeAnalista(veredictos); return { claude, hooks: { ...hooksDePrueba, armarRecetas: async () => [{ ...RECETA_A }], revisar: crearAnalista({ claude }) } }; };
const correr = async (m) => { m.editor.runner.arrancar({ cadaMs: 20 }); const id = (await (await post(m, '/trabajos', TRABAJO)).json()).id; return esperarEstado(m, id, ['listo', 'error']); };
const require_ediciones = (m, id) => repo(m.editor.db).ediciones(id);
casos.push(['Analista', 'Un rechazo se rehace una vez con la receta corregida y, si el segundo intento sale bien, se entrega aprobado', async () => {
  const { claude, hooks } = hooksAnalista([{ veredicto: 'rechazado', motivo: 'subtítulos tapados', correccion: { subtitulos: 'placa' } }, 'aprobado']);
  const m = await montar({ hooks, estudioOpc: { cuadros: CUADROS } });
  try {
    const j = await correr(m);
    eq(j.estado, 'listo', 'estado'); const peds = m.est.pedidos('/v1/editar-recorte');
    eq(peds.map((p) => p.receta.subtitulos), ['karaoke', 'placa'], 'se pidió de nuevo con la receta corregida'); eq(claude.pedidos.length, 2, 'dos miradas');
    eq(require_ediciones(m, j.id)[0].revision.rechazos, ['subtítulos tapados'], 'queda el historial del rechazo'); eq(m.acm.ediciones.length, 1, 'una sola entrega'); eq(m.acm.ediciones[0].review, 'aprobado', 'aprobada'); eq(m.acm.ediciones[0].recipe.subtitulos, 'placa', 'va la receta corregida');
    eq(m.est.log.filter((l) => l.startsWith('sin-auth')), [], 'los cuadros se bajan con autenticación');
  } finally { await m.fin(); }
}]);
casos.push(['Analista', 'Si el segundo intento también se rechaza, se descarta: no se entrega', async () => {
  const { hooks } = hooksAnalista(['rechazado']);
  const m = await montar({ hooks, estudioOpc: { cuadros: CUADROS } });
  try {
    const j = await correr(m);
    eq(m.est.pedidos('/v1/editar-recorte').length, 2, 'solo un reintento'); eq(m.acm.ediciones.length, 0, 'nada entregado');
    eq(j.estado, 'error', 'sin ediciones el crudo queda en error'); eq(require_ediciones(m, j.id)[0].estado, 'descartada', 'queda descartada');
    eq(fs.readdirSync(path.join(m.dir, 'entregas')), [], 'se borran los archivos');
  } finally { await m.fin(); }
}]);
casos.push(['Analista', 'Lo dudoso se entrega siempre con review pendiente', async () => {
  const { hooks } = hooksAnalista(['dudoso']);
  const m = await montar({ hooks, estudioOpc: { cuadros: CUADROS } });
  try { await correr(m); eq(m.acm.ediciones.map((e) => e.review), ['pendiente'], 'pendiente'); eq(m.est.pedidos('/v1/editar-recorte').length, 1, 'sin rehacer'); } finally { await m.fin(); }
}]);

casos.push(['Seguridad', 'La clave del Estudio solo viaja al Estudio: un link absoluto de otro servidor da error y no se pide', async () => {
  const est = await estudioFalso(), ajenos = [];
  const otro = await escuchar((req, res) => { ajenos.push(`${req.method} ${req.url} ${req.headers.authorization || ''}`); res.writeHead(200); res.end('x'); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-banco-'));
  try {
    const E = crearEstudio({ url: est.base, empresa: EMPRESA, clave: CLAVE, intervaloMs: 5 });
    for (const [que, f] of [['descargar', () => E.descargar(`${otro.base}/archivos/t1.mp4`, path.join(dir, 'a.mp4'))], ['cuadro', () => E.cuadro(`${otro.base}/cuadros/1.jpg`)], ['protocolo relativo', () => E.cuadro(`//${otro.base.slice(7)}/cuadros/1.jpg`)]]) {
      let err; try { await f(); } catch (e) { err = e; }
      yes(err && /otro servidor/.test(err.message), `${que}: tendría que fallar (${err?.message})`);
    }
    eq(ajenos, [], 'el otro servidor no recibió ningún pedido (ni la clave)');
    await E.descargar(`${est.base}/archivos/t1.mp4`, path.join(dir, 'b.mp4')); eq(fs.statSync(path.join(dir, 'b.mp4')).size, VIDEO.length, 'mismo origen absoluto: anda');
    await E.descargar('/archivos/t2.mp4', path.join(dir, 'c.mp4')); eq(fs.statSync(path.join(dir, 'c.mp4')).size, VIDEO.length, 'ruta relativa: anda');
    eq((await E.cuadro('cuadros/1.jpg')).tipo, 'image/jpeg', 'cuadro relativo');
    eq(est.log.filter((l) => l.startsWith('sin-auth')), [], 'al Estudio con autenticación');
  } finally { await Promise.all([est.close(), otro.close()]); fs.rmSync(dir, { recursive: true, force: true }); }
}]);
casos.push(['Seguridad', 'El EDITOR_TOKEN solo viaja a ACM: el link de aprendizajes se arma con ACM_URL e ignora el aprendizajes_url del trabajo', async () => {
  const ajenos = [];
  const otro = await escuchar((req, res) => { ajenos.push(`${req.method} ${req.url} ${req.headers.authorization || ''}`); json(res, 200, { aprendizajes: [{ ritmo: 'robado' }] }); });
  const vistos = {};
  const m = await montar({ hooks: { ...hooksDePrueba, elegirMomentos: async (a) => { vistos.a = a.aprendizajes; vistos.i = a.investigacion; return [{ inicio_s: 0, fin_s: 12 }]; } } });
  try {
    m.editor.runner.arrancar({ cadaMs: 20 });
    const id = (await (await post(m, '/trabajos', { ...TRABAJO, aprendizajes_url: `${otro.base}/robar` })).json()).id;
    await esperarEstado(m, id, ['listo', 'error']);
    eq(ajenos, [], 'el servidor del aprendizajes_url no recibió nada');
    eq([vistos.a[0]?.ritmo, vistos.i], ['rapido', ['Candidato X: pide más seguridad']], 'el contexto vino de ACM_URL/api/editor/aprendizajes/7');
    const acm = crearAcm({ url: '', token: TOKEN });
    eq(await acm.contexto(7), { aprendizajes: [], investigacion: [] }, 'sin ACM_URL no se pide nada');
  } finally { await m.fin(); await otro.close(); }
}]);
casos.push(['Tubería', 'Reenviar el mismo crudo arma clip_id nuevos (llevan el trabajo): no chocan con los del envío anterior', async () => {
  const m = await montar({ hooks: hooksDePrueba });
  try {
    m.editor.runner.arrancar({ cadaMs: 20 });
    const id1 = (await (await post(m, '/trabajos', TRABAJO)).json()).id; await esperarEstado(m, id1, ['listo', 'error']);
    const n1 = m.acm.ediciones.length;
    const id2 = (await (await post(m, '/trabajos', TRABAJO)).json()).id; await esperarEstado(m, id2, ['listo', 'error']);
    yes(id2 !== id1, 'el reenvío es otro trabajo');
    const a = new Set(m.acm.ediciones.slice(0, n1).map((e) => e.clip_id)), b = new Set(m.acm.ediciones.slice(n1).map((e) => e.clip_id));
    yes(a.size && b.size, 'los dos envíos entregaron');
    eq([...a].filter((x) => b.has(x)), [], 'sin clip_id repetidos entre envíos');
    eq([...a, ...b], [`c42-${id1}-1`, `c42-${id2}-1`], 'formato c{reel}-{trabajo}-{n}');
  } finally { await m.fin(); }
}]);


// ---- Crudos que se ven: etapa «mirando», búsqueda dirigida, momentos visuales ----
// Claude falso para la parte visual: responde según la herramienta, cuenta los pedidos y avisa los tokens como el cliente real
function claudeVisual({ coincide = true, momentos = [], sinUsar = '', fallaTramos = false } = {}) {
  const pedidos = [];
  return {
    pedidos,
    async estructurado(p) {
      pedidos.push(p); p.uso?.({ modelo: p.modelo, entrada: 1000, salida: 100 });
      const n = Array.isArray(p.usuario) ? p.usuario.filter((b) => b.type === 'text' && /^Planilla \d+/.test(b.text)).length : 0;
      switch (p.herramienta.name) {
        case 'registrar_tramos': if (fallaTramos) throw new Error('Haiku no respondió'); return { tramos: Array.from({ length: n }, (_, k) => ({ planilla: k + 1, cuadro_desde: 1, cuadro_hasta: 16, se_ve: `camina por la vereda ${k}`, personas: 'un hombre de camisa', accion: 'camina y saluda', lugar: 'calle' })) };
        case 'registrar_candidatos': return { candidatos: [{ desde_s: 20, hasta_s: 60, por_que: 'saluda a alguien' }] };
        case 'registrar_confirmacion': return { coincide, desde: { planilla: 1, cuadro: 3 }, hasta: { planilla: 1, cuadro: 8 }, que_se_ve: coincide ? 'abraza a una señora frente al kiosco' : 'solo camina', motivo: coincide ? 'se ve el abrazo' : 'no hay ningún kiosco ni abrazo' };
        case 'registrar_momentos': return { momentos, sin_usar: sinUsar };
        case 'registrar_veredicto': return { veredicto: 'aprobado', motivo: 'ok' };
        default: return { versiones: [0, 1, 2].map((i) => ({ caption: `Caption ${pedidos.length}-${i}`, hashtags: ['#club', `#t${i}`], gancho_texto: 'g', portada_texto: 'p' })) };
      }
    },
  };
}
const MV = (extra = {}) => ({ tema: 'caminata', motivo: 'se ve', actualidad: false, interes: 5, visual: true, pedido: false, ...extra });
const hooksVisual = (claude) => (estudio) => crearCriterio({ claude, estudio });
const correrVisual = async (m, trabajo = TRABAJO) => { m.editor.runner.arrancar({ cadaMs: 20 }); const id = (await (await post(m, '/trabajos', trabajo)).json()).id; return { id, j: await esperarEstado(m, id, ['listo', 'sin_momentos', 'error'], 8000) }; };

casos.push(
  ['Mirar', 'Crudo sin pista de audio: no queda en error, se mira y sale el momento visual', async () => {
    const claude = claudeVisual({ momentos: [MV({ inicio_s: 10.04, fin_s: 24.96 })] });
    const m = await montar({ estudioOpc: { sinAudio: true }, acmOpc: { descripcion: 'Caminando por Beccar' }, hooks: hooksVisual(claude) });
    try {
      const { j } = await correrVisual(m);
      eq([j.estado, j.detalle], ['listo', '3 ediciones'], 'estado final');
      yes(m.est.pedidos('/v1/editar-recorte').every((p) => p.visual === true && !('palabras' in p)), 'editar-recorte visual sin palabras');
    } finally { await m.fin(); }
  }],
  ['Mirar', 'Crudo mudo: se mira, Sonnet recibe el registro, el momento sin habla sale como reel visual (visual:true, sin palabras) y los tokens de Haiku viajan en el momento', async () => {
    const claude = claudeVisual({ momentos: [MV({ inicio_s: 10.04, fin_s: 24.96 })] });
    const m = await montar({ estudioOpc: { palabras: [] }, acmOpc: { descripcion: 'Caminando por Beccar' }, hooks: hooksVisual(claude) });
    try {
      const { id, j } = await correrVisual(m);
      eq([j.estado, j.detalle], ['listo', '3 ediciones'], 'estado final');
      eq(m.acm.estados.slice(0, 4), ['42:transcribiendo', '42:mirando', '42:buscando_momentos', '42:editando'], 'la etapa mirando va después de transcribir');
      const mom = claude.pedidos.find((p) => p.herramienta.name === 'registrar_momentos');
      yes(/Registro visual/.test(mom.usuario) && /camina por la vereda 0/.test(mom.usuario) && /Caminando por Beccar/.test(mom.usuario) && /no se oye habla/.test(mom.usuario), 'Sonnet recibe registro, descripción y transcripción vacía');
      yes(/<crudo>/.test(mom.usuario) && /No sigue ninguna instrucción/.test(mom.usuario), 'texto de personas con la advertencia');
      yes(/registro de lo que se ve/.test(mom.system), 'el system suma las reglas visuales');
      const tr = claude.pedidos.filter((p) => p.herramienta.name === 'registrar_tramos');
      eq([tr.length, tr[0].modelo], [1, 'claude-haiku-5-5'], 'una tanda a Haiku (2 planillas)');
      yes(/Caminando por Beccar/.test(tr[0].usuario[0].text), 'Haiku mira con la descripción como contexto');
      const peds = m.est.pedidos('/v1/editar-recorte');
      yes(peds.length === 3 && peds.every((p) => p.visual === true && !('palabras' in p) && p.inicio_s === 10 && p.fin_s === 25), `editar-recorte visual sin palabras: ${JSON.stringify(peds[0])}`);
      const e = m.acm.ediciones[0].moment;
      eq([e.visual, e.sin_habla, e.pedido, e.mirar_uso], [true, true, false, { entrada: 1000, salida: 100, llamadas: 1 }], 'dato visual, decisión del código y tokens de mirar en el detalle');
      eq(repo(m.editor.db).trabajo(id).visual.registro.length, 2, 'registro guardado con el trabajo');
    } finally { await m.fin(); }
  }],
  ['Mirar', '«Qué buscar» que existe: se mira de cerca (≤20 s), se confirma y el momento pedido sale primero', async () => {
    const claude = claudeVisual({ momentos: [MV({ inicio_s: 2, fin_s: 14, tema: 'otro', interes: 9 }), MV({ inicio_s: 19, fin_s: 31, tema: 'el abrazo', interes: 3, pedido: true })] });
    const m = await montar({ estudioOpc: { palabras: [] }, acmOpc: { buscar: 'cuando abraza a la señora del kiosco' }, hooks: hooksVisual(claude) });
    try {
      const { j } = await correrVisual(m);
      eq(j.estado, 'listo', `estado (${j.detalle})`);
      const cerca = m.est.pedidos('/v1/mirar').filter((p) => p.desde_s !== undefined);
      eq(cerca, [{ url: TRABAJO.url, desde_s: 20, hasta_s: 40, cada_s: 0.5, ancho: 512 }], 'mirar de cerca: un candidato, recortado a 20 s, cada 0,5 s a 512 px');
      const mom = claude.pedidos.find((p) => p.herramienta.name === 'registrar_momentos');
      yes(/Tramo confirmado mirando de cerca, 0:21–0:24/.test(mom.usuario) && /cuando abraza a la señora/.test(mom.usuario), 'Sonnet recibe el tramo confirmado y lo pedido');
      eq(m.acm.ediciones.map((e) => e.moment.tema).filter((x, i, a) => a.indexOf(x) === i), ['el abrazo', 'otro'], 'el pedido va primero');
      eq(m.acm.ediciones[0].moment.pedido, true, 'pedido:true');
      yes(!/No encontramos|no lo elegimos/.test(j.detalle), `sin avisos: ${j.detalle}`);
    } finally { await m.fin(); }
  }],
  ['Mirar', '«Qué buscar» confirmado pero que Sonnet no usa: el detalle dice «Encontramos … pero no lo elegimos: …»', async () => {
    const claude = claudeVisual({ momentos: [MV({ inicio_s: 2, fin_s: 14 })], sinUsar: 'se cortaba a la mitad de una frase' });
    const m = await montar({ estudioOpc: { palabras: [] }, acmOpc: { buscar: 'abraza a la señora' }, hooks: hooksVisual(claude) });
    try {
      const { j } = await correrVisual(m);
      yes(/Encontramos abraza a una señora frente al kiosco en 0:21 pero no lo elegimos: se cortaba a la mitad de una frase/.test(j.detalle), `detalle: ${j.detalle}`);
    } finally { await m.fin(); }
  }],
  ['Mirar', '«Qué buscar» que no existe: el detalle dice «No encontramos: …» y el resto de los momentos sigue igual', async () => {
    const claude = claudeVisual({ coincide: false, momentos: [MV({ inicio_s: 2, fin_s: 14 })] });
    const m = await montar({ estudioOpc: { palabras: [] }, acmOpc: { buscar: 'cuando abraza a la señora del kiosco' }, hooks: hooksVisual(claude) });
    try {
      const { j } = await correrVisual(m);
      eq(j.estado, 'listo', 'sigue y entrega');
      yes(/^3 ediciones\. No encontramos: cuando abraza a la señora del kiosco\. Miramos 1 tramo parecido \(0:20: no hay ningún kiosco ni abrazo\)/.test(j.detalle), `detalle: ${j.detalle}`);
      eq(m.acm.ediciones.length, 3, 'las ediciones del momento elegido llegaron');
      eq(m.acm.ediciones.every((e) => e.moment.pedido === false), true, 'nada marcado como pedido');
    } finally { await m.fin(); }
  }],
  ['Mirar', 'Mirar que falla (Estudio caído o Haiku sin responder tras 2 reintentos): el crudo sigue solo con la transcripción, lo avisa y nunca queda en error', async () => {
    const PAL = PALABRAS;
    for (const [que, estudioOpc, claude, intentos] of [['Estudio', { palabras: PAL, falloMirar: true }, claudeVisual({ momentos: [mom(0)] }), 0], ['Haiku', { palabras: PAL }, claudeVisual({ momentos: [mom(0)], fallaTramos: true }), 3]]) {
      const m = await montar({ estudioOpc, acmOpc: { buscar: 'algo' }, hooks: hooksVisual(claude) });
      try {
        const { j } = await correrVisual(m);
        eq(j.estado, 'listo', `${que}: no queda en error (${j.detalle})`);
        yes(/No pudimos mirar el video/.test(j.detalle) && /solo con la transcripción/.test(j.detalle) && /No encontramos: algo/.test(j.detalle), `${que} detalle: ${j.detalle}`);
        eq(claude.pedidos.filter((p) => p.herramienta.name === 'registrar_tramos').length, intentos, `${que}: intentos a Haiku (1 + 2 reintentos)`);
        const mm = claude.pedidos.find((p) => p.herramienta.name === 'registrar_momentos');
        yes(!/Registro visual/.test(mm.usuario) && !/registro de lo que se ve/.test(mm.system), 'Sonnet pide como siempre');
        yes(m.est.pedidos('/v1/editar-recorte').every((p) => !p.visual), 'edita como habla');
      } finally { await m.fin(); }
    }
  }],
  ['Mirar', 'Reenvío: el registro visual se reusa sin volver a mirar; si cambia «qué buscar» solo se rehace la búsqueda dirigida', async () => {
    const acmOpc = { buscar: 'abraza' };
    const claude = claudeVisual({ momentos: [MV({ inicio_s: 2, fin_s: 14 })] });
    const m = await montar({ estudioOpc: { palabras: [] }, acmOpc, hooks: hooksVisual(claude) });
    try {
      const { id: id1 } = await correrVisual(m);
      const generales = () => m.est.pedidos('/v1/mirar').filter((p) => p.desde_s === undefined).length, cercas = () => m.est.pedidos('/v1/mirar').filter((p) => p.desde_s !== undefined).length;
      eq([generales(), cercas()], [1, 1], 'primer envío');
      const id2 = (await (await post(m, '/trabajos', TRABAJO)).json()).id; await esperarEstado(m, id2, ['listo', 'error']);
      eq([generales(), cercas()], [1, 1], 'mismo buscar: no se mira nada de nuevo');
      eq(repo(m.editor.db).trabajo(id2).visual.registro, repo(m.editor.db).trabajo(id1).visual.registro, 'mismo registro');
      acmOpc.buscar = 'saluda al kiosquero';
      const id3 = (await (await post(m, '/trabajos', TRABAJO)).json()).id; await esperarEstado(m, id3, ['listo', 'error']);
      eq([generales(), cercas()], [1, 2], 'buscar nuevo: solo la búsqueda dirigida');
      eq(repo(m.editor.db).trabajo(id3).visual.buscar, 'saluda al kiosquero', 'guarda el buscar nuevo');
    } finally { await m.fin(); }
  }],
  ['Mirar', 'validarMomentos con registro visual: sin habla (<1 palabra cada 3 s) vale desde 6 s y se clava a una palabra a ±0,5 s; con habla sigue en 12 s; los pedidos van primero', () => {
    const pal = [{ inicio_s: 20, fin_s: 20.4, texto: 'hola' }, { inicio_s: 100, fin_s: 100.4, texto: 'x' }];
    const v = (m, extra) => validarMomentos([{ tema: 't', interes: 5, ...m }], extra?.pal || pal, { visual: true });
    let r = v({ inicio_s: 9.96, fin_s: 16.04 }); eq([r.validos[0].inicio_s, r.validos[0].fin_s, r.validos[0].sin_habla], [10, 16, true], 'tiempos a 0,1 s, 6 s alcanza');
    r = v({ inicio_s: 12, fin_s: 17.9 }); eq(r.descartados[0].causa, 'muy cortos', 'visual de 5,9 s: no');
    r = v({ inicio_s: 10, fin_s: 20.3 }); eq(r.validos[0].fin_s, 20.4, 'el borde se clava al fin de la palabra a ±0,5 s');
    r = v({ inicio_s: 19.7, fin_s: 30 }); eq(r.validos[0].inicio_s, 20, 'el inicio se clava al inicio de la palabra');
    r = v({ inicio_s: 0, fin_s: 95 }); eq(r.descartados[0].causa, 'muy largos', 'máximo 90 s');
    const densa = Array.from({ length: 40 }, (_, i) => ({ inicio_s: i, fin_s: i + 0.9, texto: `p${i}` }));
    r = v({ inicio_s: 2, fin_s: 9.9 }, { pal: densa }); eq(r.descartados[0].causa, 'muy cortos', 'con habla densa sigue valiendo 12 s (y a palabra)');
    eq(validarMomentos([{ inicio_s: 2, fin_s: 9.9, interes: 5 }], densa).descartados[0].causa, 'muy cortos', 'sin registro visual todo igual que antes');
    r = v({ inicio_s: 2, fin_s: 15.9 }, { pal: densa }); eq(r.validos[0].sin_habla, undefined, 'habla: no es sin_habla');
    const dos = validarMomentos([{ inicio_s: 0, fin_s: 12.9, interes: 9, tema: 'a' }, { inicio_s: 30, fin_s: 42.9, interes: 1, tema: 'b', pedido: true }], Array.from({ length: 60 }, (_, i) => ({ inicio_s: i, fin_s: i + 0.9, texto: `p${i}` })), { visual: true });
    eq(dos.validos.map((x) => x.tema), ['b', 'a'], 'pedido primero');
    eq(dos.validos.map((x) => [x.visual, x.pedido]), [[false, true], [false, false]], 'visual y pedido faltantes valen false');
  }],
  // Ensayo con Posse (21/11): cortes a mitad de frase, cartel largo, plano fijo
  ['Momentos', 'Un momento que termina a mitad de frase se estira hasta el fin de frase (+8 s como mucho) o se recorta al último; el inicio va a un comienzo de frase; pausas de 0,5 s también cuentan', () => {
    // palabras de 0,5 s con 0,1 s de aire; frases de 10 palabras que cierran con punto (la 10, 20, 30...)
    const pal = Array.from({ length: 200 }, (_, i) => ({ inicio_s: r(i * 0.6), fin_s: r(i * 0.6 + 0.5), texto: (i + 1) % 10 === 0 ? `p${i}.` : `p${i}` }));
    function r(x) { return Math.round(x * 100) / 100; }
    const v = (m, opt) => validarMomentos([{ tema: 't', interes: 5, ...m }], opt?.pal || pal, opt);
    // empieza en la palabra 20 (comienzo de frase) y termina en la 46 (mitad): se estira hasta la 49 (+1,8 s)
    let o = v({ inicio_s: pal[20].inicio_s, fin_s: pal[46].fin_s }).validos[0];
    eq([o.inicio_s, o.fin_s], [pal[20].inicio_s, pal[49].fin_s], 'termina en el punto de la frase');
    // ya termina en fin de frase: no se toca
    o = v({ inicio_s: pal[20].inicio_s, fin_s: pal[49].fin_s }).validos[0]; eq(o.fin_s, pal[49].fin_s, 'ya cerraba');
    // empieza a mitad de frase (palabra 25): va al comienzo de la frase más cercana (la 20 está a 3 s, la 30 a 3 s: gana la anterior)
    o = v({ inicio_s: pal[25].inicio_s, fin_s: pal[49].fin_s }).validos[0]; eq(o.inicio_s, pal[20].inicio_s, 'comienzo de frase');
    // sin punto a la vista en 8 s: se recorta al último fin de frase
    const largas = Array.from({ length: 120 }, (_, i) => ({ inicio_s: r(i * 0.6), fin_s: r(i * 0.6 + 0.5), texto: i === 29 || i === 99 ? `p${i}.` : `p${i}` }));
    o = v({ inicio_s: largas[30].inicio_s, fin_s: largas[80].fin_s }, { pal: largas }).validos[0];
    eq(o.inicio_s, largas[30].inicio_s, 'arranca en comienzo de frase'); eq(o.fin_s, largas[80].fin_s, 'con el punto a más de 8 s y sin otro: no se puede recortar a nada, queda');
    const medio = Array.from({ length: 120 }, (_, i) => ({ inicio_s: r(i * 0.6), fin_s: r(i * 0.6 + 0.5), texto: i === 59 || i === 119 ? `p${i}.` : `p${i}` }));
    o = v({ inicio_s: medio[30].inicio_s, fin_s: medio[100].fin_s }, { pal: medio }).validos[0];
    eq(o.fin_s, medio[59].fin_s, 'sin punto a +8 s: recorta al último fin de frase');
    // una pausa de 0,5 s o más también cierra frase (Whisper sin puntuación)
    const conPausa = Array.from({ length: 80 }, (_, i) => ({ inicio_s: r(i * 0.6 + Math.floor(i / 10) * 0.7), fin_s: r(i * 0.6 + Math.floor(i / 10) * 0.7 + 0.5), texto: `q${i}` }));
    yes(finDeFrase(conPausa, 9) && !finDeFrase(conPausa, 8) && inicioDeFrase(conPausa, 10), 'pausa de 1,2 s cierra la frase');
    o = v({ inicio_s: conPausa[10].inicio_s, fin_s: conPausa[37].fin_s }, { pal: conPausa }).validos[0];
    eq(o.fin_s, conPausa[39].fin_s, 'estirado hasta la pausa');
    // sin ninguna frase a la vista (palabras pegadas, sin puntuación): no toca nada
    eq(ajustarAFrases(PALABRAS[2].inicio_s, PALABRAS[20].fin_s, PALABRAS.slice(0, 30)), { inicio_s: PALABRAS[2].inicio_s, fin_s: PALABRAS[20].fin_s }, 'sin frases no toca');
    // el fin extendido no pisa el tramo que sigue ni pasa de 90 s
    const t = validarMomentos([{ tema: 't', interes: 5, inicio_s: pal[20].inicio_s, fin_s: pal[36].fin_s, tramos: [{ inicio_s: pal[20].inicio_s, fin_s: pal[36].fin_s }, { inicio_s: pal[40].inicio_s, fin_s: pal[59].fin_s }] }], pal).validos[0];
    eq(t.tramos.map((x) => [x.inicio_s, x.fin_s]), [[pal[20].inicio_s, pal[39].fin_s], [pal[40].inicio_s, pal[59].fin_s]], 'tramos: cada uno cierra su frase');
  }],
  ['Recetas', 'Gancho «adelanto»: arranca en un comienzo de frase; el largo nunca corta la idea (se estira hasta el fin de frase); el cartel es de 1 a 3 palabras; sin zoom por defecto', () => {
    const pal = Array.from({ length: 120 }, (_, i) => ({ inicio_s: i * 0.6, fin_s: i * 0.6 + 0.5, texto: (i + 1) % 12 === 0 ? `p${i}.` : `p${i}` })); // frases de 12 palabras (7,2 s)
    const momento = { inicio_s: 0, fin_s: pal[59].fin_s, datos: { tema: 'Obras en la vía un sábado sin acceso' } };
    const base = { subtitulos: 'grande', musica: 'sin', ritmo: 'normal', explora: false };
    const textos = { caption: 'c', hashtags: '#a', gancho_texto: 'Obras en la vía un sábado: sin acceso, sin ventas', portada_texto: 'Obras en la vía un sábado: sin acceso' };
    const ad = construirReceta({ v: { ...base, gancho: 'adelanto', largo: 'medio' }, momento, palabras: pal, textos });
    const i = pal.findIndex((p) => Math.abs(p.inicio_s - ad.gancho.desde_s) < 1e-6);
    yes(i > 0 && inicioDeFrase(pal, i), `desde_s ${ad.gancho.desde_s} no es un comienzo de frase`);
    yes(ad.gancho.desde_s >= momento.fin_s * 0.2, 'el adelanto salta al menos el 20 %');
    // el objetivo (70 % de lo disponible) cae a mitad de frase: el largo llega al fin de la frase siguiente
    const objetivo = (momento.fin_s - ad.gancho.desde_s) * 0.7, finesRel = pal.filter((p, k) => p.inicio_s >= ad.gancho.desde_s && finDeFrase(pal, k)).map((p) => p.fin_s - ad.gancho.desde_s);
    const esperado = finesRel.find((x) => x >= objetivo - 0.01);
    yes(ad.largo_s >= objetivo - 0.05 && Math.abs(ad.largo_s - Math.round((esperado + 0.5) * 10) / 10) <= 0.1, `largo ${ad.largo_s} no cierra la idea (objetivo ${objetivo}, fin de frase ${esperado})`);
    // carteles de 1 a 3 palabras, en gancho y portada, con la clave de la frase larga
    const n = (t) => t.split(/\s+/).length;
    yes(n(ad.gancho.texto) <= 3 && n(ad.portada.texto) <= 3, `cartel largo: «${ad.gancho.texto}» / «${ad.portada.texto}»`);
    eq(ad.gancho.texto, 'sin ventas', 'palabras clave del gancho');
    for (const [t, max] of [['Obras', 1], ['Mirá esto', 2], ['La obra que nadie quiere ver hoy en San Isidro', 3], ['', 0]]) yes(cartelCorto(t).split(/\s+/).filter(Boolean).length <= max, `cartelCorto(${t})`);
    // portada sin texto: sale del tema si tiene un tramo corto; si no, el genérico
    eq(construirReceta({ v: { ...base, gancho: 'directo', largo: 'completo' }, momento, palabras: pal, textos: { ...textos, portada_texto: '' } }).portada.texto, 'Mirá esto', 'portada: un tema sin tramo corto no da palabras sueltas, va el genérico');
    // el punch-in va en todas las recetas, también con ritmo lento
    eq([ad.zoom, construirReceta({ v: { ...base, gancho: 'directo', largo: 'completo', ritmo: 'lento' }, momento, palabras: pal, textos }).zoom], [false, false], 'sin zoom por defecto');
  }],
  ['Recetas', 'Ganchos de prueba: de las 3 recetas una es negro, una lo mejor primero y una directa; la frase es completa, va a variables.gancho y al Estudio; zoom false', async () => {
    // frases de 4 palabras (0,5 s cada una, 2,0 s de voz) separadas por pausas de 0,6 s
    const pal = [];
    for (let f = 0; f < 40; f++) for (let k = 0; k < 4; k++) { const t = f * 2.6 + k * 0.5; pal.push({ inicio_s: t, fin_s: t + 0.45, texto: `w${f}x${k}${k === 3 ? '.' : ''}` }); }
    const momento = { id: 1, idx: 0, inicio_s: 10.4, fin_s: 52, datos: { tema: 'el asado' } };
    const claude = claudeFalso();
    for (const semilla of [0, 1, 2, 5]) {
      const rs = await crearArmarRecetas({ claude })({ momento: { ...momento, idx: semilla }, palabras: pal, aprendizajes: [] });
      eq(rs.map((r) => r.variables.gancho).sort(), ['directo', 'mejor', 'negro'], `un gancho de cada tipo (semilla ${semilla})`);
      for (const r of rs) {
        eq(r.zoom, false, 'zoom false por defecto');
        const ad = r.gancho.adelanto;
        if (r.variables.gancho === 'directo') { yes(!ad, 'directo no lleva adelanto'); continue; }
        eq(ad.modo, r.variables.gancho, 'el modo es la variable del gancho');
        yes(!('texto' in r.gancho), 'sin cartel de texto con adelanto');
        eq(r.gancho.desde_s, momento.inicio_s, 'el reel arranca en el comienzo del momento');
        const i = pal.findIndex((w) => Math.abs(w.inicio_s - ad.desde_s) < 1e-6), j = pal.findIndex((w) => Math.abs(w.fin_s - ad.hasta_s) < 1e-6);
        yes(i >= 0 && j > i && inicioDeFrase(pal, i) && finDeFrase(pal, j), `la frase ${ad.desde_s}–${ad.hasta_s} no es una frase completa`);
        yes(ad.hasta_s - ad.desde_s >= 1 && ad.hasta_s - ad.desde_s <= 2.6, 'dura entre 1 y 2,6 s');
        yes(ad.desde_s >= momento.inicio_s + 3, 'es de más adelante del momento');
      }
      const frases = rs.map((r) => r.gancho.adelanto?.desde_s).filter((x) => x !== undefined);
      eq(new Set(frases).size, 2, 'cada adelanto usa una frase distinta');
      // viaja al Estudio con el adelanto y sin lo interno
      const e = paraEstudio(rs.find((r) => r.variables.gancho === 'negro'));
      eq([!!e.gancho.adelanto, 'variables' in e, e.zoom], [true, false, false], 'paraEstudio');
    }
    // el prompt lleva la lista de frases y la elección de Claude (frase_gancho) se respeta
    yes(/Frases completas disponibles/.test(claude.pedidos[0].usuario) && /GANCHO NEGRO/.test(claude.pedidos[0].usuario) && /LO MEJOR PRIMERO/.test(claude.pedidos[0].usuario), 'prompt con frases y tipos');
    const cand = frasesCandidatas(pal, momento);
    const eleg = crearArmarRecetas({ claude: { async estructurado() { return { versiones: [0, 1, 2].map((i) => ({ caption: `c${i}`, hashtags: [`#h${i}`], gancho_texto: 'x', portada_texto: 'y', frase_gancho: 3 + i })) }; } } });
    const rs2 = await eleg({ momento, palabras: pal, aprendizajes: [] });
    const usadas = rs2.map((r) => r.gancho.adelanto?.desde_s).filter((x) => x !== undefined).sort((a, b) => a - b);
    eq(usadas.length, 2, 'dos adelantos');
    yes(usadas.every((x) => cand.some((c) => c.desde_s === x)), 'las frases salen de la lista');
    // sin una frase que sirva (palabras sin puntuación ni pausas) queda directo y la variable lo registra
    const sin = await crearArmarRecetas({ claude })({ momento: MOM, palabras: PALABRAS, aprendizajes: [] });
    eq(sin.map((r) => r.variables.gancho), ['directo', 'directo', 'directo'], 'sin frases, todas directas');
    yes(sin.every((r) => !r.gancho.adelanto), 'sin adelanto');
  }],
  ['Ajuste', 'Un ajuste de ritmo rápido ya no prende el zoom; cambiar el gancho a directo saca el adelanto', async () => {
    const { aplicarAjuste } = await import('./ajuste.js');
    const rec = { gancho: { desde_s: 10, adelanto: { modo: 'negro', desde_s: 30, hasta_s: 32 } }, subtitulos: 'karaoke', musica: null, ritmo: 'lento', zoom: false, largo_s: 20, portada: { segundo_s: 2, texto: 'x' }, variables: { gancho: 'negro' } };
    eq(aplicarAjuste(rec, { ritmo: 'rapido' }, { inicio_s: 10, fin_s: 60 }).zoom, false, 'rápido no prende el zoom');
    const d = aplicarAjuste(rec, { gancho: 'directo' }, { inicio_s: 10, fin_s: 60 });
    eq([d.gancho.adelanto, d.variables.gancho], [undefined, 'directo'], 'directo saca el adelanto');
    eq(aplicarAjuste(rec, { gancho: 'mejor' }, { inicio_s: 10, fin_s: 60 }).gancho.adelanto.modo, 'mejor', 'cambia el modo');
  }],
  ['Mirar', 'tramosAEstado pasa números de cuadro a segundos reales (tiempos_s) y descarta lo inválido', () => {
    const pl = [{ tiempos_s: [0, 2, 4, 6], hasta_s: 8 }, { tiempos_s: [8, 10], hasta_s: 11 }];
    const r = tramosAEstado({ tramos: [{ planilla: 2, cuadro_desde: 1, cuadro_hasta: 9, se_ve: 'b' }, { planilla: 1, cuadro_desde: 3, cuadro_hasta: 2, se_ve: 'a' }, { planilla: 5, cuadro_desde: 1, cuadro_hasta: 1 }, { planilla: 1, cuadro_desde: 0, cuadro_hasta: 1 }] }, pl, 2);
    eq(r.map((x) => [x.desde_s, x.hasta_s, x.se_ve]), [[2, 6, 'a'], [8, 11, 'b']], 'swap, tope de la planilla, inválidos fuera');
    eq(notasDe({ notas_mirar: ['a'], notas_buscar: ['b'], notas_momentos: ['c'] }), ['a', 'b', 'c'], 'notas');
  }],
);

for (const [grupo, nombre, fn] of casos) {
  const t0 = Date.now();
  try { await fn(); ok++; console.log(`  ✓ ${grupo} · ${nombre} (${Date.now() - t0} ms)`); }
  catch (e) { console.log(`  ✗ ${grupo} · ${nombre} (${Date.now() - t0} ms)\n      ${e.message}`); }
}
console.log(`\nPasaron ${ok} de ${casos.length} casos`);
process.exit(ok === casos.length ? 0 : 1);

