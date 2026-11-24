// Frases de una transcripción con tiempos. Una palabra cierra la frase si termina en . ? ! … o si la que sigue viene tras una pausa
// de 0,5 s o más (Whisper a veces no puntúa). Un reel no empieza ni termina a mitad de una idea: lo usan momentos.js y recetas.js.
export const PAUSA_FRASE_S = 0.5;
export const cierraFrase = (t) => /[.?!…]["')»]*$/.test(String(t || ''));
export const finDeFrase = (ps, i) => !ps[i + 1] || cierraFrase(ps[i].texto) || ps[i + 1].inicio_s - ps[i].fin_s >= PAUSA_FRASE_S;
export const inicioDeFrase = (ps, i) => i === 0 || finDeFrase(ps, i - 1);
