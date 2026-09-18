'use strict';
/*
 * Verbruik en kosten per AI-aanroep.
 *
 * -- Wat hier NIET gebeurt -----------------------------------------------------
 * Credits afschrijven. Dat doet api/_credits.js, en dat blijft zo: daar zit de
 * serialisatie per tenant, de begrensde fail-open en de reconciliatie. Twee
 * systemen die allebei denken de boekhouding te doen is hoe getallen uit
 * elkaar gaan lopen.
 *
 * Dit hier is de ANDERE helft: wat kostte die aanroep JOU, bij welke provider,
 * op welk model, voor welke taak, hoe lang duurde het en is hij gelukt. Credits
 * zijn wat de klant betaalt; dit is wat jij betaalt. Zonder dat verschil weet
 * je wel je omzet maar niet je marge.
 *
 * -- Waarom in het geheugen en niet in Airtable -------------------------------
 * Een regel per AI-aanroep in Airtable is bij WhatsApp-volume duur en traag, en
 * Airtable heeft geen atomaire optelling (zie de racefout die in _credits.js
 * beschreven staat). Dit houdt daarom een OPTELLING per tenant bij, in het
 * geheugen van de instantie, plus een logregel per aanroep zodat de gegevens
 * ook in de Vercel-logs staan als de instantie koud start.
 *
 * Wil je later echte historie: dit is de enige plek die dan verandert.
 */

const registry = require('./registry');

/* tenant -> { requests, inputTokens, outputTokens, costUsd, byTask, byModel,
               failures, escalations, latencyTotal } */
const _tellers = new Map();

/* Een dak op het aantal tenants dat we in het geheugen bijhouden, zodat dit
   geen lek wordt op een instantie die lang leeft. Bij overschrijding wordt de
   oudste weggegooid -- de logregels blijven, alleen de optelling begint opnieuw. */
const MAX_TENANTS = 500;

/*
 * Idempotency by `reference` (brief §22-23/38): een tweede record() met
 * dezelfde reference telt niet nog een keer mee. Dit bestaat voor precies
 * ÉÉN scenario, gedocumenteerd waar het speelt (api/_faro/media.js
 * creditsVoorVideo): dezelfde video-job die door twee instanties tegelijk
 * als "net klaar" wordt gezien -- job.charged is in-memory en dus NIET
 * gegarandeerd gezien door beide. credits.recordUsage() heeft die bescherming
 * al via zijn eigen `reference`; dit is dezelfde bescherming voor de
 * kostenteller hier, die anders Helvaro's eigen kosten in cost-overview
 * dubbel zou tellen (de klant wordt niet dubbel belast -- dat blijft de
 * ledger-referentie regelen -- maar het cijfer dat de eigenaar ziet zou wel
 * liegen).
 *
 * GEEN reference meegeven (het merendeel van de aanroepen -- elke Anthropic-
 * poging in api/_ai/router.js) telt gewoon zoals altijd: daar is elke
 * aanroep een ECHTE, aparte provider-aanroep met een eigen kost, geen
 * herhaling van eenzelfde al-betaalde gebeurtenis. Idempotency lost dat
 * andere probleem niet op en hoort er niet overal aan te hangen.
 *
 * Zelfde begrenzing als _tellers hierboven: oudste eruit bij overschrijding,
 * zodat dit geen langzaam lek wordt op een instantie die dagenlang leeft.
 */
const MAX_REFERENTIES = 5000;
const _geziendeReferenties = new Set();

function alGezien(reference) {
  if (!reference) return false;
  if (_geziendeReferenties.has(reference)) return true;
  if (_geziendeReferenties.size >= MAX_REFERENTIES) {
    const oudste = _geziendeReferenties.values().next().value;
    _geziendeReferenties.delete(oudste);
  }
  _geziendeReferenties.add(reference);
  return false;
}

function leeg() {
  return {
    requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costEur: 0,
    failures: 0, escalations: 0, latencyTotal: 0,
    byTask: {}, byModel: {}, byProvider: {}, byKind: {},
    since: Date.now(),
  };
}

