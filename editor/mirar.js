// Mirar el crudo (etapa «mirando»). El Estudio saca los cuadros y los junta en planillas; Haiku las mira en tandas y escribe un
// registro de lo que se ve. Haiku responde con el NÚMERO de cuadro; los segundos los pone el código a partir de tiempos_s.
// Nada de acá tira el trabajo: una tanda que falla es un hueco, y si falla todo se sigue con la transcripción (lo avisa el detalle).
//   registro: [{ desde_s, hasta_s, se_ve, personas, accion, lugar }]  (ordenado, en segundos del video)
//   visual (lo que se guarda con el crudo): { version, cada_s, registro, huecos, planillas, fallo, motivo_fallo, buscar,
//                                              confirmados: [{ desde_s, hasta_s, que, motivo }], descartados: [{ desde_s, hasta_s, motivo }],
//                                              notas_mirar, notas_buscar, notas_momentos, uso: { entrada, salida, llamadas } }
import { MODELOS } from './claude.js';
import { textoCrudo, mmss } from './prompts.js';

export const TANDA = 10; // planillas por pedido a Haiku (16 cuadros cada una; a 2 s, ~5 min de video por pedido)
export const REINTENTOS = 2, MAX_CANDIDATOS = 8, MAX_CANDIDATO_S = 20;
export const CADA_S = 2, CADA_LARGO_S = 4, LARGO_S = 3 * 3600;
const r1 = (x) => Math.round(x * 10) / 10;
const txt = (s) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);

const SYSTEM_REGISTRO = `Mirás un video crudo de calle (una campaña política en Argentina) a partir de planillas de cuadros sacados a intervalos parejos. Cada planilla es una grilla; cada cuadro lleva su número «#n» arriba a la derecha y su tiempo arriba a la izquierda. Describí lo que se ve en tramos: cada tramo va de un número de cuadro a otro DENTRO DE LA MISMA planilla (no cruces de planilla). Cubrí todos los cuadros, con tramos de entre 2 y 8 cuadros; si cambia la escena, cortá. En cada tramo: «se_ve» (la escena, en una frase), «personas» (quiénes y cuántos, por lo que se ve: ropa, edad aproximada, rol; nunca nombres ni reconocimiento de caras), «accion» (qué hacen: camina, saluda, abraza, habla a cámara, entra a un local…) y «lugar». Solo lo que se ve; no inventes. Si algo no se distingue, decilo. Sé literal y no exageres: un apretón de manos o un saludo con la mano NO es un abrazo; describí el gesto que se ve. Si no se distingue bien quién es (varón o mujer, cuántos), decí «una persona» o «varias personas» en vez de adivinar.`;
const HERRAMIENTA_REGISTRO = {
  name: 'registrar_tramos', description: 'Registra los tramos de lo que se ve en las planillas.',
  input_schema: { type: 'object', properties: { tramos: { type: 'array', items: { type: 'object', properties: {
    planilla: { type: 'number', description: 'Número de la planilla en este pedido (1, 2, …)' }, cuadro_desde: { type: 'number' }, cuadro_hasta: { type: 'number' },
    se_ve: { type: 'string' }, personas: { type: 'string' }, accion: { type: 'string' }, lugar: { type: 'string' } },
    required: ['planilla', 'cuadro_desde', 'cuadro_hasta', 'se_ve', 'personas', 'accion', 'lugar'] } } }, required: ['tramos'] },
};

const SYSTEM_CANDIDATOS = `Te paso el registro de lo que se ve en un video (tramos con segundos) y lo que el equipo quiere encontrar adentro. Marcá los tramos que podrían coincidir, de hasta ${MAX_CANDIDATO_S} segundos cada uno y como máximo ${MAX_CANDIDATOS}. Es solo una pista: después se los mira de cerca. Se busca por lo que se ve, nunca por reconocimiento de caras ni por nombres. Si nada podría coincidir, devolvé la lista vacía.`;
const HERRAMIENTA_CANDIDATOS = {
  name: 'registrar_candidatos', description: 'Registra los tramos candidatos.',
  input_schema: { type: 'object', properties: { candidatos: { type: 'array', items: { type: 'object', properties: { desde_s: { type: 'number' }, hasta_s: { type: 'number' }, por_que: { type: 'string' } }, required: ['desde_s', 'hasta_s', 'por_que'] } } }, required: ['candidatos'] },
};

