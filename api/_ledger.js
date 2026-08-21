'use strict';
/*
 * Het creditgrootboek -- elke beweging is een regel.
 *
 * -- Waarom dit bestaat --------------------------------------------------------
 * Credits waren tot nu een TELLER: "Credits Used = 1240", plus een JSON-blob
 * met een totaal per onderdeel. Dat werkt tot iemand vraagt waar die 1240
 * vandaan komen. Dan is er geen antwoord, want er is niets bewaard: geen
 * moment, geen lead, geen model. En terugbetalen kan al helemaal niet -- je
 * kunt een getal verlagen, maar niet uitleggen waarom.
 *
 * Vanaf hier is elke beweging een REGEL met een datum, een reden en een
 * bedrag. De teller blijft bestaan (dat is de snelle weg voor "mag dit nog?"),
 * maar hij is niet langer het enige geheugen.
 *
 *   toewijzing  +2000   maandelijkse toekenning
 *   verbruik      -20   whatsapp_conversation, lead recXXXX
 *   verbruik      -50   image_generation
 *   terugbetaling +50   beeldgeneratie mislukt na afschrijving
 *   aankoop     +1000   bijgekochte credits
 *   correctie     -30   handmatig, door de eigenaar
 *
 * -- Wat dit NIET is -----------------------------------------------------------
 * Geen vervanger van api/_credits.js. Dat blijft bepalen OF er ruimte is en
 * houdt de teller bij; dit boekt op wat er gebeurde. Zo blijft het bestaande
 * gedrag intact en komt de geschiedenis erbij in plaats van ervoor in de plaats.
 *
 * -- Airtable kent geen transacties --------------------------------------------
 * Dat is een echte beperking en geen detail. "Kijk of er ruimte is" en "schrijf
 * af" zijn twee losse aanroepen; twee verzoeken tegelijk kunnen allebei ruimte
 * zien. api/_credits.js zet aanroepen per klant achter elkaar binnen één
 * instance, wat de praktijkgevallen dekt, maar twee instances tegelijk kan het
 * niet uitsluiten. Wat dit grootboek daaraan toevoegt is niet dat het niet meer
 * kan, maar dat je het ACHTERAF ZIET -- en met een referentie kun je een
 * dubbele boeking voorkomen.
 *
 * -- Tenant, altijd ------------------------------------------------------------
 * Elke functie neemt projectCode als eerste argument en elke query filtert
 * erop. Een klant hoort de boekingen van een ander nooit te zien.
 *
 * -- DE TABEL AANMAKEN ---------------------------------------------------------
 * Eén tabel in dezelfde Airtable-base, met de naam `credit_transactions`:
 *
 *   Transaction ID   Single line text   uniek, door de code gezet
 *   Project Code     Single line text   de klant. Hier filtert ALLES op.
 *   Type             Single select      allocation, usage, purchase, refund, adjustment
 *   Credits          Number             GETEKEND: verbruik is negatief
 *   Feature          Single line text   whatsapp_conversation, image_generation, ...
 *   Reference        Single line text   idempotentiesleutel, mag leeg
 *   Note             Long text
 *   Meta             Long text          JSON: model, leadId, tokens, ...
 *   Created At       Single line text   ISO-datum
 *
 * Bestaat de tabel niet, dan werkt Helvaro gewoon door: credits worden dan
 * geteld zoals altijd, alleen zonder geschiedenis. Zie available().
 */

const TABEL = 'credit_transactions';

const F = Object.freeze({
  id:        'Transaction ID',
  project:   'Project Code',
  type:      'Type',
  credits:   'Credits',
  feature:   'Feature',
  referentie:'Reference',
  notitie:   'Note',
  meta:      'Meta',
  aangemaakt:'Created At',
});

/* De soorten beweging. Het TEKEN hoort bij de soort en wordt hier afgedwongen:
   een verbruik dat per ongeluk positief geboekt wordt, geeft een klant gratis
   credits en dat merk je pas bij de jaarrekening. */
const TYPE = Object.freeze({
  TOEWIJZING:    'allocation',   // maandelijkse toekenning
  VERBRUIK:      'usage',        // een AI-actie
  AANKOOP:       'purchase',     // bijgekocht
  TERUGBETALING: 'refund',       // iets ging mis NA het afschrijven
  CORRECTIE:     'adjustment',   // met de hand, door de eigenaar
});

const ALLE_TYPES = Object.freeze(Object.values(TYPE));

/** Welke soorten credits KOSTEN (negatief) en welke ze GEVEN (positief). */
const NEGATIEF = Object.freeze([TYPE.VERBRUIK]);

class LedgerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LedgerError';
    this.code = code || 'ledger_error';
  }
}

/* ── Verbinding ──────────────────────────────────────────────────────────── */
function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

