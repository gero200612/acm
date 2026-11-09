# Carga en Coolify las apps de desarrollador para «Conectar con TikTok / Google» y redespliega.
# Uso (desde la compu de Gero, con las claves en ~/.sincro/acm-apps.env, que nunca se imprime):
#   ssh vps "$(sed 's/^/export /' ~/.sincro/acm-apps.env | tr '\n' ';') python3 -" < vps/apps.py
import json, os, urllib.request

UUID = 'n661mrfkfpuwy2ijrwo9pekt'
KEYS = ['ACM_TIKTOK_CLIENT_KEY', 'ACM_TIKTOK_CLIENT_SECRET', 'ACM_GOOGLE_CLIENT_ID', 'ACM_GOOGLE_CLIENT_SECRET',
        'ACM_R2_ACCOUNT_ID', 'ACM_R2_ACCESS_KEY_ID', 'ACM_R2_SECRET_ACCESS_KEY', 'ACM_R2_BUCKET', 'ANTHROPIC_API_KEY',
        'EDITOR_URL', 'EDITOR_TOKEN', 'EDITOR_PUBLIC_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'YOUTUBE_DAILY_QUOTA', 'ACM_MARKETING_CYCLE', 'ACM_YT_ANALYTICS']
data = [{'key': k, 'value': os.environ[k].strip(), 'is_preview': False, 'is_literal': True} for k in KEYS if os.environ.get(k, '').strip()]
if not data:
    raise SystemExit('No vino ninguna clave (' + ', '.join(KEYS) + ')')
tok = open('/root/coolify.token').read().strip()

def coolify(m, p, c=None):
    req = urllib.request.Request(f'http://localhost:8000/api/v1{p}', data=json.dumps(c).encode() if c is not None else None, method=m,
                                 headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}

coolify('PATCH', f'/applications/{UUID}/envs/bulk', {'data': data})
print('Cargadas:', ', '.join(d['key'] for d in data))
d = coolify('POST', f'/deploy?uuid={UUID}')
print('Redesplegando:', (d.get('deployments') or [{}])[0].get('deployment_uuid'))
