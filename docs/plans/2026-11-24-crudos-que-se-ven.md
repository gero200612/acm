# Crudos que se ven

Diseño: `docs/superpowers/specs/2026-11-24-crudos-que-se-ven-design.md`. Repos: `acm` (main) y `sincro-agents` (rama `editor-acm`, `estudio/`).

## ACM (panel)
- [x] Ventana de subida con «¿De qué es el video?» y «¿Qué buscamos adentro?»; columnas `descripcion`/`buscar` en reels; las dos rutas de alta las guardan; el editor las recibe; «Tus crudos» muestra la descripción; estado «Mirando el video».

## Estudio (sincro-agents editor-acm)
- [x] Tarea `mirar` (POST/GET /v1/mirar): cuadros cada 2 s, planillas 4×4 ≤1024 px con tiempo impreso, caché de crudos, tiempos_s por cuadro, tope 3 h. — cambió: crudos de más de 3 h se rechazan (igual que editar-recorte) en vez de mirarse cada 4 s; sincro-agents ebbb0f2, 00d1aaf
- [x] `editar-recorte` con `visual: true`: sin palabras ni cortes de silencio, sonido real adelante y cama baja, música sola si no hay audio, sonido real solo si no hay música. (sincro-agents 42e302b)

## Editor (acm/editor)
- [x] Etapa `mirando`: registro visual con Haiku (tandas de a una, reintentos, nunca deja el crudo en error), guardado y reusado.
- [x] Búsqueda dirigida (mirar de cerca ≤8 tramos de ≤20 s) y «No encontramos: …».
- [x] Momentos: registro + descripción + pedidos a Sonnet, `visual`/`pedido`, visual por densidad de palabras, validación (mín. 6 s visuales), recetas visuales.
- [x] Costo de mirar en el detalle del Laboratorio; banco con crudo mudo, «qué buscar» que existe y que no.

## Cierre
- [x] Prueba con un crudo real de calle contra el Estudio local: costo real de mirar y si encontró lo pedido. — medido 2026-11-24 con 4 reels de recorrida de Posse unidos (3:36, 7 planillas), Haiku 5.5 a USD 0,10/0,50 por M: registro solo 17,6k/6,1k tokens = USD 0,0048 = 0,08/h; con búsqueda real (6 miradas de cerca) USD 0,0127 = 0,21/h escalado lineal desde 3,6 min (pesimista: las miradas de cerca son fijas, ≤8 tramos; con 1 h sería ~0,09/h); búsqueda inexistente sobre registro ya hecho USD 0,0004. Tiempos: Estudio mirar ~13 s, registro Haiku ~30 s, búsqueda con cerca ~60 s (102 s en total). Registro: bien en escena/lugar/ropa, pero sobrediagnostica abrazos (saludos contados como abrazo) y confunde algún sexo/persona. «Abraza»: 5 confirmados (2 dudosos); «un perro con un globo rojo»: «No encontramos», sin inventar.
- [ ] Push de acm y sincro-agents (editor/Estudio siguen sin levantarse en prod).
