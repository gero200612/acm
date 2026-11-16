# Usuarios y roles en ACM

**Por qué:** para la prueba de Posse, su equipo tiene que poder entrar a ACM para subir crudos y aprobar ediciones. Hoy hay una sola contraseña que da acceso a todo.

## Roles (los definió Gero el 16/11)
1. **Administrador general:** Gero (el dueño, que entra con el mail vacío y la contraseña maestra `ACM_PASSWORD`) y hasta 2 más. Ve y maneja todo.
2. **Administrador de un dirigente:** maneja solamente el proyecto de su dirigente. No ve los otros proyectos, no entra al Laboratorio y no crea ni borra proyectos. Puede dar de alta y borrar sombras de su propio dirigente (decisión de Claude).
3. **Sombra de un dirigente:** no ve números. Solo sube crudos y aprueba ediciones de su proyecto.

## Formas de hacerlo
- **A (elegida): usuarios de verdad.** Mail y contraseña (scrypt). La sesión firmada lleva el id del usuario y una versión que se invalida al cambiar la contraseña o el rol.
- B: estirar los links para compartir. Se descartó porque no hay identidad y un link reenviado le da acceso a cualquiera.

## Diseño
- `users.js`: tabla `users` y `permit()`. Niega por defecto: averigua de qué proyecto es lo pedido según la ruta (proyecto, cuenta, reel, publicación, campaña, recorte, etc.) y lo compara con el del usuario. La sombra tiene una lista cerrada de rutas permitidas. `/media` solo sirve archivos del proyecto del usuario.
- Las listas (proyectos, Inicio, buscador) vienen filtradas. A la sombra le llega el proyecto sin padrón, pauta ni cuentas, y los reels reducidos a los crudos, sin publicaciones.
- Un crudo que sube una sombra siempre queda como «crudo», aunque pida «listo».
- `clip_reviews.reviewer` guarda quién aprobó o rechazó. Los comentarios llevan el nombre del usuario.
- Panel: el login pide mail y contraseña. Hay una pantalla nueva de Usuarios (para el general y el administrador de dirigente). La sombra ve solo dos pestañas, «Subir crudos» y «Para aprobar». El administrador de dirigente entra directo a su proyecto.
- Banco: 4 casos nuevos en «Recorrido: roles» que intentan saltarse los permisos.
