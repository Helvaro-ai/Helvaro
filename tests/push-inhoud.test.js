/* Elke nieuwe-leadmelding (zonder wagen) ging met een lege `contents` naar
 * OneSignal, en OneSignal weigert dat met 400 ("Message Notifications must have
 * Any/English language content"). Live gezien op 2026-10-09. Deze test eist:
 *   1. _push stuurt nooit een lege inhoud;
 *   2. het formulier geeft de melding zonder wagen een eigen tekst mee
 *      (zonder naam: pushmeldingen staan op het vergrendelscherm). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.ONESIGNAL_APP_ID = 'app-test';
process.env.ONESIGNAL_API_KEY = 'key-test';
process.env.ONESIGNAL_REST_API_KEY = 'key-test';

const verstuurd = [];
global.fetch = async (url, opts = {}) => {
  verstuurd.push(JSON.parse(opts.body || '{}'));
  return { ok: true, status: 200, json: async () => ({ id: 'n1' }), text: async () => '' };
};
const push = require(path.join(__dirname, '..', 'api', '_push.js'));

(async () => {
  if (!push.configured()) { console.log('push-inhoud: OneSignal-config niet herkend in test, sla runtime-deel over'); }
  else {
    await push.stuurNaarKantoor({ projectCode: 'TEST01', titel: 'Nieuwe lead', tekst: '' });
    const b = verstuurd.pop();
    assert.ok(b && b.contents && String(b.contents.en).trim(), 'lege tekst mag geen lege contents geven: ' + JSON.stringify(b && b.contents));
    await push.stuurVertaald({ projectCode: 'TEST01', titelSleutel: 'push.lead.title', tekstSleutel: 'push.lead.body', taal: 'nl' });
    const c = verstuurd.pop();
    assert.ok(/gegevens achter/.test(c.contents.en), 'nl-tekst van push.lead.body: ' + c.contents.en);
  }
  const form = fs.readFileSync(path.join(__dirname, '..', 'api', 'form.js'), 'utf8');
  const blok = form.slice(form.indexOf("stuurVertaald({"), form.indexOf("stuurVertaald({") + 300);
  assert.ok(/tekstSleutel: 'push\.lead\.body'/.test(blok), 'formulier geeft de melding een tekst mee');
  const i18n = require(path.join(__dirname, '..', 'api', '_i18n.js'));
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const t = i18n.t(taal, 'push.lead.body');
    assert.ok(t && t !== 'push.lead.body' && !/\{naam\}/.test(t), 'push.lead.body in ' + taal);
  }
  console.log('push-inhoud: ok');
})().catch(e => { console.error(e); process.exit(1); });
