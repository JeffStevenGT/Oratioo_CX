import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot')
from dotenv import load_dotenv
load_dotenv(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\.env')
from supabase_client import _api

# Documentos
docs = _api('GET', '/documentos?select=id,nombre_archivo,total_dnis,procesados,created_at&order=created_at.desc')
print("=== DOCUMENTOS ===")
for d in docs:
    ts = (d.get('created_at') or '')[:10]
    print(f"  {d['nombre_archivo']:20} | total:{d['total_dnis']:5} | proc:{d.get('procesados',0):5} | {ts}")

# Lineas por estado
print("\n=== LINEAS (DNIs) ===")
todos = []
desde = 0
while True:
    batch = _api('GET', '/lineas?select=atributos_dinamicos,dni&limit=1000&offset=' + str(desde) + '&order=id.asc')
    if not batch: break
    todos.extend(batch)
    desde += 1000
    if len(batch) < 1000: break

estados = {}
fps = {}
for r in todos:
    ad = r.get('atributos_dinamicos', {})
    if isinstance(ad, str):
        try: ad = json.loads(ad)
        except: ad = {}
    est = ad.get('estado', 'sin_estado')
    estados[est] = estados.get(est, 0) + 1
    fp = ad.get('fecha_procesado', 'sin_fecha')
    if est in ('completado', 'no_cliente'):
        fps[fp] = fps.get(fp, 0) + 1

print(f"Total registros: {len(todos)}")
for est, count in sorted(estados.items(), key=lambda x: -x[1]):
    print(f"  {est}: {count}")
print("\nPor fecha_procesado:")
for fp, count in sorted(fps.items(), reverse=True):
    print(f"  {fp}: {count}")
