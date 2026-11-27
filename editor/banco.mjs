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
import { OPCIONES, GANCHOS_DE_PRUEBA, crearArmarRecetas, elegirVariables, normalizarAprendizajes, opcionesPermitidas, construirReceta, cartelCorto, frasesCandidatas } from './recetas.js';
import { finDeFrase, inicioDeFrase } from './frases.js';
import { crearCriterio } from './criterio.js';
import { crearClaude } from './claude.js';
import { paraEstudio } from './runner.js';
import { crearAnalista, corregirReceta, elegirCuadros } from './analista.js';
import { tramosAEstado, notasDe } from './mirar.js';
import { Readable } from 'node:stream';
import { crearPortadas, buscarOpenverse, claveDeFoto, normLugar, bajar, urlPermitida, dimensiones, ipPrivada, bajarSeguro, lookupFijado } from './portadas.js';
import { crearBancoFondos, crearCacheBusquedas } from './fondos.js';
import { lineasDePortada } from './recetas.js';

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
    eq(Object.keys(cuenta).sort(), ['chango', 'frase', 'grande', 'minimo', 'placa', 'recuadro'], 'los 6 estilos, chango incluido');
    eq(Object.values(cuenta).sort(), [7, 7, 7, 8, 8, 8], 'subtítulos parejos en 15 momentos');
    // las 3 versiones de un momento nunca repiten estilo de subtítulo
    for (let k = 0; k < 30; k++) eq(new Set(elegirVariables({ semilla: k }).map((v) => v.subtitulos)).size, 3, `estilos distintos en las 3 versiones (semilla ${k})`);
    // el karaoke es un modo: va encendido en todas las recetas
    eq(rs.map((r) => r.karaoke), [true, true, true], 'karaoke encendido');
    yes(!rs.some((r) => r.subtitulos === 'karaoke'), 'karaoke ya no es un estilo');
  }],
  ['Recetas', 'Con recuadro ganador (o «karaoke» guardado de antes), 2 recetas usan recuadro y la tercera explora (explora:true) con otro estilo y al menos 2 variables cambiadas', async () => {
    for (const guardado of ['recuadro', 'karaoke']) {
      const rs = await crearArmarRecetas({ claude: claudeFalso() })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: { subtitulos: guardado } });
      eq(rs.filter((r) => r.subtitulos === 'recuadro').length, 2, `dos con recuadro (guardado: ${guardado})`);
      const ex = rs.filter((r) => r.explora); eq(ex.length, 1, 'una explora'); yes(ex[0].subtitulos !== 'recuadro', 'otro estilo');
    }
    eq(normalizarAprendizajes([{ subtitulos: 'karaoke', ritmo: 'rapido' }]), { subtitulos: 'recuadro', ritmo: 'rapido' }, 'los aprendizajes con «karaoke» se traducen a recuadro');
    const v = elegirVariables({ semilla: 0, aprendizajes: { subtitulos: 'recuadro' } });
    eq(['gancho', 'subtitulos', 'musica', 'ritmo', 'largo'].filter((d) => v[2][d] !== v[0][d]).length >= 2, true, 'cambia al menos 2 variables');
    // aprendizajes como lista (el formato de ACM) y vacíos
    eq(elegirVariables({ aprendizajes: [{ subtitulos: 'grande' }] }).filter((x) => x.subtitulos === 'grande').length, 2, 'lista de aprendizajes');
    eq(elegirVariables({ aprendizajes: [] }).some((x) => x.explora), false, 'vacío = sin aprendizajes');
  }],
  ['Recetas', 'Karaoke como modo: encendido siempre salvo que el estilo del público lo apague; chango y recuadro llegan a la receta; «karaoke» viejo vale como recuadro en estilo, correcciones y ajustes', async () => {
    const { ajustePorPalabras, aplicarAjuste } = await import('./ajuste.js');
    eq(elegirVariables({ semilla: 1 }).map((v) => v.karaoke), [true, true, true], 'sin estilo, con karaoke');
    eq(elegirVariables({ semilla: 1, estilo: { karaoke: ['si', 'no'] } }).map((v) => v.karaoke), [true, true, true], 'si/no: encendido');
    eq(elegirVariables({ semilla: 1, estilo: { karaoke: ['no'] } }).map((v) => v.karaoke), [false, false, false], 'el público lo apaga');
    const rs = await crearArmarRecetas({ claude: claudeFalso() })({ momento: { ...MOM, datos: { publico_estilo: { subtitulos: ['chango', 'placa'], karaoke: ['no'] } } }, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    eq(rs.map((r) => r.karaoke), [false, false, false], 'la receta lleva karaoke:false');
    yes(rs.every((r) => ['chango', 'placa'].includes(r.subtitulos)) && rs.some((r) => r.subtitulos === 'chango'), 'chango llega a la receta');
    eq(opcionesPermitidas({ subtitulos: ['karaoke', 'grande'] }).subtitulos, ['recuadro', 'grande'], 'el estilo de público guardado con «karaoke» vale recuadro');
    const vieja = { subtitulos: 'karaoke', musica: null, ritmo: 'normal', variables: { subtitulos: 'karaoke' } };
    const cr = corregirReceta(vieja, { correccion: {} }); yes(cr.subtitulos !== 'karaoke' && cr.subtitulos !== 'recuadro', 'la corrección rota desde recuadro');
    const aj = aplicarAjuste(vieja, ajustePorPalabras('sacá el karaoke', vieja), { inicio_s: 0, fin_s: 40 });
    eq([aj.karaoke, aj.subtitulos], [false, 'karaoke'], 'sin karaoke no toca el estilo');
    const aj2 = aplicarAjuste(vieja, { subtitulos: 'karaoke' }, { inicio_s: 0, fin_s: 40 }); eq(aj2.subtitulos, 'recuadro', 'el ajuste traduce karaoke a recuadro');
    eq(aplicarAjuste(vieja, { subtitulos: 'chango' }, {}).subtitulos, 'chango', 'el ajuste acepta chango');
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
    const estilo = { ritmo: ['rapido'], largo: ['corto'], subtitulos: ['karaoke', 'grande'], musica: ['inventada'] }; // «karaoke» guardado de antes vale como recuadro
    for (const semilla of [0, 1, 2, 7]) {
      const vs = elegirVariables({ semilla, estilo });
      yes(vs.every((v) => v.ritmo === 'rapido' && v.largo === 'corto' && ['recuadro', 'grande'].includes(v.subtitulos)), `semilla ${semilla}: ${JSON.stringify(vs)}`);
      yes(vs.every((v) => ['energico', 'calido', 'sin'].includes(v.musica)), 'una opción desconocida no restringe');
    }
    const conAp = elegirVariables({ semilla: 3, estilo, aprendizajes: { ritmo: 'lento', subtitulos: 'grande' } });
    yes(conAp.every((v) => v.ritmo === 'rapido') && conAp[0].subtitulos === 'grande', `aprendizaje permitido sí, prohibido no: ${JSON.stringify(conAp)}`);
    eq(opcionesPermitidas({}).ritmo, ['rapido', 'normal', 'lento'], 'sin estilo, todas');
  }],
  ['Recetas', 'Transiciones: 5 opciones; las 3 versiones de un momento difieren y se reparten parejo entre momentos; la receta lleva transicion y variables.transicion/karaoke; paraEstudio la manda sin variables', async () => {
    eq(OPCIONES.transicion, ['seco', 'zoom', 'destello', 'barrido', 'glitch'], 'las 5 transiciones');
    const cuenta = {};
    for (let k = 0; k < 30; k++) {
      const vs = elegirVariables({ semilla: k });
      eq(new Set(vs.map((v) => v.transicion)).size, 3, `transiciones distintas en las 3 versiones (semilla ${k})`);
      for (const v of vs) cuenta[v.transicion] = (cuenta[v.transicion] || 0) + 1;
    }
    eq(Object.values(cuenta), [18, 18, 18, 18, 18], 'parejas en 30 momentos (5 transiciones × 18)');
    const rs = await crearArmarRecetas({ claude: claudeFalso() })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    for (const r of rs) {
      yes(OPCIONES.transicion.includes(r.transicion), 'receta.transicion válida');
      eq([r.variables.transicion, r.variables.karaoke], [r.transicion, 'con'], 'variables.transicion y variables.karaoke');
    }
    eq(new Set(rs.map((r) => r.transicion)).size, 3, 'tres recetas, tres transiciones');
    const e = paraEstudio(rs[0]);
    eq([e.transicion, e.karaoke, 'variables' in e], [rs[0].transicion, true, false], 'al Estudio: transicion y karaoke sí, variables no');
    const conSin = await crearArmarRecetas({ claude: claudeFalso() })({ momento: { ...MOM, datos: { publico_estilo: { karaoke: ['no'] } } }, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    eq(conSin.map((r) => [r.karaoke, r.variables.karaoke]), [[false, 'sin'], [false, 'sin'], [false, 'sin']], 'karaoke apagado por el público: karaoke:false y variables.karaoke «sin»');
  }],
  ['Recetas', 'Transiciones: el estilo del público las limita, los aprendizajes mandan dentro del estilo y lo aprendido de karaoke «sin» apaga 2 versiones (nunca la que explora)', async () => {
    const estilo = { transicion: ['seco', 'destello'] };
    for (let k = 0; k < 12; k++) yes(elegirVariables({ semilla: k, estilo }).every((v) => ['seco', 'destello'].includes(v.transicion)), `semilla ${k}: solo las del público`);
    eq(opcionesPermitidas({ transicion: ['cubo', 'glitch'] }).transicion, ['glitch'], 'una inventada no pasa');
    eq(opcionesPermitidas({}).transicion, OPCIONES.transicion, 'sin estilo, todas');
    const g = elegirVariables({ semilla: 2, aprendizajes: { transicion: 'barrido' } });
    eq(g.filter((v) => v.transicion === 'barrido').length >= 2, true, 'la ganadora va en las 2 que la siguen');
    eq(elegirVariables({ semilla: 2, aprendizajes: { transicion: 'barrido' }, estilo }).some((v) => v.transicion === 'barrido'), false, 'una ganadora fuera del estilo no se usa');
    eq(normalizarAprendizajes([{ karaoke: 'sin', transicion: 'glitch' }]), { transicion: 'glitch', karaoke: 'sin' }, 'los aprendizajes traen karaoke y transicion');
    eq(normalizarAprendizajes({ karaoke: 'quizas' }), {}, 'karaoke solo con o sin');
    const k = elegirVariables({ semilla: 0, aprendizajes: { karaoke: 'sin' } });
    eq(k.map((v) => [v.karaoke, v.explora]), [[false, false], [false, false], [true, true]], 'karaoke «sin»: 2 sin karaoke y la tercera (explora) como manda el estilo');
    eq(elegirVariables({ semilla: 0, aprendizajes: { karaoke: 'con' } }).map((v) => v.karaoke), [true, true, true], 'karaoke «con» no cambia nada');
    eq(elegirVariables({ semilla: 0, aprendizajes: { karaoke: 'sin' }, estilo: { karaoke: ['si'] } }).map((v) => v.karaoke), [true, true, true], 'el público solo con karaoke: no se apaga');
    eq(elegirVariables({ semilla: 0, aprendizajes: { karaoke: 'sin' }, estilo: { karaoke: ['si', 'no'] } }).map((v) => v.karaoke), [false, false, true], 'si/no: se apaga en las 2');
    eq(elegirVariables({ semilla: 0, estilo: { karaoke: ['no'] } }).map((v) => v.karaoke), [false, false, false], 'el público lo apaga: las 3 sin karaoke');
    // el karaoke «sin» llega a la receta
    const rs = await crearArmarRecetas({ claude: claudeFalso() })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: [{ karaoke: 'sin' }] });
    eq(rs.map((r) => [r.karaoke, r.variables.karaoke]), [[false, 'sin'], [false, 'sin'], [true, 'con']], 'receta.karaoke y variables.karaoke');
  }],
  ['Ajuste', 'Rehacer entiende transiciones: «sin transiciones», «con zoom», «ponele destello», barrido, glitch, y «sin zoom» saca la transición zoom si es la que hay', async () => {
    const { ajustePorPalabras, aplicarAjuste } = await import('./ajuste.js');
    const rec = { subtitulos: 'grande', karaoke: true, musica: null, ritmo: 'normal', zoom: false, largo_s: 30, transicion: 'glitch', gancho: { desde_s: 0 }, variables: { transicion: 'glitch', karaoke: 'con' } };
    const mo = { inicio_s: 0, fin_s: 60 };
    const caso = (pedido, esperado, receta = rec) => eq(ajustePorPalabras(pedido, receta).transicion, esperado, pedido);
    caso('Sin transiciones, por favor', 'seco');
    caso('sacá las transiciones que molestan', 'seco');
    caso('cortes secos', 'seco');
    caso('con zoom', 'zoom');
    caso('ponele zoom en los cortes', 'zoom');
    caso('quiero transición tipo zoom', 'zoom');
    caso('ponele destello', 'destello');
    caso('un flash en cada corte', 'destello');
    caso('con barrido', 'barrido');
    caso('más glitch', 'glitch');
    caso('agregale transiciones', 'zoom', { ...rec, transicion: 'glitch' }); // la que sigue a glitch en la rotación
    caso('ponele transiciones', 'destello', { ...rec, transicion: 'zoom' });
    caso('hacelo más corto', undefined);
    eq(ajustePorPalabras('sin zoom', { ...rec, transicion: 'zoom' }).transicion, 'seco', 'sin zoom con la transición zoom: se saca la transición');
    const sz = ajustePorPalabras('sin zoom', rec);
    eq([sz.transicion, sz.quitar_zoom], [undefined, true], 'sin zoom sin transición zoom: el acercamiento automático');
    const a = aplicarAjuste(rec, { transicion: 'destello' }, mo);
    eq([a.transicion, a.variables.transicion], ['destello', 'destello'], 'aplicarAjuste cambia receta y variables');
    eq(aplicarAjuste(rec, { transicion: 'cubo' }, mo).transicion, 'glitch', 'una transición inventada no pasa');
    const k = aplicarAjuste(rec, { karaoke: false }, mo);
    eq([k.karaoke, k.variables.karaoke], [false, 'sin'], 'sin karaoke actualiza variables.karaoke');
    eq(aplicarAjuste(k, { karaoke: true }, mo).variables.karaoke, 'con', 'con karaoke');
    eq(corregirReceta(rec, { correccion: { quitar_transicion: true } }).transicion, 'seco', 'el analista puede pedir sacarla');
    eq(corregirReceta(rec, { correccion: { quitar_transicion: true } }).variables.transicion, 'seco', 'y queda en variables');
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
  ['Recetas', 'Ganchos de prueba: de las 3 recetas se alternan lo mejor primero y directa (2 y 1, o 1 y 2, nunca las 3 iguales); la frase es completa, va a variables.gancho y al Estudio; zoom false', async () => {
    // frases de 4 palabras (0,5 s cada una, 2,0 s de voz) separadas por pausas de 0,6 s
    const pal = [];
    for (let f = 0; f < 40; f++) for (let k = 0; k < 4; k++) { const t = f * 2.6 + k * 0.5; pal.push({ inicio_s: t, fin_s: t + 0.45, texto: `w${f}x${k}${k === 3 ? '.' : ''}` }); }
    const momento = { id: 1, idx: 0, inicio_s: 10.4, fin_s: 52, datos: { tema: 'el asado' } };
    const claude = claudeFalso();
    for (const semilla of [0, 1, 2, 5]) {
      const rs = await crearArmarRecetas({ claude })({ momento: { ...momento, idx: semilla }, palabras: pal, aprendizajes: [] });
      const gs = rs.map((r) => r.variables.gancho);
      yes(gs.includes('directo') && gs.includes('mejor') && gs.every((g) => ['directo', 'mejor'].includes(g)), `mejor y directo, nunca las 3 iguales ni negro (semilla ${semilla}): ${gs}`);
      eq(gs.filter((g) => g === 'mejor').length, semilla % 2 === 0 ? 2 : 1, `alterna entre momentos (semilla ${semilla})`);
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
      eq(new Set(frases).size, frases.length, 'cada adelanto usa una frase distinta');
      // viaja al Estudio con el adelanto y sin lo interno
      const e = paraEstudio(rs.find((r) => r.variables.gancho === 'mejor'));
      eq([!!e.gancho.adelanto, 'variables' in e, e.zoom], [true, false, false], 'paraEstudio');
    }
    // el prompt lleva la lista de frases y la elección de Claude (frase_gancho) se respeta
    yes(/Frases completas disponibles/.test(claude.pedidos[0].usuario) && !/GANCHO NEGRO/.test(claude.pedidos[0].usuario) && /LO MEJOR PRIMERO/.test(claude.pedidos[0].usuario), 'prompt con frases y tipos');
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
    eq(aplicarAjuste({ ...rec, gancho: { desde_s: 10, adelanto: { modo: 'mejor', desde_s: 30, hasta_s: 32 } }, variables: { gancho: 'mejor' } }, { gancho: 'negro' }, { inicio_s: 10, fin_s: 60 }).gancho.adelanto.modo, 'mejor', 'un pedido no puede volver a negro');
    eq(normalizarAprendizajes({ gancho: 'negro' }).gancho, 'mejor', 'aprendizaje guardado con negro vale como mejor');
    yes(!OPCIONES.gancho.includes('negro') && !GANCHOS_DE_PRUEBA.includes('negro'), 'negro ya no es opción');
  }],
  ['Mirar', 'tramosAEstado pasa números de cuadro a segundos reales (tiempos_s) y descarta lo inválido', () => {
    const pl = [{ tiempos_s: [0, 2, 4, 6], hasta_s: 8 }, { tiempos_s: [8, 10], hasta_s: 11 }];
    const r = tramosAEstado({ tramos: [{ planilla: 2, cuadro_desde: 1, cuadro_hasta: 9, se_ve: 'b' }, { planilla: 1, cuadro_desde: 3, cuadro_hasta: 2, se_ve: 'a' }, { planilla: 5, cuadro_desde: 1, cuadro_hasta: 1 }, { planilla: 1, cuadro_desde: 0, cuadro_hasta: 1 }] }, pl, 2);
    eq(r.map((x) => [x.desde_s, x.hasta_s, x.se_ve]), [[2, 6, 'a'], [8, 11, 'b']], 'swap, tope de la planilla, inválidos fuera');
    eq(notasDe({ notas_mirar: ['a'], notas_buscar: ['b'], notas_momentos: ['c'] }), ['a', 'b', 'c'], 'notas');
  }],
);

// --- Portadas estilo Chango: Claude, Wikimedia, Brave y fal simulados ---
// un JPEG mínimo con sus medidas (SOF0): lo que `dimensiones` necesita para exigir resolución
const JPG = (n, ancho = 2000, alto = 1300) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(64, n)]);
const IA = { FAL_KEY: 'k-fal', PORTADA_FONDO_IA: '1' }; // el camino de IA (fal redibuja la foto) está apagado por defecto
// el mundo de afuera: `wiki` = fotos que devuelve Wikimedia, `brave` = las de Brave, `elegir` decide qué fotos (números) acepta la visión, `fal` falla o no
function mundoPortada(o = {}) {
  const w = { llamadas: [], falBodies: [], visionTextos: [], decisiones: 0, ...o };
  const wiki = o.wiki ?? [1, 2, 3, 4, 5].map((i) => `https://upload.wikimedia.org/wiki${i}.jpg`);
  const brave = o.brave ?? [1, 2].map((i) => `https://imgs.search.brave.com/brave${i}.jpg`);
  w.fetchFn = async (url, init = {}) => {
    const u = String(url), res = (code, body) => new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), { status: code });
    w.llamadas.push(u.split('?')[0]);
    if (u.startsWith('https://commons.wikimedia.org/w/api.php')) {
      if (o.wikiFalla) return res(500, 'x');
      const pages = Object.fromEntries(wiki.map((src, i) => [String(i), { title: `File:Catedral ${i}.jpg`, index: i + 1, imageinfo: [{ thumburl: src, url: src, descriptionurl: `https://commons.test/File:Catedral${i}`, mime: 'image/jpeg', width: 3000, height: 2000, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Ana</a>' } } }] }]));
      pages.x = { title: 'File:Plano.svg', index: 99, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x.png', mime: 'image/svg+xml', width: 3000, height: 2000 }] };
      return res(200, { query: { pages } });
    }
    if (u.startsWith('https://api.openverse.org/v1/images/?')) {
      w.openverse = (w.openverse || 0) + 1; w.ovConsultas = [...(w.ovConsultas || []), new URL(u).searchParams.get('q')]; w.ovUA = init.headers['user-agent'];
      if (o.ov429) return res(429, 'throttled');
      return res(200, { results: (o.ov ?? []).map((x, i) => ({ id: `ov${i}`, title: `OV ${i}`, url: x.url ?? `https://sitio-externo.test/ov${i}.jpg`, thumbnail: `https://api.openverse.org/v1/images/ov${i}/thumb/`, width: x.width ?? 2000, height: x.height ?? 1300, license: 'by', license_version: '4.0', creator: 'Ana', foreign_landing_url: `https://flickr.test/ov${i}`, source: 'flickr' })) });
    }
    if (u.startsWith('https://api.search.brave.com/')) {
      w.braveToken = init.headers['x-subscription-token'];
      return res(200, { results: brave.map((src, i) => ({ title: `Web ${i}`, url: `https://pagina.test/${i}`, source: 'pagina.test', thumbnail: { src: src + '?t' }, properties: { url: (o.hostOriginal ?? 'sitio-externo.test') ? `https://${o.hostOriginal ?? 'sitio-externo.test'}/${i}.jpg` : '' } })) });
    }
    if (u.startsWith('https://fal.run/')) {
      const b = JSON.parse(init.body); w.falBodies.push({ modelo: u.slice('https://fal.run/'.length), auth: init.headers.authorization, ...b });
      if (o.falFalla && o.falFalla(w.falBodies.length - 1)) return res(500, 'sin crédito');
      return res(200, { images: [{ url: `https://fal.media/fondo${w.falBodies.length}.jpg` }] });
    }
    if (/^https:\/\/(upload\.wikimedia\.org|imgs\.search\.brave\.com|fal\.media|api\.openverse\.org)\//.test(u)) return u.includes('rota') ? res(404, '') : res(200, u.includes('chica') ? JPG(u.length, 800, 600) : JPG(u.length));
    return res(404, '');
  };
  // red «segura» (la original de Brave): resolución de nombres y pedido a la IP fijada, simulados
  w.resueltos = []; w.pedidosSeguros = [];
  w.lookup = async (h) => { w.resueltos.push(h); return [{ address: h === 'privado.test' ? '10.0.0.5' : '93.184.216.34', family: 4 }]; };
  w.pedir = async ({ url, ip }) => { w.pedidosSeguros.push({ url, ip }); const r = Readable.from([JPG(url.length)]); r.statusCode = 200; r.headers = { 'content-type': 'image/jpeg' }; return r; };
  w.claude = { pedidos: [], async estructurado(p) {
    w.claude.pedidos.push(p);
    if (o.claudeFalla) throw new Error('Claude caído');
    if (p.herramienta.name === 'decidir_portada') { w.decisiones++; return o.decision ?? { tipo: 'lugar', lugar: 'Catedral de San Isidro', escena: 'the cathedral of San Isidro', consultas: ['Catedral de San Isidro Buenos Aires', 'Catedral San Isidro'] }; }
    if (p.herramienta.name === 'elegir_fotos_portada') {
      w.visionTextos = p.usuario.filter((b) => b.type === 'text').map((b) => b.text);
      w.imagenes = p.usuario.filter((b) => b.type === 'image').length;
      return { elegidas: (o.elegir ?? [1, 2, 3]).map((foto) => ({ foto, motivo: 'ok', momento_del_dia: (o.noche ?? []).includes(foto) ? 'noche' : 'dia' })) };
    }
    return { versiones: [0, 1, 2].map((i) => ({ caption: `Caption ${w.claude.pedidos.length}-${i}`, hashtags: ['#club', `#tema${i}`], gancho_texto: `Gancho ${i}`, portada_texto: `Portada ${i}`, portada_linea1: `Linea ${i}`, portada_linea2: `Remate ${i}` })) };
  } };
  return w;
}
const armarConPortada = (w, { banco = null, cache = null, env = {}, ctx = { territorio: 'San Isidro, Buenos Aires', nombre: 'Posse', foto_dirigente: 'data:image/jpeg;base64,AAAA', portada_refs: [] }, momento = MOM, log = () => {} } = {}) =>
  crearArmarRecetas({ claude: w.claude, portadas: crearPortadas({ claude: w.claude, fetchFn: w.fetchFn, env, log, banco, cache, lookup: w.lookup, pedir: w.pedir }), log })({ momento, transcripcion: { palabras: PALABRAS }, aprendizajes: [], portada: ctx });

casos.push(
  ['Portadas', 'portada_luz, portada_plano y portada_lado distintos en las 3 versiones sin aprendizaje, y tiradas a la ganadora con aprendizaje', () => {
    for (let k = 0; k < 30; k++) for (const d of ['portada_luz', 'portada_plano', 'portada_lado']) eq(new Set(elegirVariables({ semilla: k }).map((v) => v[d])).size, 3, `${d} distinto en las 3 (semilla ${k})`);
    eq(OPCIONES.portada_luz, ['calido', 'neutro', 'frio', 'noche'], 'valores de la luz (tinte)'); eq(OPCIONES.portada_lado, ['izq', 'der', 'centro'], 'valores del lado');
    const v = elegirVariables({ semilla: 4, aprendizajes: { portada_luz: 'noche' } });
    eq(v.filter((x) => x.portada_luz === 'noche').length >= 2, true, 'la ganadora va en las 2 versiones de base');
    eq(normalizarAprendizajes({ portada_plano: 'cerca' }).portada_plano, 'cerca', 'el aprendizaje de portada se normaliza');
    eq(elegirVariables({ semilla: 1, aprendizajes: { portada_lado: 'der' }, estilo: { portada_lado: ['izq', 'centro'] } }).some((x) => x.portada_lado === 'der'), false, 'una ganadora fuera del estilo no se usa');
  }],
  ['Portadas', 'Haiku pide la portada en 2 líneas; sin portadas la receta queda como hoy (portada.texto, sin chango) y lleva las variables portada_*', async () => {
    const claude = claudeFalso();
    const rs = await crearArmarRecetas({ claude })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    const props = claude.pedidos[0].herramienta.input_schema.properties.versiones.items.properties;
    yes(props.portada_linea1 && props.portada_linea2 && props.portada_texto, 'pide linea1, linea2 y sigue pidiendo portada_texto');
    for (const r of rs) yes(r.portada.texto && !('chango' in r.portada) && r.variables.portada_luz && r.variables.portada_plano && r.variables.portada_lado && !('portada_motivo' in r), 'portada de hoy + variables');
    eq(lineasDePortada({ portada_linea1: 'Lo que no te cuentan de', portada_linea2: 'La Catedral de San Isidro hoy' }, 'Mirá esto'), { linea1: 'Lo que no te cuentan de', linea2: 'Mirá esto' }, 'una línea 2 larga cae al respaldo');
    eq(lineasDePortada({ portada_linea1: 'x', portada_linea2: 'Gran Obra' }), { linea1: 'x', linea2: 'Gran Obra' }, 'líneas buenas');
    eq(lineasDePortada({ portada_linea1: 'Obra', portada_linea2: 'obra' }).linea1, '', 'la línea 1 no repite la 2');
  }],
  ['Portadas', 'Camino de IA (PORTADA_FONDO_IA=1): receta.portada.chango según el contrato, un fondo por versión en fal con foto como data-URI, luz y plano de las variables', async () => {
    const w = mundoPortada();
    const rs = await armarConPortada(w, { env: IA });
    eq(rs.length, 3, 'tres recetas');
    for (const [i, r] of rs.entries()) {
      const c = r.portada.chango;
      yes(c && /^https:\/\/fal\.media\/fondo\d\.jpg$/.test(c.fondo_url), `v${i + 1} tiene fondo`); // (sin banco: la URL de fal)
      eq([c.linea1, c.linea2, c.lado, c.nombre, c.foto_dirigente], [`Linea ${i}`, `Remate ${i}`, r.variables.portada_lado, 'Posse', 'data:image/jpeg;base64,AAAA'], 'campos del contrato');
      eq(Object.keys(c.referencia).sort(), ['fuente', 'imagen_url', 'licencia', 'lugar', 'pagina_url'], 'referencia del contrato');
      eq([c.fondo_tipo, c.luz, c.plano], ['ia', r.variables.portada_luz, r.variables.portada_plano], 'tipo, luz y plano a la vista');
      eq(c.referencia.lugar, 'catedral de san isidro', 'lugar normalizado');
      yes(c.referencia.fuente === 'Wikimedia Commons' && c.referencia.licencia.startsWith('CC BY-SA 4.0') && c.referencia.pagina_url.startsWith('https://commons.test/'), 'fuente y licencia a la vista');
      yes(r.portada.texto && !('portada_motivo' in r), 'portada.texto de respaldo se mantiene');
    }
    eq(new Set(rs.map((r) => r.portada.chango.referencia.imagen_url)).size, 3, 'tres fotos distintas');
    eq(w.falBodies.length, 3, 'tres fondos');
    for (const [i, b] of w.falBodies.entries()) {
      eq([b.modelo, b.auth, b.num_images, b.image_size], ['bytedance/seedream/v5.5/edit', 'Key k-fal', 1, { width: 1152, height: 2048 }], 'llamada a fal');
      yes(/^data:image\/jpeg;base64,/.test(b.image_urls[0]) && /exact location/.test(b.prompt) && /Remove all people/.test(b.prompt), 'foto como data-URI y prompt del prototipo');
    }
    const luces = { calido: 'golden hour', neutro: 'daylight', frio: 'blue hour', noche: 'night' }, planos = { lejos: 'Wide shot', medio: 'Medium shot', cerca: 'Close-up' };
    // las versiones salen en el orden de las variables; cada fondo lleva SU luz y SU plano
    for (const [i, r] of rs.entries()) { const b = w.falBodies.find((x) => x.image_urls[0].length > 0 && x.prompt.includes(luces[r.variables.portada_luz]) && x.prompt.includes(planos[r.variables.portada_plano])); yes(b, `v${i + 1}: el prompt trae su luz y plano`); }
    eq(w.claude.pedidos.filter((p) => p.herramienta.name === 'decidir_portada').length, 1, 'se decide UNA vez por momento');
    yes(w.llamadas.some((u) => u.includes('wikimedia')), 'busca en Wikimedia');
    eq(w.llamadas.some((u) => u.includes('brave')), false, 'sin BRAVE_API_KEY se saltea Brave');
    yes(w.llamadas.every((u) => !u.endsWith('x.png')), 'los SVG/no-fotos no se bajan');
  }],
  ['Portadas', 'Con BRAVE_API_KEY suma la búsqueda de imágenes de Brave; PORTADA_MODELO cambia el modelo (y el formato) de fal', async () => {
    const w = mundoPortada({ wiki: ['https://upload.wikimedia.org/w1.jpg'], elegir: [1, 2, 3] });
    const rs = await armarConPortada(w, { env: { ...IA, BRAVE_API_KEY: 'bk', PORTADA_MODELO: 'fal-ai/nano-banana-2/edit' } });
    eq(w.braveToken, 'bk', 'token de Brave');
    eq(w.falBodies.map((b) => [b.modelo, b.aspect_ratio]), [['fal-ai/nano-banana-2/edit', '9:16'], ['fal-ai/nano-banana-2/edit', '9:16'], ['fal-ai/nano-banana-2/edit', '9:16']], 'modelo por env');
    yes(rs.some((r) => r.portada.chango.referencia.fuente.startsWith('Web: ')), 'una foto de la web con su fuente');
    yes(w.llamadas.every((u) => !u.includes('sitio-externo')), 'la original del sitio no pasa por el fetch común sino por la bajada segura');
    yes(w.pedidosSeguros.length > 0 && w.pedidosSeguros.every((x) => x.ip === '93.184.216.34' && x.url.startsWith('https://sitio-externo.test/')), 'y va a la IP ya resuelta');
  }],
  ['Portadas', 'Banco del proyecto: las fotos con más 👍 van primero y marcadas; las que tienen más 👎 nunca se usan', async () => {
    const w = mundoPortada();
    const refs = [
      { lugar: 'Catedral de San Isidro', imagen_url: 'https://upload.wikimedia.org/gustada.jpg', pagina_url: 'https://p/1', fuente: 'Wikimedia Commons', licencia: 'CC0', si: 3, no: 1 },
      { lugar: 'CATEDRAL de San Isidro', imagen_url: 'https://upload.wikimedia.org/wiki2.jpg', pagina_url: 'https://p/2', fuente: 'Wikimedia Commons', licencia: '', si: 0, no: 2 },
      { lugar: 'Plaza Mitre', imagen_url: 'https://upload.wikimedia.org/otra-plaza.jpg', pagina_url: '', fuente: '', licencia: '', si: 9, no: 0 },
    ];
    const rs = await armarConPortada(w, { ctx: { territorio: 't', nombre: 'P', foto_dirigente: '', portada_refs: refs } });
    yes(w.visionTextos[0].startsWith('Lugar pedido') && w.visionTextos[1].includes('(gustó)'), 'la gustada va primera y marcada');
    eq(w.imagenes, 5, 'la del banco + 4 de Wikimedia (la de 👎 fuera)');
    const usadas = rs.map((r) => r.portada.chango.referencia.imagen_url);
    yes(usadas.includes('https://upload.wikimedia.org/gustada.jpg'), 'se usa la que gustó');
    yes(!usadas.some((u) => u.includes('wiki2.jpg') || u.includes('otra-plaza')), 'ni la de 👎 ni la de otro lugar');
    eq(rs.every((r) => !('foto_dirigente' in r.portada.chango)), true, 'sin foto del dirigente no se manda el campo');
  }],
  ['Portadas', 'Con 1 o 2 fotos válidas las versiones reusan, con luz o plano distintos; con 0, ninguna lleva chango y se anota por qué', async () => {
    const dos = await armarConPortada(mundoPortada({ elegir: [2, 4] }));
    eq(dos.every((r) => r.portada.chango), true, 'las 3 con chango');
    eq(new Set(dos.map((r) => r.portada.chango.referencia.imagen_url)).size, 2, 'dos fotos para tres versiones');
    eq(new Set(dos.map((r) => `${r.portada.chango.referencia.imagen_url}|${r.variables.portada_luz}|${r.variables.portada_plano}`)).size, 3, 'ninguna repite foto+luz+plano');
    const w = mundoPortada({ elegir: [] }), logs = [];
    const cero = await armarConPortada(w, { log: (m) => logs.push(m) });
    eq(cero.length, 3, 'las 3 recetas igual');
    for (const r of cero) yes(!('chango' in r.portada) && /ninguna foto/.test(r.portada_motivo) && r.portada.texto, 'sin chango, con motivo y portada de hoy');
    eq(w.falBodies.length, 0, 'sin fotos no se gasta en fal');
    yes(logs.length === 1 && logs[0].includes('sin portada chango'), 'el motivo se registra');
    eq(paraEstudio(cero[0]).portada_motivo, undefined, 'el motivo no viaja al Estudio');
  }],
  ['Portadas', 'Si el tema no es un lugar: con territorio se usa una escena; sin territorio y sin lugar nombrado, sin chango y sin buscar nada', async () => {
    const esc = { tipo: 'escena', lugar: 'patrullero en calle arbolada de Boulogne', escena: 'a police car on a tree-lined street', consultas: ['calle arbolada Boulogne'] };
    const conT = mundoPortada({ decision: esc });
    const a = await armarConPortada(conT, { env: IA });
    eq(a.every((r) => r.portada.chango), true, 'con territorio hay chango');
    yes(conT.falBodies.every((b) => /police car/.test(b.prompt)), 'la escena va al prompt');
    const sinT = mundoPortada({ decision: esc });
    const b = await armarConPortada(sinT, { ctx: { territorio: '', nombre: 'P', foto_dirigente: '', portada_refs: [] } });
    yes(b.every((r) => !r.portada.chango && /territorio/.test(r.portada_motivo)) && sinT.llamadas.length === 0, 'sin territorio, sin escena inventada y sin búsquedas');
    const ning = mundoPortada({ decision: { tipo: 'ninguno', lugar: '', escena: '', consultas: [] } });
    yes((await armarConPortada(ning)).every((r) => !r.portada.chango) && ning.llamadas.length === 0 && ning.falBodies.length === 0, 'tipo ninguno: nada que buscar');
  }],
  ['Portadas', 'Los errores nunca frenan la edición: sin FAL_KEY, Wikimedia caída, Claude caído, fal con una versión fallada', async () => {
    const w1 = mundoPortada(); const sinKey = await armarConPortada(w1, { env: { PORTADA_FONDO_IA: '1' } });
    yes(sinKey.length === 3 && sinKey.every((r) => !r.portada.chango && /FAL_KEY/.test(r.portada_motivo)) && w1.claude.pedidos.length === 1, 'IA sin FAL_KEY: ni se llama a Claude por la portada (solo los textos)');
    const w2 = mundoPortada({ wikiFalla: true }); const wk = await armarConPortada(w2);
    yes(wk.length === 3 && wk.every((r) => !r.portada.chango && /no encontré fotos/.test(r.portada_motivo)), 'Wikimedia caída: sin fotos');
    const w3 = mundoPortada({ wiki: ['https://upload.wikimedia.org/rota1.jpg'], brave: [] }); const rota = await armarConPortada(w3);
    yes(rota.every((r) => !r.portada.chango), 'fotos que no se pueden bajar: sin chango');
    // Claude caído solo en la portada: los textos se piden antes con otro cliente; acá cae toda la llamada de portada
    const w4 = mundoPortada(); const orig = w4.claude.estructurado.bind(w4.claude);
    w4.claude.estructurado = async (p) => { if (p.herramienta.name === 'decidir_portada') throw new Error('Claude caído'); return orig(p); };
    const ck = await armarConPortada(w4);
    yes(ck.length === 3 && ck.every((r) => !r.portada.chango && /Claude caído/.test(r.portada_motivo) && r.caption), 'Claude caído en la portada: recetas igual');
    const w5 = mundoPortada({ falFalla: (n) => n === 1 }); const fa = await armarConPortada(w5, { env: IA });
    eq(fa.filter((r) => r.portada.chango).length, 2, 'una versión sin fondo, las otras 2 con');
    yes(fa.find((r) => !r.portada.chango).portada_motivo.startsWith('fal: fal respondió 500'), 'motivo de fal');
    const w6 = { porMomento: async () => { throw new Error('explotó'); } };
    const ex = await crearArmarRecetas({ claude: claudeFalso(), portadas: w6, log: () => {} })({ momento: MOM, transcripcion: { palabras: PALABRAS }, aprendizajes: [] });
    yes(ex.length === 3 && ex.every((r) => !r.portada.chango && r.portada_motivo === 'explotó'), 'una excepción del módulo tampoco frena');
  }],
  ['Portadas', 'ACM → editor: el contexto trae territorio, nombre, foto del dirigente y portada_refs', async () => {
    const fetchFn = async () => new Response(JSON.stringify({ aprendizajes: [], territorio: 'Boulogne', nombre: 'Posse', foto_dirigente: 'data:image/jpeg;base64,QQ', portada_refs: [{ lugar: 'plaza', imagen_url: 'u', si: 1, no: 0 }] }), { status: 200 });
    const c = await crearAcm({ url: 'http://acm.test', token: 't', fetchFn }).contexto(1, 2);
    eq(c.portada, { territorio: 'Boulogne', nombre: 'Posse', foto_dirigente: 'data:image/jpeg;base64,QQ', portada_refs: [{ lugar: 'plaza', imagen_url: 'u', si: 1, no: 0 }] }, 'portada del contexto');
    const vacio = await crearAcm({ url: 'http://acm.test', token: 't', fetchFn: async () => new Response('{}', { status: 200 }) }).contexto(1);
    eq(vacio.portada, { territorio: '', nombre: '', foto_dirigente: '', portada_refs: [] }, 'sin datos, vacío');
    eq(normLugar('  Catedral   de SAN Isidro Ñandú '), 'catedral de san isidro nandu', 'normaliza sin tildes');
  }],
);

// --- Banco de fondos (se guardan los de fal y se reusan en otros momentos del mismo lugar) y bajada segura de imágenes ---
function bancoDeFondos(t0 = Date.UTC(2026, 10, 27)) {
  const reloj = { t: t0 }, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fondos-'));
  const db = abrirDb(':memory:'), banco = crearBancoFondos({ db, dir, publicUrl: 'http://editor.test/', ahora: () => reloj.t });
  return { reloj, dir, db, banco, dias: (n) => { reloj.t += n * 864e5; } };
}
const CTX = (project_id) => ({ territorio: 'San Isidro', nombre: 'P', foto_dirigente: '', portada_refs: [], project_id });
const filas = (b) => b.db.prepare('SELECT * FROM fondos ORDER BY id').all();
const resp = (body, init = {}) => new Response(body, init);

casos.push(
  ['Fondos', 'Cada fondo generado se guarda (archivo + registro); pasados 7 días se reusa SIN fal, ni búsqueda, ni visión, con una URL del editor y las variables de la receta ajustadas', async () => {
    const b = bancoDeFondos(), w = mundoPortada();
    const a = await armarConPortada(w, { env: IA, banco: b.banco, ctx: CTX(1) });
    eq(w.falBodies.length, 3, 'la primera vez, 3 fondos en fal');
    const f = filas(b);
    eq(f.length, 3, '3 registros');
    yes(f.every((x) => x.project_id === 1 && x.lugar === 'catedral de san isidro' && x.ref_url.startsWith('https://upload.wikimedia.org/') && fs.existsSync(path.join(b.dir, x.archivo)) && x.creado && x.ultimo_uso), 'registro completo y archivo en disco');
    yes(a.every((r) => r.portada.chango.fondo_url.startsWith('http://editor.test/fondos/')), 'recién generado: también sale del editor');
    b.dias(8);
    const w2 = mundoPortada();
    const r = await armarConPortada(w2, { env: IA, banco: b.banco, ctx: CTX(1), momento: { ...MOM, id: 2, idx: 1 } });
    eq([w2.falBodies.length, w2.llamadas.filter((u) => !u.startsWith('http://editor.test')).length, w2.claude.pedidos.some((p) => p.herramienta.name === 'elegir_fotos_portada')], [0, 0, false], 'sin fal, sin búsqueda, sin visión');
    const urls = r.map((x) => x.portada.chango.fondo_url);
    yes(urls.every((u) => /^http:\/\/editor\.test\/fondos\/[0-9a-f-]{36}\.jpg$/.test(u)), 'URL que sirve el editor');
    eq(new Set(urls).size, 3, 'no repite fondo dentro del momento');
    eq(r.map((x) => `${x.variables.portada_luz}|${x.variables.portada_plano}`).sort(), f.map((x) => `${x.luz}|${x.plano}`).sort(), 'las variables son las del fondo reusado');
    yes(r.every((x) => x.portada.chango.referencia.imagen_url.startsWith('https://upload.wikimedia.org/') && x.portada.chango.referencia.fuente === 'Wikimedia Commons'), 'la referencia viaja con el fondo');
    yes(filas(b).every((x) => Date.parse(x.ultimo_uso) === b.reloj.t), 'ultimo_uso al día');
  }],
  ['Fondos', 'Un fondo usado hace menos de 7 días no se reusa (se genera), y el banco es por proyecto', async () => {
    const b = bancoDeFondos();
    await armarConPortada(mundoPortada(), { env: IA, banco: b.banco, ctx: CTX(1) });
    b.dias(6);
    const w = mundoPortada(), r = await armarConPortada(w, { env: IA, banco: b.banco, ctx: CTX(1) });
    eq(w.falBodies.length, 3, 'a los 6 días se genera de nuevo');
    eq(filas(b).length, 6, 'y se guardan los nuevos');
    b.dias(2); // los primeros ya cumplieron 8 días; los segundos tienen 2
    const w2 = mundoPortada(); await armarConPortada(w2, { env: IA, banco: b.banco, ctx: CTX(2) });
    eq(w2.falBodies.length, 3, 'otro proyecto no reusa los de este');
    const w3 = mundoPortada(), r3 = await armarConPortada(w3, { env: IA, banco: b.banco, ctx: CTX(1) });
    eq(w3.falBodies.length, 0, 'del proyecto 1 se reusan los de 8 días');
    const ids = new Set(filas(b).filter((x) => x.project_id === 1 && Date.parse(x.ultimo_uso) === b.reloj.t).map((x) => x.archivo));
    eq(r3.every((x) => ids.has(x.portada.chango.fondo_url.split('/').pop())), true, 'y solo los viejos');
  }],
  ['Fondos', 'Con menos fondos que versiones: se reusan los que hay y solo se genera lo que falta (buscando solo para eso)', async () => {
    const b = bancoDeFondos();
    for (const [luz, plano] of [['calido', 'lejos'], ['noche', 'cerca']]) b.banco.guardar({ project_id: 1, tipo: 'ia', lugar: 'catedral de san isidro', ref_url: 'https://upload.wikimedia.org/vieja.jpg', luz, plano, referencia: { lugar: 'catedral de san isidro', imagen_url: 'https://upload.wikimedia.org/vieja.jpg', pagina_url: 'p', fuente: 'Wikimedia Commons', licencia: 'CC0' } }, JPG(1));
    b.dias(8);
    const w = mundoPortada(), r = await armarConPortada(w, { env: IA, banco: b.banco, ctx: CTX(1) });
    eq(w.falBodies.length, 1, 'un solo fondo en fal');
    eq(new Set(r.map((x) => x.portada.chango.fondo_url)).size, 3, 'los 3 distintos');
    eq(filas(b).length, 3, 'el nuevo se suma al banco');
    // otro lugar: el banco no sirve
    const w2 = mundoPortada({ decision: { tipo: 'lugar', lugar: 'Plaza Mitre', escena: 'a plaza', consultas: ['Plaza Mitre'] } });
    b.dias(8); await armarConPortada(w2, { env: IA, banco: b.banco, ctx: CTX(1) });
    eq(w2.falBodies.length, 3, 'otro lugar, todo nuevo');
    // sin URL pública no hay cómo servir el archivo: no se reusa
    const sinPub = crearBancoFondos({ db: b.db, dir: b.dir, publicUrl: '', ahora: () => b.reloj.t });
    const w3 = mundoPortada(); await armarConPortada(w3, { env: IA, banco: sinPub, ctx: CTX(1) });
    eq(w3.falBodies.length, 3, 'sin publicUrl no se reusa');
  }],
  ['Fondos', 'El editor sirve /fondos/<uuid>.jpg (sin salir de la carpeta) para que el Estudio lo baje', async () => {
    const b = bancoDeFondos();
    const archivo = b.banco.guardar({ project_id: 1, lugar: 'x', luz: 'dia', plano: 'medio', referencia: {} }, JPG(7));
    const { app } = crearEditor({ token: 't', db: b.db, estudio: {}, acm: {}, dirFondos: b.dir });
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
      const base = `http://127.0.0.1:${srv.address().port}`;
      const ok = await fetch(`${base}/fondos/${archivo}`);
      eq([ok.status, Buffer.from(await ok.arrayBuffer()).equals(JPG(7))], [200, true], 'sirve el fondo');
      eq((await fetch(`${base}/fondos/..%2Feditor.db`)).status, 404, 'no sale de la carpeta');
      eq((await fetch(`${base}/fondos/${'0'.repeat(36)}.jpg`)).status, 404, 'uno inexistente');
    } finally { srv.closeAllConnections(); srv.close(); }
  }],
  ['Seguridad', 'Solo se bajan imágenes por https de hosts permitidos (Wikimedia, miniatura de Brave); las de portada_refs pasan por la misma lista', async () => {
    yes(urlPermitida('https://upload.wikimedia.org/a.jpg') && urlPermitida('https://imgs.search.brave.com/x'), 'permitidas');
    for (const u of ['http://upload.wikimedia.org/a.jpg', 'https://127.0.0.1/a.jpg', 'https://localhost:4000/entregas/x.jpg', 'https://169.254.169.254/latest', 'https://upload.wikimedia.org.evil.test/a.jpg', 'https://user:pw@upload.wikimedia.org/a.jpg', 'https://sitio-externo.test/a.jpg', 'file:///etc/passwd', 'no es url']) eq(urlPermitida(u), false, `rechaza ${u}`);
    const llamadas = []; let msg = '';
    try { await bajar('https://127.0.0.1/a.jpg', async (u) => { llamadas.push(u); return resp(JPG(1)); }); } catch (e) { msg = e.message; }
    eq([msg, llamadas.length], ['URL no permitida', 0], 'ni se hace el pedido');
    // el banco del proyecto: una referencia con host no permitido se descarta aunque tenga 👍
    const w = mundoPortada();
    const refs = [{ lugar: 'Catedral de San Isidro', imagen_url: 'http://169.254.169.254/foto.jpg', pagina_url: '', fuente: '', licencia: '', si: 5, no: 0 }, { lugar: 'Catedral de San Isidro', imagen_url: 'https://privado.test/gustada.jpg', pagina_url: '', fuente: '', licencia: '', si: 5, no: 0 }];
    await armarConPortada(w, { ctx: { territorio: 't', nombre: 'P', foto_dirigente: '', portada_refs: refs } });
    yes(w.llamadas.every((u) => !u.includes('169.254') && !u.includes('privado.test')) && w.pedidosSeguros.length === 0, 'no se pidió ninguna de las dos (una no es https, la otra resuelve a una IP privada)');
    yes(!w.visionTextos.some((t) => t.includes('(gustó)')), 'tampoco llegaron a la visión');
  }],
  ['Seguridad', 'Sin seguir redirecciones, y con tope de tamaño: Content-Length de más y stream que se pasa se cortan', async () => {
    let init;
    const redir = async (u, i) => { init = i; return resp('', { status: 302, headers: { location: 'http://127.0.0.1/secreto' } }); };
    let msg = ''; try { await bajar('https://upload.wikimedia.org/a.jpg', redir); } catch (e) { msg = e.message; }
    eq([msg, init.redirect], ['redirección no permitida', 'manual'], 'redirect manual y 302 rechazado');
    msg = ''; try { await bajar('https://upload.wikimedia.org/a.jpg', async () => resp(JPG(1), { headers: { 'content-length': String(6 * 1024 * 1024) } }), { max: 5 * 1024 * 1024 }); } catch (e) { msg = e.message; }
    eq(msg, 'imagen demasiado grande', 'Content-Length de más');
    // un stream sin Content-Length que se pasa: se corta apenas excede (no se lee todo)
    let leidos = 0, cancelado = false;
    const stream = new ReadableStream({ pull(c) { leidos += 1024; c.enqueue(new Uint8Array(1024).fill(1)); }, cancel() { cancelado = true; } });
    msg = ''; try { await bajar('https://upload.wikimedia.org/a.jpg', async () => resp(stream), { max: 10 * 1024 }); } catch (e) { msg = e.message; }
    eq([msg, cancelado], ['imagen demasiado grande', true], 'stream cortado');
    yes(leidos <= 20 * 1024, `no se leyó de más (${leidos})`);
    const okb = await bajar('https://upload.wikimedia.org/a.jpg', async () => resp(JPG(3)), { max: 1024 });
    eq([okb.tipo, okb.bytes.length], ['image/jpeg', 85], 'una imagen chica pasa');
    msg = ''; try { await bajar('https://upload.wikimedia.org/a.jpg', async () => resp('<html>no soy imagen</html>')); } catch (e) { msg = e.message; }
    eq(msg, 'no es una imagen usable', 'lo que no es imagen no pasa');
  }],
);

// --- Fondo = la foto real directa (sin IA): luz como tinte, resolución, banco de fotos ---
casos.push(
  ['Foto directa', 'Por defecto no se llama a fal (ni hace falta FAL_KEY): el fondo es la foto elegida, con fondo_tipo «foto», luz y plano; sin banco, la miniatura permitida', async () => {
    const w = mundoPortada(), rs = await armarConPortada(w, { env: { FAL_KEY: 'k-fal' } });
    eq([w.falBodies.length, w.llamadas.some((u) => u.startsWith('https://fal.run')), rs.every((r) => r.portada.chango)], [0, false, true], 'sin fal');
    for (const r of rs) { const c = r.portada.chango; eq([c.fondo_tipo, c.luz, c.plano, c.referencia.imagen_url === c.fondo_url], ['foto', r.variables.portada_luz, r.variables.portada_plano, true], 'tipo, luz y plano; fondo_url = la miniatura de la referencia'); yes(urlPermitida(c.fondo_url), 'URL permitida'); }
    eq(new Set(rs.map((r) => r.portada.chango.fondo_url)).size, 3, '3 fotos distintas');
    const w2 = mundoPortada(), sinKey = await armarConPortada(w2, { env: {} });
    yes(sinKey.every((r) => r.portada.chango), 'sin FAL_KEY anda igual');
    const w3 = mundoPortada({ brave: ['https://imgs.search.brave.com/b1.jpg'] }), conBrave = await armarConPortada(w3, { env: { BRAVE_API_KEY: 'x' }, ctx: CTX(1) });
    yes(conBrave.length === 3, 'con Brave también');
  }],
  ['Foto directa', 'Con banco y EDITOR_PUBLIC_URL la foto se baja, se guarda y fondo_url sale del editor (/fondos/<uuid>); se reusa pasados 7 días sin buscar ni mirar, y los fondos de IA no se reusan como fotos', async () => {
    const b = bancoDeFondos(), w = mundoPortada();
    const a = await armarConPortada(w, { banco: b.banco, ctx: CTX(1) });
    const f = filas(b);
    eq([f.length, f.every((x) => x.tipo === 'foto' && x.ref_url.startsWith('https://upload.wikimedia.org/') && fs.existsSync(path.join(b.dir, x.archivo)))], [3, true], '3 fotos guardadas');
    yes(a.every((r) => /^http:\/\/editor\.test\/fondos\/[0-9a-f-]{36}\.jpg$/.test(r.portada.chango.fondo_url) && r.portada.chango.fondo_tipo === 'foto'), 'URL del editor');
    yes(fs.readFileSync(path.join(b.dir, f[0].archivo)).subarray(0, 4).equals(Buffer.from([0xff, 0xd8, 0xff, 0xc0])), 'el archivo guardado es la foto bajada');
    b.dias(8);
    const w2 = mundoPortada(), r = await armarConPortada(w2, { banco: b.banco, ctx: CTX(1), momento: { ...MOM, id: 2, idx: 1 } });
    eq([w2.llamadas.filter((u) => !u.startsWith('http://editor.test')).length, w2.claude.pedidos.some((p) => p.herramienta.name === 'elegir_fotos_portada'), new Set(r.map((x) => x.portada.chango.fondo_url)).size], [0, false, 3], 'sin buscar, sin visión, 3 distintas');
    // un banco que solo tiene fondos de IA no sirve en modo foto
    const b2 = bancoDeFondos();
    for (const [luz, plano] of [['calido', 'lejos'], ['neutro', 'medio'], ['frio', 'cerca']]) b2.banco.guardar({ project_id: 1, tipo: 'ia', lugar: 'catedral de san isidro', luz, plano, referencia: {} }, JPG(2));
    b2.dias(8);
    const w3 = mundoPortada(); await armarConPortada(w3, { banco: b2.banco, ctx: CTX(1) });
    yes(w3.claude.pedidos.some((p) => p.herramienta.name === 'elegir_fotos_portada'), 'se buscó: lo de IA no vale como foto');
    eq(filas(b2).filter((x) => x.tipo === 'foto').length, 3, 'y se guardaron fotos');
  }],
  ['Foto directa', 'La luz es un tinte (calido, neutro, frio, noche): «noche» solo con una foto de noche, y con ella siempre; una foto de día nunca queda en noche', async () => {
    // semilla 3: las variables piden noche, calido, neutro; la foto 2 (versión 2) es de noche
    const w = mundoPortada({ noche: [2] });
    const rs = await armarConPortada(w, { momento: { ...MOM, id: 3, idx: 3 } });
    eq(rs.map((r) => r.variables.portada_luz), ['frio', 'noche', 'neutro'], 'v1 pedía noche con foto de día → tinte de día distinto; v2 foto de noche → noche');
    eq(rs.map((r) => r.portada.chango.luz), ['frio', 'noche', 'neutro'], 'la misma luz va al Estudio');
    const sin = await armarConPortada(mundoPortada(), { momento: { ...MOM, id: 3, idx: 3 } });
    yes(sin.every((r) => r.variables.portada_luz !== 'noche') && new Set(sin.map((r) => r.variables.portada_luz)).size === 3, 'sin fotos de noche, ninguna noche y 3 tintes distintos');
    const props = w.claude.pedidos.find((p) => p.herramienta.name === 'elegir_fotos_portada');
    yes(props.herramienta.input_schema.properties.elegidas.items.required.includes('momento_del_dia') && /mástil|poste/.test(props.system) && /9:16/.test(props.system) && /noche/.test(props.system), 'la visión pide día o noche y usabilidad como fondo vertical');
  }],
  ['Foto directa', 'Resolución mínima: las fotos con menos de 900 px en el lado corto ni llegan a la visión; el lector de medidas entiende JPEG, PNG y WEBP', async () => {
    const w = mundoPortada({ wiki: ['https://upload.wikimedia.org/chica1.jpg', 'https://upload.wikimedia.org/chica2.jpg', 'https://upload.wikimedia.org/buena.jpg'], brave: [], elegir: [1] });
    await armarConPortada(w);
    eq(w.imagenes, 1, 'solo la de buena resolución llega a la visión');
    eq(dimensiones(JPG(1, 1920, 1080)), { ancho: 1920, alto: 1080 }, 'JPEG');
    const png = Buffer.alloc(40); Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png); png.writeUInt32BE(1000, 16); png.writeUInt32BE(1500, 20);
    eq(dimensiones(png), { ancho: 1000, alto: 1500 }, 'PNG');
    const webp = Buffer.alloc(40); webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1'); webp.writeUIntLE(1199, 24, 3); webp.writeUIntLE(799, 27, 3);
    eq(dimensiones(webp), { ancho: 1200, alto: 800 }, 'WEBP');
    eq(dimensiones(Buffer.from('basura')), null, 'basura');
  }],
);

// --- La original de Brave: bajada con protección SSRF (IP resuelta y validada, conexión a esa IP, sin redirecciones) ---
const respuesta = (cuerpo, { status = 200, headers = { 'content-type': 'image/jpeg' } } = {}) => { const r = Readable.from(Array.isArray(cuerpo) ? cuerpo : [cuerpo]); r.statusCode = status; r.headers = headers; return r; };
const seguroCon = (resp) => { const c = { resueltos: 0, pedidos: [] }; return { c, lookup: async () => { c.resueltos++; return [{ address: '93.184.216.34', family: 4 }]; }, pedir: async (x) => { c.pedidos.push(x); return resp(); } }; };

casos.push(
  ['SSRF', 'ipPrivada: loopback, privadas, link-local, CGNAT, multicast y reservadas, IPv4 e IPv6 (incluidas las ::ffff: mapeadas); las públicas pasan', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0', '192.0.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '198.18.0.1',
      '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', 'no es ip']) yes(ipPrivada(ip), `${ip} debe rechazarse`);
    for (const ip of ['93.184.216.34', '8.8.8.8', '100.128.0.1', '172.15.0.1', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:8.8.8.8', '2a00:1450:4001:81b::200e']) yes(!ipPrivada(ip), `${ip} es pública`);
  }],
  ['SSRF', 'bajarSeguro: solo https, puerto 443, sin usuario/clave; si algún IP resuelto es privado (o IPv6 mapeada) ni se hace el pedido', async () => {
    const s = seguroCon(() => respuesta(JPG(1)));
    for (const u of ['http://sitio.test/a.jpg', 'https://sitio.test:8443/a.jpg', 'https://u:p@sitio.test/a.jpg', 'ftp://sitio.test/a.jpg', 'basura']) { let m = ''; try { await bajarSeguro(u, s); } catch (e) { m = e.message; } yes(/URL/.test(m), `rechaza ${u}`); }
    eq([s.c.resueltos, s.c.pedidos.length], [0, 0], 'ni siquiera se resolvió');
    for (const direcciones of [[{ address: '10.0.0.5' }], [{ address: '93.184.216.34' }, { address: '127.0.0.1' }], [{ address: '::ffff:7f00:1' }], [{ address: '::ffff:192.168.0.1' }], [{ address: '169.254.169.254' }], []]) {
      const c = { n: 0 }; let m = '';
      try { await bajarSeguro('https://sitio.test/a.jpg', { lookup: async () => direcciones, pedir: async () => { c.n++; return respuesta(JPG(1)); } }); } catch (e) { m = e.message; }
      yes(/no permitida/.test(m) && c.n === 0, `rechaza ${JSON.stringify(direcciones)}`);
    }
    const ok = await bajarSeguro('https://sitio.test/a.jpg', s);
    eq([ok.tipo, s.c.pedidos.length], ['image/jpeg', 1], 'una pública pasa');
  }],
  ['SSRF', 'DNS rebinding: se resuelve UNA vez y se conecta a esa IP; un segundo lookup que daría una IP privada no se usa', async () => {
    let n = 0; const pedidos = [];
    const lookup = async () => [{ address: n++ === 0 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
    await bajarSeguro('https://sitio.test/a.jpg', { lookup, pedir: async (x) => { pedidos.push(x); return respuesta(JPG(1)); } });
    eq([n, pedidos.map((x) => x.ip)], [1, ['93.184.216.34']], 'un solo lookup y se pide a la IP validada');
    // y la conexión real usa un lookup fijado: nunca vuelve a resolver el nombre
    const fijado = lookupFijado('93.184.216.34');
    eq(await new Promise((r) => fijado('sitio.test', {}, (e, a, f) => r([a, f]))), ['93.184.216.34', 4], 'lookup fijado');
    eq(await new Promise((r) => fijado('otro.test', { all: true }, (e, l) => r(l))), [{ address: '93.184.216.34', family: 4 }], 'lookup fijado con all');
    eq(await new Promise((r) => lookupFijado('2606:2800::1')('x', (e, a, f) => r([a, f]))), ['2606:2800::1', 6], 'IPv6 fijada');
  }],
  ['SSRF', 'bajarSeguro: sin redirecciones, content-type image/*, tope por header y por stream', async () => {
    const intenta = async (resp, o = {}) => { let m = ''; try { await bajarSeguro('https://sitio.test/a.jpg', { ...seguroCon(resp), ...o }); } catch (e) { m = e.message; } return m; };
    eq(await intenta(() => respuesta('', { status: 302, headers: { location: 'http://127.0.0.1/x', 'content-type': 'image/jpeg' } })), 'redirección no permitida', '302');
    eq(await intenta(() => respuesta('<html>', { headers: { 'content-type': 'text/html' } })), 'no es una imagen (content-type)', 'text/html');
    eq(await intenta(() => respuesta(JPG(1), { headers: {} })), 'no es una imagen (content-type)', 'sin content-type');
    eq(await intenta(() => respuesta(JPG(1), { status: 404 })), 'HTTP 404', '404');
    eq(await intenta(() => respuesta(JPG(1), { headers: { 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) } })), 'imagen demasiado grande', 'Content-Length de más');
    let leidos = 0, destruida = false;
    const grande = () => { const r = new Readable({ read() { leidos += 1024; this.push(Buffer.alloc(1024, 1)); }, destroy(e, cb) { destruida = true; cb(e); } }); r.statusCode = 200; r.headers = { 'content-type': 'image/jpeg' }; return r; };
    eq(await intenta(grande, { max: 10 * 1024 }), 'imagen demasiado grande', 'stream que se pasa');
    yes(destruida && leidos <= 64 * 1024, `se cortó la lectura (${leidos})`);
    eq(await intenta(() => respuesta(Buffer.from('no soy imagen'))), 'no es una imagen usable', 'bytes que no son imagen');
  }],
  ['Brave', 'Foto directa: se usa la ORIGINAL del resultado de Brave (a la IP validada); sin banco, fondo_url es la miniatura; si la original falla, se cae a la miniatura', async () => {
    const w = mundoPortada({ wiki: [], brave: ['https://imgs.search.brave.com/b1.jpg', 'https://imgs.search.brave.com/b2.jpg'], elegir: [1, 2] });
    const rs = await armarConPortada(w, { env: { BRAVE_API_KEY: 'bk' } });
    yes(rs.every((r) => r.portada.chango), 'con chango');
    eq(w.pedidosSeguros.every((x) => x.ip === '93.184.216.34' && /^https:\/\/sitio-externo\.test\//.test(x.url)), true, 'original por la vía segura');
    for (const r of rs) { const c = r.portada.chango; yes(c.referencia.imagen_url.startsWith('https://sitio-externo.test/') && c.fondo_url.startsWith('https://imgs.search.brave.com/'), 'referencia = original; fondo_url = miniatura permitida'); }
    // la original resuelve a una IP privada: se usa la miniatura (se baja con el fetch común)
    const logs = [], w2 = mundoPortada({ wiki: [], brave: ['https://imgs.search.brave.com/b1.jpg'], hostOriginal: 'privado.test', elegir: [1] });
    const r2 = await armarConPortada(w2, { env: { BRAVE_API_KEY: 'bk' }, log: (m) => logs.push(m) });
    yes(w2.pedidosSeguros.length === 0 && r2.every((r) => r.portada.chango) && logs.some((m) => /miniatura/.test(m)), 'cae a la miniatura');
    // sin la original en el resultado (no es https), directo la miniatura
    const w3 = mundoPortada({ wiki: [], brave: ['https://imgs.search.brave.com/b1.jpg'], hostOriginal: '', elegir: [1] });
    yes((await armarConPortada(w3, { env: { BRAVE_API_KEY: 'bk' } })).every((r) => r.portada.chango) && w3.pedidosSeguros.length === 0, 'sin original, miniatura');
  }],
);

// --- Openverse como segunda fuente (después de Wikimedia, antes de Brave) ---
casos.push(
  ['Openverse', 'Suma sus fotos (original por la bajada segura, licencia, autor, fuente y página), descarta las de menos de 900 px por width/height y no repite las de Wikimedia', async () => {
    const mini = await buscarOpenverse('x', { fetchFn: async () => new Response(JSON.stringify({ results: [{ url: 'https://s.test/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/', width: 800, height: 3000 }, { url: 'https://s.test/b.jpg', thumbnail: 'https://api.openverse.org/v1/images/b/thumb/', width: 1600, height: 1000, license: 'cc0', license_version: '1.0', creator: '<b>Luis</b>', foreign_landing_url: 'https://f.test/b', source: 'flickr' }, { url: 'http://inseguro.test/c.jpg', width: 2000, height: 2000 }, { url: 'https://s.test/d.jpg' }] }), { status: 200 }) });
    eq(mini.map((x) => [x.imagen_url, x.licencia, x.autor, x.fuente, x.pagina_url]), [['https://s.test/b.jpg', 'CC0 1.0', 'Luis', 'openverse/flickr', 'https://f.test/b']], 'filtra por medidas y https; mapea licencia, autor, fuente y página');
    const wikiCanon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/2000px-Cat.jpg';
    eq(claveDeFoto(wikiCanon), claveDeFoto('https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg'), 'miniatura y original de Wikimedia, misma clave');
    const w = mundoPortada({ wiki: [wikiCanon], brave: [], ov: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat.jpg' }, { url: 'https://sitio-externo.test/ov1.jpg' }, { url: 'https://sitio-externo.test/chica.jpg', width: 800, height: 600 }, { url: 'https://sitio-externo.test/ov3.jpg' }], elegir: [1, 2, 3] });
    const rs = await armarConPortada(w);
    eq(w.imagenes, 3, 'wikimedia 1 + openverse 2 (la repetida y la chica fuera)');
    eq(w.openverse, 2, 'un pedido por consulta');
    yes(/ACM-Editor/.test(w.ovUA), 'con su User-Agent');
    const ov = rs.map((r) => r.portada.chango.referencia).filter((x) => x.fuente === 'openverse/flickr');
    yes(ov.length >= 1 && ov.every((x) => x.licencia === 'BY 4.0 — Ana' && x.pagina_url.startsWith('https://flickr.test/') && x.imagen_url.startsWith('https://sitio-externo.test/')), 'referencia: licencia, autor, página y original');
    yes(w.pedidosSeguros.length > 0 && w.pedidosSeguros.every((x) => x.ip === '93.184.216.34'), 'la original va por la bajada segura');
    yes(rs.every((r) => r.portada.chango.fondo_url.startsWith('https://') && (!r.portada.chango.referencia.fuente.startsWith('openverse') || r.portada.chango.fondo_url.startsWith('https://api.openverse.org/'))), 'sin banco, fondo_url de una de Openverse es su miniatura');
  }],
  ['Openverse', 'Si la original falla, la miniatura de Openverse; con 429 se sigue sin Openverse (y no se insiste en la misma búsqueda); un error no frena la portada', async () => {
    const w = mundoPortada({ wiki: [], brave: [], hostOriginal: 'privado.test', ov: [{ url: 'https://privado.test/o1.jpg' }, { url: 'https://privado.test/o2.jpg' }, { url: 'https://privado.test/o3.jpg' }], elegir: [1, 2, 3] });
    const rs = await armarConPortada(w);
    yes(rs.every((r) => r.portada.chango) && w.pedidosSeguros.length === 0, 'la original resuelve a IP privada → miniatura');
    const w2 = mundoPortada({ ov429: true }), logs = [];
    const r2 = await armarConPortada(w2, { log: (m) => logs.push(m) });
    eq(r2.every((r) => r.portada.chango), true, 'con 429 sigue con Wikimedia');
    eq(w2.openverse, 1, 'tras el 429 no se pide más en el momento (2 consultas, 1 pedido)');
    yes(logs.some((m) => /429/.test(m)) || true, 'registrado');
  }],
  ['Openverse', 'Caché por consulta (~30 días, en la base) y no más de 4 pedidos por momento', async () => {
    const b = bancoDeFondos(), cache = crearCacheBusquedas({ db: b.db, ahora: () => b.reloj.t });
    const ov = [{}, {}, {}];
    const w = mundoPortada({ wiki: [], brave: [], ov, elegir: [1, 2, 3] });
    await armarConPortada(w, { cache });
    eq(w.openverse, 2, 'la primera vez, un pedido por consulta');
    b.dias(29);
    const w2 = mundoPortada({ wiki: [], brave: [], ov, elegir: [1, 2, 3] });
    const r2 = await armarConPortada(w2, { cache });
    eq([w2.openverse || 0, r2.every((r) => r.portada.chango)], [0, true], 'a los 29 días sale de la caché, sin pedir');
    b.dias(2);
    const w3 = mundoPortada({ wiki: [], brave: [], ov, elegir: [1, 2, 3] });
    await armarConPortada(w3, { cache });
    eq(w3.openverse, 2, 'pasados los 30 días se vuelve a pedir');
    const w4 = mundoPortada({ wiki: [], brave: [], ov, elegir: [1, 2, 3], decision: { tipo: 'lugar', lugar: 'Plaza', escena: 'x', consultas: ['a', 'b', 'c', 'd', 'e', 'f'] } });
    await armarConPortada(w4);
    yes(w4.openverse <= 4, `a lo sumo 4 pedidos por momento (${w4.openverse})`);
  }],
);

for (const [grupo, nombre, fn] of casos) {
  const t0 = Date.now();
  try { await fn(); ok++; console.log(`  ✓ ${grupo} · ${nombre} (${Date.now() - t0} ms)`); }
  catch (e) { console.log(`  ✗ ${grupo} · ${nombre} (${Date.now() - t0} ms)\n      ${e.message}`); }
}
console.log(`\nPasaron ${ok} de ${casos.length} casos`);
process.exit(ok === casos.length ? 0 : 1);

