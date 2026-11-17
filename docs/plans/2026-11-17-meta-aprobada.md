# Meta aprobada: conectar con botón (ACM, demo y Efaysto)

Gero, 17/11/2026: la revisión de Meta (17 permisos, submission 1428735972133497) salió aprobada → «empezá a desarrollar todo».

## ACM: «Conectar con Facebook»
- [x] sincro-wa: capacidad `autorizar` + `POST /autorizar-pagina` (token de la página sin registrarla como canal) — multicodigo-back 6c1e4f4
- [x] ACM: botón «Conectar con Facebook» en cuentas de Instagram/Facebook y en Meta Ads (SDK de JS + canje por sincro-wa, elegir página/cuenta) + banco (4 casos) + vps/meta.py
- [x] Pushear multicodigo-back (despliega sincro-wa) y ACM (Gero da el ok) — 17/11, 6c1e4f4 y 16b4be3
- [x] Meta, app 1410095257330902: agregar https://acm.punchi.dev a «Dominios permitidos para el SDK de JavaScript» (Gero o Claude con el Chrome)
- [x] `ssh vps "python3 -" < vps/meta.py` — 17/11, negocio ACM = 4 en sincro-wa, variables cargadas, redespliegue a5uvtmn40bg19j4vnxmlnahf (negocio ACM en sincro-wa + variables en Coolify + redespliegue)
- [x] Probar en acm.punchi.dev con la página Sincro / @sincro_ar — 17/11 en «Demo para revisiones» (id 2): «Conectada como @sincro_ar · 231 seguidores»; cuenta de prueba borrada
- [x] Probar «Conectar con Facebook» de Meta Ads con la cuenta Homer — 17/11 en un proyecto descartable (borrado): «Homer (ARS) act_980029277705534»

## Demo y Efaysto
- [x] Demo (demo.apps.punchi.dev): probar Conectar Facebook e Instagram y Conectar anuncios con el botón (antes daban #3 y #200) — 17/11 anda: «Página Sincro · @sincro_ar» y «Homer (act_980029277705534) · ARS»
- [x] Efaysto: `Meta__PagesConfigId` de /root/env/efaysto-back.env → 1462375322666999 (Gero corre el comando en Contabo) y reconectar con el botón — 17/11: se sumó también Meta__AdsConfigId=1103102822587035 (faltaba); «Página Efaysto · @efaysto.oficial» y «Efaysto (act_489381437402565) · USD»
- [ ] Efaysto: mensajes y comentarios en vivo (bandeja) y prender el interruptor de acciones en Meta
- [ ] Limpieza: borrar el post de IG DfIbWoZDIbd y la campaña «Prueba revisión Meta» 120255658350160029
