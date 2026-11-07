# Cambia la contraseña del panel de ACM: ssh vps NUEVA=... python3 - < vps/clave.py
# Mantiene ACM_SECRET (las sesiones abiertas y los tokens cifrados siguen valiendo) y redespliega.
import json, os, urllib.request

UUID = 'n661mrfkfpuwy2ijrwo9pekt'
SECRETO = '/root/env/acm.secret'
nueva = os.environ.get('NUEVA', '').strip()
if len(nueva) < 6:
    raise SystemExit('Falta NUEVA (mínimo 6 caracteres)')
tok = open('/root/coolify.token').read().strip()

def coolify(m, p, c=None):
    req = urllib.request.Request(f'http://localhost:8000/api/v1{p}', data=json.dumps(c).encode() if c is not None else None, method=m,
                                 headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}

sec = dict(l.split('=', 1) for l in open(SECRETO).read().split('\n') if '=' in l)
sec['ACM_PASSWORD'] = nueva
with open(SECRETO, 'w') as f:
    f.write(''.join(f'{k}={v}\n' for k, v in sec.items()))
os.chmod(SECRETO, 0o600)
coolify('PATCH', f'/applications/{UUID}/envs/bulk', {'data': [{'key': 'ACM_PASSWORD', 'value': nueva, 'is_preview': False, 'is_literal': True}]})
print('Contraseña cambiada en', SECRETO, 'y en Coolify')
d = coolify('POST', f'/deploy?uuid={UUID}')
print('Redesplegando:', (d.get('deployments') or [{}])[0].get('deployment_uuid'))
