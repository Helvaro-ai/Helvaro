'use strict';
/*
 * Voorraadwaarheid — weet Helvaro NU wat er in de voorraad staat, en hoe zeker?
 *
 * ── Het probleem ────────────────────────────────────────────────────────────
 * Een koper vraagt "is de X5 nog vrij?". Wat de assistent daarop zegt moet uit
 * de voorraad komen, niet uit het model, niet uit een vorig gesprek en niet
 * uit een cache. Maar "uit de voorraad" is maar zo goed als de voorraad zelf:
 * kan Helvaro erbij, en is hij recent genoeg?
 *
 * ── Twee soorten bron ───────────────────────────────────────────────────────
 *   native  De dealer beheert zijn voertuigen IN Helvaro (tabel 'vehicles').
 *           Die tabel IS de bron; elke AI-beurt leest hem live. "Synchroniseren"
 *           is hier een lichte gezondheidscontrole: bereikbaar, aantal, en een
 *           inhoudshash om te zien wat er sinds de vorige controle veranderde.
 *   feed    De voorraad staat in een ander systeem (DMS, AutoScout24-export) dat
 *           een CSV-, JSON- of XML-feed aanbiedt. Hier kan Helvaro ACHTER lopen:
 *           versheid is echt, en een verouderde feed mag nooit als actuele
 *           beschikbaarheid gebracht worden.
 *
 * ── Toestanden ──────────────────────────────────────────────────────────────
 *   HEALTHY   laatste geslaagde sync binnen de versheidsdrempel
 *   SYNCING   er loopt een sync (slot jonger dan SLOT_MS)
 *   STALE     versheidsdrempel overschreden (sync wordt aangestoten)
 *   DEGRADED  laatste poging deels mislukt, of mislukt terwijl er nog een
 *             recente geslaagde is
 *   FAILED    laatste poging mislukt en geen bruikbare geslaagde meer
 *   UNKNOWN   nog nooit gecontroleerd
 *
 * ── Wat de assistent ermee doet ─────────────────────────────────────────────
 * vertrouwen() zegt 'bevestigd' of 'onzeker'. Bij 'onzeker' mag de assistent
 * wel helpen (voertuig herkennen, contact vastleggen, lead maken, verkoper
 * waarschuwen) maar NOOIT beschikbaarheid bevestigen. Zie
 * api/_ai/prompts.js voorraadNotitie en api/_kanaal.js.
 *
 * ── Eindcontrole ────────────────────────────────────────────────────────────
 * hercontroleer() leest de voertuigen die in een antwoord zaten OPNIEUW, vlak
 * voor het versturen. Veranderde status, prijs of kilometerstand tussen het
 * schrijven en het versturen = het antwoord gaat niet ongewijzigd weg.
 *
 * ── Opslag ──────────────────────────────────────────────────────────────────
 * Client Config: 'Inventory Source' (JSON, instellingen) en 'Inventory State'
 * (JSON, toestand + laatste runs). Geen eigen tabel: één rij per dealer is
 * precies wat dit is.
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const vehicles = require('./_vehicles');
const { urlToegestaan } = require('./_lib/fetch-website');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const F_PROJECT = 'fldN4dL0bGgfBOXwM';
const F_SOURCE = 'Inventory Source';
const F_STATE = 'Inventory State';

const TOESTANDEN = Object.freeze(['HEALTHY', 'SYNCING', 'STALE', 'DEGRADED', 'FAILED', 'UNKNOWN']);

/* Standaarddrempels in minuten. Per dealer te overschrijven in Inventory Source.
   native: de controle is goedkoop en de data is live; 15 min is ruim.
   feed:   een feed wordt meestal hooguit elk uur ververst door de bron. */
const STANDAARD = Object.freeze({
  native: { versMin: 15, waarschuwMin: 60, hardMin: 24 * 60 },
  feed:   { versMin: 60, waarschuwMin: 180, hardMin: 12 * 60 },
});

const SLOT_MS = 2 * 60 * 1000;          // een sync die langer duurt geldt als dood
const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_SCHRIJF_PER_RUN = 400;         // rest volgt in de volgende run (DEGRADED 'gedeeltelijk')
const GESCHIEDENIS = 10;

/* ── Client Config lezen/schrijven ─────────────────────────────────────── */
function configured() { return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE); }
function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

