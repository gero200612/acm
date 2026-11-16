# Prueba general en producción (antes del 1/12)

Objetivo: dejar andando la cadena completa con material real de Posse. La cadena es: crudo → editor → Para aprobar → publicación → métricas → aprendizaje por público. Así el 1/12 arranca la prueba de diciembre sin sorpresas.

Estado al 16/11: el desarrollo está cerrado. ACM (`main`), el editor (`acm/editor`) y el Estudio (`sincro-agents` rama `editor-acm`, que **nunca se mergea a dev**) están pusheados y con las pruebas en verde. En producción corre solo ACM (acm.punchi.dev); el editor y el Estudio esperan los servidores.

Quién hace cada paso: **[Gero]** lo hace Gero (pagos, cuentas, contraseñas, aprobaciones). **[Claude]** lo hace Claude, avisando antes de cada `ssh`.

## 1. Servidores y almacenamiento
- [ ] [Gero] Comprar el servidor del editor en Contabo (Cloud VPS 30: 8 núcleos, 24 GB). El editor y el Estudio van juntos ahí, separados del servidor de Efaysto
- [ ] [Gero] Pasarle a Claude el acceso por VPN y Telegram, igual que en el VPS de OVH (`ssh` con clave + Autorizar)
- [ ] [Gero] Crear el bucket R2 `acm-media` en Cloudflare, con CORS para acm.punchi.dev y un token de lectura y escritura. Cargar `ACM_R2_ACCOUNT_ID`, `ACM_R2_ACCESS_KEY_ID`, `ACM_R2_SECRET_ACCESS_KEY` y `ACM_R2_BUCKET` en `~/.sincro/acm-apps.env`
- [ ] [Gero] Correr `! ssh vps "$(sed 's/^/export /' ~/.sincro/acm-apps.env | tr '\n' ';') python3 -" < ~/GitHub/acm/vps/apps.py` y comprobar que la salida dice `Cargadas: … ACM_R2_…`
- [ ] [Claude] Comprobar en Ajustes de ACM que la subida dice «hasta 5 GB» (R2 activo)

## 2. Desplegar el Estudio y el editor
- [ ] [Claude] Estudio: imagen desde `sincro-agents` rama `editor-acm`, con un volumen en `/datos` (caché de crudos hasta 50 GB y música). Crear la empresa «acm» y su clave
- [ ] [Gero] Elegir 6 a 10 pistas de música con licencia (climas `energico` y `calido`). [Claude] las carga en `/datos/musica` con su `indice.json` (`archivo`, `clima`, `bpm`, `licencia`)
- [ ] [Claude] Editor: imagen desde `acm/editor`, con un volumen en `/data`. Variables: `EDITOR_TOKEN` (nuevo, largo), `EDITOR_PUBLIC_URL`, `ACM_URL=https://acm.punchi.dev`, `ESTUDIO_URL`, `ESTUDIO_EMPRESA`, `ESTUDIO_CLAVE` y `ANTHROPIC_API_KEY` (la misma de ACM)
- [ ] [Claude] Dominios con HTTPS para el editor (lo baja ACM) y para el Estudio (solo lo usa el editor; mejor interno o con IP restringida)
- [ ] [Gero] Agregar `EDITOR_URL`, `EDITOR_TOKEN` y `EDITOR_PUBLIC_URL` (y `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` para las alertas) a `~/.sincro/acm-apps.env` y correr `apps.py` de nuevo
- [ ] [Claude] Comprobar las rutas de salud: `GET /v1/salud` del Estudio, `/health` del editor y `/api/health` de ACM. Desde el editor, un `GET /api/editor/aprendizajes/<id>` con el token tiene que devolver 200

