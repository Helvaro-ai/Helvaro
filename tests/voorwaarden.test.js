/*
 * De algemene voorwaarden moeten kloppen met wat we echt aanrekenen.
 *
 * ── Waarom dit bestand bestaat ──────────────────────────────────────────────
 * Op 1 september 2026 stond op de publieke voorwaardenpagina:
 *
 *     "Helvaro. EUR 1.000 per maand ... Calendly integratie"
 *     "Alle bedragen zijn excl. Btw"
 *
 * Terwijl api/_plans.js al maanden EUR 249,99 / 499 / 799 INCLUSIEF btw
 * rekende en Calendly in de code als deprecated stond. De pagina was niet
 * verouderd op een detail; hij noemde een prijs die vier keer te hoog was en
 * een btw-behandeling die omgekeerd was. Dat is geen cosmetisch verschil maar
 * een verkeerde voorstelling van zaken tegenover klanten.
 *
 * Zoiets loopt niet uit elkaar door onwil maar doordat prijzen op twee plekken
 * staan en er maar één wordt aangepast. Deze test verbindt de twee: wie een
 * prijs wijzigt in _plans.js en de voorwaarden vergeet, krijgt hier een rode
 * regel in plaats van een boze klant.
 *
 * De pagina is ook de plek waar Google naar kijkt bij de OAuth-verificatie,
 * dus hij moet bovendien publiek en zonder login bereikbaar blijven.
 */
'use strict';

const BASE = require('path').join(__dirname, '..') + '/';
const plannen = require(BASE + 'api/_plans.js');
const handler = require(BASE + 'api/privacy.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

function haal(pad) {
  let uit = '';
  handler({ url: pad, method: 'GET' }, {
    setHeader() {}, status() { return this; }, send(b) { uit = String(b); },
  });
  return uit;
}

const terms = haal('/terms');
const privacy = haal('/privacy');

console.log('\nAlgemene voorwaarden');

console.log('\n  publiek bereikbaar');
ck('/terms geeft een pagina', terms.length > 2000, terms.length);
ck('/privacy geeft een pagina', privacy.length > 2000, privacy.length);
ck('en het zijn twee verschillende pagina\'s', terms !== privacy, null);

console.log('\n  de prijzen komen overeen met api/_plans.js');

/* 249.99 -> "249,99" op de pagina; 499 -> "499". Nederlandse komma, en geen
   duizendtalpunt want geen enkel plan komt boven de duizend. */
function alsTekst(bedrag) {
  return String(bedrag).replace('.', ',');
}

for (const plan of plannen.PLANNEN) {
  ck(`${plan.naam} staat met de juiste prijs (${alsTekst(plan.prijsEur)})`,
    terms.includes(alsTekst(plan.prijsEur)), plan.prijsEur);
  ck(`${plan.naam} staat met het juiste aantal credits (${plan.credits})`,
    terms.includes(plan.credits.toLocaleString('nl-BE')) || terms.includes(String(plan.credits)),
    plan.credits);
}

ck('de btw-behandeling klopt met BTW_MODUS',
  plannen.BTW_MODUS === 'inclusief'
    ? /inclusief\s+21%\s+btw/i.test(terms)
    : /excl\.?\s*btw/i.test(terms),
  plannen.BTW_MODUS);

ck(`een gesprek kost ${plannen.CREDITS_PER_GESPREK} credits, en dat staat er ook`,
  terms.includes(`${plannen.CREDITS_PER_GESPREK} credits`), plannen.CREDITS_PER_GESPREK);

console.log('\n  geen achterhaalde beloftes');
/* Calendly staat in api/leads.js expliciet als deprecated. Een voorwaardenpagina
   mag geen integratie beloven die we aan het uitfaseren zijn. */
ck('Calendly wordt niet meer als integratie beloofd', !/Calendly/i.test(terms), null);
ck('de oude eenheidsprijs van 1.000 euro is weg', !/1\.000 per maand/.test(terms), null);

console.log('\n  de onderwerpen die Google en de klant nodig hebben');
for (const [naam, patroon] of [
  ['credits', /<h2>[^<]*Credits/i],
  ['AI-functionaliteit', /<h2>[^<]*AI-functionaliteit/i],
  ['WhatsApp', /<h2>[^<]*WhatsApp/i],
  ['Google Agenda', /<h2>[^<]*Google Agenda/i],
  ['intellectuele eigendom', /intellectuele eigendom/i],
  ['opschorting en beëindiging', /<h2>[^<]*Opschorting/i],
  ['aansprakelijkheid', /<h2>[^<]*Aansprakelijkheid/i],
  ['wijzigingen', /<h2>[^<]*Wijzigingen/i],
  ['contact', /<h2>[^<]*Contact/i],
  ['ingangsdatum', /Van kracht sinds/i],
]) {
  ck(`${naam} staat erin`, patroon.test(terms), null);
}

/* Google kijkt bij de OAuth-verificatie of het privacybeleid en de voorwaarden
   naar elkaar verwijzen en vindbaar zijn. */
ck('de voorwaarden linken naar het privacybeleid', /href="\/privacy"/.test(terms), null);

console.log('\n  wat de assistent NIET belooft');
ck('geen omzet- of resultaatgarantie',
  /geen leads, geen verkoopresultaat en geen omzetgarantie/i.test(terms), null);
ck('AI-antwoorden worden als niet vooraf goedgekeurd beschreven',
  /niet vooraf goedgekeurd/i.test(terms), null);
ck('de opt-out via STOP staat beschreven', /STOP/.test(terms), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
