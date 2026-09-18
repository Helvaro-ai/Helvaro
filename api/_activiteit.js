'use strict';
/*
 * Het activiteitenlogboek -- wat er in de dealership-automatisering gebeurde,
 * en waarom.
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────
 * "Waarom kreeg deze lead geen afspraak?" en "wanneer werd deze auto op
 * gereserveerd gezet?" zijn vragen die een verkoper nu alleen kan beantwoorden
 * door in de WhatsApp-historie te gaan zoeken, als hij al weet welk gesprek
 * het was. Dit bestand is de plek waar elke beslissing die de automatisering
 * NEEMT een spoor achterlaat -- geblokkeerd, gelukt, mislukt -- los van het
 * gesprek zelf, doorzoekbaar op lead, voertuig of afspraak.
 *
 * ── Wat hier NIET gebeurt ──────────────────────────────────────────────────
 * Er wordt hier niets BESLIST. Andere modules (_voertuigslot.js, _afspraken.js,
 * de boekingscode) nemen de beslissing en roepen `log()` erna aan om hem vast
 * te leggen. Loggen dat mislukt mag NOOIT de eigenlijke actie laten omvallen --
 * daarom werpt `log()` nooit en wordt hij altijd los aangeroepen (fire-and-
 * forget of met een genegeerde catch), nooit met `await` op het kritieke pad.
 *
 * ── Tenant, altijd ──────────────────────────────────────────────────────────
 * Zelfde regel als overal in deze codebase: elke functie neemt projectCode als
 * EERSTE argument, filtert erop in de Airtable-formule EN controleert het
 * resultaat nog eens in JavaScript. De projectCode komt van de aanroeper, uit
 * de geverifieerde sessie -- deze module leest nooit een request.
 *
 * ── Veldnamen, niet veld-ids ─────────────────────────────────────────────────
 * De tabel is net aangemaakt (2026-09-12) en heeft geen geschiedenis van
 * hernoemingen om tegen te beschermen. Zelfde afweging als api/_vehicles.js.
 *
 * ── Telefoonnummers in Details ────────────────────────────────────────────
 * `details` is vrije tekst die andere modules meegeven, en die kan een
 * telefoonnummer bevatten (bijvoorbeeld: "dubbele lead met nummer X"). Een
 * logboek is precies de plek waar zo'n nummer jarenlang blijft staan, dus elke
 * waarde die op een telefoonnummer lijkt wordt gemaskeerd tot de laatste vier
 * cijfers voordat er iets geschreven wordt. Zie `veiligeDetails`.
 *
 * ── De tabel bestaat misschien nog niet ─────────────────────────────────────
 * Zolang die er niet is, logt deze module gewoon niets en faalt de rest van
 * Helvaro niet mee. Zie `available()`, kopie van hetzelfde patroon in
 * api/_vehicles.js.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const TABEL = 'tblzZSLA5wp60WVZm';

const F = Object.freeze({
  event:        'Event ID',
  project:      'Project Code',
  type:         'Type',
  leadId:       'Lead ID',
  voertuigCode: 'Vehicle Code',
  afspraakId:   'Appointment ID',
  details:      'Details',
  aangemaakt:   'Created At',
});

/* De volledige lijst soorten die deze automatisering kan loggen. Bevroren en
   uitputtend: een onbekende soort is een programmeerfout (een typefout in een
   aanroep), geen gebruikersinvoer, en hoort geweigerd te worden -- niet
   stilzwijgend als vrije tekst weggeschreven. */
const SOORTEN = Object.freeze([
  'appointment_protection_triggered',
  'duplicate_lead_blocked',
  'duplicate_vehicle_blocked',
  'vehicle_reserved_blocked',
  'vehicle_sold_blocked',
  'vehicle_unavailable_blocked',
  'appointment_created',
  'appointment_creation_failed',
  'appointment_cancelled',
  'appointment_cancel_failed',
  'lead_score_calculated',
  'employee_notification_sent',
  'employee_notification_failed',
  'followup_scheduled',
  'followup_sent',
  'appointment_reminder_sent',
  'vehicle_match_found',
  'old_lead_match_found',
  'image_generated',
  'image_generation_failed',
  'video_generated',
  'video_generation_failed',
]);

