// Elegir los momentos de un crudo. Claude propone; el código manda: límites de palabra, 6–90 s, sin solapes, máximo 15 editados.
import { MODELOS } from './claude.js';
import { SYSTEM_MOMENTOS, HERRAMIENTA_MOMENTOS, usuarioMomentos } from './prompts.js';
import { normalizarAprendizajes } from './recetas.js';

export const MIN_S = 6, MAX_S = 90, MAX_EDITADOS = 15, TOLERANCIA_S = 0.05;

// → { validos (ordenados por interés, con los tiempos clavados a la palabra), descartados: [{ momento, motivo }] }
export function validarMomentos(propuestos, palabras, { tolerancia = TOLERANCIA_S } = {}) {
  const validos = [], descartados = [];
  const cerca = (a, b) => Math.abs(a - b) <= tolerancia;
  const ordenados = (Array.isArray(propuestos) ? propuestos : []).map((m, i) => ({ m, i }))
    .sort((a, b) => (Number(b.m?.interes) || 0) - (Number(a.m?.interes) || 0) || a.i - b.i);
  for (const { m } of ordenados) {
    const descartar = (motivo, causa) => descartados.push({ momento: m, motivo, causa });
    const ini = Number(m?.inicio_s), fin = Number(m?.fin_s);
    if (!Number.isFinite(ini) || !Number.isFinite(fin) || m?.inicio_s === null || m?.fin_s === null) { descartar('tiempos que no son números', 'con tiempos inválidos'); continue; }
    const pIni = palabras.find((p) => cerca(p.inicio_s, ini)), pFin = [...palabras].reverse().find((p) => cerca(p.fin_s, fin));
    if (!pIni) { descartar(`empieza a mitad de palabra (${ini} s)`, 'que cortan una palabra'); continue; }
    if (!pFin) { descartar(`termina a mitad de palabra (${fin} s)`, 'que cortan una palabra'); continue; }
    const inicio_s = pIni.inicio_s, fin_s = pFin.fin_s, dur = fin_s - inicio_s;
    if (dur < MIN_S) { descartar(`dura ${Math.round(dur * 10) / 10} s, menos de ${MIN_S}`, 'muy cortos'); continue; }
    if (dur > MAX_S) { descartar(`dura ${Math.round(dur)} s, más de ${MAX_S}`, 'muy largos'); continue; }
    if (validos.some((v) => inicio_s < v.fin_s && v.inicio_s < fin_s)) { descartar('se solapa con otro momento de más interés', 'solapados'); continue; }
    validos.push({ inicio_s, fin_s, tema: String(m.tema || '').trim(), motivo: String(m.motivo || '').trim(), actualidad: m.actualidad === true, interes: Number(m.interes) || 0 });
  }
  return { validos, descartados };
}

// Devuelve { momentos: [{ inicio_s, fin_s, tema, motivo, actualidad, interes, estado: 'elegido'|'candidato' }], motivo }.
// El corredor guarda todos; edita solo los «elegido» (hasta 15). Sin momentos válidos, `motivo` dice por qué.
export function crearElegirMomentos({ claude, modelo = MODELOS.momentos } = {}) {
  return async ({ palabras, transcripcion, investigacion = [], aprendizajes } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    if (!palabras.length) return { momentos: [], motivo: 'El video no tiene habla: no hay momentos para recortar' };
    const resp = await claude.estructurado({
      modelo, system: SYSTEM_MOMENTOS, herramienta: HERRAMIENTA_MOMENTOS,
      usuario: usuarioMomentos({ palabras, investigacion, aprendizajes: normalizarAprendizajes(aprendizajes) }),
    });
    const propuestos = Array.isArray(resp?.momentos) ? resp.momentos : [];
    if (!propuestos.length) return { momentos: [], motivo: 'No encontramos momentos que valgan la pena como recorte en este video' };
    const { validos, descartados } = validarMomentos(propuestos, palabras);
    if (!validos.length) {
      const razones = [...new Set(descartados.map((d) => d.causa))].join(', ');
      return { momentos: [], motivo: `Se propusieron ${propuestos.length} momentos pero ninguno sirve (${razones})`, descartados };
    }
    return { momentos: validos.map((m, i) => ({ ...m, estado: i < MAX_EDITADOS ? 'elegido' : 'candidato' })), motivo: '', descartados };
  };
}
