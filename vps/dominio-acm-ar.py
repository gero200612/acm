# Suma acm.ar (y www.acm.ar) a la app ACM en Coolify, sin sacar acm.punchi.dev, y redespliega para que Traefik saque el certificado.
# Correr cuando acm.ar ya resuelva al VPS (dig +short A acm.ar → 158.69.192.117):
#   ssh vps "python3 -" < vps/dominio-acm-ar.py
# ACM_PUBLIC_URL no se toca: los links de vuelta de TikTok, Google y Meta siguen en acm.punchi.dev hasta que aprueben.
import json, urllib.request

UUID = 'n661mrfkfpuwy2ijrwo9pekt'
NUEVOS = ['https://acm.ar', 'https://www.acm.ar']
tok = open('/root/coolify.token').read().strip()

def coolify(m, p, c=None):
    req = urllib.request.Request(f'http://localhost:8000/api/v1{p}', data=json.dumps(c).encode() if c is not None else None, method=m,
                                 headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}

app = coolify('GET', f'/applications/{UUID}')
actuales = [d.strip() for d in (app.get('fqdn') or '').split(',') if d.strip()]
print('Antes:', ', '.join(actuales) or '(ninguno)')
todos = actuales + [d for d in NUEVOS if d not in actuales]
if todos == actuales:
    print('acm.ar ya estaba cargado.')
else:
    coolify('PATCH', f'/applications/{UUID}', {'domains': ','.join(todos)})
    print('Ahora:', ', '.join(todos))
    d = coolify('POST', f'/deploy?uuid={UUID}')
    print('Redesplegando:', (d.get('deployments') or [{}])[0].get('deployment_uuid'))
