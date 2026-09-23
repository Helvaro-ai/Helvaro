'use strict';
/*
 * Schema — de Airtable-tabellen en -velden die de automotive revenue engine
 * nodig heeft, en de enige plek die ze aanmaakt.
 *
 * ── Waarom in de code en niet met de hand ───────────────────────────────────
 * Een tabel die alleen in iemands hoofd bestaat, bestaat in een nieuwe base
 * niet. En een veld dat met de hand werd aangemaakt met een net andere naam
 * ("E-mail" in plaats van "Email") geeft een stille lege waarde, geen fout.
 * Hier staat per tabel precies welke velden er horen; ensure() maakt aan wat
 * ontbreekt en doet verder NIETS.
 *
 * ── Alleen toevoegen ────────────────────────────────────────────────────────
 * Deze module hernoemt niets, verwijdert niets en verandert geen veldtype.
 * Bestaande data wordt dus nooit geraakt; een tweede run is een no-op. Dat is
 * de hele migratiestrategie: additief en idempotent.
 *
 * ── Rechten ─────────────────────────────────────────────────────────────────
 * De Airtable-token moet schema.bases:read en schema.bases:write hebben. Heeft
 * hij dat niet, dan zegt ensure() dat met reden 'geen_schemarechten' en draait
 * de rest van Helvaro gewoon door: elke module hieronder behandelt een
 * ontbrekende tabel als "nog niet beschikbaar", niet als fout.
 *
 * ── Wanneer het draait ──────────────────────────────────────────────────────
 *   • admin-mode 'ops-schema' (droogloop standaard, commit:true om te schrijven)
 *   • de dagelijkse cron
 *   • lui, één keer per instantie, zodra een engine-module een ontbrekende
 *     tabel tegenkomt (zelfherstellend na een deploy op een verse base)
 */

const TIMEOUT_MS = 10000;

const tekst = (name) => ({ name, type: 'singleLineText' });
const lang = (name) => ({ name, type: 'multilineText' });
const vink = (name) => ({ name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } });

/* Nieuwe tabellen. Het EERSTE veld wordt het primaire veld in Airtable. */
const TABELLEN = Object.freeze({
  customers: {
    description: 'Klantidentiteit per dealer, over website/WhatsApp/e-mail heen. Beheerd door api/_klant.js.',
    fields: [
      tekst('Customer ID'), tekst('Project Code'), tekst('Name'), tekst('Email'), tekst('Phone'),
      tekst('Preferred Channel'), vink('Marketing Consent'), tekst('Source'), lang('Lead IDs'),
      tekst('Created At'), tekst('Updated At'),
    ],
  },
  conversations: {
    description: 'Eén gesprek per kanaal (website/e-mail). WhatsApp blijft op de lead. Beheerd door api/_gesprekken.js.',
    fields: [
      tekst('Conversation ID'), tekst('Project Code'), tekst('Customer ID'), tekst('Lead ID'),
      tekst('Channel'), tekst('External Thread ID'), tekst('Subject'), tekst('Control'),
      tekst('Control By'), tekst('Control At'), tekst('Status'), tekst('Classification'),
      lang('Summary'), tekst('Last Message At'), tekst('Last Direction'), vink('Unread'),
      tekst('Vehicle Code'), tekst('Created At'),
    ],
  },
  messages: {
    description: 'Berichten van website- en e-mailgesprekken. Message Key = dedup-sleutel. Beheerd door api/_gesprekken.js.',
    fields: [
      tekst('Message Key'), tekst('Project Code'), tekst('Conversation ID'), tekst('Channel'),
      tekst('Direction'), tekst('Author'), tekst('From'), tekst('To'), tekst('Cc'), tekst('Subject'),
      lang('Body'), tekst('External ID'), tekst('Thread ID'), tekst('RFC Message ID'),
      tekst('In Reply To'), lang('References'), tekst('Status'), tekst('Idempotency Key'),
      tekst('Error'), lang('Meta'), tekst('Created At'), tekst('Sent At'),
    ],
  },
  handoffs: {
    description: 'Kanaalwissel website → WhatsApp/e-mail met context. Token staat alleen gehasht. Beheerd door api/_handoff.js.',
    fields: [
      tekst('Token Hash'), tekst('Project Code'), tekst('Customer ID'), tekst('Lead ID'),
      tekst('Source Conversation ID'), tekst('Target Channel'), lang('Context'),
      tekst('Expires At'), tekst('Used At'), tekst('Created At'),
    ],
  },
});

/* Velden die bij BESTAANDE tabellen horen. Tabel op id, want de namen van de
   bestaande tabellen zijn in de code op id vastgelegd. */
