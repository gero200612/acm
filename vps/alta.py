#!/usr/bin/env python3
"""Da de alta ACM en multicuenta.punchi.dev (VPS de OVH, Coolify), en lugar del sitio de la propuesta.

Se corre EN el VPS como root:  ssh vps python3 - < vps/alta.py
- El sitio de la propuesta (multicuenta-web) NO se borra: pasa a propuesta-multicuenta.apps.punchi.dev.
- ACM se crea desde el repo público con su volumen /data (base y videos) y sus variables.
- La contraseña del panel se genera una sola vez (/root/env/acm.secret, 0600) y se manda por Telegram: no se imprime.
Se puede correr de nuevo: no duplica nada.
"""
import json
import os
import secrets
import string
import urllib.request

DOMINIO = 'multicuenta.punchi.dev'
PROPUESTA = 'propuesta-multicuenta.apps.punchi.dev'
ZONA = 'punchi.dev'
IP = '158.69.192.117'
REPO = 'https://github.com/gero200612/acm'
SERVIDOR = '9ej6of76shhzldaokrsxpe1l'
COOLIFY = 'http://localhost:8000/api/v1'
SECRETO = '/root/env/acm.secret'


def leer(ruta):
    with open(ruta) as f:
        return f.read().strip()


def pedir(metodo, url, tok, cuerpo=None, auth='Bearer'):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={
        'Authorization': f'{auth} {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            texto = r.read().decode()
            return json.loads(texto) if texto else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{metodo} {url.split("?")[0]} -> {e.code}: {e.read().decode()[:400]}')


co = leer('/root/coolify.token')
coolify = lambda m, p, c=None: pedir(m, f'{COOLIFY}{p}', co, c)

# 1. Secretos (una sola vez)
os.makedirs('/root/env', exist_ok=True)
if not os.path.exists(SECRETO):
    letras = string.ascii_letters + string.digits
    clave = '-'.join(''.join(secrets.choice(letras) for _ in range(6)) for _ in range(4))
    with open(os.open(SECRETO, os.O_WRONLY | os.O_CREAT, 0o600), 'w') as f:
        f.write(f'ACM_PASSWORD={clave}\nACM_SECRET={secrets.token_hex(32)}\n')
    nueva = True
else:
    nueva = False
sec = dict(l.split('=', 1) for l in leer(SECRETO).splitlines() if '=' in l)
print(f'Secretos: {SECRETO} ({"nuevos" if nueva else "ya estaban"})')

# 2. DNS (nube gris)
cf = leer('/root/cloudflare.token')
base = 'https://api.cloudflare.com/client/v4'
zona = pedir('GET', f'{base}/zones?name={ZONA}', cf)['result'][0]['id']
reg = pedir('GET', f'{base}/zones/{zona}/dns_records?name={DOMINIO}', cf)['result']
if reg and reg[0]['content'] == IP:
    print(f'DNS: {DOMINIO} ya apunta al VPS')
elif reg:
    pedir('PATCH', f'{base}/zones/{zona}/dns_records/{reg[0]["id"]}', cf, {'type': 'A', 'content': IP, 'proxied': False})
    print(f'DNS: {DOMINIO} corregido a {IP}')
else:
    pedir('POST', f'{base}/zones/{zona}/dns_records', cf, {'type': 'A', 'name': DOMINIO, 'content': IP, 'proxied': False, 'ttl': 1, 'comment': 'ACM en Coolify'})
    print(f'DNS: creado {DOMINIO} -> {IP}')

# 3. El sitio de la propuesta se muda (no se borra)
apps = coolify('GET', '/applications')
acm = next((a for a in apps if a.get('name') == 'acm'), None)
viejo = next((a for a in apps if a.get('name') != 'acm' and DOMINIO in (a.get('fqdn') or '')), None)
if viejo:
    coolify('PATCH', f'/applications/{viejo["uuid"]}', {'domains': f'https://{PROPUESTA}'})
    coolify('POST', f'/deploy?uuid={viejo["uuid"]}')
    print(f'Propuesta: {viejo["name"]} pasa a https://{PROPUESTA}')
else:
    print('Propuesta: ninguna otra app usa el dominio')

# 4. ACM
if acm:
    uuid = acm['uuid']
    print(f'Coolify: ACM ya existe ({uuid})')
else:
    proyectos = coolify('GET', '/projects')
    proyecto = next((p['uuid'] for p in proyectos if p.get('name') == 'acm'), None) or \
        coolify('POST', '/projects', {'name': 'acm', 'description': 'ACM · Agentic Campaign Manager'})['uuid']
    uuid = coolify('POST', '/applications/public', {
        'project_uuid': proyecto, 'server_uuid': SERVIDOR, 'environment_name': 'production',
        'git_repository': REPO, 'git_branch': 'main', 'build_pack': 'dockerfile', 'ports_exposes': '3000',
        'domains': f'https://{DOMINIO}', 'name': 'acm', 'description': 'Agentic Campaign Manager', 'instant_deploy': False,
    })['uuid']
    print(f'Coolify: ACM creada ({uuid})')

# 5. Volumen de datos: base SQLite y videos. Sin él se pierde todo en cada despliegue.
vols = (coolify('GET', f'/applications/{uuid}/storages') or {}).get('persistent_storages', [])
if not any(v.get('mount_path') == '/data' for v in vols):
    coolify('POST', f'/applications/{uuid}/storages', {'type': 'persistent', 'name': 'acm-data', 'mount_path': '/data'})
    print('Volumen: /data creado')
else:
    print('Volumen: /data ya estaba')

# 6. Variables
coolify('PATCH', f'/applications/{uuid}/envs/bulk', {'data': [
    {'key': k, 'value': v, 'is_preview': False, 'is_literal': True}
    for k, v in {'ACM_PASSWORD': sec['ACM_PASSWORD'], 'ACM_SECRET': sec['ACM_SECRET'], 'NODE_ENV': 'production'}.items()]})
print('Variables: cargadas')

# 7. Desplegar
d = coolify('POST', f'/deploy?uuid={uuid}')
print('Desplegando:', (d.get('deployments') or [{}])[0].get('deployment_uuid'))

# 8. La contraseña va por Telegram, no por pantalla
if nueva:
    try:
        tg = leer('/root/telegram-acceso.token')
        texto = f'ACM · https://{DOMINIO}\nContraseña del panel: {sec["ACM_PASSWORD"]}\n(guardada en {SECRETO})'
        req = urllib.request.Request(f'https://api.telegram.org/bot{tg}/sendMessage', method='POST',
                                     data=json.dumps({'chat_id': 5843375718, 'text': texto}).encode(), headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=20).read()
        print('Contraseña: enviada por Telegram')
    except Exception as e:
        print(f'Contraseña: no se pudo mandar por Telegram ({type(e).__name__}); está en {SECRETO}')
print(f'Listo en 2 o 3 minutos: https://{DOMINIO}')
