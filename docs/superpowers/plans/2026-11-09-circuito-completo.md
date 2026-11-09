# Circuito completo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un crudo subido en ACM salga editado, revisado, repartido, publicado y pautado solo, y que el agente aprenda de cada resultado.

**Architecture:** El servidor editor tiene dos piezas: el **Sincro Estudio** (`sincro-agents/estudio`, TypeScript) y el **orquestador** `acm/editor/` (Node). El Estudio corre una instancia propia para ACM y suma dos endpoints, `transcribir` y `editar-recorte`. El orquestador elige los momentos, arma las recetas y hace de analista con Claude, y después le entrega a ACM las ediciones aprobadas. ACM suma el agente de marketing (reparto, pauta cada 6 h y memoria) sobre lo que ya tiene: programador, `ads.js`, simulador y banco.

**Tech Stack:** Node 24 + express + node:sqlite (ACM y el orquestador); TypeScript + fastify + Remotion + Whisper local (Estudio); `@anthropic-ai/sdk`; APIs de Meta Marketing, TikTok Business y Google Ads (solo contra el simulador hasta que haya aprobaciones).

**Spec:** `docs/superpowers/specs/2026-11-09-circuito-completo-design.md`

## Global Constraints

- Una edición va a una sola cuenta por red. Ediciones del mismo recorte en la misma red: **≥ 3 h** entre una y otra. Entre redes distintas no hay restricción.
- Se publica solo de **8 a 23 h**, en la hora local del proyecto (`TZ`). Solo se publican ediciones **aprobadas**.
- Topes por red: IG 100/24 h, FB 30/24 h, TikTok 15/día, YouTube según el cupo de la app, repartido en partes iguales entre los proyectos activos. Además, la fecha máxima de propaganda.
- Formato de salida: 9:16, 1080×1920, duración ≤ **90 s**.
- 3 ediciones por momento. Como máximo **15 momentos** editados por crudo, y el resto queda como candidato.
- Revisión de a recorte. Automático con **19 de los últimos 20** recortes aprobados. Si Gero rechaza uno después, el proyecto vuelve a manual.
- Lo de actualidad vence a los **3 días**.
- Pauta: el ciclo corre **cada 6 h**. El orgánico se deja correr **24 h** antes de promocionar. Tope diario = restante ÷ días restantes, y nunca más de **2×** ese tope en un día. Cada red con pauta conserva un mínimo del **10 %**. Piso para juzgar un reel promocionado: **USD 5 o 48 h**.
- Una campaña por red con pauta y por proyecto. Se promociona la publicación orgánica que ya existe.
- Tipos de proyecto: `club` (Meta, YouTube y TikTok), `politica` (Meta y YouTube; TikTok Ads apagado), `comercial` (las 3). Hay un interruptor por red en cada proyecto.
- Memoria aparte para cada proyecto, sin compartir nada. Las opiniones de Gero pesan más.
- Recetas: **2 de 3** siguen lo que gana y **1** explora algo distinto.
- Cola del editor: los cortos van antes que los largos. Objetivo: corto < 2 h, largo < 12 h. Si el atraso pasa las 24 h, alerta.
- Ningún tope ni regla dura depende del agente: los hace cumplir el código, que rechaza lo que no cumple.
- Nada de pauta contra cuentas reales. Todo se prueba contra el simulador.
- `npm run banco` en ACM y `npm test` en el Estudio tienen que pasar antes de cada commit. En sincro-agents se trabaja en `dev`.

## Review Focus

