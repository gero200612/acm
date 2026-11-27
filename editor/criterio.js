// Junta lo que decide con Claude (momentos y recetas) en los ganchos que espera el corredor.
import { crearElegirMomentos } from './momentos.js';
import { crearArmarRecetas } from './recetas.js';
import { crearAnalista } from './analista.js';
import { crearAjustar } from './ajuste.js';
import { crearMirar } from './mirar.js';
import { crearPortadas } from './portadas.js';

// con estudio, el editor también mira el video (etapa «mirando»); sin él, sigue solo con la transcripción
export function crearCriterio({ claude, estudio, banco = null }) {
  return { ...(estudio ? { mirarVideo: crearMirar({ claude, estudio }) } : {}), elegirMomentos: crearElegirMomentos({ claude }), armarRecetas: crearArmarRecetas({ claude, portadas: crearPortadas({ claude, banco }) }), revisar: crearAnalista({ claude }), ajustar: crearAjustar({ claude }) };
}
