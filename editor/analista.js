import { textoPedidos } from './prompts.js';
// El analista: mira cada edición ya renderizada y dice si sale. Sin fallas técnicas, Sonnet mira entre 6 y 8 cuadros
// y los subtítulos contra lo que se dice. Rechazo = el corredor la rehace UNA vez con la receta corregida (corregirReceta).
//   revisar({ edicion, tecnica, cuadros: [{tipo, base64}], palabras }) → { veredicto: 'aprobado'|'rechazado'|'dudoso', motivo, correccion? }
import { MODELOS } from './claude.js';
import { OPCIONES, aEstilo } from './recetas.js';

const MIN_CUADROS = 6, MAX_CUADROS = 8;

export const SYSTEM_ANALISTA = `Sos el control de calidad de un editor de reels (Instagram, TikTok, Facebook) en Argentina. Te paso cuadros sacados a intervalos parejos de un reel ya editado, con la receta que se usó y las palabras que se dicen. Decidí:
- «aprobado»: se ve y se entiende bien, los subtítulos coinciden con lo que se dice, nada tapado ni cortado, el arranque engancha.
- «rechazado»: un defecto claro (subtítulos que no coinciden con lo dicho, texto ilegible o fuera de lugar, imagen negra o rota, cortes que dejan la frase a medias).
- Algunos cuadros pueden caer justo en una transición de corte (flash blanco, colores corridos o rebanadas, cuadro entrando de costado o un cambio de plano): es intencional y dura unos cuadros; no lo rechaces por eso.
- «dudoso»: no podés asegurarlo con estos cuadros, o es cuestión de gusto. Ante la duda, dudoso: lo decide una persona.
En «motivo» explicá en una frase concreta. Si rechazás, en «correccion» proponé qué cambiar de la receta (solo los campos que ayuden).`;

export const HERRAMIENTA_ANALISTA = {
  name: 'registrar_veredicto',
  description: 'Registra el veredicto sobre la edición.',
  input_schema: {
    type: 'object',
    properties: {
      veredicto: { type: 'string', enum: ['aprobado', 'rechazado', 'dudoso'] },
      motivo: { type: 'string' },
      correccion: {
        type: 'object', description: 'Solo si rechazás: qué cambiar de la receta',
        properties: { subtitulos: { type: 'string', enum: OPCIONES.subtitulos }, quitar_musica: { type: 'boolean' }, quitar_zoom: { type: 'boolean' }, quitar_transicion: { type: 'boolean' } },
      },
    },
    required: ['veredicto', 'motivo'],
  },
};

// de qué reglas técnicas se arregla con qué cambio de receta
const ARREGLO_POR_REGLA = { zona_segura: { subtitulos: 'minimo' }, contraste: { subtitulos: 'placa' }, subtitulos: { subtitulos: 'placa' }, gancho: {}, sonoridad: { quitar_musica: true }, audio_no_mudo: { quitar_musica: true }, vacio: { quitar_zoom: true } };

// hasta 8 cuadros parejos (si hay más); con menos de 6 se mira lo que haya
export function elegirCuadros(cuadros = []) {
  const l = cuadros.filter((c) => c?.base64);
  if (l.length <= MAX_CUADROS) return l;
  return Array.from({ length: MAX_CUADROS }, (_, i) => l[Math.round((i * (l.length - 1)) / (MAX_CUADROS - 1))]);
}

export function resumenReceta(r = {}) {
  const v = r.variables || {};
  return [`gancho: ${v.gancho || (r.gancho?.texto ? 'con texto' : 'directo')}${r.gancho?.texto ? ` («${r.gancho.texto}»)` : ''}`, `subtítulos: ${r.subtitulos}`, `música: ${r.musica?.clima || 'sin'}`, `ritmo: ${r.ritmo}`, `transición: ${r.transicion || 'seco'}`, `karaoke: ${r.karaoke === false ? 'sin' : 'con'}`, `largo: ${r.largo_s} s`].join(' · ');
}

