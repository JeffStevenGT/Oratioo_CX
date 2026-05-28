with open(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Documentos.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

checks = [
    'useEffect(() => { fetchHistory()',
    'toggleDay',
    'expandedDay',
    'dayDetails',
    'React.Fragment',
    'ChevronDown',
    'ChevronRight',
    'handleDeleteDocument',
    'soloHoy',
    'hoyLocal',
]

all_ok = True
for ch in checks:
    found = ch in c
    if not found:
        print(f'MISSING: {ch}')
        all_ok = False

if all_ok:
    print('ALL OK - all expected elements found')
else:
    print('\nSome elements missing!')
