/* Faro: modelkeuze in de taal van de klant en het woord van zijn markt (live gevonden: "Faro · Standaard" in het Engels, "Properties" bij een autodealer). */
'use strict';
const fs = require('fs'); const path = require('path');
const client = fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'ui', 'client.js'), 'utf8');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'ui', 'i18n.js'), 'utf8');
const cmd = fs.readFileSync(path.join(__dirname, '..', 'api', '_command-ui', 'i18n.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`); ok ? pass++ : fail++; };
console.log('\nFaro: modelkeuze en markt-woorden');
const sleutels = ['tier.fast', 'tier.fast.hint', 'tier.standard', 'tier.standard.hint', 'tier.precise', 'tier.precise.hint', 'in.vehicle', 'ctx.vehicles', 'im.vehicle'];
const blokken = {};
for (const t of ['nl', 'en', 'fr', 'de']) { const i = i18n.indexOf('\n  ' + t + ': {'); blokken[t] = i18n.slice(i, i18n.indexOf('\n  },', i) > 0 ? i18n.indexOf('\n  },', i) : i + 30000); }
for (const t of Object.keys(blokken)) ck(t + ' heeft alle ' + sleutels.length + ' nieuwe sleutels', sleutels.every((k) => blokken[t].indexOf("'" + k + "':") !== -1), sleutels.filter((k) => blokken[t].indexOf("'" + k + "':") === -1));
ck('Engels heet het "Standard", niet "Standaard"', /'tier\.standard': 'Standard'/.test(blokken.en));
ck('de modelkeuze gebruikt de vertaling', /T\('tier\.' \+ t\.key, t\.short\)/.test(client) && /T\('tier\.' \+ t\.key, t\.label\)/.test(client));
ck('een dealer krijgt het woord Voertuig in plaats van Pand', /FARO_DEALERWOORDEN/.test(client) && /hvVertical === 'dealership'/.test(client));
ck('het woord wordt ververst zodra de markt bekend is', /faroWoordenVerversen/.test(fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8')));
ck('het Command Center zegt tegen de klant "assistent", niet "AI"', !/\b(AI|IA|KI)\b/.test(cmd.replace(/\/\/[^\n]*/g, '')));
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
