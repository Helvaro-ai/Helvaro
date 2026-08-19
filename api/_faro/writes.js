'use strict';
/*
 * Faro -- de schrijfkant.
 *
 * Alles wat Faro in de database VERANDERT loopt hier langs, en nergens anders.
 * De leestools praten met api/_faro/data.js; dit is de tegenhanger.
 *
 * -- Twee regels die hier niet onderhandelbaar zijn ---------------------------
 *
 * 1. De tenant komt uit ctx, nooit uit een payload. Elke functie hieronder
 *    krijgt ctx.projectCode uit de geverifieerde sessie en controleert dat de
 *    rij die hij aanraakt daadwerkelijk van die tenant is -- door hem op te
 *    halen en het Project Code-veld te vergelijken, niet door de aanroeper op
 *    zijn woord te geloven. Een lead-id komt uit een chatgesprek en een
 *    taalmodel kan er een verzinnen.
 *
 * 2. Niets hier wordt aangeroepen zonder bevestiging. Deze functies zijn de
 *    uitvoerkant van api/_faro/actions.js; het model stelt voor, de gebruiker
 *    klikt, pas dan komt de code hier. De AI heeft geen directe uitvoerweg.
 *
 * -- Over de veld-ids ---------------------------------------------------------
 * Airtable-veld-ids staan ook in api/leads.js, dat zijn eigen PATCH-pad heeft
 * voor dezelfde velden. Twee kopieen van een constante is een uitnodiging om
 * uit elkaar te lopen, en de kopie die wegloopt merk je pas als een schrijf-
 * actie stil in het verkeerde veld belandt. tests/faro-writes.test.js
 * vergelijkt de twee daarom letterlijk met elkaar.
 */

const leadsRead = require('../_leads-read');

const AIRTABLE = 'https://api.airtable.com/v0';

/* Klanten / "Client Config" -- dezelfde tabel en velden als config-save in
   api/leads.js. */
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

const F = Object.freeze({
  // Leads
  status:       'fld8mkrEWcyq7mUip',   // Conversation State
  notities:     'fldoLRI5W12ThTls7',   // Notities
  dealWaarde:   'fldv7qOYvCN1xJfiR',   // Verwachte Waarde
  verliesReden: 'fld3NhSENma0okbT7',   // Reason
  // Client Config
  clientProject: 'fldN4dL0bGgfBOXwM',  // Project Code
  aiName:        'fldRvoe1JMPOtPWC7',  // AI Name
  autoReplyTpl:  'fldOGdVq6T54xEo6W',  // Auto-Reply Template
  aiInstructions:'fld1lqHctRbqFGQf5',  // AI Instructions
  workingHours:  'fldq5oIqw5MG8fKhc',  // Working Hours
  formIntro:     'fldxZ5spOeIb5omPr',  // Form Intro Message
});

/* Dezelfde allowlist als api/leads.js's PATCH. Een status buiten deze lijst is
   geen status maar een typefout van een taalmodel. */
const LEAD_STATUSES = Object.freeze(['new', 'in_progress', 'completed', 'verloren']);

/* Ook letterlijk overgenomen uit dashboard.js' <select>. Lege string wist het
   veld; alles daarbuiten wordt geweigerd in plaats van stil genegeerd, want
   Faro moet kunnen zeggen DAT het niet lukte. */
const LOSS_REASONS = Object.freeze([
  '', 'Prijs te hoog', 'Geen timing', 'Concurrent gekozen',
  'Geen interesse', 'Geen reactie', 'Andere reden',
]);

class WriteError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'WriteError';
    this.code = code || 'write_failed';
  }
}

function creds() {
  const token  = process.env.API_AIRTABLE;
  const baseId = process.env.BASE_AIRTABLE;
  if (!token || !baseId) throw new WriteError('CRM niet geconfigureerd.', 'unconfigured');
  return { token, baseId };
}