function tellerVoor(tenant) {
  if (!_tellers.has(tenant)) {
    if (_tellers.size >= MAX_TENANTS) {
      const oudste = _tellers.keys().next().value;
      _tellers.delete(oudste);
    }
    _tellers.set(tenant, leeg());
  }
  return _tellers.get(tenant);
}

function tel(obj, sleutel, veld, waarde) {
  if (!sleutel) return;
  if (!obj[sleutel]) obj[sleutel] = { requests: 0, costUsd: 0, costEur: 0, tokens: 0 };
  obj[sleutel][veld] = (obj[sleutel][veld] || 0) + waarde;
}

/**
 * Eén AI-aanroep wegschrijven.
 *
 * Faalt nooit hard: verbruik registreren mag een werkende aanroep niet alsnog
 * laten mislukken. Wat misgaat komt in het log, niet in het antwoord.
 */
/**
 * @param {number} [opts.costUsdOverride] al berekende kosten in USD -- voor
 *        aanroepers die zelf al een echte prijs kennen (beeld/video via
 *        api/_media-models.js `costUsd()`, of een WhatsApp-conversatieprijs
 *        uit api/_ai/registry.js `waKostenEur()`, omgerekend naar USD door de
 *        aanroeper zelf). Wint altijd van registry.kostenUsd(): die kent alleen
 *        tekst/beeld-tarieven per modelnaam en zou voor 'kling-3' of een
 *        WhatsApp-categorie toch null teruggeven.
 * @param {number} [opts.costEurOverride] zelfde idee, maar in EUR -- voor een
 *        bron die alleen in euro prijst (Meta's WhatsApp-tarieven; zie
 *        api/_ai/registry.js `waKostenEur()`). NOOIT bij elkaar opgeteld met
 *        costUsd: een dollar en een euro samenvoegen zonder koers is precies
 *        het verzonnen getal dat api/_kosten.js elders expliciet weigert te
 *        maken. Ze blijven twee aparte totalen; de aanroeper die ze samen wil
 *        tonen (admin cost-overview) doet dat zichtbaar naast elkaar.
 * @param {string} [opts.kind] 'text' (standaard) | 'image' | 'video' | 'whatsapp'
 *        -- puur voor rapportage (byKind hieronder), verandert niets aan de
 *        rekensom.
 * @param {string} [opts.reference] optionele dedup-sleutel -- zie de uitleg
 *        bij MAX_REFERENTIES hierboven. Een tweede record() met dezelfde
 *        reference wordt genegeerd (geen dubbele telling), niet opnieuw
 *        opgeteld.
 */
async function record({
  ctx = {}, task, providerId, model, tier,
  inputTokens = 0, outputTokens = 0, latencyMs = 0,
  status = 'ok', pogingen = 1, images = 0, quality,
  kind = 'text', costUsdOverride = null, costEurOverride = null,
  reference = null,
} = {}) {
  try {
    if (reference && alGezien(reference)) {
      console.log('[ai]', JSON.stringify({ dedup: true, reference, task, kind }));
      return;
    }
    const tenant = String(ctx.projectCode || '').trim() || '_onbekend';
    const kosten = Number.isFinite(costUsdOverride)
      ? costUsdOverride
      : registry.kostenUsd({ model, inputTokens, outputTokens, images, quality });
    const kostenEur = Number.isFinite(costEurOverride) ? costEurOverride : null;

    const t = tellerVoor(tenant);
    t.requests += 1;
    t.inputTokens  += Number(inputTokens)  || 0;
    t.outputTokens += Number(outputTokens) || 0;
    t.latencyTotal += Number(latencyMs)    || 0;
    if (Number.isFinite(kosten))    t.costUsd += kosten;
    if (Number.isFinite(kostenEur)) t.costEur += kostenEur;
    if (status !== 'ok') t.failures += 1;
    if (pogingen > 1)    t.escalations += 1;

    tel(t.byTask,     task,       'requests', 1);
    tel(t.byModel,    model,      'requests', 1);
    tel(t.byProvider, providerId, 'requests', 1);
    if (!t.byKind) t.byKind = {};
    tel(t.byKind,     kind,       'requests', 1);
    if (Number.isFinite(kosten)) {
      tel(t.byTask,     task,       'costUsd', kosten);
      tel(t.byModel,    model,      'costUsd', kosten);
      tel(t.byProvider, providerId, 'costUsd', kosten);
      tel(t.byKind,     kind,       'costUsd', kosten);
    }
    if (Number.isFinite(kostenEur)) {
      tel(t.byTask,     task,       'costEur', kostenEur);
      tel(t.byModel,    model,      'costEur', kostenEur);
      tel(t.byProvider, providerId, 'costEur', kostenEur);
      tel(t.byKind,     kind,       'costEur', kostenEur);
    }

    /* Eén regel per aanroep. Geen tenantnaam of gespreksinhoud: dit belandt in
       een logdienst en daar hoort geen klantdata. De projectcode is een code,
       geen persoonsgegeven. */
    console.log('[ai]', JSON.stringify({
      tenant, task, provider: providerId, model, tier, status, kind,
      in: inputTokens, out: outputTokens, ms: latencyMs, pogingen,
      usd: Number.isFinite(kosten) ? Number(kosten.toFixed(6)) : null,
      eur: Number.isFinite(kostenEur) ? Number(kostenEur.toFixed(6)) : null,
    }));
  } catch (err) {
    console.error('[ai/usage] registreren mislukt:', err && err.message);
  }
}

