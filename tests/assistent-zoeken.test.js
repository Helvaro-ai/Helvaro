'use strict';
/* De websiteassistent: vindt hij de juiste wagen, en weet het model alles wat het mag zeggen? */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const a = require(BASE + 'api/_assistent.js')._test;
const fs = require('fs');

let pass = 0, fail = 0;
function ck(naam, ok, extra) {
  if (ok) { pass++; console.log('  OK    ' + naam); }
  else { fail++; console.log('  FOUT  ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const w = (o) => Object.assign({ publiek: true, gearchiveerd: false, status: 'beschikbaar' }, o);
const VOORRAAD = [
  w({ code: 'V4', merk: 'Mercedes-Benz', model: 'EQA 250', uitvoering: 'AMG Line', prijs: 28490, brandstof: 'elektrisch', transmissie: 'automaat', carrosserie: 'SUV/4x4/Pick-Up' }),
  w({ code: 'V14', merk: 'Jeep', model: 'Renegade', prijs: 15990, brandstof: 'diesel', transmissie: 'handgeschakeld', carrosserie: 'SUV/4x4/Pick-Up' }),
  w({ code: 'V21', merk: 'Jeep', model: 'Compass', prijs: 25990, brandstof: 'benzine', transmissie: 'automaat', carrosserie: 'SUV/4x4/Pick-Up' }),
  w({ code: 'V15', merk: 'Fiat', model: '500', prijs: 9490, brandstof: 'benzine', transmissie: 'handgeschakeld', carrosserie: 'Berline' }),
  w({ code: 'V18', merk: 'Fiat', model: '500', prijs: 10490, brandstof: 'benzine', transmissie: 'handgeschakeld', carrosserie: 'Berline' }),
  w({ code: 'V9', merk: 'Porsche', model: 'Boxster', prijs: 64990, brandstof: 'benzine', transmissie: 'automaat', carrosserie: 'Cabrio' }),
];
const codes = (t) => a.zoekVoorraad(VOORRAAD, t, 3).map((v) => v.code);

console.log('Zoeken in eigen woorden');
ck('"elektrische auto onder 30.000 euro" vindt de EQA eerst', codes('Ik zoek een elektrische auto onder 30.000 euro')[0] === 'V4', codes('Ik zoek een elektrische auto onder 30.000 euro'));
ck('"voiture électrique" ook', codes('Avez-vous une voiture électrique ?')[0] === 'V4', codes('Avez-vous une voiture électrique ?'));
ck('"automatic diesel SUV": alleen SUVs met minstens een gevraagd kenmerk', codes('Do you have an automatic diesel SUV?').every((c) => ['V4', 'V14', 'V21'].indexOf(c) !== -1), codes('Do you have an automatic diesel SUV?'));
ck('budget is een grens: geen Porsche bij "onder 30.000"', codes('iets sportiefs onder 30.000 euro').indexOf('V9') === -1, codes('iets sportiefs onder 30.000 euro'));
ck('een merk noemen geeft alleen dat merk', codes('Hebben jullie een Jeep?').every((c) => c === 'V14' || c === 'V21'), codes('Hebben jullie een Jeep?'));

console.log('\nKoopintentie in elke vorm');
for (const zin of ['Kan ik mijn Golf inruilen?', 'Kan ik dit financieren?', 'Mag ik een proefritje maken?', 'Ik wil hem graag bezichtigen', 'Kan ik hem reserveren?', 'Puis-je faire un essai ?']) {
  ck(`"${zin}" = koopstap`, a.intentie(zin) === 'hoog');
}
ck('een gewone vraag is geen koopstap', a.intentie('Welke kleur heeft hij?') === 'laag');

console.log('\nWat het model meekrijgt');
const bron = fs.readFileSync(BASE + 'api/_assistent.js', 'utf8');
ck('het voorraadblok noemt transmissie, carrosserie, inschrijving en kleur, en "onbekend" als het ontbreekt', /transmissie \$\{of\(v\.transmissie\)\}/.test(bron) && /carrosserie \$\{of\(v\.carrosserie\)\}/.test(bron) && /kleur \$\{of\(v\.kleur\)\}/.test(bron) && /'onbekend'/.test(bron));
ck('de regels verbieden raden en zelf om gegevens vragen', /Raad nooit\./.test(bron) && /zeg niet "laat je gegevens achter"/.test(bron));
ck('een verkochte wagen krijgt geen kaartje', /\['verkocht', 'uit aanbod'\]\.indexOf\(_vehicles\.normStatus\(v\.status\)\) === -1/.test(bron));

console.log('\nCORS: de browser mag de vraag ook echt sturen');
{
  const bron2 = fs.readFileSync(BASE + 'api/_assistent.js', 'utf8');
  const widget = fs.readFileSync(BASE + 'public/assistant.js', 'utf8');
  ck('de voorcontrole (OPTIONS, zonder body) krijgt een Allow-Origin voor een https-herkomst', /if \(req\.method === 'OPTIONS'\) \{\s*if \(\/\^https:/.test(bron2) && /Access-Control-Max-Age/.test(bron2));
  ck('de echte POST krijgt Allow-Origin alleen voor een domein van die dealer', /if \(dealer && herkomstToegestaan\(origin, dealer\.domeinen\)\)/.test(bron2));
  ck('de widget zet de sleutel ook in het adres', /\/api\/assistant\?site=' \+ encodeURIComponent/.test(widget));
  /* Echt draaien: een OPTIONS zonder body van een vreemde site en een POST van een vreemde site. */
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
