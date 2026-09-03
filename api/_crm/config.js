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
 * -- Het veld bestaat, en de foutmelding blijft staan -------------------------
 * "CRM Koppelingen" is op 2026-09-03 aangemaakt op de productiebase
 * (Lead Qualification System, tabel Client Config, Long text, id
 * fld5UwV0QS8m7UAHF). Geverifieerd tegen het echte schema, niet aangenomen.
 *
 * De afhandeling van een ONTBREKEND veld blijft er bewust in staan. Airtable
 * laat een onbekend veld weg uit `fields`, dus LEZEN geeft dan "geen
 * koppeling" -- precies goed. SCHRIJVEN is het probleem: Airtable weigert de
 * HELE PATCH met een 422 (CLAUDE.md 4.2). Dat pad geldt nog voor elke andere
 * base: een kopie voor een test, een tweede omgeving, of een base die uit een
 * back-up is teruggezet. Daar hoort een benoemde fout te komen en geen stille
 * `ok` -- een koppelscherm dat "verbonden!" toont terwijl er niets is
 * opgeslagen is de ergste uitkomst die dit bestand kan hebben.
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
/* Veld-ID eerst, naam als terugval -- de conventie uit api/_leads-read.js:
   "Airtable field IDs are stable across renames; names are not." Het veld is op
   2026-09-03 aangemaakt op de echte base (Lead Qualification System) en heeft
   sindsdien een vast id. De naam blijft als terugval staan zodat een base die
   dit veld nog niet heeft (een kopie, een testbase) niet stilletjes anders
   werkt dan de productiebase. */
const F_CRM_ID      = 'fld5UwV0QS8m7UAHF';  // CRM Koppelingen (Long text)
const F_CRM         = 'CRM Koppelingen';
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
  const rauw = rij.fields[F_CRM_ID] || rij.fields[F_CRM];
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
    /* Schrijven op ID, niet op naam: hernoemt iemand het veld in Airtable, dan
       blijft opslaan werken in plaats van een 422 te geven die de klant als
       "koppelen mislukt" ziet. */
    body: JSON.stringify({ fields: { [F_CRM_ID]: versleutel(JSON.stringify(koppelingen)) } }),
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

/**
 * De laatste fout van één koppeling vastleggen -- of wissen.
 *
 * -- Waarom dit hier zit en niet per lead --------------------------------------
 * Een verlopen sleutel laat ELKE lead falen. Dat per lead wegschrijven geeft bij
 * een bulk van vijftig leads vijftig Airtable-schrijfacties die allemaal
 * hetzelfde zeggen. Eén regel op de koppeling zegt het even goed en is de plek
 * waar het scherm toch al kijkt.
 *
 * Alleen de aanroeper die het OVERZICHT heeft (de bulk-synchronisatie) roept dit
 * aan, en precies één keer. Het WhatsApp-pad doet het niet: dat ziet één lead en
 * kan niet weten of dit een incident is of een kapotte koppeling.
 *
 * @param {object|null} fout  { fout, code } om vast te leggen, of null om te wissen
 */
async function noteerFout(projectCode, crm, fout) {
  const { koppelingen, recordId } = await lees(projectCode);
  const k = koppelingen[crm];
  if (!k) return false;
  if (fout) {
    k.laatsteFout = {
      /* Alleen onze eigen, veilige tekst -- nooit `detail`, want daar staat het
         antwoord van de leverancier in en dat kan meesturen wat wij verstuurden. */
      fout: String(fout.fout || '').slice(0, 300),
      code: String(fout.code || ''),
      op:   new Date().toISOString(),
    };
  } else if (!k.laatsteFout) {
    return false;   // niets te wissen: geen schrijfactie
  } else {
    delete k.laatsteFout;
  }
  await bewaar(projectCode, recordId, koppelingen);
  return true;
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
  lees, leesEen, schrijf, verwijder, noteerFout,
  versleutel, ontsleutel,
  ConfigError, CLIENTS_TABLE, F_CRM, F_CRM_ID,
};