## 3. Configurar el proyecto de Posse en ACM
- [ ] [Gero] Foto (Ajustes) e investigación importada (`Desktop/ACM/Posse - investigacion para importar.json`)
- [ ] [Gero] Públicos: **Mayores** (tipo Mayores) y **Jóvenes** (tipo Jóvenes), cada uno con una descripción de una o dos líneas
- [ ] [Gero] Marca de los videos: color `#C6E85A` (verde lima) y largo máximo de 60 s
- [ ] [Gero] Referencias: los 6 reels de @gustavo_posse (Investigación → Referencias), cada uno con una nota de qué tomar
- [ ] [Gero] Revisión **manual** (pasa a automática sola con 19 de 20 aprobados)
- [ ] [Gero] Usuarios: un administrador del equipo de Posse y 1 o 2 sombras (las sombras suben crudos y aprueban)

## 4. Cuentas (2 por red, a nombre de Posse)
- [ ] [Gero + equipo de Posse] Crear o recibir las 8 cuentas: IG, FB, YT y TikTok, una de Mayores y una de Jóvenes por red
- [ ] [Gero] Conectarlas en ACM (Cuentas → Conectar) y tocar «Probar conexión» en cada una
  - Instagram y Facebook: con el token de Página. Mientras Meta revisa los permisos, solo publica en cuentas con rol en la app: sumarlas como evaluadoras
  - YouTube: con un clic (Google, en revisión, ya permite subir en público)
  - TikTok: con un clic. **Sin la aprobación de producción, solo publica en privado**
- [ ] [Gero] Asignarle a cada cuenta su público (columna Público)

## 5. Prueba de humo con UN crudo real
- [ ] [Equipo de Posse o Gero] Subir un crudo real de 3 a 10 minutos (una recorrida, por ejemplo), con la etiqueta del barrio
- [ ] [Gero] Mirar que el estado avance en Reels o en Subir crudos: transcribiendo → buscando momentos → editando → revisando → listo
- [ ] [Gero] En Para aprobar, revisar:
  - que haya recortes de los dos públicos (chip «Para Mayores» o «Para Jóvenes»)
  - que la palabra clave salga en verde y la etiqueta del barrio arriba
  - que ninguno pase de 60 s
  - que el estilo cambie según el público (jóvenes más rápido y corto)
- [ ] [Gero] Aprobar algunos y rechazar otros con un comentario (el comentario le sirve al editor)
- [ ] [Claude] Comprobar en la base que las aprobaciones quedaron anotadas con su público (`learnings.publico`) y que no hubo errores en las alertas del Laboratorio
- [ ] [Gero] Ver el gasto de esa corrida en la consola de Anthropic (referencia: unos centavos por recorte)

## 6. Publicación controlada
- [ ] [Gero] Programar a mano 1 edición aprobada por cuenta, separadas al menos 3 h. TikTok va en privado
- [ ] [Gero] Comprobar que cada una salió en su red, en la cuenta correcta, y que el Calendario la marca publicada
- [ ] [Gero] Intentar programar una de Jóvenes en una cuenta de Mayores: ACM tiene que impedirlo
- [ ] [Claude] A las 24 h, comprobar que se leyeron las métricas (Resumen) y que el ciclo de 6 h no dio errores

## 7. Reparto automático y alertas
- [ ] [Gero] Dejar que el planificador llene un día solo (con ediciones aprobadas en el banco) y revisar el Calendario: horarios, una edición por red y públicos correctos
- [ ] [Claude] Comprobar que llegan las alertas por Telegram (por ejemplo, la de falta de material) y el informe de los lunes
- [ ] [Gero] Definir quién del equipo de Posse aprueba todos los días y a qué hora

## 8. Pauta (no se activa en la prueba)
- [ ] [Gero] Autorización de Meta para anuncios políticos (DNI argentino del responsable + texto del «Pagado por»). Hasta tenerla, no se crean campañas
- [ ] [Gero] Padrón del equipo de Posse: CSV o Excel con celular y mail y con constancia de consentimiento; la consulta legal va antes de subirlo

## 9. Decisión para el 1/12
- [ ] [Gero + Claude] Repasar: crudos procesados sin error, aprobación por público, publicaciones salidas por red y costo por día. Si está todo en verde, arranca diciembre según `2026-11-16-posse-prueba-diciembre.md`
