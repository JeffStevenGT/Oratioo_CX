import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Find the Abrir Orange section
idx_start = c.find('{/* Abrir Orange')
idx_end = c.find('className="flex items-center gap-3 w-full px-3 py-2.5', idx_start)

if idx_start < 0 or idx_end < 0:
    print("ERROR: section not found")
    sys.exit(1)

# Find the full button
btn_start = c.rfind('<button', idx_start, idx_end)
btn_end = c.find('</button>', btn_start)
if btn_end >= 0:
    btn_end += len('</button>')

old_btn = c[btn_start:btn_end]

# New simple button - just opens the URL
new_btn = """          <a
            href="https://pangea.orange.es/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 text-emerald-400 hover:text-white hover:bg-emerald-600"
            title="Abrir Orange en tu navegador"
          >
            <Globe size={18} className="shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium">Abrir Orange</span>
            )}
          </a>"""

c = c.replace(old_btn, new_btn)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

print("OK - simplified")
