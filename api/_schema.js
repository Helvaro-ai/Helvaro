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
 *   • de dagelijkse cron, EERST en afgewacht met een tijdslimiet (ensureMetTijd)
 *   • de uurlijkse voorraadcron, één keer per instantie, afgewacht (ensureEenmaal)
 *   • lui (ensureLui), zodra een engine-module een ontbrekende tabel tegenkomt.
 *     Fire-and-forget en dus GEEN garantie: Vercel bevriest de functie zodra
 *     hij antwoordt (zo bleef vehicle_listings in productie weg).
 */

const TIMEOUT_MS = 10000;

const tekst = (name) => ({ name, type: 'singleLineText' });
const lang = (name) => ({ name, type: 'multilineText' });
const getal = (name) => ({ name, type: 'number', options: { precision: 0 } });
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
  vehicle_listings: {
    description: 'Welk platform welke wagen van welke dealer toont. Listing Key = projectCode|platform|id. Beheerd door api/_listings.js.',
    fields: [
      tekst('Listing Key'), tekst('Project Code'), tekst('Vehicle Code'), tekst('Provider'),
      tekst('External ID'), tekst('URL'), tekst('Status'), tekst('Last Seen At'), tekst('Created At'),
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
      /* auto of motor, alleen binnen dealership (api/_segment.js). Leeg = auto. */
      tekst('Vehicle Segment'),
    ],
  },
  tbliukTnDAbEDcZmt: { // Leads
    label: 'Leads',
    /* Listing Provider / Listing ID: via welk platform en welke advertentie de
       lead bij een wagen kwam, voor zover bekend (api/whatsapp.js). */
    fields: [tekst('Customer ID'), tekst('Email'), tekst('Channels'), tekst('Listing Provider'), tekst('Listing ID')],
  },
  tblQAPdjEsh0l7lUe: { // vehicles
    label: 'vehicles',
    /* Sold At: het moment waarop de wagen verkocht werd. Daar hangt de
       bewaartermijn aan -- 14 dagen als VERKOCHT, daarna gearchiveerd (zie
       archiveerVerkocht in api/_inventaris.js). Tekst, ISO-datum, net als
       Synced At en Created At. */
    /* Engine CC en Licence Class: alleen voor motoren (api/_segment.js), leeg
       bij een auto. Optioneel in api/_vehicles.js: ontbreken ze, dan wordt
       zonder die velden opnieuw geschreven. */
    fields: [tekst('Source'), tekst('Source Record ID'), tekst('Synced At'), tekst('Sold At'), tekst('VIN'), getal('Engine CC'), tekst('Licence Class')],
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

/* Waarom het NIET lukte, in het log. Tot 2026-10-07 gaf ensure() dit alleen
   terug in het verslag, en de lazy aanroeper (ensureLui) gooide dat weg: een
   token zonder schemarechten bleef daardoor onzichtbaar en vehicle_listings
   werd nooit aangemaakt. */
function meldReden(verslag) {
  if (verslag.reden === 'geen_schemarechten') {
    console.error('[schema] geen_schemarechten: de Airtable-token mag het schema niet lezen of schrijven (' + (verslag.fouten[0] || '') + '). '
      + 'Geef hem schema.bases:read en schema.bases:write, of maak de ontbrekende tabellen met de hand aan (admin ops-schema toont welke).');
  } else if (verslag.reden === 'meta_onbereikbaar') {
    console.warn('[schema] meta_onbereikbaar: ' + (verslag.fouten[0] || 'geen antwoord') + ' -- volgende run opnieuw');
  }
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
    meldReden(verslag);
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
      if (e.status === 401 || e.status === 403) { verslag.reden = 'geen_schemarechten'; meldReden(verslag); return verslag; }
    }
  }
  for (const v of p.nieuweVelden) {
    try {
      await meta(`/tables/${v.tabel}/fields`, { method: 'POST', body: v.veld });
      verslag.aangemaakt.push(`veld ${v.label}.${v.veld.name}`);
    } catch (e) {
      verslag.fouten.push(`veld ${v.label}.${v.veld.name}: ${String(e.message).slice(0, 160)}`);
      if (e.status === 401 || e.status === 403) { verslag.reden = 'geen_schemarechten'; meldReden(verslag); return verslag; }
    }
  }
  verslag.ok = verslag.fouten.length === 0;
  if (verslag.aangemaakt.length) console.log('[schema] aangemaakt:', verslag.aangemaakt.join(', '));
  if (verslag.fouten.length) console.error('[schema] fouten:', verslag.fouten.join(' | '));
  return verslag;
}

