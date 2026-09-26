'use strict';
/*
 * Wat de Meta-reviewer ziet, in het Engels, en of het klopt (2026-09-26).
 *
 * Drie dingen stonden in de reviewersessie op productie:
 *   1. De kaart "Connect WhatsApp number" zei "You do not set this up
 *      yourself", terwijl Instellingen > WhatsApp een knop "Connect number"
 *      (Embedded Signup) heeft. Voor een Tech Provider-review is dat precies
 *      de functie die ze komen bekijken; de kaart sprak hem tegen.
 *   2. In elk gesprek stond de spreker als "ASSISTENT" (Nederlands) zodra
 *      de assistent nog geen eigen naam had.
 *   3. Het venster achter "Let us know" was hard Nederlands.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const i18n = require(BASE + 'api/_i18n.js');
function render(pad) {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let uit = '';
  const q = pad.indexOf('?') > -1 ? Object.fromEntries(new URLSearchParams(pad.split('?')[1])) : {};
  dash({ method: 'GET', url: pad, query: q, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { uit = String(b); }, end(b) { if (b) uit = String(b); }, json() {} });
  return uit;
}

const html = render('/dashboard?lang=en');
const js = render('/dashboard.js?lang=en&asset=js');
const bron = js.length > 1000 ? js : html;

console.log('\nde WhatsApp-kaart op het dashboard');
{
  ck('zegt niet meer "You do not set this up yourself"', html.indexOf('You do not set this up yourself') === -1);
  ck('wijst naar Settings > WhatsApp > Connect number', html.indexOf('Settings &gt; WhatsApp &gt; Connect number') > -1 || html.indexOf('Settings > WhatsApp > Connect number') > -1);
  ck('in vier talen, en elke taal noemt het pad', ['nl', 'fr', 'en', 'de'].every((t) => / > WhatsApp > /.test(i18n.t(t, 'chk.whatsapp.sub'))),
    ['nl', 'fr', 'en', 'de'].map((t) => i18n.t(t, 'chk.whatsapp.sub').slice(0, 60)));
}

console.log('\nde spreker in een gesprek');
{
  ck('geen hard "Assistent" meer als terugval', !/return 'Assistent';/.test(bron));
  ck('maar het vertaalde woord', /function hvAssistentNaam\(\)[\s\S]{0,500}return tr\('set\.ai'\);/.test(bron));
  ck('en dat is "Assistant" in het Engels', i18n.t('en', 'set.ai') === 'Assistant');
}

console.log('\nhet venster achter "Let us know"');
{
  const f = /function vraagWhatsAppKoppeling\(\) \{[\s\S]*?\n\}/.exec(bron);
  ck('de functie bestaat', !!f);
  ck('titel, tekst en voorbeeld via tr()', f && /title:\s+tr\('wa\.koppel\.titel'\)/.test(f[0]) && /message:\s+tr\('wa\.koppel\.tekst'\)/.test(f[0]) && /voorbeeld: tr\('wa\.koppel\.voorbeeld'\)/.test(f[0]), f && f[0]);
  ck('het onderwerp aan support blijft (dat leest Helvaro)', f && /onderwerp: 'WhatsApp koppelen'/.test(f[0]));
  ck('drie sleutels in vier talen', ['wa.koppel.titel', 'wa.koppel.tekst', 'wa.koppel.voorbeeld'].every((k) => ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, k) !== k)));
  ck('het voorbeeld heeft echte regeleinden', /\n\n/.test(i18n.t('en', 'wa.koppel.voorbeeld')));
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
