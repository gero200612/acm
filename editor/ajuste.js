// Rehacer con lo que pidió una persona: cuando alguien rechaza una edición en ACM y escribe qué cambiaría
// («los subtítulos tapan la cara», «más corto», «sin música»), el pedido se traduce a cambios de la receta y se vuelve a editar.
// Claude (Haiku) entiende el pedido; el código aplica los cambios y valida los límites. Sin Claude, se entiende lo básico por palabras.
import { MODELOS } from './claude.js';
import { OPCIONES, MIN_LARGO_S, aEstilo } from './recetas.js';

const r1 = (n) => Math.round(n * 10) / 10;
const FACTOR_LARGO = { completo: 1, medio: 0.7, corto: 0.45 };

export const SYSTEM_AJUSTE = `Sos editor de video de redes sociales en Argentina. Una persona del equipo rechazó una edición de un reel y escribió qué cambiaría. Traducí su pedido a cambios concretos de la receta de edición. Cambiá SOLO lo que pide (o lo que se deduce sin dudas); lo demás queda igual.
Opciones de la receta:
- gancho (cómo arranca): directo | pregunta | adelanto
- subtitulos (el estilo): recuadro (mayúsculas con la palabra que suena sobre un recuadro) | placa (con fondo) | minimo (chicos, abajo) | frase (frase entera) | grande (letras grandes) | chango (mayúsculas medianas al medio, con contorno, sin fondo)
- karaoke (true/false): que la palabra que se dice se pinte en el momento en que se dice; va en cualquier estilo. Solo cambialo si pide sacarlo o ponerlo
- transicion (efecto en cada corte interno del reel, con su sonido): seco (sin efecto) | zoom (cambio de plano, como otra cámara) | destello (flash blanco) | barrido (el cuadro entra de costado) | glitch (corrimiento de colores). «Sin transiciones» o «cortes secos» es seco
- musica: energico | calido | sin
- ritmo: rapido (con zoom) | normal | lento
- largo: completo | medio | corto (o un largo exacto en segundos con largo_s)
- recortar_inicio_s / recortar_fin_s: segundos a sacar del principio o del final si pide cortar ahí
- caption / hashtags / gancho_texto / portada_texto: solo si pide cambiar el texto
En «entendido» escribí en una línea, en español rioplatense, qué vas a cambiar. Si el pedido no se puede resolver editando (por ejemplo, pide otra toma que no existe), dejá los cambios vacíos y explicalo en «entendido».`;

export const HERRAMIENTA_AJUSTE = {
  name: 'ajuste',
  description: 'Los cambios a la receta que pidió la persona',
  input_schema: {
    type: 'object',
    properties: {
      entendido: { type: 'string' },
      gancho: { type: 'string', enum: OPCIONES.gancho },
      subtitulos: { type: 'string', enum: OPCIONES.subtitulos },
      karaoke: { type: 'boolean' },
      transicion: { type: 'string', enum: OPCIONES.transicion },
      musica: { type: 'string', enum: OPCIONES.musica },
      ritmo: { type: 'string', enum: OPCIONES.ritmo },
      largo: { type: 'string', enum: OPCIONES.largo },
      largo_s: { type: 'number' },
      recortar_inicio_s: { type: 'number' },
      recortar_fin_s: { type: 'number' },
      caption: { type: 'string' },
      hashtags: { type: 'string' },
      gancho_texto: { type: 'string' },
      portada_texto: { type: 'string' },
    },
    required: ['entendido'],
  },
};

