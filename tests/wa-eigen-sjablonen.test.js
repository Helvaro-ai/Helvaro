/*
 * Een klant met een eigen WhatsApp-nummer (Embedded Signup) zendt vanaf zijn
 * eigen WABA. Helvaro's sjablonen stonden daar niet, dus elk bericht buiten
 * het 24u-venster faalde met Meta 132001. Dit controleert dat de set wordt
 * ingediend bij het koppelen en bij de eerste mislukte verzending, hooguit
 * eens per zes uur, en dat de gebruiker een vertaalde uitleg krijgt.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const lees = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  console.log('\nSjablonen op het eigen nummer');
  const teksten = require('../api/_wa-template-teksten');
  const lock = require('../api/_lock');
  const echtDienIn = teksten.dienIn, echtEenmalig = lock.eenmalig;
  const aanroepen = [];
  teksten.dienIn = async (o) => { aanroepen.push(o); return { bestaand: 1, resultaten: [{ action: 'created' }, { action: 'created' }, { action: 'skipped' }] }; };
  let vrij = true;
  lock.eenmalig = async () => { const v = vrij; vrij = false; return v; };
  const mod = require('../api/_wa-eigen-templates');

  const r1 = await mod.zorgVoorSjablonen({ wabaId: '123456789', token: 'tok' });
  ck('eerste keer: ingediend met commit, op de WABA van de klant', aanroepen.length === 1 && aanroepen[0].commit === true && aanroepen[0].wabaId === '123456789', aanroepen);
  ck('telling klopt', r1.ingediend === 2 && r1.bestond === 1 && r1.mislukt === 0, r1);
  const r2 = await mod.zorgVoorSjablonen({ wabaId: '123456789', token: 'tok' });
  ck('tweede keer binnen zes uur: niets', aanroepen.length === 1 && r2.overgeslagen === true, r2);
  const r3 = await mod.zorgVoorSjablonen({ wabaId: 'geen-id', token: 'tok' });
  ck('ongeldig WABA-id: niets', r3.overgeslagen === true && aanroepen.length === 1, r3);
  teksten.dienIn = echtDienIn; lock.eenmalig = echtEenmalig;

  const leads = lees('api/leads.js');
  ck('koppelen dient de sjablonen meteen in', /_waToken\.onthoud\(nummerId, uit\.token\);[\s\S]{0,600}zorgVoorSjablonen\(\{ wabaId, token: uit\.token \}\)/.test(leads), null);
  ck('handmatig antwoord: ontbrekend sjabloon op eigen nummer -> indienen + templates_pending',
     /tplR\.code === 'template_not_found' && clientPnid[\s\S]{0,900}code: 'templates_pending'/.test(leads), null);

  const i18n = require('../api/_i18n.js');
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const w = i18n.woordenboek(taal);
    ck(taal + ': uitleg voor templates_pending en template_not_found', !!w['wa.fout.templates_pending'] && !!w['wa.fout.template_not_found'], null);
  }
  ck('dashboard vertaalt per foutcode', /'wa\.fout\.' \+ \(d\.code \|\| ''\)/.test(lees('api/dashboard.js')), null);

  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
