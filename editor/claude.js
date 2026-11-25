// Cliente de Claude con salida estructurada. Se inyecta: el banco usa uno falso, sin red.
//   (`usuario` puede ser un texto o una lista de bloques, con imágenes)
//   claude.estructurado({ modelo, system, usuario, herramienta: { name, description, input_schema } }) → objeto que cumple el esquema
// Sonnet 5.5 y Opus 5.5 ya no aceptan forzar una herramienta (tool_choice «tool» da 400): el esquema de la herramienta
// va como formato de salida JSON (output_config.format), que garantiza la forma de la respuesta.
// Sin ANTHROPIC_API_KEY falla con un mensaje claro (el trabajo termina en «error», el servicio no se cae).
import Anthropic from '@anthropic-ai/sdk';
import { AsyncLocalStorage } from 'node:async_hooks';

// Costo de la API por trabajo: el runner abre un registro (usoDelTrabajo.run) y cada llamada anota modelo y tokens ahí.
// Precios en USD por millón de tokens (lista pública de Anthropic, 2026-11). El pensamiento se cobra como salida (ya viene en output_tokens).
// Haiku 5.5: lectura/escritura de caché estimadas en 0,1× y 1,25× de la entrada (no están en la tabla).
export const PRECIOS = {
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cache_lectura: 0.1, cache_escritura: 2.5 },
  'claude-sonnet-5': { entrada: 2, salida: 10, cache_lectura: 0.2, cache_escritura: 2.5 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cache_lectura: 0.01, cache_escritura: 0.125 },
  'claude-opus-5-5': { entrada: 4, salida: 20, cache_lectura: 0.2, cache_escritura: 5 },
  'claude-opus-4-8': { entrada: 5, salida: 25, cache_lectura: 0.5, cache_escritura: 6.25 },
};
export const usoDelTrabajo = new AsyncLocalStorage();
export function costoUSD(u) {
  const p = PRECIOS[u.modelo] || PRECIOS['claude-sonnet-5-5'];
  return (u.entrada * p.entrada + u.salida * p.salida + (u.cache_lectura || 0) * p.cache_lectura + (u.cache_escritura || 0) * p.cache_escritura) / 1e6;
}
// suma por modelo de un registro de llamadas: { total_usd, llamadas, por_modelo: { modelo: { llamadas, entrada, salida, usd } } }
export function resumirUso(lista = []) {
  const por = {};
  for (const u of lista) {
    const m = (por[u.modelo] ||= { llamadas: 0, entrada: 0, salida: 0, cache_lectura: 0, cache_escritura: 0, usd: 0 });
    m.llamadas++; m.entrada += u.entrada; m.salida += u.salida; m.cache_lectura += u.cache_lectura || 0; m.cache_escritura += u.cache_escritura || 0; m.usd += costoUSD(u);
  }
  for (const m of Object.values(por)) m.usd = Math.round(m.usd * 10000) / 10000;
  return { total_usd: Math.round(Object.values(por).reduce((a, m) => a + m.usd, 0) * 10000) / 10000, llamadas: lista.length, por_modelo: por };
}

export const MODELOS = { momentos: 'claude-sonnet-5-5', textos: 'claude-haiku-5-5', mirar: 'claude-haiku-5-5', analista: 'claude-sonnet-5-5' };

// Las salidas JSON no aceptan topes numéricos, de largo ni de cantidad, y exigen additionalProperties: false en cada objeto.
// Se sacan del esquema que viaja; los topes los controla cada llamador al validar lo que vuelve (validarTextos, etc.).
const SIN_SOPORTE = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems']);
export function esquemaParaSalida(s) {
  if (Array.isArray(s)) return s.map(esquemaParaSalida);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) if (!SIN_SOPORTE.has(k)) out[k] = k === 'enum' || k === 'required' ? v : esquemaParaSalida(v);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

// Sonnet 5.5 rechaza algunos pedidos por sus filtros de seguridad: con «fallbacks» la API lo reintenta sola con otro modelo.
const CON_RESPALDO = /^claude-(sonnet-5-5|opus-5-5)$/;

export function crearClaude({ apiKey = process.env.ANTHROPIC_API_KEY, sdk } = {}) {
  let cliente = sdk;
  return {
    async estructurado({ modelo, system, usuario, herramienta, maxTokens = 8000, esfuerzo = 'medium', uso }) {
      if (!cliente) {
        if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY: sin ella no puedo elegir momentos ni armar las recetas. Cargala en el entorno del editor y reintentá.');
        cliente = new Anthropic({ apiKey });
      }
      const pedido = {
        model: modelo,
        // el pensamiento (siempre activo en estos modelos) gasta del mismo tope: se deja margen para que no corte la respuesta
        max_tokens: Math.max(16000, maxTokens),
        system: `${system}\n\nRespondé solo con el JSON pedido: ${herramienta.description || herramienta.name}`,
        messages: [{ role: 'user', content: usuario }],
        output_config: { effort: esfuerzo, format: { type: 'json_schema', schema: esquemaParaSalida(herramienta.input_schema) } },
      };
      const r = CON_RESPALDO.test(modelo)
        ? await cliente.beta.messages.create({ ...pedido, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await cliente.messages.create(pedido);
      // tokens de esta llamada, para quien quiera sumarlos (el costo de mirar por crudo)
      if (typeof uso === 'function') uso({ modelo, entrada: r.usage?.input_tokens ?? 0, salida: r.usage?.output_tokens ?? 0 });
      // y al registro del trabajo en curso, con el modelo que respondió de verdad (si hubo respaldo, otro)
      usoDelTrabajo.getStore()?.push({ modelo: r.model || modelo, entrada: r.usage?.input_tokens ?? 0, salida: r.usage?.output_tokens ?? 0, cache_lectura: r.usage?.cache_read_input_tokens ?? 0, cache_escritura: r.usage?.cache_creation_input_tokens ?? 0 });
      if (r.stop_reason === 'refusal') throw new Error(`Claude no quiso responder (${r.stop_details?.category || 'sin categoría'})`);
      if (r.stop_reason === 'max_tokens') throw new Error('La respuesta de Claude quedó cortada (tope de tokens)');
      const texto = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      let out;
      try { out = JSON.parse(texto); } catch { throw new Error('Claude no devolvió la respuesta estructurada esperada'); }
      if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error('Claude no devolvió la respuesta estructurada esperada');
      return out;
    },
  };
}