1. **Crudo sin habla o con un solo momento de 4 s**: tiene que terminar en "sin momentos" con un motivo visible, sin colgarse ni crear ediciones vacías. Lo prueba la Task 6.
2. **Llegan ediciones mientras ya corre el reparto del día**: no puede duplicar publicaciones ni romper la regla de 3 h. Lo prueba la Task 8 (el replanificar es idempotente).
3. **Una red rechaza anuncios a mitad de campaña**: la plata pasa a las otras redes, se alerta y no se reintenta en bucle. Lo prueba la Task 11.
4. **Se termina la pauta o llega la fecha máxima a mitad de un ciclo de 6 h**: se pausa todo en ese mismo ciclo y el gasto no se pasa del total. Lo prueba la Task 10.
5. **Gero rechaza un recorte después de que el proyecto pasó a automático**: vuelve a manual y lo que ya estaba programado y sin aprobar no se publica. Lo prueba la Task 7.

---

## Fase 1 · ACM: datos y reglas duras

### Task 1: Tipo de proyecto, redes con pauta y modelo de recortes

**Files:**
- Modify: `server.js` (migraciones y rutas de proyecto y reel)
- Modify: `public/` (Ajustes del proyecto: tipo e interruptores)
- Test: `banco.js` (casos nuevos del grupo `Circuito`)

**Interfaces:**
- Produces, en la tabla `projects`: `kind TEXT DEFAULT 'club'` (`club|politica|comercial`), `ads_networks TEXT` (JSON `{"meta":true,"youtube":true,"tiktok":false}`, con el valor por defecto según `kind`), `review_mode TEXT DEFAULT 'manual'` (`manual|auto`).
- Produces, en la tabla `reels`: `clip_id TEXT` (id del recorte que comparten las 3 hermanas), `moment TEXT` (JSON `{inicio_s, fin_s, tema, motivo}`), `recipe TEXT` (JSON de la receta), `review TEXT DEFAULT 'pendiente'` (`pendiente|aprobado|rechazado`), `expires_at TEXT DEFAULT ''`, `cover TEXT DEFAULT ''`.
- Produces, en `rules.js`: `defaultAdsNetworks(kind) -> {meta, youtube, tiktok}`.

- [x] Caso de banco: `defaultAdsNetworks('politica')` da `{meta:true,youtube:true,tiktok:false}`, y `'club'` y `'comercial'` dan las tres en `true`.
- [x] Caso de recorrido: crear un proyecto `politica` y leerlo devuelve `kind` y `ads_networks` con TikTok apagado. Un PUT con `kind` inválido da 400.
- [x] Implementar las migraciones con el patrón `cols()` ya existente, las rutas y la UI de Ajustes (select de tipo y 3 interruptores).
- [x] `npm run banco` pasa. Commit.

### Task 2: Reglas duras de publicación

**Files:**
- Modify: `rules.js`, `server.js` (`POST/PUT /api/projects/:id/posts` y `tick()`)
- Test: `banco.js`

**Interfaces:**
- Produces: `scheduleBlocked(post, ctx) -> string|null` en `rules.js`. `post = {reel_id, account_id, network, scheduled_at, clip_id, review}` y `ctx = {siblings:[{network, scheduled_at, account_id}], sameReelSameNetwork:boolean, dayCount:number, networkCap:number, tz}`. Devuelve el motivo en castellano o `null`.
- Produces: `NETWORK_CAPS = {instagram:100, facebook:30, tiktok:15, youtube:null}` y `youtubeShare(totalQuota, activeProjects) -> number`.

- [x] Casos de banco con `scheduleBlocked`, uno por regla: (a) hermana en la misma red a 2 h 59 min → bloqueado, a 3 h → `null`; (b) hermana en otra red a 0 min → `null`; (c) 07:59 y 23:01 bloqueados, 08:00 y 23:00 `null`; (d) `review !== 'aprobado'` bloqueado; (e) `dayCount >= networkCap` bloqueado; (f) `youtubeShare(100, 8) === 12`.
- [x] Caso de recorrido: con 2 reels de un mismo `clip_id` en 2 cuentas IG, el POST del segundo a +1 h da 400 con el motivo y a +3 h da 200.
- [x] En `tick()`, volver a chequear `scheduleBlocked` antes de publicar (una publicación programada antes de un rechazo no sale) y marcarla `bloqueado` con la nota.
- [x] `npm run banco` pasa. Commit.

