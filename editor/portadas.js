// Portadas estilo Chango: por cada momento, el fondo de las 3 versiones.
//   1. Claude decide qué mostrar atrás (un lugar o una escena del territorio) y qué buscar.
//   2. Se buscan fotos en Wikimedia Commons (y en Brave Images si hay BRAVE_API_KEY); primero las del banco del proyecto que gustaron.
//   3. Claude con visión elige 3 usables TAL CUAL como fondo vertical (y dice si son de día o de noche).
//   4. El fondo ES la foto real (se baja, se guarda en el banco de fondos y se sirve desde el editor). El Estudio la recorta a 9:16, la desenfoca y le pone el tinte de portada_luz.
//   Con PORTADA_FONDO_IA=1 (apagado por defecto) el camino viejo: fal redibuja la foto como escena 9:16 según portada_luz / portada_plano.
// Todo lo que falla acá deja a la versión sin `portada.chango` (sale la portada de hoy) y se registra el motivo: la portada nunca frena una edición.
import { MODELOS } from './claude.js';

export const MODELO_FAL = 'bytedance/seedream/v5.5/edit';
const UA = 'ACM-Editor/1.0 (portadas; contacto por el proyecto)';
const MAX_CANDIDATAS = 12, MAX_REFS_BANCO = 4, MAX_BYTES = 5 * 1024 * 1024;

// portada_luz es un tinte: calido | neutro | frio | noche (noche solo si la foto ya es de noche). En el camino de IA, además, la luz del fondo generado.
const LUZ = {
  calido: 'warm golden hour light, cinematic',
  neutro: 'bright clear daylight, blue sky, natural colors',
  frio: 'blue hour dusk, deep blue sky with the first warm lights glowing',
  noche: 'night scene lit by warm street and building lights, dark blue sky',
};
const DIURNAS = ['calido', 'neutro', 'frio'];
export const MIN_LADO_CORTO = 900; // px: al recortar a 9:16 la foto se estira a pantalla de celular
const PLANO = {
  lejos: 'Wide shot: show the whole place with some of its surroundings.',
  medio: 'Medium shot: the main part of the place fills the frame.',
  cerca: 'Close-up on one characteristic detail of the place.',
};

export const normLugar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const mismoLugar = (a, b) => { a = normLugar(a); b = normLugar(b); return a.length > 0 && b.length > 0 && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))); };

export const HERRAMIENTA_DECIDIR = {
  name: 'decidir_portada',
  description: 'Qué mostrar de fondo en la portada y qué buscar para encontrar fotos reales.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['lugar', 'escena', 'ninguno'], description: 'lugar: se nombra o es claro un lugar concreto; escena: el tema no es un lugar y se representa con una escena del territorio; ninguno: no se puede mostrar nada sin inventar' },
      lugar: { type: 'string', description: 'Nombre del lugar o de la escena, corto (ej.: «Catedral de San Isidro», «patrullero en calle arbolada de Boulogne»)' },
      escena: { type: 'string', description: 'En inglés, una frase: qué se ve en el fondo' },
      consultas: { type: 'array', items: { type: 'string' }, description: 'De 2 a 4 búsquedas de fotos, de la más específica a la más general, con el nombre del lugar y la ciudad/país' },
    },
    required: ['tipo', 'lugar', 'escena', 'consultas'],
  },
};
const SYSTEM_DECIDIR = `Sos editor visual de reels de un dirigente político argentino. Para la portada hace falta una foto REAL de fondo: del lugar del que se habla o, si el tema no es un lugar (seguridad, impuestos, tránsito), de una escena del territorio que lo represente. No inventes lugares: si el momento no nombra ni insinúa un lugar y no hay territorio, devolvé tipo «ninguno». Las consultas deben incluir la ciudad o el país para no confundir homónimos (por ejemplo «San Isidro» existe en otros países).`;