const EXTRA_VELDEN = Object.freeze({
  tblPidTrwGRzRt4LZ: { // Client Config
    label: 'Client Config',
    fields: [
      tekst('Email Provider'), tekst('Email Address'), lang('Email Token'), lang('Email State'),
      vink('Email Auto Reply'), lang('Email Signature'),
      tekst('Site Key'), lang('Widget Domains'), vink('Widget Enabled'),
      lang('Inventory Source'), lang('Inventory State'),
    ],
  },
  tbliukTnDAbEDcZmt: { // Leads
    label: 'Leads',
    fields: [tekst('Customer ID'), tekst('Email'), tekst('Channels')],
  },
  tblQAPdjEsh0l7lUe: { // vehicles
    label: 'vehicles',
    fields: [tekst('Source'), tekst('Source Record ID'), tekst('Synced At')],
  },
});

function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

async function meta(pad, opts = {}) {
  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${process.env.BASE_AIRTABLE}${pad}`, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((d && d.error && (d.error.message || d.error.type)) || ('http ' + r.status));
    e.status = r.status;
    e.type = d && d.error && d.error.type;
    throw e;
  }
  return d;
}

/** Wat er ontbreekt, zonder iets te schrijven. Pure functie op de meta-lijst. */
function plan(tabellenMeta) {
  const perNaam = new Map();
  const perId = new Map();
  for (const t of tabellenMeta || []) { perNaam.set(t.name, t); perId.set(t.id, t); }
  const uit = { nieuweTabellen: [], nieuweVelden: [] };
  for (const [naam, def] of Object.entries(TABELLEN)) {
    const bestaand = perNaam.get(naam);
    if (!bestaand) { uit.nieuweTabellen.push({ naam, def }); continue; }
    const namen = new Set((bestaand.fields || []).map((f) => f.name));
    for (const f of def.fields) if (!namen.has(f.name)) uit.nieuweVelden.push({ tabel: bestaand.id, label: naam, veld: f });
  }
  for (const [id, def] of Object.entries(EXTRA_VELDEN)) {
    const bestaand = perId.get(id);
    if (!bestaand) continue; // bestaande tabel die er niet is: niet onze zaak om aan te maken
    const namen = new Set((bestaand.fields || []).map((f) => f.name));
    for (const f of def.fields) if (!namen.has(f.name)) uit.nieuweVelden.push({ tabel: id, label: def.label, veld: f });
  }
  return uit;
}

/**
 * Maak aan wat ontbreekt. commit:false (standaard) = alleen het plan.
 * Geeft altijd een verslag terug, gooit nooit.
 */
async function ensure({ commit = false } = {}) {
  const verslag = { ok: false, commit, aangemaakt: [], fouten: [], plan: null, reden: '' };
  if (!configured()) { verslag.reden = 'niet_geconfigureerd'; return verslag; }
  let lijst;
  try { lijst = (await meta('/tables')).tables || []; }
  catch (e) {
    verslag.reden = (e.status === 401 || e.status === 403) ? 'geen_schemarechten' : 'meta_onbereikbaar';
    verslag.fouten.push(String(e.message).slice(0, 200));
    return verslag;
  }
  const p = plan(lijst);
  verslag.plan = {
    nieuweTabellen: p.nieuweTabellen.map((t) => t.naam),
    nieuweVelden: p.nieuweVelden.map((v) => `${v.label}.${v.veld.name}`),
  };
  if (!commit) { verslag.ok = true; return verslag; }

  for (const t of p.nieuweTabellen) {
    try {
      await meta('/tables', { method: 'POST', body: { name: t.naam, description: t.def.description, fields: t.def.fields } });
      verslag.aangemaakt.push('tabel ' + t.naam);
    } catch (e) {
      verslag.fouten.push(`tabel ${t.naam}: ${String(e.message).slice(0, 160)}`);
      if (e.status === 401 || e.status === 403) { verslag.reden = 'geen_schemarechten'; return verslag; }
    }
  }
  for (const v of p.nieuweVelden) {
    try {
      await meta(`/tables/${v.tabel}/fields`, { method: 'POST', body: v.veld });
      verslag.aangemaakt.push(`veld ${v.label}.${v.veld.name}`);
    } catch (e) {
      verslag.fouten.push(`veld ${v.label}.${v.veld.name}: ${String(e.message).slice(0, 160)}`);
      if (e.status === 401 || e.status === 403) { verslag.reden = 'geen_schemarechten'; return verslag; }
    }
  }
  verslag.ok = verslag.fouten.length === 0;
  if (verslag.aangemaakt.length) console.log('[schema] aangemaakt:', verslag.aangemaakt.join(', '));
  if (verslag.fouten.length) console.error('[schema] fouten:', verslag.fouten.join(' | '));
  return verslag;
}

/* Lui en zelfherstellend: hoogstens één poging per tien minuten per instantie. */
let _laatstePoging = 0;
let _lopend = null;
function ensureLui() {
  if (_lopend) return _lopend;
  if (Date.now() - _laatstePoging < 10 * 60 * 1000) return Promise.resolve(null);
  _laatstePoging = Date.now();
  _lopend = ensure({ commit: true }).catch(() => null).finally(() => { _lopend = null; });
  return _lopend;
}

module.exports = { TABELLEN, EXTRA_VELDEN, plan, ensure, ensureLui, configured };
