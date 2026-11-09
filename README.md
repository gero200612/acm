# ACM — Agentic Campaign Manager

Panel para administrar campañas multicuenta: proyectos (dirigentes o candidatos), su ecosistema de cuentas en Instagram, Facebook, TikTok y YouTube, los reels ya editados, el calendario de publicación y el cálculo de pauta sobre el padrón.

## Correr local

```
npm install
npm run dev        # http://localhost:3000, contraseña "admin"
```

## Variables

| Variable | Para qué |
|---|---|
| `ACM_PASSWORD` | contraseña del panel (obligatoria en producción) |
| `ACM_SECRET` | firma de la sesión; si cambia, todos vuelven a entrar |
| `ACM_DATA` | carpeta de la base SQLite y los videos (en Docker: `/data`, va en un volumen) |
| `EDITOR_URL` | dirección del orquestador de ediciones; sin ella los crudos quedan `en_cola` y no pasa nada |
| `EDITOR_TOKEN` | clave compartida con el orquestador (la misma en los dos lados) |
| `EDITOR_PUBLIC_URL` | dirección pública del orquestador: de ahí, y solo de ahí, ACM baja las ediciones |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | avisos y resumen diario por Telegram; sin ellos no se manda nada (los avisos quedan anotados) |
| `YOUTUBE_DAILY_QUOTA` | publicaciones de YouTube por día entre todos los proyectos (100 si falta) |
| `ACM_MARKETING_CYCLE` | `off` apaga el ciclo de pauta de cada 6 h |
| `ACM_YT_ANALYTICS` | `1` pide también las métricas de YouTube Analytics (necesita un permiso aparte) |

## Avisos por Telegram
Cada minuto ACM manda por Telegram los avisos anotados (`falla`, `tope`, `falta_material`, `red_bloqueada`, `pausa_imposible`, `editor_atrasado`, etc.), en español y con el nombre del proyecto. Un aviso se anota una sola vez por proyecto, tipo y día, y además no se manda si ya salió otro del mismo tipo y proyecto hace menos de 6 h. Un aviso que no se pudo mandar en 24 h se descarta. A las 22:00 (hora de la campaña) sale el resumen del día por cada proyecto que no es de demostración: lo publicado, lo gastado, lo que queda de pauta, el ganador y por qué, y lo aprendido. `editor_atrasado` salta cuando un crudo lleva más de 24 h en una etapa del editor sin terminar. Para crear el bot: @BotFather, y el `TELEGRAM_CHAT_ID` sale de escribirle al bot y abrir `https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Editor de ediciones en el servidor (Contabo Cloud VPS 30)
El crudo que se sube a ACM viaja al orquestador (`editor/`), que lo transcribe en una instancia del Sincro Estudio, elige momentos con Claude, pide los recortes editados y se los devuelve a ACM. ACM sigue corriendo en Coolify; en el VPS de Contabo van el Estudio y el orquestador. Desplegarlos lo hace Gero a mano: el servidor todavía no está.

**1. Sincro Estudio para ACM** (repo `sincro-agents`, carpeta `estudio/`, rama `editor-acm`). Una instancia propia, aparte de la de Efaysto, con su empresa y su clave:
- `ESTUDIO_CACHE_CRUDOS_BYTES`: tope de disco para los crudos que baja (por ejemplo `20000000000`); pasado el tope se borran los más viejos.
- Volumen de música en `/datos/musica` (la música de las recetas, sin copyright; que persista entre reinicios).
- Que el trabajo de edición use como mucho 6 núcleos (`cpus: 6` en el compose o `--cpus=6`): el VPS 30 tiene 8 y el resto es para el orquestador y el sistema.
- La empresa y la clave que se creen acá son las `ESTUDIO_EMPRESA` y `ESTUDIO_CLAVE` del orquestador.

**2. Orquestador** (`editor/Dockerfile`, Node 24, puerto 4000, base en `/data` con volumen):
```
docker build -t acm-editor ./editor
docker run -d --name acm-editor --restart unless-stopped -p 4000:4000 -v acm-editor-data:/data \
  -e ACM_URL=https://acm.punchi.dev -e EDITOR_TOKEN=... -e EDITOR_PUBLIC_URL=https://editor.punchi.dev \
  -e ESTUDIO_URL=http://estudio:PUERTO -e ESTUDIO_EMPRESA=acm -e ESTUDIO_CLAVE=... -e ANTHROPIC_API_KEY=... acm-editor
```
`EDITOR_PUBLIC_URL` tiene que ser una dirección https alcanzable desde ACM (túnel o proxy), sin token: ahí se sirven las ediciones listas con nombre imposible de adivinar.

**3. ACM** (Coolify): `EDITOR_URL` (la del orquestador), `EDITOR_TOKEN` (la misma), `EDITOR_PUBLIC_URL` (la misma que arriba), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, y si hace falta `YOUTUBE_DAILY_QUOTA`, `ACM_MARKETING_CYCLE`, `ACM_YT_ANALYTICS`. Se cargan en Coolify con `vps/apps.py` (usa las mismas variables desde `~/.sincro/acm-apps.env`) y se redespliega.

`docker-compose.yml` trae el orquestador como servicio opcional (perfil `editor`, comentado): `docker compose --profile editor up -d`. Para probar todo sin servidor: `npm run banco` y `node editor/banco.mjs`.

## Cómo publica

Cada 30 segundos un programador busca publicaciones del calendario que ya llegaron a su hora (en hora argentina, `ACM_TZ`) y las sube de a una:

| Red | Cómo |
|---|---|
| Instagram | Reels con subida reanudable de Meta (el video va directo, sin link público) |
| Facebook | Reels de la Página (`video_reels`) |
| YouTube | Shorts por subida reanudable (vertical y corto) |
| TikTok | Content Posting API con subida del archivo; hasta que TikTok aprueba la app, sale como privado |

Estados: programado → publicando → publicado / falló (con el motivo que dio la red). No publica con la cuenta pausada o sin conectar ni después de la fecha máxima de propaganda. `ACM_SCHEDULER=off` lo apaga.

Para probar sin cuentas reales: `tools/simulador.mjs` (instrucciones arriba del archivo).

## Estado

- Hecho: proyectos, cuentas conectadas por la vía oficial (tokens cifrados), padrón (solo huellas SHA-256), reels, reparto, calendario, publicación automática, calculadora de pauta.
- Meta Ads: el padrón sube como público personalizado (solo huellas, tandas de 10.000) y la campaña de alcance se crea EN PAUSA con tope de frecuencia semanal y un anuncio por reel publicado en Instagram.
- Falta: probar todo contra cuentas reales (está probado contra `tools/simulador.mjs`).
