// Cliente de ACM: avisa en qué etapa va cada crudo y entrega las ediciones. Siempre con Bearer EDITOR_TOKEN.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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
    // lo que ACM sabe del proyecto: lo aprendido (variables ganadoras) y su investigación; si no se puede traer, el trabajo sigue sin eso
    async contexto(urlAprendizajes) {
      if (!urlAprendizajes) return { aprendizajes: [], investigacion: [] };
      try {
        const r = await fetchFn(urlAprendizajes, { headers: { authorization: `Bearer ${token || ''}` }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) return { aprendizajes: [], investigacion: [] };
        const j = await r.json();
        return { aprendizajes: j.aprendizajes || [], investigacion: Array.isArray(j.investigacion) ? j.investigacion : [] };
      } catch { return { aprendizajes: [], investigacion: [] }; }
    },
    async aprendizajes(urlAprendizajes) { return (await this.contexto(urlAprendizajes)).aprendizajes; },
    estado: (reel_id, estado, detalle = '') => post('/api/editor/estado', { reel_id, estado, detalle }),
    // {crudo_id, clip_id, moment, recipe, caption, hashtags, file_url, cover_url, duration, review, expires_at?}
    edicion: (payload) => post('/api/editor/edicion', payload),
  };
}
