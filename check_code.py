with open(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\components\Sidebar.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

if 'abrir_orange.bat' in c:
    print('Has .bat download code')
elif 'href="https://pangea.orange.es/' in c:
    print('Has direct link - OLD version')
else:
    print('Unknown state')
    idx = c.find('Abrir Orange')
    if idx >= 0:
        print(c[idx:idx+300])
