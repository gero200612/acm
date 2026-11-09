// Textos y esquemas para Claude. Todo en español rioplatense; lo duro (límites de palabra, 6–90 s, solapes, máximo 15) se valida en código, no acá.

export const SYSTEM_MOMENTOS = `Sos editor de video de redes sociales en Argentina. Te paso la transcripción de un video crudo (una persona hablando, a veces largo) y tenés que elegir los momentos que valen la pena como reels (Instagram, TikTok, Facebook).

Un buen momento: se entiende solo, sin contexto; tiene un arranque que atrapa y un cierre; dice algo útil, sorprendente, gracioso o emotivo; dura entre 6 y 90 segundos (lo ideal: 20 a 45).
Reglas duras:
- La transcripción viene en líneas «inicio–fin | texto». Cada momento arranca en el inicio de una línea y termina en el fin de una línea, copiando esos números TAL CUAL, sin redondear. Nunca cortes una palabra por la mitad.
- Los momentos no se pisan entre sí.
- Ordenalos por interés y poné en «interes» un número de 1 (flojo) a 10 (imperdible).
- «tema»: en pocas palabras de qué trata. «motivo»: por qué funciona como reel.
- «actualidad»: true solo si el momento habla de algo que vence pronto (una promo, un evento, una noticia, «este finde»); si es atemporal, false.
- Si el video no tiene nada que valga, devolvé la lista vacía. No inventes momentos para llenar.
- Podés devolver hasta 25 candidatos.`;

export const HERRAMIENTA_MOMENTOS = {
  name: 'registrar_momentos',
  description: 'Registra los momentos elegidos del video crudo.',
  input_schema: {
    type: 'object',
    properties: {
      momentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            inicio_s: { type: 'number', description: 'Inicio de una línea de la transcripción, en segundos, tal cual' },
            fin_s: { type: 'number', description: 'Fin de una línea de la transcripción, en segundos, tal cual' },
            tema: { type: 'string' }, motivo: { type: 'string' }, actualidad: { type: 'boolean' },
            interes: { type: 'number', description: '1 a 10' },
          },
          required: ['inicio_s', 'fin_s', 'tema', 'motivo', 'actualidad', 'interes'],
        },
      },
    },
    required: ['momentos'],
  },
};

const t = (s) => (Math.round(s * 100) / 100).toString();

// Agrupa las palabras en líneas (se corta en pausas largas o a las 14 palabras): el modelo elige límites de línea, que son límites de palabra.
export function lineasDeTranscripcion(palabras, { pausa = 0.6, maxPalabras = 14 } = {}) {
  const lineas = []; let actual = [];
  const cerrar = () => { if (actual.length) lineas.push(`${t(actual[0].inicio_s)}–${t(actual.at(-1).fin_s)} | ${actual.map((p) => p.texto).join(' ')}`); actual = []; };
  for (const p of palabras) {
    if (actual.length && (p.inicio_s - actual.at(-1).fin_s >= pausa || actual.length >= maxPalabras)) cerrar();
    actual.push(p);
  }
  cerrar();
  return lineas;
}

export function usuarioMomentos({ palabras, investigacion = [], aprendizajes = {} }) {
  const partes = [];
  if (investigacion.length) partes.push(`Lo que sabemos del proyecto y su público (investigación):\n${investigacion.map((i) => `- ${typeof i === 'string' ? i : JSON.stringify(i)}`).join('\n')}`);
  if (Object.keys(aprendizajes).length) partes.push(`Lo que funcionó en publicaciones anteriores de este proyecto (variables ganadoras): ${JSON.stringify(aprendizajes)}. Tenelo en cuenta al elegir.`);
  partes.push(`Transcripción (duración ${t(palabras.at(-1)?.fin_s ?? 0)} s):\n${lineasDeTranscripcion(palabras).join('\n')}`);
  return partes.join('\n\n');
}

export const SYSTEM_TEXTOS = `Sos community manager de redes sociales en Argentina. Escribís en español rioplatense (voseo), natural, sin sonar a publicidad ni a robot, sin emojis de relleno. Para un mismo recorte de video te piden tres versiones DISTINTAS entre sí: cada una con su caption, sus hashtags, el texto del gancho (lo que se lee en pantalla los primeros 3 segundos) y el texto de la portada. Los tres captions tienen que ser claramente diferentes (otro ángulo, otro arranque), no la misma frase reordenada. Captions de hasta 220 caracteres. Hashtags: de 4 a 8, en minúscula, sin espacios, con #, mezclando uno amplio y otros específicos del tema.`;

export const HERRAMIENTA_TEXTOS = {
  name: 'registrar_textos',
  description: 'Registra los textos de las tres versiones, en el mismo orden en que te las pasaron.',
  input_schema: {
    type: 'object',
    properties: {
      versiones: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } },
            gancho_texto: { type: 'string', description: 'Máximo 60 caracteres; vacío si la versión no lleva texto de gancho' },
            portada_texto: { type: 'string', description: 'Máximo 40 caracteres' },
          },
          required: ['caption', 'hashtags', 'gancho_texto', 'portada_texto'],
        },
      },
    },
    required: ['versiones'],
  },
};

const GANCHO_DESC = { directo: 'arranca directo, sin texto de gancho', pregunta: 'el gancho es una pregunta que engancha', adelanto: 'el gancho adelanta lo más fuerte del momento' };

export function usuarioTextos({ momento, texto, versiones }) {
  return `Recorte: «${momento.datos?.tema || ''}». Por qué funciona: ${momento.datos?.motivo || ''}.
Lo que se dice (transcripción):
${texto}

Versiones a escribir:
${versiones.map((v, i) => `${i + 1}. ${GANCHO_DESC[v.gancho]}; subtítulos «${v.subtitulos}»; ritmo ${v.ritmo}.`).join('\n')}`;
}