export const HERRAMIENTA_ELEGIR = {
  name: 'elegir_fotos_portada',
  description: 'Las fotos elegidas (hasta 3), por número.',
  input_schema: {
    type: 'object',
    properties: { elegidas: { type: 'array', items: { type: 'object', properties: { foto: { type: 'integer' }, motivo: { type: 'string' }, momento_del_dia: { type: 'string', enum: ['dia', 'noche'], description: 'noche solo si la foto ya es de noche (cielo oscuro, luces prendidas)' } }, required: ['foto', 'motivo', 'momento_del_dia'] } } },
    required: ['elegidas'],
  },
};
const SYSTEM_ELEGIR = `Elegís fotos reales para usar TAL CUAL de fondo de una portada vertical: el Estudio recorta el centro de la foto a 9:16 y pone a una persona recortada adelante, con la cabeza en el centro. Elegí hasta 3 que muestren el lugar pedido desde ángulos o encuadres DISTINTOS (no tres casi iguales) y que sirvan así: al recortar el centro a 9:16 no deben quedar gente, autos ni carteles o texto en primer plano, ni un objeto fino (mástil, poste, farol) justo en el centro donde va la cabeza. Descartá también marcas de agua, logos, baja calidad o fotos que NO sean ese lugar (ojo con homónimos de otros países). Las marcadas «gustó» tienen prioridad si cumplen todo lo demás. Para cada elegida decí si es de día o de noche (noche solo si ya lo es). Si ninguna sirve, devolvé la lista vacía.`;

// --- fuentes de fotos ---
const sinHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export async function buscarWikimedia(consulta, { fetchFn = fetch, limite = 15 } = {}) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ action: 'query', format: 'json', generator: 'search', gsrsearch: consulta, gsrnamespace: 6, gsrlimit: limite, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 2000 })) u.searchParams.set(k, v);
  const r = await fetchFn(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Wikimedia respondió ${r.status}`);
  const pages = Object.values((await r.json())?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const out = [];
  for (const p of pages) {
    const i = p.imageinfo?.[0];
    if (!i || !/^image\/(jpeg|png|webp)$/.test(i.mime || '') || Math.min(i.thumbwidth || i.width || 0, i.thumbheight || i.height || 0) < MIN_LADO_CORTO) continue;
    const m = i.extmetadata || {};
    out.push({ imagen_url: i.thumburl || i.url, pagina_url: i.descriptionurl || '', fuente: 'Wikimedia Commons', licencia: sinHtml(m.LicenseShortName?.value), autor: sinHtml(m.Artist?.value).slice(0, 80), titulo: String(p.title || '').replace(/^File:/, '') });
  }
  return out;
}

export async function buscarBrave(consulta, { fetchFn = fetch, clave, limite = 15 } = {}) {
  const u = new URL('https://api.search.brave.com/res/v1/images/search');
  u.searchParams.set('q', consulta); u.searchParams.set('count', limite); u.searchParams.set('safesearch', 'strict');
  const r = await fetchFn(u, { headers: { 'x-subscription-token': clave, accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Brave respondió ${r.status}`);
  return ((await r.json())?.results || []).filter((x) => x.thumbnail?.src).map((x) => ({
    imagen_url: x.thumbnail.src, pagina_url: x.url || '', fuente: x.source ? `Web: ${x.source}` : 'Web (Brave)', licencia: '', autor: '', titulo: x.title || '' }));
}

const tipoDeImagen = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : '');

// ancho y alto de un JPEG, PNG o WEBP sin dependencias (null si no se puede leer)
export function dimensiones(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { ancho: b.readUInt16BE(i + 7), alto: b.readUInt16BE(i + 5) };
        i += m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 ? 2 : 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    const f = b.toString('latin1', 12, 16);
    if (f === 'VP8X') return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8 ') return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const v = b.readUInt32LE(21); return { ancho: 1 + (v & 0x3fff), alto: 1 + ((v >> 14) & 0x3fff) }; }
  } catch { /* sin medidas */ }
  return null;
}
const extDe = (tipo) => ({ 'image/png': 'png', 'image/webp': 'webp' })[tipo] || 'jpg';

