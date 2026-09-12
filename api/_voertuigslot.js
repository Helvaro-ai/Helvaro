'use strict';
/*
 * Voertuigslot -- afspraakbescherming per voertuig, tegen een race die
 * Airtable zelf niet tegenhoudt.
 *
 * ── Het probleem in één zin ──────────────────────────────────────────────────
 * Airtable heeft geen transacties. Twee gesprekken die tegelijk "ja, boek de
 * proefrit" typen voor dezelfde auto kunnen allebei een record aanmaken
 * voordat de een van de ander weet -- precies het patroon dat
 * tests/dubbelboeking.test.js al blootlegde voor twee afspraken op hetzelfde
 * TIJDSTIP. Dit bestand is hetzelfde probleem voor twee afspraken op hetzelfde
 * VOERTUIG, wat bij een auto-dealer erger is: een proefrit dubbelboeken kost
 * een makelaar een agendaslot, een auto dubbelboeken kost een verkoper een
 * koper die voor niets naar de garage rijdt.
 *
 * ── De oplossing: schrijf eerst, verifieer daarna ────────────────────────────
 * Zonder transacties kan een schrijfactie zelf nooit "atomisch tegen een
 * andere schrijfactie" gemaakt worden. Wat wel kan: iedereen schrijft zijn
 * eigen record, en controleert ERNA of hij de enige was. Wie verliest (zijn
 * record is niet de vroegste) annuleert zichzelf. Dat is `bevestigClaim` --
 * het hoort ALTIJD na het aanmaken van de afspraak aangeroepen te worden, nooit
 * ervoor, want vóór het aanmaken is er nog niets om te verifiëren.
 *
 * ── Waarom fail-open bij een leesfout ────────────────────────────────────────
 * Als de verificatie zelf niet kan lezen (Airtable plat, timeout), dan is de
 * kans op een echte dubbele boeking klein en de kans dat we een geldige
 * afspraak onterecht annuleren bij een storing groot. Een klant die een
 * proefrit had geboekt en hem zomaar geannuleerd ziet worden omdat Airtable
 * hikte, is een slechtere uitkomst dan het zeldzame geval dat een race
 * ongezien blijft. Vandaar `{ ok: true, geverifieerd: false }`: de boeking
 * blijft staan, maar de aanroeper kan zien dat de race NIET uitgesloten is.
 *
 * ── Idempotentie ─────────────────────────────────────────────────────────────
 * `idempotentieSleutel` volgt hetzelfde patroon als de bestaande Appointment
 * ID-opbouw (PROJECT-JJMMDDUUMM in UTC): hetzelfde tijdstip voor hetzelfde
 * project geeft dezelfde basis. Het lead/voertuig-staartje erbij voorkomt dat
 * TWEE VERSCHILLENDE leads die toevallig op hetzelfde tijdstip boeken (twee
 * losse gesprekken, geen race) dezelfde sleutel krijgen en elkaar per ongeluk
 * lijken te dupliceren.
 *
 * ── Tenant, altijd ──────────────────────────────────────────────────────────
 * Elke functie neemt projectCode als eerste argument, uit de geverifieerde
 * sessie. Formule EN JS-controle, zoals overal in deze codebase.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const crypto = require('crypto');

const AIRTABLE_BASE  = process.env.BASE_AIRTABLE;
const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';

const F = Object.freeze({
  APPT_ID:    'Appointment ID',
  START:      'Start Time',
  CODE:       'Project Code',
  STATUS:     'Status',
  VOERTUIG:   'Vehicle Code',
  NOTITIES:   'Notes',
  AANGEMAAKT: 'Created At',
});

function envKlaar() { return Boolean(AIRTABLE_BASE && AIRTABLE_TOKEN); }

/* Backslash EERST, dan het aanhalingsteken -- andersom escape je je eigen
   escape-teken weer weg. Eigen kopie, net als in elk ander bestand hier. */