function escapeFormula(val) {
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(pathAndQuery, options = {}) {
  if (!configured()) throw new LedgerError('Airtable niet geconfigureerd.', 'not_configured');
  const headers = Object.assign(
    { Authorization: `Bearer ${process.env.API_AIRTABLE}` },
    options.body ? { 'Content-Type': 'application/json' } : {},
    options.headers || {}
  );
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.LEDGER_TIMEOUT_MS || 8000));
  try {
    return await fetch(
      `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pathAndQuery}`,
      Object.assign({}, options, { headers, signal: ctrl.signal })
    );
  } finally {
    clearTimeout(t);
  }
}

let _beschikbaar = null;

async function available() {
  if (_beschikbaar !== null) return _beschikbaar;
  if (!configured()) { _beschikbaar = false; return false; }
  try {
    const r = await atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      console.warn(`[grootboek] tabel "${TABEL}" niet gevonden (HTTP ${r.status}) — `
        + 'credits worden geteld maar niet geboekt. Zie de kop van api/_ledger.js.');
    }
  } catch (e) {
    console.warn('[grootboek] Airtable onbereikbaar:', e && e.message);
    _beschikbaar = false;
  }
  return _beschikbaar;
}

function _resetAvailability() { _beschikbaar = null; }

/* ── Vertalen ────────────────────────────────────────────────────────────── */
function getal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function vanRecord(rec) {
  const f = (rec && rec.fields) || {};
  let meta = null;
  try { meta = f[F.meta] ? JSON.parse(f[F.meta]) : null; } catch (_) { meta = null; }
  return {
    id:          rec && rec.id,
    transactieId:String(f[F.id] || '').trim(),
    projectCode: String(f[F.project] || '').trim(),
    type:        String(f[F.type] || '').trim(),
    credits:     getal(f[F.credits]),
    feature:     String(f[F.feature] || '').trim(),
    referentie:  String(f[F.referentie] || '').trim(),
    notitie:     String(f[F.notitie] || '').trim(),
    meta,
    aangemaakt:  String(f[F.aangemaakt] || '').trim(),
  };
}

/** Een id dat leesbaar is in Airtable en toch niet botst. */
function nieuwId(projectCode, type) {
  const t = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const r = Math.random().toString(36).slice(2, 7);
  return String(projectCode).slice(0, 12) + '-' + String(type).slice(0, 4) + '-' + t + '-' + r;
}

/* ── Schrijven ───────────────────────────────────────────────────────────── */

/**
 * Eén beweging vastleggen.
 *
 * Faalt NOOIT hard: het grootboek mag een AI-antwoord of een boeking niet
 * tegenhouden. Lukt het schrijven niet, dan komt er een logregel en gaat de
 * aanroeper gewoon door -- de teller in api/_credits.js is dan nog steeds
 * bijgewerkt, alleen ontbreekt de geschiedenisregel.
 *
 * @param {object} o
 * @param {string} o.projectCode  uit de geverifieerde sessie
 * @param {string} o.type         een van TYPE
 * @param {number} o.credits      ALTIJD positief opgegeven; het teken volgt uit type
 * @param {string} [o.feature]
 * @param {string} [o.reference]  idempotentiesleutel: tweemaal dezelfde = één boeking
 * @param {string} [o.note]
 * @param {object} [o.meta]
 * @returns {Promise<object|null>} de boeking, of null als er niets geboekt is
 */
async function record({ projectCode, type, credits, feature = '', reference = '', note = '', meta = null } = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) {
    console.warn('[grootboek] boeking zonder projectcode geweigerd');
    return null;
  }
  if (ALLE_TYPES.indexOf(type) === -1) {
    console.warn('[grootboek] onbekend type:', type);
    return null;
  }
  const aantal = Math.abs(Math.round(Number(credits) || 0));
  if (aantal <= 0) return null;

  if (!(await available())) return null;

  /* Idempotentie. Twee keer dezelfde referentie is één boeking -- dat is wat
     een herhaalde aanroep na een time-out onschadelijk maakt. Zonder deze
     controle betaalt een klant twee keer voor één beeld. */
  const ref = String(reference || '').trim().slice(0, 120);
  if (ref) {
    try {
      const bestaand = await zoekOpReferentie(tenant, ref);
      if (bestaand) return bestaand;
    } catch (e) {
      /* Kunnen we niet controleren, dan liever doorschrijven dan de boeking
         verliezen: een dubbele regel is zichtbaar en te herstellen, een
         ontbrekende regel niet. */
      console.warn('[grootboek] referentiecontrole mislukt, boeking gaat door:', e && e.message);
    }
  }

  const teken = NEGATIEF.indexOf(type) !== -1 ? -1 : 1;
  const velden = {};
  velden[F.id]         = nieuwId(tenant, type);
  velden[F.project]    = tenant;
  velden[F.type]       = type;
  velden[F.credits]    = teken * aantal;
  velden[F.feature]    = String(feature || '').slice(0, 80);
  velden[F.referentie] = ref;
  velden[F.notitie]    = String(note || '').slice(0, 2000);
  velden[F.aangemaakt] = new Date().toISOString();
  if (meta) {
    try { velden[F.meta] = JSON.stringify(meta).slice(0, 8000); } catch (_) { /* laat weg */ }
  }

  try {
    const r = await atFetch(TABEL, { method: 'POST', body: JSON.stringify({ fields: velden }) });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error(`[grootboek] boeking mislukt (HTTP ${r.status}) voor ${tenant}/${type}:`, txt.slice(0, 200));
      return null;
    }
    return vanRecord(await r.json());
  } catch (err) {
    console.error('[grootboek] boeking wierp een fout:', err && err.message);
    return null;
  }
}

