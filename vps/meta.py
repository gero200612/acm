# «Conectar con Facebook» en ACM: da de alta a ACM en sincro-wa (capacidad `autorizar`: canjea los códigos de Meta y
# devuelve el token, sin registrar la página como canal), carga las variables en Coolify y redespliega. Es idempotente.
# Corre en el VPS de OVH (donde están sincro-wa y Coolify); no imprime ninguna clave:
#   ssh vps "python3 -" < vps/meta.py
# Antes: sincro-wa desplegado con la capacidad `autorizar` (multicodigo-back 6c1e4f4) y, en la app de Meta,
# https://acm.punchi.dev agregado a los dominios permitidos del SDK de JavaScript.
import json, os, sys, urllib.request, urllib.error

UUID = 'n661mrfkfpuwy2ijrwo9pekt'           # ACM en Coolify
WA_LOCAL = 'http://127.0.0.1:8097'          # sincro-wa visto desde el VPS
WA_DESDE_ACM = 'http://100.113.60.114:8097' # sincro-wa visto desde el contenedor (como la demo)
SECRETO = '/root/env/acm-sincro-wa.secret'  # la clave del negocio ACM en sincro-wa (solo root)
META = {'ACM_META_APP_ID': '1410095257330902', 'ACM_META_PAGES_CONFIG_ID': '1462375322666999', 'ACM_META_ADS_CONFIG_ID': '1103102822587035'}

def leer_env(ruta):
    d = {}
    if os.path.exists(ruta):
        for l in open(ruta):
            if '=' in l and not l.startswith('#'):
                k, v = l.rstrip('\n').split('=', 1)
                d[k.strip()] = v.strip().strip('\'"')
    return d

def http(m, url, cuerpo=None, token=''):
    req = urllib.request.Request(url, method=m, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{e.code} {m} {url.split("?")[0]}: {e.read().decode()[:300]}')

admin = leer_env('/root/env/sincro-wa.env')['SINCRO_WA_ADMIN_KEY']
s = leer_env(SECRETO)
if 'KEY' not in s:
    r = http('POST', WA_LOCAL + '/admin/negocios', {'nombre': 'ACM', 'app': 'acm', 'capacidades': ['autorizar'], 'tope_mensual_ars': 1, 'quien': 'claude'}, admin)
    s = {'KEY': r['clave'], 'NEGOCIO': str(r['negocio']['id'])}
    fd = os.open(SECRETO, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, ''.join(f'{k}={v}\n' for k, v in s.items()).encode()); os.close(fd)
# solo `autorizar`: ni mensajes, ni eventos, ni registrar páginas
http('PATCH', WA_LOCAL + f'/admin/negocios/{s["NEGOCIO"]}', {'capacidades': ['autorizar'], 'quien': 'claude'}, admin)
print('sincro-wa: negocio ACM', s['NEGOCIO'], 'con autorizar')

tok = open('/root/coolify.token').read().strip()
def coolify(m, p, c=None):
    req = urllib.request.Request(f'http://localhost:8000/api/v1{p}', data=json.dumps(c).encode() if c is not None else None, method=m,
                                 headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}
vars_ = {**META, 'ACM_SINCRO_WA_URL': WA_DESDE_ACM, 'ACM_SINCRO_WA_KEY': s['KEY']}
coolify('PATCH', f'/applications/{UUID}/envs/bulk', {'data': [{'key': k, 'value': v, 'is_preview': False, 'is_literal': True} for k, v in vars_.items()]})
print('Cargadas:', ', '.join(vars_))
d = coolify('POST', f'/deploy?uuid={UUID}')
print('Redesplegando:', (d.get('deployments') or [{}])[0].get('deployment_uuid'))
