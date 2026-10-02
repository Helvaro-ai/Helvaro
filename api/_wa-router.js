'use strict';
/*
 * De berichtbeslisser: voor elk uitgaand WhatsApp-bericht de GOEDKOOPSTE
 * geldige manier kiezen -- en soms kiezen om niets te sturen.
 *
 * Alles hier is zuiver (geen netwerk, geen Airtable, geen klok behalve wat je
 * meegeeft), zodat elke regel te testen is en dezelfde beslissing zowel in de
 * cron als in de webhook genomen kan worden. De bijbehorende boekhouding staat
 * in api/_wa-kosten.js; de verzending zelf blijft api/_wa-send.js.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * "Is het 24-uursvenster open" werd op vier plekken apart berekend
 * (cron-followup, _faro, whatsapp.js, leads.js). Eén kopie die afwijkt is een
 * betaald sjabloon dat gratis had gekund -- of een vrij bericht dat Meta
 * weigert. Nu is er één definitie: venster().
 *
 * ── Wat Meta rekent (en wat niet) ────────────────────────────────────────────
 * Een gesprek dat de klant zelf opent (AutoScout24 -> "WhatsApp" -> eerste
 * bericht van de klant) opent een servicevenster van 24 uur vanaf ZIJN laatste
 * bericht. Daarbinnen zijn gewone antwoorden gratis, en sjablonen van de
 * categorie utility ook. Buiten het venster kan alleen een goedgekeurd sjabloon,
 * en dat is betaald. De BETAALDE categorieën en hun tarief staan in
 * api/_wa-kosten.js; de feitelijke factuurstatus komt uit Meta's
 * statuswebhook (pricing.billable) en wint altijd van een schatting.
 */

const crypto = require('crypto');

const VENSTER_MS = 24 * 60 * 60 * 1000;

/* ── 1. Het servicevenster ────────────────────────────────────────────────── */

/**
 * Staat van het servicevenster, berekend uit het laatste INKOMENDE bericht.
 * Nooit uit de leeftijd van het gesprek of uit het laatste uitgaande bericht:
 * alleen een bericht van de klant opent of verlengt het venster.
 */
function venster(laatsteInkomendMs, nuMs = Date.now()) {
  const t = Number(laatsteInkomendMs);
  if (!Number.isFinite(t) || t <= 0) return { open: false, verlooptOp: null, msOver: 0, ooitInkomend: false };
  const verlooptOp = t + VENSTER_MS;
  const msOver = verlooptOp - nuMs;
  return { open: msOver > 0, verlooptOp, msOver: Math.max(0, msOver), ooitInkomend: true };
}

/** Het laatste inkomende tijdstip uit een gespreksgeschiedenis ({role:'user', ts}). */
function laatsteInkomend(history) {
  let best = null;
  for (const m of Array.isArray(history) ? history : []) {
    if (m && m.role === 'user' && typeof m.ts === 'number' && (best === null || m.ts > best)) best = m.ts;
  }
  return best;
}

/**
 * Seconden tussen het EERSTE bericht van de klant en ons eerste antwoord.
 * Nul of null als dit geen eerste antwoord is. Het veld "Response Time (sec)"
 * werd gelezen (dashboard: "Gem. reactietijd") maar nergens geschreven, dus
 * dat kerngetal -- "een antwoord binnen de minuut" is de belofte van het
 * product -- stond voor elke lead van het huidige systeem leeg.
 *
 * @param {Array} history  gespreksgeschiedenis VOOR het nieuwe antwoord erin zit
 */
function eersteReactietijdSec(history, nuMs = Date.now()) {
  const h = Array.isArray(history) ? history : [];
  if (h.some((m) => m && m.role === 'assistant')) return null;   // er is al eerder geantwoord
  const eerste = h.filter((m) => m && m.role === 'user' && typeof m.ts === 'number').map((m) => m.ts);
  if (!eerste.length) return null;
  const sec = Math.round((nuMs - Math.min.apply(null, eerste)) / 1000);
  if (!Number.isFinite(sec) || sec < 0 || sec > 7 * 86400) return null;   // een klok die niet klopt is geen meting
  return Math.max(1, sec);
}