---

## Fase 2 · Estudio: transcribir largo y editar recorte (repo `sincro-agents`, rama `dev`)

### Task 3: `POST /v1/transcribir` para crudos largos por URL

**Files:**
- Create: `estudio/src/editar/transcribir-largo.ts`
- Modify: `estudio/src/http/app.ts`, `estudio/src/config.ts`, `estudio/README.md`
- Test: `estudio/test/transcribir-largo.test.ts`

**Interfaces:**
- Produces: `POST /v1/transcribir {url}` → `202 {id}`, y `GET /v1/transcribir/:id` → `{estado, progreso, resultado?: {duracion_s, palabras:[{inicio_s, fin_s, texto}], audio:{lufs}}}`.
- Procesa por tramos de 10 min con 2 s de solapamiento y une las palabras sin duplicar las del solapamiento. Límite propio: `ESTUDIO_MAX_DURACION_LARGO_S` (por defecto 10800, 3 h) y `ESTUDIO_MAX_BYTES_LARGO` (5 GB). Baja el video con la guardia SSRF de `assets/descargar`.
- La prioridad en la cola es por duración: menos de 5 min va antes.

- [x] Test: `unirTramos()` con dos tramos solapados devuelve las palabras sin repetir y con los tiempos en segundos del original.
- [x] Test: un crudo de prueba de 3 s con voz (fixture existente) termina `listo` y tiene palabras. Un video mudo termina en `fallo` con el motivo "sin habla".
- [x] Test: la cola saca un trabajo de 60 s antes que uno de 1 h encolado antes.
- [x] Implementar sobre `ojos/whisper.ts` y `cola/`. `npm test` pasa. Commit en `dev`.

### Task 4: `POST /v1/editar-recorte` con receta

**Files:**
- Create: `estudio/src/editar/recorte.ts`, `estudio/src/editar/receta.ts`, `estudio/datos/musica/` (banco con licencia y `indice.json` con `{archivo, clima, bpm, licencia}`)
- Modify: `estudio/src/remotion/Crudo.tsx` (estilos de subtítulos nuevos, texto de gancho, zoom), `estudio/src/editar/subtitulos.ts`, `estudio/src/http/app.ts`, `estudio/README.md`
- Test: `estudio/test/editar-recorte.test.ts`

**Interfaces:**
- Produces: un esquema zod `Receta = {gancho:{desde_s, texto?}, subtitulos:'karaoke'|'placa'|'minimo'|'frase'|'grande', musica:{clima, volumen}|null, ritmo:'lento'|'normal'|'rapido', zoom:boolean, largo_s:number, portada:{segundo_s, texto}}`.
- Produces: `POST /v1/editar-recorte {url, palabras, inicio_s, fin_s, receta}` → `202 {id}`, y `GET /v1/editar-recorte/:id` → `{estado, resultado?: {archivo, portada, duracion_s, receta, tecnica: RevisionTecnica, cuadros:[url…]}}`.
- `ritmo` cambia el umbral de pausas (lento 0,9 / normal 0,7 / rápido 0,35). Corta solo entre palabras y nunca saca algo que se dijo dentro de `[inicio_s, fin_s]`, salvo para respetar `largo_s` cortando frases enteras desde el final.

- [x] Test: el esquema rechaza `largo_s > 90` y `subtitulos` desconocido con 422.
- [x] Test: un recorte con receta `rapido` + `musica:null` da 1080×1920 y ≤ `largo_s`, y la revisión técnica no tiene fallas de `medidas` ni `duracion`.
- [x] Test: con música, la sonoridad queda dentro de la tolerancia (`TOLERANCIA_LUFS`) y la voz por encima de la música.
- [x] Test: la portada es un JPG 1080×1920 con el texto de la receta.
- [x] Implementar reusando `editar/cortes.ts`, `sonido/musica.ts` y `revision/tecnica.ts`. `npm test` pasa. Commit en `dev`.

