'use strict';
/*
 * Advertenties (listings) -- welk platform heeft welke wagen van welke dealer.
 *
 * ── Waarom dit bestaat ──────────────────────────────────────────────────────
 * Een voertuig in Helvaro is EEN ding: de BMW X5 op de parking. Hij kan op
 * meerdere platformen staan (de website van de dealer, AutoScout24, mobile.de).
 * Zonder dit bestand weet de voorraadsync alleen "deze wagen kwam uit bron X";
 * met dit bestand weet hij "deze wagen staat op A en B", en kan hij dus iets
 * verstandigs zeggen als A hem laat vallen en B niet: nog niet verkocht.
 *
 * Een rij hier is: dealer + platform + advertentie-id -> intern voertuig, met
 * de advertentielink, een status en het laatste moment dat het platform hem nog
 * toonde. De sleutel (Listing Key) is dealer|platform|id, dus dezelfde
 * advertentie kan nooit twee keer voorkomen en twee dealers kunnen nooit
 * dezelfde rij delen.
 *
 * ── Tenant, altijd ──────────────────────────────────────────────────────────
 * Zelfde regel als api/_vehicles.js: projectCode is het EERSTE argument van
 * elke functie, elke query filtert erop, en wat terugkomt wordt nog eens op
 * dealer gefilterd. Schrijven kan alleen rijen waarvan de sleutel met de eigen
 * dealer begint. Deze module leest nooit een request.
 *
 * ── De tabel bestaat misschien nog niet ─────────────────────────────────────
 * Dan is dit een no-op en werkt de sync zoals voor deze module bestond: zie
 * available(). De schemamigratie (api/_schema.js) maakt de tabel aan.
 *
 * Geen route: onderstreepje voorop.
 */

const vehicles = require('./_vehicles');

const TABEL = 'vehicle_listings';

const F = Object.freeze({
  sleutel:      'Listing Key',
  project:      'Project Code',
  voertuig:     'Vehicle Code',
  provider:     'Provider',
  externalId:   'External ID',
  url:          'URL',
  status:       'Status',
  gezien:       'Last Seen At',
  aangemaakt:   'Created At',
});

const STATUSSEN = Object.freeze(['ACTIVE', 'REMOVED']);
const HERPROBEER_MS = 30 * 1000;
const DAG_MS = 24 * 60 * 60 * 1000;
/* Last Seen At hoeft niet elk uur te veranderen: een dag nauwkeurig is genoeg
   om te zien dat een advertentie leeft, en scheelt een schrijfactie per
   wagen per run. */
const GEZIEN_VERS_MS = DAG_MS;

function I() { return vehicles._intern; }
function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function tenantVan(projectCode) { return String(projectCode == null ? '' : projectCode).trim(); }

/** dealer|platform|id, id in kleine letters (zelfde regel als de voorraadsync). */
function sleutel(projectCode, provider, externalId) {
  return [tenantVan(projectCode), String(provider || '').trim().toLowerCase(), String(externalId == null ? '' : externalId).trim().toLowerCase()].join('|');
}

function vanRecord(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id:         rec && rec.id,
    sleutel:    String(f[F.sleutel] || '').trim(),
    projectCode:String(f[F.project] || '').trim(),
    vehicleCode:String(f[F.voertuig] || '').trim(),
    provider:   String(f[F.provider] || '').trim(),
    externalId: String(f[F.externalId] || '').trim(),
    url:        String(f[F.url] || '').trim(),
    status:     STATUSSEN.indexOf(String(f[F.status] || '').trim().toUpperCase()) !== -1 ? String(f[F.status]).trim().toUpperCase() : 'ACTIVE',
    gezien:     String(f[F.gezien] || '').trim(),
    aangemaakt: String(f[F.aangemaakt] || '').trim(),
  };
}

function naarVelden(l, projectCode) {
  const t = tenantVan(projectCode);
  const velden = {
    [F.sleutel]:    sleutel(t, l.provider, l.externalId),
    [F.project]:    t,
    [F.voertuig]:   String(l.vehicleCode || '').trim().slice(0, 40),
    [F.provider]:   String(l.provider || '').trim().toLowerCase().slice(0, 40),
    [F.externalId]: String(l.externalId == null ? '' : l.externalId).trim().slice(0, 120),
    [F.status]:     STATUSSEN.indexOf(l.status) !== -1 ? l.status : 'ACTIVE',
    [F.gezien]:     String(l.gezien || '').slice(0, 40),
  };
  if (l.url) velden[F.url] = String(l.url).slice(0, 500);
  if (l.aangemaakt) velden[F.aangemaakt] = String(l.aangemaakt).slice(0, 40);
  return velden;
}

/* ── Beschikbaarheid ─────────────────────────────────────────────────────── */
let _beschikbaar = null;
let _beschikbaarTot = 0;
let _reden = '';

async function available() {
  if (_beschikbaar === true) return true;
  if (_beschikbaar === false && Date.now() < _beschikbaarTot) return false;
  try {
    const r = await I().atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      _beschikbaarTot = Date.now() + HERPROBEER_MS;
      _reden = r.status === 404 || r.status === 422 ? 'geen_tabel' : 'onbereikbaar';
    } else _reden = '';
  } catch (e) {
    _beschikbaar = false;
    _beschikbaarTot = Date.now() + HERPROBEER_MS;
    _reden = 'onbereikbaar';
  }
  return _beschikbaar;
}
function onbeschikbaarReden() { return _beschikbaar === true ? '' : _reden; }
function _reset() { _beschikbaar = null; _beschikbaarTot = 0; _reden = ''; }

