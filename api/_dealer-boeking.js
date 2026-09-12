'use strict';
/*
 * De ene boekingspoort voor de dealership-vertical.
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────────
 * Er zijn drie plekken die een dealership-afspraak kunnen aanmaken: het
 * WhatsApp-gesprek (api/whatsapp.js), het dashboard (api/leads.js
 * 'appointment-create') en straks misschien Faro rechtstreeks. Elke plek had
 * tot nu toe zijn eigen combinatie van controles -- of geen, want de
 * voertuigbescherming (api/_voertuigslot.js, api/_vehicles.js boekbaar) bestond
 * nog niet voor de dealership-tak.
 *
 * Dit bestand is de ENE plek die "mag deze boeking doorgaan" beantwoordt, in een
 * vaste volgorde, met een vaste uitkomst. Een nieuwe aanroeper hoeft nooit meer
 * zelf te bedenken in welke volgorde een dubbele lead, een verkochte auto en een
 * idempotente herhaling gecontroleerd worden -- hij roept `controleer()` aan en
 * krijgt het antwoord.
 *
 * ── Zuivere orkestratie ───────────────────────────────────────────────────────
 * Er staat hier geen enkele rechtstreekse Airtable-aanroep. Alles loopt via de
 * fundamentmodules (_voertuigslot, _vehicles, _wens, _koop, _leadscore,
 * _activiteit) die dat al goed en getest doen. Dit bestand beslist alleen in
 * welke VOLGORDE ze aangeroepen worden en wat de uitkomst betekent.
 *
 * ── Volgorde is gedrag, geen smaak ────────────────────────────────────────────
 * 1. Heeft deze LEAD al een afspraak lopen? Dat wint van alles, want een tweede
 *    afspraak voor dezelfde lead is bijna nooit de bedoeling. Uitzondering: hij
 *    zegde de vorige DEZE beurt af (`afspraakAfgezegd`) -- dan is de oude er al
 *    niet meer en zou deze controle een geldige herboeking blokkeren.
 * 2. Is het VOERTUIG nog boekbaar? Verkocht, uit aanbod, gereserveerd of al een
 *    actieve afspraak -- allemaal redenen om niet door te gaan, en allemaal al
 *    uitgerekend door api/_vehicles.js boekbaar().
 * 3. Is dit een HERHAALDE poging voor exact dezelfde boeking (idempotentie)?
 *    Dan is er niets nieuws te doen -- de aanroeper behandelt dat als een
 *    stille succesvolle boeking, niet als een fout.
 *
 * Elke blokkade LOGT zichzelf via api/_activiteit.js, zodat een verkoper kan
 * zien waarom een afspraak niet doorging zonder in de WhatsApp-historie te
 * moeten graven. Loggen mag nooit de beslissing zelf ophouden of laten
 * mislukken -- zie de kop van _activiteit.js.
 *
 * ── Tenant, altijd ──────────────────────────────────────────────────────────
 * projectCode komt van de aanroeper, uit de geverifieerde sessie. Elke functie
 * hier geeft hem door aan de fundamentmodules, die daar zelf op filteren.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const _voertuigslot = require('./_voertuigslot');
const _vehicles     = require('./_vehicles');
const _vertical      = require('./_vertical');
const _wens          = require('./_wens');
const _koop          = require('./_koop');
const _leadscore     = require('./_leadscore');
const _activiteit    = require('./_activiteit');

const AFSPRAAK_TYPES = Object.freeze(['proefrit', 'bezichtiging', 'ophaling', 'gesprek']);

/** Welk afspraaktype hoort standaard bij deze markt. */
function standaardType(vertical) {
  if (vertical === _vertical.DEALERSHIP) return 'proefrit';
  if (vertical === _vertical.VASTGOED) return 'bezichtiging';
  return 'gesprek';
}

/* De reden die api/_vehicles.js boekbaar() teruggeeft -> de activiteitensoort
   die daarbij hoort. 'onbekend' komt in de praktijk niet voor via deze weg
   (boekbaar() geeft dat alleen bij een ontbrekend voertuig, en hier wordt hij
   alleen aangeroepen als er al een voertuig is) maar staat er toch bij: een
   onverwachte reden verdient een soort en geen crash. */
const VOERTUIG_SOORT = Object.freeze({
  verkocht:         'vehicle_sold_blocked',
  uit_aanbod:       'vehicle_unavailable_blocked',
  gereserveerd:     'vehicle_reserved_blocked',
  afspraak_bestaat: 'duplicate_vehicle_blocked',
  onbekend:         'vehicle_unavailable_blocked',
});

