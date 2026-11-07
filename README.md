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
- Falta: probar la publicación contra cuentas reales; crear el público personalizado y la campaña de Meta Ads con el padrón.
