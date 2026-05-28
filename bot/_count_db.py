import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')
from supabase_client import _api

# Traer todos los registros paginando
todos = []
desde = 0
while True:
    batch = _api('GET', '/lineas?select=atributos_dinamicos,dni&limit=1000&offset=' + str(desde) + '&order=id.asc')
    if not batch:
        break
    todos.extend(batch)
    desde += 1000
    if len(batch) < 1000:
        break

print(f'Total registros en BD: {len(todos)}')

fp28 = 0
fp27 = 0
fp_otro = 0
sin_fp = 0
pendientes = 0
errores = 0

for r in todos:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    est = ad.get('estado', '')
    fp = ad.get('fecha_procesado', '')
    if est == 'pendiente':
        pendientes += 1
    elif est == 'error':
        errores += 1
    elif est in ('completado', 'no_cliente'):
        if fp == '2026-05-28':
            fp28 += 1
        elif fp == '2026-05-27':
            fp27 += 1
        elif fp:
            fp_otro += 1
        else:
            sin_fp += 1

print(f'Completados fecha 2026-05-28: {fp28}')
print(f'Completados fecha 2026-05-27: {fp27}')
print(f'Completados otra fecha: {fp_otro}')
print(f'Completados sin fecha: {sin_fp}')
print(f'Pendientes: {pendientes}')
print(f'Errores: {errores}')
