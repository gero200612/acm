// Frases de una transcripción con tiempos. Una palabra cierra la frase si termina en . ? ! … o si la que sigue viene tras una pausa
// de 0,5 s o más (Whisper a veces no puntúa). Un reel no empieza ni termina a mitad de una idea: lo usan momentos.js y recetas.js.
export const PAUSA_FRASE_S = 0.5;
// los puntos suspensivos («la...», «…») NO cierran: la persona se interrumpió o dejó la idea en el aire
export const cierraFrase = (t) => /[.?!]["')»]*$/.test(String(t || '')) && !/(\.\.\.|…)["')»]*$/.test(String(t || ''));
// tras una coma, punto y coma o dos puntos la idea sigue: hace falta una pausa más larga para cortar
export const PAUSA_TRAS_COMA_S = 1;
export const finDeFrase = (ps, i) => !ps[i + 1] || cierraFrase(ps[i].texto) || ps[i + 1].inicio_s - ps[i].fin_s >= (/[,;:]["')»]*$/.test(String(ps[i].texto || '')) ? PAUSA_TRAS_COMA_S : PAUSA_FRASE_S);
// (si la palabra anterior dura 0 s, Whisper juntó varias en un instante: el tiempo no es de fiar y ahí no se corta)
export const inicioDeFrase = (ps, i) => i === 0 || (finDeFrase(ps, i - 1) && ps[i - 1].fin_s - ps[i - 1].inicio_s >= 0.05);