async function zoekOpReferentie(projectCode, referentie) {
  const formule = encodeURIComponent(
    `AND({${F.project}}="${escapeFormula(projectCode)}", {${F.referentie}}="${escapeFormula(referentie)}")`
  );
  const r = await atFetch(`${TABEL}?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) throw new LedgerError('referentie opzoeken mislukt', 'read_failed');
  const d = await r.json();
  const rec = (d.records || [])[0];
  return rec ? vanRecord(rec) : null;
}

/* ── Lezen ───────────────────────────────────────────────────────────────── */

/**
 * De boekingen van één klant, nieuwste eerst.
 * @param {string} projectCode
 * @param {object} [opties] { limit, sinds }  sinds = ISO-datum
 */
async function list(projectCode, opties = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new LedgerError('Grootboek opvragen zonder projectcode.', 'no_tenant');
  if (!(await available())) return [];

  const limiet = Math.max(1, Math.min(500, Number(opties.limit) || 50));
  const delen = [`{${F.project}}="${escapeFormula(tenant)}"`];
  if (opties.sinds) delen.push(`IS_AFTER({${F.aangemaakt}}, "${escapeFormula(opties.sinds)}")`);
  const formule = encodeURIComponent(delen.length > 1 ? `AND(${delen.join(', ')})` : delen[0]);

  const uit = [];
  let offset = '';
  /* Paginatie, want Airtable geeft hoogstens 100 per pagina. Vijf rondes is
     het dak: daarboven hoort een klant een export te krijgen, geen scherm. */
  for (let ronde = 0; ronde < 5 && uit.length < limiet; ronde++) {
    const r = await atFetch(
      `${TABEL}?filterByFormula=${formule}&pageSize=100`
      + `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(F.aangemaakt)}&sort%5B0%5D%5Bdirection%5D=desc`
      + (offset ? '&offset=' + encodeURIComponent(offset) : '')
    );
    if (!r.ok) throw new LedgerError('Boekingen konden niet opgehaald worden.', 'read_failed');
    const d = await r.json();
    for (const rec of (d.records || [])) uit.push(vanRecord(rec));
    if (!d.offset) break;
    offset = d.offset;
  }

  /* Riem en bretels: de formule filtert al op tenant, maar dit is de plek waar
     een fout betekent dat klant A de boekingen van klant B leest. */
  return uit.filter((t) => t.projectCode === tenant).slice(0, limiet);
}

/**
 * Optellen per soort en per onderdeel, over een periode.
 * @returns {{ toegewezen, verbruikt, gekocht, terugbetaald, gecorrigeerd, saldo, perFeature, aantal }}
 */
async function totals(projectCode, opties = {}) {
  const regels = await list(projectCode, { limit: 500, sinds: opties.sinds });
  const uit = {
    toegewezen: 0, verbruikt: 0, gekocht: 0, terugbetaald: 0, gecorrigeerd: 0,
    saldo: 0, perFeature: {}, aantal: regels.length,
  };
  for (const t of regels) {
    uit.saldo += t.credits;
    if (t.type === TYPE.TOEWIJZING)         uit.toegewezen   += t.credits;
    else if (t.type === TYPE.VERBRUIK)      uit.verbruikt    += Math.abs(t.credits);
    else if (t.type === TYPE.AANKOOP)       uit.gekocht      += t.credits;
    else if (t.type === TYPE.TERUGBETALING) uit.terugbetaald += t.credits;
    else if (t.type === TYPE.CORRECTIE)     uit.gecorrigeerd += t.credits;

    if (t.type === TYPE.VERBRUIK && t.feature) {
      uit.perFeature[t.feature] = (uit.perFeature[t.feature] || 0) + Math.abs(t.credits);
    }
  }
  return uit;
}

/* ── Gemak ───────────────────────────────────────────────────────────────── */

/** Een mislukte actie terugdraaien. De reden is verplicht: een terugbetaling
    zonder uitleg is niet na te vertellen als een klant ernaar vraagt. */
async function refund({ projectCode, credits, reason, feature = '', reference = '' } = {}) {
  if (!String(reason || '').trim()) {
    console.warn('[grootboek] terugbetaling zonder reden geweigerd');
    return null;
  }
  return record({
    projectCode, type: TYPE.TERUGBETALING, credits, feature,
    reference, note: String(reason),
  });
}

module.exports = {
  TABEL, F, TYPE, ALLE_TYPES, LedgerError,
  available, configured, _resetAvailability,
  record, list, totals, refund, zoekOpReferentie, vanRecord, nieuwId,
};
