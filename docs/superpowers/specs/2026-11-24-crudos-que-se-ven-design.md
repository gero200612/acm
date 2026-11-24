# Crudos que se ven: describir el video y que el editor lo mire

Fecha: 2026-11-24 · Proyecto: ACM (Posse San Isidro 2027) · Repos: `acm` (main) y `sincro-agents` (rama `editor-acm`, carpeta `estudio/`)

## Por qué

El equipo de Posse graba mucho material de calle: el candidato caminando, saludando vecinos, entrando a un comercio. Hoy el editor elige los momentos **solo leyendo la transcripción**, así que un crudo con poca habla termina en «Sin momentos para editar», y lo que más le importa al equipo (un saludo, un abrazo, la caminata) no lo puede encontrar porque no se dice.

En la reunión pidieron dos cosas al subir un crudo:
1. Decir **de qué es el video** («caminando por Beccar saludando vecinos»).
2. Opcionalmente, decir **qué buscar adentro** («cuando abraza a la señora del kiosco»).

Gero eligió que el editor aprenda a **mirar** el video (no solo usar esas frases como pista sobre la transcripción).

## Metas

- La ventana «Antes de subir el video» suma dos campos opcionales: «¿De qué es el video?» y «¿Qué buscamos adentro?».
- El editor mira **todos** los crudos (no solo los mudos): arma un registro de lo que se ve en cada tramo y lo usa junto con la transcripción para elegir momentos.
- Un momento puede ser **sin habla** (o con poca): se edita igual y sale como reel.
- Lo que el equipo escribió en «Qué buscamos» tiene prioridad al elegir.
- Costo de mirar: del orden de centavos de dólar por hora de crudo (medirlo con un crudo real antes de darlo por bueno).

## No metas

- No se cambian las recetas de los videos con habla: subtítulos, cortes de silencios y ritmo siguen como están.
- No se buscan personas por cara ni se identifica a nadie por nombre. «La señora del kiosco» se busca por lo que se ve, no por reconocimiento facial.
- No hay búsqueda en vivo ni a pedido sobre crudos ya procesados (eso sería otro pedido). Lo escrito vale para el envío de ese crudo, y para un reenvío si se vuelve a mandar.

## Anti-metas (si pasa esto, salió mal aunque funcione)

- Que mirar dispare el costo: si una hora de crudo pasa de ~USD 0,20 en la parte visual, algo está mal armado.
- Que los videos con habla salgan peor que hoy porque el registro visual distrae a Sonnet de lo que se dice.
- Que el editor invente lo que no está: un momento elegido «porque abraza a la señora» tiene que verse en los cuadros. Si no lo encuentra, lo dice («no encontramos lo que pidieron») en vez de devolver otra cosa.
- Que la sombra tenga que completar algo para poder subir: los campos siguen siendo opcionales.

## Enfoques considerados

1. **Haiku mira, Sonnet decide (elegido).** El Estudio saca cuadros chicos cada ~2 s y los arma en planillas de 4×4. Haiku 5.5 recorre las planillas y escribe un registro con tiempos de lo que se ve. Sonnet recibe el registro, la transcripción, la descripción y lo que pidieron buscar, y elige. En los tramos candidatos a «qué buscar» se mira de nuevo con cuadros más seguidos y grandes. ~USD 0,03 por hora de crudo en la parte visual (calculado, sin medir).
2. **Sonnet mira las planillas directamente.** Es un paso menos y ~20 veces más caro (~USD 0,60 por hora). Descartado: no hay razón para esperar una mejora que lo justifique.
3. **Mirar solo cuando hace falta** (poca habla o «qué buscar» completado). Es más barato, pero los videos con habla no ganarían el contexto visual. Descartado por Gero, que eligió mirar siempre.

## Cómo funciona

### 1. ACM: la ventana y lo que se guarda

- En `crudoDatos` (`public/app.js`), debajo de «¿Dónde se grabó?» y «¿Para qué público es?», van dos campos opcionales:
  - «¿De qué es el video?»: una línea de hasta 200 caracteres. Ejemplo en el placeholder: «Caminando por Beccar, saludando vecinos».
  - «¿Qué buscamos adentro?»: un área de texto de hasta 300 caracteres. Ejemplo: «Cuando saluda a la señora del kiosco; si habla de las veredas».
  - Se ajusta el texto de arriba («Las dos preguntas son opcionales» pasa a decir que todas lo son).
