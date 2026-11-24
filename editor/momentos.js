// Elegir los momentos de un crudo. Claude propone; el código manda: límites de palabra, 12–90 s, sin solapes, máximo 15 editados.
import { MODELOS } from './claude.js';
import { SYSTEM_MOMENTOS, SYSTEM_VISUAL, HERRAMIENTA_MOMENTOS, herramientaMomentos, usuarioMomentos, mmss } from './prompts.js';
import { normalizarAprendizajes } from './recetas.js';

export const MIN_S = 12, MAX_S = 90, MAX_EDITADOS = 15, TOLERANCIA_S = 0.05;
export const MIN_VISUAL_S = 6, BORDE_S = 0.5, PALABRAS_POR_S_VISUAL = 1 / 3; // menos de 1 palabra cada 3 s = momento visual
const r1 = (x) => Math.round(x * 10) / 10;

// → { validos (ordenados por interés, con los tiempos clavados a la palabra), descartados: [{ momento, motivo }] }
export function validarMomentos(propuestos, palabras, { tolerancia = TOLERANCIA_S, publicos = [], visual = false } = {}) {
  const validos = [], descartados = [];
  const cerca = (a, b) => Math.abs(a - b) <= tolerancia;
  const ordenados = (Array.isArray(propuestos) ? propuestos : []).map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m?.pedido === true) - (a.m?.pedido === true) || (Number(b.m?.interes) || 0) - (Number(a.m?.interes) || 0) || a.i - b.i);
  for (const { m } of ordenados) {
    const descartar = (motivo, causa) => descartados.push({ momento: m, motivo, causa });
    // un tema partido trae «tramos» (2 o 3); si no, es un solo tramo de inicio_s a fin_s
    const pedidos = Array.isArray(m?.tramos) && m.tramos.length >= 2 ? m.tramos.slice(0, 3) : [{ inicio_s: m?.inicio_s, fin_s: m?.fin_s }];
    let falla = null; const tramos = [];
    // con registro visual, el CÓDIGO decide si es visual: menos de 1 palabra cada 3 s dentro del tramo (el campo «visual» de Sonnet es solo un dato)
    let sinHabla = false;
    if (visual && pedidos.length === 1) {
      const ini = Number(m?.inicio_s), fin = Number(m?.fin_s);
      if (m?.inicio_s !== null && m?.fin_s !== null && Number.isFinite(ini) && Number.isFinite(fin) && fin > ini
        && palabras.filter((p) => p.fin_s > ini && p.inicio_s < fin).length < (fin - ini) * PALABRAS_POR_S_VISUAL) {
        sinHabla = true;
        // clavado a una palabra si hay una a ±0,5 s del borde; si no, tiempos redondeados a 0,1 s
        const cercana = (xs, k, x) => xs.filter((p) => Math.abs(p[k] - x) <= BORDE_S).sort((a, b) => Math.abs(a[k] - x) - Math.abs(b[k] - x))[0];
        const a = Math.max(0, cercana(palabras, 'inicio_s', ini)?.inicio_s ?? r1(ini)), b = cercana(palabras, 'fin_s', fin)?.fin_s ?? r1(fin);
        if (b <= a) { descartar('tramo visual sin duración', 'con tiempos inválidos'); continue; }
        tramos.push({ inicio_s: a, fin_s: b });
      }
    }
    for (const tr of sinHabla ? [] : pedidos) {
      const ini = Number(tr?.inicio_s), fin = Number(tr?.fin_s);
      if (!Number.isFinite(ini) || !Number.isFinite(fin) || tr?.inicio_s === null || tr?.fin_s === null) { falla = ['tiempos que no son números', 'con tiempos inválidos']; break; }
      const pIni = palabras.find((p) => cerca(p.inicio_s, ini)), pFin = [...palabras].reverse().find((p) => cerca(p.fin_s, fin));
      if (!pIni) { falla = [`empieza a mitad de palabra (${ini} s)`, 'que cortan una palabra']; break; }
      if (!pFin) { falla = [`termina a mitad de palabra (${fin} s)`, 'que cortan una palabra']; break; }
      if (pFin.fin_s <= pIni.inicio_s || (tramos.length && pIni.inicio_s < tramos.at(-1).fin_s)) { falla = ['tramos desordenados o que se pisan', 'con tramos inválidos']; break; }
      tramos.push({ inicio_s: pIni.inicio_s, fin_s: pFin.fin_s });
    }
    if (falla) { descartar(...falla); continue; }
    const inicio_s = tramos[0].inicio_s, fin_s = tramos.at(-1).fin_s, dur = tramos.reduce((a, t) => a + (t.fin_s - t.inicio_s), 0);
    const minimo = sinHabla ? MIN_VISUAL_S : MIN_S;
    if (dur < minimo) { descartar(`dura ${Math.round(dur * 10) / 10} s, menos de ${minimo}`, 'muy cortos'); continue; }
    if (dur > MAX_S) { descartar(`dura ${Math.round(dur)} s, más de ${MAX_S}`, 'muy largos'); continue; }
    const pisa = (a, b) => a.inicio_s < b.fin_s && b.inicio_s < a.fin_s;
    if (validos.some((v) => (v.tramos || [v]).some((x) => tramos.some((t) => pisa(t, x))))) { descartar('se solapa con otro momento de más interés', 'solapados'); continue; }
    // el público del fragmento: tiene que ser uno del proyecto; viaja con el momento hasta ACM, que lo reparte a las cuentas de ese público
    const pub = publicos.find((x) => x.clave === m.publico);
    if (publicos.length && !pub) { descartar(`sin un público válido («${m.publico ?? ''}»)`, 'sin público'); continue; }
    validos.push({ inicio_s, fin_s, ...(tramos.length > 1 ? { tramos } : {}), tema: String(m.tema || '').trim(), motivo: String(m.motivo || '').trim(), actualidad: m.actualidad === true, interes: Number(m.interes) || 0, visual: m.visual === true, pedido: m.pedido === true, ...(sinHabla ? { sin_habla: true } : {}),
      ...(pub ? { publico: pub.clave, publico_nombre: pub.nombre, publico_desc: pub.descripcion, ...(pub.estilo ? { publico_estilo: pub.estilo } : {}) } : {}) });
  }
  return { validos, descartados };
}

