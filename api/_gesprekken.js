'use strict';
/*
 * Gesprekken en berichten voor de kanalen e-mail en website.
 *
 * WhatsApp blijft waar het staat: de historie op de lead (Conversation History).
 * Dat werkt, 30+ tests hangen eraan en een migratie zou niets opleveren. De
 * nieuwe kanalen krijgen hier een eigen, nette opslag, en het dashboard voegt
 * de twee samen in één lijst (api/leads.js mode 'conversation-list').
 *
 * ── Sleutels ────────────────────────────────────────────────────────────────
 *   Gesprek: (dealer, kanaal, External Thread ID). Een e-mailthread of een
 *            websitesessie is één gesprek; dezelfde thread twee keer binnen =
 *            hetzelfde gesprek.
 *   Bericht: Message Key, uniek per dealer. Voor e-mail de RFC Message-ID of de
 *            provider-id; voor uitgaande berichten de idempotentiesleutel. Een
 *            bericht dat al bestaat wordt niet opnieuw geschreven -- zo maakt
 *            een webhook die twee keer komt of een dubbelklik op Versturen geen
 *            dubbel.
 *
 * ── Controle ────────────────────────────────────────────────────────────────
 * Wie het gesprek voert: AI_ACTIVE, HUMAN_TAKEOVER of PAUSED. Voor WhatsApp is
 * dat Notities.aiPaused op de lead; hier is het een veld op het gesprek. Zelfde
 * drie toestanden, zelfde betekenis.
 *
 * ── Tenant ──────────────────────────────────────────────────────────────────
 * Elke lezing filtert op Project Code in de formule EN daarna nog eens in code.
 * De projectcode komt altijd van de aanroeper (sessie of routing), nooit uit
 * een bericht.
 */

const crypto = require('crypto');

const T_GESPREK = 'conversations';
const T_BERICHT = 'messages';
const CONTROLE = Object.freeze(['AI_ACTIVE', 'HUMAN_TAKEOVER', 'PAUSED']);
const KANALEN = Object.freeze(['email', 'website']);

const G = Object.freeze({
  id: 'Conversation ID', project: 'Project Code', klant: 'Customer ID', lead: 'Lead ID', kanaal: 'Channel',
  thread: 'External Thread ID', onderwerp: 'Subject', controle: 'Control', controleDoor: 'Control By',
  controleOp: 'Control At', status: 'Status', classificatie: 'Classification', samenvatting: 'Summary',
  laatste: 'Last Message At', richting: 'Last Direction', ongelezen: 'Unread', voertuig: 'Vehicle Code',
  aangemaakt: 'Created At',
});
const B = Object.freeze({
  sleutel: 'Message Key', project: 'Project Code', gesprek: 'Conversation ID', kanaal: 'Channel',
  richting: 'Direction', auteur: 'Author', van: 'From', aan: 'To', cc: 'Cc', onderwerp: 'Subject',
  tekst: 'Body', externId: 'External ID', thread: 'Thread ID', rfcId: 'RFC Message ID',
  antwoordOp: 'In Reply To', referenties: 'References', status: 'Status', idem: 'Idempotency Key',
  fout: 'Error', meta: 'Meta', aangemaakt: 'Created At', verzonden: 'Sent At',
});

class GesprekFout extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

async function vraag(pad, opts) {
  const r = await at(pad, opts);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (r.status === 404 || /TABLE_NOT_FOUND|UNKNOWN_FIELD_NAME/.test(t)) {
      try { require('./_schema').ensureLui(); } catch (e) { /* optioneel */ }
      throw new GesprekFout('De gesprekstabellen bestaan nog niet.', 'geen_tabel');
    }
    throw new GesprekFout('Airtable ' + r.status, 'airtable');
  }
  return r.json();
}

function tenant(projectCode) {
  const t = String(projectCode || '').trim();
  if (!t) throw new GesprekFout('Geen projectcode.', 'no_tenant');
  return t;
}

function nieuweId(prefix) { return prefix + crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 14); }

/** Maximaal zoveel tekens in een tekstveld; Airtable weigert boven 100k. */
const kort = (v, n) => String(v == null ? '' : v).slice(0, n);

function gesprekVan(rec) {
  const f = rec.fields || {};
  return {
    recordId: rec.id, id: String(f[G.id] || ''), projectCode: String(f[G.project] || ''),
    klantId: String(f[G.klant] || ''), leadId: String(f[G.lead] || ''), kanaal: String(f[G.kanaal] || ''),
    thread: String(f[G.thread] || ''), onderwerp: String(f[G.onderwerp] || ''),
    controle: CONTROLE.indexOf(f[G.controle]) !== -1 ? f[G.controle] : 'AI_ACTIVE',
    controleDoor: String(f[G.controleDoor] || ''), controleOp: String(f[G.controleOp] || ''),
    status: String(f[G.status] || 'open'), classificatie: String(f[G.classificatie] || ''),
    samenvatting: String(f[G.samenvatting] || ''), laatste: String(f[G.laatste] || ''),
    richting: String(f[G.richting] || ''), ongelezen: f[G.ongelezen] === true,
    voertuig: String(f[G.voertuig] || ''), aangemaakt: String(f[G.aangemaakt] || ''),
  };
}