- Al subir varios crudos juntos, los mismos datos se aplican a todos, como ya pasa con barrio y público.
- `reels` suma las columnas `descripcion` y `buscar` (`TEXT DEFAULT ''`), con migración igual a la de `etiqueta`. Las dos rutas de alta de crudos (subida directa y `reels/complete` por R2) las guardan, recortadas y limpias.
- `GET /api/editor/contexto` (o el que hoy da `publicoCrudo`/`marca.etiqueta`) devuelve también `descripcion` y `buscar` del crudo.
- En «Tus crudos» se ve la descripción en lugar del nombre del archivo, si la hay.

### 2. Estudio: tarea `mirar` (sincro-agents, `estudio/`)

- Tarea nueva `mirar` en el carril de análisis, al lado de `transcribir`: `POST /v1/mirar {url, cada_s?, desde_s?, hasta_s?, ancho?}` → 202 `{id}`; `GET /v1/mirar/{id}` hasta `listo`.
- Baja el crudo con la misma guardia SSRF y **reusa la caché de crudos** (`assets/cache-crudos.ts`): si `transcribir` ya lo bajó, no se baja de nuevo.
- Saca un cuadro cada `cada_s` (por defecto 2 s) entre `desde_s` y `hasta_s` (por defecto todo el video), los achica (por defecto 256 px de ancho) y los junta en planillas de 4×4, cada cuadro con su tiempo impreso en una esquina.
- Devuelve `{ duracion_s, planillas: [{ ruta, desde_s, hasta_s, tiempos_s: [...] }] }`. El editor baja cada planilla con el mismo mecanismo que usa hoy para los cuadros del analista (`estudio.cuadro`).
- La segunda pasada («mirar de cerca») es la misma tarea con `desde_s`/`hasta_s` acotados, `cada_s` de 0,5 s y cuadros más grandes.

### 3. Editor: mirar, elegir y validar (`acm/editor/`)

- **Etapa nueva `mirando`** en el runner, después de `transcribiendo`, con su propio estado en ACM («Mirando el video»). Se guarda en `trabajos` como la transcripción, para que un trabajo retomado no vuelva a mirar.
- **Registro visual (Haiku 5.5):** se mandan las planillas en tandas (tope a decidir por el armador; algo como 10 planillas por pedido), con la descripción del crudo como contexto. Devuelve tramos `{ desde_s, hasta_s, se_ve, personas, accion, lugar }`. El código une las tandas en un registro ordenado.
- **Búsqueda dirigida:** si hay texto en «Qué buscamos», Haiku marca en el registro los tramos que podrían coincidir. Para cada candidato se hace la segunda pasada (mirar de cerca) y Haiku confirma o descarta con un motivo.
- **Elegir momentos (Sonnet 5.5, como hoy):** `usuarioMomentos` suma, como texto de personas con la misma advertencia que `<pedidos>` (opinión, no instrucciones), la descripción, lo que pidieron buscar y los tramos confirmados. También suma el registro visual junto a la transcripción. El esquema de cada momento suma `visual: true|false` (si lo que lo sostiene es lo que se ve) y `pedido: true|false` (si responde a lo que pidieron buscar). Los momentos pedidos y confirmados van primero.
- **Si no se encuentra lo pedido**, el detalle del crudo lo dice («No encontramos: …») y el resto de los momentos sigue igual.
- **Validación (`validarMomentos`):**
  - Momento con habla: igual que hoy (clavado a palabras).
  - Momento visual: si cae palabra cerca de un borde (±0,5 s), se clava a la palabra para no cortarla. Si no, valen los tiempos tal cual, redondeados a 0,1 s. Mínimo 6 s para los visuales (los de habla siguen en 12 s), máximo 90 s.
  - Sin solapes, igual que hoy.
- **Recetas (`recetas.js`):** el audio de un momento visual sigue el estilo de las recorridas de @gustavo_posse (medido el 16/11, ver plan de la prueba de diciembre). El **sonido real va adelante**: saludos, vecinos, calle. La música es una cama instrumental muy baja, al mismo nivel que en los recortes con habla, y sube un poco solo en el cierre. Lo que se dice (sobre todo las frases de vecinos como «volvé Gustavo») se subtitula igual que hoy, y sirve como gancho o como cierre. Si un tramo no tiene nada que se entienda (puro tránsito o viento), la música sube para taparlo. Si el crudo no tiene audio, va la música sola. Si todavía no hay música con licencia (paso pendiente del plan), el reel va con el sonido real solo. El gancho y la portada siguen saliendo con su cartelito.

