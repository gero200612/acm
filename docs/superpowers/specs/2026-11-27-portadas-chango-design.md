# Portadas estilo Chango — diseño

2026-11-27. Aprobó el enfoque: Gero («si mandale», opción A).

## Para qué

Hoy la portada de cada reel es un cuadro del mismo video con 1 a 3 palabras encima (`estudio/src/remotion/Portada.tsx`, rama `editor-acm` de sincro-agents). Las 3 versiones de un momento salen casi iguales y no llaman la atención.

Gero quiere portadas como las de Chango (@lacastream): la persona REAL recortada del video, adelante; atrás, una escena del lugar o tema del que habla, hecha por IA a partir de una foto real; degradé de color de la marca abajo y título en 2 líneas (1.ª chica, 2.ª enorme). Y que mejoren con el uso: él las puntúa en la app y las próximas salen más parecidas a las que le gustaron.

Prototipo que ya funciona (fuera del repo): `~/Documents/acm/portadas-chango/` — `fondo_ref.py` (foto real → fondo 9:16 por fal.ai), `armar.py` (composición con Pillow), comparación en `fal/ref-comparacion.jpg`. Ahí se vio que **sin foto de referencia la IA inventa el lugar** (la Catedral de San Isidro salía como una catedral gótica cualquiera) y que con la foto real la respeta.

## Qué se construye

Por cada **momento** (las 3 versiones del mismo recorte):

1. **Entender de qué habla.** Con la transcripción y el `tema` del momento, Claude decide qué mostrar atrás: un lugar concreto («Catedral de San Isidro») o, si el tema no es un lugar (seguridad, impuestos, tránsito), una escena de San Isidro/del territorio del proyecto que lo represente («patrullero en una calle arbolada de Boulogne»). Devuelve: qué buscar, y una descripción de la escena.
2. **Buscar fotos reales de referencia.** Primero en Wikimedia Commons (libre, gratis). Si no hay al menos 3 fotos útiles, en un buscador de imágenes de la web. Un modelo con visión mira los candidatos y elige **3 que muestren lo mismo desde ángulos o lugares distintos** (no tres casi iguales), descartando las que tengan texto encima, marcas de agua, gente en primer plano o baja calidad.
3. **Generar 3 fondos** en fal.ai, uno por foto, con el modelo de edición (foto real + indicación: conservar el lugar tal cual, vertical 9:16, sacar gente/autos/carteles, luz según el estilo aprendido).
4. **Recortar a la persona** de un cuadro distinto del momento para cada versión (otro gesto), donde se le vea bien la cara.
5. **Componer** la portada estilo Chango en el Estudio (Remotion), reemplazando la de hoy: fondo + persona con halo oscuro + degradé del color de acento de la marca + título en 2 líneas con la fuente de la marca + nombre arriba.
6. **Puntuar en «Para aprobar».** Cada versión muestra su portada, la foto de referencia y de dónde salió. Gero (o el admin/editor del dirigente) pone 👍 o 👎 a la portada, aparte de aprobar o rechazar el video.
7. **Aprender.** El 👍/👎 suma a la memoria de ACM (tabla `learnings`, origen `opinion_dueno`) las variables de estilo de esa portada, y guarda la foto de referencia en un banco del proyecto. Cuando vuelve a salir el mismo lugar, se usan primero las fotos que gustaron; las de 👎 no se vuelven a usar.

### Variables de estilo que se aprenden

Las elige el código (como hoy gancho, subtítulos, ritmo), distintas entre las 3 versiones mientras no haya aprendizaje, y después tiradas hacia las ganadoras:

- `portada_luz`: hora dorada · día claro · atardecer azul · noche con luces
- `portada_plano`: lejos (el lugar entero) · medio · de cerca (un detalle)
- `portada_lado`: persona a la izquierda · derecha · centro

## Objetivos

- Las 3 portadas de un momento se distinguen a simple vista.
- El lugar se reconoce: si habla de la Catedral, es la Catedral de verdad.
- Con el uso, las portadas se parecen más a las que Gero puntuó bien.
- Si algo falla (no hay fotos, fal no responde, no se pudo recortar), la versión sale igual con la portada de hoy. La portada nunca frena una edición.

## Fuera de este diseño

- **Mandar la portada a las redes.** Hoy `publisher.js` no manda `cover_url` a Instagram y TikTok solo acepta un segundo del video. Es el paso siguiente, aparte.
- Portadas de reels que no vienen del editor (los que se suben ya editados).
- Rehacer solo la portada desde «Para aprobar» (hoy se puede pedir con «Rehacer con estos cambios» y el texto; un botón propio queda para después).

## Lo que no puede pasar

- La IA **nunca** toca a la persona: la cara y el cuerpo salen del video, recortados, tal cual. La IA solo hace el fondo.
- En el fondo no aparece gente inventada (se pide sin personas y la revisión lo controla).
- El lugar no se inventa: si no hay foto de referencia del lugar, no se genera un «lugar parecido»; se usa una escena genérica del tema o la portada de hoy.
- Fotos con texto, logos de otros, marcas de agua o caras reconocibles de terceros no se usan como referencia.

## Restricciones

- Las fotos de la web tienen dueño. Se guarda siempre la fuente (URL de la página y de la imagen) y, si se sabe, la licencia; se muestra en «Para aprobar». Wikimedia va primero.
- Costo objetivo por momento ≤ USD 0,15 (3 fondos Seedream 5.5 edit a USD 0,03 + búsqueda + visión + 3 recortes). Al nivel real (7 momentos/día por dirigente) ≈ USD 1/día por dirigente.
- La clave de fal está en `~/.sincro/fal.env` (`FAL_KEY`); hay que llevarla a donde corra el editor, igual que las demás. La del buscador de imágenes la saca Gero (una sola vez).
- El Estudio y el editor hoy corren en la laptop de Gero; no hay servidores todavía. Nada de esto puede necesitar GPU.
- Banco: los casos nuevos van en `editor/banco.mjs` (editor) y `banco.js` (ACM), con fal y el buscador simulados; `npm run banco` antes de cada push.

