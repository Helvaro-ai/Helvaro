'use strict';
/*
 * Provider 'feed': een voorraadfeed op een https-adres (CSV, JSON of XML).
 *
 * Dit is ook "Dealer-website": de meeste DMS-pakketten en websitebouwers
 * leveren hun voorraad als zo'n export, en dit is de enige koppeling die geen
 * toestemming van een derde platform vraagt. Het adres staat in de bron van de
 * dealer; Helvaro leest het alleen.
 *
 * Verhuisd uit api/_inventaris.js (2026-10-05) zonder gedragswijziging, op twee
 * toevoegingen na: een chassisnummer (alleen een echt van 17 tekens) en de
 * HTTP-status op de fout, zodat de foutnormalisatie 401 en 429 kan onderscheiden.
 *
 * Geen route: onderstreepje voorop.
 */

const crypto = require('crypto');
const { urlToegestaan, hostIsExtern, isInternIp } = require('../_lib/fetch-website');
const { normaliseer } = require('./fouten');

const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB

/* Feed ophalen: https, geen interne adressen (ook niet na DNS), max 5 MB,
   hoogstens twee omleidingen die elk opnieuw gecontroleerd worden. */
async function haalFeed(url) {
  let huidige = url;
  for (let hop = 0; hop <= 2; hop++) {
    const parsed = urlToegestaan(huidige, '[voorraadfeed]');
    if (!parsed || parsed.protocol !== 'https:') { const e = new Error('feed-adres niet toegestaan (alleen https, geen interne adressen)'); e.code = 'url_geweigerd'; throw e; }
    if (!(await hostIsExtern(parsed.hostname))) { const e = new Error('feed-adres wijst naar een intern netwerk'); e.code = 'url_geweigerd'; throw e; }
    const res = await fetch(parsed.toString(), { redirect: 'manual', headers: { 'User-Agent': 'HelvaroInventory/1.0', Accept: 'text/csv,application/json,application/xml,text/xml,*/*' }, signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400) { huidige = new URL(res.headers.get('location') || '', parsed).toString(); continue; }
    if (!res.ok) { const e = new Error('feed antwoordde HTTP ' + res.status); e.code = 'feed_http'; e.http = res.status; throw e; }
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
  autoscout:   ['autoscoutid', 'autoscout_id', 'autoscout24id', 'autoscout24_id', 'as24id', 'as24_id'],
  vin:         ['vin', 'chassisnumber', 'chassis_number', 'chassisnr', 'chassisnummer', 'vinnumber', 'fahrgestellnummer', 'vin_number'],
});

/* Een chassisnummer telt alleen als het er echt een is: 17 tekens, geen I, O of Q
   (ISO 3779). Een stocknummer dat toevallig "vin" heet telt niet mee, want op
   dit nummer worden wagens van verschillende platforms aan elkaar gekoppeld. */
function normVin(x) {
  if (x === undefined || x === null) return undefined;
  const v = String(x).trim().toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : undefined;
}

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
    vin: normVin(pak('vin')),
    /* Het AutoScout-nummer, als de feed het meelevert: een van de drie exacte
       sleutels waarmee dezelfde wagen op twee platformen herkend wordt. */
    autoscout: pak('autoscout') !== undefined ? String(pak('autoscout')).trim().toLowerCase().slice(0, 40) : undefined,
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
    if (!m || !m.merk || gezien.has(m.bronId.toLowerCase())) { ongeldig++; continue; }
    gezien.add(m.bronId.toLowerCase());
    uit.push(m);
  }
  return { formaat: f, voertuigen: uit, ongeldig, hash: crypto.createHash('sha256').update(tekst).digest('hex').slice(0, 16) };
}

/* Het feedadres: alleen https, geschoond. Een geheim in de query (key, token)
   blijft staan -- sommige feeds hebben dat nodig -- maar wordt nooit
   teruggegeven aan het scherm (zie maskeerUrl in api/_inventaris.js). */
function saneerFeedBron(o) {
  const url = String((o && o.url) || '').trim().slice(0, 1000);
  return {
    url: /^https:\/\/\S+$/i.test(url) ? url : '',
    formaat: ['csv', 'json', 'xml'].includes(o && o.formaat) ? o.formaat : 'auto',
  };
}

const feed = {
  id: 'feed',
  label: 'Feed / dealer website',
  status: 'ACTIVE',
  auth: 'feed_url',
  kentReservering: true,
  capabilities: { lezen: true, publiceren: false, leads: false },
  saneer: saneerFeedBron,
  async haal(bron) {
    if (!bron.url) { const e = new Error('geen feed-adres ingesteld'); e.code = 'geen_url'; throw e; }
    const { tekst, type } = await haalFeed(bron.url);
    return parseFeed(tekst, bron.formaat, type);
  },
  /* Zonder netwerk: is er een adres? Een echte bereikbaarheidscontrole is een
     sync; die draait elk uur en laat zijn uitkomst achter in de toestand. */
  async health(bron) {
    return bron && bron.url ? { ok: true, toestand: 'ok' } : { ok: false, toestand: 'niet_geconfigureerd' };
  },
  normaliseerFout: normaliseer,
};

module.exports = {
  provider: feed,
  MAX_FEED_BYTES,
  haalFeed, mapRegel, parseCsv, parseJson, parseXml, parseFeed, normVin, isInternIp,
};
