/*
 * Drie markten erbij: bouw, keuken en renovatie.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Helvaro had twee markten, en de code was daar ook naar: overal `is het
 * dealership, ja of nee`. Dat werkt bij twee. Bij vijf wordt elke zo'n plek een
 * vijfwegsprong en blijft er gegarandeerd eentje achter -- precies zo kwam er
 * eerder een stap in de onboarding zonder naam te staan.
 *
 * Het verschil dat deze drie maken is niet het WOORD maar de VORM: ze hebben
 * geen catalogus. Een makelaar heeft panden en een dealer heeft wagens; een
 * aannemer, keukenbouwer of renovatiebedrijf verkoopt een project dat per
 * opdracht wordt geoffreerd. Daar valt niets te herkennen uit een voorraad.
 *
 * Wat hier bewaakt wordt:
 *
 *  1. ONBEKEND BLIJFT VASTGOED. Elke bestaande klant heeft dit veld leeg. Zou
 *     leeg iets anders gaan betekenen, dan verliest elke makelaar op de dag van
 *     uitrol zijn pandcontext.
 *
 *  2. DE LIJSTEN LOPEN NIET UIT ELKAAR. De markten staan op vier plekken: de
 *     server (_vertical.js), de woordtabel, de wizardkaarten en de keuzelijst
 *     in Instellingen. Loopt daar eentje achter, dan kan iemand een markt
 *     kiezen die de rest niet kent.
 *
 *  3. GEEN CATALOGUS BETEKENT GEEN CATALOGUSSCHERM. Een leeg "Panden" bij een
 *     aannemer suggereert dat er iets in hoort.
 *
 *  4. FARO VRAAGT HET JUISTE. Het hele punt van deze niches is dat de aannemer
 *     weet of de rit de moeite waard is voor hij vertrekt.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const v       = require('../api/_vertical');
const prompts = require('../api/_ai/prompts');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}
const NIEUW = ['bouw', 'keuken', 'renovatie'];

console.log('\n  de drie markten bestaan, en onbekend blijft vastgoed');
{
  for (const m of NIEUW) ck("'" + m + "' is een bekende markt", v.BEKEND.indexOf(m) !== -1, v.BEKEND);
  ck('samen met de twee die er al waren',
    v.BEKEND.indexOf('vastgoed') !== -1 && v.BEKEND.indexOf('dealership') !== -1);

  /* De belangrijkste regel van het hele bestand. */
  ck('een leeg record leest als vastgoed', v.van({}) === 'vastgoed');
  ck('een onbekende niche ook',            v.van({ Niche: 'bloemenwinkel' }) === 'vastgoed');
  ck('en een onbekende vertical ook',      v.van({ Vertical: 'bloemen' }) === 'vastgoed');
  ck('null valt niet om',                  v.van(null) === 'vastgoed');
}

console.log('\n  een niche in vier talen komt op de juiste markt uit');
{
  const proef = [
    ['aannemer', 'bouw'], ['Bouwbedrijf', 'bouw'], ['construction', 'bouw'], ['Bauunternehmen', 'bouw'],
    ['keukenbouwer', 'keuken'], ['cuisiniste', 'keuken'], ['kitchen', 'keuken'], ['kuechenstudio', 'keuken'],
    ['renovatie', 'renovatie'], ['verbouwing', 'renovatie'], ['Sanierung', 'renovatie'], ['remodeling', 'renovatie'],
    ['garage', 'dealership'], ['concessionnaire', 'dealership'],
  ];
  for (const [niche, verwacht] of proef) {
    ck("niche '" + niche + "' -> " + verwacht, v.van({ Niche: niche }) === verwacht, v.van({ Niche: niche }));
  }
  /* Vertical is de fijnregeling en wint van de niche -- voor als een niche
     niet dekt wat iemand echt doet. */
  ck('Vertical wint van Niche', v.van({ Vertical: 'vastgoed', Niche: 'keuken' }) === 'vastgoed');
}

console.log('\n  geen catalogus is de vorm die deze drie delen');
{
  ck('vastgoed heeft er wel een',   v.heeftAanbod('vastgoed') === true);
  ck('dealership ook',              v.heeftAanbod('dealership') === true);
  for (const m of NIEUW) ck(m + ' niet', v.heeftAanbod(m) === false);
  /* Neemt ook een klantrecord aan, want beide vormen komen in deze codebase
     voor en het alternatief is dat elke aanroeper gaat raden. */
  ck('werkt ook met een klantrecord', v.heeftAanbod({ Niche: 'aannemer' }) === false);
  ck('en onbekend heeft er wel een',  v.heeftAanbod('onzin') === true);
}

console.log('\n  de afspraak heet wat ze is');
{
  const woord = (m, t) => v.afspraakWoord({ Vertical: m }, t);
  ck('bouw: plaatsbezoek',     woord('bouw', 'nl') === 'plaatsbezoek', woord('bouw', 'nl'));
  ck('keuken: opmeting',       woord('keuken', 'nl') === 'opmeting', woord('keuken', 'nl'));
  ck('renovatie: plaatsbezoek',woord('renovatie', 'nl') === 'plaatsbezoek');
  /* Een Waalse of Duitse klant hoort dit ook in zijn taal. */
  for (const m of NIEUW) {
    for (const t of ['nl', 'fr', 'en', 'de']) {
      const w = woord(m, t);
      ck(m + ' in ' + t + ' heeft een woord', !!w && w.length > 2, w);
    }
  }
  ck('een onbekende markt valt terug op bezichtiging',
    v.afspraakWoord({ Vertical: 'onzin' }, 'nl') === 'bezichtiging');
}