async function klantRecord(projectCode) {
  const formule = encodeURIComponent(`{${F_PROJECT}}="${escapeFormula(projectCode)}"`);
  /* Geen fields[]-filter: bestaat 'Inventory State' nog niet (schema-migratie
     nog niet gedraaid), dan geeft een filter erop een 422 in plaats van een
     record zonder dat veld. */
  const r = await at(`${CLIENTS_TABLE}?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) {
    const e = new Error('klantrecord ' + r.status);
    e.status = r.status;
    throw e;
  }
  const d = await r.json();
  return (d.records || [])[0] || null;
}

function leesJson(v, standaard) {
  if (!v) return standaard;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : standaard; } catch { return standaard; }
}

/** Bron-instellingen, gesaneerd. Onbekende waarden vallen terug op native. */
function saneerBron(ruw) {
  const o = ruw && typeof ruw === 'object' ? ruw : {};
  const type = o.type === 'feed' ? 'feed' : 'native';
  const std = STANDAARD[type];
  const getal = (x, d, min, max) => { const n = Number(x); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };
  const bron = {
    type,
    drempels: {
      versMin: getal(o.drempels && o.drempels.versMin, std.versMin, 1, 7 * 24 * 60),
      waarschuwMin: getal(o.drempels && o.drempels.waarschuwMin, std.waarschuwMin, 1, 14 * 24 * 60),
      hardMin: getal(o.drempels && o.drempels.hardMin, std.hardMin, 5, 30 * 24 * 60),
    },
  };
  if (bron.drempels.waarschuwMin < bron.drempels.versMin) bron.drempels.waarschuwMin = bron.drempels.versMin;
  if (bron.drempels.hardMin < bron.drempels.waarschuwMin) bron.drempels.hardMin = bron.drempels.waarschuwMin;
  if (type === 'feed') {
    const url = String(o.url || '').trim().slice(0, 1000);
    bron.url = /^https:\/\/\S+$/i.test(url) ? url : '';
    bron.formaat = ['csv', 'json', 'xml'].includes(o.formaat) ? o.formaat : 'auto';
    /* Verdwijnt een voertuig uit een GESLAAGDE feed: standaard 'verkocht' (met
       Sold At, dus 14 dagen VERKOCHT en daarna het archief in). Nooit
       verwijderen -- leads en afspraken hangen eraan.

       De oude standaard was 'uit aanbod', en die staat in elke opgeslagen
       bron omdat bewaarBron() de GESANEERDE waarde wegschrijft. Geen dealer
       koos hem ooit: het dashboardformulier stuurt dit veld niet mee. Daarom
       leest de oude spelling-met-spatie hier als de nieuwe standaard. Wie echt
       'uit aanbod' wil, schrijft 'uit_aanbod'. */
    bron.verdwenen = o.verdwenen === 'negeren' ? 'negeren'
      : o.verdwenen === 'uit_aanbod' ? 'uit_aanbod'
      : 'verkocht';
    /* Welke provider. Nu alleen 'feed'; zie PROVIDERS. */
    bron.provider = 'feed';
  }
  return bron;
}

async function lees(projectCode) {
  const rec = await klantRecord(projectCode);
  if (!rec) return { rec: null, bron: saneerBron({}), staat: {} };
  const f = rec.fields || {};
  return { rec, bron: saneerBron(leesJson(f[F_SOURCE], {})), staat: leesJson(f[F_STATE], {}) };
}

async function schrijf(recId, velden) {
  const r = await at(`${CLIENTS_TABLE}/${recId}`, { method: 'PATCH', body: { fields: velden } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const e = new Error('state-schrijven ' + r.status + ' ' + txt.slice(0, 160));
    e.status = r.status;
    e.onbekendVeld = /UNKNOWN_FIELD_NAME/.test(txt);
    throw e;
  }
}

/* ── Toestand berekenen (puur) ─────────────────────────────────────────── */
function minutenSinds(iso, nu) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (nu - t) / 60000 : Infinity;
}

/**
 * @returns {{status, ageMin, waarschuwing:boolean, hardVerlopen:boolean}}
 */
function bereken(staat, bron, nu = Date.now()) {
  const s = staat || {};
  const d = (bron && bron.drempels) || STANDAARD.native;
  const age = minutenSinds(s.lastSuccessAt, nu);
  const slotLeeft = s.slot && (nu - Date.parse(s.slot.at || '')) < SLOT_MS;
  let status;
  if (slotLeeft) status = 'SYNCING';
  else if (!s.lastAttemptAt && !s.lastSuccessAt) status = 'UNKNOWN';
  else if (s.lastResult === 'failed') status = age <= d.hardMin ? 'DEGRADED' : 'FAILED';
  else if (s.lastResult === 'partial') status = 'DEGRADED';
  else if (age > d.versMin) status = 'STALE';
  else status = 'HEALTHY';
  return { status, ageMin: Number.isFinite(age) ? Math.round(age) : null, waarschuwing: age > d.waarschuwMin, hardVerlopen: age > d.hardMin };
}

/**
 * Mag de assistent voorraadfeiten BEVESTIGEN?
 * native: ja zolang de tabel leesbaar is (de beurt leest live); een mislukte
 *         laatste controle maakt het onzeker.
 * feed:   alleen als de laatste geslaagde sync binnen de harde drempel valt en
 *         de laatste poging niet mislukte.
 */
function vertrouwen(staat, bron, nu = Date.now()) {
  const b = bereken(staat, bron, nu);
  if (!bron || bron.type !== 'feed') {
    if (b.status === 'FAILED') return { niveau: 'onzeker', reden: 'voorraad_onbereikbaar', ...b };
    return { niveau: 'bevestigd', reden: '', ...b };
  }
  if (b.status === 'UNKNOWN') return { niveau: 'onzeker', reden: 'nooit_gesynchroniseerd', ...b };
  if (b.status === 'FAILED') return { niveau: 'onzeker', reden: 'sync_mislukt', ...b };
  if (b.hardVerlopen) return { niveau: 'onzeker', reden: 'te_oud', ...b };
  return { niveau: 'bevestigd', reden: '', ...b };
}

/* ── Inhoudshash: wat telt als 'veranderd' ─────────────────────────────── */
function vingerafdruk(v) {
  return [v.code, v.status, v.prijs, v.km, v.merk, v.model, v.uitvoering, v.gearchiveerd ? 1 : 0, v.publiek ? 1 : 0].join('|');
}
function hashVan(lijst) {
  const h = crypto.createHash('sha256');
  for (const v of lijst.slice().sort((a, b) => a.code.localeCompare(b.code))) h.update(vingerafdruk(v) + '\n');
  return h.digest('hex').slice(0, 16);
}

/* ── Slot (best effort: Airtable kent geen compare-and-set) ─────────────── */
async function neemSlot(rec, staat, door) {
  const nu = Date.now();
  if (staat.slot && (nu - Date.parse(staat.slot.at || '')) < SLOT_MS) return null;
  const token = crypto.randomBytes(6).toString('hex');
  const nieuw = Object.assign({}, staat, { slot: { token, at: new Date(nu).toISOString(), door: door || 'systeem' } });
  await schrijf(rec.id, { [F_STATE]: JSON.stringify(nieuw) });
  /* Schrijven-dan-teruglezen, zoals api/_voertuigslot.js bevestigClaim: wie als
     laatste schreef wint; de ander ziet een vreemd token en trekt zich terug. */
  const r = await at(`${CLIENTS_TABLE}/${rec.id}?fields[]=${encodeURIComponent(F_STATE)}`);
  if (r.ok) {
    const d = await r.json();
    const terug = leesJson(d.fields && d.fields[F_STATE], {});
    if (!terug.slot || terug.slot.token !== token) return null;
  }
  return token;
}

/* ── Providers ─────────────────────────────────────────────────────────── */

/** native: controleer de tabel, tel, hash, vergelijk met de vorige run. */
async function probeNative(projectCode, vorige) {
  if (!(await vehicles.available())) {
    const reden = vehicles.onbeschikbaarReden();
    const e = new Error(reden === 'geen_tabel' ? 'voertuigentabel bestaat niet' : 'voorraad onbereikbaar');
    e.code = reden || 'onbereikbaar';
    throw e;
  }
  const { vehicles: lijst, afgekapt } = await vehicles.listMetStatus(projectCode, { inclusiefGearchiveerd: true });
  const actief = lijst.filter((v) => !v.gearchiveerd);
  const vorigeCodes = new Map(((vorige && vorige.vingers) || []).map((x) => [x.c, x.h]));
  let changed = 0;
  const nuCodes = new Set();
  const vingers = [];
  for (const v of actief) {
    const h = crypto.createHash('sha1').update(vingerafdruk(v)).digest('hex').slice(0, 10);
    vingers.push({ c: v.code, h });
    nuCodes.add(v.code);
    if (vorigeCodes.size && vorigeCodes.get(v.code) !== h) changed++;
  }
  let removed = 0;
  for (const c of vorigeCodes.keys()) if (!nuCodes.has(c)) removed++;
  return {
    count: actief.length,
    changed, removed, failed: 0,
    version: hashVan(actief),
    vingers: vingers.slice(0, 1500),
    partial: afgekapt,
    notitie: afgekapt ? 'lijst afgekapt op 1000 voertuigen' : '',
  };
}

/* Feed ophalen: https, geen interne adressen (ook niet na DNS), max 5 MB,
   hoogstens twee omleidingen die elk opnieuw gecontroleerd worden. */
async function hostIsExtern(hostname) {
  if (net.isIP(hostname)) return !isInternIp(hostname);
  try {
    const adressen = await dns.lookup(hostname, { all: true });
    return adressen.length > 0 && adressen.every((a) => !isInternIp(a.address));
  } catch { return false; }
}
function isInternIp(ip) {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    || ip === '::1' || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip) || /^::ffff:(10\.|127\.|192\.168\.|169\.254\.)/i.test(ip);
}
async function haalFeed(url) {
  let huidige = url;
  for (let hop = 0; hop <= 2; hop++) {
    const parsed = urlToegestaan(huidige, '[voorraadfeed]');
    if (!parsed || parsed.protocol !== 'https:') { const e = new Error('feed-adres niet toegestaan (alleen https, geen interne adressen)'); e.code = 'url_geweigerd'; throw e; }
    if (!(await hostIsExtern(parsed.hostname))) { const e = new Error('feed-adres wijst naar een intern netwerk'); e.code = 'url_geweigerd'; throw e; }
    const res = await fetch(parsed.toString(), { redirect: 'manual', headers: { 'User-Agent': 'HelvaroInventory/1.0', Accept: 'text/csv,application/json,application/xml,text/xml,*/*' }, signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400) { huidige = new URL(res.headers.get('location') || '', parsed).toString(); continue; }
    if (!res.ok) { const e = new Error('feed antwoordde HTTP ' + res.status); e.code = 'feed_http'; throw e; }
    const lengte = Number(res.headers.get('content-length') || 0);
    if (lengte > MAX_FEED_BYTES) { const e = new Error('feed groter dan 5 MB'); e.code = 'feed_te_groot'; throw e; }
    const tekst = await res.text();
    if (tekst.length > MAX_FEED_BYTES) { const e = new Error('feed groter dan 5 MB'); e.code = 'feed_te_groot'; throw e; }
    return { tekst, type: String(res.headers.get('content-type') || '') };
  }
  const e = new Error('te veel omleidingen'); e.code = 'feed_omleiding'; throw e;
}

/* Kolomnamen die feeds in de praktijk gebruiken, per Helvaro-veld. */
const ALIASSEN = Object.freeze({
  bronId:      ['id', 'vehicleid', 'vehicle_id', 'stocknumber', 'stock_number', 'stock', 'stocknr', 'voorraadnummer', 'referentie', 'reference', 'ref', 'vin', 'guid', 'listingid'],
  merk:        ['make', 'merk', 'brand', 'marque', 'marke', 'manufacturer'],
  model:       ['model', 'modele', 'modell'],
  uitvoering:  ['variant', 'version', 'uitvoering', 'trim', 'type', 'modelversion'],
  prijs:       ['price', 'prijs', 'prix', 'preis', 'saleprice', 'sale_price', 'amount'],
  km:          ['mileage', 'km', 'kilometerstand', 'kilometrage', 'odometer', 'kilometer'],
  inschrijving:['registration', 'firstregistration', 'first_registration', 'year', 'bouwjaar', 'inschrijving', 'erstzulassung', 'annee'],
  brandstof:   ['fuel', 'brandstof', 'carburant', 'kraftstoff', 'fueltype', 'fuel_type'],
  transmissie: ['transmission', 'gearbox', 'transmissie', 'versnellingsbak', 'boite', 'getriebe'],
  kw:          ['powerkw', 'power_kw', 'kw', 'vermogen', 'puissance'],
  carrosserie: ['body', 'bodytype', 'body_type', 'carrosserie', 'karosserie'],
  kleur:       ['color', 'colour', 'kleur', 'couleur', 'farbe'],
  link:        ['url', 'link', 'listingurl', 'listing_url', 'detailurl'],
  fotos:       ['images', 'photos', 'photourls', 'photo_urls', 'image', 'pictures', 'fotos'],
  status:      ['status', 'availability', 'state', 'beschikbaarheid'],
  omschrijving:['description', 'omschrijving', 'remarks'],
});

function normSleutel(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9_]/g, ''); }

/** Eén feedregel (object met willekeurige sleutels) -> Helvaro-velden, of null. */
function mapRegel(ruw) {
  const plat = {};
  for (const [k, v] of Object.entries(ruw || {})) plat[normSleutel(k)] = v;
  const pak = (veld) => { for (const a of ALIASSEN[veld]) { if (plat[a] !== undefined && plat[a] !== null && String(plat[a]).trim() !== '') return plat[a]; } return undefined; };
  const bronId = pak('bronId');
  if (bronId === undefined) return null;
  const getal = (x) => { if (x === undefined) return undefined; const n = Number(String(x).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
  const fotosRuw = pak('fotos');
  const fotos = Array.isArray(fotosRuw) ? fotosRuw.map(String) : (fotosRuw ? String(fotosRuw).split(/[\s,;|]+/) : []);
  const statusRuw = String(pak('status') || '').trim().toLowerCase();
  const statusMap = { available: 'beschikbaar', beschikbaar: 'beschikbaar', disponible: 'beschikbaar', verfugbar: 'beschikbaar', 'in stock': 'beschikbaar', active: 'beschikbaar',
    reserved: 'gereserveerd', gereserveerd: 'gereserveerd', reserve: 'gereserveerd', reserviert: 'gereserveerd',
    sold: 'verkocht', verkocht: 'verkocht', vendu: 'verkocht', verkauft: 'verkocht' };
  return {
    bronId: String(bronId).trim().slice(0, 120),
    merk: pak('merk'), model: pak('model'), uitvoering: pak('uitvoering'),
    prijs: getal(pak('prijs')), km: getal(pak('km')),
    inschrijving: pak('inschrijving') !== undefined ? String(pak('inschrijving')).slice(0, 10) : undefined,
    brandstof: pak('brandstof'), transmissie: pak('transmissie'), kw: getal(pak('kw')),
    carrosserie: pak('carrosserie'), kleur: pak('kleur'),
    link: pak('link') && /^https:\/\//i.test(String(pak('link'))) ? String(pak('link')) : undefined,
    fotos: fotos.filter((u) => /^https:\/\/\S{8,500}$/.test(u)).slice(0, 20),
    /* Staat er een status in de feed die we niet kennen: 'onbekend', niet
       'beschikbaar'. Staat er geen status: aanwezig in de feed = te koop. */
    status: statusRuw ? (statusMap[statusRuw] || 'onbekend') : 'beschikbaar',
    omschrijving: pak('omschrijving') !== undefined ? String(pak('omschrijving')).slice(0, 4000) : undefined,
  };
}

function parseCsv(tekst) {
  const regels = [];
  let rij = [], veld = '', inQuote = false;
  const eersteRegel = tekst.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].map((c) => [c, eersteRegel.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  for (let i = 0; i < tekst.length; i++) {
    const ch = tekst[i];
    if (inQuote) {
      if (ch === '"') { if (tekst[i + 1] === '"') { veld += '"'; i++; } else inQuote = false; }
      else veld += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === sep) { rij.push(veld); veld = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && tekst[i + 1] === '\n') i++;
      rij.push(veld); veld = '';
      if (rij.some((x) => x.trim() !== '')) regels.push(rij);
      rij = [];
    } else veld += ch;
  }
  if (veld !== '' || rij.length) { rij.push(veld); if (rij.some((x) => x.trim() !== '')) regels.push(rij); }
  if (regels.length < 2) return [];
  const kop = regels[0].map((k) => k.trim());
  return regels.slice(1).map((r) => Object.fromEntries(kop.map((k, i) => [k, (r[i] || '').trim()])));
}

function parseJson(tekst) {
  const d = JSON.parse(tekst);
  if (Array.isArray(d)) return d;
  for (const k of ['vehicles', 'items', 'data', 'listings', 'results', 'cars', 'voertuigen', 'ads']) if (Array.isArray(d && d[k])) return d[k];
  return [];
}

/* Bewust simpel: herhaalde elementen met kind-tags. Geen DTD's, geen entiteiten
   (dus geen XXE), geen attributen -- wat een voorraadfeed nodig heeft. */
function parseXml(tekst) {
  const schoon = tekst.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, x) => x.replace(/</g, '&lt;')).replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const kandidaten = ['vehicle', 'car', 'item', 'ad', 'listing', 'voertuig', 'auto'];
  for (const tag of kandidaten) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
    const uit = [];
    let m;
    while ((m = re.exec(schoon)) !== null && uit.length < 5000) {
      const obj = {};
      const kindRe = /<([a-zA-Z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
      let k;
      while ((k = kindRe.exec(m[1])) !== null) {
        const waarde = k[2].replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
        if (obj[k[1]] === undefined) obj[k[1]] = waarde;
        else obj[k[1]] = obj[k[1]] + ' ' + waarde;
      }
      uit.push(obj);
    }
    if (uit.length) return uit;
  }
  return [];
}

function parseFeed(tekst, formaat, contentType) {
  const f = formaat && formaat !== 'auto' ? formaat
    : /json/.test(contentType) || /^\s*[[{]/.test(tekst) ? 'json'
    : /xml/.test(contentType) || /^\s*</.test(tekst) ? 'xml' : 'csv';
  const rijen = f === 'json' ? parseJson(tekst) : f === 'xml' ? parseXml(tekst) : parseCsv(tekst);
  const gezien = new Set();
  const uit = [];
  let ongeldig = 0;
  for (const r of rijen) {
    const m = mapRegel(r);
    if (!m || !m.merk || gezien.has(m.bronId)) { ongeldig++; continue; }
    gezien.add(m.bronId);
    uit.push(m);
  }
  return { formaat: f, voertuigen: uit, ongeldig, hash: crypto.createHash('sha256').update(tekst).digest('hex').slice(0, 16) };
}

/* ── Providers ────────────────────────────────────────────────────────────
   Een provider haalt een voorraad op en geeft hem GENORMALISEERD terug:
   { voertuigen: [mapRegel-vorm], ongeldig, hash }. Alles daarna -- vergelijken,
   verkocht, archief -- is voor elke provider hetzelfde (api/_voorraad-sync.js).

   Nu is er één: 'feed' (CSV, JSON of XML op een https-adres). Dat dekt de
   dealer-export van AutoScout24 en van de gangbare DMS-pakketten. Wat hier
   bewust NIET staat is het periodiek afschrapen van een AutoScout24-
   etalagepagina: dat is geen toegestane integratie. Komt er een officiele
   API-koppeling bij, dan is dat een tweede regel in deze tabel, en verandert
   er verder niets. */
const PROVIDERS = Object.freeze({
  feed: {
    id: 'feed',
    async haal(bron) {
      if (!bron.url) { const e = new Error('geen feed-adres ingesteld'); e.code = 'geen_url'; throw e; }
      const { tekst, type } = await haalFeed(bron.url);
      return parseFeed(tekst, bron.formaat, type);
    },
  },
});

/** feed: ophalen via de provider, verzoenen, alleen de verschillen schrijven. */
async function syncFeed(projectCode, bron, vorige, opties = {}) {
  const provider = PROVIDERS[bron.provider] || PROVIDERS.feed;
  const feed = await provider.haal(bron);
  /* Leeg = de bron is stuk, niet "alle wagens verkocht". Dit gooit, en dan komt
     er geen enkele wagen in aanraking. Regel 1 van api/_voorraad-sync.js. */
  if (!feed.voertuigen.length) { const e = new Error('feed bevat geen herkenbare voertuigen'); e.code = 'feed_leeg'; throw e; }

  /* Incrementeel: dezelfde feed als de vorige geslaagde run = niets te doen.
     Behalve als de vorige run een daling tegenhield en de dealer die nu
     bevestigt -- dan moet het plan juist wel opnieuw. */
  if (!opties.bevestigDaling && vorige && vorige.feedHash === feed.hash && vorige.lastResult === 'ok') {
    return { count: feed.voertuigen.length, changed: 0, removed: 0, failed: 0, ongewijzigd: true, feedHash: feed.hash, version: vorige.version, partial: false };
  }

  const _sync = require('./_voorraad-sync');
  const bestaand = await vehicles.list(projectCode, { inclusiefGearchiveerd: true });
  const nu = new Date().toISOString();
  const plan = _sync.verzoen(bestaand, feed.voertuigen, { nu, verdwenen: bron.verdwenen, bevestigDaling: opties.bevestigDaling });
  const res = await _sync.pasToe(projectCode, plan, { nu, codes: bestaand.map((v) => v.code), max: MAX_SCHRIJF_PER_RUN });
  _sync.logGebeurtenissen(projectCode, plan.gebeurtenissen);

  const notities = [];
  if (res.afgekapt) notities.push(`gedeeltelijk: ${MAX_SCHRIJF_PER_RUN} van ${res.totaal} wijzigingen, rest in de volgende run`);
  if (plan.dalingGeblokkeerd) notities.push(`${plan.verdwenenAantal} wagens ontbreken ineens in de bron en zijn NIET op verkocht gezet -- controleer de feed`);
  const partial = res.failed > 0 || res.afgekapt || plan.dalingGeblokkeerd;
  return {
    count: feed.voertuigen.length,
    changed: plan.nieuw.length + plan.bijwerken.length,
    removed: plan.weg.length,
    failed: res.failed,
    ongeldig: feed.ongeldig,
    aangemaakt: plan.nieuw.length,
    bijgewerkt: plan.bijwerken.length,
    geadopteerd: plan.geadopteerd,
    verkocht: plan.weg.filter((w) => w.invoer.status === 'verkocht').length,
    ongewijzigdAantal: plan.ongewijzigd,
    dalingGeblokkeerd: plan.dalingGeblokkeerd,
    verdwenenAantal: plan.verdwenenAantal,
    /* Een run met fouten of een tegengehouden daling mag de volgende niet laten
       overslaan: dezelfde feed moet dan opnieuw vergeleken worden. */
    feedHash: partial ? '' : feed.hash,
    version: feed.hash,
    partial,
    notitie: notities.join(' · '),
  };
}

/* ── Sync: slot, provider, toestand wegschrijven ───────────────────────── */
async function sync(projectCode, { door = 'systeem', trigger = 'handmatig', bevestigDaling = false } = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new Error('sync zonder projectcode');
  const { rec, bron, staat } = await lees(tenant);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };

  let token;
  try { token = await neemSlot(rec, staat, door); }
  catch (e) {
    if (e.onbekendVeld) { try { require('./_schema').ensureLui(); } catch (_) { /* optioneel */ } }
    return { ok: false, reden: e.onbekendVeld ? 'schema_ontbreekt' : 'slot_mislukt', status: bereken(staat, bron) };
  }
  /* Er loopt al een sync: die hergebruiken in plaats van er een tweede naast
     te zetten. De aanroeper krijgt SYNCING en ziet het resultaat bij de
     volgende controle. */
  if (!token) return { ok: true, hergebruikt: true, ...weergave(staat, bron) };

  const start = Date.now();
  const nuIso = new Date(start).toISOString();
  let resultaat, fout = null;
  try {
    resultaat = bron.type === 'feed' ? await syncFeed(tenant, bron, staat, { bevestigDaling }) : await probeNative(tenant, staat);
  } catch (e) {
    fout = e;
  }
  const run = {
    at: nuIso, trigger, door,
    ok: !fout, ms: Date.now() - start,
    count: resultaat ? resultaat.count : undefined,
    changed: resultaat ? resultaat.changed : undefined,
    removed: resultaat ? resultaat.removed : undefined,
    failed: resultaat ? resultaat.failed : undefined,
    /* De uitsplitsing die het dashboard toont: "3 nieuw, 1 verkocht". */
    aangemaakt: resultaat ? resultaat.aangemaakt : undefined,
    bijgewerkt: resultaat ? resultaat.bijgewerkt : undefined,
    verkocht: resultaat ? resultaat.verkocht : undefined,
    geadopteerd: resultaat ? resultaat.geadopteerd : undefined,
    daling: resultaat && resultaat.dalingGeblokkeerd ? resultaat.verdwenenAantal : undefined,
    fout: fout ? String(fout.message).slice(0, 200) : undefined,
    code: fout ? (fout.code || 'fout') : undefined,
  };
  const nieuw = Object.assign({}, staat, {
    source: bron.type,
    lastAttemptAt: nuIso,
    lastResult: fout ? 'failed' : (resultaat.partial ? 'partial' : 'ok'),
    lastError: fout ? run.fout : (resultaat.notitie || ''),
    lastErrorCode: fout ? run.code : '',
    durationMs: run.ms,
    slot: null,
    runs: [run].concat(Array.isArray(staat.runs) ? staat.runs : []).slice(0, GESCHIEDENIS),
  });
  if (!fout) {
    Object.assign(nieuw, {
      lastSuccessAt: nuIso,
      lastIncrementalAt: resultaat.ongewijzigd ? nuIso : (staat.lastIncrementalAt || ''),
      count: resultaat.count, changed: resultaat.changed, removed: resultaat.removed, failed: resultaat.failed,
      version: resultaat.version,
      generation: (Number(staat.generation) || 0) + (resultaat.version !== staat.version ? 1 : 0),
      feedHash: resultaat.feedHash || '',
      vingers: resultaat.vingers || staat.vingers,
    });
  }
  try { await schrijf(rec.id, { [F_STATE]: JSON.stringify(nieuw) }); }
  catch (e) { console.error('[voorraad] toestand niet weggeschreven voor', tenant, e.message); }

  try {
    const _activiteit = require('./_activiteit');
    _activiteit.log(tenant, fout ? 'inventory_sync_failed' : 'inventory_synced', {
      details: { bron: bron.type, trigger, count: run.count, changed: run.changed, removed: run.removed, failed: run.failed, aangemaakt: run.aangemaakt, verkocht: run.verkocht, daling: run.daling, code: run.code, ms: run.ms },
    }).catch(() => {});
  } catch (_) { /* logboek optioneel */ }
  if (fout) console.warn('[voorraad] sync mislukt voor', tenant, bron.type, fout.code || '', fout.message);
  return { ok: !fout, ...weergave(nieuw, bron) };
}

/**
 * De versheidscontrole bij inloggen en verversen. Licht: alleen metadata lezen;
 * pas als de voorraad verouderd is (of nooit gecontroleerd) volgt een sync.
 */
async function controleer(projectCode, { door = 'dashboard', trigger = 'verversen' } = {}) {
  const { rec, bron, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const b = bereken(staat, bron);
  if (b.status === 'HEALTHY' || b.status === 'SYNCING') return { ok: true, gesynct: false, ...weergave(staat, bron) };
  const uit = await sync(projectCode, { door, trigger });
  return Object.assign({ gesynct: !uit.hergebruikt }, uit);
}

/** Wat het dashboard ziet. Geen tokens, geen vingerafdrukken, geen feed-URL-geheimen. */
function weergave(staat, bron) {
  const s = staat || {};
  const b = bereken(s, bron);
  const v = vertrouwen(s, bron);
  return {
    status: b.status,
    ageMin: b.ageMin,
    waarschuwing: b.waarschuwing,
    vertrouwen: v.niveau,
    vertrouwenReden: v.reden,
    bron: bron ? bron.type : 'native',
    drempels: bron ? bron.drempels : STANDAARD.native,
    feed: bron && bron.type === 'feed' ? { url: bron.url ? bron.url.replace(/([?&](?:key|token|apikey|api_key|secret)=)[^&]+/gi, '$1***') : '', formaat: bron.formaat, verdwenen: bron.verdwenen } : null,
    lastSuccessAt: s.lastSuccessAt || null,
    lastAttemptAt: s.lastAttemptAt || null,
    lastIncrementalAt: s.lastIncrementalAt || null,
    lastResult: s.lastResult || null,
    lastError: s.lastError || '',
    lastErrorCode: s.lastErrorCode || '',
    count: Number.isFinite(s.count) ? s.count : null,
    changed: Number.isFinite(s.changed) ? s.changed : null,
    removed: Number.isFinite(s.removed) ? s.removed : null,
    failed: Number.isFinite(s.failed) ? s.failed : null,
    durationMs: s.durationMs || null,
    version: s.version || null,
    generation: s.generation || 0,
    runs: (s.runs || []).slice(0, GESCHIEDENIS),
  };
}

async function status(projectCode) {
  const { rec, bron, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  return { ok: true, ...weergave(staat, bron) };
}

async function bewaarBron(projectCode, invoer) {
  const { rec, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const bron = saneerBron(invoer);
  if (bron.type === 'feed' && !bron.url) return { ok: false, reden: 'ongeldig_adres' };
  /* Van bron wisselen = de vorige toestand geldt niet meer. */
  const nieuweStaat = Object.assign({}, staat, { feedHash: '', lastResult: staat.lastResult === 'ok' ? 'ok' : staat.lastResult });
  await schrijf(rec.id, { [F_SOURCE]: JSON.stringify(bron), [F_STATE]: JSON.stringify(nieuweStaat) });
  return { ok: true, ...weergave(nieuweStaat, bron) };
}

/** Voor de AI-beurt: kan ik voorraadfeiten bevestigen? Faalt veilig naar 'onzeker'. */
async function vertrouwenVoor(projectCode) {
  try {
    const { bron, staat } = await lees(projectCode);
    return vertrouwen(staat, bron);
  } catch (e) {
    return { niveau: 'onzeker', reden: 'status_onbereikbaar', status: 'UNKNOWN' };
  }
}

/* ── Eindcontrole vlak voor versturen ──────────────────────────────────── */

/** Wat van een voertuig in een antwoord terecht kan komen. */
function momentopname(v) {
  if (!v) return null;
  return { code: v.code, status: vehicles.normStatus(v.status), prijs: v.prijs == null ? null : Number(v.prijs), km: v.km == null ? null : Number(v.km), gearchiveerd: v.gearchiveerd === true };
}

/**
 * Lees de voertuigen van een antwoord opnieuw en vergelijk met wat de AI zag.
 * @param {string} projectCode
 * @param {object[]} snapshots  momentopname()-objecten van bij het schrijven
 * @returns {Promise<{ok:boolean, veranderd:object[], onleesbaar:boolean}>}
 */
async function hercontroleer(projectCode, snapshots) {
  const lijst = (snapshots || []).filter(Boolean);
  if (!lijst.length) return { ok: true, veranderd: [], onleesbaar: false };
  const veranderd = [];
  for (const oud of lijst.slice(0, 12)) {
    const gelezen = await vehicles.leesVers(projectCode, oud.code);
    if (!gelezen.gelezen) return { ok: false, veranderd, onleesbaar: true };
    const nu = gelezen.voertuig;
    const vers = momentopname(nu);
    if (!vers) { veranderd.push({ code: oud.code, wat: 'verdwenen', oud, nu: null }); continue; }
    const wat = [];
    if (vers.status !== oud.status) wat.push('status');
    if (vers.prijs !== oud.prijs) wat.push('prijs');
    if (vers.km !== oud.km) wat.push('km');
    if (vers.gearchiveerd !== oud.gearchiveerd) wat.push('gearchiveerd');
    if (wat.length) veranderd.push({ code: oud.code, wat: wat.join(','), oud, nu: vers, voertuig: nu });
  }
  return { ok: veranderd.length === 0, veranderd, onleesbaar: false };
}

/* Een bedrag of kilometerstand zoals hij in een bericht staat: '24.950',
   '24 950', "24'950", '24950'. Duizendtallen weg, dan zoeken op cijfers. */
function noemtGetal(tekst, n) {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) < 100) return false;
  const plat = String(tekst || '').replace(/(\d)[.\s,'\u202f\u00a0](?=\d{3}(?!\d))/g, '$1');
  return new RegExp('(^|\\D)' + String(Math.round(Number(n))) + '(?!\\d)').test(plat);
}

/**
 * Wat er met een klaar antwoord moet gebeuren nadat de voertuigen opnieuw
 * gelezen zijn. Puur; de aanroeper verstuurt.
 *   versturen     niets veranderd dat in dit antwoord staat
 *   onbeschikbaar een voertuig dat vrij was is intussen verkocht, gereserveerd,
 *                 uit aanbod of verdwenen -- het antwoord kan dat niet weten
 *   nakijken      prijs of kilometerstand in het antwoord klopt niet meer, of
 *                 er staat een prijs in en de controle kon niet lezen
 * @param {string} tekst
 * @param {object[]} snapshots  momentopname() van bij het schrijven
 * @param {{veranderd:object[], onleesbaar:boolean}} controle
 */
function beoordeelVoorVerzenden(tekst, snapshots, controle) {
  const lijst = (snapshots || []).filter(Boolean);
  if (!lijst.length || !controle) return { actie: 'versturen', reden: '' };
  if (controle.onleesbaar) {
    const noemtFeit = lijst.some((v) => noemtGetal(tekst, v.prijs) || noemtGetal(tekst, v.km));
    return noemtFeit ? { actie: 'nakijken', reden: 'controle_onleesbaar' } : { actie: 'versturen', reden: 'controle_onleesbaar' };
  }
  let uit = { actie: 'versturen', reden: '' };
  for (const v of controle.veranderd || []) {
    const oud = v.oud || {};
    const nu = v.nu;
    const wasVrij = oud.status === 'beschikbaar' && !oud.gearchiveerd;
    const nuVrij = Boolean(nu) && nu.status === 'beschikbaar' && !nu.gearchiveerd;
    if (wasVrij && !nuVrij) return { actie: 'onbeschikbaar', reden: nu ? ('status:' + nu.status + (nu.gearchiveerd ? ',gearchiveerd' : '')) : 'verdwenen', code: v.code };
    if (nu && nu.prijs !== oud.prijs && noemtGetal(tekst, oud.prijs)) uit = { actie: 'nakijken', reden: 'prijs', code: v.code };
    else if (nu && nu.km !== oud.km && noemtGetal(tekst, oud.km) && uit.actie === 'versturen') uit = { actie: 'nakijken', reden: 'km', code: v.code };
  }
  return uit;
}

/** De regel die de assistent krijgt als de voorraad niet te vertrouwen is. */
function promptNotitie(v) {
  if (!v || v.niveau !== 'onzeker') return '';
  return '\n\nVOORRAADSTATUS: de voorraad kon niet recent gecontroleerd worden. Bevestig NIET dat een voertuig '
    + 'beschikbaar is, noem geen prijs als definitief en plan geen proefrit. Zeg eerlijk dat je de actuele status '
    + 'laat nakijken door het team, en vraag hoe ze het liefst gecontacteerd worden.';
}

module.exports = {
  TOESTANDEN, STANDAARD,
  bereken, vertrouwen, saneerBron, weergave,
  controleer, sync, status, bewaarBron, vertrouwenVoor,
  momentopname, hercontroleer, beoordeelVoorVerzenden, promptNotitie,
  // voor tests
  _test: { noemtGetal, parseCsv, parseJson, parseXml, parseFeed, mapRegel, hashVan, isInternIp, probeNative },
};
