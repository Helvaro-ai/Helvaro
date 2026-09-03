'use strict';
/*
 * CRM -- welke koppeling heeft DEZE klant, en met welke sleutels.
 *
 * -- Waar het staat -----------------------------------------------------------
 * In een veld "CRM Koppelingen" op de Client Config-rij (tblPidTrwGRzRt4LZ),
 * als een JSON-blob. Eén veld voor alle vijf de CRM's, niet vijf velden: elke
 * leverancier vraagt om andere sleutels (HubSpot één token, Salesforce een
 * client id + secret + domein, Pipedrive een token + bedrijfsdomein), en dat
 * uitspreiden over losse kolommen levert een schema op dat bij elke nieuwe
 * adapter opnieuw moet veranderen.
 *
 * -- Dat veld bestaat nog NIET op het Airtable-schema --------------------------
 * Bewust. Airtable laat een onbekend veld gewoon weg uit `fields`, dus lezen
 * geeft "geen koppeling" -- precies het goede antwoord voor elke klant die er
 * geen heeft. Schrijven is het probleem: Airtable weigert dan de HELE PATCH met
 * een 422 (zie CLAUDE.md). Daarom geeft schrijven hier een BENOEMDE fout terug
 * en niet stilzwijgend `ok`. Een koppelscherm dat "verbonden!" toont terwijl er
 * niets is opgeslagen is de ergste uitkomst die dit bestand kan hebben.
 *
 * De eigenaar moet dus één keer een veld aanmaken:
 *     Naam:  CRM Koppelingen
 *     Type:  Long text
 * Daarna werkt alles. Tot dan zegt het scherm eerlijk wat er ontbreekt.
 *
 * -- Versleuteld, met dezelfde regel als de Google-tokens ----------------------
 * Wat hier in staat geeft schrijftoegang tot het CRM van een makelaarskantoor.
 * Dat is minstens zo gevoelig als het Google-refreshtoken in api/_gcal.js, en
 * het volgt dezelfde regel: AES-256-GCM, en NOOIT een standaardsleutel. Is er
 * geen sleutel gezet, dan weigert deze module -- opslaan met een raadbare
 * sleutel is slechter dan niet opslaan.
 */

const crypto = require('crypto');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const F_PROJECT     = 'fldN4dL0bGgfBOXwM';   // Project Code
const F_CRM         = 'CRM Koppelingen';     // bestaat nog niet -- alleen op naam
const F_KLANTNAAM   = 'fldAnB848Sr5jl6dq';   // Client Name
const AT_TIMEOUT_MS = 10_000;

class ConfigError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ConfigError';
    this.code = code || 'crm_config_error';
  }
}

async function atFetch(url, opts) {
  return fetch(url, { ...opts, signal: (opts && opts.signal) || AbortSignal.timeout(AT_TIMEOUT_MS) });
}

function escapeFormula(val) {
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/* ── Versleuteling ──────────────────────────────────────────────────────────
   Eigen sleutelnaamruimte (':crm-cred-v1'), zodat een gelekt Google-token niet
   ook de CRM-sleutels opent en andersom: dezelfde basis, maar een andere
   afgeleide sleutel per doel. */
function encKey() {
  const basis = process.env.CRM_TOKEN_KEY || process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!basis) {
    throw new ConfigError(
      'Geen CRM_TOKEN_KEY / SESSION_SECRET / ADMIN_KEY gezet -- CRM-sleutels worden niet met een standaardsleutel opgeslagen.',
      'geen_sleutel',
    );
  }
  return crypto.createHash('sha256').update(String(basis) + ':crm-cred-v1').digest();
}

