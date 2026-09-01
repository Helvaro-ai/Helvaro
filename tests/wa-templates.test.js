/*
 * WhatsApp-template-registry.
 *
 * ── Wat hier bewezen wordt ──────────────────────────────────────────────────
 * Dit is de vervanger van één handgeschreven regel in api/_lang.js die niet
 * waar was: TEMPLATE_APPROVED_LANGUAGES beweerde dat fr_BE en en_US goedgekeurd
 * waren terwijl er op de WABA alleen nl_BE-templates stonden. Gevolg: een
 * Franstalige klant kreeg GEEN terugval naar het Nederlands, maar een send die
 * Meta weigerde. Stil, want er kwam geen fout in beeld -- er kwam nooit een
 * bericht aan.
 *
 * De twee dingen die hier echt op het spel staan:
 *
 * 1. GEEN REGRESSIE VOOR BESTAANDE KLANTEN. Die hebben geen Country en soms
 *    Language 'nl' terwijl de templates op 'nl_BE' staan. Als dit bestand hen
 *    "templates ontbreken" geeft, is de hele oefening een achteruitgang.
 *
 * 2. GEEN DUBBELE TEMPLATES. Templates zijn per TAAL, niet per klant. Drie
 *    Belgische klanten in het Nederlands delen één set. Het overzicht moet dat
 *    ook zo tellen, anders gaan we zes keer hetzelfde indienen.
 *
 * Alles hier draait op een INDEX die we zelf meegeven -- geen netwerk, geen
 * Meta. Dat is met opzet: dit moet ook groen zijn zonder token.
 */
const BASE = require('path').join(__dirname, '..') + '/';
const R = require(BASE + 'api/_wa-templates.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\nWhatsApp-template-registry');

/* De toestand zoals hij op 2026-09-01 echt op de WABA stond: alles in nl_BE,
   niets in het Frans. Precies de situatie waarin de oude lijst loog. */
const ECHT = {
  bron: 'meta',
  templates: {
    'helvaro_aanvraag_ontvangen::nl_BE': 'APPROVED',
    'helvaro_lead_alert::nl_BE': 'APPROVED',
    'helvaro_afspraak_bevestiging::nl_BE': 'APPROVED',
    'helvaro_afspraak_herinnering::nl_BE': 'APPROVED',
    'followup_24h::nl_BE': 'APPROVED',
  },
};

// ── 1. Land stelt voor, klant beslist ──────────────────────────────────────
console.log('\n  land -> taal');

ck('BE stelt nl_BE voor', R.taalVoorLand('BE') === 'nl_BE', R.taalVoorLand('BE'));
ck('GB stelt en_GB voor', R.taalVoorLand('GB') === 'en_GB', R.taalVoorLand('GB'));

/* _regio.js kent de locale 'fr-FR' voor datum en geld, maar Meta heeft GEEN
   fr_FR -- alleen fr, fr_BE, fr_CA, fr_CH, fr_CI, fr_MA. Klakkeloos overnemen
   gaf "WhatsApp ondersteunt fr_FR niet" voor elke Franse klant. */
ck('FR degradeert naar fr (Meta kent geen fr_FR)', R.taalVoorLand('FR') === 'fr', R.taalVoorLand('FR'));
ck('DE degradeert naar de (Meta kent geen de_DE)', R.taalVoorLand('DE') === 'de', R.taalVoorLand('DE'));
ck('NL degradeert naar nl (Meta kent geen nl_NL)', R.taalVoorLand('NL') === 'nl', R.taalVoorLand('NL'));
ck('elk land geeft een taal die Meta kent',
  require(BASE + 'api/_regio.js').landen().every((l) => R.metaKentTaal(R.taalVoorLand(l.code))),
  require(BASE + 'api/_regio.js').landen().filter((l) => !R.metaKentTaal(R.taalVoorLand(l.code))).map((l) => l.code));

/* De kern van de opdracht: het land is een SUGGESTIE. Een Brusselse makelaar
   die Frans kiest moet Frans krijgen, niet Nederlands omdat hij in België zit. */
ck('klantkeuze wint van het land',
  R.taalVanKlant({ Country: 'BE', Language: 'fr' }) === 'fr',
  R.taalVanKlant({ Country: 'BE', Language: 'fr' }));
ck('zonder keuze valt hij terug op het land',
  R.taalVanKlant({ Country: 'GB' }) === 'en_GB',
  R.taalVanKlant({ Country: 'GB' }));

// ── 2. Bestaande klanten breken niet ───────────────────────────────────────
console.log('\n  geen regressie voor bestaande klanten');

/* Een klant van vóór deze wijziging heeft geen Country en geen Language. */
const oud = R.bekijk(R.taalVanKlant({}), ECHT);
ck('klant zonder Country/Language blijft nl_BE', oud.taal === 'nl_BE', oud.taal);
ck('en staat gewoon op klaar', oud.klaar === true, oud);

/* En een klant met de kale code 'nl' terwijl de templates op 'nl_BE' staan.
   Dit is de scherpste: zonder taalmatching zou hij alles als ontbrekend zien. */
const kaal = R.bekijk('nl', ECHT);
ck("Language 'nl' vindt de nl_BE-templates", kaal.taal === 'nl_BE', kaal.taal);
ck("Language 'nl' is klaar", kaal.klaar === true, kaal.reden);
ck('en onthoudt wat er gevraagd was', kaal.gevraagd === 'nl', kaal.gevraagd);