function escapeFormula(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/* Eigen kopie van het 429-retry-patroon dat elders in deze codebase staat. */
async function atFetch(url, opts) {
  const r = await fetch(url, opts);
  if (r.status !== 429) return r;
  await new Promise((res) => setTimeout(res, 900 + Math.random() * 300));
  return fetch(url, opts);
}

function atUrl(path) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE}/${APPOINTMENTS_TABLE}${path || ''}`;
}
function atKop(extra) {
  return Object.assign({ Authorization: `Bearer ${AIRTABLE_TOKEN}` }, extra || {});
}

/* PROJECT-JJMMDDUUMM in UTC -- dezelfde opbouw als de bestaande Appointment ID
   in de boekingscode. Niet hier opnieuw uitvinden: twee plekken die hetzelfde
   idee net anders opbouwen is precies hoe een "dezelfde afspraak" onopgemerkt
   twee verschillende sleutels krijgt. */
function tijdstempel(startISO) {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return p2(d.getUTCFullYear() % 100) + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate())
       + p2(d.getUTCHours()) + p2(d.getUTCMinutes());
}

/**
 * De idempotentiesleutel voor een boekingspoging.
 * Zelfde invoer -> altijd dezelfde sleutel. Een ander lead of voertuig geeft
 * een andere sleutel, ook op exact hetzelfde tijdstip.
 */
function idempotentieSleutel({ projectCode, startISO, leadId, voertuigCode } = {}) {
  const code = String(projectCode || '').trim();
  const stempel = tijdstempel(startISO);
  if (!code || !stempel) return '';

  let sleutel = `${code}-${stempel}`;
  if (leadId || voertuigCode) {
    const hash = crypto.createHash('sha1')
      .update(String(leadId || '') + '|' + String(voertuigCode || ''))
      .digest('hex')
      .slice(0, 4);
    sleutel += `-${hash}`;
  }
  return sleutel;
}

/** Een bestaande afspraak op zijn Appointment ID, niet geannuleerd. Fail-soft -> null. */
async function zoekOpSleutel(projectCode, apptId) {
  const code = String(projectCode || '').trim();
  const id   = String(apptId || '').trim();
  if (!code || !id || !envKlaar()) return null;

  const formule = encodeURIComponent(
    `AND({${F.CODE}}="${escapeFormula(code)}", {${F.APPT_ID}}="${escapeFormula(id)}", {${F.STATUS}}!="cancelled")`
  );
  try {
    const r = await atFetch(atUrl(`?filterByFormula=${formule}&maxRecords=1`), { headers: atKop() });
    if (!r.ok) return null;
    const rec = ((await r.json()).records || [])[0] || null;
    if (rec && rec.fields && rec.fields[F.CODE] !== code) return null;   // riem en bretels
    return rec;
  } catch (err) {
    console.warn('[voertuigslot] zoekOpSleutel mislukt:', err && err.message);
    return null;
  }
}

/** De formule EN de JS-implementatie voor "actieve, toekomstige boekingen op dit voertuig". */
function actieveFormule(code, vc) {
  const nu = new Date().toISOString();
  return `AND({${F.CODE}}="${escapeFormula(code)}", {${F.VOERTUIG}}="${escapeFormula(vc)}", `
       + `{${F.STATUS}}="booked", IS_AFTER({${F.START}}, "${nu}"))`;
}

/** Actieve (geboekte, toekomstige) afspraken op één voertuig. Fail-soft -> []. */
async function actieveAfspraken(projectCode, voertuigCode) {
  const code = String(projectCode || '').trim();
  const vc   = String(voertuigCode || '').trim();
  if (!code || !vc || !envKlaar()) return [];

  try {
    const formule = encodeURIComponent(actieveFormule(code, vc));
    const r = await atFetch(atUrl(`?filterByFormula=${formule}&pageSize=100`), { headers: atKop() });
    if (!r.ok) return [];
    const records = (await r.json()).records || [];
    /* De formule filtert al op tenant EN voertuig. Nog een keer in JS, want
       dit is de plek waar een fout betekent dat een dealer de afspraak van
       een andere dealer op "zijn" voertuig ziet -- of, erger, dat het
       verkeerde voertuig een tweede afspraak blokkeert. */
    return records.filter((rec) => {
      const f = rec.fields || {};
      return f[F.CODE] === code && f[F.VOERTUIG] === vc;
    });
  } catch (err) {
    console.warn('[voertuigslot] actieveAfspraken mislukt:', err && err.message);
    return [];
  }
}

/* a "wint" van b als a een vroegere Created At heeft, of bij gelijke tijd een
   kleiner record-id. Beide zijn strings; ISO-tijden en Airtable record-ids
   vergelijken correct met de gewone stringvergelijking. */
function eerder(a, b) {
  if (a.created !== b.created) return a.created < b.created;
  return a.id < b.id;
}

/**
 * Na het aanmaken van EIGEN afspraak: verifiëren dat er niet net een ANDERE
 * afspraak op hetzelfde voertuig is beland. Verliest eigenRecordId (een
 * andere afspraak was er eerder bij), dan wordt het eigen record geannuleerd.
 *
 * @returns {Promise<{ok:boolean, reden?:string, winnaar?:string, geverifieerd?:boolean}>}
 */
async function bevestigClaim(projectCode, voertuigCode, eigenRecordId) {
  const code  = String(projectCode || '').trim();
  const vc    = String(voertuigCode || '').trim();
  const eigen = String(eigenRecordId || '').trim();
  if (!code || !vc || !eigen || !envKlaar()) return { ok: true, geverifieerd: false };

  let records;
  try {
    const formule = encodeURIComponent(actieveFormule(code, vc));
    const r = await atFetch(atUrl(`?filterByFormula=${formule}&pageSize=100`), { headers: atKop() });
    if (!r.ok) {
      console.warn(`[voertuigslot] bevestigClaim: lezen mislukt (HTTP ${r.status}) -- fail-open, niet geverifieerd.`);
      return { ok: true, geverifieerd: false };
    }
    records = ((await r.json()).records || []).filter((rec) => {
      const f = rec.fields || {};
      return f[F.CODE] === code && f[F.VOERTUIG] === vc;
    });
  } catch (err) {
    /* Fail-open, expliciet: zie de kop van dit bestand. Een storing hier mag
       nooit een geldige boeking laten sneuvelen. */
    console.warn('[voertuigslot] bevestigClaim exception -- fail-open, niet geverifieerd:', err && err.message);
    return { ok: true, geverifieerd: false };
  }

  const anderen = records.filter((rec) => rec.id !== eigen);
  if (!anderen.length) return { ok: true };

  const eigenRec = records.find((rec) => rec.id === eigen);
  const eigenCreated = (eigenRec && eigenRec.fields && eigenRec.fields[F.AANGEMAAKT]) || '';

  let winnaar = null;
  for (const rec of anderen) {
    const created = rec.fields && rec.fields[F.AANGEMAAKT];
    if (!created) continue;   // geen bewezen tijdstip: telt niet als "eerder"
    const kandidaat = { created, id: rec.id };
    const wintVanEigen = !eigenCreated || eerder(kandidaat, { created: eigenCreated, id: eigen });
    if (wintVanEigen && (!winnaar || eerder(kandidaat, winnaar))) winnaar = kandidaat;
  }
  if (!winnaar) return { ok: true };

  try {
    await atFetch(atUrl(`/${eigen}`), {
      method: 'PATCH',
      headers: atKop({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fields: {
          [F.STATUS]: 'cancelled',
          [F.NOTITIES]: 'Automatisch geannuleerd: voertuig werd net al geboekt (race)',
        },
        typecast: true,
      }),
    });
  } catch (err) {
    console.warn('[voertuigslot] eigen record annuleren mislukt:', err && err.message);
  }

  return { ok: false, reden: 'voertuig_bezet', winnaar: winnaar.id };
}

/**
 * Dunne schil om api/_afspraken.js komendeVoorLead, zodat een aanroeper voor
 * "heeft deze lead al iets lopen" en "is dit voertuig al bezet" één en
 * hetzelfde bestand kan importeren.
 */
function actieveVoorLead(projectCode, wie) {
  return require('./_afspraken').komendeVoorLead(projectCode, wie || {});
}

module.exports = {
  F,
  APPOINTMENTS_TABLE,
  idempotentieSleutel,
  zoekOpSleutel,
  actieveAfspraken,
  bevestigClaim,
  actieveVoorLead,
};
