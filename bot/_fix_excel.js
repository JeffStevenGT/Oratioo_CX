const fs = require('fs');
let c = fs.readFileSync('C:/Users/Jeff/Desktop/Proyectos/Oratioo_CX/web/src/components/ExportButtons.jsx', 'utf8');
const old = 'l.atributos_dinamicos?.linea?.numero || l.atributos_dinamicos?.linea?.linea_principal';
const now = 'l.atributos_dinamicos?.linea_principal || l.atributos_dinamicos?.linea?.numero';
if(c.includes(old)){ c=c.replace(old, now); fs.writeFileSync('C:/Users/Jeff/Desktop/Proyectos/Oratioo_CX/web/src/components/ExportButtons.jsx',c); console.log('FIX OK'); }
else console.log('NOT FOUND');