async function at(path, opts) {
  const { token, baseId } = creds();
  const r = await fetch(`${AIRTABLE}/${baseId}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts && opts.headers),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new WriteError(`CRM weigerde de wijziging (${r.status}).`, 'crm_error', body.slice(0, 200));
  }
  return r.json();
}

/**
 * Haal een lead op EN bevestig dat hij van deze tenant is.
 *
 * Dit is de kern van de isolatie: een id uit een gesprek zegt niets over
 * eigendom. We lezen de rij en vergelijken zijn Project Code met de sessie.
 * Bij twijfel: not_found, niet "geen toegang" -- het bestaan van een record
 * van een andere klant is zelf al informatie.
 */
async function ownedLead(leadId, ctx) {
  const id = String(leadId || '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new WriteError('Lead niet gevonden.', 'not_found');

  let rec;
  try {
    rec = await at(`${leadsRead.LEADS_TABLE}/${id}`);
  } catch (err) {
    throw new WriteError('Lead niet gevonden.', 'not_found');
  }
  const fields = (rec && rec.fields) || {};
  const owner = String(fields[leadsRead.FIELD_PROJECT] || fields['Project Code'] || '').trim();
  const mine  = String((ctx && ctx.projectCode) || '').trim();
  // Lege tenant leest verderop als "admin, toon alles" -- hier is het gewoon
  // een weigering.
  if (!mine || owner !== mine) throw new WriteError('Lead niet gevonden.', 'not_found');
  return { id, fields };
}

/** Status van een lead zetten, optioneel met verliesreden. */
async function setLeadStatus({ leadId, status, lossReason }, ctx) {
  if (LEAD_STATUSES.indexOf(status) === -1) {
    throw new WriteError(`"${status}" is geen geldige status.`, 'bad_status');
  }
  const lead = await ownedLead(leadId, ctx);

  const fields = { [F.status]: status };
  if (lossReason !== undefined) {
    if (LOSS_REASONS.indexOf(String(lossReason)) === -1) {
      throw new WriteError(`"${lossReason}" is geen bekende verliesreden.`, 'bad_reason');
    }
    fields[F.verliesReden] = String(lossReason);
  }

  await at(`${leadsRead.LEADS_TABLE}/${lead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  });
  return { leadId: lead.id, status, naam: lead.fields['Name'] || lead.fields.Name || '' };
}

/** Notitie aan een lead toevoegen. Voegt toe, overschrijft niet. */
async function appendLeadNote({ leadId, note }, ctx) {
  const text = String(note || '').trim();
  if (!text) throw new WriteError('Lege notitie.', 'empty');
  const lead = await ownedLead(leadId, ctx);

  /* Toevoegen en niet vervangen: Notities draagt ook de aiPaused-vlag als JSON
     (zie api/_leads-read.js). Dit veld overschrijven zou die vlag wissen en de
     AI ongemerkt weer laten antwoorden op een lead waar een mens het had
     overgenomen. */
  const bestaand = String(lead.fields[F.notities] || lead.fields.Notities || '');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const nieuw = (bestaand ? bestaand + '\n' : '') + `[${stamp}] ${text}`;

  await at(`${leadsRead.LEADS_TABLE}/${lead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [F.notities]: nieuw.slice(0, 8000) }, typecast: true }),
  });
  return { leadId: lead.id, note: text };
}

/** Een lead verwijderen. Onomkeerbaar, dus alleen na bevestiging. */
async function deleteLead({ leadId }, ctx) {
  const lead = await ownedLead(leadId, ctx);
  await at(`${leadsRead.LEADS_TABLE}/${lead.id}`, { method: 'DELETE' });
  return { leadId: lead.id, naam: lead.fields['Name'] || '' };
}

/** De Klanten-rij van DEZE tenant, of een fout. */
async function ownedClient(ctx) {
  const code = String((ctx && ctx.projectCode) || '').trim();
  if (!code) throw new WriteError('Geen klantcontext.', 'not_found');
  const formula = encodeURIComponent(`{${F.clientProject}}="${leadsRead.escapeFormula(code)}"`);
  const out = await at(`${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`);
  const rec = (out.records || [])[0];
  if (!rec) throw new WriteError('Klantrecord niet gevonden.', 'not_found');
  return rec;
}

/* Welke instellingen Faro mag aanraken. Bewust een korte lijst: dit zijn de
   velden die over de STEM van de AI gaan. Dingen als Project Code, plan of
   creditlimiet horen niet in een chat thuis -- dat is de rekening, niet de
   werkwijze. */
const PERSONA_FIELDS = Object.freeze({
  aiName:         { field: F.aiName,         max: 80,   label: 'AI-naam' },
  autoReplyTpl:   { field: F.autoReplyTpl,   max: 2000, label: 'Welkomstbericht' },
  aiInstructions: { field: F.aiInstructions, max: 8000, label: 'AI-instructies' },
  workingHours:   { field: F.workingHours,   max: 200,  label: 'Werkuren' },
  formIntro:      { field: F.formIntro,      max: 500,  label: 'Formuliertekst' },
});

/** Persona-instellingen bijwerken. Alleen meegegeven sleutels veranderen. */
async function updatePersona(patch, ctx) {
  const rec = await ownedClient(ctx);
  const fields = {};
  const changed = [];

  for (const [key, spec] of Object.entries(PERSONA_FIELDS)) {
    if (patch[key] === undefined) continue;
    const value = String(patch[key]).slice(0, spec.max);
    fields[spec.field] = value;
    changed.push(spec.label);
  }
  if (!changed.length) throw new WriteError('Niets om aan te passen.', 'empty');

  await at(`${CLIENTS_TABLE}/${rec.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  });
  return { changed };
}

module.exports = {
  WriteError,
  LEAD_STATUSES, LOSS_REASONS, PERSONA_FIELDS, F, CLIENTS_TABLE,
  ownedLead, ownedClient,
  setLeadStatus, appendLeadNote, deleteLead, updatePersona,
};
