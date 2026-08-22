'use strict';
/*
 * De plannen -- één tabel, en de enige plek waar een prijs of een aantal
 * credits staat.
 *
 * -- Waarom dit bestaat --------------------------------------------------------
 * De getallen stonden verspreid: 2.000 als standaard bij onboarding, een ander
 * aantal in de proefperiode, een tarief voor bijkopen dat uit een terzijde in
 * een commentaarregel was afgeleid, en een prijspagina op de website die weer
 * iets anders zei. Dat is niet "een beetje uit de pas": het bijkopen van
 * credits kwam er twintig keer te duur uit, en niemand kon dat zien omdat er
 * geen plek was waar de twee getallen naast elkaar stonden.
 *
 * Vanaf hier komt elk bedrag hiervandaan. Verandert de prijspagina, dan
 * verandert dit bestand -- en de rest volgt.
 *
 * -- Geen route ----------------------------------------------------------------
 * Onderstreepje voorop, zoals api/_credits.js en api/_ledger.js.
 *
 * -- De bron ------------------------------------------------------------------
 * helvaro.pro/#prijzen, augustus 2026. Staat er iets anders op de site dan
 * hier, dan is de SITE de waarheid en is dit bestand achterop geraakt.
 */

/* Wat één leadgesprek kost aan credits. Dit is de ankerwaarde van het hele
   systeem: alle plannen zijn hier veelvouden van, en een klant denkt in
   gesprekken, niet in credits. Staat ook in api/_credits.js als het gewicht
   van whatsapp_conversation; die twee horen gelijk te zijn. */
const CREDITS_PER_GESPREK = 20;

/* Wat een leadgesprek ONS kost. Uit CREDIT-SYSTEM-DESIGN.md §1, met cijfers
   van juli 2026: ~EUR 0,23 voor een lead die antwoordt, ~EUR 0,29 voor een
   die zwijgt, gemengd ~EUR 0,26. Afgerond naar boven, want de kant om je op
   te vergissen als het je eigen marge is. */
const KOSTPRIJS_PER_GESPREK_EUR = 0.30;

const PLANNEN = Object.freeze([
  Object.freeze({
    id: 'starter',
    naam: 'Starter',
    prijsEur: 249.99,
    credits: 3000,
    onbeperkt: false,
    /* "±150 lead conversations" op de site. 3.000 / 20 = 150 -- klopt, en dat
       is geen toeval: dat is precies waarom het gewicht 20 is. */
    beeldgeneratie: false,
    omschrijving: 'Reactie binnen 30 sec, automatische kwalificatie, afspraken in je agenda.',
  }),
  Object.freeze({
    id: 'growth',
    naam: 'Growth',
    prijsEur: 499,
    credits: 10000,
    onbeperkt: false,
    beeldgeneratie: true,
    omschrijving: 'Alles uit Starter, plus de visualisatie-agent en drie agenten op je sector.',
  }),
  Object.freeze({
    id: 'scale',
    naam: 'Scale',
    prijsEur: 799,
    /* "Onbeperkt · fair use" op de site. Onbeperkt ZONDER getal is waar een
       SaaS geld verliest, dus staat het getal hier wel -- niet als limiet die
       iemand afknijpt (zie api/_credits.js: een leadgesprek wordt nooit
       geblokkeerd), maar als de grens waarboven je het gesprek aangaat.
       20.000 credits = 1.000 gesprekken = ~EUR 300 kostprijs bij EUR 799,
       dus nog altijd ~62% marge. Aanbeveling uit CREDIT-SYSTEM-DESIGN.md §3. */
    credits: 20000,
    onbeperkt: true,
    beeldgeneratie: true,
    omschrijving: 'Alles uit Growth, onbeperkt binnen fair use, eigen kwalificatievragen.',
  }),
]);

const OP_ID = Object.freeze(PLANNEN.reduce((acc, p) => { acc[p.id] = p; return acc; }, {}));

/* Het plan waarop een nieuwe klant start. Ook het plan waarvan het tarief voor
   bijkopen wordt afgeleid -- zie perCredit() hieronder. */
const STANDAARD_PLAN = 'starter';

function plan(id) {
  return OP_ID[String(id || '').trim().toLowerCase()] || null;
}

/**
 * Wat een klant per credit betaalt binnen een plan.
 *
 * Dit is het getal dat het tarief voor bijkopen hoort te zijn. Ligt bijkopen
 * eronder, dan is het goedkoper om een klein plan te nemen en eeuwig bij te
 * kopen; ligt het erboven, dan straf je iemand die meer afneemt dan hij dacht.
 * Allebei zijn ze een fout, en allebei zijn ze eerder gemaakt.
 */
function perCredit(id) {
  const p = plan(id || STANDAARD_PLAN);
  if (!p || !p.credits) return 0;
  return p.prijsEur / p.credits;
}

/** Aantal leadgesprekken dat een aantal credits waard is. */
function gesprekken(credits) {
  const n = Number(credits) || 0;
  return Math.floor(n / CREDITS_PER_GESPREK);
}

/** Onze kostprijs voor een aantal credits, in euro. */
function kostprijsEur(credits) {
  const n = Number(credits) || 0;
  return (n / CREDITS_PER_GESPREK) * KOSTPRIJS_PER_GESPREK_EUR;
}

/**
 * Brutomarge op een bedrag voor een aantal credits, als fractie (0,82 = 82%).
 * Geeft null bij een bedrag van nul, want een marge op niets bestaat niet.
 */
function marge(bedragEur, credits) {
  const b = Number(bedragEur) || 0;
  if (b <= 0) return null;
  return (b - kostprijsEur(credits)) / b;
}

/* Wat het dashboard en de prijspagina tonen. Bewust een aparte vorm: de UI
   hoort niet zelf te rekenen, en een frontend die prijzen uitrekent is een
   frontend waarin een klant zijn eigen prijs kan aanpassen. */
function publiek() {
  return PLANNEN.map((p) => ({
    id: p.id,
    naam: p.naam,
    prijsEur: p.prijsEur,
    credits: p.credits,
    onbeperkt: p.onbeperkt,
    beeldgeneratie: p.beeldgeneratie,
    gesprekken: gesprekken(p.credits),
    perCredit: Math.round(perCredit(p.id) * 10000) / 10000,
    omschrijving: p.omschrijving,
  }));
}

module.exports = {
  PLANNEN, STANDAARD_PLAN, CREDITS_PER_GESPREK, KOSTPRIJS_PER_GESPREK_EUR,
  plan, perCredit, gesprekken, kostprijsEur, marge, publiek,
};
