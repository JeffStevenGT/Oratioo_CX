import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')
from supabase_client import _api

# 1. Contar por estado
print("=== DISTRIBUCION POR ESTADO ===")
todos = []
desde = 0
while True:
    batch = _api('GET', '/lineas?select=atributos_dinamicos,dni&limit=1000&offset=' + str(desde) + '&order=id.asc')
    if not batch: break
    todos.extend(batch)
    desde += 1000
    if len(batch) < 1000: break

estados = {}
for r in todos:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    est = ad.get('estado', 'sin_estado')
    estados[est] = estados.get(est, 0) + 1

for est, count in sorted(estados.items(), key=lambda x: -x[1]):
    print(f'  {est}: {count}')

# 2. Pendientes mas antiguos (ver si hay stuck)
print("\n=== 5 PENDIENTES MAS ANTIGUOS ===")
pendientes = _api('GET', '/lineas?select=dni,created_at,atributos_dinamicos&atributos_dinamicos->>estado=eq.pendiente&limit=5&order=created_at.asc')
for r in pendientes:
    ts = (r.get('created_at') or '')[:19]
    print(f'  DNI: {r["dni"]} | creado: {ts}')

# 3. En_progreso (stuck?)
print("\n=== EN_PROGRESO (posibles stuck) ===")
progreso = _api('GET', '/lineas?select=dni,created_at,atributos_dinamicos&atributos_dinamicos->>estado=eq.en_progreso&limit=10&order=created_at.asc')
if progreso:
    for r in progreso:
        ad = r.get('atributos_dinamicos', {})
        if isinstance(ad, str):
            try: ad = json.loads(ad)
            except: ad = {}
        ts = (r.get('created_at') or '')[:19]
        wid = ad.get('worker_id', '?')
        print(f'  DNI: {r["dni"]} | creado: {ts} | worker: {wid}')
else:
    print('  Ninguno')

# 4. Errores
print("\n=== ERRORES ===")
errores = _api('GET', '/lineas?select=dni,created_at,atributos_dinamicos&atributos_dinamicos->>estado=eq.error&limit=10&order=created_at.asc')
if errores:
    for r in errores:
        ad = r.get('atributos_dinamicos', {})
        if isinstance(ad, str):
            try: ad = json.loads(ad)
            except: ad = {}
        ts = (r.get('created_at') or '')[:19]
        fp = ad.get('fecha_procesado', '-')
        print(f'  DNI: {r["dni"]} | creado: {ts} | fecha_proc: {fp}')
else:
    print('  Ninguno')

# 5. Completados mas recientes con hora
print("\n=== 5 COMPLETADOS MAS RECIENTES ===")
recientes = _api('GET', '/lineas?select=dni,created_at,atributos_dinamicos&atributos_dinamicos->>estado=eq.completado&limit=5&order=created_at.desc')
for r in recientes:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    ts = (r.get('created_at') or '')[:19]
    fp = ad.get('fecha_procesado', '-')
    fh = ad.get('fecha_hora', '-')[:19]
    print(f'  DNI: {r["dni"]} | creado: {ts} | fecha_proc: {fp} | hora: {fh}')
