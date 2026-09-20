/*
 * STOP tijdens de Meta-screencast (2026-09-20): de vlag werd gezet, maar
 *
 *   ReferenceError: Cannot access 'lang' before initialization  (whatsapp.js)
 *
 * -- `lang` staat pas tweehonderd regels verderop als const. De bevestiging
 * aan de lead en de melding aan de makelaar gingen nooit uit, en op het
 * dashboard was NIETS te zien: antwoordvak en 'Neem over' stonden er gewoon.
 * De server weigerde wel (409), maar dat leest als 'je kunt nog sturen'.
 *
 * Twee dingen bewaakt: geen dode-zone-variabelen in het STOP-blok, en het
 * dashboard toont de afmelding en verbergt het antwoordvak.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nHet STOP-blok gebruikt niets dat pas later gedeclareerd wordt');
{
  const src = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  const start = src.indexOf('if (_optout.isAfmelding(text)) {');
  const eind  = src.indexOf('/* Al eerder afgemeld?', start);
  /* Commentaar en tekst tussen aanhalingstekens tellen niet mee: daar staan
     de namen juist als waarschuwing. */
  const blok  = src.slice(start, eind)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, '""');
  ck('STOP-blok gevonden', start > 0 && eind > start);
  /* Elke `const x =` die NA het blok staat, mag in het blok niet als losse
     identifier voorkomen. Dat is precies de klasse fout die ownerPhone,
     leadName en nu lang gaven. */
  const later = src.slice(eind);
  const laterConsts = [...later.matchAll(/^\s*(?:const|let) (\w+)\s*=/gm)].map((m) => m[1]);
  const uniek = [...new Set(laterConsts)];
  const gebruikt = uniek.filter((naam) => new RegExp('(^|[^\\w.$\'"])' + naam + '(?![\\w$])').test(blok));
  /* Namen die ook vóór het blok al bestaan (parameters, eerdere consts) zijn
     legitiem; alleen wat uitsluitend later gedeclareerd is, telt. */
  const eerder = src.slice(0, start);
  const echtDood = gebruikt.filter((naam) => !new RegExp('(?:const|let|var|function)\\s+' + naam + '\\b|\\b' + naam + '\\s*[,)]\\s*(?:=>|\\{)|\\(([^)]*\\b' + naam + '\\b[^)]*)\\)\\s*(?:=>|\\{)').test(eerder));
  ck('geen dode-zone-variabelen in het STOP-blok', echtDood.length === 0, echtDood);
  ck('de bevestiging gebruikt een eigen lokale taal (langA)', /_optout\.bevestiging\(langA\)/.test(blok) && !/bevestiging\(lang\)/.test(blok));
}

console.log('\nHet dashboard ziet de afmelding');
{
  const read = fs.readFileSync(BASE + 'api/_leads-read.js', 'utf8');
  ck("_leads-read geeft 'afgemeld' door uit Opted Out", /afgemeld:\s+f\['Opted Out'\] === true/.test(read));

  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('gesprekken-composer wijkt voor de afmeldbalk', html.includes('if (lead.afgemeld) return afgemeldBalkHtml();'));
  ck('zijpaneel toont de balk in plaats van antwoordvak en Neem over', html.includes('if (lead.afgemeld) {\n      bodyHTML += `\n      <div class="panel-section">\n        <div class="panel-section-title">WhatsApp</div>\n        ${afgemeldBalkHtml()}'));
  ck('STOP-badge in de gesprekkenlijst', html.includes('conv-stop-badge'));
  const i18n = require(BASE + 'api/_i18n.js');
  ck('conv.afgemeld in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, 'conv.afgemeld') !== 'conv.afgemeld' && i18n.t(t, 'conv.afgemeldKort') !== 'conv.afgemeldKort'));
  ck("de tekst zegt 'STOP' en dat bellen nog mag", /STOP/.test(i18n.t('nl', 'conv.afgemeld')) && /Bellen mag/.test(i18n.t('nl', 'conv.afgemeld')));
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