## Enfoques considerados

- **A — Wikimedia + buscador de imágenes, con la fuente a la vista (ELEGIDO).** Cubre casi cualquier lugar, incluso chicos (un club, una plaza); hace falta para tener 3 ángulos del mismo lugar. Riesgo de licencias acotado por la fuente visible y porque la IA redibuja.
- **B — Solo Wikimedia.** Sin riesgo de licencias ni costo, pero para lugares chicos de San Isidro casi nunca hay 3 fotos y se termina inventando.
- **C — Sin buscar, solo texto a fal.** Lo más barato; inventa los lugares, que es justo lo que falla.

## Decidido por Gero

- Portadas estilo Chango con fondo de IA a partir de una foto real (no de Gemini: por fal.ai, cuenta propia de Gero).
- Las 3 portadas son de las 3 versiones del MISMO momento: mismo tema, 3 fotos de referencia distintas.
- El bot busca solo la referencia según lo que se dice en ese momento; no tiene que ser siempre un lugar.
- Se puntúan dentro de la app y las siguientes aprenden de eso. Aprende el estilo y además reusa las fotos que gustaron (lo eligió Claude al no haber respuesta; Gero no lo objetó).

- **Siempre se recorta al dirigente**, aunque el momento sea una charla con otra persona. Para reconocerlo se carga una foto suya en Ajustes («Foto del dirigente»); se elige el cuadro donde aparece él (comparando caras con esa foto, o con un modelo con visión que mire la foto y los cuadros). Si en el momento no aparece, sale la portada de hoy. Sin foto cargada, se usa el que habla (encuadre por hablante) y se avisa en Ajustes.

## Decisiones de Claude (corregibles)

- **Dónde va cada cosa.** El editor de ACM (`acm/editor/`, ya tiene Claude, red y claves) hace los pasos 1–3: tema → búsqueda → elección de fotos → fondos en fal, y pasa a cada receta `portada.fondo_url` y `portada.referencia {imagen_url, pagina_url, fuente, licencia}`. El Estudio hace 4–5 (recorte y composición). ACM hace 6–7.
- **Modelo de fondo:** Seedream 5.5 edit (`bytedance/seedream/v5.5/edit`, USD 0,03) por defecto; configurable por variable de entorno para pasar a Nano Banana 2 edit (USD 0,08, mejor luz en la prueba) si las de Seedream no gustan.
- **Recorte de la persona:** por fal (modelo de quitar fondo, centavos) para no sumar Python al Estudio; si no queda bien en pelo y bordes, rembg `birefnet-portrait` local como en el prototipo.
- **Puntaje:** 👍/👎 opcional por portada, no estrellas: entra directo al esquema `wins/trials` de `learnings`. Puntuar no aprueba ni rechaza el video.
- **Título:** Haiku ya escribe `portada_texto`; pasa a pedir 2 líneas (`linea1` corta, `linea2` de 1 a 3 palabras, la que va enorme). La fuente y el color de acento salen de la marca del proyecto (Ajustes); si la fuente no trae ¿ ¡, se dibujan dados vuelta como en el prototipo.
- **Banco de fotos del proyecto:** tabla nueva en ACM (`portada_refs`: proyecto, tema/lugar normalizado, imagen_url, pagina_url, fuente, licencia, 👍, 👎). El editor la recibe en `/api/editor/aprendizajes` junto con lo demás.

- **Territorio y nombre.** Hoy el proyecto no tiene un campo de territorio. Se agrega en Ajustes «Territorio» (ej. «San Isidro, Buenos Aires: Boulogne, Martínez, Beccar…»); el editor lo recibe con los aprendizajes y Claude lo usa para buscar y para las escenas de temas que no son un lugar. Sin territorio cargado, solo se usan lugares que se nombran en el momento; si no se nombra ninguno, sale la portada de hoy. El nombre de arriba es el nombre del proyecto.
- **Menos de 3 fotos buenas.** Con 1 o 2 fotos del lugar, las versiones que faltan reusan una de esas fotos con otra luz y otro plano (sigue siendo el lugar real y se distinguen). Con 0, la portada de hoy en las 3.
- **Dónde se guarda y a qué se atribuye el puntaje.** Las variables `portada_*` y la referencia viajan dentro de la receta, que ACM ya guarda por reel (`reels.recipe`). El 👍/👎 es por reel (una versión); suma a `learnings` con el `publico` del reel, igual que aprobar/rechazar, y suma o resta en `portada_refs`.
- **Recorte e imágenes hacia fal.** El editor genera los fondos (manda la foto de referencia a fal como data-URI, como el prototipo) y le pasa al Estudio la URL del fondo. El Estudio baja el fondo, saca el cuadro de la persona, lo manda a fal para quitar el fondo (data-URI) y compone. Las dos partes necesitan `FAL_KEY`.

## Lo que queda para quien lo construya

- Qué buscador de imágenes usar (Brave Search, Serper u otro con API de imágenes y precio por búsqueda) y pedirle a Gero la clave.
- Cómo elegir el cuadro de la persona para cada versión (el «mirar» ya registra qué se ve y quién; el encuadre por hablante ya detecta caras).
- El texto exacto de las indicaciones a Claude y a fal, el tamaño de las imágenes, reintentos y tiempos de espera.
- Cómo se ve el 👍/👎 en «Para aprobar» y en el link compartido, siguiendo lo que ya hay.