function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

/* Backslash EERST, dan het aanhalingsteken -- andersom escape je je eigen
   escape-teken weer weg. */
function escapeFormula(val) {
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(pathAndQuery, options = {}) {
  const headers = Object.assign(
    { Authorization: `Bearer ${process.env.API_AIRTABLE}` },
    options.body ? { 'Content-Type': 'application/json' } : {},
    options.headers || {}
  );
  const url = `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pathAndQuery}`;
  const r = await fetch(url, Object.assign({}, options, { headers }));
  if (r.status !== 429) return r;
  await new Promise((res) => setTimeout(res, 900 + Math.random() * 300));
  return fetch(url, Object.assign({}, options, { headers }));
}

let _beschikbaar = null;

/* Onthouden of de tabel er is -- maar alleen een JA voor altijd. Een NEE werd
   hier ook voorgoed onthouden, en dat was fout: één afgebroken verzoek bij een
   koude start ("This operation was aborted", een time-out) zette _beschikbaar
   op false voor de rest van het leven van deze instance, en de app zei dan
   "de tabel bestaat nog niet" over een tabel die er gewoon staat. Gezien op de
   live app op 2026-09-13, op de Voorraad-pagina.

   Nu: ja = klaar; nee = na dertig seconden opnieuw kijken. En de REDEN gaat
   mee (geen_tabel bij een 404, onbereikbaar bij al het andere), zodat een
   scherm het verschil kan zeggen tussen "nog inrichten" en "even niet". */
let _beschikbaarTot = 0;
let _beschikbaarReden = '';
const HERPROBEER_MS = 30 * 1000;

async function available() {
  if (_beschikbaar === true) return true;
  if (_beschikbaar === false && Date.now() < _beschikbaarTot) return false;
  if (!configured()) { _beschikbaar = false; _beschikbaarTot = Infinity; _beschikbaarReden = 'niet_geconfigureerd'; return false; }
  try {
    const r = await atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      _beschikbaarTot = Date.now() + HERPROBEER_MS;
      _beschikbaarReden = r.status === 404 ? 'geen_tabel' : 'onbereikbaar';
      console.warn(`[activiteit] tabel "${TABEL}" niet leesbaar (HTTP ${r.status}) -- over 30 s opnieuw.`);
    } else {
      _beschikbaarReden = '';
    }
  } catch (e) {
    console.warn('[activiteit] Airtable onbereikbaar (over 30 s opnieuw):', e && e.message);
    _beschikbaar = false;
    _beschikbaarTot = Date.now() + HERPROBEER_MS;
    _beschikbaarReden = 'onbereikbaar';
  }
  return _beschikbaar;
}

/** Waarom available() nee zei: 'geen_tabel' | 'onbereikbaar' | 'niet_geconfigureerd' | ''. */
function onbeschikbaarReden() { return _beschikbaar === true ? '' : _beschikbaarReden; }

function _resetAvailability() { _beschikbaar = null; _beschikbaarTot = 0; _beschikbaarReden = ''; }

/* ── Telefoonnummers maskeren ─────────────────────────────────────────────── */

/* Ruim opgezet met opzet: liever een cijferreeks die toevallig geen
   telefoonnummer is toch maskeren, dan één echt nummer laten staan. Een
   dealer-id of een bedrag van acht cijfers verliest hooguit wat leesbaarheid
   in een logregel; een echt nummer dat blijft staan is een datalek. */
const TEL_PATROON = /\+?\d[\d\s]{7,}/g;

function maskeerTelefoons(s) {
  return s.replace(TEL_PATROON, (m) => {
    const cijfers = m.replace(/\D/g, '');
    return '***' + cijfers.slice(-4);
  });
}

