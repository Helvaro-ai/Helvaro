'use strict';
/* Logs worden breder gelezen dan de code: een telefoonnummer hoort er alleen
 * gemaskeerd in (api/_masker.js). Twee meldingen in api/whatsapp.js schreven het
 * nummer van de eigenaar voluit (audit 2026-10-09). Deze test zoekt in elke
 * console-regel van de routes naar een kaal ${...phone/telefoon/nummer...}. */
const fs = require('fs');
const path = require('path');
const api = path.join(__dirname, '..', 'api');
const fouten = [];
for (const f of fs.readdirSync(api)) {
  if (!f.endsWith('.js') || f.includes(' 2')) continue;
  fs.readFileSync(path.join(api, f), 'utf8').split('\n').forEach((r, i) => {
    if (!/console\.(log|warn|error)\(/.test(r)) return;
    const kaal = r.match(/\$\{\s*(ownerPhone\w*|phone|telefoon|nummer|ownerNummer)\s*\}/);
    if (kaal) fouten.push(`${f}:${i + 1}: ${r.trim().slice(0, 140)}`);
  });
}
if (fouten.length) { console.error('Ongemaskeerd telefoonnummer in een log:\n  ' + fouten.join('\n  ')); process.exit(1); }
console.log('log-telefoon-gemaskeerd: ok');