/* ── 2. Wat de klant bedoelt (zonder AI) ──────────────────────────────────── */

/*
 * Deterministisch, in vier talen, bewust voorzichtig: alleen wat ondubbelzinnig
 * is. Twijfel = 'overig' = de gewone AI-route. Het doel is niet elk bericht te
 * begrijpen maar de paar die we zeker weten, want die bepalen of een opvolging
 * nog zin heeft en of er een AI-aanroep nodig is.
 */
const NIET_GEINTERESSEERD = /\b(niet (meer )?ge[iï]nteresseerd|geen interesse|laat maar|hoeft niet meer|niet meer nodig|bel (me|mij) niet|pas int[eé]ress[eé]|plus int[eé]ress|pas besoin|not interested|no longer interested|no thanks|kein interesse|nicht mehr interessiert|brauche ich nicht)\b/i;
const BEDENKTIJD = /\b(ik denk er (even )?(over )?na|laat (je|het) (even )?weten|ik kom (er )?(nog )?(bij je )?terug|ik laat (nog )?(iets )?weten|je reflechis|je vous recontacte|i'?ll think( about it)?|let me think|get back to you|ich überlege|ich melde mich)\b/i;
const BEVESTIGING = /^\s*(ok(é|ay|ee)?|oké|top|prima|goed|perfect|super|dank(je|u)?( wel)?|bedankt|merci|thanks?( you)?|thx|danke|alles klar|d'?accord|👍|🙏|👌)[\s.!]*$/i;
const AFSPRAAK = /\b(afspraak|langskomen|langs ?komen|kom(en)? kijken|proefrit|proef ?rijden|bezichtig|zaterdag|zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|morgen|vanmiddag|rendez-vous|essai routier|samedi|demain|appointment|test drive|saturday|tomorrow|termin|probefahrt|samstag)\b/i;
const BESCHIKBAAR = /\b(nog (beschikbaar|te koop|verkrijgbaar)|is (hij|ze|die) (nog )?(beschikbaar|te koop)|toujours disponible|encore disponible|still available|noch verfügbar|noch zu haben)\b/i;

/** 'niet_geinteresseerd' | 'bedenktijd' | 'afspraak' | 'bevestiging' | 'beschikbaarheid' | 'overig' */
function intentie(tekst) {
  const t = String(tekst == null ? '' : tekst).trim();
  if (!t) return 'overig';
  if (NIET_GEINTERESSEERD.test(t)) return 'niet_geinteresseerd';
  if (BEVESTIGING.test(t)) return 'bevestiging';
  if (BEDENKTIJD.test(t)) return 'bedenktijd';
  if (AFSPRAAK.test(t)) return 'afspraak';
  if (BESCHIKBAAR.test(t)) return 'beschikbaarheid';
  return 'overig';
}

/* ── 3. De berichtrouter ──────────────────────────────────────────────────── */

const ACTIE = Object.freeze({
  VRIJ_BERICHT:     'SEND_FREE_SERVICE_MESSAGE',
  UTILITY_TEMPLATE: 'SEND_UTILITY_TEMPLATE',
  ANDER_TEMPLATE:   'SEND_OTHER_TEMPLATE',
  UITSTELLEN:       'DELAY',
  NIET_STUREN:      'DO_NOT_SEND',
  OVERDRACHT:       'HUMAN_HANDOFF',
});

/* Doelen die de klant zelf niet gevraagd heeft: die vallen onder de
   veiligheidsrails en onder de opvolgregels. Een ANTWOORD ('reply') nooit. */
const GEAUTOMATISEERD = new Set(['followup', 'reminder', 'marketing', 'review_request']);

/**
 * Kies hoe (en of) dit bericht de deur uit gaat.
 *
 * @param {object} i
 *   purpose           'reply' | 'followup' | 'reminder' | 'appointment_confirm' | 'marketing' | 'review_request'
 *   nowMs             huidige tijd
 *   lastInboundMs     laatste bericht VAN de klant (of null)
 *   optedOut          lead heeft zich afgemeld
 *   humanTakeover     een verkoper heeft het gesprek overgenomen
 *   booked            er staat een afspraak
 *   vehicleSold       het voertuig is verkocht/gereserveerd
 *   templateAvailable er is een goedgekeurd sjabloon voor dit doel
 *   templateCategory  'utility' | 'marketing' | 'authentication' (standaard utility)
 *   useful            is dit bericht nog zinvol (standaard true)
 *   duplicate         dezelfde logische gebeurtenis is al verstuurd
 *   limits            { outboundLeft, templateLeft, followupLeft }  (undefined = geen limiet)
 * @returns {{ actie, reden, billable:boolean, categorie:string|null, vlaggen:string[] }}
 */
function besluit(i) {
  const doel = String(i.purpose || 'reply');
  const auto = GEAUTOMATISEERD.has(doel);
  const w = venster(i.lastInboundMs, i.nowMs);
  const vlaggen = [];
  const uit = (actie, reden, extra) => Object.assign({ actie, reden, billable: false, categorie: null, vlaggen, venster: w }, extra || {});

  // Harde stops, in volgorde van gewicht. Afmelding wint van alles.
  if (i.optedOut) return uit(ACTIE.NIET_STUREN, 'afgemeld');
  if (i.duplicate) return uit(ACTIE.NIET_STUREN, 'duplicaat');

  if (i.humanTakeover) {
    // Een antwoord op een inkomend bericht gaat naar de verkoper; automatisch
    // geplande berichten verdwijnen gewoon.
    return doel === 'reply'
      ? uit(ACTIE.OVERDRACHT, 'mens_aan_het_roer')
      : uit(ACTIE.NIET_STUREN, 'mens_aan_het_roer');
  }

  // Een opvolging of reclamebericht heeft geen zin meer als er al een afspraak
  // staat of het voertuig weg is. Een HERINNERING hoort juist bij een afspraak
  // en een ANTWOORD op een vraag gaat altijd door.
  if (doel === 'followup' || doel === 'marketing') {
    if (i.booked) return uit(ACTIE.NIET_STUREN, 'afspraak_staat');
    if (i.vehicleSold) return uit(ACTIE.NIET_STUREN, 'voertuig_verkocht');
  }

  if (i.useful === false) return uit(ACTIE.NIET_STUREN, 'niet_zinvol');

  // Veiligheidsrails: alleen voor wat niemand gevraagd heeft. Een nieuwe klant
  // laten wachten omdat een dagquotum op is, is het ergste wat dit systeem kan doen.
  const lim = i.limits || {};
  if (auto) {
    if (lim.outboundLeft !== undefined && lim.outboundLeft <= 0) return uit(ACTIE.UITSTELLEN, 'dagquotum_uitgaand');
    if (doel === 'followup' && lim.followupLeft !== undefined && lim.followupLeft <= 0) return uit(ACTIE.UITSTELLEN, 'dagquotum_opvolging');
  } else if (lim.outboundLeft !== undefined && lim.outboundLeft <= 0) {
    vlaggen.push('quotum_overschreden_toch_beantwoord');
  }
  if (doel === 'reply' && i.vehicleSold) vlaggen.push('voertuig_verkocht');

  // Het servicevenster is open: de goedkoopste geldige manier is een gewoon bericht.
  if (w.open) return uit(ACTIE.VRIJ_BERICHT, 'servicevenster_open');

  // Venster dicht (of klant schreef nooit): alleen een goedgekeurd sjabloon kan.
  if (!i.templateAvailable) return uit(ACTIE.NIET_STUREN, 'venster_dicht_geen_sjabloon');
  if (lim.templateLeft !== undefined && lim.templateLeft <= 0) return uit(ACTIE.UITSTELLEN, 'dagquotum_sjablonen');

  const cat = String(i.templateCategory || 'utility').toLowerCase();
  const gegevens = { billable: true, categorie: cat };
  return cat === 'utility'
    ? uit(ACTIE.UTILITY_TEMPLATE, 'venster_dicht_utility_sjabloon', gegevens)
    : uit(ACTIE.ANDER_TEMPLATE, 'venster_dicht_' + cat + '_sjabloon', gegevens);
}

/* ── 4. De opvolgbeslisser ────────────────────────────────────────────────── */

/**
 * Moet er nu een opvolging naar deze lead? Vervangt "elke X dagen een bericht".
 *
 * @param {object} l
 *   nowMs, optedOut, booked, humanTakeover, vehicleSold
 *   lastInboundText     laatste bericht van de klant (voor de intentie)
 *   lastInboundMs / lastOutboundMs
 *   opvolgingenGestuurd aantal al gestuurde opvolgingen
 *   maxOpvolgingen      standaard 1
 *   opvolgingGepland    er staat er al een klaar
 *   minGapMs            minimale tijd sinds ons laatste bericht (standaard 20u)
 *   bedenktijdMs        wachttijd na "ik denk erover na" (standaard 3 dagen)
 *   maxLeeftijdMs       na hoeveel tijd stilte houdt het op (standaard 14 dagen)
 * @returns {{ doen:boolean, reden:string, wanneerMs?:number }}
 */
function volgOpBesluit(l) {
  const nu = l.nowMs == null ? Date.now() : l.nowMs;
  const nee = (reden, wanneerMs) => ({ doen: false, reden, wanneerMs });

  if (l.optedOut) return nee('afgemeld');
  if (l.booked) return nee('afspraak_staat');
  if (l.humanTakeover) return nee('mens_aan_het_roer');
  if (l.vehicleSold) return nee('voertuig_verkocht');
  if (l.opvolgingGepland) return nee('al_gepland');

  /* Standaard ÉÉN, zoals de bestaande cron al doet (api/cron-followup.js zet de
     lead na de eerste opvolging op in_progress). Elke extra opvolging buiten het
     venster is een betaald sjabloon; wie meer wil, zet maxOpvolgingen expliciet. */
  const max = l.maxOpvolgingen == null ? 1 : l.maxOpvolgingen;
  if ((l.opvolgingenGestuurd || 0) >= max) return nee('maximum_bereikt');

  const intent = intentie(l.lastInboundText);
  if (intent === 'niet_geinteresseerd') return nee('niet_geinteresseerd');
  if (intent === 'afspraak') return nee('afspraakflow_loopt');

  const laatsteContact = Math.max(Number(l.lastInboundMs) || 0, Number(l.lastOutboundMs) || 0);
  if (laatsteContact && nu - laatsteContact > (l.maxLeeftijdMs || 14 * 86400000)) return nee('te_oud');

  // De klant antwoordde NA ons laatste bericht: dan wacht de bal bij ons en is
  // een opvolging onzin -- het gewone antwoord regelt dat.
  if ((Number(l.lastInboundMs) || 0) > (Number(l.lastOutboundMs) || 0)) return nee('klant_wacht_op_ons');

  const gap = l.minGapMs == null ? 20 * 3600000 : l.minGapMs;
  if (intent === 'bedenktijd') {
    const vroegst = (Number(l.lastInboundMs) || 0) + (l.bedenktijdMs || 3 * 86400000);
    if (nu < vroegst) return nee('bedenktijd', vroegst);
  }
  if (l.lastOutboundMs && nu - l.lastOutboundMs < gap) return nee('te_snel', l.lastOutboundMs + gap);

  return { doen: true, reden: intent === 'bedenktijd' ? 'bedenktijd_voorbij' : 'stilte_na_ons_bericht' };
}

/* ── 5. Dubbel versturen voorkomen ────────────────────────────────────────── */

/**
 * Sleutel voor "dit logische bericht is al verstuurd". Bewust géén exact
 * tijdstip: een herbezorging van dezelfde webhook komt seconden later binnen
 * en moet dezelfde sleutel krijgen. De emmer maakt dat een LEGITIEME tweede
 * opvolging morgen wel door kan.
 */
function idempotentieSleutel({ tenant, conversation, event, target, emmerMs = 10 * 60 * 1000, nowMs = Date.now() }) {
  const emmer = Math.floor(nowMs / emmerMs);
  const ruw = [tenant, conversation, event, target, emmer].map((x) => String(x == null ? '' : x)).join('|');
  return 'wa-uit:' + crypto.createHash('sha256').update(ruw).digest('hex').slice(0, 32);
}

module.exports = {
  VENSTER_MS, ACTIE, GEAUTOMATISEERD,
  venster, laatsteInkomend, eersteReactietijdSec, intentie, besluit, volgOpBesluit, idempotentieSleutel,
};
