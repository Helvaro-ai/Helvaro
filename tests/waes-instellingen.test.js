'use strict';
/* De kaart "Eigen WhatsApp-nummer" op Instellingen: verborgen tot de server
   zegt dat Embedded Signup aanstaat, dan een knop die Meta's popup opent en
   het resultaat (code + waba_id + phone_number_id) naar wa-es-complete stuurt.
   De projectcode komt nooit uit de browser. CSP laat Meta's hosts alleen toe
   als het aanstaat. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
/* De gedeelde koppelkern (SDK, popup, listener, wa-es-complete) staat in een eigen module. */
const kernSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_dash', 'wizard-whatsapp.js'), 'utf8');
const src = dashSrc + '\n' + kernSrc;
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

/* Eén kern voor Instellingen en de wizard: geen tweede kopie van de listener, de SDK-lader of het complete-verzoek. */
const tel = (re, tekst) => (tekst.match(re) || []).length;
ck('de kern (waesKern) staat in de module en niet meer in dashboard.js',
  /async function waesKern\(d\)/.test(kernSrc) && !/async function waesKern/.test(dashSrc) && !/function waesSdk/.test(dashSrc));
ck('precies een message-listener voor WA_EMBEDDED_SIGNUP, en een wa-es-complete-verzoek, in alle clientcode',
  tel(/addEventListener\('message'/g, src) === 1 && tel(/data\.type !== 'WA_EMBEDDED_SIGNUP'/g, src) === 1 && tel(/mode: 'wa-es-complete'/g, src) === 1 && tel(/FBsdk\.login\(/g, src) === 1);
{
  const kooi = (dashSrc.match(/async function waesKoppelen\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
  ck('Instellingen (waesKoppelen) gebruikt waesKern en behoudt zijn DOM-id\'s en meldingen',
    kooi.includes("document.getElementById('set-waes-knop')") && kooi.includes('await waesKern(d)')
    && kooi.includes("toast(tr('set.waes.cancelled'), 'info')") && kooi.includes("tr('set.waes.failed')") && kooi.includes("toast(tr('set.waes.done'), 'success')")
    && kooi.includes('await laadWaes()') && kooi.includes('laadWhatsAppInstellingen(true)'), kooi);
}
ck('de wizard gebruikt dezelfde kern (wizWaKoppel -> waesKern) en geen eigen FB-aanroepen',
  /async function wizWaKoppel[\s\S]*?await waesKern\(es\)/.test(kernSrc));
ck('dashboard.js haalt de module binnen en plakt hem in',
  /require\('\.\/_dash\/wizard-whatsapp'\)/.test(dashSrc) && /\$\{_wizardWa\.js\(\)\}/.test(dashSrc));

// de CSP zonder configuratie mag facebook niet noemen
delete process.env.META_APP_ID; delete process.env.META_ES_CONFIG_ID;
const waes = require('../api/_waes.js');
ck('zonder env-vars is Embedded Signup uit', waes.isConfigured() === false);

console.log(`${ok} geslaagd, 0 gefaald`);
