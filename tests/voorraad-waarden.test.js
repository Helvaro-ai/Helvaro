'use strict';
/* Brandstof en transmissie van elk platform in Helvaro's eigen woorden. */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';
const w = require(BASE + 'api/_voorraad-providers/waarden.js');

let pass = 0, fail = 0;
function ck(naam, ok, extra) {
  if (ok) { pass++; console.log('  OK    ' + naam); }
  else { fail++; console.log('  FOUT  ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

console.log('Brandstof');
const b = {
  'Electrique': 'elektrisch', 'Elektro': 'elektrisch', 'ELECTRICITY': 'elektrisch', 'electric': 'elektrisch',
  'Essence': 'benzine', 'Benzin': 'benzine', 'petrol': 'benzine', 'Gasoline': 'benzine', 'benzine': 'benzine',
  'Diesel': 'diesel', 'Électrique/Essence': 'hybride', 'Hybride (Essence/Electrique)': 'hybride', 'Elektro/Diesel': 'hybride',
  'Plug-in Hybrid': 'plug-in hybride', 'PHEV': 'plug-in hybride', 'LPG': 'lpg', 'GPL': 'lpg', 'CNG': 'cng', 'Erdgas': 'cng',
  'Wasserstoff': 'waterstof', 'Hydrogène': 'waterstof',
};
for (const [in_, uit] of Object.entries(b)) ck(`${in_} → ${uit}`, w.brandstof(in_) === uit, w.brandstof(in_));
ck('onbekend blijft zichtbaar (geen verzonnen waarde)', w.brandstof('Ethanol E85') === 'ethanol e85');
ck('leeg blijft leeg', w.brandstof('') === undefined && w.brandstof(null) === undefined);
ck('elke herkende waarde staat in de keuzelijst van het formulier', (() => {
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const blok = dash.slice(dash.indexOf('id="pd-f-brandstof"'), dash.indexOf('id="pd-f-transmissie"') + 600);
  return w.BRANDSTOF.concat(w.TRANSMISSIE).every((v) => blok.indexOf('value="' + v + '"') !== -1);
})());

console.log('\nTransmissie');
const t = {
  'Boîte automatique': 'automaat', 'Automatic': 'automaat', 'Automatik': 'automaat', 'DSG': 'automaat', 'automaat': 'automaat',
  'Boîte manuelle': 'handgeschakeld', 'Manual': 'handgeschakeld', 'Schaltgetriebe': 'handgeschakeld', 'handgeschakeld': 'handgeschakeld',
};
for (const [in_, uit] of Object.entries(t)) ck(`${in_} → ${uit}`, w.transmissie(in_) === uit, w.transmissie(in_));

console.log('\nIn de sync');
const inv = fs.readFileSync(BASE + 'api/_inventaris.js', 'utf8');
ck('elke bron gaat door dezelfde normalisatie voor de vergelijking', /\.map\(_waarden\.voertuig\)/.test(inv));
ck('een nieuwe regelversie laat de volgende sync niet overslaan', /staat\.waardenVersie === _waarden\.VERSIE/.test(inv) && /waardenVersie: resultaat\.ongewijzigd/.test(inv));
ck('voertuig() laat de rest ongemoeid', JSON.stringify(w.voertuig({ merk: 'BMW', brandstof: 'Essence', prijs: 1 })) === JSON.stringify({ merk: 'BMW', brandstof: 'benzine', prijs: 1 }));

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