---

## Fase 3 · Orquestador del editor (`acm/editor/`) y revisión en ACM

### Task 5: Esqueleto del orquestador y entrega a ACM

**Files:**
- Create: `editor/package.json`, `editor/server.js`, `editor/db.js`, `editor/estudio.js`, `editor/acm.js`, `editor/Dockerfile`, `editor/README.md`
- Modify: `server.js` de ACM (rutas `/api/editor/*`, envío del trabajo al terminar la subida del crudo)
- Test: `editor/banco.mjs`, más casos en el `banco.js` de ACM

**Interfaces:**
- ACM → editor: `POST {EDITOR_URL}/trabajos {project_id, reel_id, url, duracion_s, aprendizajes_url}` con `Authorization: Bearer EDITOR_TOKEN` → `202 {id}`.
- Editor → ACM: `POST {ACM_URL}/api/editor/estado {reel_id, estado, detalle}` y `POST {ACM_URL}/api/editor/edicion {crudo_id, clip_id, moment, recipe, caption, hashtags, file_url, cover_url, duration, review}` con `Bearer EDITOR_TOKEN`. ACM baja el archivo a R2 y crea el reel `kind='listo'`, `source_id=crudo_id`.
- Estados del crudo en ACM (`reels.status`): `en_cola|transcribiendo|buscando_momentos|editando|revisando|listo|sin_momentos|error`.
- `estudio.js` exporta `transcribir(url)` y `editarRecorte(pedido)`, que esperan con sondeo hasta `listo` o `fallo`.

- [x] Caso de editor: con un Estudio falso (servidor local que responde al contrato), un trabajo termina llamando a `/api/editor/estado` con `listo`.
- [x] Caso ACM: un `POST /api/editor/edicion` sin token da 401. Con token crea el reel con `source_id`, `clip_id` y `review='pendiente'`.
- [x] Caso ACM: completar la subida de un crudo con `EDITOR_URL` configurado manda el trabajo. Sin `EDITOR_URL` el crudo queda `en_cola` y no hay error.
- [x] Implementar. La base del orquestador es node:sqlite (`trabajos`, `momentos`, `ediciones`). Commit.

### Task 6: Momentos y recetas (Claude)

**Files:**
- Create: `editor/momentos.js`, `editor/recetas.js`, `editor/prompts.js`
- Test: `editor/banco.mjs`

**Interfaces:**
- `elegirMomentos({palabras, investigacion, aprendizajes}) -> [{inicio_s, fin_s, tema, motivo, actualidad:boolean}]`, con Sonnet y salida estructurada. Valida que cada momento empiece y termine en límite de palabra, que dure entre 6 y 90 s y que no se solape con otro. Ordena por interés y corta en 15; el resto va a `momentos.estado='candidato'`.
- `armarRecetas({momento, aprendizajes}) -> [Receta, Receta, Receta]`: las 3 difieren en gancho, subtítulos, música/ritmo y largo/portada. Si hay aprendizajes, 2 siguen las variables ganadoras y 1 cambia al menos 2 variables (`explora:true`). Sin aprendizajes, las 3 se reparten parejo entre las opciones.
- Textos: `caption` y `hashtags` distintos por receta (Haiku).

- [x] Caso: `validarMomentos()` descarta un momento que corta a mitad de palabra, uno de 4 s y uno solapado. Un crudo sin momentos válidos → estado `sin_momentos` con el motivo.
- [x] Caso: con 20 momentos devueltos quedan 15 editados y 5 candidatos.
- [x] Caso: `armarRecetas` sin aprendizajes da 3 recetas que difieren en las 4 dimensiones. Con aprendizajes `{subtitulos:'karaoke'}` ganador, 2 usan karaoke y la tercera tiene `explora:true` y otro estilo.
- [x] Caso: un recorte con `actualidad:true` llega a ACM con `expires_at` = creado + 3 días.
- [x] Implementar. Las llamadas a Claude se inyectan, así el banco usa respuestas grabadas. Commit.

