import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\agente.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exact area
idx = content.find("load_dotenv()\n\n# \u2500\u2500 Config")
if idx >= 0:
    end_comment = content.find("\n", idx + 30)  # end of Config comment line
    rest = content[end_comment:]  # everything after that comment line
    
    bom_fix = '''load_dotenv()

# -- Auto-fix BOM en .env (Windows Notepad lo anade al guardar) --
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    _raw = _env_path.read_bytes()
    if _raw.startswith(b'\\xef\\xbb\\xbf'):
        _env_path.write_bytes(_raw[3:])
        print("[Agente] BOM eliminado del .env automaticamente")
        load_dotenv(override=True)

# -- Config'''

    new_content = content[:idx] + bom_fix + rest
    with open(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\agente.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('OK - agente.py actualizado con auto-fix BOM')
else:
    print('Patron no encontrado')
    print('Buscando load_dotenv...')
    idx2 = content.find('load_dotenv()')
    if idx2 >= 0:
        print(repr(content[idx2:idx2+60]))