/* Loggen mag nooit de boeking zelf ophouden -- fire-and-forget met een
   genegeerde catch, zoals overal waar _activiteit.log() wordt aangeroepen. */
function loggen(projectCode, soort, opts) {
  _activiteit.log(projectCode, soort, opts).catch(() => {});
}

/**
 * Mag deze boeking doorgaan? DE ene poort voor de dealership-vertical.
 *
 * @param {object} o
 * @param {string} o.projectCode        uit de geverifieerde sessie
 * @param {object} [o.voertuig]         zoals api/_vehicles.js het teruggeeft, of leeg (geen catalogus)
 * @param {string} [o.leadId]
 * @param {string} [o.telefoon]
 * @param {string} o.startISO
 * @param {boolean} [o.afspraakAfgezegd]  de lead zegde zijn vorige afspraak DEZE beurt af
 * @returns {Promise<{ok:true, apptId:string, actieveOpVoertuig:object[]} | {ok:false, reden:string, bestaand?:object, soort?:string}>}
 */
async function controleer({ projectCode, voertuig, leadId, telefoon, startISO, afspraakAfgezegd } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return { ok: false, reden: 'onbekend' };

  try {
    /* 1. Heeft deze LEAD al iets lopen? Niet als hij het net deze beurt zelf
       afzegde -- dan bestaat de oude afspraak al niet meer, en zou deze
       controle een geldige herboeking in dezelfde beurt blokkeren. */
    if (afspraakAfgezegd !== true) {
      let bestaandeVoorLead = null;
      try {
        bestaandeVoorLead = await _voertuigslot.actieveVoorLead(code, { leadId, telefoon });
      } catch (err) {
        console.warn('[dealer-boeking] duplicate-lead-check overgeslagen (fail-soft):', err && err.message);
        bestaandeVoorLead = null;
      }
      if (bestaandeVoorLead) {
        loggen(code, 'duplicate_lead_blocked', { leadId, afspraakId: bestaandeVoorLead.fields && bestaandeVoorLead.fields[_voertuigslot.F.APPT_ID] });
        return { ok: false, reden: 'lead_heeft_afspraak', bestaand: bestaandeVoorLead, soort: 'duplicate_lead_blocked' };
      }
    }

    /* 2. Is het VOERTUIG nog boekbaar? Alleen relevant als er een voertuig is
       -- markten zonder catalogus (bouw/keuken/renovatie) en vastgoed lopen
       niet via dit bestand voor hun eigen aanbod, maar een dealer-afspraak
       zonder herkend voertuig (de koper vroeg nog niets specifieks) mag wel
       gewoon door. */
    let actieveOpVoertuig = [];
    if (voertuig) {
      try {
        actieveOpVoertuig = await _voertuigslot.actieveAfspraken(code, voertuig.code);
      } catch (err) {
        console.warn('[dealer-boeking] actieveAfspraken overgeslagen (fail-soft):', err && err.message);
        actieveOpVoertuig = [];
      }
      const status = _vehicles.boekbaar(voertuig, actieveOpVoertuig);
      if (!status.ok) {
        const soort = VOERTUIG_SOORT[status.reden] || 'vehicle_unavailable_blocked';
        loggen(code, soort, { leadId, voertuigCode: voertuig.code });
        /* Apart van de specifieke soort hierboven: één algemene marker die elk
           voertuigblok samen optelt, ongeacht de precieze reden -- handig voor
           wie alleen wil weten HOEVEEL boekingen de bescherming tegenhield. */
        loggen(code, 'appointment_protection_triggered', { leadId, voertuigCode: voertuig.code, details: { reden: status.reden } });
        return { ok: false, reden: status.reden, soort };
      }
    }

    /* 3. Idempotentie: is dit exact dezelfde boekingspoging als een die al
       gelukt is? Dan is er niets nieuws te doen. Dit is geen fout -- de
       aanroeper behandelt het als een stille, al voltooide boeking. */
    const apptId = _voertuigslot.idempotentieSleutel({
      projectCode: code, startISO, leadId, voertuigCode: voertuig && voertuig.code,
    });
    if (apptId) {
      let bestaand = null;
      try {
        bestaand = await _voertuigslot.zoekOpSleutel(code, apptId);
      } catch (err) {
        console.warn('[dealer-boeking] idempotentie-check overgeslagen (fail-soft):', err && err.message);
        bestaand = null;
      }
      if (bestaand) return { ok: false, reden: 'al_geboekt', bestaand };
    }

    return { ok: true, apptId, actieveOpVoertuig };
  } catch (err) {
    /* Nooit gooien. Een storing hier mag een lead nooit tegen een halve
       boeking laten aanlopen -- fail-soft naar "onbekend", en de aanroeper
       beslist zelf hoe voorzichtig hij daarmee doet. */
    console.warn('[dealer-boeking] controleer exception (fail-soft):', err && err.message);
    return { ok: false, reden: 'onbekend' };
  }
}