function versleutel(plat) {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct  = Buffer.concat([c.update(String(plat), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function ontsleutel(opgeslagen) {
  const s = String(opgeslagen || '');
  if (!s.startsWith('v1:')) return '';
  try {
    const rauw = Buffer.from(s.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), rauw.subarray(0, 12));
    d.setAuthTag(rauw.subarray(12, 28));
    return Buffer.concat([d.update(rauw.subarray(28)), d.final()]).toString('utf8');
  } catch (err) {
    /* Een sleutel die niet opengaat is bijna altijd een GEWIJZIGDE
       SESSION_SECRET, niet corruptie. Dat is het waard om te zien in de logs:
       de klant merkt het als "mijn CRM is ineens losgekoppeld" en dan wil je
       weten dat dat komt door een sleutelrotatie en niet door hun CRM. */
    console.error('[crm] ontsleutelen mislukt (sleutel gewijzigd?):', err && err.message);
    return '';
  }
}

/* ── De klantrij ───────────────────────────────────────────────────────────── */
async function klantRij(projectCode) {
  const code = String(projectCode || '').trim();
  /* Leeg leest verderop als "admin, toon alles" -- zie CLAUDE.md. Hier is dat
     een harde fout, nooit een standaard. */
  if (!code) throw new ConfigError('Geen projectcode.', 'geen_tenant');
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  if (!BASE_ID || !TOKEN) throw new ConfigError('Airtable is niet geconfigureerd.', 'geen_airtable');

  const formula = encodeURIComponent(`{${F_PROJECT}}="${escapeFormula(code)}"`);
  const r = await atFetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!r.ok) throw new ConfigError(`Klantrij ophalen mislukt (HTTP ${r.status}).`, 'airtable_fout');
  const rij = ((await r.json()).records || [])[0];
  if (!rij) throw new ConfigError('Klantrecord niet gevonden.', 'geen_klant');
  return rij;
}

/**
 * Alle koppelingen van één klant, ontsleuteld.
 *
 * @returns {Promise<{koppelingen: object, kantoor: string, velden: object, recordId: string}>}
 *          `koppelingen` is `{ hubspot: {cred, verbondenOp, account}, ... }`,
 *          leeg als er niets is -- wat het normale geval is.
 */
async function lees(projectCode) {
  const rij = await klantRij(projectCode);
  const rauw = rij.fields[F_CRM];
  let koppelingen = {};
  if (rauw) {
    const plat = ontsleutel(rauw);
    if (plat) {
      try {
        const p = JSON.parse(plat);
        if (p && typeof p === 'object' && !Array.isArray(p)) koppelingen = p;
      } catch (_) {
        /* Onleesbaar na ontsleuteling betekent dat er ooit iets anders in dat
           veld is gezet. Behandelen als "geen koppeling" en doorgaan: de klant
           kan opnieuw verbinden, en een exception hier zou zijn hele
           instellingenscherm zwart maken. */
        console.error('[crm] koppelingen-JSON onleesbaar voor', projectCode);
      }
    }
  }
  return {
    koppelingen,
    kantoor:  String(rij.fields[F_KLANTNAAM] || rij.fields['Client Name'] || ''),
    velden:   rij.fields,
    recordId: rij.id,
  };
}

/** Alleen de credentials van één CRM, of null. */
async function leesEen(projectCode, crm) {
  const { koppelingen } = await lees(projectCode);
  const k = koppelingen[crm];
  return k && k.cred ? k : null;
}

async function bewaar(projectCode, recordId, koppelingen) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  /* Eén veld in één PATCH. Dat is geen stijlkeuze: staat "CRM Koppelingen" nog
     niet op het schema, dan weigert Airtable de hele request, en die 422 mag
     geen ANDER veld meeslepen (CLAUDE.md 4.2). Deze PATCH raakt daarom nooit
     iets anders aan. */
  const r = await atFetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [F_CRM]: versleutel(JSON.stringify(koppelingen)) } }),
  });
  if (r.ok) return;

  const detail = await r.text().catch(() => '');
  if (r.status === 422 && /unknown field|UNKNOWN_FIELD_NAME/i.test(detail)) {
    throw new ConfigError(
      `Het veld "${F_CRM}" bestaat nog niet in Airtable. Maak het aan op de tabel `
      + 'Client Config als type "Long text" -- daarna werkt koppelen meteen.',
      'veld_ontbreekt',
    );
  }
  console.error('[crm] koppelingen opslaan mislukt:', r.status, detail.slice(0, 300));
  throw new ConfigError('Opslaan van de koppeling is mislukt.', 'opslaan_mislukt');
}

/**
 * Eén koppeling opslaan (of overschrijven).
 * @param {object} extra  bijv. { account: 'Kantoor Peeters (12345)' } -- wat de
 *                        klant in het scherm ziet als bewijs dat het de goede
 *                        omgeving is.
 */
async function schrijf(projectCode, crm, cred, extra = {}) {
  const { koppelingen, recordId } = await lees(projectCode);
  koppelingen[crm] = {
    cred,
    account:     String(extra.account || ''),
    verbondenOp: new Date().toISOString(),
  };
  await bewaar(projectCode, recordId, koppelingen);
  return koppelingen[crm];
}

/** Eén koppeling weghalen. Idempotent: al weg is ook goed. */
async function verwijder(projectCode, crm) {
  const { koppelingen, recordId } = await lees(projectCode);
  if (!koppelingen[crm]) return false;
  delete koppelingen[crm];
  await bewaar(projectCode, recordId, koppelingen);
  return true;
}

module.exports = {
  lees, leesEen, schrijf, verwijder,
  versleutel, ontsleutel,
  ConfigError, CLIENTS_TABLE, F_CRM,
};
