// Preguntale a la investigación: busca las fichas más parecidas a la pregunta y le pide a Claude que responda solo con ellas,
// citando cada dato con el número de ficha. La clave va en ANTHROPIC_API_KEY (variable del servidor).
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ACM_ASK_MODEL || 'claude-opus-5-5';
let client = null;
export const agentReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const SYSTEM = (proyecto) => `Sos el analista de campaña de ACM para el proyecto «${proyecto}». Respondés en castellano rioplatense, claro y directo, usando SOLO las fichas de la investigación que vienen en el mensaje.
- Citá cada dato con el número de ficha entre corchetes, por ejemplo [3]. Sin cita, no lo afirmes.
- Si las fichas no alcanzan para responder, decilo y sugerí qué habría que investigar.
- Si un dato sale de una ficha con confianza baja, aclaralo.
- No inventes nombres, cifras ni fechas.
- Cuando sirva para decidir (temas, cuentas, contenidos), terminá con una recomendación concreta.`;

export async function ask({ question, history = [], fichas, proyecto }) {
  client ||= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  const contexto = fichas.map((f, i) => `[${i + 1}] (${f.kind}${f.confidence ? `, confianza ${f.confidence}` : ''}${f.date ? `, ${f.date}` : ''}${f.handle ? `, @${f.handle}` : ''}) ${f.title}\n${f.text}${f.source ? `\nFuente: ${f.source}` : ''}`).join('\n\n');
  // las preguntas anteriores van sin fichas: las fichas de esta vuelta son las que valen
  const previas = history.slice(-6)
    .filter((h) => (h.role === 'user' || h.role === 'assistant') && String(h.content || '').trim())
    .map((h) => ({ role: h.role, content: String(h.content).slice(0, 4000) }));
  if (previas.length && previas[0].role !== 'user') previas.shift();
  const r = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: 'medium' },
    // si el modelo rechaza la pregunta, la API la reintenta sola con otro modelo
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM(proyecto),
    messages: [...previas, { role: 'user', content: `Fichas de la investigación:\n\n${contexto || '(no hay fichas)'}\n\nPregunta: ${question}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('El modelo no quiso responder esa pregunta: probá formularla de otra manera.');
  const answer = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const usadas = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))].filter((n) => n >= 1 && n <= fichas.length);
  return {
    answer,
    sources: usadas.map((n) => ({ n, id: fichas[n - 1].id, title: fichas[n - 1].title, kind: fichas[n - 1].kind, source: fichas[n - 1].source })),
    model: r.model,
    truncated: r.stop_reason === 'max_tokens',
  };
}

// para mostrar un error que se entienda
export function askError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de Claude del servidor no es válida.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude está saturado: probá de nuevo en un minuto.';
  if (e instanceof Anthropic.APIConnectionError) return 'No pudimos conectar con Claude.';
  if (e instanceof Anthropic.APIError) return `Claude respondió con un error (${e.status}).`;
  return e.message || 'Algo falló.';
}