// Solo se bajan imágenes por https de hosts conocidos (nada que apunte a la red interna): Wikimedia y, de Brave, SOLO su miniatura proxeada (nunca la imagen del sitio).
// Un host que empieza con «.» vale también para sus subdominios.
export const HOSTS_FOTO = ['upload.wikimedia.org', 'commons.wikimedia.org', 'imgs.search.brave.com'];
export const HOSTS_FAL = ['.fal.media'];
export function urlPermitida(url, hosts = HOSTS_FOTO) {
  try {
    const x = new URL(String(url));
    return x.protocol === 'https:' && !x.username && !x.password && hosts.some((h) => (h.startsWith('.') ? x.hostname === h.slice(1) || x.hostname.endsWith(h) : x.hostname === h));
  } catch { return false; }
}
// Baja una imagen sin seguir redirecciones y cortando apenas se pasa de `max` bytes (por Content-Length o leyendo el stream).
export async function bajar(url, fetchFn, { hosts = HOSTS_FOTO, max = MAX_BYTES } = {}) {
  if (!urlPermitida(url, hosts)) throw new Error('URL no permitida');
  const r = await fetchFn(url, { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (r.status >= 300 && r.status < 400) throw new Error('redirección no permitida');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (Number(r.headers.get('content-length')) > max) throw new Error('imagen demasiado grande');
  const partes = []; let total = 0;
  if (r.body) {
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > max) { await lector.cancel().catch(() => {}); throw new Error('imagen demasiado grande'); }
      partes.push(Buffer.from(value));
    }
  } else { const b = Buffer.from(await r.arrayBuffer()); if (b.length > max) throw new Error('imagen demasiado grande'); partes.push(b); }
  const b = Buffer.concat(partes), tipo = tipoDeImagen(b);
  if (!tipo) throw new Error('no es una imagen usable');
  return { bytes: b, tipo };
}

