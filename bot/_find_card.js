const fs = require('fs');
const p = process.env.USERPROFILE + '/Desktop/Proyectos/Oratioo_CX/web/src/pages/Dashboard.jsx';
let c = fs.readFileSync(p, 'utf8');

const idx = c.indexOf('Leads durmiendo');
console.log('Found at:', idx);
// Show the 300 chars before it
console.log('Before:');
console.log(JSON.stringify(c.substring(Math.max(0, idx-300), idx)));
