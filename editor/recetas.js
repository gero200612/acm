// Armar las 3 recetas de un momento. Las variables (gancho, subtítulos, música/ritmo, largo/portada) las decide el código;
// Claude (Haiku) solo escribe los textos: caption, hashtags, texto del gancho y de la portada.
import { MODELOS } from './claude.js';
import { SYSTEM_TEXTOS, HERRAMIENTA_TEXTOS, usuarioTextos } from './prompts.js';
import { finDeFrase, inicioDeFrase } from './frases.js';

export const OPCIONES = {
  // directo: arranca como siempre; pregunta/adelanto: cartel arriba (adelanto además salta el comienzo); (el gancho «negro», pantalla negra con la frase, se sacó: lo guardado con ese nombre vale como «mejor»)
  // fuerte de más adelante (se oye y se lee en grande) y después el reel; mejor: ~2 s del video real de esa frase (con su sonido) y después el reel
  gancho: ['directo', 'pregunta', 'adelanto', 'mejor'],
  // Estilos de subtítulo. El karaoke ya no es un estilo sino un modo (`receta.karaoke`): la palabra que se dice se pinta en el momento en que se dice, en cualquier estilo.
  subtitulos: ['recuadro', 'placa', 'minimo', 'frase', 'grande', 'chango'],
  musica: ['energico', 'calido', 'sin'],
  ritmo: ['rapido', 'normal', 'lento'],
  largo: ['completo', 'medio', 'corto'],
  // Transición en cada corte interno del reel (donde se sacan pausas y entre tramos de un tema partido), con su sonido bajo la voz; el Estudio pone como mucho una cada 2,5 s. seco = corte a secas
  transicion: ['seco', 'zoom', 'destello', 'barrido', 'glitch'],
  // Portada estilo Chango (portadas.js): tinte (luz), plano y de qué lado va la persona. Se aprenden con el 👍/👎 de la portada.
  portada_luz: ['calido', 'neutro', 'frio', 'noche'], // tinte de la foto de fondo; «noche» solo si la foto ya es de noche (portadas.js lo resuelve)
  portada_plano: ['lejos', 'medio', 'cerca'],
  portada_lado: ['izq', 'der', 'centro'],
};
const DIMS = Object.keys(OPCIONES);
// «karaoke» era un estilo: ahora es el estilo `recuadro` con el karaoke encendido. Lo guardado con el nombre viejo (aprendizajes, estilos de público, recetas pendientes) vale como `recuadro`.
export const aEstilo = (x) => (x === 'karaoke' ? 'recuadro' : x);
// El karaoke va encendido siempre, salvo que el estilo del público lo apague (estilo.karaoke = ['no']; con ['si'] o ['si','no'] queda encendido).
export const karaokeDe = (estilo) => !(Array.isArray(estilo?.karaoke) && estilo.karaoke.length > 0 && !estilo.karaoke.includes('si'));
// Los tipos de gancho que se reparten entre las 3 versiones de cada momento (para medir cuál rinde): «lo mejor primero» y directo, alternando (2 y 1, o 1 y 2) entre momentos
export const GANCHOS_DE_PRUEBA = ['mejor', 'directo'];
export const GANCHOS_CON_ADELANTO = ['mejor'];
const FACTOR_LARGO = { completo: 1, medio: 0.7, corto: 0.45 };
const POS_PORTADA = { completo: 0.4, medio: 0.25, corto: 0.1 };
const VOLUMEN = 0.25;
export const MIN_LARGO_S = 12, MIN_LARGO_VISUAL_S = 6; // un momento sin habla puede ser de 6 s

