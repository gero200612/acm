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
import { validarMomentos, crearElegirMomentos } from './momentos.js';
import { crearArmarRecetas, elegirVariables, normalizarAprendizajes } from './recetas.js';
import { crearCriterio } from './criterio.js';
import { crearClaude } from './claude.js';
import { paraEstudio } from './runner.js';
import { crearAnalista, corregirReceta, elegirCuadros } from './analista.js';

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
    if (req.method === 'GET' && req.url === '/api/editor/aprendizajes/7') return json(res, 200, { project_id: 7, aprendizajes: [{ ritmo: 'rapido', horario: { instagram: '20:00' } }], investigacion: ['Candidato X: pide más seguridad'] });
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
      eq(m.acm.estados, ['42:transcribiendo', '42:buscando_momentos', '42:editando', '42:revisando', '42:listo'], 'etapas avisadas a ACM');
      eq(m.est.log.filter((l) => l.startsWith('sin-auth')), [], 'todo pedido al Estudio lleva X-Empresa y Bearer');
      const peds = m.est.pedidos('/v1/editar-recorte');
      eq(peds.map((p) => p.receta.id), ['rapido', 'calmo'], 'recetas pedidas');
      eq([peds[0].inicio_s, peds[0].fin_s, peds[0].palabras.map((p) => p.texto)], [0, 12, ['hola', 'chau']], 'solo las palabras del momento');
      eq(m.acm.ediciones.length, 2, 'ediciones entregadas');
      const e = m.acm.ediciones[0];
      yes(/^[0-9a-f-]{36}$/.test(e.edicion_id) && e.edicion_id !== m.acm.ediciones[1].edicion_id, 'edicion_id: un UUID distinto por edición'); eq([e.crudo_id, e.clip_id, e.review, e.caption, e.duration, e.bajado, e.portada_bajada], [42, 'c42-1', 'aprobado', 'Texto revisado', 12, VIDEO.length, true], 'entrega con archivo bajable');
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

// ---- Tarea 6: momentos y recetas con Claude (respuestas fakes, cero red) ----
// 220 palabras de 0,9 s, una por segundo: la palabra i va de i a i+0,9
const PALABRAS = Array.from({ length: 220 }, (_, i) => ({ inicio_s: i, fin_s: i + 0.9, texto: `p${i}` }));
const mom = (k, extra = {}) => ({ inicio_s: k * 10, fin_s: k * 10 + 9.9, tema: `tema ${k}`, motivo: `motivo ${k}`, actualidad: false, interes: 100 - k, ...extra });
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
      { inicio_s: 5, fin_s: 14.9, tema: 'c', interes: 1 }, // pisa al de 0 a 9,9 (más interesante)
      mom(5),
    ], PALABRAS);
    eq(validos.map((m) => [m.inicio_s, m.fin_s]), [[0, 9.9], [50, 59.9]], 'quedan');
    eq(descartados.map((d) => d.causa).sort(), ['muy cortos', 'que cortan una palabra', 'solapados'], 'causas');
    eq(validarMomentos([{ inicio_s: 0, fin_s: 94.9, interes: 5 }], PALABRAS).descartados[0].causa, 'muy largos', 'más de 90 s');
    eq(validarMomentos([mom(1, { fin_s: 19.5 })], PALABRAS).descartados[0].causa, 'que cortan una palabra', 'termina a mitad de palabra');
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
    yes(difieren(rs, (r) => [r.gancho.texto ?? null, r.gancho.desde_s]), 'gancho');
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

for (const [grupo, nombre, fn] of casos) {
  const t0 = Date.now();
  try { await fn(); ok++; console.log(`  ✓ ${grupo} · ${nombre} (${Date.now() - t0} ms)`); }
  catch (e) { console.log(`  ✗ ${grupo} · ${nombre} (${Date.now() - t0} ms)\n      ${e.message}`); }
}
console.log(`\nPasaron ${ok} de ${casos.length} casos`);
process.exit(ok === casos.length ? 0 : 1);