console.log('\n  de vier lijsten lopen niet uit elkaar');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');

  /* 1. De woordtabel in de client tegenover BEKEND op de server. */
  const tabel = dash.slice(dash.indexOf('var HV_WOORDEN'), dash.indexOf('function vw(sleutel)'));
  for (const m of v.BEKEND) ck('de woordtabel kent ' + m, new RegExp('\\b' + m + ':').test(tabel), null);

  /* 2. HV_MET_AANBOD is de spiegel van MET_AANBOD op de server. Dat bestand kan
        niet naar de client, dus de lijst staat twee keer -- en dan hoort iets
        te bewaken dat ze gelijk blijven. */
  const spiegel = /var HV_MET_AANBOD = \[([^\]]*)\]/.exec(dash);
  ck('HV_MET_AANBOD bestaat', !!spiegel);
  const clientLijst = spiegel ? spiegel[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) : [];
  ck('en is gelijk aan MET_AANBOD op de server',
    clientLijst.join(',') === v.MET_AANBOD.join(','), { client: clientLijst, server: v.MET_AANBOD });

  /* 3. De wizardkaarten en 4. de keuzelijst in Instellingen. Die twee moeten
        dezelfde sector-id's kennen, anders kan iemand in Instellingen iets
        kiezen dat de onboarding niet aanbiedt. */
  const kaarten = dash.slice(dash.indexOf('var WIZARD_MARKTEN = ['), dash.indexOf('function wizardOnthoudStap'));
  const ids = [...kaarten.matchAll(/\{ id: '([a-z_]+)'/g)].map((m) => m[1]);
  const opties = [...dash.matchAll(/<option value="([a-z_]+)">\$\{T\('set\.markt/g)].map((m) => m[1]);
  /* Vijf markten plus 'iets anders', die op vastgoed uitkomt. */
  ck('de wizard biedt zes keuzes aan', ids.length === 6, ids);
  ck('en Instellingen dezelfde', ids.slice().sort().join(',') === opties.slice().sort().join(','),
    { wizard: ids, instellingen: opties });

  /* Elke kaart moet naar een BESTAANDE vertical wijzen. Een tikfout hier zet
     iemands markt op niets. */
  const verticals = [...kaarten.matchAll(/vertical: '([a-z]+)'/g)].map((m) => m[1]);
  ck('elke kaart wijst naar een bekende markt',
    verticals.every((x) => v.BEKEND.indexOf(x) !== -1), verticals);
}

console.log('\n  wat Faro tegen deze klanten zegt');
{
  for (const m of NIEUW) {
    const s = prompts.projecten.sectie(m, null, v.afspraakWoord({ Vertical: m }, 'nl'));
    ck(m + ': er is een sectie', s.length > 400, s.length);
    /* Geen catalogus betekent: nooit naar een aanbod verwijzen. Dat is het ene
       ding dat een aannemer meteen ongeloofwaardig maakt. */
    ck(m + ': zegt dat er geen voorraad is', /GEEN voorraad of catalogus/.test(s));
    /* De drie die een dag bepalen. */
    ck(m + ': vraagt naar eigenaar of huurder', /EIGENAAR of HUURDER/.test(s));
    ck(m + ': en gebruikt het juiste afspraakwoord',
      s.indexOf(v.afspraakWoord({ Vertical: m }, 'nl')) !== -1);
    /* Een lead is geen formulier. */
    ck(m + ': remt het doorvragen af', /Hoogstens TWEE vragen per bericht/.test(s));
    /* Een verzonnen prijs staat later tegenover de zaakvoerder. */
    ck(m + ': verzint geen prijzen', /Noem nooit een prijs/.test(s));
    /* Splice-veiligheid: dit gaat door dezelfde template literal als de rest. */
    ck(m + ': is splice-veilig', s.indexOf('`') === -1 && !/\$\{/.test(s));
  }

  /* Wat al bekend is gaat mee, zodat Faro niet opnieuw vraagt wat de lead net
     verteld heeft. */
  const met = prompts.projecten.sectie('keuken', { soort: 'nieuwe keuken', plaats: 'Gent' }, 'opmeting');
  ck('wat al bekend is staat erin', /Werk: nieuwe keuken/.test(met) && /Plaats: Gent/.test(met));
  ck('met de opdracht er niet opnieuw naar te vragen', /Vraag hier NIET opnieuw naar/.test(met));
}

console.log('\n  het blok dat Faro terugschrijft');
{
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('PROJECT wordt geparseerd', /const projectMatch = cleaned\.match\(\/PROJECT:/.test(wa));
  /* Het vangnet: schrijft het model een blok zonder sluitende accolade, dan
     leest de KLANT die tekst letterlijk in zijn WhatsApp. Een interne
     markering die bij de klant belandt maakt het product onbetrouwbaar. */
  ck('en een half blok wordt alsnog weggeknipt',
    /cleaned\.indexOf\('PROJECT:'\) !== -1[\s\S]{0,300}replace\(\/PROJECT:\[\^\\n\]\*\/g/.test(wa));
  ck('de fiche wordt bewaard', /_project\.naarNotities\(basisP/.test(wa));
  /* Alleen bij markten zonder catalogus -- "het kan toch niet gebeuren" is
     geen bescherming. */
  ck('alleen bij markten zonder catalogus',
    /if \(!_vertical\.heeftAanbod\(vertical\) && aiResponse\.projectFiche\)/.test(wa));
  ck('en de promptsectie wordt gevuld', /_ai\.prompts\.projecten\.sectie\(/.test(wa));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