function berichtVan(rec) {
  const f = rec.fields || {};
  let meta = {};
  try { meta = JSON.parse(f[B.meta] || '{}'); } catch (e) { meta = {}; }
  return {
    recordId: rec.id, sleutel: String(f[B.sleutel] || ''), projectCode: String(f[B.project] || ''),
    gesprekId: String(f[B.gesprek] || ''), kanaal: String(f[B.kanaal] || ''), richting: String(f[B.richting] || ''),
    auteur: String(f[B.auteur] || ''), van: String(f[B.van] || ''), aan: String(f[B.aan] || ''), cc: String(f[B.cc] || ''),
    onderwerp: String(f[B.onderwerp] || ''), tekst: String(f[B.tekst] || ''), externId: String(f[B.externId] || ''),
    thread: String(f[B.thread] || ''), rfcId: String(f[B.rfcId] || ''), antwoordOp: String(f[B.antwoordOp] || ''),
    referenties: String(f[B.referenties] || ''), status: String(f[B.status] || ''), idem: String(f[B.idem] || ''),
    fout: String(f[B.fout] || ''), meta, aangemaakt: String(f[B.aangemaakt] || ''), verzonden: String(f[B.verzonden] || ''),
  };
}

/* ── Gesprekken ────────────────────────────────────────────────────────── */

async function zoekGesprekOpThread(t, kanaal, thread) {
  const formule = `AND({${G.project}}="${escapeFormula(t)}", {${G.kanaal}}="${escapeFormula(kanaal)}", {${G.thread}}="${escapeFormula(thread)}")`;
  const d = await vraag(`${T_GESPREK}?filterByFormula=${encodeURIComponent(formule)}&pageSize=5`);
  return (d.records || []).map(gesprekVan).filter((g) => g.projectCode === t)
    .sort((a, b) => (Date.parse(a.aangemaakt) || 0) - (Date.parse(b.aangemaakt) || 0) || (a.recordId < b.recordId ? -1 : 1));
}

/**
 * Het gesprek bij deze thread, of een nieuw. Bij een race (twee gelijktijdige
 * eerste berichten) wint het oudste record; het andere wordt als 'samengevoegd'
 * gemarkeerd, niet verwijderd.
 */
async function vindOfMaak(projectCode, { kanaal, thread, klantId = '', leadId = '', onderwerp = '', voertuig = '' } = {}) {
  const t = tenant(projectCode);
  if (KANALEN.indexOf(kanaal) === -1) throw new GesprekFout('Onbekend kanaal.', 'bad_channel');
  const th = kort(thread, 500);
  if (!th) throw new GesprekFout('Geen thread.', 'no_thread');
  const bestaand = await zoekGesprekOpThread(t, kanaal, th);
  if (bestaand.length) return { gesprek: bestaand[0], nieuw: false };

  const nu = new Date().toISOString();
  const velden = {
    [G.id]: nieuweId('G'), [G.project]: t, [G.klant]: kort(klantId, 40), [G.lead]: kort(leadId, 40),
    [G.kanaal]: kanaal, [G.thread]: th, [G.onderwerp]: kort(onderwerp, 300), [G.controle]: 'AI_ACTIVE',
    [G.status]: 'open', [G.laatste]: nu, [G.ongelezen]: false, [G.voertuig]: kort(voertuig, 20), [G.aangemaakt]: nu,
  };
  const d = await vraag(T_GESPREK, { method: 'POST', body: { records: [{ fields: velden }], typecast: true } });
  const gemaakt = gesprekVan(d.records[0]);
  const opnieuw = await zoekGesprekOpThread(t, kanaal, th).catch(() => []);
  if (opnieuw.length > 1 && opnieuw[0].recordId !== gemaakt.recordId) {
    await vraag(`${T_GESPREK}/${gemaakt.recordId}`, { method: 'PATCH', body: { fields: { [G.status]: 'samengevoegd:' + opnieuw[0].id } } }).catch(() => {});
    return { gesprek: opnieuw[0], nieuw: false };
  }
  return { gesprek: gemaakt, nieuw: true };
}

