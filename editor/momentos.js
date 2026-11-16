// Elegir los momentos de un crudo. Claude propone; el código manda: límites de palabra, 12–90 s, sin solapes, máximo 15 editados.
import { MODELOS } from './claude.js';
import { SYSTEM_MOMENTOS, HERRAMIENTA_MOMENTOS, herramientaMomentos, usuarioMomentos } from './prompts.js';
import { normalizarAprendizajes } from './recetas.js';

export const MIN_S = 12, MAX_S = 90, MAX_EDITADOS = 15, TOLERANCIA_S = 0.05;

// → { validos (ordenados por interés, con los tiempos clavados a la palabra), descartados: [{ momento, motivo }] }
export function validarMomentos(propuestos, palabras, { tolerancia = TOLERANCIA_S, publicos = [] } = {}) {
  const validos = [], descartados = [];
  const cerca = (a, b) => Math.abs(a - b) <= tolerancia;
  const ordenados = (Array.isArray(propuestos) ? propuestos : []).map((m, i) => ({ m, i }))
    .sort((a, b) => (Number(b.m?.interes) || 0) - (Number(a.m?.interes) || 0) || a.i - b.i);
  for (const { m } of ordenados) {
    const descartar = (motivo, causa) => descartados.push({ momento: m, motivo, causa });
    // un tema partido trae «tramos» (2 o 3); si no, es un solo tramo de inicio_s a fin_s
    const pedidos = Array.isArray(m?.tramos) && m.tramos.length >= 2 ? m.tramos.slice(0, 3) : [{ inicio_s: m?.inicio_s, fin_s: m?.fin_s }];
    let falla = null; const tramos = [];
    for (const tr of pedidos) {
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
    if (dur < MIN_S) { descartar(`dura ${Math.round(dur * 10) / 10} s, menos de ${MIN_S}`, 'muy cortos'); continue; }
    if (dur > MAX_S) { descartar(`dura ${Math.round(dur)} s, más de ${MAX_S}`, 'muy largos'); continue; }
    const pisa = (a, b) => a.inicio_s < b.fin_s && b.inicio_s < a.fin_s;
    if (validos.some((v) => (v.tramos || [v]).some((x) => tramos.some((t) => pisa(t, x))))) { descartar('se solapa con otro momento de más interés', 'solapados'); continue; }
    // el público del fragmento: tiene que ser uno del proyecto; viaja con el momento hasta ACM, que lo reparte a las cuentas de ese público
    const pub = publicos.find((x) => x.clave === m.publico);
    if (publicos.length && !pub) { descartar(`sin un público válido («${m.publico ?? ''}»)`, 'sin público'); continue; }
    validos.push({ inicio_s, fin_s, ...(tramos.length > 1 ? { tramos } : {}), tema: String(m.tema || '').trim(), motivo: String(m.motivo || '').trim(), actualidad: m.actualidad === true, interes: Number(m.interes) || 0,
      ...(pub ? { publico: pub.clave, publico_nombre: pub.nombre, publico_desc: pub.descripcion, ...(pub.estilo ? { publico_estilo: pub.estilo } : {}) } : {}) });
  }
  return { validos, descartados };
}

// Devuelve { momentos: [{ inicio_s, fin_s, tema, motivo, actualidad, interes, estado: 'elegido'|'candidato' }], motivo }.
// El corredor guarda todos; edita solo los «elegido» (hasta 15). Sin momentos válidos, `motivo` dice por qué.
export function crearElegirMomentos({ claude, modelo = MODELOS.momentos } = {}) {
  return async ({ palabras, transcripcion, investigacion = [], aprendizajes, publicos = [] } = {}) => {
    palabras = palabras || transcripcion?.palabras || [];
    if (!palabras.length) return { momentos: [], motivo: 'El video no tiene habla: no hay momentos para recortar' };
    const resp = await claude.estructurado({
      modelo, system: SYSTEM_MOMENTOS, herramienta: publicos.length ? herramientaMomentos(publicos) : HERRAMIENTA_MOMENTOS,
      usuario: usuarioMomentos({ palabras, investigacion, aprendizajes: normalizarAprendizajes(aprendizajes), publicos }),
    });
    const propuestos = Array.isArray(resp?.momentos) ? resp.momentos : [];
    if (!propuestos.length) return { momentos: [], motivo: 'No encontramos momentos que valgan la pena como recorte en este video' };
    const { validos, descartados } = validarMomentos(propuestos, palabras, { publicos });
    if (!validos.length) {
      const razones = [...new Set(descartados.map((d) => d.causa))].join(', ');
      return { momentos: [], motivo: `Se propusieron ${propuestos.length} momentos pero ninguno sirve (${razones})`, descartados };
    }
    return { momentos: validos.map((m, i) => ({ ...m, estado: i < MAX_EDITADOS ? 'elegido' : 'candidato' })), motivo: '', descartados };
  };
}