// --- el módulo ---
export function crearPortadas({ claude, fetchFn = fetch, env = process.env, log = console.log, modelo = MODELOS.portadas, banco = null } = {}) {
  const modeloFal = () => env.PORTADA_MODELO || MODELO_FAL;

  async function decidir({ momento, texto, territorio }) {
    const usuario = `Tema del momento: «${momento.datos?.tema || ''}». ${momento.datos?.motivo ? `Por qué funciona: ${momento.datos.motivo}.` : ''}\nTerritorio del proyecto: ${territorio || '(no cargado)'}\n\nLo que se dice:\n${texto || '(casi sin habla)'}`;
    const d = await claude.estructurado({ modelo, system: SYSTEM_DECIDIR, usuario, herramienta: HERRAMIENTA_DECIDIR, maxTokens: 1000, esfuerzo: 'low' });
    const consultas = (Array.isArray(d.consultas) ? d.consultas : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 4);
    const lugar = String(d.lugar || '').trim();
    if (d.tipo === 'ninguno' || !lugar || !consultas.length) return { motivo: 'no hay un lugar ni una escena que mostrar sin inventar' };
    if (d.tipo !== 'lugar' && !territorio) return { motivo: 'el tema no es un lugar y el proyecto no tiene territorio cargado' };
    return { lugar, escena: String(d.escena || '').trim(), consultas, tipo: d.tipo };
  }

  async function candidatas({ lugar, consultas, refs }) {
    const bloqueadas = new Set(), previas = [];
    for (const r of Array.isArray(refs) ? refs : []) {
      if (!r?.imagen_url || !mismoLugar(r.lugar, lugar) || !urlPermitida(r.imagen_url)) continue; // las del banco también pasan por la lista de hosts
      if ((r.no || 0) > (r.si || 0)) bloqueadas.add(r.imagen_url);
      else if ((r.si || 0) > (r.no || 0)) previas.push({ imagen_url: r.imagen_url, pagina_url: r.pagina_url || '', fuente: r.fuente || '', licencia: r.licencia || '', autor: '', titulo: lugar, gusto: true, si: r.si || 0 });
    }
    previas.sort((a, b) => b.si - a.si);
    const hallazgos = [], errores = [];
    for (const q of consultas) {
      try { hallazgos.push(...await buscarWikimedia(q, { fetchFn })); } catch (e) { errores.push(`Wikimedia: ${e.message}`); }
      if (env.BRAVE_API_KEY) { try { hallazgos.push(...await buscarBrave(q, { fetchFn, clave: env.BRAVE_API_KEY })); } catch (e) { errores.push(`Brave: ${e.message}`); } }
    }
    const vistas = new Set(), todas = [];
    for (const c of [...previas.slice(0, MAX_REFS_BANCO), ...hallazgos]) {
      if (bloqueadas.has(c.imagen_url) || vistas.has(c.imagen_url) || !urlPermitida(c.imagen_url)) continue;
      vistas.add(c.imagen_url); todas.push(c);
    }
    // Wikimedia primero (libre), después la web; hasta MAX_CANDIDATAS, alternando para no llenarlo de una sola fuente
    const lista = [...todas.filter((c) => c.gusto), ...todas.filter((c) => !c.gusto && c.fuente === 'Wikimedia Commons').slice(0, 8), ...todas.filter((c) => !c.gusto && c.fuente !== 'Wikimedia Commons')].slice(0, MAX_CANDIDATAS);
    if (errores.length) log(`[portadas] búsqueda con fallas: ${errores.join('; ')}`);
    const bajadas = await Promise.all(lista.map(async (c) => {
      try { return { ...c, ...(await bajar(c.imagen_url, fetchFn)) }; } catch { return null; }
    }));
    // resolución mínima en el lado corto; y un tope de peso total para que el pedido a Claude entre
    let peso = 0;
    return bajadas.filter(Boolean).map((c) => ({ ...c, medidas: dimensiones(c.bytes) })).filter((c) => c.medidas && Math.min(c.medidas.ancho, c.medidas.alto) >= MIN_LADO_CORTO).filter((c) => (peso += c.bytes.length) <= 20 * 1024 * 1024);
  }

  async function elegirFotos({ lugar, cands }) {
    const bloques = [{ type: 'text', text: `Lugar pedido: «${lugar}». Candidatas:` }];
    cands.forEach((c, i) => {
      bloques.push({ type: 'text', text: `Foto ${i + 1}${c.gusto ? ' (gustó)' : ''}: ${c.titulo} — ${c.fuente}` });
      bloques.push({ type: 'image', source: { type: 'base64', media_type: c.tipo, data: c.bytes.toString('base64') } });
    });
    const r = await claude.estructurado({ modelo, system: SYSTEM_ELEGIR, usuario: bloques, herramienta: HERRAMIENTA_ELEGIR, maxTokens: 1500, esfuerzo: 'low' });
    const ids = [...new Set((Array.isArray(r.elegidas) ? r.elegidas : []).map((x) => Number(x?.foto)).filter((n) => Number.isInteger(n) && n >= 1 && n <= cands.length))].slice(0, 3);
    const nocturnas = new Set((Array.isArray(r.elegidas) ? r.elegidas : []).filter((x) => x?.momento_del_dia === 'noche').map((x) => Number(x.foto)));
    return ids.map((n) => ({ ...cands[n - 1], noche: nocturnas.has(n) }));
  }

  function promptFondo({ lugar, escena, luz, plano }) {
    return 'Use the reference photo as the exact location. Keep the real architecture, shapes, colors and materials of the place exactly as they are; do not invent or redesign buildings. '
      + `Reframe it as a vertical 9:16 photorealistic background photo, ${LUZ[luz] || LUZ.dorada}. ${PLANO[plano] || PLANO.medio} `
      + `Remove all people, cars, signs and text. Leave the lower half visually calm. Subject: ${escena || lugar}.`;
  }

  async function fondoFal({ foto, prompt }) {
    if (!env.FAL_KEY) throw new Error('Falta FAL_KEY');
    const m = modeloFal();
    const uri = `data:${foto.tipo};base64,${foto.bytes.toString('base64')}`;
    const mas = /seedream/.test(m) ? { image_size: { width: 1152, height: 2048 } } : { aspect_ratio: '9:16', resolution: '1K' };
    const r = await fetchFn(`https://fal.run/${m}`, { method: 'POST', headers: { authorization: `Key ${env.FAL_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ prompt, image_urls: [uri], num_images: 1, output_format: 'jpeg', ...mas }), signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`fal respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const url = (await r.json())?.images?.[0]?.url;
    if (!url) throw new Error('fal no devolvió imagen');
    return url;
  }

  const iaActivo = () => env.PORTADA_FONDO_IA === '1';

  // Reparte los fondos del banco entre las versiones: el que tiene la luz y el plano pedidos; si no, el de la misma luz, el del mismo plano o cualquiera.
  // Nunca el mismo fondo dos veces en el momento. Solo del mismo tipo (foto o IA) que el modo actual. Devuelve, por versión, el fondo del banco o null.
  function reusarDelBanco({ versiones, lugar, project_id }) {
    const tipo = iaActivo() ? 'ia' : 'foto';
    const libres = banco?.disponible && project_id ? banco.fondosDe(project_id).filter((f) => f.tipo === tipo && mismoLugar(f.lugar, lugar)) : [];
    const out = versiones.map(() => null), tomados = new Set();
    const tomar = (i, ok) => { const f = libres.find((x) => !tomados.has(x.id) && ok(x)); if (f) { tomados.add(f.id); out[i] = f; } };
    versiones.forEach((v, i) => tomar(i, (f) => f.luz === v.luz && f.plano === v.plano));
    versiones.forEach((v, i) => { if (!out[i]) tomar(i, (f) => f.luz === v.luz); });
    versiones.forEach((v, i) => { if (!out[i]) tomar(i, (f) => f.plano === v.plano); });
    versiones.forEach((v, i) => { if (!out[i]) tomar(i, () => true); });
    return out;
  }

  // fondo_tipo: 'foto' (real, el Estudio la desenfoca y la tiñe con `luz`) o 'ia' (ya generada). luz y plano son los realmente usados.
  const changoDe = ({ fondo_url, fondo_tipo, luz, plano, v, ctx, referencia }) => ({
    fondo_url, fondo_tipo, luz, plano, linea1: v.linea1, linea2: v.linea2, lado: v.lado, nombre: ctx.nombre || '', ...(ctx.foto_dirigente ? { foto_dirigente: ctx.foto_dirigente } : {}), referencia,
  });

  // Devuelve, por versión: { chango, luz, plano } o { motivo }. Primero se reusan fondos del banco del proyecto; solo lo que falta se busca y se prepara.
  //   versiones: [{ luz, plano, lado, linea1, linea2 }]; ctx: { territorio, nombre, foto_dirigente, portada_refs, project_id }
  async function porMomento({ momento, texto, versiones, ctx = {} }) {
    const sin = (motivo) => versiones.map(() => ({ motivo }));
    try {
      if (iaActivo() && !env.FAL_KEY && !banco?.disponible) return sin('Falta FAL_KEY');
      const d = await decidir({ momento, texto, territorio: ctx.territorio || '' });
      if (d.motivo) return sin(d.motivo);
      const res = versiones.map(() => null);
      reusarDelBanco({ versiones, lugar: d.lugar, project_id: ctx.project_id }).forEach((f, i) => {
        if (!f) return;
        banco.usar(f.id);
        res[i] = { luz: f.luz, plano: f.plano, reusado: true, chango: changoDe({ fondo_url: banco.url(f), fondo_tipo: f.tipo, luz: f.luz, plano: f.plano, v: versiones[i], ctx, referencia: f.referencia }) };
      });
      const faltan = versiones.map((_, i) => i).filter((i) => !res[i]);
      if (!faltan.length) return res;
      const nuevas = await generar({ d, versiones: faltan.map((i) => versiones[i]), ctx });
      faltan.forEach((i, k) => { res[i] = nuevas[k]; });
      return res;
    } catch (e) { return sin(e.message || String(e)); }
  }

  // buscar fotos y elegir; después, por versión, la foto como fondo (o, con PORTADA_FONDO_IA=1, el fondo que genera fal)
  async function generar({ d, versiones, ctx }) {
    const ia = iaActivo();
    const sin = (motivo) => versiones.map(() => ({ motivo }));
    if (ia && !env.FAL_KEY) return sin('Falta FAL_KEY');
    const cands = await candidatas({ lugar: d.lugar, consultas: d.consultas, refs: ctx.portada_refs });
    if (!cands.length) return sin(`no encontré fotos usables de «${d.lugar}»`);
    const fotos = await elegirFotos({ lugar: d.lugar, cands });
    if (!fotos.length) return sin(`ninguna foto de «${d.lugar}» sirvió (gente o texto en el centro, marcas de agua, poca resolución o no era el lugar)`);
    // con menos fotos que versiones se reusan; si dos versiones comparten foto y también luz y plano, la segunda cambia de plano.
    // La luz es un tinte: «noche» solo con una foto de noche (y con ella, siempre); una foto de día nunca queda en «noche».
    const usados = new Set(), planos = Object.keys(PLANO), luces = [];
    const asign = versiones.map((v, i) => {
      const foto = fotos[i % fotos.length];
      let luz = v.luz;
      if (!ia) {
        if (foto.noche) luz = 'noche';
        else if (luz === 'noche' || !LUZ[luz]) luz = DIURNAS.find((x) => !luces.includes(x) && !versiones.some((o) => o.luz === x)) || DIURNAS.find((x) => !luces.includes(x)) || DIURNAS[0]; // un tinte que no pidió otra versión
      } else if (!LUZ[luz]) luz = 'calido';
      luces.push(luz);
      let plano = PLANO[v.plano] ? v.plano : 'medio';
      for (let k = 0; k < planos.length && usados.has(`${i % fotos.length}|${luz}|${plano}`); k++) plano = planos[(planos.indexOf(plano) + 1) % planos.length];
      usados.add(`${i % fotos.length}|${luz}|${plano}`);
      return { v, foto, luz, plano };
    });
    return Promise.all(asign.map(async ({ v, foto, luz, plano }) => {
      const lic = [foto.licencia, foto.autor].filter(Boolean).join(' — ');
      const referencia = { lugar: normLugar(d.lugar), imagen_url: foto.imagen_url, pagina_url: foto.pagina_url, fuente: foto.fuente, licencia: lic };
      try {
        let fondo_url, bytes = foto.bytes, tipo = foto.tipo;
        if (ia) {
          fondo_url = await fondoFal({ foto, prompt: promptFondo({ lugar: d.lugar, escena: d.escena, luz, plano }) });
          try { ({ bytes, tipo } = await bajar(fondo_url, fetchFn, { hosts: HOSTS_FAL, max: 15 * 1024 * 1024 })); } catch (e) { bytes = null; log(`[portadas] no pude bajar el fondo de fal: ${e.message}`); }
        }
        const archivo = bytes ? guardarFondo({ ctx, d, luz, plano, foto, referencia, bytes, tipo, fondo_tipo: ia ? 'ia' : 'foto' }) : '';
        // la foto directa sale del editor si hay banco con URL pública; si no, la miniatura permitida (Wikimedia o Brave)
        if (archivo) fondo_url = banco.url({ archivo });
        else if (!ia) fondo_url = foto.imagen_url;
        return { luz, plano, chango: changoDe({ fondo_url, fondo_tipo: ia ? 'ia' : 'foto', luz, plano, v, ctx, referencia }) };
      } catch (e) { return { motivo: `${ia ? 'fal' : 'foto'}: ${e.message}` }; }
    }));
  }

  // al banco; si no se puede guardar devuelve '' y la versión sale igual (con la URL original)
  function guardarFondo({ ctx, d, luz, plano, foto, referencia, bytes, tipo, fondo_tipo }) {
    if (!banco?.disponible || !ctx.project_id) return '';
    try { return banco.guardar({ project_id: ctx.project_id, lugar: normLugar(d.lugar), ref_url: foto.imagen_url, luz, plano, referencia, tipo: fondo_tipo, ext: extDe(tipo) }, bytes); }
    catch (e) { log(`[portadas] no pude guardar el fondo en el banco: ${e.message}`); return ''; }
  }

  return { porMomento };
}
