# Recorrido por roles: arreglos y «rehacer con los cambios pedidos»

Gero, 22/11/2026: recorrido completo como dueño, admin del dirigente, editor y sombra (copia local con los reels de Posse) → «arreglá todo». Más: cuando se rechaza una edición, que ahí mismo se pueda rehacer con los cambios pedidos (hoy el rechazo queda solo como aprendizaje).

## Errores
- [x] «Rechazar lo marcado» aprobaba sin avisar las versiones no marcadas: decisión por versión (👍/👎) y nada se aprueba sin que lo elijan
- [x] Subir crudo: falta el campo del barrio (el código lee `#up-etiqueta` pero no está en ninguna pantalla)
- [x] Un solo estado por reel en todas las pantallas: Tablero (Publicado contaba 0 con 16 publicadas; Para aprobar contaba versiones y la pestaña recortes), chip de Reels («Borrador» en reels aprobados y publicados)
- [x] Reels: sin «Aprobar» paralelo (se aprueba solo en Para aprobar) y sin «Repartir» un reel que espera aprobación o fue rechazado
- [x] «@@VolveGustavo» (doble arroba), «7.080 seg.» → seguidores, «Socios alcanzados» en un proyecto político
- [x] «Lo que mejor anduvo» con todo en 0 vistas: no se muestra sin números; textos cortados en las tarjetas de Inicio

## Para aprobar (editor)
- [x] Cada recorte con su título real y contexto: de qué crudo sale, barrio, público, duración
- [x] Corregir el texto y los hashtags de una versión antes de aprobarla
- [x] Al aprobar, decir dónde y cuándo sale (cuentas y primera fecha)
- [x] Aprobados recientes livianos (portada, sin cargar todos los videos)

## Rehacer con los cambios pedidos
- [x] Editor (orquestador): `POST /rehacer` con la edición y lo que pidió la persona → Claude traduce el pedido a la receta (y recorte si pide más corto) → edita de nuevo y entrega una versión nueva del mismo recorte
- [x] ACM: cada versión que no va lleva su comentario y una casilla «Rehacer con estos cambios» (apagada: Gero 22/11, solo se rehace si el editor la tilda) que manda el pedido al editor; el recorte muestra «Rehaciendo con tus cambios…» hasta que llega la versión nueva, que vuelve a Para aprobar
- [x] Banco: casos de rehacer (ACM y editor)

## Admin del dirigente: sin lo técnico
- [x] Pauta: conectar Meta Ads / TikTok Ads / Google Ads solo para el general; TikTok Ads no aparece si TikTok no tiene pauta
- [x] Investigación: importar JSON y el nombre del modelo solo para el general; Memoria solo para el general

## Pauta
- [x] Detalle semana a semana plegado (las primeras semanas + «ver todas») y el eje del gráfico legible

## Celular y sombra
- [x] Encabezado compacto y pestañas que entran en el celular; «Subir video» en vez de «Arrastrá» en pantallas táctiles
- [x] Sombra: texto sin «Para aprobar»; cada crudo dice en qué va (en el editor, N ediciones, aprobadas, publicadas) y la fecha legible

## Cierre
- [ ] Banco completo, recorrido de nuevo con los cuatro roles en la copia local, push (Gero da el ok)
