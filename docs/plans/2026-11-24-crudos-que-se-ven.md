# Crudos que se ven

Diseño: `docs/superpowers/specs/2026-11-24-crudos-que-se-ven-design.md`. Repos: `acm` (main) y `sincro-agents` (rama `editor-acm`, `estudio/`).

## ACM (panel)
- [ ] Ventana de subida con «¿De qué es el video?» y «¿Qué buscamos adentro?»; columnas `descripcion`/`buscar` en reels; las dos rutas de alta las guardan; el editor las recibe; «Tus crudos» muestra la descripción; estado «Mirando el video».

## Estudio (sincro-agents editor-acm)
- [ ] Tarea `mirar` (POST/GET /v1/mirar): cuadros cada 2 s, planillas 4×4 ≤1024 px con tiempo impreso, caché de crudos, tiempos_s por cuadro, tope 3 h.
- [ ] `editar-recorte` con `visual: true`: sin palabras ni cortes de silencio, sonido real adelante y cama baja, música sola si no hay audio, sonido real solo si no hay música.

## Editor (acm/editor)
- [ ] Etapa `mirando`: registro visual con Haiku (tandas de a una, reintentos, nunca deja el crudo en error), guardado y reusado.
- [ ] Búsqueda dirigida (mirar de cerca ≤8 tramos de ≤20 s) y «No encontramos: …».
- [ ] Momentos: registro + descripción + pedidos a Sonnet, `visual`/`pedido`, visual por densidad de palabras, validación (mín. 6 s visuales), recetas visuales.
- [ ] Costo de mirar en el detalle del Laboratorio; banco con crudo mudo, «qué buscar» que existe y que no.

## Cierre
- [ ] Prueba con un crudo real de calle contra el Estudio local: costo real de mirar y si encontró lo pedido.
- [ ] Push de acm y sincro-agents (editor/Estudio siguen sin levantarse en prod).
