'use strict';
/*
 * De betaalpagina van Stripe in de taal van de klant.
 *
 * ── Wat er mis was ──────────────────────────────────────────────────────────
 * api/_stripe.js zette de productomschrijving op plan.omschrijving, en dat veld
 * staat in api/_plans.js -- in het Nederlands, want dat bestand is nooit
 * vertaald. Een Waalse makelaar die op "Choisir Growth" klikte belandde dus op
 * een betaalpagina met een Nederlandse omschrijving, en kreeg die daarna ook op
 * zijn factuur.
 *
 * Dat is de duurste plek waar dit kon staan: het laatste scherm vóór de
 * betaling. Wie daar twijfelt, betaalt niet.
 *
 * ── Waarom een test en geen blik in de browser ─────────────────────────────
 * Deze pagina is van Stripe. Je kunt hem alleen zien door echt een checkout te
 * starten met een echte sleutel, en dan nog maakt niemand daar per ongeluk vier
 * talen van. Dit is precies het soort pad dat je met een test bewaakt of
 * helemaal niet.
 */
const path = require('path');
const fs   = require('fs');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const stripe = fs.readFileSync(path.join(BASE, 'api/_stripe.js'), 'utf8');
const leads  = fs.readFileSync(path.join(BASE, 'api/leads.js'), 'utf8');
const i18n   = require(path.join(BASE, 'api/_i18n.js'));
const plans  = require(path.join(BASE, 'api/_plans.js'));

console.log('\n  de omschrijving komt uit de vertaaltabel');
{
  ck('createSubscription neemt een omschrijving aan',
    /async function createSubscription\(\{[^}]*omschrijving/.test(stripe), null);
  ck('en gebruikt die boven plan.omschrijving',
    /description: omschrijving \|\| plan\.omschrijving/.test(stripe), null);
  /* De volgorde is de hele fix. Draait iemand hem om, dan wint het Nederlandse
     veld weer -- precies de fout die op het lead-formulier en in Faro ook al
     stond: `serverzin || vertaling` leest als een terugval en is het tegendeel. */
  ck('en niet andersom', !/description: plan\.omschrijving \|\| omschrijving/.test(stripe), null);
  ck('de aanroeper stuurt hem mee',
    /omschrijving: _i18nBetaal\.t\(taalBetaal, 'fa\.plan\.' \+ plan\.id\)/.test(leads), null);
}

console.log('\n  elk plan heeft die zin in vier talen');
{
  const ids = (plans.PLANNEN || plans.plannen || []).map((p) => p.id);
  ck('de plannen zijn gevonden', ids.length >= 3, ids);
  for (const id of ids) {
    const sleutel = 'fa.plan.' + id;
    const per = ['nl', 'fr', 'en', 'de'].map((l) => i18n.t(l, sleutel));
    ck(sleutel + ' bestaat in vier talen', per.every((w) => w && w !== sleutel), per.map((w) => w.slice(0, 24)));
    ck(sleutel + ' is echt vertaald', new Set(per).size === 4, per.map((w) => w.slice(0, 24)));
  }
}

console.log('\n  en de pagina zelf staat in die taal');
{
  /* Stripe vertaalt zijn EIGEN labels als je hem de taal geeft. Laat je het
     weg, dan raadt hij op basis van de browser -- vaak goed, en los van wat de
     klant in Helvaro heeft ingesteld. */
  ck('de locale gaat mee naar Stripe', /body\.locale = locale/.test(stripe), null);
  ck('en alleen de vier die we ondersteunen',
    /\['nl', 'fr', 'en', 'de'\]\.indexOf\(locale\)/.test(stripe), null);
  ck('de aanroeper stuurt de taal van het verzoek',
    /locale: taalBetaal/.test(leads) && /_i18nBetaal\.resolveer\(req\)/.test(leads), null);
}

console.log('\n  het Nederlandse veld blijft als terugval bestaan');
{
  /* Niet weghalen uit api/_plans.js. Een aanroeper die de omschrijving vergeet
     mee te sturen hoort een zin te krijgen en geen lege regel op de
     betaalpagina. */
  ck('_plans.js heeft nog een omschrijving per plan',
    (plans.PLANNEN || plans.plannen || []).every((p) => typeof p.omschrijving === 'string' && p.omschrijving.length > 10));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