// Lo básico sin Claude: palabras clave del pedido
export function ajustePorPalabras(pedido, receta = {}) {
  const t = String(pedido || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const c = {}, dijo = [];
  if (/sin musica|saca(r|le)? la musica|musica (molesta|fuerte|no va)|no .*musica/.test(t)) { c.musica = 'sin'; dijo.push('sin música'); }
  else if (/musica/.test(t)) { c.musica = receta.musica?.clima === 'energico' ? 'calido' : 'energico'; dijo.push('otra música'); }
  if (/sin karaoke|saca(r|le)? el karaoke|no .*palabra por palabra/.test(t)) { c.karaoke = false; dijo.push('sin karaoke'); }
  else if (/karaoke|palabra por palabra/.test(t)) { c.karaoke = true; dijo.push('con karaoke'); }
  if (/subtitul|letras?|texto en pantalla/.test(t)) {
    if (/grande|no se lee|chic/.test(t)) c.subtitulos = 'grande';
    else if (/\btap(a|e|an|en|ando)\b|molest|much/.test(t)) c.subtitulos = 'minimo';
    else { const o = OPCIONES.subtitulos; c.subtitulos = o[(o.indexOf(aEstilo(receta.subtitulos)) + 1) % o.length]; }
    dijo.push(`subtítulos «${c.subtitulos}»`);
  }
  if (/mas corto|muy largo|es largo|acorta|recorta/.test(t)) { c.largo = 'corto'; dijo.push('más corto'); }
  else if (/mas largo|muy corto|completo/.test(t)) { c.largo = 'completo'; dijo.push('más largo'); }
  if (/lento|calma|tranqui/.test(t)) { c.ritmo = 'lento'; dijo.push('ritmo más lento'); }
  else if (/rapido|dinamic|aburr|lento/.test(t)) { c.ritmo = 'rapido'; dijo.push('ritmo más rápido'); }
  // transiciones de los cortes: «sin transiciones», «con zoom», «ponele destello», «más glitch»…
  const TRANS = [['destello', /destello|flash/], ['barrido', /barrido|swipe|deslizad/], ['glitch', /glitch|interferencia/], ['zoom', /(con|pone(le|les)?|agrega(le|les)?|mete(le|les)?|usa(r)?|cambia(r)? (a|por)|mas) (el |un |los |las )?(\w+ ){0,2}zoom|zoom (en|entre) (los |cada )?(corte|cambio)|transicion(es)? (de |con |tipo )?(el )?zoom|zoom .*transicion/]];
  const pidioSeco = /sin (las )?transicion|sac(a|ar|ale|arle)? (las |la )?transicion|quit(a|ar|ale)? (las |la )?transicion|cortes? secos?|transicion(es)? (molest|de mas|no va|no me gust)|(muchos?|demasiad[ao]s?) (efectos|transicion)/.test(t);
  const tipo = TRANS.find(([, re]) => re.test(t))?.[0];
  if (pidioSeco) { c.transicion = 'seco'; dijo.push('sin transiciones'); }
  else if (tipo) { c.transicion = tipo; dijo.push(`transición «${tipo}»`); }
  else if (/transicion/.test(t)) { const rot = OPCIONES.transicion.filter((x) => x !== 'seco'), i = rot.indexOf(receta.transicion); c.transicion = rot[(i + 1) % rot.length]; dijo.push(`transición «${c.transicion}»`); }
  if (/zoom/.test(t) && !c.transicion) {
    // «sin zoom»: si el zoom que se ve es el de las transiciones, se saca eso; si no, el acercamiento automático
    if (receta.transicion === 'zoom') { c.transicion = 'seco'; dijo.push('sin zoom (cortes secos)'); }
    else { c.ritmo = c.ritmo || 'normal'; c.quitar_zoom = true; dijo.push('sin zoom'); }
  }
  return { ...c, entendido: dijo.length ? `Cambio: ${dijo.join(', ')}.` : 'No entendí qué cambiar: se rehace con otros subtítulos.', ...(dijo.length ? {} : { subtitulos: OPCIONES.subtitulos[(OPCIONES.subtitulos.indexOf(aEstilo(receta.subtitulos)) + 1) % OPCIONES.subtitulos.length] }) };
}

// Aplica los cambios a la receta con los límites del Estudio (largo entre 12 s y lo disponible; recortes dentro del momento)
export function aplicarAjuste(receta, c = {}, momento = {}) {
  const n = JSON.parse(JSON.stringify(receta || {}));
  const v = { ...(n.variables || {}) };
  const desde0 = n.gancho?.desde_s ?? momento.inicio_s ?? 0, fin = momento.fin_s ?? desde0 + (n.largo_s || 30);
  if (c.gancho && OPCIONES.gancho.includes(c.gancho)) {
    const ad = n.gancho?.adelanto;
    if (c.gancho === 'mejor') { if (ad) { ad.modo = c.gancho; v.gancho = c.gancho; delete n.gancho.texto; } } // sin una frase elegida no hay adelanto que armar
    else { v.gancho = c.gancho; if (n.gancho) delete n.gancho.adelanto; if (c.gancho === 'directo' && n.gancho) delete n.gancho.texto; }
  }
  if (c.subtitulos && OPCIONES.subtitulos.includes(aEstilo(c.subtitulos))) { n.subtitulos = aEstilo(c.subtitulos); v.subtitulos = n.subtitulos; }
  if (typeof c.karaoke === 'boolean') { n.karaoke = c.karaoke; v.karaoke = c.karaoke ? 'con' : 'sin'; }
  if (c.transicion && OPCIONES.transicion.includes(c.transicion)) { n.transicion = c.transicion; v.transicion = c.transicion; }
  if (c.musica && OPCIONES.musica.includes(c.musica)) { n.musica = c.musica === 'sin' ? null : { clima: c.musica, volumen: n.musica?.volumen ?? 0.25 }; v.musica = c.musica; }
  if (c.ritmo && OPCIONES.ritmo.includes(c.ritmo)) { n.ritmo = c.ritmo; v.ritmo = c.ritmo; }
  if (c.quitar_zoom) n.zoom = false;
  // recortes: se corre el arranque y/o se acorta el final, sin salir del momento
  let desde = desde0;
  if (Number(c.recortar_inicio_s) > 0) { desde = Math.min(fin - MIN_LARGO_S, desde0 + Number(c.recortar_inicio_s)); n.gancho = { ...(n.gancho || {}), desde_s: r1(Math.max(desde0, desde)) }; }
  const disp = Math.max(MIN_LARGO_S, fin - (n.gancho?.desde_s ?? desde));
  let largo = n.largo_s || disp;
  if (c.largo && FACTOR_LARGO[c.largo]) { largo = disp * FACTOR_LARGO[c.largo]; v.largo = c.largo; }
  if (Number(c.largo_s) > 0) largo = Number(c.largo_s);
  if (Number(c.recortar_fin_s) > 0) largo = Math.min(largo, (n.largo_s || disp) - Number(c.recortar_fin_s));
  const tope = Number(n.marca?.largo_max_s) >= 6 ? Math.min(90, Number(n.marca.largo_max_s)) : 90;
  n.largo_s = r1(Math.min(tope, disp, Math.max(Math.min(MIN_LARGO_S, disp), largo)));
  if (n.portada) n.portada = { ...n.portada, segundo_s: r1(Math.min(n.portada.segundo_s ?? 0, n.largo_s - 0.5)) };
  for (const k of ['caption', 'hashtags']) if (typeof c[k] === 'string' && c[k].trim()) n[k] = c[k].trim();
  if (typeof c.gancho_texto === 'string' && c.gancho_texto.trim() && v.gancho !== 'directo' && !n.gancho?.adelanto) n.gancho = { ...(n.gancho || {}), texto: c.gancho_texto.trim().slice(0, 60) };
  if (typeof c.portada_texto === 'string' && c.portada_texto.trim()) n.portada = { ...(n.portada || {}), texto: c.portada_texto.trim().slice(0, 40) };
  if (Object.keys(v).length) n.variables = v;
  return n;
}

// ajustar({ receta, pedido, momento, palabras }) → { receta, entendido }
export function crearAjustar({ claude } = {}) {
  return async function ajustar({ receta, pedido, momento = {}, palabras = [] }) {
    let c;
    if (claude) {
      const dicho = palabras.map((p) => p.palabra ?? p.texto ?? '').join(' ').slice(0, 4000);
      const usuario = `Pedido de la persona: «${String(pedido).slice(0, 2000)}»\n\nReceta actual: ${JSON.stringify({ gancho: receta?.variables?.gancho, subtitulos: aEstilo(receta?.subtitulos), karaoke: receta?.karaoke !== false, transicion: receta?.transicion || 'seco', musica: receta?.musica?.clima || 'sin', ritmo: receta?.ritmo, largo_s: receta?.largo_s, caption: receta?.caption, hashtags: receta?.hashtags, gancho_texto: receta?.gancho?.texto, portada_texto: receta?.portada?.texto })}\nEl momento dura ${r1((momento.fin_s ?? 0) - (momento.inicio_s ?? 0))} s.\nLo que se dice: ${dicho}`;
      try { c = await claude.estructurado({ modelo: MODELOS.textos, system: SYSTEM_AJUSTE, usuario, herramienta: HERRAMIENTA_AJUSTE, maxTokens: 1500, esfuerzo: 'low' }); }
      catch { c = null; }
    }
    if (!c) c = ajustePorPalabras(pedido, receta);
    return { receta: aplicarAjuste(receta, c, momento), entendido: String(c.entendido || '').slice(0, 300) };
  };
}
