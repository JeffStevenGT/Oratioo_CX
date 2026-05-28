import sys
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Clientes.jsx'
with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix filter: replace created_at comparison with fecha_analisis comparison
old_filter = """    // Rango de fechas
    if (dateFrom) {
      result = result.filter((g) => {
        if (!g.created_at) return false
        return g.created_at >= `${dateFrom}T00:00:00Z`
      })
    }
    if (dateTo) {
      result = result.filter((g) => {
        if (!g.created_at) return false
        return g.created_at <= `${dateTo}T23:59:59Z`
      })
    }"""

new_filter = """    // Rango de fechas (usando fecha_analisis, no created_at)
    if (dateFrom) {
      result = result.filter((g) => {
        const fa = g.fecha_analisis
        if (!fa) return false
        return fa >= dateFrom
      })
    }
    if (dateTo) {
      result = result.filter((g) => {
        const fa = g.fecha_analisis
        if (!fa) return false
        return fa <= dateTo
      })
    }"""

if old_filter in content:
    content = content.replace(old_filter, new_filter)
    print('OK - filtro de fecha actualizado')
else:
    print('ERROR: patron de filtro no encontrado')
    idx = content.find('Rango de fechas')
    if idx >= 0:
        # Print hex bytes around the area
        raw = content[idx:idx+400].encode('utf-8')
        print(f'Found at byte {idx}, context ({len(raw)} bytes)')

# 2. Fix sort
old_sort = "case 'fecha': aVal = a.created_at || ''; bVal = b.created_at || ''; break"
new_sort = "case 'fecha': aVal = a.fecha_analisis || ''; bVal = b.fecha_analisis || ''; break"

if old_sort in content:
    content = content.replace(old_sort, new_sort)
    print('OK - sort por fecha actualizado')
else:
    print('ERROR: patron de sort no encontrado')
    idx = content.find("case 'fecha'")
    if idx >= 0:
        print('Found:', repr(content[idx:idx+80]))

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print('Hecho.')
