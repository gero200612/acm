#!/usr/bin/env python3
"""Pasa ACM a acm.punchi.dev y le devuelve multicuenta.punchi.dev al sitio de la propuesta.

Se corre EN el VPS como root:  ssh vps python3 - < vps/dominio.py
Se puede correr de nuevo: no duplica nada.
"""
import json
import urllib.request

ACM = 'acm.punchi.dev'
PROPUESTA = ['multicuenta.punchi.dev', 'propuesta-multicuenta.apps.punchi.dev']
ZONA = 'punchi.dev'
IP = '158.69.192.117'
COOLIFY = 'http://localhost:8000/api/v1'


def leer(ruta):
    with open(ruta) as f:
        return f.read().strip()


def pedir(metodo, url, tok, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={
        'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            texto = r.read().decode()
            return json.loads(texto) if texto else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{metodo} {url.split("?")[0]} -> {e.code}: {e.read().decode()[:400]}')


# 1. DNS de acm.punchi.dev (nube gris)
cf = leer('/root/cloudflare.token')
base = 'https://api.cloudflare.com/client/v4'
zona = pedir('GET', f'{base}/zones?name={ZONA}', cf)['result'][0]['id']
reg = pedir('GET', f'{base}/zones/{zona}/dns_records?name={ACM}', cf)['result']
if reg:
    print(f'DNS: {ACM} ya existe ({reg[0]["content"]})')
else:
    pedir('POST', f'{base}/zones/{zona}/dns_records', cf, {'type': 'A', 'name': ACM, 'content': IP, 'proxied': False, 'ttl': 1, 'comment': 'ACM en Coolify'})
    print(f'DNS: creado {ACM} -> {IP}')

# 2. Dominios en Coolify: primero se libera multicuenta (ACM), después se le da a la propuesta
co = leer('/root/coolify.token')
apps = pedir('GET', f'{COOLIFY}/applications', co)
acm = next(a for a in apps if a.get('name') == 'acm')
prop = next(a for a in apps if a.get('name') == 'multicuenta-web')
pedir('PATCH', f'{COOLIFY}/applications/{acm["uuid"]}', co, {'domains': f'https://{ACM}'})
print(f'ACM: https://{ACM}')
pedir('PATCH', f'{COOLIFY}/applications/{prop["uuid"]}', co, {'domains': ','.join(f'https://{d}' for d in PROPUESTA)})
print('Propuesta: ' + ', '.join(f'https://{d}' for d in PROPUESTA))

for nombre, a in (('ACM', acm), ('Propuesta', prop)):
    d = pedir('POST', f'{COOLIFY}/deploy?uuid={a["uuid"]}', co)
    print(f'{nombre}: desplegando', (d.get('deployments') or [{}])[0].get('deployment_uuid'))
print(f'Listo en 2 o 3 minutos: https://{ACM}')
