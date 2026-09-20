/*
 * Eigen WhatsApp-nummer (Embedded Signup): het token van de klant.
 *
 * Tot 2026-09-20 gooide wa-es-complete het business token weg. Verzenden
 * vanaf het eigen nummer liep dan met Helvaro's gedeelde token, dat de WABA
 * van de klant niet kent. Nu: versleuteld op Client Config, gelezen per
 * phone_number_id, en het gaat vóór het gedeelde token in elke zendroute.
 * Plus: ontkoppelen bestaat, zodat een test terug te draaien is.
 */
'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-voor-wa-token';
process.env.FARO_WORKSPACE_ENABLED = '1';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const tok = require(BASE + 'api/_wa-token.js');

console.log('\nVersleuteling');
{
  const blob = tok.versleutel('EAAB-geheim-token-123');
  ck('blob heeft prefix en is geen platte tekst', blob.startsWith('wa1.') && !blob.includes('geheim'), blob.slice(0, 12));
  ck('rondreis klopt', tok.ontsleutel(blob) === 'EAAB-geheim-token-123');
  ck('twee keer versleutelen = twee verschillende blobs (iv)', tok.versleutel('x') !== tok.versleutel('x'));
  ck('platte tekst zonder prefix leest als leeg', tok.ontsleutel('EAAB-plain') === '');
  ck('geknoeide blob leest als leeg, gooit niet', tok.ontsleutel(blob.slice(0, -4) + 'AAAA') === '');
  ck('leeg/undefined leest als leeg', tok.ontsleutel('') === '' && tok.ontsleutel(undefined) === '');
}

console.log('\nCache');
{
  tok.onthoud('111', 'tok-111');
  tok.voorNummer('111').then((v) => { ck('onthoud → direct beschikbaar zonder Airtable', v === 'tok-111', v); tok.vergeet('111'); });
}

console.log('\nElke zendroute pakt het eigen token eerst');
{
  const send = fs.readFileSync(BASE + 'api/_wa-send.js', 'utf8');
  ck('_wa-send: creds is async en vraagt het per nummer', send.includes('async function creds(phoneNumberId, tokenOverride)') && send.includes('await _waToken.voorNummer(phoneNumberId)'));
  ck('_wa-send: eigen token vóór override en env', send.includes("const token = eigen || tokenOverride || process.env.WHATSAPP_TOKEN || '';"));
  ck('_wa-send: beide aanroepen awaiten creds', (send.match(/await creds\(phoneNumberId, tokenOverride\)/g) || []).length === 2);
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('whatsapp.js sendWA: eigen token in de header', wa.includes('Authorization: `Bearer ${eigenToken || WHATSAPP_TOKEN}`'));
  const waes = fs.readFileSync(BASE + 'api/_waes.js', 'utf8');
  ck('_waes: completeSignup geeft het token terug', /return \{ wabaId, phoneNumberId, token, systeemgebruiker: systeem, \.\.\.info \};/.test(waes));
  ck('_waes: systeemgebruiker koppelen is best effort (vangt af)', waes.includes("console.warn('[waes] systeemgebruiker niet gekoppeld aan WABA'"));
  const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
  ck('leads: token versleuteld opgeslagen bij koppelen', leads.includes('[_waToken.F_TOKEN]: tokenBlob }'));
  ck('leads: token gaat NIET terug naar de browser', leads.includes('const { token: _t, ...zonderToken } = uit;'));
  ck('leads: ontkoppelen wist nummer, WABA en token', leads.includes("const velden = { fldbrhlSrsmlJwcYr: '', fldCEqMp5zs1Wos3T: '', [_waToken.F_TOKEN]: '' };"));
  ck('leads: status haalt het label met het eigen token', leads.includes('_waes.getPhoneInfo(eigenNummer, _waToken.ontsleutel(rec.fields[_waToken.F_TOKEN]) || undefined)'));
}

console.log('\nDashboard');
{
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('ontkoppelknop bestaat, verborgen tot er iets gekoppeld is', html.includes('id="set-waes-los" onclick="waesOntkoppelen()" style="display:none"'));
  ck('gekoppeld: koppelknop weg, ontkoppelknop zichtbaar', html.includes("if (los) { los.style.display = ''; los.disabled = false; }"));
  ck('ontkoppelen vraagt bevestiging en roept wa-es-disconnect', html.includes("body: JSON.stringify({ mode: 'wa-es-disconnect' })") && html.includes("title: tr('set.waes.disconnect'),"));
  const i18n = require(BASE + 'api/_i18n.js');
  ck('teksten in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => ['set.waes.disconnect', 'set.waes.disconnect.q', 'set.waes.disconnected', 'set.waes.sub.gekoppeld'].every((k) => i18n.t(t, k) !== k)));
}

setTimeout(() => { console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0); }, 50);