// ── 3. Ontbrekend, onderweg, geweigerd, niet ondersteund ───────────────────
console.log('\n  de vier toestanden');

const fr = R.bekijk('fr', ECHT);
ck('fr is niet klaar', fr.klaar === false, fr);
ck('fr noemt de ontbrekende template bij naam',
  /helvaro_aanvraag_ontvangen/.test(fr.reden), fr.reden);
ck('fr wordt wel door Meta ondersteund', fr.ondersteund === true, fr);

const onzin = R.bekijk('xx', ECHT);
ck('een taal die Meta niet kent is "niet ondersteund"', onzin.ondersteund === false, onzin);
ck('en dat verschilt van "nog niet ingediend"', onzin.klaar === false && /ondersteunt/.test(onzin.reden), onzin.reden);

/* PENDING telt NIET als klaar. Een template die in review zit stuurt niets. */
const wacht = R.bekijk('fr', { bron: 'meta', templates: { 'helvaro_aanvraag_ontvangen::fr': 'PENDING' } });
ck('PENDING is "onderweg", niet klaar', wacht.klaar === false && wacht.onderweg.length === 1, wacht.onderweg.map((r) => r.toestand));

const weg = R.bekijk('fr', { bron: 'meta', templates: { 'helvaro_aanvraag_ontvangen::fr': 'REJECTED' } });
ck('REJECTED is "geweigerd"', weg.geweigerd.length === 1 && weg.klaar === false, weg.geweigerd.map((r) => r.toestand));

/* PAUSED is de gemene: ooit goedgekeurd, stuurt vandaag niets. */
const paused = R.bekijk('fr', { bron: 'meta', templates: { 'helvaro_aanvraag_ontvangen::fr': 'PAUSED' } });
ck('PAUSED telt niet als klaar', paused.klaar === false, paused);

// ── 4. Blokkerend versus degraderend ───────────────────────────────────────
console.log('\n  blokkerend versus degraderend');

/* Alleen de intro blokkeert. Zonder afspraakbevestiging werkt WhatsApp nog;
   zonder begroeting krijgt een nieuwe lead helemaal niets. */
const alleenIntro = R.bekijk('fr', { bron: 'meta', templates: { 'helvaro_aanvraag_ontvangen::fr': 'APPROVED' } });
ck('alleen de intro goedgekeurd is al "klaar"', alleenIntro.klaar === true, alleenIntro.reden);
ck('maar de rest staat wel als ontbrekend', alleenIntro.ontbreekt.length === 5, alleenIntro.ontbreekt.length);

const zonderIntro = R.bekijk('fr', { bron: 'meta', templates: { 'helvaro_afspraak_bevestiging::fr': 'APPROVED' } });
ck('zonder intro is het niet klaar', zonderIntro.klaar === false, zonderIntro.reden);

// ── 5. Eén set templates per taal, niet per klant ──────────────────────────
console.log('\n  geen dubbele templates');

const klanten = [
  { 'Client Name': 'Kine Gent', Country: 'BE', Language: 'nl' },
  { 'Client Name': 'Makelaar Brugge', Country: 'BE', Language: 'nl' },
  { 'Client Name': 'Tandarts Leuven', Country: 'BE', Language: 'nl' },
  { 'Client Name': 'Immo Liege', Country: 'BE', Language: 'fr' },
  { 'Client Name': 'Legacy BV' },
];

const rijen = R.taalOverzicht(klanten);
const nlRij = rijen.find((r) => r.taal === 'nl' && r.land === 'BE');
ck('drie Nederlandstalige Belgen zijn één rij', nlRij && nlRij.klanten === 3, nlRij);
ck('de Franstalige Belg staat apart', rijen.some((r) => r.taal === 'fr' && r.klanten === 1), rijen);
ck('een klant zonder land valt niet weg',
  rijen.some((r) => r.land === '—' && r.klanten === 1), rijen.map((r) => r.land));
ck('rijen zijn geen dubbels', rijen.length === new Set(rijen.map((r) => r.land + r.taal)).size, rijen.length);

// ── 6. De fail-soft belofte ────────────────────────────────────────────────
console.log('\n  fail-soft');

/* Zonder WABA_ID/token mag dit NOOIT een lege lijst geven -- dat zou betekenen
   "niets goedgekeurd" en dus alle WhatsApp voor alle klanten stilleggen. */
(async () => {
  const bewaardWaba = process.env.WABA_ID;
  const bewaardTok = process.env.WHATSAPP_MANAGEMENT_TOKEN;
  const bewaardTok2 = process.env.WHATSAPP_TOKEN;
  delete process.env.WABA_ID;
  delete process.env.WHATSAPP_MANAGEMENT_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
  R._leegCache();

  const index = await R.haalIndex();
  ck('zonder config valt hij terug op de snapshot', index.bron === 'snapshot', index.bron);
  ck('en de snapshot is niet leeg', Object.keys(index.templates).length > 0, Object.keys(index.templates).length);

  const staat = await R.klaarVoor('nl_BE');
  ck('nl_BE blijft klaar zonder netwerk', staat.klaar === true, staat.reden);

  if (bewaardWaba) process.env.WABA_ID = bewaardWaba;
  if (bewaardTok) process.env.WHATSAPP_MANAGEMENT_TOKEN = bewaardTok;
  if (bewaardTok2) process.env.WHATSAPP_TOKEN = bewaardTok2;
  R._leegCache();

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
