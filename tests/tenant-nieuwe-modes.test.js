/*
 * Tenant-isolatie voor alle modes van de automotive engine: de tenant komt
 * UIT DE SESSIE (projectCode), nooit uit de body. Elk blok weigert zonder
 * projectCode en leest geen body.projectCode / body.project_code / body.tenant.
 * Plus: de modules zelf filteren op dealer in elke Airtable-formule.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`); ok ? pass++ : fail++; };

const blokken = [
  ["inventory-status", "body.mode === 'inventory-status'"],
  ["email/conversation", "const MAIL_MODES = ["],
  ["widget", "body.mode === 'widget-status' || body.mode === 'widget-save'"],
];
for (const [naam, anker] of blokken) {
  const i = leads.indexOf(anker);
  ck(`${naam}: blok gevonden`, i > 0);
  const blok = leads.slice(i, i + 5000);
  ck(`${naam}: weigert zonder sessie-tenant`, /if \(!projectCode\) return res\.status\(403\)/.test(blok.slice(0, 900)));
  ck(`${naam}: leest geen tenant uit de body`, !/body\.(projectCode|project_code|tenant|projectcode)\b/.test(blok));
}

for (const bestand of ['api/_gesprekken.js', 'api/_klant.js']) {
  const src = fs.readFileSync(BASE + bestand, 'utf8');
  const formules = src.match(/filterByFormula|const formule = `[^`]*`/g) || [];
  /* Een formule uit een lijst voorwaarden telt als ze die lijst begint met het
     dealerfilter (const delen = [`{Project Code}=...`, ...]). */
  const delenMetDealer = /const delen = \[`\{\$\{(G|B|F)\.project\}\}=/.test(src);
  const zonder = (src.match(/const formule = `[^`]*`/g) || [])
    .filter((f) => !/Project Code|F\.project|G\.project|B\.project/.test(f))
    .filter((f) => !(delenMetDealer && /delen\.join/.test(f)));
  ck(`${bestand}: elke formule filtert op dealer`, formules.length > 0 && zonder.length === 0);
  ck(`${bestand}: resultaten worden daarna nog eens op dealer gefilterd`, /\.filter\(\([a-z]+\) => [a-z]+\.projectCode === (t|tenant|projectCode)\)/.test(src));
}
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
