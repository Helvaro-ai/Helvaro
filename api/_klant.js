'use strict';
/*
 * Klantidentiteit — één klant per dealer, over website, WhatsApp en e-mail heen.
 *
 * ── De regel ────────────────────────────────────────────────────────────────
 * Een klant wordt ALLEEN herkend op een exact, genormaliseerd contactgegeven:
 * hetzelfde e-mailadres of hetzelfde telefoonnummer, binnen dezelfde dealer.
 * Nooit op naam. "Jan Peeters" bestaat twintig keer in Vlaanderen; twee
 * verschillende kopers samenvoegen is erger dan er één dubbel te hebben.
 *
 * ── Tegenstrijdig ───────────────────────────────────────────────────────────
 * Wijst het e-mailadres naar klant A en het nummer naar klant B, dan wordt er
 * NIETS samengevoegd. De e-mailmatch wint voor dit ene gesprek (een adres is
 * persoonlijker dan een gedeeld gezinsnummer) en het resultaat draagt
 * `conflict: true`, zodat de dealer het ziet. Samenvoegen is een mens z'n
 * beslissing.
 *
 * ── Dubbels door gelijktijdigheid ───────────────────────────────────────────
 * Airtable kent geen unieke sleutels. Komen er twee eerste berichten van
 * dezelfde koper tegelijk binnen, dan kunnen er twee records ontstaan. Na elk
 * aanmaken wordt daarom opnieuw gezocht: bestaan er meerdere, dan wint de
 * oudste (deterministisch, op Created At en dan id) en krijgt de jongere
 * 'Source' = 'duplicaat:<winnaar>'. Er wordt nooit iets verwijderd.
 *
 * ── Geen tabel ──────────────────────────────────────────────────────────────
 * Bestaat 'customers' nog niet (schema-migratie niet gedraaid), dan geeft
 * resolve() null terug en wordt de migratie lui aangestoten. Een lead zonder
 * klantrecord werkt precies zoals vandaag.
 */

const crypto = require('crypto');

const TABEL = 'customers';
const F = Object.freeze({
  id: 'Customer ID', project: 'Project Code', naam: 'Name', email: 'Email', telefoon: 'Phone',
  kanaal: 'Preferred Channel', marketing: 'Marketing Consent', bron: 'Source', leads: 'Lead IDs',
  aangemaakt: 'Created At', bijgewerkt: 'Updated At',
});

function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

/* ── Normaliseren (puur) ───────────────────────────────────────────────── */

/** Kleine letters, witruimte weg, één @, iets na de punt. Anders ''. */
function normEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  if (e.length > 254) return '';
  return /^[^\s@"<>]+@[^\s@"<>]+\.[a-z]{2,}$/.test(e) ? e : '';
}

/**
 * Cijfers in internationale vorm zonder plus: '0478 12 34 56' -> '32478123456'.
 * Een nationaal nummer (begint met één 0) krijgt de landcode van de dealer
 * (standaard België). Te kort of te lang = ''.
 */
function normTelefoon(v, landcode = '32') {
  let d = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^0[1-9]/.test(d)) d = String(landcode) + d.slice(1);
  d = d.replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

function nieuweId() {
  return 'K' + crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 12);
}

function vanRecord(rec) {
  const f = (rec && rec.fields) || {};
  let leads = [];
  try { leads = JSON.parse(f[F.leads] || '[]'); } catch (e) { leads = []; }
  return {
    recordId: rec.id,
    id: String(f[F.id] || ''),
    projectCode: String(f[F.project] || ''),
    naam: String(f[F.naam] || ''),
    email: String(f[F.email] || ''),
    telefoon: String(f[F.telefoon] || ''),
    voorkeurKanaal: String(f[F.kanaal] || ''),
    marketing: f[F.marketing] === true,
    bron: String(f[F.bron] || ''),
    leadIds: Array.isArray(leads) ? leads.map(String) : [],
    aangemaakt: String(f[F.aangemaakt] || ''),
  };
}

/** Oudste eerst; bij gelijke tijd het kleinste record-id. Deterministisch. */
function oudsteEerst(a, b) {
  const ta = Date.parse(a.aangemaakt) || 0, tb = Date.parse(b.aangemaakt) || 0;
  if (ta !== tb) return ta - tb;
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}

