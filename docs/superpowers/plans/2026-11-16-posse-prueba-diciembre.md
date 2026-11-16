# Posse: prueba de diciembre

Las 8 cuentas son **de periferia**: no son de Posse ni hablan como él. Son cuentas con rol propio que suben recortes de su material.

Objetivo: arrancar el 1/12 con la prueba que se acordó en la reunión del 16/11. Son 8 cuentas (2 por red en IG, FB, YT y TikTok; una cuenta para mayores y otra para jóvenes) y 18 ediciones por día, de las que se suben 6, o sea 24 publicaciones diarias.

Material de referencia: 6 reels de @gustavo_posse en `~/Documents/acm/posse/reels/`, con las hojas de cuadros en `hojas/`.

## Estilo de edición de la cuenta principal

Base de comparación: en 41 reels (marzo a noviembre de 2026), la mediana es de 647 likes y 67 comentarios. En los posts de feed es de 386 likes. Todos los reels son 720×1280, duran entre 38 y 76 s, tienen el audio parejo (−17 a −18 dB) y la voz en primer plano.

| Formato | Reel de ejemplo | Likes | Cómo está editado |
|---|---|---|---|
| **Recorrida con vecinos** | DfvFpOcB8Fc (Béccar), DffnoI8sHur, DfGJm8fhoLZ | 1.598 · 1.343 · 1.095 | Cámara en mano siguiéndolo de espaldas o de costado. Corta cada 2 a 4 s (17 a 21 cortes). Subtítulos de 1 a 3 palabras en MAYÚSCULAS blancas con sombra, a media altura. Arriba, una etiqueta fija con el barrio («BÉCCAR ❤️»). Lo que más se repite es la frase del vecino: «VOLVÉ GUSTAVO», «¿CUÁNDO VUELVE?», «VOLVÉ HERMANO». Tiene destellos en blanco y negro. |
| **A cámara en el lugar del problema** | DXzKE8RtcV3 (colectivo 707) | **5.630 / 941 com.** (el mejor) | Plano medio fijo en la parada. Subtítulos con la frase entera, en minúscula, chicos. Tiene B-roll (el colectivo y una vista desde adentro) y un mapa animado en un círculo con íconos de las líneas. El tono es de propuesta: «queremos ayudar al Municipio». |
| **Emotivo / archivo** | Dc851ZjhOB9 (su papá, Melchor) | 1.649 | Fotos y video de archivo con zoom lento. Él a cámara en una plaza. Subtítulos en MAYÚSCULAS. |
| **Charla con vecinos** | DdpTVCxhRaF (seguridad) | 1.151 | Grabado en una reunión de noche, con una sola cámara y casi sin cortes. Subtítulos de palabra clave que cambian de tamaño, con algunas palabras resaltadas en **verde lima** («SEGURO», «EL POZO»). |

Elementos de marca: el acento verde lima (está en los subtítulos y en el título «MI VIDA ES SAN ISIDRO» con la S en verde), «GUSTAVO POSSE» en chico arriba del título y el blanco y negro como recurso.

Lo que sale de esto para el editor:
- Subtítulos: MAYÚSCULAS, de 1 a 3 palabras, blancos con sombra, con el acento verde lima en la palabra clave. Es parecido a lo que ya hace la receta de Efaysto, pero cambia el color.
- Etiqueta del barrio arriba cuando el crudo es de una recorrida.
- Si en el crudo hay una frase de un vecino («volvé», «¿cuándo vuelve?»), va como gancho o como cierre: es lo que más rinde en la cuenta.
- Duración: hasta 60 s. Así entra en Shorts y en TikTok sin problemas, y FB tiene tope en 90.
- Música (medida en el espectro del audio el 16/11): la voz manda siempre. Debajo hay una cama musical muy baja que se nota sobre todo en el cierre, cuando termina de hablar (707, recorridas). En la charla de seguridad no hay. No hay canciones de moda: es un fondo instrumental suave.
- Pendiente: transcribir los 6 para medir cuántas palabras lleva cada subtítulo (en esta máquina no hay Whisper).

## Mayores y jóvenes (borrador, lo define Gero)

- **Mayores:** recorridas emotivas, gestión (colectivo, seguridad, veredas), archivo y familia. Ritmo como el de la cuenta principal.
- **Jóvenes:** cortes más rápidos (1,5 a 2 s), gancho en el primer segundo, los chicos en bici, humor y momentos espontáneos. Que no repita contenido con la de mayores (regla del 16/11).

## Pasos

### Semana 17–23/11: cerrar lo que bloquea
- [ ] Okey del equipo de Posse (~20/11) y definir quién graba
- [x] Cómo llegan los crudos — el equipo los sube en la pestaña Contenido de ACM como «Crudo», igual que ahora (Gero, 16/11)
- [x] Cómo se presentan las 8 cuentas — de periferia, no de Posse (Gero, 16/11). Ojo con la política de comportamiento inauténtico de Meta (ver `estrategia-campana-2026-11-11.md`)
- [x] Usuarios y roles en ACM (general, administrador de dirigente, sombra) — spec en docs/superpowers/specs/2026-11-16-roles-design.md
- [ ] Dar de alta al equipo de Posse (administrador y sombras) cuando dé el okey
- [ ] Generar los roles de las 8 cuentas (nombre, a quién le habla, tono, qué recorta del crudo; mayores y jóvenes sin contenido repetido) y que el editor los use. Hoy ACM no guarda un rol por cuenta
- [ ] Conseguir o comprar las 8 cuentas y conectarlas en ACM (proyecto 3)
- [ ] Comprar los 2 servidores en Contabo (editor y normal)
- [ ] Arreglar `editor/claude.js`: fuerza `tool_choice` con Sonnet 5.5 y la API lo rechaza (400)
- [ ] Cargar ANTHROPIC_API_KEY y crear el bucket R2 `acm-media` (CORS + token) con vps/apps.py
- [ ] Ver cómo están las aprobaciones: Meta (17 permisos, enviados el 31/10), TikTok producción (sin auditoría solo publica en privado) y verificación de Google — 16/11: TikTok y Google siguen en revisión

### Semana 24–30/11: el editor aprende el estilo
- [ ] Desplegar el editor y el Estudio en el servidor nuevo (EDITOR_URL/TOKEN/PUBLIC_URL, TELEGRAM_*)
- [ ] Cargar los 6 reels como referencias del proyecto 3, cada uno con una nota de qué tomar
- [ ] Receta de Posse: subtítulos en MAYÚSCULAS con acento verde lima, etiqueta del barrio, frase del vecino como gancho y tope de 60 s
- [ ] Música con licencia en /datos/musica (o decidir que va sin música)
- [ ] Pedir 2 o 3 crudos reales de prueba y pasarlos por el editor de punta a punta
- [ ] Gero revisa en «Para aprobar» y se ajusta hasta que aprueba 19 de 20

### Diciembre: la prueba
- [ ] 1–7/12: modo manual. 18 ediciones por día, todas pasan por aprobación y se suben 6 (24 publicaciones)
- [ ] Informe semanal de los lunes: vistas y likes por cuenta contra la base (mediana de 647 likes en la principal)
- [ ] 8–31/12: pasar a automático si se mantiene 19 de 20, y ajustar horarios con «mejores horarios»
- [ ] Cierre: informe para Posse con lo que rindió, por red y por público