/** Loopt een willekeurige waarde door en maskeert elke stringwaarde die op een telefoonnummer lijkt. */
function veiligeDetails(v, diepte) {
  const d = diepte || 0;
  if (d > 8) return null;   // vangnet tegen cirkelverwijzingen en absurde nesting
  if (typeof v === 'string') return maskeerTelefoons(v);
  if (Array.isArray(v)) return v.map((x) => veiligeDetails(x, d + 1));
  if (v && typeof v === 'object') {
    const uit = {};
    for (const k of Object.keys(v)) uit[k] = veiligeDetails(v[k], d + 1);
    return uit;
  }
  return v;
}

/* Willekeurige base36-tekst van vaste lengte. Math.random().toString(36) kan
   soms minder dan de gevraagde lengte opleveren (bijvoorbeeld een uitkomst
   die op nullen eindigt), dus er wordt bijgeplakt tot de lengte klopt. */
function willekeurigBase36(lengte) {
  let s = '';
  while (s.length < lengte) s += Math.random().toString(36).slice(2);
  return s.slice(0, lengte);
}

function eventId() {
  return Date.now().toString(36) + '-' + willekeurigBase36(6);
}

/* De statussen die een actie-record mag hebben (fase 3 pass 2, brief §134-136).
   'retried' is voor een actie die pas na een nieuwe poging lukte (of alsnog
   mislukte) -- niet voor elke fire-and-forget herkansing, alleen als de
   aanroeper zelf een expliciete tweede poging deed op hetzelfde verzoek. */
const ACTIE_STATUSSEN = Object.freeze(['ok', 'failed', 'retried']);

/**
 * Bouwt het `details`-object voor een "leane" actie-record: geen nieuwe tabel,
 * gewoon een vaste vorm bovenop de bestaande `details`-blob van `log()`.
 * `soort` (het Type-veld) blijft de bron van waarheid over WAT er gebeurde;
 * `actionType` hierbinnen is dezelfde waarde, zodat een lezer van de ruwe
 * details-JSON (een dashboard-paneel, een export) 'm niet apart uit het
 * Airtable-record moet halen.
 *
 * @param {string} soort              zelfde soort als aan log() meegegeven
 * @param {'ok'|'failed'|'retried'} status
 * @param {object} [extra]
 * @param {string} [extra.idempotencyKey]  de dedup-sleutel van de actie zelf
 *                                          (bv. dezelfde referentie als de
 *                                          credit-ledger, of het afspraak-id)
 * @param {string} [extra.resource]        wat er geraakt werd: 'appointment',
 *                                          'vehicle', 'employee_notification',
 *                                          'image', 'video', ...
 * @param {string} [extra.error]           korte, klant-veilige reden bij een
 *                                          mislukking -- nooit een stack trace
 * @param {object} [extra.details]         extra vrije velden, samengevoegd
 * @returns {object}
 */
function actieVelden(soort, status, extra = {}) {
  const uit = {
    actionType: String(soort || ''),
    status: ACTIE_STATUSSEN.indexOf(status) !== -1 ? status : 'ok',
  };
  if (extra.idempotencyKey) uit.idempotencyKey = String(extra.idempotencyKey).slice(0, 200);
  if (extra.resource) uit.resource = String(extra.resource);
  if (extra.error) uit.error = String(extra.error).slice(0, 300);
  if (extra.details && typeof extra.details === 'object') Object.assign(uit, extra.details);
  return uit;
}

/**
 * Eén activiteit loggen. Werpt NOOIT en verwerpt NOOIT -- dit hangt nooit op
 * het kritieke pad van een boeking of een bericht.
 *
 * @param {string} projectCode
 * @param {string} soort         moet in SOORTEN staan
 * @param {object} [opts]
 * @param {string} [opts.leadId]
 * @param {string} [opts.voertuigCode]
 * @param {string} [opts.afspraakId]
 * @param {*}      [opts.details]  wordt gemaskeerd en tot 2000 tekens geknipt
 * @returns {Promise<boolean>}
 */
