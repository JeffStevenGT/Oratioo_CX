import sys
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Clientes.jsx'
with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the filter block using a more flexible approach
idx = content.find("Rango de fechas")
if idx < 0:
    print("ERROR: no found")
    sys.exit(1)

# Find the actual comment line
line_start = content.rfind('\n', 0, idx) + 1
line_end = content.find('\n', idx)
comment_line = content[line_start:line_end]
print(f"Comment: {repr(comment_line)}")

# Find the end of this block (next blank line or next section)
# The block starts after the comment line and ends at the search section
search_idx = content.find("Busqueda", idx)
if search_idx < 0:
    search_idx = content.find("search.trim", idx)

block_start = line_end + 1  # skip the comment line's newline
block_to_replace = content[block_start:search_idx]
print(f"Block to replace ({len(block_to_replace)} chars):")
print(repr(block_to_replace[:200]))

# Build new filter block
new_block = """    if (dateFrom) {
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
    }

    // Busqueda"""

# Replace only the filter logic (keep comment line)
new_content = content[:block_start] + new_block + content[search_idx + len("    // Busqueda"):]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("OK - filtro actualizado")
