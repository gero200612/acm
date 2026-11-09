// Cliente del Estudio (sincro-agents). Cada pedido lleva X-Empresa y Authorization: Bearer.
// transcribir y editarRecorte mandan el trabajo (202 {id}) y esperan con sondeo hasta `listo` o `fallo`.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearEstudio({ url, empresa, clave, intervaloMs = 2000, esperaMaxMs = 6 * 3600e3, fetchFn = fetch } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const headers = (extra = {}) => ({ 'X-Empresa': empresa || '', Authorization: `Bearer ${clave || ''}`, ...extra });
  // la clave del Estudio viaja solo al Estudio: rutas relativas o links absolutos del mismo origen que ESTUDIO_URL; cualquier otro, error
  const origen = (() => { try { return new URL(base).origin; } catch { return ''; } })();
  const resolver = (ruta) => {
    const r = String(ruta || '');
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(r)) {
      let o = ''; try { o = new URL(r).origin; } catch {}
      if (!origen || o !== origen) throw new Error(`El Estudio devolvió un link de otro servidor (${o || 'inválido'}): no se baja con la clave`);
      return r;
    }
    if (!base) throw new Error('Falta ESTUDIO_URL');
    return base + (r.startsWith('/') ? '' : '/') + r;
  };
  const pedir = async (method, ruta, body) => {
    if (!base) throw new Error('Falta ESTUDIO_URL');
    const r = await fetchFn(base + ruta, { method, headers: headers(body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`El Estudio respondió ${r.status} en ${method} ${ruta}`);
    return r.json();
  };
  async function esperar(ruta, alAvanzar) {
    const t0 = Date.now();
    for (;;) {
      const s = await pedir('GET', ruta);
      if (alAvanzar) alAvanzar(s);
      if (s.estado === 'listo') return s.resultado;
      if (s.estado === 'fallo') throw new Error(s.error || 'El Estudio falló sin decir por qué');
      if (Date.now() - t0 > esperaMaxMs) throw new Error('El Estudio tardó demasiado');
      await dormir(intervaloMs);
    }
  }
  return {
    async transcribir(urlVideo, alAvanzar) {
      const { id } = await pedir('POST', '/v1/transcribir', { url: urlVideo });
      return esperar(`/v1/transcribir/${id}`, alAvanzar);
    },
    // pedido: {url, palabras, inicio_s, fin_s, receta}
    async editarRecorte(pedido, alAvanzar) {
      const { id } = await pedir('POST', '/v1/editar-recorte', pedido);
      return esperar(`/v1/editar-recorte/${id}`, alAvanzar);
    },
    // un cuadro (imagen) del Estudio, para que lo mire el analista: {tipo, base64}
    async cuadro(ruta) {
      const r = await fetchFn(resolver(ruta), { headers: headers(), signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`No pudimos bajar el cuadro ${ruta}: ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4 * 1024 * 1024) throw new Error('El cuadro pasa de 4 MB');
      const tipo = buf[0] === 0x89 ? 'image/png' : 'image/jpeg';
      return { tipo, base64: buf.toString('base64') };
    },
    // archivo y portada vienen como rutas del Estudio: se bajan con la misma autenticación
    async descargar(ruta, destino) {
      const r = await fetchFn(resolver(ruta), { headers: headers(), signal: AbortSignal.timeout(30 * 60e3) });
      if (!r.ok || !r.body) throw new Error(`No pudimos bajar ${ruta} del Estudio: ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(destino));
      return destino;
    },
  };
}

// versión con la configuración del entorno
const porDefecto = () => crearEstudio({ url: process.env.ESTUDIO_URL, empresa: process.env.ESTUDIO_EMPRESA, clave: process.env.ESTUDIO_CLAVE });
export const transcribir = (url, f) => porDefecto().transcribir(url, f);
export const editarRecorte = (pedido, f) => porDefecto().editarRecorte(pedido, f);
