'use strict';
/*
 * De ene vorm voor "hoe staat deze koppeling ervoor" -- deliverable
 * "Integration status contract" (platform-integriteit pass, brief §34-35 §42).
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────
 * Vóór dit bestand had elke koppeling zijn eigen vorm: Google Agenda gaf
 * {connected, needsReauth, email}, een CRM-adapter {naam, account,
 * verbondenOp, laatsteFout}, Drive {configured, gekoppeld, email}, het eigen
 * WhatsApp-nummer {beschikbaar, gekoppeld, nummer}. Een schermonderdeel dat ze
 * naast elkaar wil tonen (of straks: een systeemgezondheidspaneel) moest vier
 * keer een ander veld lezen voor "is dit stuk?" -- en dat is precies waar een
 * koppeling die BROKEN is er als "connected" uitziet, omdat niemand het
 * needsReauth-veld las op de ene plek waar het toevallig een andere naam had.
 *
 * Dit bestand normaliseert naar ÉÉN vorm, brief §34/35:
 *   { id, status, since, lastOk, lastError: {when, safeMessage}, action }
 *
 *   status: 'connected' | 'disconnected' | 'expired' | 'error' | 'not_configured'
 *   action: 'connect' | 'reconnect' | 'none'
 *
 * ── "TRUE", niet "er staat een sleutel" ──────────────────────────────────
 * Elke van...()-functie hieronder is een normalisator, geen prober: hij
 * vertaalt wat de onderliggende module (die WEL een live check deed, waar dat
 * goedkoop is -- zie api/leads.js gcal-status, api/_drive.js status()) al
 * teruggaf. Nooit "connected" tonen omdat er ooit een sleutel is opgeslagen
 * -- dat was precies de aanleiding voor deze deliverable, zie CLAUDE.md
 * "nooit connected tonen bij een kapotte koppeling".
 *
 * ── Nooit een sleutel of foutdetail van de leverancier naar de klant ──────
 * lastError.safeMessage is ALTIJD onze eigen bewoording (een korte, vaste
 * zin per situatie), nooit de rauwe tekst van Google/HubSpot/Meta. Zie
 * api/_crm/http.js voor dezelfde afspraak aan de CRM-kant.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop; aangeroepen vanuit api/leads.js (tenant-koppelingen)
 * en api/admin.js (Drive, die admin-only is -- geen enkele tenant koppelt
 * zelf Helvaro's interne Drive).
 */

const STATUSSEN = Object.freeze(['connected', 'disconnected', 'expired', 'error', 'not_configured']);
const ACTIES = Object.freeze(['connect', 'reconnect', 'none']);

/** Klemt op de toegestane waarden -- een onbekende status/actie is een
 * programmeerfout hier, geen reden om iets verzonnens naar het scherm te
 * sturen. */
function normaliseer(o) {
  const status = STATUSSEN.indexOf(o.status) !== -1 ? o.status : 'error';
  const action = ACTIES.indexOf(o.action) !== -1 ? o.action : (status === 'connected' ? 'none' : 'connect');
  const uit = {
    id: String(o.id || ''),
    label: String(o.label || o.id || ''),
    status,
    since: o.since ? String(o.since) : null,
    lastOk: o.lastOk ? String(o.lastOk) : null,
    lastError: null,
    action,
  };
  if (o.lastError && (o.lastError.safeMessage || o.lastError.when)) {
    uit.lastError = {
      when: o.lastError.when ? String(o.lastError.when) : null,
      /* Geknipt: een defensieve grens, niet omdat we hier lange leveranciers-
         tekst verwachten -- die hoort hier al nooit in te komen. */
      safeMessage: String(o.lastError.safeMessage || '').slice(0, 300),
    };
  }
  return uit;
}

/**
 * Google Agenda, per tenant. Verwacht wat api/leads.js gcal-status al ophaalt
 * (live geprobeerd, zie de opmerking daar over waarom "er staat een token"
 * niet hetzelfde is als "het token werkt").
 *
 * @param {object} o
 * @param {boolean} o.configured   env-vars staan er (GOOGLE_CLIENT_ID etc.)
 * @param {boolean} o.connected    er staat een refresh-token opgeslagen
 * @param {boolean} o.needsReauth  het token is echt geprobeerd en faalde met invalid_grant
 * @param {string}  [o.email]
 * @param {string}  [o.since]      wanneer gekoppeld, indien bekend
 */
function vanGcal(o) {
  if (!o || !o.configured) {
    return normaliseer({ id: 'gcal', label: 'Google Agenda', status: 'not_configured', action: 'none' });
  }
  if (!o.connected) {
    return normaliseer({ id: 'gcal', label: 'Google Agenda', status: 'disconnected', action: 'connect' });
  }
  if (o.needsReauth) {
    return normaliseer({
      id: 'gcal', label: 'Google Agenda', status: 'expired', action: 'reconnect',
      since: o.since || null,
      lastError: { when: new Date().toISOString(), safeMessage: 'int.gcal.expired' },
    });
  }
  return normaliseer({
    id: 'gcal', label: 'Google Agenda', status: 'connected', action: 'none',
    since: o.since || null, lastOk: new Date().toISOString(),
  });
}

