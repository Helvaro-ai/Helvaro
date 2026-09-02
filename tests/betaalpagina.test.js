/*
 * De pagina waar iemand geld wil uitgeven, mag nooit leeg of doodlopend zijn.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * tekenPlannen() deed .map().join('') over de plannenlijst. Kwam die leeg terug
 * -- en dat kan, want de lijst hangt aan de Stripe-configuratie -- dan werd de
 * innerHTML letterlijk een lege string. Een blanco scherm, geen uitleg, geen
 * knop, op precies de plek waar een klant wilde betalen.
 *
 * Dat is geen theoretisch geval: in productie stond op dit moment een
 * TEST-sleutel van Stripe, en de plannenlijst hangt aan diezelfde configuratie.
 *
 * De foutstand ernaast was net zo doodlopend: "De plannen konden niet opgehaald
 * worden. Ververs de pagina." Geen knop, en alleen Nederlands -- terwijl de
 * knoppen eromheen ("Je huidige plan", "Kies Starter") dat ook al waren, op een
 * scherm dat Waalse en Duitstalige makelaars net zo goed te zien krijgen.
 *
 * Wie hier strandt is een klant die WIL betalen. Dat is de duurste plek in het
 * product om iemand te laten vastlopen.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';
const i18n = require(BASE + 'api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

function pagina() {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return html;
}
const html = pagina();

console.log('\nDe betaalpagina loopt niet dood');

console.log('\n  een lege plannenlijst is geen blanco scherm');
{
  const m = html.match(/function tekenPlannen\(\) \{[\s\S]*?\n\}/);
  ck('tekenPlannen staat in de pagina', !!m, null);
  const blok = m ? m[0] : '';
  ck('er is een controle op een lege lijst',
    /planState\.plannen\.length === 0/.test(blok), null);
  ck('en die staat VOOR de map die anders leeg rendert',
    blok.indexOf('length === 0') !== -1
    && blok.indexOf('length === 0') < blok.indexOf('.map(function (p)'), null);
  ck('met een uitleg in plaats van niets', /plan\.leeg/.test(blok), null);
  ck('en een knop om het opnieuw te proberen',
    /plan\.opnieuw/.test(blok) && /laadPlannen\(true\)/.test(blok), null);
}

console.log('\n  de foutstand geeft een uitweg');
{
  /* Niet op een blok-slice toetsen: de niet-gulzige regex stopte bij de eerste
     \n} en ving mijn eigen commentaar mee, waardoor de test rood werd op het
     woord in een uitleg. Toets op de RENDERREGEL zelf. */
  ck('de plannenfout toont een mensentaal-zin met een knop',
    /grid\.innerHTML = '<div class="fa-plan"><div class="fa-plan-regel">'\s*\n\s*\+ escHtml\(hvFoutZin\(e\)\)/.test(html), null);
  ck('en die knop laadt opnieuw', /onclick="laadPlannen\(true\)"/.test(html), null);
  ck('nergens meer "Ververs de pagina" als enige uitweg in een foutmelding',
    !/innerHTML = 'Het facturatieoverzicht kon niet opgehaald worden\. Ververs de pagina\.'/.test(html)
    && !/fa-leeg">Niet opgehaald\. Ververs de pagina\./.test(html), null);
  ck('ook de facturatiepagina biedt opnieuw proberen aan',
    /onclick="loadFacturatie\(true\)"/.test(html), null);
}

console.log('\n  de knoppen spreken de taal van de klant');
/* Let op waar je op toetst. De Nederlandse ZIN staat straks gewoon in het
   woordenboek dat met de pagina meegaat -- dat hoort zo. Wat weg moest is de
   hardgecodeerde plek in de MARKUP. Een eerdere versie van deze test zocht op
   de zin zelf en werd rood op zijn eigen vertaling. */
for (const [gecodeerd, sleutel] of [
  ['disabled>Je huidige plan</button>', 'plan.huidig'],
  ['>Binnenkort</button>', 'plan.binnenkort'],
  ['title="Online betalen staat nog niet aan"', 'plan.binnenkortUitleg'],
]) {
  ck(`niet meer hardgecodeerd in de markup: ${gecodeerd}`, html.indexOf(gecodeerd) === -1, null);
  ck(`  → via ${sleutel}`, html.indexOf(sleutel) !== -1, null);
}
ck('"Kies <plan>" komt uit het woordenboek, met de naam als variabele',
  /tr\('plan\.kies', \{ naam: p\.naam \}\)/.test(html) && !/>Kies ' \+ escHtml\(p\.naam\)/.test(html), null);

console.log('\n  en dat woordenboek is compleet');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const sleutels = ['plan.leeg', 'plan.opnieuw', 'plan.huidig', 'plan.binnenkort',
                    'plan.binnenkortUitleg', 'plan.kies'];
  const mist = sleutels.filter((k) => { const v = i18n.t(taal, k); return !v || v === k; });
  ck(`${taal}: alle zes de teksten bestaan`, mist.length === 0, mist);
}
ck('de plaatshouder {naam} staat in alle vier de talen',
  ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, 'plan.kies').indexOf('{naam}') !== -1),
  ['nl', 'fr', 'en', 'de'].map((t) => i18n.t(t, 'plan.kies')));

/* De lege-staat mag niet klinken alsof de klant iets fout deed. Dit is een
   configuratieprobleem aan onze kant, en dat hoort er ook te staan. */
ck('de lege-staat neemt de schuld, en wijst niet naar de klant',
  /ligt aan ons/.test(i18n.t('nl', 'plan.leeg')), i18n.t('nl', 'plan.leeg'));

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