### Task 7: Analista y pantalla «Para aprobar» de a recorte

**Files:**
- Create: `editor/analista.js`
- Modify: `server.js` de ACM (`GET /api/projects/:id/review`, `POST /api/clips/:clip_id/review`), `public/` (pantalla Para aprobar)
- Test: `editor/banco.mjs`, `banco.js`

**Interfaces:**
- `revisar({edicion, tecnica, cuadros, palabras}) -> {veredicto:'aprobado'|'rechazado'|'dudoso', motivo}`. Si la revisión técnica tiene fallas, rechaza sin llamar al modelo. Si no, Sonnet mira entre 6 y 8 cuadros y los subtítulos contra las palabras. Un rechazo se rehace una vez con la receta corregida y, si vuelve a fallar, se descarta.
- ACM: `POST /api/clips/:clip_id/review {decision:'aprobar'|'rechazar', rechazar_ids?:[reel_id], comentario}`. El comentario es obligatorio si se rechaza. Las opiniones van a `learnings` con `origin='opinion_dueno'` (Task 12).
- `reviewMode(projectId)`: pasa a `auto` con 19 de los últimos 20 recortes aprobados. Un rechazo estando en `auto` lo vuelve a `manual`. En `auto`, lo que el analista aprueba entra como `aprobado` sin pasar por Gero, y lo `dudoso` siempre espera.

- [x] Caso: con una falla técnica de `audio_no_mudo` sale `rechazado` sin llamar al modelo (el mock cuenta 0 llamadas).
- [x] Caso: con 19 aprobados y 1 rechazado de 20 → `auto`. Con 18 de 20 → `manual`. Un rechazo estando en `auto` → `manual`.
- [x] Caso de **Review Focus 5**: estando en `auto` hay un reel aprobado y programado. Gero rechaza su recorte: el reel pasa a `rechazado`, su publicación pasa a `bloqueado` y no sale en el `tick()`.
- [x] UI: las 3 ediciones del recorte lado a lado (video, receta resumida, texto), con Aprobar las 3, Rechazar una o todas y comentario.
- [x] Implementar. `npm run banco` pasa. Commit.

---

## Fase 4 · Agente de marketing: reparto

### Task 8: Planificador del día

**Files:**
- Create: `planner.js`
- Modify: `server.js` (corrida a las 07:30 y cuando entra una edición aprobada; `GET /api/projects/:id/plan`)
- Test: `banco.js`

**Interfaces:**
- `planDay({project, accounts, bank, existingPosts, learnings, date, now}) -> [{reel_id, account_id, scheduled_at}]`. Es puro, lo que permite probarlo.
- Algoritmo: ordena el banco por puntaje (aprendizajes y frescura, con lo de actualidad primero si vence pronto) y llena 3 lugares por cuenta conectada. Para cada edición prueba cuentas y horarios, de mejor horario aprendido a peor, en una grilla de 15 min entre 8 y 23 h, y toma el primero que cumpla `scheduleBlocked`. Una edición entra como mucho una vez por red. Lo que no entra queda en el banco.
- Es idempotente: si se vuelve a correr con `existingPosts`, solo agrega lo que falta y nunca mueve ni duplica lo ya programado.
- Saltea vencidos (`expires_at < now`) y no aprobados.

- [x] Caso: con 7 cuentas IG y 21 ediciones aprobadas, cada cuenta queda con 3, todas las publicaciones caen entre 8 y 23 h y ninguna repite edición en IG.
- [x] Caso: las 3 hermanas de un recorte en IG quedan separadas ≥ 3 h.
- [x] Caso de **Review Focus 2**: correr dos veces seguidas con una edición nueva entre medio agrega solo esa, sin duplicar ni mover lo anterior.
- [x] Caso: con 10 ediciones para 21 lugares programa 10 y no repite ninguna. Con banco vacío dos días seguidos se crea una alerta `falta_material`.
- [x] Caso: un reel vencido no se programa.
- [x] Implementar. Commit.