/**
 * ensure() met een tijdslimiet, voor de crons. Die moeten AFWACHTEN (een
 * migratie die niet afgewacht wordt, wordt bevroren zodra de functie antwoordt)
 * maar mogen er niet aan blijven hangen. Na de limiet komt er een verslag met
 * reden 'tijd_op'; het werk loopt nog even door op de achtergrond en is
 * idempotent, dus de volgende run maakt af wat ontbreekt.
 * Gooit nooit.
 */
async function ensureMetTijd({ commit = true, ms = 20000 } = {}) {
  let klok;
  const tijdOp = new Promise((ok) => {
    klok = setTimeout(() => ok({ ok: false, commit, aangemaakt: [], fouten: [], plan: null, reden: 'tijd_op' }), Math.max(1000, ms));
  });
  try {
    const v = await Promise.race([ensure({ commit }), tijdOp]);
    if (v.reden === 'tijd_op') console.warn('[schema] tijd_op na ' + ms + ' ms: de migratie loopt door op de achtergrond; de volgende run maakt af wat ontbreekt');
    return v;
  } catch (e) {
    console.error('[schema] mislukt:', e && e.message);
    return { ok: false, commit, aangemaakt: [], fouten: [String(e && e.message).slice(0, 200)], plan: null, reden: 'fout' };
  } finally { clearTimeout(klok); }
}

/* Eén keer per instantie (de uurcron): na een geslaagde run is dit een no-op;
   na een mislukte hoogstens eens per tien minuten opnieuw. */
let _eenmaal = null;
let _eenmaalVolgende = 0;
async function ensureEenmaal({ ms = 15000 } = {}) {
  if (_eenmaal) return _eenmaal;
  if (Date.now() < _eenmaalVolgende) return { ok: false, commit: true, aangemaakt: [], fouten: [], plan: null, reden: 'wacht' };
  const v = await ensureMetTijd({ commit: true, ms });
  if (v.ok) _eenmaal = Object.assign({}, v, { hergebruikt: true, aangemaakt: [] });
  else _eenmaalVolgende = Date.now() + 10 * 60 * 1000;
  return v;
}
function _resetEenmaal() { _eenmaal = null; _eenmaalVolgende = 0; }

/* Lui en zelfherstellend: hoogstens één poging per tien minuten per instantie.
   LET OP: fire-and-forget. Op Vercel wordt de functie bevroren zodra hij
   antwoordt, dus dit is een bonus voor een langlopende aanvraag en GEEN
   garantie; de crons (ensureMetTijd / ensureEenmaal) zijn de betrouwbare weg. */
let _laatstePoging = 0;
let _lopend = null;
function ensureLui() {
  if (_lopend) return _lopend;
  if (Date.now() - _laatstePoging < 10 * 60 * 1000) return Promise.resolve(null);
  _laatstePoging = Date.now();
  _lopend = ensure({ commit: true }).catch((e) => { console.error('[schema] lui mislukt:', e && e.message); return null; }).finally(() => { _lopend = null; });
  return _lopend;
}

module.exports = { TABELLEN, EXTRA_VELDEN, plan, ensure, ensureMetTijd, ensureEenmaal, ensureLui, configured, _resetEenmaal };
