/*
 * Faro's weekrapport.
 *
 * ── Wat hier bewaakt wordt ──────────────────────────────────────────────────
 * Een rapport is precies het soort scherm waar getallen ongemerkt losraken van
 * de werkelijkheid. Niemand controleert een weekoverzicht na; je leest het en
 * je gelooft het. Drie eigenschappen houden het eerlijk:
 *
 * 1. GEEN OPVOLGINGSTELLING. De opdracht vroeg om "Follow-ups sent: 34". Dat
 *    getal bestaat niet -- cron-followup.js zet alleen Conversation State, en
 *    datzelfde veld verandert ook wanneer de LEAD antwoordt. Zelfde reden geen
 *    "human interventions": hoe vaak een mens overnam wordt nergens geteld.
 *
 * 2. GEEN VERGELIJKING ZONDER BASIS. "+100%" vanaf nul is een verzonnen sprong.
 *    Was er vorige week niets, dan wordt er niet vergeleken.
 *
 * 3. GEEN PATROON UIT DRIE LEADS. "Je conversie daalde 50%" over twee leads is
 *    ruis, en één zo'n zin maakt de rest van het rapport ook verdacht.
 */
'use strict';

const BASE = require('path').join(__dirname, '..') + '/';
const rapport = require(BASE + 'api/_faro/rapport.js');
const i18n = require(BASE + 'api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

const DAG = 24 * 3600 * 1000;
const NU = new Date('2026-09-08T12:00:00Z');
const dagenGeleden = (n) => new Date(NU.getTime() - n * DAG).toISOString();
const lead = (over) => Object.assign({
  id: 'r' + Math.random().toString(36).slice(2, 7), naam: 'X', datum: dagenGeleden(2),
  qualified: false, afspraakGeboekt: false, boekingslinkVerstuurd: false, aiPaused: false,
}, over);

console.log('\nFaro — weekrapport');

// ── 1. Niets verzinnen ─────────────────────────────────────────────────────
console.log('\n  niets verzinnen');
const r = rapport.week([
  lead({ naam: 'Jan', qualified: true, afspraakGeboekt: true }),
  lead({ naam: 'Marie', qualified: true }),
  lead({ naam: 'Piet' }),
], { tot: NU });

ck('geen opvolgingstelling, want die ligt nergens vast',
  !('opvolgingen' in r.cijfers) && !('followUps' in r.cijfers), Object.keys(r.cijfers));
ck('geen telling van menselijke overnames, om dezelfde reden',
  !('interventies' in r.cijfers) && !('humanInterventions' in r.cijfers), Object.keys(r.cijfers));
ck('de cijfers die er WEL zijn kloppen',
  r.cijfers.leads === 3 && r.cijfers.gekwalificeerd === 2 && r.cijfers.geboekt === 1, r.cijfers);

// ── 2. Alleen vergelijken als er iets was ──────────────────────────────────
console.log('\n  niet vergelijken met niets');
ck('zonder vorige week: geen vergelijking, geen percentage',
  r.vergelijkbaar === false && r.verschil === null, { v: r.vergelijkbaar, d: r.verschil });

const metVorige = rapport.week([
  lead({ datum: dagenGeleden(2), qualified: true, afspraakGeboekt: true }),
  lead({ datum: dagenGeleden(3) }),
  lead({ datum: dagenGeleden(9) }),
  lead({ datum: dagenGeleden(10) }),
], { tot: NU });
ck('met vorige week: wel een vergelijking',
  metVorige.vergelijkbaar === true && metVorige.verschil !== null, metVorige.verschil);
ck('en die vergelijking klopt', metVorige.verschil.leads === 0, metVorige.verschil);

/* De grens van het venster is een echte bron van fouten. Wat ertoe doet is niet
   WELKE kant hij op valt, maar dat hij in precies EEN venster valt: een lead die
   in geen van beide weken meetelt verdwijnt uit het rapport, en een lead die in
   allebei meetelt maakt de vergelijking onzin.

   De vensters zijn [van, tot) en [vorigeVan, van), dus de grens hoort bij deze
   week. Geen gat, geen overlap. */
{
  const opGrens = lead({ datum: dagenGeleden(7) });
  const grens = rapport.week([opGrens], { tot: NU });
  const grensVorige = rapport.week([opGrens], { tot: new Date(NU.getTime() - 7 * DAG) });
  ck('een lead op de grens telt in precies EEN van beide weken',
    (grens.cijfers.leads === 1) !== (grensVorige.cijfers.leads === 1),
    { deze: grens.cijfers.leads, vorige: grensVorige.cijfers.leads });
  ck('en dat is de nieuwste week (venster is [van, tot))',
    grens.cijfers.leads === 1, grens.cijfers);
}

// ── 3. Aandacht veroudert niet ─────────────────────────────────────────────
console.log('\n  wie wacht, blijft wachten');
const oudVast = rapport.week([
  lead({ naam: 'Thomas', datum: dagenGeleden(20), aiPaused: true, samenvatting: 'Vroeg naar erfpacht' }),
], { tot: NU });
ck('een lead die 20 dagen geleden vastliep staat er nog steeds bij',
  oudVast.wachtOpJou.length === 1 && oudVast.wachtOpJou[0].naam === 'Thomas', oudVast.wachtOpJou);
ck('maar telt niet mee in de weekcijfers', oudVast.cijfers.leads === 0, oudVast.cijfers);
ck('en het rapport is dus niet "stil"', oudVast.stil === false, null);

ck('een echt lege week meldt zichzelf als stil',
  rapport.week([], { tot: NU }).stil === true, null);
ck('een lege lijst loopt niet stuk',
  rapport.week(null, { tot: NU }).cijfers.leads === 0, null);

// ── 4. Hoogstens één aanbeveling, en alleen met grond ──────────────────────
console.log('\n  hoogstens één advies, en alleen met grond');

ck('wie wacht op een mens gaat voor alles',
  rapport.aanbeveling(oudVast).sleutel === 'faro.rap.adv.wacht', rapport.aanbeveling(oudVast));

const geenAfspraak = rapport.week([
  lead({ naam: 'A', qualified: true }), lead({ naam: 'B', qualified: true }),
], { tot: NU });
ck('anders: gekwalificeerd zonder afspraak',
  rapport.aanbeveling(geenAfspraak).sleutel === 'faro.rap.adv.geenAfspraak', null);
ck('en het advies draagt het getal dat het rechtvaardigt',
  rapport.aanbeveling(geenAfspraak).aantal === 2, rapport.aanbeveling(geenAfspraak));

ck('geen advies als er niets aan de hand is',
  rapport.aanbeveling(rapport.week([lead({ qualified: true, afspraakGeboekt: true })], { tot: NU })) === null, null);
ck('en geen advies uit niets', rapport.aanbeveling(null) === null, null);

/* Een patroonuitspraak pas boven de drempel. Twee leads zijn geen trend. */
const dun = rapport.week([
  lead({ datum: dagenGeleden(2), afspraakGeboekt: true, qualified: true }),
  lead({ datum: dagenGeleden(9) }),
], { tot: NU });
ck('te weinig leads voor een patroonuitspraak', dun.genoegData === false, dun.cijfers);
ck(`de drempel staat op ${rapport.MIN_LEADS_VOOR_PATROON} leads`,
  rapport.MIN_LEADS_VOOR_PATROON >= 5, rapport.MIN_LEADS_VOOR_PATROON);

// ── 5. Vier talen ──────────────────────────────────────────────────────────
console.log('\n  het rapport spreekt vier talen');
const sleutels = ['faro.rap.adv.wacht', 'faro.rap.adv.geenAfspraak', 'faro.rap.adv.beter'];
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const mist = sleutels.filter((k) => { const v = i18n.t(taal, k); return !v || v === k; });
  ck(`${taal}: alle adviesteksten bestaan`, mist.length === 0, mist);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
