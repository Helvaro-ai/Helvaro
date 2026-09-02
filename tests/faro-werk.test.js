/*
 * Wat Faro beweert gedaan te hebben.
 *
 * ── Waar dit over gaat ──────────────────────────────────────────────────────
 * Eén eigenschap, en die is belangrijker dan alle opmaak samen:
 *
 *     FARO ZEGT NOOIT DAT HIJ IETS DEED ALS HET NIET IS VASTGELEGD.
 *
 * Een assistent die één keer beweert "ik heb Sarah opgevolgd" terwijl er niets
 * verstuurd is, is daarna nergens meer op te vertrouwen -- en dan is elk ander
 * getal op het scherm ook verdacht. Vertrouwen is hier het product.
 *
 * ── De opvolging is het scherpste geval ─────────────────────────────────────
 * api/cron-followup.js VERSTUURT wel degelijk opvolgingen. Alleen legt hij
 * daarvoor niets eigens vast: hij zet `Conversation State = 'in_progress'`, en
 * datzelfde veld krijgt dezelfde waarde wanneer de LEAD antwoordt. Uit het
 * record valt dus niet af te leiden wie er iets deed.
 *
 * De opdracht vroeg expliciet om "7 follow-ups completed" op het dashboard. Dat
 * getal bestaat niet en mag dus niet getoond worden. Deze test houdt dat vast,
 * want dit is precies het soort veld dat er later "even snel" bij komt.
 */
'use strict';