---

## Fase 5 · Métricas y pauta

### Task 9: Métricas por publicación

**Files:**
- Create: `metrics.js`
- Modify: `simulator.js` (insights de IG, FB, TikTok y YouTube), `server.js` (tabla `post_metrics`)
- Test: `banco.js`

**Interfaces:**
- Tabla `post_metrics(post_id, at, views, reach, avg_watch_s, completion, likes, comments, shares, spend, impressions, target_reach)`, con un registro por lectura.
- `readMetrics(network, creds, externalId) -> {views, reach, avg_watch_s, completion, likes, comments, shares}`, una función por red.
- `score(metrics, weights)`: puntaje configurable del proyecto. Por defecto `{target_reach_per_usd:0.5, impressions_per_usd:0.2, completion:0.2, engagement:0.1}`. Sin gasto se usa la parte orgánica normalizada.

- [x] Casos contra el simulador: cada red devuelve sus métricas y se guarda una fila. Un error de API no frena a las otras y deja la nota.
- [x] Caso: `score` premia el mayor `target_reach_per_usd` con los pesos por defecto.
- [x] Implementar. Commit.

### Task 10: Presupuesto y ciclo de 6 h

**Files:**
- Create: `budget.js`, `marketing.js`
- Modify: `server.js` (ciclo cada 6 h; tabla `decisions`)
- Test: `banco.js`

**Interfaces:**
- `dailyCap({budget, spent, from, to, today, spentToday}) -> number`: restante ÷ días restantes, con tope de 2× el tope base.
- `splitNetworks({enabled, perf, prev}) -> {meta, youtube, tiktok}` (porcentajes): arranca parejo entre las habilitadas, corre plata hacia la de mejor `score` y deja un mínimo del 10 % en cada habilitada.
- `marketingCycle(projectId, deps)`: lee métricas, elige qué promocionar (orgánico ≥ 24 h, mejor score), sube o baja y corta. Escribe cada acción en `decisions(project_id, at, kind, target, data, reason)`. Las acciones pasan por `guardSpend(action, state)`, que rechaza todo lo que pase la pauta total o el tope diario.
- Regla de corte: `canJudge({spend, promotedHours}) = spend >= 5 || promotedHours >= 48`. Pasado eso, el agente decide si corta (score bajo el promedio o 3 lecturas cayendo).

- [x] Caso: `dailyCap({budget:1000, spent:400, from:'2026-11-01', to:'2026-11-30', today:'2026-11-21'})` da 60 (600 ÷ 10). Con 3 días sin gastar no pasa de 120.
- [x] Caso: `splitNetworks` con TikTok apagado nunca le da plata. Con Meta muy por encima, YouTube no baja del 10 %.
- [x] Caso: un reel publicado hace 10 h no se promociona. Uno de 30 h con el mejor score sí.
- [x] Caso: `canJudge({spend:4, promotedHours:47})` da `false`, y con `spend:5` o `promotedHours:48` da `true`.
- [x] Caso de **Review Focus 4**: si queda USD 2 de pauta y el ciclo quiere subir USD 10, `guardSpend` lo baja a 2. Pasada la fecha máxima de propaganda, el ciclo pausa todo.
- [x] Implementar. El ciclo usa los adaptadores de la Task 11 detrás de una interfaz. Commit.

### Task 11: Adaptadores de pauta Meta, TikTok y Google contra el simulador

**Files:**
- Modify: `ads.js` (Meta: promocionar una publicación existente, cambiar presupuesto, pausar, leer insights con el público del padrón)
- Create: `ads-tiktok.js` (Spark Ads), `ads-google.js` (Short como anuncio en una campaña de video, Customer Match)
- Modify: `simulator.js` (endpoints de las 3 APIs, rechazo de anuncio simulado)
- Test: `banco.js`