async function haal(projectCode, gesprekId) {
  const t = tenant(projectCode);
  const formule = `AND({${G.project}}="${escapeFormula(t)}", {${G.id}}="${escapeFormula(gesprekId)}")`;
  const d = await vraag(`${T_GESPREK}?filterByFormula=${encodeURIComponent(formule)}&maxRecords=1`);
  const g = (d.records || []).map(gesprekVan).find((x) => x.projectCode === t);
  return g || null;
}

async function lijst(projectCode, { kanaal = '', limiet = 50 } = {}) {
  const t = tenant(projectCode);
  const delen = [`{${G.project}}="${escapeFormula(t)}"`, `NOT(LEFT({${G.status}}, 12)="samengevoegd")`];
  if (kanaal) delen.push(`{${G.kanaal}}="${escapeFormula(kanaal)}"`);
  const formule = `AND(${delen.join(',')})`;
  const n = Math.min(100, Math.max(1, Number(limiet) || 50));
  const d = await vraag(`${T_GESPREK}?filterByFormula=${encodeURIComponent(formule)}&pageSize=${n}&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(G.laatste)}&sort%5B0%5D%5Bdirection%5D=desc`);
  return (d.records || []).map(gesprekVan).filter((g) => g.projectCode === t);
}

/** AI_ACTIVE / HUMAN_TAKEOVER / PAUSED. `door` = wie (verkoper, 'systeem'). */
async function zetControle(projectCode, gesprekId, controle, door) {
  if (CONTROLE.indexOf(controle) === -1) throw new GesprekFout('Onbekende controle.', 'bad_control');
  const g = await haal(projectCode, gesprekId);
  if (!g) throw new GesprekFout('Gesprek niet gevonden.', 'not_found');
  const nu = new Date().toISOString();
  await vraag(`${T_GESPREK}/${g.recordId}`, { method: 'PATCH', body: { fields: {
    [G.controle]: controle, [G.controleDoor]: kort(door || 'dashboard', 80), [G.controleOp]: nu,
  } } });
  return Object.assign(g, { controle, controleDoor: door || 'dashboard', controleOp: nu });
}

async function markeer(projectCode, gesprekId, velden) {
  const g = await haal(projectCode, gesprekId);
  if (!g) throw new GesprekFout('Gesprek niet gevonden.', 'not_found');
  const toegestaan = {};
  if (typeof velden.ongelezen === 'boolean') toegestaan[G.ongelezen] = velden.ongelezen;
  if (typeof velden.status === 'string') toegestaan[G.status] = kort(velden.status, 40);
  if (typeof velden.classificatie === 'string') toegestaan[G.classificatie] = kort(velden.classificatie, 40);
  if (typeof velden.samenvatting === 'string') toegestaan[G.samenvatting] = kort(velden.samenvatting, 4000);
  if (typeof velden.leadId === 'string') toegestaan[G.lead] = kort(velden.leadId, 40);
  if (typeof velden.klantId === 'string') toegestaan[G.klant] = kort(velden.klantId, 40);
  if (!Object.keys(toegestaan).length) return g;
  await vraag(`${T_GESPREK}/${g.recordId}`, { method: 'PATCH', body: { fields: toegestaan, typecast: true } });
  return g;
}

/* ── Berichten ─────────────────────────────────────────────────────────── */

async function zoekBericht(t, sleutel) {
  const formule = `AND({${B.project}}="${escapeFormula(t)}", {${B.sleutel}}="${escapeFormula(sleutel)}")`;
  const d = await vraag(`${T_BERICHT}?filterByFormula=${encodeURIComponent(formule)}&maxRecords=1`);
  return (d.records || []).map(berichtVan).find((b) => b.projectCode === t) || null;
}

/**
 * Een bericht toevoegen, idempotent op `sleutel`. Bestaat hij al, dan komt het
 * bestaande terug met `dubbel: true` en wordt er niets geschreven.
 */