const BASE = require('path').join(__dirname, '..') + '/';
const werk = require(BASE + 'api/_faro/werk.js');
const i18n = require(BASE + 'api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

const uur = 3600 * 1000;
const nu = Date.now();
const lead = (over) => Object.assign({
  id: 'rec' + Math.random().toString(36).slice(2, 8),
  naam: 'Naamloos', datum: new Date(nu - 2 * uur).toISOString(),
  qualified: false, boekingslinkVerstuurd: false, afspraakGeboekt: false, aiPaused: false,
}, over);

console.log('\nFaro — wat hij beweert gedaan te hebben');

// ── 1. Niet doen alsof ─────────────────────────────────────────────────────
console.log('\n  niet doen alsof');

/* Dit bestand telt NIETS. api/_command.js doet dat al in overview(), inclusief
   de omzetkant, en zegt in zijn eigen header dat elk getal daar rekenwerk over
   bestaande records is. Twee tellers op hetzelfde product zijn twee getallen die
   na een half jaar niet meer gelijk zijn -- en dan gelooft niemand er nog een.

   Deze assertie is er zodat de telling hier niet "even snel" terugkomt. */
ck('werk.js telt niet zelf; dat doet _command.js',
  typeof werk.samenvatting === 'undefined' && typeof werk.heeftNieuws === 'undefined',
  Object.keys(werk));
{
  const command = require(BASE + 'api/_command.js');
  ck('en _command.js levert die tellingen wél', typeof command.overview === 'function', null);
}

/* DE regel van dit bestand. cron-followup.js legt geen opvolging vast, dus mag
   Faro er nergens een claim over doen -- niet als telling en niet als
   gebeurtenis. Dit is precies het veld dat er later "even snel" bij komt. */
const alleSoorten = Object.keys(werk.SOORTEN);
ck('er is GEEN gebeurtenis "opgevolgd", want die ligt nergens vast',
  !alleSoorten.some((k) => /opvolg|followup|opgevolgd/i.test(k)), alleSoorten);

/* Een lead waar niets mee gebeurd is levert precies één gebeurtenis op: hij
   kwam binnen. Geen verzonnen kwalificatie, geen verzonnen opvolging. */
const kaal = werk.gebeurtenissen([lead({ naam: 'Stil' })]);
ck('een onaangeraakte lead levert alleen "kwam binnen" op',
  kaal.length === 1 && kaal[0].soort === 'nieuw', kaal.map((e) => e.soort));

const vol = werk.gebeurtenissen([lead({
  naam: 'Compleet', qualified: true, boekingslinkVerstuurd: true, afspraakGeboekt: true,
})]);
ck('en een volledige lead levert er precies vier op',
  vol.length === 4, vol.map((e) => e.soort));

ck('een gepauzeerde lead levert een "ik heb je nodig"-gebeurtenis op',
  werk.gebeurtenissen([lead({ aiPaused: true })]).some((e) => e.soort === 'aandacht'), null);

ck('een lege lijst loopt niet stuk',
  werk.gebeurtenissen([]).length === 0 && werk.gebeurtenissen(null).length === 0, null);

// ── 2. Eerlijk over de tijd ────────────────────────────────────────────────
console.log('\n  eerlijk over wat we niet weten');

/* Airtable legt één datum per lead vast: wanneer hij binnenkwam. WANNEER hij
   gekwalificeerd werd staat nergens. De volgorde binnen een lead klopt (door er
   seconden bij op te tellen), maar het tijdstip is geschat -- en dat hoort de
   UI te kunnen zeggen. */
ck('"kwam binnen" heeft een echte tijdstempel',
  vol.find((e) => e.soort === 'nieuw').geschat === false, null);
ck('maar de rest is als geschat gemarkeerd',
  vol.filter((e) => e.soort !== 'nieuw').every((e) => e.geschat === true),
  vol.map((e) => [e.soort, e.geschat]));

const zonderDatum = werk.gebeurtenissen([lead({ naam: 'Geen datum', datum: null, qualified: true })]);
ck('een lead zonder datum levert geen gebeurtenissen op (liever niets dan een gok)',
  zonderDatum.length === 0, zonderDatum);

// ── 5. De beoordeling ──────────────────────────────────────────────────────
console.log('\n  Faro\'s beoordeling van een lead');

const rijk = werk.beoordeling(lead({
  naam: 'Marie', qualified: true, reden: 'Zoekt actief, budget past',
  capaciteit: '350.000 euro', urgentie: '1-3 maanden', fit: 'Hoog', bron: 'Website',
}));
ck('de punten komen uit echte velden', rijk.punten.length === 4, rijk.punten);
ck('de reden komt letterlijk uit het Reason-veld',
  rijk.reden === 'Zoekt actief, budget past', rijk.reden);
ck('en hij is niet leeg', rijk.leeg === false, rijk);

const leeg = werk.beoordeling(lead({ naam: 'Onbekend' }));
ck('een lead zonder gegevens levert een LEGE beoordeling op, geen verzonnen',
  leeg.leeg === true && leeg.punten.length === 0, leeg);
ck('beoordeling van niets loopt niet stuk', werk.beoordeling(null).leeg === true, null);

// ── 6. Wat Faro deed, per lead ─────────────────────────────────────────────
console.log('\n  wat Faro per lead deed');
ck('alleen wat vastligt',
  JSON.stringify(werk.watFaroDeed(lead({ qualified: true }))) ===
  JSON.stringify(['faro.deed.gesprek', 'faro.deed.gekwalificeerd']),
  werk.watFaroDeed(lead({ qualified: true })));
ck('een gepauzeerde lead meldt dat hij gestopt is',
  werk.watFaroDeed(lead({ aiPaused: true })).indexOf('faro.deed.gestopt') !== -1, null);

// ── 7. Alles is vertaald ───────────────────────────────────────────────────
console.log('\n  Faro spreekt vier talen');
const sleutels = Object.values(werk.SOORTEN).map((x) => x.sleutel)
  .concat(['faro.sum.deed', 'faro.sum.stil', 'faro.beoordeling.kop', 'faro.beoordeling.leeg',
           'faro.act.leeg', 'faro.deed.kop', 'faro.deed.gestopt']);
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const mist = sleutels.filter((k) => {
    const v = i18n.t(taal, k);
    return !v || v === k;
  });
  ck(`${taal}: alle Faro-zinnen bestaan`, mist.length === 0, mist);
}
/* Faro spreekt in de ik-vorm: "Ik kwalificeerde Jan", niet "Lead
   gekwalificeerd". Dat is het hele punt van deze laag. */
ck('en hij spreekt in de ik-vorm', /^Ik /.test(i18n.t('nl', 'faro.act.gekwalificeerd'))
  && /^I /.test(i18n.t('en', 'faro.act.gekwalificeerd')), null);