const SYSTEM_CERCA = `Mirás de cerca un tramo corto de un video (cuadros cada medio segundo, en planillas numeradas; cada cuadro lleva su «#n») para confirmar o descartar si ahí pasa lo que el equipo pidió buscar. Confirmá SOLO si se ve claramente en los cuadros; si no se ve, o dudás, descartá y decí qué se ve en cambio. No identifiques a nadie por la cara ni por nombre: «la señora del kiosco» es quien se ve en un kiosco. Si confirmás, indicá en qué planilla y cuadro empieza y termina lo pedido. Lo pedido tiene que verse tal cual: si piden un abrazo, un apretón de manos, un saludo con la mano o una persona que pasa al lado no alcanzan. Ante la duda, descartá: es peor confirmar algo que no está que perderse uno.`;
const POS = { type: 'object', properties: { planilla: { type: 'number' }, cuadro: { type: 'number' } }, required: ['planilla', 'cuadro'] };
const HERRAMIENTA_CERCA = {
  name: 'registrar_confirmacion', description: 'Registra si el tramo coincide con lo pedido.',
  input_schema: { type: 'object', properties: { coincide: { type: 'boolean' }, desde: POS, hasta: POS, que_se_ve: { type: 'string' }, motivo: { type: 'string' } }, required: ['coincide', 'desde', 'hasta', 'que_se_ve', 'motivo'] },
};

const imagen = (c) => ({ type: 'image', source: { type: 'base64', media_type: c.tipo || 'image/jpeg', data: c.base64 } });

// los tramos que devuelve Haiku (por número de cuadro) → registro en segundos; lo inválido se descarta
export function tramosAEstado(resp, planillas, cada) {
  const out = [];
  for (const t of Array.isArray(resp?.tramos) ? resp.tramos : []) {
    const p = planillas[Math.round(Number(t?.planilla)) - 1], n = p?.tiempos_s?.length || 0;
    let a = Math.round(Number(t?.cuadro_desde)), b = Math.round(Number(t?.cuadro_hasta));
    if (!p || !n || !(a >= 1) || !(b >= 1) || a > n) continue;
    if (a > b) [a, b] = [b, a];
    b = Math.min(b, n);
    const hasta = Math.min(p.tiempos_s[b - 1] + cada, Number.isFinite(p.hasta_s) ? Math.max(p.hasta_s, p.tiempos_s[b - 1]) : Infinity);
    out.push({ desde_s: r1(p.tiempos_s[a - 1]), hasta_s: r1(hasta), se_ve: txt(t.se_ve), personas: txt(t.personas), accion: txt(t.accion), lugar: txt(t.lugar) });
  }
  return out.sort((x, y) => x.desde_s - y.desde_s);
}

export const notasDe = (v) => [...(v?.notas_mirar || []), ...(v?.notas_buscar || []), ...(v?.notas_momentos || [])];
const vacio = () => ({ entrada: 0, salida: 0, llamadas: 0 });