async function voegToe(projectCode, gesprek, bericht) {
  const t = tenant(projectCode);
  if (!gesprek || gesprek.projectCode !== t) throw new GesprekFout('Gesprek hoort niet bij deze dealer.', 'tenant_mismatch');
  const sleutel = kort(bericht.sleutel, 300);
  if (!sleutel) throw new GesprekFout('Bericht zonder sleutel.', 'no_key');
  const al = await zoekBericht(t, sleutel);
  if (al) return { bericht: al, dubbel: true };

  const nu = new Date().toISOString();
  const richting = bericht.richting === 'uit' ? 'uit' : 'in';
  const velden = {
    [B.sleutel]: sleutel, [B.project]: t, [B.gesprek]: gesprek.id, [B.kanaal]: gesprek.kanaal, [B.richting]: richting,
    [B.auteur]: kort(bericht.auteur || (richting === 'in' ? 'klant' : 'ai'), 80),
    [B.van]: kort(bericht.van, 300), [B.aan]: kort(bericht.aan, 1000), [B.cc]: kort(bericht.cc, 1000),
    [B.onderwerp]: kort(bericht.onderwerp, 500), [B.tekst]: kort(bericht.tekst, 50000),
    [B.externId]: kort(bericht.externId, 300), [B.thread]: kort(bericht.thread || gesprek.thread, 500),
    [B.rfcId]: kort(bericht.rfcId, 500), [B.antwoordOp]: kort(bericht.antwoordOp, 500), [B.referenties]: kort(bericht.referenties, 4000),
    [B.status]: kort(bericht.status || (richting === 'in' ? 'ontvangen' : 'concept'), 20),
    [B.idem]: kort(bericht.idem, 120), [B.fout]: kort(bericht.fout, 500),
    [B.meta]: JSON.stringify(bericht.meta || {}).slice(0, 8000),
    [B.aangemaakt]: bericht.aangemaakt || nu, [B.verzonden]: bericht.verzonden || '',
  };
  const d = await vraag(T_BERICHT, { method: 'POST', body: { records: [{ fields: velden }], typecast: true } });
  const nieuw = berichtVan(d.records[0]);

  /* Gelijktijdig dezelfde sleutel geschreven? Oudste wint, de rest krijgt
     status 'dubbel' en wordt nergens getoond. */
  const formule = `AND({${B.project}}="${escapeFormula(t)}", {${B.sleutel}}="${escapeFormula(sleutel)}")`;
  const alle = await vraag(`${T_BERICHT}?filterByFormula=${encodeURIComponent(formule)}&pageSize=5`).then((x) => (x.records || []).map(berichtVan)).catch(() => []);
  if (alle.length > 1) {
    alle.sort((a, b) => (a.recordId < b.recordId ? -1 : 1));
    if (alle[0].recordId !== nieuw.recordId) {
      await vraag(`${T_BERICHT}/${nieuw.recordId}`, { method: 'PATCH', body: { fields: { [B.status]: 'dubbel' } } }).catch(() => {});
      return { bericht: alle[0], dubbel: true };
    }
  }

  await vraag(`${T_GESPREK}/${gesprek.recordId}`, { method: 'PATCH', body: { fields: {
    [G.laatste]: velden[B.aangemaakt], [G.richting]: richting, [G.ongelezen]: richting === 'in',
  } } }).catch(() => {});
  return { bericht: nieuw, dubbel: false };
}

async function werkBerichtBij(projectCode, bericht, velden) {
  const t = tenant(projectCode);
  if (!bericht || bericht.projectCode !== t) throw new GesprekFout('Bericht hoort niet bij deze dealer.', 'tenant_mismatch');
  const toegestaan = {};
  if (velden.status) toegestaan[B.status] = kort(velden.status, 20);
  if (velden.externId) toegestaan[B.externId] = kort(velden.externId, 300);
  if (velden.rfcId) toegestaan[B.rfcId] = kort(velden.rfcId, 500);
  if (velden.verzonden) toegestaan[B.verzonden] = velden.verzonden;
  if (velden.fout !== undefined) toegestaan[B.fout] = kort(velden.fout, 500);
  if (velden.tekst !== undefined) toegestaan[B.tekst] = kort(velden.tekst, 50000);
  if (!Object.keys(toegestaan).length) return bericht;
  await vraag(`${T_BERICHT}/${bericht.recordId}`, { method: 'PATCH', body: { fields: toegestaan } });
  return Object.assign(bericht, velden);
}

async function berichten(projectCode, gesprekId, { limiet = 100 } = {}) {
  const t = tenant(projectCode);
  const formule = `AND({${B.project}}="${escapeFormula(t)}", {${B.gesprek}}="${escapeFormula(gesprekId)}", NOT({${B.status}}="dubbel"))`;
  const n = Math.min(100, Math.max(1, Number(limiet) || 100));
  const d = await vraag(`${T_BERICHT}?filterByFormula=${encodeURIComponent(formule)}&pageSize=${n}&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(B.aangemaakt)}&sort%5B0%5D%5Bdirection%5D=asc`);
  return (d.records || []).map(berichtVan).filter((b) => b.projectCode === t);
}

module.exports = {
  CONTROLE, KANALEN, GesprekFout,
  vindOfMaak, haal, lijst, zetControle, markeer,
  voegToe, werkBerichtBij, berichten,
  /** Bestaat dit bericht al (op Message Key)? Voor dedup vóór dure stappen. */
  bestaatBericht: (projectCode, sleutel) => zoekBericht(tenant(projectCode), kort(sleutel, 300)),
  _test: { gesprekVan, berichtVan, G, B },
};
