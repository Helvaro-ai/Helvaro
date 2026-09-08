/*
 * Elk contactadres dat een klant te zien krijgt staat op helvaro.pro.
 *
 * Het privacybeleid gaf de gegevensbeschermingscontactpersoon op
 * `sindi.s@usehelvaro.pro` -- een ander domein dan al het andere op de pagina,
 * en een ander domein dan wat er bij Meta als DPO-contact is opgegeven.
 *
 * Dat is geen schoonheidsfoutje. Dit is het adres waarop AVG-verzoeken
 * binnenkomen: inzage, correctie, verwijdering. Een adres op een domein dat je
 * misschien niet meer gebruikt is een verzoek dat niemand ziet. En een
 * reviewer die de app-instellingen naast het privacybeleid legt, ziet twee
 * verschillende antwoorden op dezelfde vraag.
 *
 * Ook rechtgezet: de Reply-To-terugval in api/admin.js. Die stond op hetzelfde
 * oude adres. REPLY_TO staat in productie gezet, dus hij werd niet gebruikt --
 * maar een terugval die naar een dood postvak wijst valt pas op als je hem
 * nodig hebt.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};
const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* De pagina's zoals een klant ze krijgt, niet de bron: een adres dat in een
   opmerking staat is geen adres dat iemand aanschrijft. */
const privacy = require('../api/privacy.js');
const render = (url) => {
  let html = '';
  privacy({ method: 'GET', url, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return html;
};

console.log('\n— de juridische pagina\'s wijzen naar één domein —');
for (const [naam, url] of [['privacybeleid', '/privacy'], ['algemene voorwaarden', '/terms']]) {
  const html = render(url);
  ck(`${naam} rendert`, html.length > 500, html.length);

  const adressen = [...new Set(html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])];
  ck(`${naam}: er staan contactadressen op`, adressen.length > 0, adressen.join(', '));

  const vreemd = adressen.filter((a) => !/@helvaro\.pro$/i.test(a));
  ck(`${naam}: elk adres staat op helvaro.pro`,
     vreemd.length === 0, 'buiten het domein: ' + vreemd.join(', '));
}

console.log('\n— en nergens meer het oude domein —');
{
  /* Alleen wat naar de klant gaat. De historische samenvattingen in de repo
     mogen het oude adres noemen: dat is een verslag van wat er wás. */
  for (const bestand of ['api/privacy.js', 'api/admin.js', 'docs/verwerkersovereenkomst-DPA.md']) {
    const s = lees(bestand);
    ck(`${bestand} noemt usehelvaro.pro niet meer`,
       !/usehelvaro\.pro/.test(s),
       (s.match(/.{0,70}usehelvaro\.pro.{0,40}/) || [''])[0]);
  }

  /* De terugval moet er nog WEL zijn -- hem weghalen zou betekenen dat een
     ontbrekende REPLY_TO een lege Reply-To geeft in plaats van een werkend
     postvak. Het gaat erom dat hij naar het juiste domein wijst. */
  const admin = lees('api/admin.js');
  ck('de Reply-To-terugval bestaat nog',
     /process\.env\.REPLY_TO \|\| '[^']+'/.test(admin), null);
  ck('en wijst naar helvaro.pro',
     /process\.env\.REPLY_TO \|\| '[^']*@helvaro\.pro'/.test(admin),
     (admin.match(/process\.env\.REPLY_TO \|\| '[^']+'/) || [''])[0]);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