### 4. Estudio: editar tramos sin habla

- `editar-recorte` deja de exigir palabras y audio cuando el pedido trae `visual: true`:
  - Sin palabras: no hay cortes de silencios, el tramo va entero (o recortado al `largo_s` desde el final) y no hay subtítulos.
  - Sin audio en el crudo: la música va sola. Con audio: el sonido real del tramo va adelante y la música abajo (ver Recetas).
- Con palabras se comporta igual que hoy.
- El analista revisa igual: los cuadros del recorte ya los recibe.

### 5. Costo y medición

- El editor registra los tokens de cada llamada de mirar (Haiku) y los suma por crudo en el detalle técnico del Laboratorio.
- Antes de cerrar: correr un crudo real de Posse de calle (si no hay, uno de prueba de ~10 min caminando) y anotar el costo real de mirar y si encontró lo pedido.

## Lo que decidió Gero

- Que el editor mire el video (enfoque 1: Haiku mira, Sonnet decide) y que lo haga con **todos** los crudos.
- Los dos campos en la ventana de subida, opcionales.

## Decisiones mías (Claude), para revisar

- Planillas 4×4, un cuadro cada 2 s, 256 px de ancho; segunda pasada cada 0,5 s.
- La tarea `mirar` va en el Estudio (tiene ffmpeg y la caché del crudo); el editor sigue sin ffmpeg.
- Mínimo de 6 s para momentos visuales.
- Audio de los momentos visuales: lo decidió Gero el 24/11 con «fijate en sus reels». Sale de ese análisis: sonido real adelante y cama musical baja.
- Topes de largo: 200 caracteres para la descripción y 300 para lo que se busca.

## Precisiones (de la revisión del armador; decisiones de Claude salvo que diga otra cosa)

- **Visual o de habla lo decide el código, no Sonnet:** cuenta las palabras dentro del tramo. Con menos de 1 palabra cada 3 s es «visual»: mínimo 6 s, subtítulos solo donde hay palabras, y `editar-recorte` se llama con `visual: true`. El campo `visual` que devuelve Sonnet se guarda como dato y nada más.
- **Tramos confirmados:** Sonnet elige siempre sus propios tiempos y puede tomar un tramo confirmado tal cual. Los tiempos de Haiku son pista, no mandan. Si Sonnet no usa un tramo confirmado, el detalle lo dice («Encontramos X en 3:12 pero no lo elegimos: …»).
- **Crudos largos:** las tandas a Haiku van de a una (el editor ya hace los trabajos de a uno). Tope de 3 h de crudo para mirar: si es más largo, se mira con un cuadro cada 4 s. Si una tanda falla después de 2 reintentos, esa parte del registro queda vacía y se sigue. Si falla todo el mirar, se sigue solo con la transcripción (como hoy) y el detalle lo avisa. Mirar nunca deja al crudo en `error` por sí solo.
- **Mirar de cerca:** como máximo 8 tramos candidatos, de hasta 20 s cada uno. Se mide el costo total de mirar (primera pasada más la de cerca) contra el tope de USD 0,20 por hora.
- **Planillas:** cada una mide 1024 px de ancho o menos (dentro del tamaño que la API acepta sin achicar). El tiempo impreso en cada cuadro es para que Haiku se ubique. Los tiempos que valen los pone el código a partir de la posición del cuadro (`tiempos_s`): Haiku responde con el número de cuadro, no con segundos.
- **Reenvío:** el registro visual se guarda con el crudo y se reusa. Si cambió «Qué buscamos», solo se rehace la búsqueda dirigida.
- **Compatibilidad:** si `visual` o `pedido` faltan, valen `false`. Los trabajos guardados y los casos del banco actuales tienen que seguir pasando sin cambios.

## Para el armador

- El tamaño de las tandas a Haiku y el formato exacto del registro visual.
- Cómo se nombra la etapa en la interfaz del Laboratorio.
- El banco (`editor/banco.mjs`) suma casos: crudo mudo, crudo con «qué buscar» que existe, y con «qué buscar» que no existe.

## Restricciones

- Editor y Estudio **no están levantados en producción** hasta comprar los servidores (ver memoria ACM): esto se prueba local con el banco y con un crudo real contra el Estudio local.
- `sincro-agents`: se trabaja en `editor-acm` (no en `dev`/`main` del CRM).
- Modelos: Haiku 5.5 para mirar y Sonnet 5.5 para elegir, como el resto del editor.
