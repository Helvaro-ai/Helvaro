'use strict';
/*
 * Het abonnement van een klant -- lezen en bijwerken.
 *
 * -- Waarom dit bestaat --------------------------------------------------------
 * Een makelaar kon zich aanmelden en veertien dagen proberen, en daarna hield
 * het op: betalend worden ging alleen doordat iemand met de hand een plan en
 * een creditlimiet in Airtable zette. Dat werkt bij drie klanten en breekt bij
 * dertig, en het breekt het hardst op het slechtste moment -- de klant is
 * enthousiast, wil betalen, en moet wachten tot er iemand wakker is.
 *
 * Vanaf hier zet de Stripe-webhook dit zelf. Er komt geen mens meer aan te pas.
 *
 * -- De driehoek ---------------------------------------------------------------
 * Drie systemen, elk met één taak, en één sleutel die ze verbindt:
 *
 *   Clerk     WIE ben je            -> een gebruiker, met een e-mailadres
 *   Airtable  WAT mag je            -> de klantrij, met de projectcode
 *   Stripe    BETAAL je             -> een klant en een abonnement
 *
 * De projectcode is de sleutel. Clerk kent hem via de gebruiker (api/_clerk.js
 * zet hem bij de eerste aanmelding), Stripe kent hem via de metadata op de
 * betaalsessie. Ze praten NIET rechtstreeks met elkaar, en dat is met opzet:
 * koppel je Clerk aan Stripe, dan hangt je facturatie aan je inlogprovider en
 * kun je geen van beide nog vervangen zonder de andere.
 *
 * -- Geen route ----------------------------------------------------------------
 * Onderstreepje voorop.
 */

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const _plans = require('./_plans');

/* Veldnamen, geen ids -- twee ervan zijn net aangemaakt en hun ids staan nergens
   vast. Op één plek, zodat hernoemen één wijziging is. */
const F = Object.freeze({
  projectCode:    'Project Code',
  planId:         'Plan ID',
  planStatus:     'Plan Status',
  allowance:      'Credit Allowance',
  klantId:        'Stripe Customer ID',
  abonnementId:   'Stripe Subscription ID',
  email:          'Email',
  naam:           'Client Name',
});

/* De statussen die het bestaande Plan Status-veld kent. Niet uitbreiden zonder
   de keuzes in Airtable erbij te zetten: Airtable weigert een HELE update zodra
   er één onbekende keuze in zit, en dan mislukt alles in dezelfde PATCH. Zo
   telde het creditplafond ooit maandenlang niets. */
const STATUS = Object.freeze({
  PROEF:      'trial',
  ACTIEF:     'active',
  VERLOPEN:   'expired',
  OPGEZEGD:   'cancelled',
  GEPAUZEERD: 'paused',
});

function envConfigured() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

async function klantRij(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('projectCode is verplicht');
  if (!envConfigured()) throw new Error('API_AIRTABLE/BASE_AIRTABLE niet geconfigureerd');
  const formule = encodeURIComponent(`{${F.projectCode}}="${code.replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${CLIENTS_TABLE}`
            + `?filterByFormula=${formule}&maxRecords=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
  if (!r.ok) throw new Error(`Airtable GET ${r.status}`);
  const d = await r.json();
  return (d.records && d.records[0]) || null;
}

async function patch(projectCode, velden) {
  const rij = await klantRij(projectCode);
  if (!rij) throw new Error(`Geen klant gevonden met Project Code "${projectCode}"`);
  const r = await fetch(
    `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${CLIENTS_TABLE}/${rij.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: velden }),
    });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

/**
 * Wat weten we over het abonnement van deze klant?
 * Geeft altijd een bruikbaar antwoord; bij een storing null.
 */
async function lees(projectCode) {
  let rij;
  try { rij = await klantRij(projectCode); } catch (e) {
    console.warn('[abonnement] kon klantrij niet lezen:', e && e.message);
    return null;
  }
  if (!rij) return null;
  const f = rij.fields || {};
  const planId = String(f[F.planId] || '').trim().toLowerCase();
  const plan = _plans.plan(planId);
  return {
    projectCode:   String(f[F.projectCode] || ''),
    naam:          String(f[F.naam] || ''),
    email:         String(f[F.email] || ''),
    planId:        planId || null,
    plan,
    status:        String(f[F.planStatus] || '').trim() || null,
    allowance:     Number(f[F.allowance]) || 0,
    klantId:       String(f[F.klantId] || '').trim() || null,
    abonnementId:  String(f[F.abonnementId] || '').trim() || null,
    /* Betalend? Alleen als er een lopend abonnement IS. Op de status alleen
       afgaan is niet genoeg: die kan op 'active' blijven staan nadat een
       betaling geweigerd is. */
    betalend: !!String(f[F.abonnementId] || '').trim() && String(f[F.planStatus] || '') === STATUS.ACTIEF,
  };
}

/**
 * Een geslaagd abonnement vastleggen.
 *
 * Zet het plan, de status, de creditlimiet die bij dat plan hoort, en de twee
 * Stripe-ids. De creditlimiet komt uit de plantabel -- nooit uit de webhook,
 * want dan bepaalt wat er in Stripe getypt is hoeveel iemand mag verbruiken.
 */
async function activeer({ projectCode, planId, klantId, abonnementId } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('activeren zonder projectcode');
  const plan = _plans.plan(planId);
  if (!plan) throw new Error(`onbekend plan "${planId}"`);

  const velden = {};
  velden[F.planId]     = plan.id;
  velden[F.planStatus] = STATUS.ACTIEF;
  velden[F.allowance]  = plan.credits;
  if (klantId)      velden[F.klantId] = String(klantId);
  if (abonnementId) velden[F.abonnementId] = String(abonnementId);

  await patch(code, velden);
  console.log(`[abonnement] ${code} staat op ${plan.naam} (${plan.credits} credits).`);
  return { planId: plan.id, credits: plan.credits };
}

/**
 * Het abonnement is gestopt. De klant houdt zijn account en zijn data -- alleen
 * de limiet gaat terug naar nul, wat betekent "creditsysteem inert" en niet
 * "alles op slot": zie api/_credits.js, een leadgesprek wordt nooit geblokkeerd.
 * Een makelaar die opzegt en drie maanden later terugkomt vindt zijn leads terug.
 */
async function stop({ projectCode, reden } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('stoppen zonder projectcode');
  const velden = {};
  velden[F.planStatus]   = STATUS.OPGEZEGD;
  velden[F.abonnementId] = '';
  await patch(code, velden);
  console.log(`[abonnement] ${code} gestopt (${reden || 'reden onbekend'}). Data blijft staan.`);
}

/** De Stripe-klant onthouden, ook als er (nog) geen abonnement is. */
async function onthoudKlant({ projectCode, klantId } = {}) {
  const code = String(projectCode || '').trim();
  if (!code || !klantId) return;
  const velden = {};
  velden[F.klantId] = String(klantId);
  await patch(code, velden);
}

module.exports = { F, STATUS, lees, activeer, stop, onthoudKlant, klantRij, CLIENTS_TABLE };