/**
 * NA het aanmaken van het Appointment-record: de race op het voertuig zelf
 * sluiten (zie api/_voertuigslot.js bevestigClaim voor de "schrijf eerst,
 * verifieer daarna"-redenering). Hoort ALTIJD na het aanmaken aangeroepen te
 * worden, nooit ervoor.
 *
 * @param {object} o
 * @param {string} o.projectCode
 * @param {object} [o.voertuig]     leeg = geen voertuigrace om te sluiten
 * @param {string} o.recordId       het net aangemaakte Appointment-record
 * @param {string} [o.apptId]
 * @param {string} [o.leadId]
 * @returns {Promise<{ok:true, geverifieerd:boolean} | {ok:false, reden:'voertuig_bezet'}>}
 */
async function naAanmaak({ projectCode, voertuig, recordId, apptId, leadId } = {}) {
  const code = String(projectCode || '').trim();

  if (!voertuig) {
    loggen(code, 'appointment_created', { leadId, afspraakId: apptId });
    return { ok: true, geverifieerd: false };
  }

  try {
    const uit = await _voertuigslot.bevestigClaim(code, voertuig.code, recordId);
    if (!uit.ok) {
      loggen(code, 'duplicate_vehicle_blocked', { leadId, voertuigCode: voertuig.code, afspraakId: apptId });
      loggen(code, 'appointment_creation_failed', {
        leadId, voertuigCode: voertuig.code, afspraakId: apptId, details: { reden: uit.reden },
      });
      return { ok: false, reden: 'voertuig_bezet' };
    }
    loggen(code, 'appointment_created', { leadId, voertuigCode: voertuig.code, afspraakId: apptId });
    /* bevestigClaim() laat `geverifieerd` weg als de check gewoon lukte (geen
       race, niets fail-open) -- alleen bij een leesfout staat hij expliciet op
       false. Onduidelijk is dus "gewoon geverifieerd", niet "onbekend". */
    return { ok: true, geverifieerd: uit.geverifieerd !== false };
  } catch (err) {
    /* bevestigClaim() zelf gooit al niet (zie zijn eigen kop, fail-open bij een
       leesfout). Deze catch is de riem naast de bretels: een onverwachte fout
       hier mag een AL AANGEMAAKTE afspraak niet als mislukt laten lezen. */
    console.warn('[dealer-boeking] naAanmaak exception (fail-open, telt als niet-geverifieerd):', err && err.message);
    loggen(code, 'appointment_created', { leadId, voertuigCode: voertuig.code, afspraakId: apptId });
    return { ok: true, geverifieerd: false };
  }
}

/**
 * De leadscore herberekenen na een geslaagde boeking. Puur -- geen fetch, geen
 * Airtable, geen klok buiten wat er impliciet in `_leadscore.naarNotities` zit.
 *
 * @param {object} o
 * @param {string} [o.notitiesRaw]   de Notities-blob VOOR deze boeking
 * @param {string} [o.voertuigCode]
 * @param {string} [o.type]          proefrit | bezichtiging | ophaling | gesprek
 * @returns {{uitkomst:{score:number,temperatuur:string,redenen:object[]}, nieuweNotities:string|null}}
 */
function scoreNaBoeking({ notitiesRaw, voertuigCode, type } = {}) {
  const wens = _wens.uitNotities(notitiesRaw);
  const koop = _koop.uitNotities(notitiesRaw);
  const uitkomst = _leadscore.bereken({
    wens,
    koop,
    voertuigCode,
    afspraak: { gevraagd: true, type, geboekt: true },
  });
  const nieuweNotities = _leadscore.naarNotities(notitiesRaw, uitkomst);
  return { uitkomst, nieuweNotities };
}

module.exports = {
  AFSPRAAK_TYPES,
  standaardType,
  controleer,
  naAanmaak,
  scoreNaBoeking,
};
