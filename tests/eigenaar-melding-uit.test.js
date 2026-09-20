/*
 * WhatsApp-meldingen aan de eigenaar: aan/uit per klant (2026-09-20).
 *
 * Eén checkbox op Client Config ("WhatsApp Alert Off", fldIJcwzKDYvZa9w4),
 * gezet vanuit Instellingen. Staat hij aan, dan gaat er GEEN WhatsApp meer
 * naar het Notify Phone -- vanuit welke route dan ook. E-mail blijft.
 *
 * Bewaakt: de helper zelf, en dat ELKE plek die naar de eigenaar appt het
 * nummer via die helper haalt (anders lekt er een melding langs de knop).
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const eig = require(BASE + 'api/_eigenaar-melding.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nDe helper');
{
  ck('afwezig veld = meldingen aan', eig.waUit({}) === false && eig.waUit(null) === false);
  ck('op veld-id herkend', eig.waUit({ fldIJcwzKDYvZa9w4: true }) === true);
  ck('op veldnaam herkend', eig.waUit({ 'WhatsApp Alert Off': true }) === true);
  ck('"true" als string telt niet (Airtable geeft een echte boolean)', eig.waUit({ 'WhatsApp Alert Off': 'true' }) === false);
  ck('nummer: klantnummer eerst', eig.nummer({ fldZEApe0gfse07AU: '+32470000001' }, '+32470000009') === '+32470000001');
  ck('nummer: terugval op de globale', eig.nummer({}, '+32470000009') === '+32470000009');
  ck('nummer: uit = leeg, OOK zonder terugval', eig.nummer({ fldIJcwzKDYvZa9w4: true, fldZEApe0gfse07AU: '+32470000001' }, '+32470000009') === '');
}

console.log('\nElke eigenaarsroute loopt langs de knop');
{
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  const losse = wa.match(/const ownerPhone\w* = \(client\.fields\['fldZEApe0gfse07AU'\]/g) || [];
  ck('whatsapp.js: geen los gelezen Notify Phone meer (STOP, pauze, escalatie, afspraak)', losse.length === 0, losse);
  ck('whatsapp.js: vier plekken via _eigenaar.nummer', (wa.match(/_eigenaar\.nummer\(client\.fields, NOTIFY_PHONE\)/g) || []).length === 4);
  const form = fs.readFileSync(BASE + 'api/form.js', 'utf8');
  ck('form.js: nieuwe-lead-melding uit = geen terugval op NOTIFY_PHONE', form.includes("const notifyPhone = ownerWaUit ? '' : (ownerPhone || process.env.NOTIFY_PHONE);"));
  ck('form.js: de vlag komt uit het klantrecord', form.includes('ownerWaUit = _eigenaar.waUit(match.fields);'));
  const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
  ck('cron-followup: dagmelding via de helper', cron.includes("_eigenaar.nummer(f, process.env.NOTIFY_PHONE || '')"));
  const dealer = require(BASE + 'api/_dealer-melding.js');
  ck('dealer-melding: uit = niemand, ook de extra nummers niet',
    dealer.ontvangers({ fldIJcwzKDYvZa9w4: true, fldZEApe0gfse07AU: '+32470000001', fldxSbRXga4yO1RXy: '+32470000002' }).length === 0);
  ck('dealer-melding: aan = gewoon iedereen',
    dealer.ontvangers({ fldZEApe0gfse07AU: '+32470000001', fldxSbRXga4yO1RXy: '+32470000002' }).length === 2);
}

console.log('\nInstellingen');
{
  const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
  ck('config-get geeft waAlertOff', leads.includes("waAlertOff:     rec.fields['fldIJcwzKDYvZa9w4'] === true"));
  ck('config-save schrijft alleen een echte boolean', leads.includes('u.fldIJcwzKDYvZa9w4 = body.waAlertOff === true;'));
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('vinkje staat standaard AAN', /<input id="ap-wa-alert" type="checkbox" checked>/.test(html));
  ck('laden: vinkje = niet uit', html.includes('apWaAlert.checked = d.waAlertOff !== true;'));
  ck('opslaan: uit = vinkje weg', html.includes("waAlertOff:     !((document.getElementById('ap-wa-alert') || { checked: true }).checked),"));
  const i18n = require(BASE + 'api/_i18n.js');
  ck('ap.waAlert in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, 'ap.waAlert') !== 'ap.waAlert'));
  ck("geen echt telefoonnummer als voorbeeld", !/466 35 84 27|0466358427/.test(html));
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