/**
 * Eén CRM-adapter, uit api/_crm/index.js status(). Wordt per adapter
 * aangeroepen (adapters() geeft de volledige lijst, verbonden() alleen wat
 * gekoppeld is) -- zie integratiesVoorTenant() hieronder voor de samenvoeging.
 */
function vanCrmAdapter(naam, label, verbondenEntry) {
  if (!verbondenEntry) {
    return normaliseer({ id: `crm:${naam}`, label, status: 'disconnected', action: 'connect' });
  }
  if (verbondenEntry.laatsteFout) {
    return normaliseer({
      id: `crm:${naam}`, label, status: 'error', action: 'reconnect',
      since: verbondenEntry.verbondenOp || null,
      lastError: { when: new Date().toISOString(), safeMessage: 'int.crm.syncFailed' },
    });
  }
  return normaliseer({
    id: `crm:${naam}`, label, status: 'connected', action: 'none',
    since: verbondenEntry.verbondenOp || null, lastOk: verbondenEntry.verbondenOp || null,
  });
}

/** Alle CRM-adapters voor één tenant, in de eenheidsvorm. */
function crmVoorTenant(crmStatusResult) {
  const beschikbaar = (crmStatusResult && crmStatusResult.beschikbaar) || [];
  const verbonden = (crmStatusResult && crmStatusResult.verbonden) || [];
  const bijNaam = {};
  for (const v of verbonden) bijNaam[v.naam] = v;
  return beschikbaar
    .filter((a) => a.beschikbaar !== false)
    .map((a) => vanCrmAdapter(a.naam, a.label, bijNaam[a.naam]));
}

/**
 * Drive -- ADMIN-ONLY (Helvaro's eigen interne map, geen tenant-koppeling).
 * Verwacht de uitbreiding van api/_drive.js status() die dit pass toevoegt:
 * naast de bestaande velden ook `verbonden` (live geprobeerd) en optioneel
 * `laatsteFoutCode`.
 */
function vanDrive(o) {
  if (!o || !o.configured) {
    return normaliseer({ id: 'drive', label: 'Google Drive (Helvaro)', status: 'not_configured', action: 'none' });
  }
  if (!o.gekoppeld) {
    return normaliseer({ id: 'drive', label: 'Google Drive (Helvaro)', status: 'disconnected', action: 'connect' });
  }
  if (o.verbonden === false) {
    return normaliseer({
      id: 'drive', label: 'Google Drive (Helvaro)', status: 'expired', action: 'reconnect',
      lastError: { when: new Date().toISOString(), safeMessage: o.laatsteFoutCode || 'token_verlopen' },
    });
  }
  return normaliseer({
    id: 'drive', label: 'Google Drive (Helvaro)', status: 'connected', action: 'none',
    lastOk: o.laatsteSync || null,
  });
}

/**
 * Het eigen WhatsApp-nummer (Embedded Signup), per tenant. Zonder eigen
 * nummer gebruikt de klant gewoon Helvaro's gedeelde nummer -- dat is een
 * geldige, normale staat en GEEN storing. Vandaar 'disconnected' met actie
 * 'connect' (een aanbod, geen fout) in plaats van 'error'.
 *
 * @param {object} o
 * @param {boolean} o.beschikbaar  de functie staat aan (env-vars aanwezig)
 * @param {boolean} o.gekoppeld    er is een eigen nummer-id opgeslagen
 * @param {object|null} o.nummer   resultaat van getPhoneInfo(), of null als
 *                                 het ophalen mislukte terwijl er wel een
 *                                 nummer-id staat (= een echte storing)
 */
function vanWaEigenNummer(o) {
  if (!o || !o.beschikbaar) {
    return normaliseer({ id: 'wa_eigen_nummer', label: 'Eigen WhatsApp-nummer', status: 'not_configured', action: 'none' });
  }
  if (!o.gekoppeld) {
    return normaliseer({ id: 'wa_eigen_nummer', label: 'Eigen WhatsApp-nummer', status: 'disconnected', action: 'connect' });
  }
  if (!o.nummer) {
    return normaliseer({
      id: 'wa_eigen_nummer', label: 'Eigen WhatsApp-nummer', status: 'error', action: 'reconnect',
      lastError: { when: new Date().toISOString(), safeMessage: 'int.wa.unavailable' },
    });
  }
  return normaliseer({ id: 'wa_eigen_nummer', label: 'Eigen WhatsApp-nummer', status: 'connected', action: 'none', lastOk: new Date().toISOString() });
}

module.exports = {
  STATUSSEN, ACTIES,
  normaliseer,
  vanGcal,
  vanCrmAdapter,
  crmVoorTenant,
  vanDrive,
  vanWaEigenNummer,
};
