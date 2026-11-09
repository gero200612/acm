// Cliente de Claude con salida estructurada (tool use forzado). Se inyecta: el banco usa uno falso, sin red.
//   claude.estructurado({ modelo, system, usuario, herramienta: { name, description, input_schema } }) → objeto (el `input` de la herramienta)
// Sin ANTHROPIC_API_KEY falla con un mensaje claro (el trabajo termina en «error», el servicio no se cae).
import Anthropic from '@anthropic-ai/sdk';

export const MODELOS = { momentos: 'claude-sonnet-5-5', textos: 'claude-haiku-5-5' };

export function crearClaude({ apiKey = process.env.ANTHROPIC_API_KEY, sdk } = {}) {
  let cliente = sdk;
  return {
    async estructurado({ modelo, system, usuario, herramienta, maxTokens = 8000 }) {
      if (!cliente) {
        if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY: sin ella no puedo elegir momentos ni armar las recetas. Cargala en el entorno del editor y reintentá.');
        cliente = new Anthropic({ apiKey });
      }
      const r = await cliente.messages.create({
        model: modelo, max_tokens: maxTokens, system, messages: [{ role: 'user', content: usuario }],
        tools: [herramienta], tool_choice: { type: 'tool', name: herramienta.name },
      });
      const uso = (r.content || []).find((b) => b.type === 'tool_use' && b.name === herramienta.name);
      if (!uso || typeof uso.input !== 'object' || !uso.input) throw new Error('Claude no devolvió la respuesta estructurada esperada');
      return uso.input;
    },
  };
}
