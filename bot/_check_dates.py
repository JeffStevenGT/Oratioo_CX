import sys, os, json, time
sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')

from supabase_client import _api

rows = _api('GET', '/lineas?select=dni,created_at,atributos_dinamicos&order=created_at.desc&limit=15')
if not rows:
    print('No data')
else:
    for r in rows:
        ad = r.get('atributos_dinamicos', {})
        if isinstance(ad, str):
            try: ad = json.loads(ad)
            except: ad = {}
        fp = ad.get('fecha_procesado', 'N/A')
        st = ad.get('estado', 'N/A')
        ts = (r.get('created_at') or '')[:19]
        print(f"  DNI: {r['dni']:>15} | estado={st:<12} | fecha_procesado={fp:<10} | created_at={ts}")