// Devuelve { momentos: [{ inicio_s, fin_s, tema, motivo, actualidad, interes, estado: 'elegido'|'candidato' }], motivo }.
// El corredor guarda todos; edita solo los «elegido» (hasta 15). Sin momentos válidos, `motivo` dice por qué.
export function crearElegirMomentos({ claude, modelo = MODELOS.momentos } = {}) {
  return async ({ palabras, transcripcion, investigacion = [], aprendizajes, publicos = [], pedidos, publicoCrudo = null, visual = null, descripcion = '', buscar = '' } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    const hayRegistro = (visual?.registro?.length || 0) > 0, confirmados = visual?.confirmados || [];
    if (!palabras.length && !hayRegistro) return { momentos: [], motivo: 'El video no tiene habla: no hay momentos para recortar' };
    const resp = await claude.estructurado({
      modelo, system: hayRegistro ? SYSTEM_MOMENTOS + SYSTEM_VISUAL : SYSTEM_MOMENTOS, herramienta: publicos.length ? herramientaMomentos(publicos) : HERRAMIENTA_MOMENTOS,
      usuario: usuarioMomentos({ palabras, investigacion, aprendizajes: normalizarAprendizajes(aprendizajes), publicos, pedidos, publicoCrudo, visual, descripcion, buscar }),
    });
    // «pedido» solo vale si el momento toca un tramo confirmado: lo que no se encontró no se inventa
    const toca = (m, c) => Number(m.inicio_s) < c.hasta_s && c.desde_s < Number(m.fin_s);
    const propuestos = (Array.isArray(resp?.momentos) ? resp.momentos : []).map((m) => ({ ...m, pedido: m?.pedido === true && confirmados.some((c) => toca(m, c)) }));
    const sinConfirmar = (validos, descartados) => confirmados.filter((c) => !validos.some((v) => v.pedido && toca(v, c))).map((c) => {
      const d = descartados.find((x) => x.momento?.pedido && toca(x.momento, c));
      return `Encontramos ${c.que || 'lo pedido'} en ${mmss(c.desde_s)} pero no lo elegimos: ${String(resp?.sin_usar || '').trim() || (d ? `no pasó la validación (${d.motivo})` : 'no quedó entre los momentos elegidos')}.`;
    });
    if (!propuestos.length) return { momentos: [], motivo: 'No encontramos momentos que valgan la pena como recorte en este video', notas: sinConfirmar([], []) };
    const { validos, descartados } = validarMomentos(propuestos, palabras, { publicos, visual: hayRegistro });
    const notas = sinConfirmar(validos, descartados);
    if (!validos.length) {
      const razones = [...new Set(descartados.map((d) => d.causa))].join(', ');
      return { momentos: [], motivo: `Se propusieron ${propuestos.length} momentos pero ninguno sirve (${razones})`, descartados, notas };
    }
    return { momentos: validos.map((m, i) => ({ ...m, estado: i < MAX_EDITADOS ? 'elegido' : 'candidato' })), motivo: '', descartados, notas };
  };
}