// ── 8. Het dashboard gebruikt dezelfde soorten en dezelfde stem ────────────
console.log('\n  het dashboard spreekt met Faro\'s stem');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard?lang=en', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

  /* Eén definitie van de soorten: die van werk.js, geinjecteerd. Zonder dit
     kan de lijst in het dashboard stilletjes uit de pas gaan lopen met wat
     Faro server-side hanteert. */
  const m = html.match(/const FARO_SOORTEN = (\{[\s\S]*?\});/);
  const soortenInPagina = m ? Object.keys(JSON.parse(m[1])) : [];
  ck('de soorten komen uit werk.js, niet uit een tweede lijst',
    JSON.stringify(soortenInPagina) === JSON.stringify(Object.keys(werk.SOORTEN)),
    soortenInPagina);

  /* De oude, systeemtalige teksten mogen niet terugkomen -- maar ze mogen wel
     in COMMENTAAR staan, want daar leggen ze juist uit waarom ze weg zijn.
     Dus eerst het commentaar eruit; het gaat om wat de klant ziet. */
  const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('geen "Lead gekwalificeerd:" meer in de code', !/Lead gekwalificeerd:/.test(code), null);
  ck('geen "Nieuwe lead:" meer in de code', !/Nieuwe lead:/.test(code), null);

  /* Calendly is uitgefaseerd; de lijst beweerde dat afspraken daarlangs
     liepen. Dat was een onware mededeling aan de klant. */
  ck('de onware Calendly-mededeling is weg',
    !/Afspraak ingepland via Calendly/.test(code), null);

  ck('de lijst gebruikt de Faro-sleutels',
    /tr\('faro\.act\.gekwalificeerd'/.test(html) && /tr\('faro\.act\.aandacht'/.test(html), null);

  /* De belangrijkste toevoeging: een vastgelopen lead was in de oude lijst
     onzichtbaar, terwijl dat de enige gebeurtenis is waar een mens iets voor
     moet doen. */
  ck('een vastgelopen lead levert nu wel een regel op',
    /l\.aiPaused === true\).{0,60}aandacht/s.test(html), null);

  /* En de lijst mag geen opvolging tonen: die ligt nergens vast. */
  ck('de lijst claimt geen opvolgingen',
    !/faro\.act\.(opvolg|followup)/.test(html), null);
}

// ── 9. Het leadpaneel ──────────────────────────────────────────────────────
console.log('\n  Faro\'s beoordeling op de gesprekspagina');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash2 = require(BASE + 'api/dashboard.js');
  let h2 = '';
  dash2({ method: 'GET', url: '/dashboard?lang=en', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { h2 = String(b); }, json() {}, end() {} });

  /* Eén definitie van velden en volgorde: die van werk.js. */
  const bv = h2.match(/const FARO_BEOORDELING_VELDEN = (\[[\s\S]*?\]);/);
  const dr = h2.match(/const FARO_DEED_REGELS = (\[[\s\S]*?\]);/);
  ck('de beoordelingsvelden komen uit werk.js',
    bv && JSON.stringify(JSON.parse(bv[1])) === JSON.stringify(werk.BEOORDELING_VELDEN),
    bv ? bv[1].slice(0, 120) : null);
  ck('en de "wat ik deed"-regels ook',
    dr && JSON.stringify(JSON.parse(dr[1])) === JSON.stringify(werk.DEED_REGELS),
    dr ? dr[1].slice(0, 120) : null);

  ck('het paneel wordt in het gesprek getoond', /\$\{faroLeadPaneel\(lead\)\}/.test(h2), null);

  /* De belangrijkste eigenschap: leeg blijft leeg. Een lead waar de AI nog
     niets over weet mag geen verzonnen inschatting krijgen. */
  ck('een lege lead krijgt "hier weet ik nog niets over"',
    /faro\.beoordeling\.leeg/.test(h2) && /if \(leeg\) \{/.test(h2), null);

  ck('het paneel toont geen mascotte-spektakel, alleen een klein icoon',
    /falcon-idle\.webp" alt="" aria-hidden="true" width="20"/.test(h2), null);
  ck('en het krimpt op smal beeld', /max-width: 640px[\s\S]{0,200}faro-lead/.test(h2), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