/**
 * Welke klant hoort bij deze gegevens? Puur, op een lijst kandidaten.
 * @returns {{klant:object|null, conflict:boolean, via:''|'email'|'telefoon'}}
 */
function kies(kandidaten, { email, telefoon }) {
  const echte = (kandidaten || []).filter((k) => !/^duplicaat:/.test(k.bron)).sort(oudsteEerst);
  const opMail = email ? echte.find((k) => k.email === email) : null;
  const opTel = telefoon ? echte.find((k) => k.telefoon === telefoon) : null;
  if (opMail && opTel && opMail.recordId !== opTel.recordId) return { klant: opMail, conflict: true, via: 'email' };
  if (opMail) return { klant: opMail, conflict: false, via: 'email' };
  if (opTel) return { klant: opTel, conflict: false, via: 'telefoon' };
  return { klant: null, conflict: false, via: '' };
}

/* ── Airtable ──────────────────────────────────────────────────────────── */

let _tabelOntbreekt = 0;
function tabelOntbrak(status, tekst) {
  if (status === 404 || /TABLE_NOT_FOUND|NOT_FOUND|UNKNOWN_FIELD_NAME/.test(tekst || '')) {
    _tabelOntbreekt = Date.now();
    try { require('./_schema').ensureLui(); } catch (e) { /* optioneel */ }
    return true;
  }
  return false;
}

async function zoek(projectCode, { email, telefoon }) {
  const delen = [];
  if (email) delen.push(`LOWER({${F.email}})="${escapeFormula(email)}"`);
  if (telefoon) delen.push(`{${F.telefoon}}="${escapeFormula(telefoon)}"`);
  if (!delen.length) return [];
  const formule = `AND({${F.project}}="${escapeFormula(projectCode)}", OR(${delen.join(',')}))`;
  const r = await at(`${encodeURIComponent(TABEL)}?filterByFormula=${encodeURIComponent(formule)}&pageSize=20`);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (tabelOntbrak(r.status, t)) return null;
    throw new Error('klanten zoeken ' + r.status);
  }
  const d = await r.json();
  /* Riem en bretels: de formule filtert al op dealer, dit is de plek waar een
     fout zou betekenen dat dealer A een klant van dealer B ziet. */
  return (d.records || []).map(vanRecord).filter((k) => k.projectCode === projectCode);
}

async function patch(recordId, velden) {
  const r = await at(`${encodeURIComponent(TABEL)}/${recordId}`, { method: 'PATCH', body: { fields: velden, typecast: true } });
  return r.ok;
}

/**
 * Vind of maak de klant bij deze contactgegevens, en koppel de lead eraan.
 * Faalt zacht: bij elke storing null, nooit een uitzondering naar het kanaal.
 *
 * @param {string} projectCode  uit de sessie of de webhook-routing, nooit uit invoer
 * @param {{email?, telefoon?, naam?, bron?, leadId?, kanaal?, landcode?}} gegevens
 * @returns {Promise<null|{klant:object, nieuw:boolean, conflict:boolean, via:string}>}
 */
