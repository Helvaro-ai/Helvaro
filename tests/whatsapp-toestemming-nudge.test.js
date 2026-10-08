'use strict';
/* De automatische WhatsApp-opvolging gaat alleen naar wie daar toestemming voor gaf. */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';
const { geenWhatsAppToestemming } = require(BASE + 'api/cron-followup.js');

let pass = 0, fail = 0;
function ck(naam, ok, extra) {
  if (ok) { pass++; console.log('  OK    ' + naam); }
  else { fail++; console.log('  FOUT  ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const n = (consent) => JSON.stringify({ _v: 1, notes: [], consent });
ck('leadformulier (WhatsApp uitdrukkelijk gevraagd): mag', geenWhatsAppToestemming(n({ given: true, ts: 'x' })) === false);
ck('websiteassistent (alleen "het team mag contact opnemen"): niet', geenWhatsAppToestemming(n({ given: true, ts: 'x', via: 'website_assistent' })) === true);
ck('toestemming geweigerd: niet', geenWhatsAppToestemming(n({ given: false, ts: 'x', via: 'website_assistent' })) === true);
ck('geen consent-blok (lead die zelf via WhatsApp begon, of door de dealer ingevoerd): mag', geenWhatsAppToestemming(JSON.stringify({ _v: 1, notes: [] })) === false);
ck('lege of kapotte Notities breken niets', geenWhatsAppToestemming('') === false && geenWhatsAppToestemming('{kapot') === false && geenWhatsAppToestemming(undefined) === false);
const bron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
ck('de lus slaat zulke leads over voor er iets verstuurd wordt', /if \(geenWhatsAppToestemming\(lead\.fields\['fldoLRI5W12ThTls7'\] \|\| lead\.fields\['Notities'\]\)\) \{[\s\S]{0,300}continue;/.test(bron) && bron.indexOf('geenWhatsAppToestemming(lead.fields') < bron.indexOf('const firstName = name.split'));
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
