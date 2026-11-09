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

// Los aprendizajes llegan vacíos hoy; pueden venir como objeto o como lista de objetos (se juntan, gana el último). Vacío = sin aprendizajes.
export function normalizarAprendizajes(a) {
  const lista = Array.isArray(a) ? a : a && typeof a === 'object' ? [a] : [];
  const out = {};
  for (const o of lista) for (const k of [...DIMS, 'horario']) if (o && typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim();
  return out;
}

// qué variables ganadoras sirven para armar recetas (valor conocido; la música acepta cualquier clima)
function ganadoras(a) {
  const n = normalizarAprendizajes(a), g = {};
  for (const d of DIMS) if (n[d] && (OPCIONES[d].includes(n[d]) || (d === 'musica' && n[d].length <= 40))) g[d] = n[d];
  return g;
}

const elegir = (d, i) => OPCIONES[d][((i % OPCIONES[d].length) + OPCIONES[d].length) % OPCIONES[d].length];
const otroDistinto = (d, actual) => { const o = OPCIONES[d]; const i = o.indexOf(actual); return o[(i + 1) % o.length]; };

// Las elecciones de las 3 versiones: [{gancho, subtitulos, musica, ritmo, largo, explora}]
export function elegirVariables({ semilla = 0, aprendizajes } = {}) {
  const s = Math.abs(Math.trunc(semilla)) || 0, g = ganadoras(aprendizajes), hay = Object.keys(g).length > 0;
  // sin aprendizajes: cada dimensión rota con su propio desfase, así las 3 difieren y, entre momentos, se reparten parejo
  const rotada = (i) => ({ gancho: elegir('gancho', s + i), subtitulos: elegir('subtitulos', 2 * s + i), musica: elegir('musica', s + i + 1), ritmo: elegir('ritmo', s + i + 1), largo: elegir('largo', s + i + 2) });
  if (!hay) return [0, 1, 2].map((i) => ({ ...rotada(i), explora: false }));
  const base = [0, 1].map((i) => ({ ...rotada(i), ...g, explora: false }));
  const exp = { ...base[0], explora: true };
  // explora: cambia al menos 2 variables respecto de la ganadora (primero las que tienen ganadora)
  let cambios = 0;
  for (const d of [...DIMS.filter((x) => g[x]), ...DIMS.filter((x) => !g[x])]) {
    if (cambios >= 2) break;
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

export function construirReceta({ v, momento, palabras = [], textos }) {
  let desde = momento.inicio_s;
  if (v.gancho === 'adelanto') {
    const dur = momento.fin_s - momento.inicio_s;
    const cand = iniciosDeFrase(palabras, momento).find((t) => t >= momento.inicio_s + dur * 0.2 && momento.fin_s - t >= 6);
    if (cand !== undefined) desde = cand;
  }
  const disp = momento.fin_s - desde;
  const largo_s = r1(Math.min(90, Math.max(Math.min(6, disp), disp * FACTOR_LARGO[v.largo])));
  const gancho = { desde_s: desde };
  const gtxt = String(textos.gancho_texto || '').trim().slice(0, 60);
  if (v.gancho !== 'directo' && gtxt) gancho.texto = gtxt;
  return {
    gancho, subtitulos: v.subtitulos,
    musica: v.musica === 'sin' ? null : { clima: v.musica, volumen: VOLUMEN },
    ritmo: v.ritmo, zoom: v.ritmo === 'rapido',
    largo_s, portada: { segundo_s: r1(largo_s * POS_PORTADA[v.largo]), texto: String(textos.portada_texto || '').trim().slice(0, 40) || String(momento.datos?.tema || 'Mirá esto').slice(0, 40) },
    explora: v.explora,
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
  return async ({ momento, transcripcion, palabras, aprendizajes } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    const vars = elegirVariables({ semilla: momento.idx ?? momento.id ?? 0, aprendizajes });
    const enMomento = palabras.filter((p) => p.fin_s > momento.inicio_s && p.inicio_s < momento.fin_s);
    const pedido = { modelo, system: SYSTEM_TEXTOS, herramienta: HERRAMIENTA_TEXTOS, maxTokens: 2000, usuario: usuarioTextos({ momento, texto: enMomento.map((p) => p.texto).join(' ').slice(0, 6000), versiones: vars }) };
    let textos;
    try { textos = validarTextos(await claude.estructurado(pedido)); }
    catch (e) { if (/^Falta ANTHROPIC/.test(e.message)) throw e; textos = validarTextos(await claude.estructurado(pedido)); } // un reintento
    return vars.map((v, i) => construirReceta({ v, momento, palabras, textos: textos[i] }));
  };
}
