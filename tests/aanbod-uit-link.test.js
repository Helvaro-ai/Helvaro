'use strict';
/*
 * Een link plakken in Faro moet het aanbod invullen -- voor ALLE markten die
 * een catalogus hebben, niet alleen voor autodealers.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * add_listing las de advertentiepagina alleen uit als de klant een dealer was:
 *
 *     if (link && dealer) { ...uitlezen... }
 *     else if (link)      { velden.link = link; }
 *
 * Een makelaar die een Immoweb-link plakte kreeg dus niets. De link werd als
 * los veld bewaard, `naam` (= het adres) bleef leeg, en Faro antwoordde:
 *
 *     "Ik weet nog niet welk pand het is. Geef een link naar het zoekertje,
 *      of het adres."
 *
 * op een bericht dat een link naar het zoekertje WAS. De omschrijving van het
 * gereedschap belooft die link met zoveel woorden ("AutoScout24, Immoweb, ...")
 * en zegt: "bij een link hoef je verder niets in te vullen".
 *
 * api/_properties.js had importeerUitLink al -- de importknop op het
 * Panden-scherm gebruikte hem. Alleen Faro kwam er niet bij.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * De bestaande tests dekten de dealerkant. Een test die alleen de kant toetst
 * die werkt, bewaakt niets: dit toetst juist de kant die stuk was, plus de
 * twee randen eromheen (dealer blijft werken, catalogusloze markten raken de
 * pagina niet aan).
 *
 * Alleen de buitenranden zijn vervangen -- de pagina ophalen en het model. De
 * beslissing die stuk was, draait hier als echte code.
 */
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

/* Het model. Geeft terug wat een echte pagina zou opleveren; welke velden dat
   zijn hangt af van wat er gevraagd wordt, dus beide vormen staan klaar. */
const _ai = require(path.join(BASE, 'api/_ai'));
let MODEL_ANTWOORD = {};
_ai.generateText = async () => ({ model: 'test', data: MODEL_ANTWOORD });

/* De pagina. Genoeg tekst om de leesbaarheidsdrempel (120 tekens) te halen --
   daaronder weigert de importer terecht, en dat is een ander pad. */
let PAGINA_OK = true;
global.fetch = async () => {
  if (!PAGINA_OK) throw new Error('netwerk plat');
  return {
    ok: true, status: 200,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    url: 'https://www.immoweb.be/nl/zoekertje/woning/te-koop/gent/9000/12345678',
    text: async () => '<html><body>'
      + '<p>Te koop: charmante rijwoning te Gent, 395.000 euro, 3 slaapkamers, 148 m2, EPC C.</p>'.repeat(12)
      + '</body></html>',
  };
};

const tools = require(path.join(BASE, 'api/_faro/tools.js'));
const add = tools.ALL.find((t) => t.name === 'add_listing');

const PAND = {
  adres: 'Lange Violettestraat 12', plaats: 'Gent', postcode: '9000', type: 'woning',
  transactie: 'koop', prijs: 395000, slaapkamers: 3, badkamers: 1, oppervlakte: 148,
  epc: 'C', bouwjaar: 1968, omschrijving: 'Charmante rijwoning.', confidence: 0.86,
};
const AUTO = {
  merk: 'BMW', model: 'M4', uitvoering: 'Competition xDrive', prijs: 74999,
  km: 18000, inschrijving: '05/2023', brandstof: 'benzine', confidence: 0.9,
};
const LINK = 'https://www.immoweb.be/nl/zoekertje/woning/te-koop/gent/9000/12345678';

const draai = (vertical) => add.run({ link: LINK }, { projectCode: 'TEST', userId: 'test', vertical });

(async () => {
  console.log('\n  een makelaar plakt een pandlink');
  {
    MODEL_ANTWOORD = PAND; PAGINA_OK = true;
    const uit = await draai('vastgoed');
    /* DIT is de regressie. Met de oude code was pending false en zei de
       samenvatting "Geef een link naar het zoekertje" -- op een link. */
    ck('de kaart wacht op bevestiging', uit.data && uit.data.pending === true, uit.summary);
    ck('en draagt het adres uit de advertentie',
      /Lange Violettestraat 12/.test(uit.summary), uit.summary);
    const kaart = (uit.components || [])[0];
    ck('er is een bevestigingskaart', !!kaart);
    const body = kaart ? (kaart.body || (kaart.data && kaart.data.body) || '') : '';
    /* Wat uitgelezen is, moet op de kaart staan -- anders kan de makelaar niet
       zien of de import klopte voordat hij ja zegt. */
    ck('met de prijs erop',       /395\.000/.test(body), body);
    ck('met de gemeente erop',    /Gent/.test(body), body);
    ck('met de slaapkamers erop', /Slaapkamers: 3/.test(body), body);
    ck('met de oppervlakte erop', /148/.test(body), body);
  }

  console.log('\n  een dealer plakt een autolink (dit werkte al, en moet blijven werken)');
  {
    MODEL_ANTWOORD = AUTO; PAGINA_OK = true;
    const uit = await draai('dealership');
    ck('de kaart wacht op bevestiging', uit.data && uit.data.pending === true, uit.summary);
    ck('en draagt merk en model', /BMW M4/.test(uit.summary), uit.summary);
  }

  console.log('\n  bouw, keuken en renovatie hebben geen catalogus');
  {
    MODEL_ANTWOORD = PAND;
    for (const v of ['bouw', 'keuken', 'renovatie']) {
      /* De pagina mag hier niet eens opgehaald worden: er is niets om het in te
         zetten, en een mislukte netwerkoproep zou alleen tijd en credits kosten.
         PAGINA_OK=false maakt elke ophaalpoging zichtbaar als een crash. */
      PAGINA_OK = false;
      const uit = await draai(v);
      ck(v + ': raakt de pagina niet aan en belooft niets',
        uit.data && uit.data.pending === false, uit.summary);
    }
  }

  console.log('\n  een onleesbare pagina is geen foutmelding');
  {
    /* De pagina uitlezen mislukt. Dat mag de beurt niet laten crashen: wat de
       klant zelf meegaf hoort nog steeds op een kaart te komen. */
    MODEL_ANTWOORD = PAND; PAGINA_OK = false;
    const uit = await add.run(
      { link: LINK, adres: 'Zelf ingetypt 1', prijs: 250000 },
      { projectCode: 'TEST', userId: 'test', vertical: 'vastgoed' });
    ck('de eigen invoer blijft staan', uit.data && uit.data.pending === true, uit.summary);
    ck('en het adres is dat van de klant', /Zelf ingetypt 1/.test(uit.summary), uit.summary);
  }

  console.log('\n  wat de klant zegt wint van wat de pagina zegt');
  {
    MODEL_ANTWOORD = PAND; PAGINA_OK = true;
    const uit = await add.run(
      { link: LINK, prijs: 379000 },
      { projectCode: 'TEST', userId: 'test', vertical: 'vastgoed' });
    const kaart = (uit.components || [])[0];
    const body = kaart ? (kaart.body || (kaart.data && kaart.data.body) || '') : '';
    ck('de prijs van de klant staat op de kaart', /379\.000/.test(body), body);
    ck('en die van de pagina niet',            !/395\.000/.test(body), body);
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
