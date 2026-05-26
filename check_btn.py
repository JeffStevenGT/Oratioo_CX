with open(r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\components\Sidebar.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'Abrir Orange' in line:
        print(f'Line {i}: {line.rstrip()[:120]}')
        # Print next 10 lines
        for j in range(1, 6):
            if i+j < len(lines):
                print(f'  +{j}: {lines[i+j].rstrip()[:120]}')
        print('---')