async function resolve(projectCode, gegevens = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant || !process.env.API_AIRTABLE || !process.env.BASE_AIRTABLE) return null;
  if (_tabelOntbreekt && Date.now() - _tabelOntbreekt < 5 * 60 * 1000) return null;
  const email = normEmail(gegevens.email);
  const telefoon = normTelefoon(gegevens.telefoon, gegevens.landcode);
  if (!email && !telefoon) return null; // niets om op te herkennen: geen klantrecord, geen gok

  try {
    const kandidaten = await zoek(tenant, { email, telefoon });
    if (kandidaten === null) return null;
    const keuze = kies(kandidaten, { email, telefoon });
    const nu = new Date().toISOString();
    const leadId = gegevens.leadId ? String(gegevens.leadId) : '';

    if (keuze.klant) {
      const k = keuze.klant;
      const velden = {};
      /* Aanvullen, nooit overschrijven: een tweede kanaal voegt een gegeven
         toe, het vervangt er geen. Bij een conflict wordt er niets aangevuld --
         dan zou het nummer van klant B bij klant A belanden. */
      if (!keuze.conflict) {
        if (email && !k.email) velden[F.email] = email;
        if (telefoon && !k.telefoon) velden[F.telefoon] = telefoon;
      }
      if (gegevens.naam && !k.naam) velden[F.naam] = String(gegevens.naam).slice(0, 120);
      if (leadId && k.leadIds.indexOf(leadId) === -1) velden[F.leads] = JSON.stringify(k.leadIds.concat(leadId).slice(-50));
      if (Object.keys(velden).length) {
        velden[F.bijgewerkt] = nu;
        await patch(k.recordId, velden);
        Object.assign(k, { email: k.email || (velden[F.email] || ''), telefoon: k.telefoon || (velden[F.telefoon] || '') });
        if (velden[F.leads]) k.leadIds = JSON.parse(velden[F.leads]);
      }
      if (keuze.conflict) console.warn('[klant] tegenstrijdige identiteit voor', tenant, '- e-mail en nummer wijzen naar verschillende klanten; niet samengevoegd');
      return { klant: k, nieuw: false, conflict: keuze.conflict, via: keuze.via };
    }

    const velden = {
      [F.id]: nieuweId(), [F.project]: tenant,
      [F.naam]: gegevens.naam ? String(gegevens.naam).slice(0, 120) : '',
      [F.email]: email, [F.telefoon]: telefoon,
      [F.kanaal]: ['whatsapp', 'email', 'website'].indexOf(gegevens.kanaal) !== -1 ? gegevens.kanaal : '',
      [F.bron]: String(gegevens.bron || gegevens.kanaal || '').slice(0, 40),
      [F.leads]: JSON.stringify(leadId ? [leadId] : []),
      [F.aangemaakt]: nu, [F.bijgewerkt]: nu,
    };
    const r = await at(encodeURIComponent(TABEL), { method: 'POST', body: { records: [{ fields: velden }], typecast: true } });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (!tabelOntbrak(r.status, t)) console.error('[klant] aanmaken mislukt', r.status, t.slice(0, 160));
      return null;
    }
    const d = await r.json();
    const gemaakt = vanRecord(d.records[0]);

    /* Opnieuw zoeken: is er intussen een tweede aangemaakt, dan wint de oudste. */
    const opnieuw = await zoek(tenant, { email, telefoon }).catch(() => null);
    if (Array.isArray(opnieuw) && opnieuw.length > 1) {
      const winnaar = kies(opnieuw, { email, telefoon }).klant;
      if (winnaar && winnaar.recordId !== gemaakt.recordId) {
        await patch(gemaakt.recordId, { [F.bron]: 'duplicaat:' + winnaar.id, [F.bijgewerkt]: nu });
        if (leadId && winnaar.leadIds.indexOf(leadId) === -1) {
          await patch(winnaar.recordId, { [F.leads]: JSON.stringify(winnaar.leadIds.concat(leadId).slice(-50)), [F.bijgewerkt]: nu });
          winnaar.leadIds = winnaar.leadIds.concat(leadId);
        }
        return { klant: winnaar, nieuw: false, conflict: false, via: 'race' };
      }
    }
    return { klant: gemaakt, nieuw: true, conflict: false, via: '' };
  } catch (e) {
    console.warn('[klant] resolve overgeslagen:', e && e.message);
    return null;
  }
}

/**
 * Een nieuwe lead aan zijn klant hangen: resolve() en dan 'Customer ID' op de
 * lead zetten. Voor fire-and-forget na het aanmaken van een lead; gooit nooit.
 * Bestaat het veld op Leads nog niet, dan blijft het bij het klantrecord.
 */
async function koppelLead(projectCode, leadId, gegevens = {}) {
  if (!leadId) return null;
  const uit = await resolve(projectCode, Object.assign({}, gegevens, { leadId }));
  if (!uit || !uit.klant) return uit;
  try {
    const r = await fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/tbliukTnDAbEDcZmt/${leadId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Customer ID': uit.klant.id } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (/UNKNOWN_FIELD_NAME/.test(t)) { try { require('./_schema').ensureLui(); } catch (e) { /* optioneel */ } }
      else console.warn('[klant] lead koppelen mislukt', r.status);
    }
  } catch (e) { console.warn('[klant] lead koppelen overgeslagen:', e && e.message); }
  return uit;
}

module.exports = { TABEL, F, normEmail, normTelefoon, kies, resolve, koppelLead, _test: { vanRecord, oudsteEerst, reset: () => { _tabelOntbreekt = 0; } } };