// Los aprendizajes llegan vacíos hoy; pueden venir como objeto o como lista de objetos (se juntan, gana el último). Vacío = sin aprendizajes.
export function normalizarAprendizajes(a) {
  const lista = Array.isArray(a) ? a : a && typeof a === 'object' ? [a] : [];
  const out = {};
  for (const o of lista) for (const k of [...DIMS, 'horario', 'karaoke']) if (o && typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim();
  if (out.karaoke && !['con', 'sin'].includes(out.karaoke)) delete out.karaoke; // el karaoke aprendido es con o sin; no es una dimensión de OPCIONES
  // el horario viene por red ({instagram: '20:00'}); no sirve para armar recetas, pero el elector de momentos lo lee
  for (const o of lista) if (o && o.horario && typeof o.horario === 'object' && Object.keys(o.horario).length) out.horario = { ...o.horario };
  if (out.subtitulos) out.subtitulos = aEstilo(out.subtitulos);
  if (out.gancho === 'negro') out.gancho = 'mejor'; // el gancho negro se sacó
  return out;
}

// Estilo de un público: por cada dimensión, qué opciones se permiten (vacío o desconocido = todas).
export function opcionesPermitidas(estilo) {
  const o = {};
  for (const d of DIMS) { const l = Array.isArray(estilo?.[d]) ? [...new Set(estilo[d].map((x) => (d === 'subtitulos' ? aEstilo(x) : x)).filter((x) => OPCIONES[d].includes(x)))] : []; o[d] = l.length ? l : OPCIONES[d]; }
  return o;
}

// qué variables ganadoras sirven para armar recetas (valor permitido; la música acepta cualquier clima si no hay restricción)
function ganadoras(a, O = OPCIONES) {
  const n = normalizarAprendizajes(a), g = {};
  for (const d of DIMS) if (n[d] && (O[d].includes(n[d]) || (d === 'musica' && O[d] === OPCIONES.musica && n[d].length <= 40))) g[d] = n[d];
  return g;
}

// El estilo del público deja apagar el karaoke (estilo.karaoke trae 'no'; con solo ['si'] queda siempre encendido)
const puedeSinKaraoke = (estilo) => !(Array.isArray(estilo?.karaoke) && estilo.karaoke.length > 0 && !estilo.karaoke.includes('no'));
// Las elecciones de las 3 versiones: [{gancho, subtitulos, musica, ritmo, largo, transicion, karaoke, explora}]. `estilo` limita las opciones (el del público del fragmento).
// Karaoke: el del estilo del público; si lo aprendido dice que ganó «sin» y el estilo deja apagarlo, las 2 versiones que siguen a la ganadora van sin karaoke
// y la tercera (la que explora) queda como el estilo manda: no se apaga el karaoke para explorar.
export function elegirVariables({ semilla = 0, aprendizajes, estilo } = {}) {
  const karaoke = karaokeDe(estilo);
  const sin = karaoke && puedeSinKaraoke(estilo) && normalizarAprendizajes(aprendizajes).karaoke === 'sin';
  return elegirEstilos({ semilla, aprendizajes, estilo }).map((v) => ({ ...v, karaoke: sin && !v.explora ? false : karaoke }));
}
function elegirEstilos({ semilla = 0, aprendizajes, estilo } = {}) {
  const O = opcionesPermitidas(estilo);
  const elegir = (d, i) => O[d][((i % O[d].length) + O[d].length) % O[d].length];
  const otroDistinto = (d, actual) => { const o = O[d]; const i = o.indexOf(actual); return o[(i + 1) % o.length]; };
  const s = Math.abs(Math.trunc(semilla)) || 0, g = ganadoras(aprendizajes, O);
  // el karaoke ganador «sin» también cuenta como algo aprendido (hay una ganadora que seguir y una versión que explora)
  const hay = Object.keys(g).length > 0 || (karaokeDe(estilo) && puedeSinKaraoke(estilo) && normalizarAprendizajes(aprendizajes).karaoke === 'sin');
  // sin aprendizajes: cada dimensión rota con su propio desfase, así las 3 difieren y, entre momentos, se reparten parejo
  const rotada = (i) => ({ gancho: elegir('gancho', s + i), subtitulos: elegir('subtitulos', 3 * s + i), musica: elegir('musica', s + i + 1), ritmo: elegir('ritmo', s + i + 1), largo: elegir('largo', s + i + 2), transicion: elegir('transicion', s + i + 3), portada_luz: elegir('portada_luz', s + i), portada_plano: elegir('portada_plano', s + i + 1), portada_lado: elegir('portada_lado', s + i + 2) });
  // el reparto de ganchos es fijo (uno de cada tipo) mientras el estilo del público deje usarlos; los aprendizajes no lo pisan: es lo que se está probando
  const probar = GANCHOS_DE_PRUEBA.every((x) => O.gancho.includes(x));
  const gancho = (i) => (probar ? GANCHOS_DE_PRUEBA[(s + i) % GANCHOS_DE_PRUEBA.length] : undefined);
  const conGancho = (v, i) => (probar ? { ...v, gancho: gancho(i) } : v);
  if (!hay) return [0, 1, 2].map((i) => ({ ...conGancho(rotada(i), i), explora: false }));
  const base = [0, 1].map((i) => ({ ...conGancho({ ...rotada(i), ...g }, i), explora: false }));
  const exp = { ...conGancho(base[0], 2), explora: true };
  // explora: cambia al menos 2 variables respecto de la ganadora (primero las que tienen ganadora)
  let cambios = 0;
  for (const d of [...DIMS.filter((x) => g[x]), ...DIMS.filter((x) => !g[x])]) {
    if (cambios >= 2) break;
    if (d === 'gancho' && probar) continue; // el gancho ya es distinto en las tres
    if (O[d].length < 2) continue; // con una sola opción permitida no hay qué explorar
    exp[d] = otroDistinto(d, base[0][d]); cambios++;
  }
  return [...base, exp];
}

// Los comienzos de frase del momento (tras un punto o una pausa de 0,5 s), para el gancho «adelanto»: el reel nunca arranca a mitad de una frase
function iniciosDeFrase(palabras, momento) {
  const ps = [...palabras].sort((a, b) => a.inicio_s - b.inicio_s);
  return ps.filter((p, i) => p.inicio_s >= momento.inicio_s - 1e-6 && p.fin_s <= momento.fin_s + 0.05 && i > 0 && inicioDeFrase(ps, i)).map((p) => p.inicio_s);
}

// Cuánto hay que dejar de largo (en segundos de edición, a partir de `desde`) para cerrar la idea: el primer fin de frase que llega a `objetivo`.
// Los tramos (tema partido) se cuentan pegados. Sin palabras a la vista devuelve el objetivo tal cual.
function cierreDeIdea(palabras, tramos, desde, objetivo, disp) {
  const ps = [...palabras].sort((a, b) => a.inicio_s - b.inicio_s);
  let acum = 0;
  const fines = [];
  tramos.forEach((t, k) => {
    const ini = k === 0 ? desde : t.inicio_s;
    ps.forEach((p, i) => { if (p.inicio_s >= ini - 1e-6 && p.fin_s <= t.fin_s + 0.05 && finDeFrase(ps, i)) fines.push(acum + (p.fin_s - ini)); });
    acum += t.fin_s - ini;
  });
  const f = fines.find((x) => x >= objetivo - 0.01);
  return f === undefined ? objetivo : Math.min(disp + 0.3, f + 0.5); // con aire: el Estudio saca frases enteras si se pasa por décimas
}

// El texto de un cartel (gancho o portada): de 1 a 3 palabras SEGUIDAS, que se lean como frase. Si Haiku escribió una frase larga, se queda con
// el último tramo corto entre signos (el remate: «Obras un sábado: sin acceso, sin ventas» → «sin ventas»); sacar palabras sueltas daba cosas sin sentido.
export const MAX_PALABRAS_CARTEL = 3;
export function cartelCorto(texto, max = MAX_PALABRAS_CARTEL) {
  const letras = (w) => w.replace(/[^\p{L}\p{N}]/gu, '');
  const pal = (t) => String(t || '').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}¿¡]+|[^\p{L}\p{N}?!]+$/gu, '')).filter((w) => letras(w).length > 0);
  const palabras = pal(texto);
  if (palabras.length <= max) return palabras.join(' ');
  const tramos = String(texto).split(/[:;,.—–|]+|\s-\s/).map(pal).filter((t) => t.length);
  const corto = [...tramos].reverse().find((t) => t.length <= max);
  return corto ? corto.join(' ') : ''; // sin un tramo corto, mejor sin cartel que palabras sueltas sin sentido
}
// Textos de la portada de una versión: línea 2 de 1 a 3 palabras (va enorme) y línea 1 corta. Sin línea 2 propia, vale el cartel de siempre.
export function lineasDePortada(texto = {}, respaldo = '') {
  const linea2 = cartelCorto(texto.portada_linea2) || respaldo;
  const linea1 = String(texto.portada_linea1 || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return { linea1: linea1.toLowerCase() === linea2.toLowerCase() ? '' : linea1, linea2 };
}
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

// Frases COMPLETAS que sirven de adelanto (negro o lo mejor primero): de 1 a 2,6 s de voz, 3 palabras o más, de más adelante del momento (a 3 s o más de su
// arranque, para no oírla dos veces seguidas); si no hay, del crudo cerca del momento (hasta 8 s antes o después). Hasta 12, repartidas por el tramo.
export const FRASE_MIN_S = 1, FRASE_MAX_S = 2.6, MAX_CANDIDATAS = 12;
export function frasesCandidatas(palabras = [], momento = {}) {
  const ps = [...palabras].sort((a, b) => a.inicio_s - b.inicio_s), todas = [];
  let i0 = 0;
  ps.forEach((_, i) => {
    if (!finDeFrase(ps, i)) return;
    const f = ps.slice(i0, i + 1);
    const ok = inicioDeFrase(ps, i0) && f.length >= 3 && f.every((w) => /\S/.test(w.texto));
    const dur = ps[i].fin_s - ps[i0].inicio_s;
    if (ok && dur >= FRASE_MIN_S && dur <= FRASE_MAX_S) todas.push({ desde_s: r3(ps[i0].inicio_s), hasta_s: r3(ps[i].fin_s), texto: f.map((w) => w.texto).join(' ').replace(/[\s.,;:]+$/, '') });
    i0 = i + 1;
  });
  const ini = momento.inicio_s ?? 0, fin = momento.fin_s ?? Infinity;
  const dentro = todas.filter((c) => c.desde_s >= ini + 3 && c.hasta_s <= fin + 0.05);
  const cerca = todas.filter((c) => c.hasta_s > ini - 8 && c.desde_s < fin + 8 && !(c.desde_s >= ini - 0.05 && c.desde_s < ini + 3));
  const lista = dentro.length ? dentro : cerca;
  if (lista.length <= MAX_CANDIDATAS) return lista;
  return Array.from({ length: MAX_CANDIDATAS }, (_, k) => lista[Math.round((k * (lista.length - 1)) / (MAX_CANDIDATAS - 1))]);
}

// La frase de un adelanto: la que eligió Claude (número desde 1 en la lista) si es válida y no la usó otra versión; si no, la más cercana a 2 s de voz
export function elegirFrase(candidatas, eleccion, usadas = []) {
  const libres = candidatas.filter((c) => !usadas.includes(c));
  const pedida = Number.isInteger(Number(eleccion)) && Number(eleccion) >= 1 ? candidatas[Number(eleccion) - 1] : undefined;
  if (pedida && libres.includes(pedida)) return pedida;
  const pool = libres.length ? libres : candidatas;
  return pool.reduce((m, c) => (!m || Math.abs(c.hasta_s - c.desde_s - 2) < Math.abs(m.hasta_s - m.desde_s - 2) ? c : m), undefined);
}

// La marca del proyecto que viaja al Estudio: color de acento y de la letra sobre el recuadro (#RRGGBB) y fuente de los subtítulos. Sin cartel de barrio (Gero, 16/11: «el barrio no tiene que tener un cartel»).
export function marcaParaReceta(marca = {}) {
  const m = {};
  if (/^#[0-9a-fA-F]{6}$/.test(String(marca.acento || ''))) m.acento = marca.acento;
  if (/^#[0-9a-fA-F]{6}$/.test(String(marca.texto || ''))) m.texto = marca.texto; // letra de la palabra sobre el recuadro de acento
  if (marca.fuente === 'bootzy') m.fuente = 'bootzy'; // vacío = la fuente del editor
  return m;
}

export function construirReceta({ v, momento, palabras = [], textos, marca = {}, frase }) {
  // tema partido: el gancho «adelanto» solo puede arrancar dentro del primer tramo; lo disponible es la suma de los tramos
  const tramos = Array.isArray(momento.datos?.tramos) && momento.datos.tramos.length > 1 ? momento.datos.tramos : null;
  const primero = tramos ? tramos[0] : momento;
  let desde = momento.inicio_s;
  if (v.gancho === 'adelanto') {
    const dur = primero.fin_s - primero.inicio_s;
    const cand = iniciosDeFrase(palabras, primero).find((t) => t >= primero.inicio_s + dur * 0.2 && primero.fin_s - t >= 6);
    if (cand !== undefined) desde = cand;
  }
  const disp = tramos ? tramos.reduce((a, t) => a + (t.fin_s - t.inicio_s), 0) - (desde - momento.inicio_s) : momento.fin_s - desde;
  const tope = Number(marca.largo_max_s) >= 6 ? Math.min(90, Number(marca.largo_max_s)) : 90; // el largo máximo del proyecto (ej.: 60 s)
  // nunca menos de 12 s (o el fragmento entero si es más corto): después el Estudio saca los silencios y un reel de 5 s no sirve
  // (un momento visual —sin habla— baja el mínimo a 6 s; el audio real adelante y la música baja la mezcla el Estudio, la receta sigue con el volumen de siempre)
  const minimo = momento.datos?.sin_habla === true ? MIN_LARGO_VISUAL_S : MIN_LARGO_S;
  // el largo nunca es menor que lo necesario para cerrar la idea: el objetivo se estira hasta el próximo fin de frase
  const objetivo = Math.max(Math.min(minimo, disp), disp * FACTOR_LARGO[v.largo]);
  const largo_s = r1(Math.min(tope, Math.max(Math.min(minimo, disp), cierreDeIdea(palabras, tramos || [momento], desde, objetivo, disp))));
  const mr = marcaParaReceta(marca);
  let tipo = v.gancho;
  const gancho = { desde_s: desde };
  const gtxt = cartelCorto(textos.gancho_texto);
  if (GANCHOS_CON_ADELANTO.includes(tipo)) {
    // el reel arranca igual desde el comienzo del momento; la frase de más adelante suena antes. Sin una frase completa que sirva, queda directo.
    // Sin cartel de texto: en negro el texto grande ya es la frase y en «lo mejor primero» el cartel taparía.
    if (frase) { gancho.desde_s = momento.inicio_s; gancho.adelanto = { modo: tipo, desde_s: frase.desde_s, hasta_s: frase.hasta_s }; }
    else tipo = 'directo';
  } else if (tipo !== 'directo' && gtxt) gancho.texto = gtxt;
  return {
    gancho, subtitulos: v.subtitulos, karaoke: v.karaoke !== false,
    musica: v.musica === 'sin' ? null : { clima: v.musica, volumen: VOLUMEN },
    ritmo: v.ritmo, zoom: false, // sin acercamientos automáticos (el equipo de Posse: «se zumea solo»)
    largo_s, portada: { segundo_s: r1(largo_s * POS_PORTADA[v.largo]), texto: cartelCorto(textos.portada_texto) || cartelCorto(momento.datos?.tema) || 'Mirá esto' },
    explora: v.explora,
    ...(Object.keys(mr).length ? { marca: mr } : {}),
    ...(v.transicion ? { transicion: v.transicion } : {}),
    variables: { gancho: tipo, subtitulos: v.subtitulos, musica: v.musica, ritmo: v.ritmo, largo: v.largo, ...(v.transicion ? { transicion: v.transicion } : {}), portada_luz: v.portada_luz, portada_plano: v.portada_plano, portada_lado: v.portada_lado, karaoke: v.karaoke !== false ? 'con' : 'sin' },
    caption: String(textos.caption || '').trim(), hashtags: textos.hashtags,
  };
}

function limpiarHashtags(h) {
  const l = (Array.isArray(h) ? h : String(h || '').split(/\s+/)).map((x) => String(x).trim().replace(/^#*/, '#').replace(/\s+/g, '')).filter((x) => x.length > 1);
  return [...new Set(l.map((x) => x.toLowerCase()))].slice(0, 8).join(' ');
}

// Validación de lo que escribió Claude: tres versiones, captions no vacíos y distintos. Devuelve la lista limpia o lanza.
export function validarTextos(resp) {
  const vs = resp?.versiones;
  if (!Array.isArray(vs) || vs.length < 3) throw new Error('Claude no devolvió las tres versiones de texto');
  const out = vs.slice(0, 3).map((x) => ({ ...x, caption: String(x?.caption || '').trim(), hashtags: limpiarHashtags(x?.hashtags) }));
  if (out.some((x) => !x.caption || !x.hashtags)) throw new Error('Claude devolvió una versión sin caption o sin hashtags');
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');
  if (new Set(out.map((x) => norm(x.caption))).size < 3) throw new Error('Claude devolvió captions repetidos');
  if (new Set(out.map((x) => x.hashtags)).size < 3) throw new Error('Claude devolvió hashtags repetidos');
  return out;
}

// `portadas` (portadas.js) arma el fondo estilo Chango de cada versión; sin él, o si falla, las recetas salen con la portada de siempre.
// `portada`: lo que ACM sabe para eso { territorio, nombre, foto_dirigente, portada_refs }.
export function crearArmarRecetas({ claude, modelo = MODELOS.textos, portadas = null, log = console.log } = {}) {
  return async ({ momento, transcripcion, palabras, aprendizajes, marca = {}, pedidos, ejemplosTextos = [], portada = {} } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    const vars = elegirVariables({ semilla: momento.idx ?? momento.id ?? 0, aprendizajes, estilo: momento.datos?.publico_estilo });
    const tr = Array.isArray(momento.datos?.tramos) && momento.datos.tramos.length > 1 ? momento.datos.tramos : [momento];
    const enMomento = palabras.filter((p) => tr.some((x) => p.fin_s > x.inicio_s && p.inicio_s < x.fin_s));
    const candidatas = vars.some((v) => GANCHOS_CON_ADELANTO.includes(v.gancho)) ? frasesCandidatas(palabras, momento) : [];
    const pedido = { modelo, system: SYSTEM_TEXTOS, herramienta: HERRAMIENTA_TEXTOS, maxTokens: 2000, usuario: usuarioTextos({ momento, texto: enMomento.map((p) => p.texto).join(' ').slice(0, 6000), versiones: vars, pedidos, ejemplos: ejemplosTextos, candidatas }) };
    let textos;
    try { textos = validarTextos(await claude.estructurado(pedido)); }
    catch (e) { if (/^Falta ANTHROPIC/.test(e.message)) throw e; textos = validarTextos(await claude.estructurado(pedido)); } // un reintento
    const usadas = [];
    const recetas = vars.map((v, i) => {
      const frase = GANCHOS_CON_ADELANTO.includes(v.gancho) && candidatas.length ? elegirFrase(candidatas, textos[i].frase_gancho, usadas) : undefined;
      if (frase) usadas.push(frase);
      return construirReceta({ v, momento, palabras, textos: textos[i], marca, frase });
    });
    if (portadas) await conPortadaChango({ portadas, recetas, vars, textos, momento, texto: enMomento.map((p) => p.texto).join(' ').slice(0, 6000), portada, log });
    return recetas;
  };
}

// Suma `portada.chango` a las recetas de un momento. Cualquier falla deja las recetas como estaban y anota el motivo en `portada_motivo`.
async function conPortadaChango({ portadas, recetas, vars, textos, momento, texto, portada, log }) {
  let res;
  try {
    const versiones = recetas.map((r, i) => ({ luz: vars[i].portada_luz, plano: vars[i].portada_plano, lado: vars[i].portada_lado, ...lineasDePortada(textos[i], r.portada.texto) }));
    res = await portadas.porMomento({ momento, texto, versiones, ctx: portada });
  } catch (e) { res = recetas.map(() => ({ motivo: e.message })); }
  recetas.forEach((r, i) => {
    const x = res?.[i];
    if (x?.chango) { r.portada.chango = x.chango; r.variables.portada_luz = x.luz || r.variables.portada_luz; r.variables.portada_plano = x.plano || r.variables.portada_plano; }
    else r.portada_motivo = String(x?.motivo || 'sin respuesta').slice(0, 300);
  });
  const motivos = recetas.map((r, i) => (r.portada.chango ? '' : `v${i + 1}: ${r.portada_motivo}`)).filter(Boolean);
  if (motivos.length) log(`[portadas] momento ${momento.id ?? momento.idx ?? '?'} sin portada chango en ${motivos.length} de ${recetas.length}: ${[...new Set(motivos.map((m) => m.replace(/^v\d+: /, '')))].join(' | ')}`);
}
