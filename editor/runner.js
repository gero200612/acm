// El corredor de trabajos. La tubería es siempre la misma y cada etapa avisa a ACM:
//   transcribiendo → buscando_momentos → editando → revisando → listo   (o sin_momentos / error)
// Las partes con criterio se inyectan (las llenan las tareas siguientes):
//   elegirMomentos({ trabajo, transcripcion, aprendizajes })           → [{ inicio_s, fin_s, estado?, ...datos }]  (o { momentos, motivo }; estado 'candidato' = no se edita)
//   armarRecetas({ trabajo, momento, transcripcion, aprendizajes })    → [receta, ...]  (hasta 3 por momento)
//   revisar({ trabajo, momento, edicion, resultado, tecnica, cuadros, palabras }) → { veredicto: 'aprobado'|'rechazado'|'dudoso', motivo, correccion? }   (el analista)
//        o, el formato viejo, { review: 'pendiente'|'aprobado'|'rechazado', caption?, hashtags?, notas? }
//   Un rechazo se rehace UNA vez con corregirReceta(receta, revisión); si vuelve a rechazarse, se descarta (no se entrega).
// Los de acá abajo son los de relleno: sin momentos, el trabajo termina en 'sin_momentos'.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repo, TERMINALES } from './db.js';
import { corregirReceta as corregirPorDefecto } from './analista.js';

// lo que el Estudio no conoce (su esquema es estricto) se saca antes de mandarle la receta
const META_RECETA = ['explora', 'caption', 'hashtags', 'variables'];
export const paraEstudio = (receta) => Object.fromEntries(Object.entries(receta || {}).filter(([k]) => !META_RECETA.includes(k)));
const paraAcm = (receta) => Object.fromEntries(Object.entries(receta || {}).filter(([k]) => !['caption', 'hashtags'].includes(k)));
export const DIAS_ACTUALIDAD = 3;
const sqliteAIso = (s) => new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));

export const rellenos = {
  elegirMomentos: async () => [],
  armarRecetas: async () => [],
  revisar: async () => ({ review: 'pendiente' }),
};
const MAX_RECETAS = 3;

