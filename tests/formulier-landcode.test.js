'use strict';
/* Het telefoonveld van het leadformulier: een landcode kiezen en het eigen nummer intikken. */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const _regio = require(BASE + 'api/_regio.js');

let pass = 0, fail = 0;
function ck(naam, ok, extra) {
  if (ok) { pass++; console.log('  OK    ' + naam); }
  else { fail++; console.log('  FOUT  ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

function render() {
  const h = require(BASE + 'api/form-page.js');
  const req = { method: 'GET', query: { project: 'TESTCODE' }, headers: { host: 'app.helvaro.pro' }, url: '/start/TESTCODE' };
  let body = '';
  const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, send(b) { body = b; }, end(b) { body = b || body; }, json(o) { body = JSON.stringify(o); } };
  return Promise.resolve(h(req, res)).then(() => body);
}

(async () => {
  const body = await render();
  console.log('Het formulier');
  ck('een veld: vlag met pijltje (landkeuze), vaste landcode, dan het nummer', /<div class="tel-veld">[\s\S]*?<span class="tel-vlag" id="tel-vlag"[^>]*>🇧🇪<\/span>[\s\S]*?<select id="tel-land"[\s\S]*?<span class="tel-prefix" id="tel-prefix"[^>]*>\+32<\/span>\s*<input id="tel"/.test(body));
  ck('vlag en code volgen de keuze; een zelf getypte +.. verbergt de vaste code', /sel\.addEventListener\('change'/.test(body) && /prefixEl\.hidden = \/\^\\s\*\(\\\+\|00\)\/\.test\(telEl\.value\)/.test(body));
  ck('het land van de dealer (standaard België) staat voorgeselecteerd en bovenaan', /<select id="tel-land"[^>]*><option value="32" data-land="BE" selected>/.test(body));
  ck('landen zonder nationale 0 dragen dat mee (Italie)', /data-land="IT" data-houd-nul="1"/.test(body) && !/data-land="BE" data-houd-nul/.test(body));
  ck('veel landen, elk met vlag en code', (body.match(/<option value="\d+" data-land="[A-Z]{2}"/g) || []).length >= 40);
  ck('het voorbeeld toont geen vaste +32 meer', !/placeholder="\+32/.test(body));
  const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  ck('het script van de pagina is geldige JavaScript', scripts.every((s) => { try { new Function(s); return true; } catch (_) { return false; } }));

  console.log('\nHet nummer dat verstuurd wordt (de echte code uit de pagina)');
  const script = scripts.join('\n');
  const start = script.indexOf('var phoneRuw');
  const eind = script.indexOf('var email', start);
  const blok = script.slice(start, eind);
  ck('het samenstel-blok staat in de pagina', start > 0 && eind > start);
  const samen = (getypt, code) => {
    const houd = ['39', '34', '351', '352', '30', '45', '47', '372', '371', '420', '1'].indexOf(code) !== -1;
    const optie = { getAttribute: (n) => (n === 'data-houd-nul' && houd ? '1' : null) };
    const document = { getElementById: (id) => (id === 'tel' ? { value: getypt } : id === 'tel-land' ? { value: code, options: [optie], selectedIndex: 0 } : null) };
    let gezet = null;
    const f = new Function('document', 'mailModus', 'err', 'I18N', 'AI_FIRST', blok + '; return phone;');
    gezet = f(document, false, { textContent: '' }, {}, '');
    return gezet;
  };
  const gevallen = [
    ['0478 12 34 56', '32', '+32478123456', 'Belgisch met nationale 0'],
    ['478 12 34 56', '32', '+32478123456', 'Belgisch zonder 0'],
    ['06 12345678', '31', '+31612345678', 'Nederland gekozen'],
    ['1512 3456789', '49', '+4915123456789', 'Duitsland gekozen'],
    ['+33 6 12 34 56 78', '32', '+33 6 12 34 56 78', 'zelf +33 getypt: blijft precies zo'],
    ['0033612345678', '32', '0033612345678', 'zelf 00.. getypt: blijft precies zo'],
    ['(0)478-12.34.56', '32', '+32478123456', 'haakjes, streepjes en punten'],
    ['06 1234 5678', '39', '+390612345678', 'Italiaanse vaste lijn: de 0 blijft'],
    ['612 345 678', '34', '+34612345678', 'Spanje'],
  ];
  for (const [in_, code, uit, naam] of gevallen) ck(`${naam}: ${in_} → ${uit}`, samen(in_, code) === uit, samen(in_, code));

  console.log('\nDe server maakt er het WhatsApp-formaat van');
  const be = _regio.standaard();
  for (const [in_, code, , naam] of gevallen) {
    const verzonden = samen(in_, code);
    const e164 = _regio.naarE164(verzonden, be);
    ck(`${naam}: geldig internationaal nummer (${e164})`, /^\d{8,15}$/.test(e164) && !e164.startsWith('0'), e164);
  }
  ck('een Nederlands nummer blijft Nederlands, ook bij een Belgische dealer', _regio.naarE164(samen('06 12345678', '31'), be) === '31612345678');

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('STUK:', e && e.stack); process.exit(1); });
