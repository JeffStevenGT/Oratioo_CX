import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')
from supabase_client import _api

# Traer un lote de completados recientes
r = _api('GET', '/lineas?select=dni,atributos_dinamicos&order=created_at.desc&limit=100')

con_fh = 0
sin_fh = 0
for x in r:
    ad = x.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    if ad.get('fecha_hora'):
        con_fh += 1
    else:
        sin_fh += 1

print(f'Total registros: {len(r)}')
print(f'Con fecha_hora: {con_fh}')
print(f'Sin fecha_hora: {sin_fh}')

if con_fh > 0:
    print('\nPrimeros 3 con fecha_hora:')
    for x in r:
        ad = x.get('atributos_dinamicos', {})
        if isinstance(ad, str):
            try: ad = json.loads(ad)
            except: ad = {}
        fh = ad.get('fecha_hora', '')
        if fh:
            print(f'  {x["dni"]}: {fh[:19]}')
