// Reglas compartidas entre el servidor y el banco de pruebas.

// Por qué no se publica una publicación que ya llegó a su hora (null = se puede publicar)
export function postBlocked(p) {
  if (p.propaganda_until && String(p.scheduled_at).slice(0, 10) > p.propaganda_until) return `Cae después del ${p.propaganda_until}, la fecha máxima de propaganda.`;
  if (p.acc_status === 'pausada') return 'La cuenta está pausada.';
  if (p.acc_status !== 'conectada') return 'La cuenta no está conectada: conectala y tocá Reintentar.';
  return null;
}

// Números de la pauta (los mismos que muestra la pestaña Pauta). Fechas YYYY-MM-DD.
export const PAUTA = { cpm: 6, match: 0.6, iva: 0.21 };
export function pautaNumbers({ budget, from, to, padron, contacts }) {
  const days = Math.max(1, Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / 864e5) + 1);
  const net = (Number(budget) || 0) / (1 + PAUTA.iva);
  const imps = net / PAUTA.cpm * 1000;
  const people = Math.round((contacts || padron || 0) * PAUTA.match);
  const freq = people ? imps / people : 0;
  return { days, net, imps, people, freq, perWeek: freq / Math.max(1, days / 7) };
}
