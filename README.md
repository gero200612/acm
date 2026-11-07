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

## Estado

- Hecho: proyectos, cuentas, subida de reels, reparto con horarios separados, calendario, calculadora de pauta.
- Falta: conexión real con las redes (OAuth de Meta / TikTok / YouTube) y publicación automática; hoy el estado de cada cuenta y publicación se marca a mano.