async function log(projectCode, soort, opts = {}) {
  try {
    const tenant = String(projectCode || '').trim();
    if (!tenant) return false;

    if (SOORTEN.indexOf(soort) === -1) {
      console.warn('[activiteit] onbekende soort geweigerd:', soort);
      return false;
    }

    if (!(await available())) return false;

    const ruw = opts && Object.prototype.hasOwnProperty.call(opts, 'details') ? opts.details : undefined;
    const veilig = veiligeDetails(ruw === undefined ? {} : ruw);
    let detailsTekst = '';
    try { detailsTekst = JSON.stringify(veilig === undefined ? {} : veilig); } catch (_) { detailsTekst = '{}'; }
    if (!detailsTekst) detailsTekst = '{}';
    if (detailsTekst.length > 2000) detailsTekst = detailsTekst.slice(0, 2000);

    const velden = {
      [F.event]:      eventId(),
      [F.project]:    tenant,
      [F.type]:       soort,
      [F.details]:    detailsTekst,
      [F.aangemaakt]: new Date().toISOString(),
    };
    if (opts.leadId)       velden[F.leadId]       = String(opts.leadId).slice(0, 100);
    if (opts.voertuigCode) velden[F.voertuigCode] = String(opts.voertuigCode).slice(0, 24);
    if (opts.afspraakId)   velden[F.afspraakId]   = String(opts.afspraakId).slice(0, 100);

    const r = await atFetch(TABEL, { method: 'POST', body: JSON.stringify({ fields: velden, typecast: true }) });
    if (!r.ok) {
      console.warn('[activiteit] loggen mislukt:', r.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[activiteit] loggen exception (genegeerd, dit mag niets blokkeren):', e && e.message);
    return false;
  }
}

/**
 * De recentste activiteit van één dealer opvragen. Fail-soft -> [].
 *
 * @param {string} projectCode
 * @param {object} [opties]
 * @param {number} [opties.limiet=50]
 * @param {string[]} [opties.soorten]  filter, alleen bekende SOORTEN tellen mee
 */
async function lijst(projectCode, opties = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) return [];
  try {
    if (!(await available())) return [];

    const limiet = Math.max(1, Math.min(200, Number(opties.limiet) || 50));
    const soorten = Array.isArray(opties.soorten)
      ? opties.soorten.filter((s) => SOORTEN.indexOf(s) !== -1)
      : null;

    const delen = [`{${F.project}}="${escapeFormula(tenant)}"`];
    if (soorten && soorten.length) {
      delen.push('OR(' + soorten.map((s) => `{${F.type}}="${escapeFormula(s)}"`).join(', ') + ')');
    }
    const formule = encodeURIComponent(delen.length > 1 ? `AND(${delen.join(', ')})` : delen[0]);

    const r = await atFetch(
      `${TABEL}?filterByFormula=${formule}&pageSize=${limiet}`
      + `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(F.aangemaakt)}&sort%5B0%5D%5Bdirection%5D=desc`
    );
    if (!r.ok) return [];
    const d = await r.json();
    const records = (d.records || []).slice(0, limiet);

    const uit = [];
    for (const rec of records) {
      const f = rec.fields || {};
      /* De formule filtert al op tenant. Nog een keer, want dit is de plek
         waar een fout betekent dat dealer A de activiteit van dealer B ziet. */
      if (String(f[F.project] || '').trim() !== tenant) continue;

      let details = {};
      try { details = f[F.details] ? JSON.parse(f[F.details]) : {}; } catch (_) { details = {}; }

      uit.push({
        id:           rec.id,
        soort:        String(f[F.type] || ''),
        leadId:       String(f[F.leadId] || ''),
        voertuigCode: String(f[F.voertuigCode] || ''),
        afspraakId:   String(f[F.afspraakId] || ''),
        details,
        at:           String(f[F.aangemaakt] || ''),
      });
    }
    uit.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    return uit;
  } catch (e) {
    console.warn('[activiteit] lijst mislukt:', e && e.message);
    return [];
  }
}

module.exports = {
  TABEL,
  F,
  SOORTEN,
  ACTIE_STATUSSEN,
  configured,
  available,
  _resetAvailability, onbeschikbaarReden,
  veiligeDetails,
  actieVelden,
  log,
  lijst,
};
