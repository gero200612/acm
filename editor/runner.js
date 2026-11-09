// El corredor de trabajos. La tubería es siempre la misma y cada etapa avisa a ACM:
//   transcribiendo → buscando_momentos → editando → revisando → listo   (o sin_momentos / error)
// Las partes con criterio se inyectan (las llenan las tareas siguientes):
//   elegirMomentos({ trabajo, transcripcion, aprendizajes })           → [{ inicio_s, fin_s, ...datos }]
//   armarRecetas({ trabajo, momento, transcripcion, aprendizajes })    → [receta, ...]  (hasta 3 por momento)
//   revisar({ trabajo, momento, edicion, resultado })                  → { review: 'pendiente'|'aprobado'|'rechazado', caption?, hashtags?, notas? }
// Los de acá abajo son los de relleno: sin momentos, el trabajo termina en 'sin_momentos'.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repo, TERMINALES } from './db.js';

export const rellenos = {
  elegirMomentos: async () => [],
  armarRecetas: async () => [],
  revisar: async () => ({ review: 'pendiente' }),
};
const MAX_RECETAS = 3;

export function crearRunner({ db, estudio, acm, elegirMomentos = rellenos.elegirMomentos, armarRecetas = rellenos.armarRecetas, revisar = rellenos.revisar, publicUrl = '', dir = '', log = console.log } = {}) {
  const R = repo(db);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  let andando = false, parar = false, despertar = null;

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

  async function momentos(t, transcripcion, aprendizajes) {
    let ms = R.momentos(t.id);
    if (ms.length) return ms; // retomado: se reusan (el clip_id no cambia)
    await etapa(t, 'buscando_momentos');
    const elegidos = (await elegirMomentos({ trabajo: t, transcripcion, aprendizajes })) || [];
    elegidos.forEach((m, i) => {
      const { inicio_s, fin_s, ...datos } = m;
      if (!(Number(fin_s) > Number(inicio_s) && Number(inicio_s) >= 0)) throw new Error(`El momento ${i + 1} tiene tiempos inválidos`);
      R.guardarMomento(t.id, i, `c${t.reel_id}-${i + 1}`, Number(inicio_s), Number(fin_s), datos);
    });
    ms = R.momentos(t.id);
    return ms;
  }

  async function armar(t, ms, transcripcion, aprendizajes) {
    if (R.ediciones(t.id).length) return;
    for (const m of ms) {
      const recetas = ((await armarRecetas({ trabajo: t, momento: m, transcripcion, aprendizajes })) || []).slice(0, MAX_RECETAS);
      recetas.forEach((r, i) => R.guardarEdicion(t.id, m.id, i, r));
    }
  }

  async function editar(t, ms, transcripcion) {
    for (const e of R.ediciones(t.id).filter((x) => x.estado === 'pendiente')) {
      const m = ms.find((x) => x.id === e.momento_id);
      const palabras = (transcripcion.palabras || []).filter((p) => p.fin_s > m.inicio_s && p.inicio_s < m.fin_s);
      try {
        const res = await estudio.editarRecorte({ url: t.url, palabras, inicio_s: m.inicio_s, fin_s: m.fin_s, receta: e.receta });
        const base = crypto.randomUUID();
        const archivo = await estudio.descargar(res.archivo, path.join(dir, `${base}.mp4`));
        const portada = res.portada ? await estudio.descargar(res.portada, path.join(dir, `${base}.jpg`)).catch(() => '') : '';
        R.edicion(e.id, { estado: 'editada', resultado: { ...res, archivo_local: path.basename(archivo), portada_local: portada ? path.basename(portada) : '' } });
      } catch (err) { R.edicion(e.id, { estado: 'fallo', error: err.message }); log(`[trabajo ${t.id}] edición ${e.id} falló: ${err.message}`); }
    }
  }

  async function revisarYEntregar(t, ms) {
    for (const e of R.ediciones(t.id).filter((x) => x.estado === 'editada')) {
      const m = ms.find((x) => x.id === e.momento_id);
      const archivos = [e.resultado.archivo_local, e.resultado.portada_local].filter(Boolean).map((f) => path.join(dir, f));
      try {
        const rev = (await revisar({ trabajo: t, momento: m, edicion: e, resultado: e.resultado })) || { review: 'pendiente' };
        R.edicion(e.id, { revision: rev });
        await acm.edicion({
          crudo_id: t.reel_id, clip_id: m.clip_id, moment: { inicio_s: m.inicio_s, fin_s: m.fin_s, ...m.datos }, recipe: e.receta,
          edicion_id: e.uuid, caption: rev.caption ?? m.datos.caption ?? '', hashtags: rev.hashtags ?? m.datos.hashtags ?? '',
          file_url: `${publicUrl.replace(/\/+$/, '')}/entregas/${e.resultado.archivo_local}`,
          cover_url: e.resultado.portada_local ? `${publicUrl.replace(/\/+$/, '')}/entregas/${e.resultado.portada_local}` : '',
          duration: e.resultado.duracion_s, review: rev.review || 'pendiente',
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
      const aprendizajes = await acm.aprendizajes?.(t.aprendizajes_url) ?? [];
      const transcripcion = await transcribir(t);
      t = R.trabajo(id);
      const ms = await momentos(t, transcripcion, aprendizajes);
      if (!ms.length) { await etapa(t, 'sin_momentos', 'No encontramos momentos para recortar en este video'); return R.trabajo(id); }
      await armar(t, ms, transcripcion, aprendizajes);
      if (!R.ediciones(t.id).length) { await etapa(t, 'sin_momentos', 'Hay momentos pero ninguna receta para editarlos'); return R.trabajo(id); }
      await etapa(t, 'editando', `${R.ediciones(t.id).length} ediciones`);
      await editar(t, ms, transcripcion);
      await etapa(t, 'revisando');
      await revisarYEntregar(t, ms);
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