export function crearMirar({ claude, estudio, modelo = MODELOS.mirar } = {}) {
  return async function mirarVideo({ trabajo, transcripcion, descripcion = '', buscar = '', previo = null, progreso = () => {} } = {}) {
    const uso = vacio();
    const alUsar = (u) => { uso.entrada += u.entrada || 0; uso.salida += u.salida || 0; uso.llamadas++; };
    // una llamada a Haiku con imágenes: 1 intento + 2 reintentos; null si no sale
    const llamar = async (pedido, imagenes) => {
      for (let i = 0; i <= REINTENTOS; i++) {
        try {
          const cuadros = []; for (const r of imagenes) cuadros.push(await estudio.cuadro(r));
          return await claude.estructurado({ modelo, maxTokens: 4000, esfuerzo: 'low', uso: alUsar, ...pedido(cuadros) });
        } catch (e) { if (/^Falta ANTHROPIC/.test(e.message)) return null; }
      }
      return null;
    };
    const v = previo ? { ...previo, buscar, confirmados: [], descartados: [], notas_buscar: [], notas_momentos: [], uso }
      : { version: 1, cada_s: CADA_S, registro: [], huecos: 0, planillas: 0, fallo: false, motivo_fallo: '', buscar, confirmados: [], descartados: [], notas_mirar: [], notas_buscar: [], notas_momentos: [], uso };

    if (!previo) {
      const dur = Number(transcripcion?.duracion_s) || Number(trabajo?.duracion_s) || 0, cada = dur > LARGO_S ? CADA_LARGO_S : CADA_S;
      v.cada_s = cada;
      let res;
      try { res = await estudio.mirar({ url: trabajo.url, cada_s: cada }, (s) => { if (s.progreso != null) progreso(`${Math.round(s.progreso * (s.progreso <= 1 ? 100 : 1))} %`); }); }
      catch (e) { res = null; v.motivo_fallo = e.message; }
      const planillas = Array.isArray(res?.planillas) ? res.planillas : [];
      v.planillas = planillas.length;
      for (let i = 0; i < planillas.length; i += TANDA) {
        const tanda = planillas.slice(i, i + TANDA);
        progreso(`planillas ${Math.min(i + TANDA, planillas.length)} de ${planillas.length}`);
        const resp = await llamar((cuadros) => ({
          system: SYSTEM_REGISTRO, herramienta: HERRAMIENTA_REGISTRO,
          usuario: [
            ...(descripcion ? [{ type: 'text', text: textoCrudo({ descripcion }) }] : []),
            ...tanda.flatMap((p, k) => [{ type: 'text', text: `Planilla ${k + 1} (${mmss(p.desde_s)} a ${mmss(p.hasta_s)}):` }, imagen(cuadros[k])]),
          ],
        }), tanda.map((p) => p.ruta));
        const tramos = resp ? tramosAEstado(resp, tanda, res.cada_s || cada) : [];
        if (tramos.length) v.registro.push(...tramos); else v.huecos++;
      }
      v.registro.sort((a, b) => a.desde_s - b.desde_s);
      v.fallo = !v.registro.length;
      if (v.fallo) v.notas_mirar.push(`No pudimos mirar el video${v.motivo_fallo ? ` (${v.motivo_fallo})` : ''}: se siguió solo con la transcripción.`.slice(0, 300));
      else if (v.huecos) v.notas_mirar.push(`No pudimos mirar ${v.huecos} de ${Math.ceil(planillas.length / TANDA)} partes del video: el registro visual tiene huecos.`);
    }

    // búsqueda dirigida: Haiku marca candidatos en el registro (solo texto), se miran de cerca y se confirman o descartan
    if (buscar) {
      if (!v.registro.length) v.notas_buscar.push(`No encontramos: ${buscar} (no se pudo mirar el video).`);
      else {
        const cand = await llamar(() => ({
          system: SYSTEM_CANDIDATOS, herramienta: HERRAMIENTA_CANDIDATOS,
          usuario: `${textoCrudo({ buscar })}\n\nRegistro visual:\n${v.registro.map((r) => `${r.desde_s}–${r.hasta_s} | ${r.se_ve} | ${r.personas} | ${r.accion} | ${r.lugar}`).join('\n')}`,
        }), []);
        const candidatos = (Array.isArray(cand?.candidatos) ? cand.candidatos : []).map((c) => ({ desde_s: Math.max(0, Number(c?.desde_s)), hasta_s: Number(c?.hasta_s) }))
          .filter((c) => Number.isFinite(c.desde_s) && Number.isFinite(c.hasta_s) && c.hasta_s > c.desde_s)
          .map((c) => ({ desde_s: r1(c.desde_s), hasta_s: r1(Math.min(c.hasta_s, c.desde_s + MAX_CANDIDATO_S)) })).slice(0, MAX_CANDIDATOS);
        for (const c of candidatos) {
          progreso(`mirando de cerca ${mmss(c.desde_s)}`);
          let cerca = null;
          try { cerca = await estudio.mirar({ url: trabajo.url, desde_s: c.desde_s, hasta_s: c.hasta_s, cada_s: 0.5, ancho: 512 }); } catch { /* sin cuadros: se descarta */ }
          const pl = Array.isArray(cerca?.planillas) ? cerca.planillas : [];
          const r = pl.length ? await llamar((cuadros) => ({
            system: SYSTEM_CERCA, herramienta: HERRAMIENTA_CERCA,
            usuario: [{ type: 'text', text: `${textoCrudo({ buscar })}\n\nTramo ${mmss(c.desde_s)}–${mmss(c.hasta_s)}.` }, ...pl.flatMap((p, k) => [{ type: 'text', text: `Planilla ${k + 1}:` }, imagen(cuadros[k])])],
          }), pl.map((p) => p.ruta)) : null;
          if (!r) { v.descartados.push({ ...c, motivo: 'no se pudo mirar de cerca' }); continue; }
          if (r.coincide !== true) { v.descartados.push({ ...c, motivo: txt(r.motivo) || txt(r.que_se_ve) || 'no se ve lo pedido' }); continue; }
          const en = (pos) => { const p = pl[Math.round(Number(pos?.planilla)) - 1], n = p?.tiempos_s?.length || 0, k = Math.round(Number(pos?.cuadro)); return p && n && k >= 1 ? p.tiempos_s[Math.min(k, n) - 1] : null; };
          let d = en(r.desde), h = en(r.hasta); if (h != null) h += 0.5;
          if (d == null || h == null || !(h > d)) { d = c.desde_s; h = c.hasta_s; }
          v.confirmados.push({ desde_s: r1(Math.max(d, c.desde_s)), hasta_s: r1(Math.min(Math.max(h, d + 1), c.desde_s + MAX_CANDIDATO_S)), que: txt(r.que_se_ve), motivo: txt(r.motivo) });
        }
        if (!v.confirmados.length) v.notas_buscar.push(`No encontramos: ${buscar}${v.descartados.length ? `. Miramos ${v.descartados.length} tramo${v.descartados.length > 1 ? 's' : ''} parecido${v.descartados.length > 1 ? 's' : ''} (${v.descartados.slice(0, 3).map((x) => `${mmss(x.desde_s)}: ${x.motivo}`).join('; ')})` : ' (nada parecido en el registro)'}.`.slice(0, 500));
      }
    }
    return v;
  };
}