/** Optelling voor één tenant, of null als er niets bekend is. */
function voorTenant(projectCode) {
  const t = _tellers.get(String(projectCode || '').trim());
  if (!t) return null;
  return {
    ...t,
    gemiddeldeLatencyMs: t.requests ? Math.round(t.latencyTotal / t.requests) : 0,
    faalpercentage:      t.requests ? +(t.failures / t.requests * 100).toFixed(1) : 0,
    escalatiepercentage: t.requests ? +(t.escalations / t.requests * 100).toFixed(1) : 0,
  };
}

/**
 * Alles, voor het beheerdersoverzicht.
 * Alleen aan te roepen achter een admincontrole -- dit is Helvaro-breed.
 */
function alles() {
  const perTenant = {};
  let totaal = leeg();
  for (const [tenant, t] of _tellers) {
    perTenant[tenant] = voorTenant(tenant);
    totaal.requests += t.requests;
    totaal.inputTokens += t.inputTokens;
    totaal.outputTokens += t.outputTokens;
    totaal.costUsd += t.costUsd;
    totaal.costEur += t.costEur || 0;
    totaal.failures += t.failures;
    totaal.escalations += t.escalations;
    totaal.latencyTotal += t.latencyTotal;
    for (const [k, v] of Object.entries(t.byTask))     tel(totaal.byTask, k, 'requests', v.requests || 0);
    for (const [k, v] of Object.entries(t.byModel))    tel(totaal.byModel, k, 'requests', v.requests || 0);
    for (const [k, v] of Object.entries(t.byProvider)) tel(totaal.byProvider, k, 'requests', v.requests || 0);
    for (const [k, v] of Object.entries(t.byKind || {})) {
      tel(totaal.byKind, k, 'requests', v.requests || 0);
      tel(totaal.byKind, k, 'costUsd', v.costUsd || 0);
      tel(totaal.byKind, k, 'costEur', v.costEur || 0);
    }
  }
  return {
    totaal: {
      ...totaal,
      gemiddeldeLatencyMs: totaal.requests ? Math.round(totaal.latencyTotal / totaal.requests) : 0,
      faalpercentage:      totaal.requests ? +(totaal.failures / totaal.requests * 100).toFixed(1) : 0,
      escalatiepercentage: totaal.requests ? +(totaal.escalations / totaal.requests * 100).toFixed(1) : 0,
    },
    perTenant,
    tenants: _tellers.size,
  };
}

/** Alleen voor tests. */
function _reset() { _tellers.clear(); _geziendeReferenties.clear(); }

module.exports = { record, voorTenant, alles, _reset, MAX_TENANTS, MAX_REFERENTIES };