**Interfaces:**
- Interfaz común por red: `ensureCampaign(project)`, `promote(post, dailyUsd)`, `setBudget(adId, dailyUsd)`, `pause(adId)`, `insights(adId) -> {spend, impressions, reach, target_reach|null}`.
- Rechazo: un error de política (`AdRejected`) marca la red como `bloqueada` en el proyecto, `splitNetworks` la deja en 0 y se manda una alerta. No se reintenta hasta que Gero la reactive.

- [x] Casos contra el simulador: con cada red se crea la campaña (una sola por red y proyecto, la segunda llamada reusa), se promociona, se cambia el presupuesto, se pausa y se leen insights.
- [x] Caso de **Review Focus 3**: el simulador rechaza el anuncio en TikTok. La red queda `bloqueada`, el siguiente ciclo reparte entre Meta y YouTube, hay 1 alerta y no hay más intentos.
- [x] Caso: una red sin `target_reach` usa el alcance por segmentación con peso 0,5.
- [x] Implementar. Commit.

---

## Fase 6 · Memoria, vuelta al editor y avisos

### Task 12: Memoria del proyecto

**Files:**
- Create: `memory.js`
- Modify: `server.js` (tablas `comparisons` y `learnings`; `GET /api/projects/:id/memory`; `GET /api/editor/aprendizajes/:project_id` con token del editor), `public/` (pestaña Memoria: decisiones, comparaciones y aprendizajes)
- Test: `banco.js`

**Interfaces:**
- `compareSiblings(clipId)`: cuando las 3 hermanas tienen ≥ 48 h de datos, guarda en `comparisons(clip_id, winner_reel_id, diff, hypothesis)` la receta ganadora, la diferencia de score y una hipótesis escrita por Sonnet.
- `learnings(project_id, variable, value, network, wins, trials, origin, updated_at)`: cada comparación suma `trials` a las variables de las 3 y `wins` a las de la ganadora. `origin='opinion_dueno'` pesa 3×.
- `winningVariables(projectId) -> {gancho?, subtitulos?, musica?, ritmo?, largo?, horario?:{[network]:hora}}`: se considera ganadora una variable con `trials ≥ 5` y la mayor tasa de victorias. Esto es lo que lee el editor.

- [x] Caso: con 3 hermanas y datos simulados, `compareSiblings` elige la de mayor score y actualiza `learnings`.
- [x] Caso: un 👎 de Gero cuenta 3×. `winningVariables` no devuelve nada con menos de 5 intentos.
- [x] Caso: `GET /api/editor/aprendizajes/:id` sin token da 401, y con token devuelve solo los del proyecto pedido.
- [x] Implementar. Commit.

### Task 13: Telegram y despliegue

**Files:**
- Create: `notify.js`
- Modify: `server.js` (resumen diario a las 22:00; alertas), `docker-compose.yml`, `editor/Dockerfile`, `README.md`, `vps/apps.py` (variables `EDITOR_URL`, `EDITOR_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
- Test: `banco.js`

**Interfaces:**
- `alert(kind, projectId, text)`: tipos `falla|tope|falta_material|cuenta|editor_atrasado|red_bloqueada`. Deduplica el mismo tipo y proyecto durante 6 h.
- `dailySummary(projectId) -> string`: lo publicado, lo gastado y lo que queda, el ganador y por qué, y lo aprendido.

- [x] Caso: dos alertas iguales seguidas mandan 1 mensaje (el simulador cuenta los envíos a Telegram). El resumen tiene los 5 bloques.
- [x] Caso: una cola del editor con un trabajo de más de 24 h genera `editor_atrasado`.
- [x] Documentar cómo levantar el Estudio y el orquestador en Contabo. Desplegarlos queda a cargo de Gero (el servidor todavía no está). Commit.
- [ ] Push — pendiente: push con ok de Gero

