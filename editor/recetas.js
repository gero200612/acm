// Armar las 3 recetas de un momento. Las variables (gancho, subtítulos, música/ritmo, largo/portada) las decide el código;
// Claude (Haiku) solo escribe los textos: caption, hashtags, texto del gancho y de la portada.
import { MODELOS } from './claude.js';
import { SYSTEM_TEXTOS, HERRAMIENTA_TEXTOS, usuarioTextos } from './prompts.js';

export const OPCIONES = {
  gancho: ['directo', 'pregunta', 'adelanto'],
  subtitulos: ['karaoke', 'placa', 'minimo', 'frase', 'grande'],
  musica: ['energico', 'calido', 'sin'],
  ritmo: ['rapido', 'normal', 'lento'],
  largo: ['completo', 'medio', 'corto'],
};
const DIMS = Object.keys(OPCIONES);
const FACTOR_LARGO = { completo: 1, medio: 0.7, corto: 0.45 };
const POS_PORTADA = { completo: 0.4, medio: 0.25, corto: 0.1 };
const VOLUMEN = 0.25;
export const MIN_LARGO_S = 12, MIN_LARGO_VISUAL_S = 6; // un momento sin habla puede ser de 6 s

// Los aprendizajes llegan vacíos hoy; pueden venir como objeto o como lista de objetos (se juntan, gana el último). Vacío = sin aprendizajes.
export function normalizarAprendizajes(a) {
  const lista = Array.isArray(a) ? a : a && typeof a === 'object' ? [a] : [];
  const out = {};
  for (const o of lista) for (const k of [...DIMS, 'horario']) if (o && typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim();
  // el horario viene por red ({instagram: '20:00'}); no sirve para armar recetas, pero el elector de momentos lo lee
  for (const o of lista) if (o && o.horario && typeof o.horario === 'object' && Object.keys(o.horario).length) out.horario = { ...o.horario };
  return out;
}

// Estilo de un público: por cada dimensión, qué opciones se permiten (vacío o desconocido = todas).
export function opcionesPermitidas(estilo) {
  const o = {};
  for (const d of DIMS) { const l = Array.isArray(estilo?.[d]) ? estilo[d].filter((x) => OPCIONES[d].includes(x)) : []; o[d] = l.length ? l : OPCIONES[d]; }
  return o;
}

// qué variables ganadoras sirven para armar recetas (valor permitido; la música acepta cualquier clima si no hay restricción)
function ganadoras(a, O = OPCIONES) {
  const n = normalizarAprendizajes(a), g = {};
  for (const d of DIMS) if (n[d] && (O[d].includes(n[d]) || (d === 'musica' && O[d] === OPCIONES.musica && n[d].length <= 40))) g[d] = n[d];
  return g;
}

// Las elecciones de las 3 versiones: [{gancho, subtitulos, musica, ritmo, largo, explora}]. `estilo` limita las opciones (el del público del fragmento).
export function elegirVariables({ semilla = 0, aprendizajes, estilo } = {}) {
  const O = opcionesPermitidas(estilo);
  const elegir = (d, i) => O[d][((i % O[d].length) + O[d].length) % O[d].length];
  const otroDistinto = (d, actual) => { const o = O[d]; const i = o.indexOf(actual); return o[(i + 1) % o.length]; };
  const s = Math.abs(Math.trunc(semilla)) || 0, g = ganadoras(aprendizajes, O), hay = Object.keys(g).length > 0;
  // sin aprendizajes: cada dimensión rota con su propio desfase, así las 3 difieren y, entre momentos, se reparten parejo
  const rotada = (i) => ({ gancho: elegir('gancho', s + i), subtitulos: elegir('subtitulos', 2 * s + i), musica: elegir('musica', s + i + 1), ritmo: elegir('ritmo', s + i + 1), largo: elegir('largo', s + i + 2) });
  if (!hay) return [0, 1, 2].map((i) => ({ ...rotada(i), explora: false }));
  const base = [0, 1].map((i) => ({ ...rotada(i), ...g, explora: false }));
  const exp = { ...base[0], explora: true };
  // explora: cambia al menos 2 variables respecto de la ganadora (primero las que tienen ganadora)
  let cambios = 0;
  for (const d of [...DIMS.filter((x) => g[x]), ...DIMS.filter((x) => !g[x])]) {
    if (cambios >= 2) break;
    if (O[d].length < 2) continue; // con una sola opción permitida no hay qué explorar
    exp[d] = otroDistinto(d, base[0][d]); cambios++;
  }
  return [...base, exp];
}

// Los inicios de oración del momento (palabras tras una pausa o un punto), para el gancho «adelanto»
function iniciosDeFrase(palabras, momento, pausa = 0.5) {
  const ps = palabras.filter((p) => p.inicio_s >= momento.inicio_s && p.fin_s <= momento.fin_s + 0.05);
  return ps.filter((p, i) => i > 0 && (p.inicio_s - ps[i - 1].fin_s >= pausa || /[.?!]$/.test(ps[i - 1].texto))).map((p) => p.inicio_s);
}
const r1 = (x) => Math.round(x * 10) / 10;

// La marca del proyecto que viaja al Estudio: color de acento (#RRGGBB). Sin cartel de barrio (Gero, 16/11: «el barrio no tiene que tener un cartel»).
export function marcaParaReceta(marca = {}) {
  const m = {};
  if (/^#[0-9a-fA-F]{6}$/.test(String(marca.acento || ''))) m.acento = marca.acento;
  return m;
}

export function construirReceta({ v, momento, palabras = [], textos, marca = {} }) {
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
  const largo_s = r1(Math.min(tope, Math.max(Math.min(minimo, disp), disp * FACTOR_LARGO[v.largo])));
  const mr = marcaParaReceta(marca);
  const gancho = { desde_s: desde };
  const gtxt = String(textos.gancho_texto || '').trim().slice(0, 60);
  if (v.gancho !== 'directo' && gtxt) gancho.texto = gtxt;
  return {
    gancho, subtitulos: v.subtitulos,
    musica: v.musica === 'sin' ? null : { clima: v.musica, volumen: VOLUMEN },
    ritmo: v.ritmo, zoom: v.ritmo === 'rapido',
    largo_s, portada: { segundo_s: r1(largo_s * POS_PORTADA[v.largo]), texto: String(textos.portada_texto || '').trim().slice(0, 40) || String(momento.datos?.tema || 'Mirá esto').slice(0, 40) },
    explora: v.explora,
    ...(Object.keys(mr).length ? { marca: mr } : {}),
    variables: { gancho: v.gancho, subtitulos: v.subtitulos, musica: v.musica, ritmo: v.ritmo, largo: v.largo },
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

export function crearArmarRecetas({ claude, modelo = MODELOS.textos } = {}) {
  return async ({ momento, transcripcion, palabras, aprendizajes, marca = {}, pedidos, ejemplosTextos = [] } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    const vars = elegirVariables({ semilla: momento.idx ?? momento.id ?? 0, aprendizajes, estilo: momento.datos?.publico_estilo });
    const tr = Array.isArray(momento.datos?.tramos) && momento.datos.tramos.length > 1 ? momento.datos.tramos : [momento];
    const enMomento = palabras.filter((p) => tr.some((x) => p.fin_s > x.inicio_s && p.inicio_s < x.fin_s));
    const pedido = { modelo, system: SYSTEM_TEXTOS, herramienta: HERRAMIENTA_TEXTOS, maxTokens: 2000, usuario: usuarioTextos({ momento, texto: enMomento.map((p) => p.texto).join(' ').slice(0, 6000), versiones: vars, pedidos, ejemplos: ejemplosTextos }) };
    let textos;
    try { textos = validarTextos(await claude.estructurado(pedido)); }
    catch (e) { if (/^Falta ANTHROPIC/.test(e.message)) throw e; textos = validarTextos(await claude.estructurado(pedido)); } // un reintento
    return vars.map((v, i) => construirReceta({ v, momento, palabras, textos: textos[i], marca }));
  };
}
