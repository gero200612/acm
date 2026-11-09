# Editor: orquestador de ediciones de ACM

Servicio Node 24 (express + node:sqlite). ACM le manda cada crudo recién subido; el editor lo transcribe en el Estudio, elige momentos, pide los recortes editados, los revisa y se los entrega a ACM, avisando en cada etapa.

## Flujo

```
ACM  --POST /trabajos {project_id, reel_id, url, duracion_s, aprendizajes_url}-->  editor   (202 {id})
editor --POST /api/editor/estado {reel_id, estado, detalle}-->  ACM                 (en cada etapa)
editor --POST /api/editor/edicion {crudo_id, clip_id, moment, recipe, caption, hashtags,
                                   file_url, cover_url, duration, review, expires_at?}-->  ACM
```

Todo va con `Authorization: Bearer EDITOR_TOKEN`. ACM baja el video y la portada de `file_url` / `cover_url` (el editor los sirve en `/entregas/<uuid>.mp4|jpg`, sin token, con nombre imposible de adivinar, y los borra al entregar) y crea el reel `kind='listo'`, `source_id=crudo_id`.

Estados del crudo en ACM (`reels.status`): `en_cola`, `transcribiendo`, `buscando_momentos`, `editando`, `revisando`, `listo`, `sin_momentos`, `error`.

## Enchufar criterio: `crearRunner`

`runner.js` exporta `crearRunner({ db, estudio, acm, elegirMomentos, armarRecetas, revisar, publicUrl, dir, log })`. Las tres funciones se inyectan (por `hooks` en `crearEditor`, ver el final de `server.js`); si faltan se usan los rellenos de `rellenos` (sin momentos, sin recetas, review `pendiente`).

| función | recibe | devuelve |
| --- | --- | --- |
| `elegirMomentos` (Tarea 6) | `{ trabajo, transcripcion, aprendizajes }` | `[{ inicio_s, fin_s, ...datos }]` (`datos.caption` y `datos.hashtags` se usan como texto por defecto) |
| `armarRecetas` (Tarea 6) | `{ trabajo, momento, transcripcion, aprendizajes }` | `[receta, ...]`, hasta 3 por momento (todas comparten el `clip_id` del momento) |
| `revisar` (Tarea 7, el analista) | `{ trabajo, momento, edicion, resultado, tecnica, cuadros, palabras }` | `{ veredicto: 'aprobado'\|'rechazado'\|'dudoso', motivo, correccion? }` (el formato viejo `{ review }` sigue valiendo) |

- `transcripcion` es el resultado del Estudio: `{ duracion_s, palabras: [{inicio_s, fin_s, texto}], audio: { lufs } }`.
- `aprendizajes` es la lista que devuelve `GET {aprendizajes_url}` de ACM (hoy vacía; la llena el analista).
- A `editar-recorte` van solo las palabras que tocan el momento, con los tiempos absolutos del crudo.
- El `clip_id` lo pone el corredor: `c<reel_id>-<n°>` y no cambia si el trabajo se retoma.
- Cada edición que falla queda en `ediciones` con su error; si salen todas mal el crudo pasa a `error`, si salen algunas queda `listo` con el detalle «N de M ediciones».

`estudio.js` (`crearEstudio`, más `transcribir(url)` y `editarRecorte(pedido)` con la configuración del entorno) espera con sondeo hasta `listo` o `fallo`. Cada pedido lleva `X-Empresa` y `Authorization: Bearer`.

## Base (node:sqlite)

`trabajos` (un crudo, con su etapa y la transcripción), `momentos` (con `clip_id`), `ediciones` (una por receta: `pendiente` → `editada` → `entregada` o `fallo`). Al reiniciar, los trabajos que no llegaron a un estado final se retoman sin repetir la transcripción ni los momentos.

## Momentos y recetas (Claude)

`momentos.js` (`crearElegirMomentos`, `validarMomentos`): Sonnet propone, el código valida (límites de palabra, 6 a 90 s, sin solapes); ordena por interés y marca `elegido` los primeros 15 y `candidato` el resto (no se editan). Sin válidos devuelve `{ momentos: [], motivo }` y el crudo queda `sin_momentos` con ese motivo. `recetas.js` (`crearArmarRecetas`): el código reparte las variables (gancho, subtítulos, música/ritmo, largo/portada; con aprendizajes, 2 las siguen y 1 explora con `explora:true`) y Haiku escribe caption, hashtags y textos de gancho y portada, distintos por receta. `explora`, `caption` y `hashtags` no van al Estudio (su esquema es estricto). Los momentos con `actualidad:true` se entregan con `expires_at` = creación + 3 días. `claude.js` es el cliente (inyectable: el banco usa uno falso).

## Variables

| variable | uso |
| --- | --- |
| `EDITOR_TOKEN` | clave compartida con ACM (obligatoria) |
| `EDITOR_PUBLIC_URL` | dirección pública del editor, para que ACM baje los videos |
| `EDITOR_DATA` | carpeta de la base y de `entregas/` (`./data`) |
| `PORT` | 4000 |
| `ESTUDIO_URL`, `ESTUDIO_EMPRESA`, `ESTUDIO_CLAVE` | el Estudio |
| `ACM_URL` | dirección de ACM |
| `ANTHROPIC_API_KEY` | Claude: momentos (`claude-sonnet-5-5`) y textos (`claude-haiku-5-5`). Sin ella el trabajo termina en `error` con un mensaje claro |

En ACM: `EDITOR_URL` (si falta, los crudos quedan `en_cola` y no pasa nada) y `EDITOR_TOKEN`.

## Pruebas

`node editor/banco.mjs` (Estudio y ACM falsos en servidores locales; imprime «Pasaron X de Y»).

## Analista (Tarea 7)

`analista.js` (`crearAnalista`): con fallas en `tecnica` rechaza sin llamar al modelo; si no, Sonnet (`claude-sonnet-5-5`) mira de 6 a 8 cuadros (que el corredor baja del Estudio con la misma autenticación) contra la receta y las palabras. Si el modelo falla, el veredicto es `dudoso`. El corredor rehace UNA vez una edición rechazada con `corregirReceta` (siempre cambia algo); si vuelve a rechazarse queda `descartada` y no se entrega. `aprobado` se entrega con `review: 'aprobado'` (ACM lo deja así solo en modo auto) y `dudoso` siempre con `pendiente`. La receta lleva `variables` (gancho, subtitulos, musica, ritmo, largo) para que ACM aprenda de las opiniones; no va al Estudio.
