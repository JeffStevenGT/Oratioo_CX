import sys, re
sys.stdout.reconfigure(encoding='utf-8')

# Helper function to convert UTC to local YYYY-MM-DD
UTC_TO_LOCAL = """
// Convertir created_at (UTC) a fecha local YYYY-MM-DD
function utcToLocalDate(isoStr) {
  if (!isoStr) return 'sin_fecha'
  const d = new Date(isoStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}
"""

# ──── Fix 1: Documentos.jsx ────
path = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Documentos.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add helper function inside the grouping section
old = "                    const dia = h.created_at ? h.created_at.split('T')[0] : 'sin_fecha'"
new = "                    const dia = utcToLocalDate(h.created_at)"

if old in content:
    content = content.replace(old, new, 1)
    # Add helper at the top of the file, after imports
    import_section = "import BotStatus from '../components/BotStatus'"
    if import_section in content:
        content = content.replace(import_section, import_section + "\n" + UTC_TO_LOCAL)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ Documentos.jsx: UTC→local date corregido')
else:
    print('❌ Documentos.jsx: patrón no encontrado')

# ──── Fix 2: Dashboard.jsx ────
path2 = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Dashboard.jsx'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Add helper after imports
import_end = "import StatCard from '../components/StatCard'"
if import_end in content2:
    content2 = content2.replace(import_end, import_end + "\n" + UTC_TO_LOCAL)

# Fix all split('T')[0] occurrences inside the component
# These are used for date comparison in chart data
count_fixes = 0
for old_pattern in [
    "c.created_at && c.created_at.split('T')[0] === dateStr",
]:
    if old_pattern in content2:
        content2 = content2.replace(old_pattern, "c.created_at && utcToLocalDate(c.created_at) === dateStr")
        count_fixes += 1

# Fix the date comparison for today filtering (in the chart section)
if "const dateStr = d.toISOString()" in content2:
    # These generate local date strings already (from Date objects)
    pass

if count_fixes > 0:
    with open(path2, 'w', encoding='utf-8') as f:
        f.write(content2)
    print(f'✅ Dashboard.jsx: {count_fixes} correcciones UTC→local date')
else:
    print('⚠️ Dashboard.jsx: no se encontraron patrones para corregir')

print('Hecho.')
