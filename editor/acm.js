// Cliente de ACM: avisa en qué etapa va cada crudo y entrega las ediciones. Siempre con Bearer EDITOR_TOKEN.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Lo que la investigación dice del lugar (distrito, municipio, barrios), recortado: sirve para deducir el territorio de las portadas
const LUGAR_RE = /distrito|municipio|partido|barrio|localidad|ciudad|intendente|concejal|territorio|provincia|zona/i;
export function resumenLugar(inv, max = 1500) {
  const l = (Array.isArray(inv) ? inv : []).map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let out = '';
  for (const x of [...l.filter((y) => LUGAR_RE.test(y)), ...l.filter((y) => !LUGAR_RE.test(y))]) { if (out.length + x.length + 1 > max) { if (!out) out = x.slice(0, max); break; } out += `${out ? '\n' : ''}${x}`; }
  return out;
}

export function crearAcm({ url, token, reintentos = 3, esperaMs = 1000, fetchFn = fetch } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  async function post(ruta, body) {
    if (!base) throw new Error('Falta ACM_URL');
    let ultimo;
    for (let i = 0; i < reintentos; i++) {
      try {
        const r = await fetchFn(base + ruta, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token || ''}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30 * 60e3) });
        if (r.ok) return r.json();
        ultimo = new Error(`ACM respondió ${r.status} en ${ruta}: ${(await r.text()).slice(0, 200)}`);
        if (r.status < 500) throw Object.assign(ultimo, { definitivo: true }); // un 4xx no se arregla reintentando
      } catch (e) { if (e.definitivo) throw e; ultimo = e; }
      await dormir(esperaMs * (i + 1));
    }
    throw ultimo;
  }
  return {
    // lo que ACM sabe del proyecto: lo aprendido (variables ganadoras) y su investigación; si no se puede traer, el trabajo sigue sin eso.
    // El link se arma siempre con ACM_URL (nunca con uno que llegue en el trabajo): el EDITOR_TOKEN solo viaja a ACM.
    async contexto(projectId, crudoId) {
      const pid = Number(projectId);
      if (!base || !(pid > 0)) return { aprendizajes: [], investigacion: [] };
      try {
        const r = await fetchFn(`${base}/api/editor/aprendizajes/${pid}${Number(crudoId) > 0 ? `?crudo=${Number(crudoId)}` : ''}`, { headers: { authorization: `Bearer ${token || ''}` }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) return { aprendizajes: [], investigacion: [] };
        const j = await r.json();
        return { aprendizajes: j.aprendizajes || [], investigacion: Array.isArray(j.investigacion) ? j.investigacion : [], publicos: Array.isArray(j.publicos) ? j.publicos : [], marca: j.marca && typeof j.marca === 'object' ? j.marca : {}, porPublico: j.por_publico && typeof j.por_publico === 'object' ? j.por_publico : {},
          // lo que el equipo pidió (comentarios en un segundo y motivos de rechazo) y cómo escribe el dirigente
          pedidos: j.pedidos && typeof j.pedidos === 'object' ? j.pedidos : { comentarios: [], rechazos: [] }, ejemplosTextos: Array.isArray(j.ejemplos_textos) ? j.ejemplos_textos : [],
          publicoCrudo: j.publico_crudo && typeof j.publico_crudo === 'object' ? j.publico_crudo : null,
          // lo que el equipo escribió al subir el crudo: de qué es y qué buscar adentro
          // para las portadas estilo Chango: territorio, nombre del proyecto, foto del dirigente y banco de fotos de referencia
          portada: { territorio: typeof j.territorio === 'string' ? j.territorio : '', nombre: typeof j.nombre === 'string' ? j.nombre : '', foto_dirigente: typeof j.foto_dirigente === 'string' ? j.foto_dirigente : '', portada_refs: Array.isArray(j.portada_refs) ? j.portada_refs : [],
            logo: typeof j.logo === 'string' ? j.logo : '', barrio: typeof j.marca?.etiqueta === 'string' ? j.marca.etiqueta : '', investigacion: resumenLugar(j.investigacion) },
          descripcion: typeof j.descripcion === 'string' ? j.descripcion : '', buscar: typeof j.buscar === 'string' ? j.buscar : '' };
      } catch { return { aprendizajes: [], investigacion: [] }; }
    },
    async aprendizajes(projectId) { return (await this.contexto(projectId)).aprendizajes; },
    estado: (reel_id, estado, detalle = '') => post('/api/editor/estado', { reel_id, estado, detalle }),
    // {crudo_id, clip_id, moment, recipe, caption, hashtags, file_url, cover_url, duration, review, expires_at?}
    edicion: (payload) => post('/api/editor/edicion', payload),
    // un rehacer pedido por una persona no salió: ACM lo muestra con el motivo
    rehecho: (payload) => post('/api/editor/rehecho', payload),
  };
}
