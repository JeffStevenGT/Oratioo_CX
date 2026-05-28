import sys, os, json, time
sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')
from supabase_client import _api

# Buscar los ultimos completados y no_cliente
rows = _api('GET', '/lineas?select=dni,created_at,nombre,atributos_dinamicos&order=created_at.desc&limit=30')
print(f"=== Ultimos 30 registros ===")
print(f"{'DNI':>15} | {'estado':<12} | {'created_at':<22} | {'fecha_procesado':<12} | {'nombre':<25}")
print("-"*95)
for r in rows:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    fp = ad.get('fecha_procesado', 'N/A')
    st = ad.get('estado', 'N/A')
    nom = (r.get('nombre') or 'N/A')[:25]
    ts = (r.get('created_at') or '')[:22]
    print(f"  {r['dni']:>15} | {st:<12} | {ts:<22} | {fp:<12} | {nom}")

print()

# Buscar completados/no_cliente de HOY (28) vs AYER (27)
hoy_rows = _api('GET', "/lineas?select=dni,atributos_dinamicos&order=created_at.desc&limit=50")
completados_hoy = 0
completados_ayer = 0
for r in hoy_rows:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    if ad.get('estado') in ('completado', 'no_cliente'):
        fp = ad.get('fecha_procesado', '')
        if fp == '2026-05-28':
            completados_hoy += 1
        elif fp == '2026-05-27':
            completados_ayer += 1

print(f"Completados con fecha_procesado=2026-05-28 (hoy): {completados_hoy}")
print(f"Completados con fecha_procesado=2026-05-27 (ayer): {completados_ayer}")

# Tambien verificar: que fecha usa EXACTAMENTE time.strftime ahora
print(f"\nHora local Python: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"time.tzname: {time.tzname}")
print(f"time.timezone: {time.timezone} (segundos al oeste de UTC)")
print(f"time.daylight: {time.daylight}")
