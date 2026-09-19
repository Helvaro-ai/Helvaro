'use strict';
/* De kaart "Eigen WhatsApp-nummer" op Instellingen: verborgen tot de server
   zegt dat Embedded Signup aanstaat, dan een knop die Meta's popup opent en
   het resultaat (code + waba_id + phone_number_id) naar wa-es-complete stuurt.
   De projectcode komt nooit uit de browser. CSP laat Meta's hosts alleen toe
   als het aanstaat. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
let ok = 0; const ck = (n, c) => { assert.ok(c, n); ok++; };

ck('kaart bestaat en staat standaard verborgen', /id="set-waes" style="display:none/.test(src));
ck('knop roept waesKoppelen aan', src.includes('onclick="waesKoppelen()"'));
ck('status komt van wa-es-status', src.includes("JSON.stringify({ mode: 'wa-es-status' })"));
ck('kaart verbergt zich als niet beschikbaar', src.includes("if (!d.beschikbaar) { rij.style.display = 'none'; return; }"));
ck('popup via FB.login met config_id en response_type code', src.includes("config_id: d.configId") && src.includes("response_type: 'code'"));
ck('sessionInfoVersion 3 zodat Meta de id\'s meestuurt', src.includes("sessionInfoVersion: '3'"));
ck('alleen messages van facebook.com worden vertrouwd', src.includes("event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com'"));
ck('resultaat gaat naar wa-es-complete zonder projectcode', /mode: 'wa-es-complete', code: code, wabaId: _waesGekozen\.wabaId, phoneNumberId: _waesGekozen\.phoneNumberId \}\)/.test(src) && !/wa-es-complete[^\n]*projectCode/.test(src));
ck('annuleren geeft een nette melding', src.includes("toast(tr('set.waes.cancelled'), 'info')"));
ck('CSP: Meta-hosts alleen als geconfigureerd', src.includes("_waes.isConfigured() ? ' https://connect.facebook.net' : ''") && src.includes('${waesScript}') && src.includes('+ waesFrame'));
ck('SDK wordt pas geladen bij klik, niet bij paginalading', !/<script[^>]+connect\.facebook\.net/.test(src));

// de CSP zonder configuratie mag facebook niet noemen
delete process.env.META_APP_ID; delete process.env.META_ES_CONFIG_ID;
const waes = require('../api/_waes.js');
ck('zonder env-vars is Embedded Signup uit', waes.isConfigured() === false);

console.log(`${ok} geslaagd, 0 gefaald`);