export function crearAnalista({ claude, modelo = MODELOS.analista } = {}) {
  return async function revisar({ edicion, tecnica, cuadros = [], palabras = [], pedidos } = {}) {
    const fallas = tecnica?.fallas || [];
    if (fallas.length) {
      const correccion = fallas.reduce((a, f) => ({ ...a, ...(ARREGLO_POR_REGLA[f.regla] || {}) }), {});
      return { veredicto: 'rechazado', motivo: `Revisión técnica: ${fallas.map((f) => `${f.regla}${f.detalle ? ` (${f.detalle})` : ''}`).join('; ')}`.slice(0, 400), correccion };
    }
    const mira = elegirCuadros(cuadros);
    if (!mira.length) return { veredicto: 'dudoso', motivo: 'No hubo cuadros para mirar: que lo vea una persona' };
    const texto = palabras.map((p) => p.texto).join(' ').slice(0, 4000);
    const usuario = [
      ...mira.map((c) => ({ type: 'image', source: { type: 'base64', media_type: c.tipo || 'image/jpeg', data: c.base64 } })),
      { type: 'text', text: `${mira.length} cuadros del reel, en orden.\nReceta: ${resumenReceta(edicion?.receta)}\nSubtítulo/caption: ${edicion?.receta?.caption || ''}\nLo que se dice: «${texto || '(sin palabras)'}»${textoPedidos(pedidos) ? `\nLo que el equipo ya rechazó o pidió cambiar (si esta edición repite algo de eso, rechazala y decí cuál):\n${textoPedidos(pedidos)}` : ''}` },
    ];
    try {
      const r = await claude.estructurado({ modelo, system: SYSTEM_ANALISTA, usuario, herramienta: HERRAMIENTA_ANALISTA, maxTokens: 1000 });
      const veredicto = ['aprobado', 'rechazado', 'dudoso'].includes(r.veredicto) ? r.veredicto : 'dudoso';
      return { veredicto, motivo: String(r.motivo || '').slice(0, 400), ...(veredicto === 'rechazado' ? { correccion: r.correccion || {} } : {}) };
    } catch (e) { return { veredicto: 'dudoso', motivo: `El analista no pudo mirarla (${e.message}): que lo vea una persona`.slice(0, 400) }; }
  };
}

// La receta corregida para el segundo intento. Siempre cambia algo: si la corrección no cambia nada, rota los subtítulos.
// `estilo`: el del público del fragmento. La corrección no se sale de él: si el analista pide unos subtítulos que ese público no usa,
// se toma el otro permitido (los permitidos de alto contraste primero).
const ALTO_CONTRASTE = ['grande', 'placa', 'frase', 'recuadro', 'chango', 'minimo'];
export function corregirReceta(receta, rev = {}, estilo) {
  receta = { ...receta, subtitulos: aEstilo(receta.subtitulos) };
  const c = rev.correccion || {}, n = { ...receta };
  const delPublico = Array.isArray(estilo?.subtitulos) ? [...new Set(estilo.subtitulos.map(aEstilo).filter((x) => OPCIONES.subtitulos.includes(x)))] : [];
  const permitidos = delPublico.length ? delPublico : OPCIONES.subtitulos;
  const otroPermitido = (actual) => ALTO_CONTRASTE.find((x) => permitidos.includes(x) && x !== actual) || actual;
  if (c.subtitulos && OPCIONES.subtitulos.includes(c.subtitulos)) n.subtitulos = permitidos.includes(c.subtitulos) ? c.subtitulos : otroPermitido(receta.subtitulos);
  if (c.quitar_musica) n.musica = null;
  if (c.quitar_zoom) n.zoom = false;
  if (c.quitar_transicion) n.transicion = 'seco';
  if (JSON.stringify(n) === JSON.stringify(receta)) {
    if (permitidos !== OPCIONES.subtitulos) n.subtitulos = otroPermitido(receta.subtitulos);
    if (JSON.stringify(n) === JSON.stringify(receta)) { const o = permitidos.length > 1 ? permitidos : OPCIONES.subtitulos; n.subtitulos = o[(o.indexOf(receta.subtitulos) + 1) % o.length]; }
  }
  if (n.variables) n.variables = { ...n.variables, subtitulos: n.subtitulos, musica: n.musica ? n.variables.musica : 'sin', ...(n.transicion ? { transicion: n.transicion } : {}) };
  return n;
}
