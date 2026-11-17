# Meta aprobada: conectar con botón (ACM, demo y Efaysto)

Gero, 17/11/2026: la revisión de Meta (17 permisos, submission 1428735972133497) salió aprobada → «empezá a desarrollar todo».

## ACM: «Conectar con Facebook»
- [x] sincro-wa: capacidad `autorizar` + `POST /autorizar-pagina` (token de la página sin registrarla como canal) — multicodigo-back 6c1e4f4
- [x] ACM: botón «Conectar con Facebook» en cuentas de Instagram/Facebook y en Meta Ads (SDK de JS + canje por sincro-wa, elegir página/cuenta) + banco (4 casos) + vps/meta.py
- [x] Pushear multicodigo-back (despliega sincro-wa) y ACM (Gero da el ok) — 17/11, 6c1e4f4 y 16b4be3
- [ ] Meta, app 1410095257330902: agregar https://acm.punchi.dev a «Dominios permitidos para el SDK de JavaScript» (Gero o Claude con el Chrome)
- [ ] `ssh vps "python3 -" < vps/meta.py` (negocio ACM en sincro-wa + variables en Coolify + redespliegue)
- [ ] Probar en acm.punchi.dev con la página Sincro / @sincro_ar (proyecto «Demo para Google», id 2) y la cuenta publicitaria Homer

## Demo y Efaysto
- [ ] Demo (demo.apps.punchi.dev): probar Conectar Facebook e Instagram y Conectar anuncios con el botón (antes daban #3 y #200)
- [ ] Efaysto: `Meta__PagesConfigId` de /root/env/efaysto-back.env → 1462375322666999 (Gero corre el comando en Contabo) y reconectar con el botón
- [ ] Efaysto: mensajes y comentarios en vivo (bandeja) y prender el interruptor de acciones en Meta
- [ ] Limpieza: borrar el post de IG DfIbWoZDIbd y la campaña «Prueba revisión Meta» 120255658350160029