export function crearRunner({ db, estudio, acm, elegirMomentos = rellenos.elegirMomentos, armarRecetas = rellenos.armarRecetas, revisar = rellenos.revisar, corregirReceta = corregirPorDefecto, publicUrl = '', dir = '', log = console.log } = {}) {
  const R = repo(db);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  let andando = false, parar = false, despertar = null, motivoSinMomentos = '';

  // cada cambio de etapa queda en la base y se le avisa a ACM; si ACM no contesta, el trabajo sigue
  async function etapa(t, estado, detalle = '') {
    R.estado(t.id, estado, detalle);
    try { await acm.estado(t.reel_id, estado, detalle); } catch (e) { log(`[trabajo ${t.id}] no pude avisar «${estado}» a ACM: ${e.message}`); }
  }

  async function transcribir(t) {
    if (t.transcripcion) return t.transcripcion;
    await etapa(t, 'transcribiendo');
    const tr = await estudio.transcribir(t.url, (s) => { if (s.progreso != null) R.estado(t.id, 'transcribiendo', `${Math.round(s.progreso * (s.progreso <= 1 ? 100 : 1))} %`); });
    R.guardarTranscripcion(t.id, tr);
    return tr;
  }

  async function momentos(t, transcripcion, aprendizajes, investigacion = []) {
    let ms = R.momentos(t.id);
    if (ms.length) return ms; // retomado: se reusan (el clip_id no cambia)
    await etapa(t, 'buscando_momentos');
    const res = (await elegirMomentos({ trabajo: t, transcripcion, aprendizajes, investigacion })) || [];
    const elegidos = Array.isArray(res) ? res : res.momentos || [];
    if (!Array.isArray(res) && !elegidos.length && res.motivo) motivoSinMomentos = res.motivo;
    elegidos.forEach((m, i) => {
      const { inicio_s, fin_s, estado, ...datos } = m;
      if (!(Number(fin_s) > Number(inicio_s) && Number(inicio_s) >= 0)) throw new Error(`El momento ${i + 1} tiene tiempos inválidos`);
      R.guardarMomento(t.id, i, `c${t.reel_id}-${i + 1}`, Number(inicio_s), Number(fin_s), datos, estado || 'elegido');
    });
    ms = R.momentos(t.id);
    return ms;
  }

  async function armar(t, ms, transcripcion, aprendizajes) {
    if (R.ediciones(t.id).length) return;
    for (const m of ms.filter((x) => x.estado !== 'candidato')) {
      const recetas = ((await armarRecetas({ trabajo: t, momento: m, transcripcion, aprendizajes })) || []).slice(0, MAX_RECETAS);
      recetas.forEach((r, i) => R.guardarEdicion(t.id, m.id, i, r));
    }
  }

  async function editar(t, ms, transcripcion) {
    for (const e of R.ediciones(t.id).filter((x) => x.estado === 'pendiente')) {
      const m = ms.find((x) => x.id === e.momento_id);
      const palabras = (transcripcion.palabras || []).filter((p) => p.fin_s > m.inicio_s && p.inicio_s < m.fin_s);
      try {
        const res = await estudio.editarRecorte({ url: t.url, palabras, inicio_s: m.inicio_s, fin_s: m.fin_s, receta: paraEstudio(e.receta) });
        const base = crypto.randomUUID();
        const archivo = await estudio.descargar(res.archivo, path.join(dir, `${base}.mp4`));
        const portada = res.portada ? await estudio.descargar(res.portada, path.join(dir, `${base}.jpg`)).catch(() => '') : '';
        R.edicion(e.id, { estado: 'editada', resultado: { ...res, archivo_local: path.basename(archivo), portada_local: portada ? path.basename(portada) : '' } });
      } catch (err) { R.edicion(e.id, { estado: 'fallo', error: err.message }); log(`[trabajo ${t.id}] edición ${e.id} falló: ${err.message}`); }
    }
  }

  const unArchivo = (f) => path.join(dir, f);
  async function cuadrosDe(res) {
    const out = [];
    for (const u of res.cuadros || []) { try { out.push(await estudio.cuadro(u)); } catch (e) { log(`no pude bajar un cuadro: ${e.message}`); } }
    return out;
  }
  // un intento de revisión: devuelve la revisión normalizada {review?, veredicto?, motivo?, ...}
  async function mirar(t, m, e, transcripcion) {
    const r = e.receta || {}, desde = r.gancho?.desde_s ?? m.inicio_s, hasta = Math.min(m.fin_s, desde + (r.largo_s || Infinity));
    const palabras = (transcripcion.palabras || []).filter((p) => p.fin_s > desde && p.inicio_s < hasta);
    return (await revisar({ trabajo: t, momento: m, edicion: e, resultado: e.resultado, tecnica: e.resultado.tecnica, cuadros: await cuadrosDe(e.resultado), palabras })) || { review: 'pendiente' };
  }
  // vuelve a editar con la receta corregida y deja la edición «editada» con el resultado nuevo
  async function rehacer(t, m, e, receta, transcripcion) {
    const palabras = (transcripcion.palabras || []).filter((p) => p.fin_s > m.inicio_s && p.inicio_s < m.fin_s);
    const res = await estudio.editarRecorte({ url: t.url, palabras, inicio_s: m.inicio_s, fin_s: m.fin_s, receta: paraEstudio(receta) });
    const base = crypto.randomUUID();
    const archivo = await estudio.descargar(res.archivo, path.join(dir, `${base}.mp4`));
    const portada = res.portada ? await estudio.descargar(res.portada, path.join(dir, `${base}.jpg`)).catch(() => '') : '';
    for (const f of [e.resultado.archivo_local, e.resultado.portada_local].filter(Boolean)) fs.rm(unArchivo(f), { force: true }, () => {});
    const resultado = { ...res, archivo_local: path.basename(archivo), portada_local: portada ? path.basename(portada) : '' };
    R.edicion(e.id, { receta, resultado });
    return { ...e, receta, resultado };
  }

  async function revisarYEntregar(t, ms, transcripcion) {
    for (let e of R.ediciones(t.id).filter((x) => x.estado === 'editada')) {
      const m = ms.find((x) => x.id === e.momento_id);
      const actual = m.datos.actualidad === true;
      try {
        let rev = await mirar(t, m, e, transcripcion);
        // rechazada: se rehace una vez (si ya se rehízo antes de un corte, ese intento cuenta)
        if (rev.veredicto === 'rechazado') {
          const previos = e.revision?.rechazos || [];
          R.edicion(e.id, { revision: { rechazos: [...previos, rev.motivo || ''] } });
          if (!previos.length) {
            e = await rehacer(t, m, e, corregirReceta(e.receta, rev), transcripcion);
            rev = await mirar(t, m, e, transcripcion);
          }
          if (rev.veredicto === 'rechazado') {
            for (const f of [e.resultado.archivo_local, e.resultado.portada_local].filter(Boolean)) fs.rm(unArchivo(f), { force: true }, () => {});
            R.edicion(e.id, { estado: 'descartada', error: `El analista la rechazó dos veces: ${rev.motivo || ''}`.slice(0, 400), revision: { rechazos: [...previos, rev.motivo || ''], descartada: true } });
            continue;
          }
        }
        const review = rev.veredicto ? (rev.veredicto === 'aprobado' ? 'aprobado' : 'pendiente') : rev.review || 'pendiente'; // dudoso siempre espera a una persona
        const archivos = [e.resultado.archivo_local, e.resultado.portada_local].filter(Boolean).map(unArchivo);
        R.edicion(e.id, { revision: { ...(R.ediciones(t.id).find((x) => x.id === e.id)?.revision || {}), ...rev } });
        await acm.edicion({
          crudo_id: t.reel_id, clip_id: m.clip_id, moment: { inicio_s: m.inicio_s, fin_s: m.fin_s, ...m.datos }, recipe: paraAcm(e.receta),
          edicion_id: e.uuid, caption: rev.caption ?? e.receta?.caption ?? m.datos.caption ?? '', hashtags: rev.hashtags ?? e.receta?.hashtags ?? m.datos.hashtags ?? '',
          file_url: `${publicUrl.replace(/\/+$/, '')}/entregas/${e.resultado.archivo_local}`,
          cover_url: e.resultado.portada_local ? `${publicUrl.replace(/\/+$/, '')}/entregas/${e.resultado.portada_local}` : '',
          duration: e.resultado.duracion_s, review,
          ...(actual ? { expires_at: new Date(sqliteAIso(e.created_at).getTime() + DIAS_ACTUALIDAD * 864e5).toISOString() } : {}),
        });
        R.edicion(e.id, { estado: 'entregada' });
        for (const f of archivos) fs.rm(f, { force: true }, () => {});
      } catch (err) { R.edicion(e.id, { estado: 'fallo', error: err.message }); log(`[trabajo ${t.id}] entrega ${e.id} falló: ${err.message}`); }
    }
  }

  // procesa un trabajo de punta a punta (o desde donde quedó)
  async function procesar(id) {
    let t = R.trabajo(id);
    if (!t || TERMINALES.includes(t.estado)) return t;
    try {
      motivoSinMomentos = '';
      const ctx = acm.contexto ? await acm.contexto(t.aprendizajes_url) : { aprendizajes: (await acm.aprendizajes?.(t.aprendizajes_url)) ?? [] };
      const aprendizajes = ctx.aprendizajes ?? [], investigacion = ctx.investigacion ?? [];
      const transcripcion = await transcribir(t);
      t = R.trabajo(id);
      const ms = await momentos(t, transcripcion, aprendizajes, investigacion);
      if (!ms.length) { await etapa(t, 'sin_momentos', motivoSinMomentos || 'No encontramos momentos para recortar en este video'); return R.trabajo(id); }
      await armar(t, ms, transcripcion, aprendizajes);
      if (!R.ediciones(t.id).length) { await etapa(t, 'sin_momentos', 'Hay momentos pero ninguna receta para editarlos'); return R.trabajo(id); }
      await etapa(t, 'editando', `${R.ediciones(t.id).length} ediciones`);
      await editar(t, ms, transcripcion);
      await etapa(t, 'revisando');
      await revisarYEntregar(t, ms, transcripcion);
      const eds = R.ediciones(t.id), bien = eds.filter((e) => e.estado === 'entregada').length;
      if (!bien) await etapa(t, 'error', `Ninguna de las ${eds.length} ediciones salió: ${eds.find((e) => e.error)?.error || ''}`.slice(0, 400));
      else await etapa(t, 'listo', bien < eds.length ? `${bien} de ${eds.length} ediciones` : `${bien} ediciones`);
    } catch (err) {
      log(`[trabajo ${id}] falló: ${err.message}`);
      await etapa(t, 'error', err.message.slice(0, 400));
    }
    return R.trabajo(id);
  }

  // los trabajos se hacen de a uno; los que quedaron a medias al reiniciar se retoman
  async function vuelta() {
    for (let id; !parar && (id = R.siguiente());) await procesar(id);
  }
  return {
    procesar,
    encolar(datos) { const id = R.crearTrabajo(datos); despertar?.(); return id; },
    trabajo: R.trabajo,
    pendientes: () => R.pendientes(),
    arrancar({ cadaMs = 2000 } = {}) {
      if (andando) return; andando = true; parar = false;
      (async () => {
        while (!parar) {
          await vuelta().catch((e) => log('corredor:', e.message));
          await new Promise((r) => { despertar = r; setTimeout(r, cadaMs); });
        }
        andando = false;
      })();
    },
    detener() { parar = true; despertar?.(); },
  };
}