/* ── Lezen ───────────────────────────────────────────────────────────────── */

/**
 * Alle advertenties van deze dealer.
 * @returns {Promise<{listings:object[], afgekapt:boolean, beschikbaar:boolean}>}
 */
async function list(projectCode, opties = {}) {
  const tenant = tenantVan(projectCode);
  if (!tenant) throw new Error('advertenties opvragen zonder projectcode');
  if (!(await available())) return { listings: [], afgekapt: false, beschikbaar: false };
  const formule = encodeURIComponent(`{${F.project}}="${escapeFormula(tenant)}"`);
  const paginas = Math.max(1, Math.min(50, Number(opties.maxPaginas) || 30));
  const uit = [];
  let offset = '', afgekapt = false;
  for (let ronde = 0; ronde < paginas; ronde++) {
    const r = await I().atFetch(`${TABEL}?filterByFormula=${formule}&pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`);
    if (!r.ok) { const e = new Error('advertenties lezen mislukt (' + r.status + ')'); e.code = 'listings_lezen'; throw e; }
    const d = await r.json();
    for (const rec of (d.records || [])) uit.push(vanRecord(rec));
    if (!d.offset) break;
    offset = d.offset;
    if (ronde === paginas - 1) afgekapt = true;
  }
  /* Riem en bretels: wat niet van deze dealer is, komt er nooit uit. */
  return { listings: uit.filter((l) => l.projectCode === tenant && l.sleutel.startsWith(tenant + '|')), afgekapt, beschikbaar: true };
}

/** De advertenties van een enkele wagen (voor leads en het dashboard). */
async function voorVoertuig(projectCode, voertuigCode) {
  const tenant = tenantVan(projectCode);
  if (!tenant) throw new Error('advertenties opvragen zonder projectcode');
  const code = String(voertuigCode || '').trim();
  if (!code || !(await available())) return [];
  const formule = encodeURIComponent(`AND({${F.project}}="${escapeFormula(tenant)}", {${F.voertuig}}="${escapeFormula(code)}")`);
  const r = await I().atFetch(`${TABEL}?filterByFormula=${formule}&pageSize=20`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.records || []).map(vanRecord).filter((l) => l.projectCode === tenant);
}

/* ── Schrijven ───────────────────────────────────────────────────────────── */
const wacht = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Advertenties aanmaken of bijwerken. Een rij met `id` is een bijwerking, een
 * rij zonder een nieuwe. Rijen van een andere dealer worden geweigerd; dat is
 * geen bijzaak: het is wat voorkomt dat een fout in de aanroeper een vreemde
 * dealer raakt.
 * @returns {Promise<{geschreven:number, failed:number, afgekapt:boolean, geweigerd:number}>}
 */
async function schrijf(projectCode, rijen, opties = {}) {
  const tenant = tenantVan(projectCode);
  if (!tenant) throw new Error('advertenties schrijven zonder projectcode');
  const uit = { geschreven: 0, failed: 0, afgekapt: false, geweigerd: 0 };
  const max = Number.isFinite(opties.max) ? opties.max : 400;
  const pauze = Number.isFinite(opties.pauze) ? opties.pauze : 220;
  if (!Array.isArray(rijen) || !rijen.length) return uit;
  if (!(await available())) return uit;

  const nu = opties.nu || new Date().toISOString();
  const toegestaan = rijen.filter((l) => {
    const eigen = sleutel(tenant, l.provider, l.externalId);
    if (!l.provider || !l.externalId || (l.sleutel && l.sleutel !== eigen) || (l.projectCode && l.projectCode !== tenant)) { uit.geweigerd++; return false; }
    return true;
  });
  const maak = toegestaan.filter((l) => !l.id);
  const werk = toegestaan.filter((l) => l.id);

  async function batch(methode, lijst) {
    for (let i = 0; i < lijst.length; i += 10) {
      if (uit.geschreven >= max) { uit.afgekapt = true; return; }
      const deel = lijst.slice(i, i + 10);
      const records = deel.map((l) => {
        const velden = naarVelden(Object.assign({}, l, l.id ? {} : { aangemaakt: nu }), tenant);
        return l.id ? { id: l.id, fields: velden } : { fields: velden };
      });
      let r;
      try { r = await I().atFetch(TABEL, { method: methode, body: JSON.stringify({ records, typecast: true }) }); }
      catch (e) { uit.failed += deel.length; uit.geschreven += deel.length; continue; }
      if (!r.ok) {
        uit.failed += deel.length;
        console.warn('[advertenties] batch', methode, r.status, deel.length, 'rijen');
      }
      uit.geschreven += deel.length;
      if (pauze) await wacht(pauze);
    }
  }
  await batch('POST', maak);
  await batch('PATCH', werk);
  return uit;
}

module.exports = {
  TABEL, F, STATUSSEN, GEZIEN_VERS_MS,
  sleutel, vanRecord, naarVelden,
  available, onbeschikbaarReden, list, voorVoertuig, schrijf,
  _reset,
};
