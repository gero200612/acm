// Junta lo que decide con Claude (momentos y recetas) en los ganchos que espera el corredor.
import { crearElegirMomentos } from './momentos.js';
import { crearArmarRecetas } from './recetas.js';
import { crearAnalista } from './analista.js';

export function crearCriterio({ claude }) {
  return { elegirMomentos: crearElegirMomentos({ claude }), armarRecetas: crearArmarRecetas({ claude }), revisar: crearAnalista({ claude }) };
}
