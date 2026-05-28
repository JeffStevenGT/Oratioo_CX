import sys
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Clientes.jsx'
with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

old = """    // \u2500\u2500 Rango de fechas \u2500\u2500
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

new = """    // \u2500\u2500 Rango de fechas \u2500\u2500
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

if old in content:
    content = content.replace(old, new, 1)
    with open(PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - filtro actualizado')
else:
    print('ERROR: patron no encontrado')
    # try finding the comment more loosely
    idx = content.find('Rango de fechas')
    if idx >= 0:
        print('Context:', repr(content[idx-10:idx+400]))
