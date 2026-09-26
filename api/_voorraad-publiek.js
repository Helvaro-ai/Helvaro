'use strict';
/*
 * De publieke voorraad -- wat de website van de dealer uit Helvaro leest.
 *
 *   GET /api/inventory/CODE                 actieve voorraad (+ filters, sortering)
 *   GET /api/inventory/CODE?sold=1          ook de verkochte wagens (14 dagen)
 *   GET /api/inventory/CODE?facets=1        alleen de filterwaarden
 *   GET /api/inventory/CODE/V12             een wagen, op code...
 *   GET /api/inventory/CODE/bmw-x5-v12      ...of op slug
 *
 * Via de rewrite naar api/form.js?__voorraad=1: form.js is al de publieke,
 * rate-gelimiteerde ingang (het leadformulier, de websiteassistent), dus hij
 * hoort daar bij. Een eigen bestand had ook gekund -- Helvaro draait op
 * Vercel Pro, er is geen functielimiet.
 *
 * ── Eén bron van waarheid ───────────────────────────────────────────────────
 * Dit leest api/_vehicles.js en niets anders. De website houdt geen eigen
 * voorraad bij: staat een wagen in Helvaro op verkocht, dan zegt deze feed
 * binnen een minuut 'sold' (zie CACHE), en dat is dezelfde status die de
 * assistent leest en die een proefrit tegenhoudt.
 *
 * ── Wat er NIET naar buiten gaat ────────────────────────────────────────────
 * Een witte lijst, geen zwarte: naarPubliek() noemt elk veld dat mee mag. De
 * kortingsgrenzen (Max Discount, Faro Discount Limit) staan er uitdrukkelijk
 * NIET in -- een koper die in de broncode van de website kan lezen hoeveel
 * korting de verkoper mag geven, onderhandelt anders. Ook niet: de Airtable-
 * rij-ID, de projectcode van de dealer als veld, de bron en de bron-ID, de
 * synctijd, notities of iets van een lead.
 *
 * ── Wie mag lezen ───────────────────────────────────────────────────────────
 * De projectcode staat al in elke publieke formulierlink (/start/CODE), dus
 * dit is geen geheim en wordt ook niet zo behandeld. Wat de blootstelling
 * klein houdt: alleen een ACTIEVE dealer krijgt antwoord (een makelaar of een
 * onbekende code krijgt dezelfde 404, zodat je van buiten niet kunt aftasten
 * wie klant is), alleen wagens met Public aan, en alleen de velden hierboven.
 *
 * ── Als Helvaro hapert ──────────────────────────────────────────────────────
 * Dan liever het laatste goede antwoord dan een lege etalage. stale-if-error
 * laat het CDN een dag lang de vorige versie serveren als deze functie een
 * fout geeft, en een onbereikbare voertuigentabel is een 503 -- nooit een
 * lege lijst, want een lege lijst betekent op een website "niets te koop".
 */

const _vehicles = require('./_vehicles');
const _vertical = require('./_vertical');
const _rl = require('./_ratelimit');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const APP = 'https://app.helvaro.pro';

/* Een website haalt de lijst op bij elke paginaweergave van zijn voorraad-
   pagina. Het CDN vangt dat op (s-maxage); dit plafond is voor wie het CDN
   omzeilt. */
const RL_MAX = 120;
const RL_WINDOW_MS = 60 * 1000;

/* Een minuut vers, daarna vijf minuten "oud maar direct" terwijl er op de
   achtergrond ververst wordt, en bij een fout een dag de vorige versie. Een
   prijswijziging staat dus binnen een minuut op de website, zonder deploy. */
const CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400';

/* ── Vorm ────────────────────────────────────────────────────────────────── */

function slugDeel(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* De slug eindigt op de Helvaro-code. Die verandert nooit (leads hangen
   eraan), dus een slug blijft vindbaar ook als de dealer later "X5" in
   "X5 xDrive45e" verandert: bmw-x5-v12 en bmw-x5-xdrive45e-v12 wijzen
   allebei naar V12. */
function slug(v) {
  const kop = [v.merk, v.model, v.uitvoering].map(slugDeel).filter(Boolean).join('-');
  return (kop ? kop + '-' : '') + String(v.code || '').toLowerCase();
}

function codeUitSlug(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (_vehicles.geldigeCode(t) && !/-/.test(t)) return t.toUpperCase();
  const m = /-([a-z0-9]+)$/i.exec(t);
  return m && _vehicles.geldigeCode(m[1]) ? m[1].toUpperCase() : '';
}

/**
 * De ENIGE vertaling van een interne status naar wat een website te zien
 * krijgt. null = hoort niet op de website.
 */
function publiekeStatus(v) {
  if (!v || v.gearchiveerd || v.publiek === false) return null;
  const s = _vehicles.normStatus(v.status);
  if (s === 'beschikbaar') return 'available';
  if (s === 'gereserveerd') return 'reserved';
  if (s === 'verkocht') return 'sold';
  /* 'uit aanbod' en 'onbekend': daar zeggen we liever niets over dan iets
     wat niet klopt. */
  return null;
}

function jaarUit(inschrijving) {
  const m = /(19|20)\d{2}/.exec(String(inschrijving || ''));
  return m ? Number(m[0]) : null;
}

const getalOfNull = (x) => (Number.isFinite(x) && x > 0 ? x : null);
const tekstOfNull = (x) => { const t = String(x == null ? '' : x).trim(); return t || null; };

/** Witte lijst. Elk veld dat hier niet staat, gaat niet naar buiten. */
function naarPubliek(v, ctx) {
  const status = publiekeStatus(v);
  const titel = [v.merk, v.model, v.uitvoering].filter(Boolean).join(' ');
  return {
    id: v.code,
    slug: slug(v),
    title: titel || null,
    make: tekstOfNull(v.merk),
    model: tekstOfNull(v.model),
    variant: tekstOfNull(v.uitvoering),
    price: getalOfNull(v.prijs),
    currency: 'EUR',
    mileage: Number.isFinite(v.km) && v.km >= 0 ? v.km : null,
    firstRegistration: tekstOfNull(v.inschrijving),
    year: jaarUit(v.inschrijving),
    fuel: tekstOfNull(v.brandstof),
    transmission: tekstOfNull(v.transmissie),
    powerKw: getalOfNull(v.kw),
    powerHp: getalOfNull(v.pk),
    body: tekstOfNull(v.carrosserie),
    color: tekstOfNull(v.kleur),
    description: tekstOfNull(v.omschrijving),
    highlights: Array.isArray(v.troeven) ? v.troeven.filter(Boolean) : [],
    photos: Array.isArray(v.fotos) ? v.fotos.filter((u) => /^https:\/\//i.test(u)) : [],
    status,
    soldAt: status === 'sold' ? tekstOfNull(v.verkochtOp) : null,
    updatedAt: tekstOfNull(v.bijgewerkt),
    /* De aanvraaglink. Die bestaat al (api/form-page.js): de lead draagt de
       voertuigcode mee tot in het gesprek, zodat de assistent niet hoeft te
       raden over welke wagen het gaat. */
    enquiryUrl: `${APP}/start/${encodeURIComponent(ctx.code)}/${encodeURIComponent(v.code)}`,
    /* Voor de websiteassistent: data-vehicle="V12" op de pagina van deze wagen. */
    assistantVehicle: v.code,
  };
}

/**
 * schema.org/Car, alleen uit echte gegevens. Een verkochte wagen is SoldOut:
 * een zoekmachine mag niet de indruk krijgen dat hij te koop staat.
 */
function jsonLd(p, ctx) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: p.title || undefined,
    brand: p.make ? { '@type': 'Brand', name: p.make } : undefined,
    model: p.model || undefined,
    vehicleConfiguration: p.variant || undefined,
    fuelType: p.fuel || undefined,
    vehicleTransmission: p.transmission || undefined,
    bodyType: p.body || undefined,
    color: p.color || undefined,
    productionDate: p.year ? String(p.year) : undefined,
    mileageFromOdometer: p.mileage != null ? { '@type': 'QuantitativeValue', value: p.mileage, unitCode: 'KMT' } : undefined,
    image: p.photos.length ? p.photos : undefined,
    description: p.description || undefined,
  };
  if (p.price) {
    ld.offers = {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: p.currency,
      availability: p.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      seller: ctx.clientName ? { '@type': 'AutoDealer', name: ctx.clientName } : undefined,
    };
  }
  return JSON.parse(JSON.stringify(ld)); // undefined-velden eruit
}

/* ── Filters, uit wat er echt is ─────────────────────────────────────────── */

function facetten(lijst) {
  const tel = (sleutel) => {
    const m = new Map();
    for (const p of lijst) {
      const w = p[sleutel];
      if (w == null || w === '') continue;
      m.set(w, (m.get(w) || 0) + 1);
    }
    return Array.from(m.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  };
  const bereik = (sleutel) => {
    const w = lijst.map((p) => p[sleutel]).filter((x) => Number.isFinite(x));
    return w.length ? { min: Math.min(...w), max: Math.max(...w) } : null;
  };
  /* Een filter zonder waarden wordt weggelaten, niet als leeg getoond: een
     website mag geen keuzelijst "Kleur" tonen als geen enkele wagen een kleur
     heeft. */
  const uit = {
    make: tel('make'), model: tel('model'), fuel: tel('fuel'),
    transmission: tel('transmission'), body: tel('body'), color: tel('color'),
    price: bereik('price'), mileage: bereik('mileage'), year: bereik('year'), powerHp: bereik('powerHp'),
  };
  for (const k of Object.keys(uit)) {
    if (uit[k] === null || (Array.isArray(uit[k]) && !uit[k].length)) delete uit[k];
  }
  return uit;
}

const getalUit = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const zelfde = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function filterEnSorteer(lijst, q) {
  let uit = lijst;
  for (const sleutel of ['make', 'model', 'fuel', 'transmission', 'body', 'color']) {
    if (q[sleutel]) uit = uit.filter((p) => zelfde(p[sleutel], q[sleutel]));
  }
  const minPrijs = getalUit(q.minPrice), maxPrijs = getalUit(q.maxPrice);
  const maxKm = getalUit(q.maxMileage), minJaar = getalUit(q.minYear), maxJaar = getalUit(q.maxYear);
  if (minPrijs != null) uit = uit.filter((p) => p.price != null && p.price >= minPrijs);
  if (maxPrijs != null) uit = uit.filter((p) => p.price != null && p.price <= maxPrijs);
  if (maxKm != null) uit = uit.filter((p) => p.mileage != null && p.mileage <= maxKm);
  if (minJaar != null) uit = uit.filter((p) => p.year != null && p.year >= minJaar);
  if (maxJaar != null) uit = uit.filter((p) => p.year != null && p.year <= maxJaar);

  const SORTEER = {
    price_asc:  (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    price_desc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
    mileage_asc:(a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity),
    year_desc:  (a, b) => (b.year ?? 0) - (a.year ?? 0),
    newest:     (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  };
  const s = SORTEER[q.sort] || SORTEER.newest;
  /* Verkochte wagens altijd achteraan: wie de voorraad doorbladert hoort eerst
     te zien wat hij kan kopen. */
  return uit.slice().sort((a, b) => ((a.status === 'sold') - (b.status === 'sold')) || s(a, b));
}

/* ── Wie is de dealer ────────────────────────────────────────────────────── */

async function dealer(code) {
  const token = process.env.API_AIRTABLE, base = process.env.BASE_AIRTABLE;
  if (!token || !base) return { fout: 'niet_geconfigureerd' };
  const formule = encodeURIComponent(`{Project Code}="${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://api.airtable.com/v0/${base}/${CLIENTS_TABLE}?filterByFormula=${formule}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    if (!r.ok) return { fout: 'onbereikbaar' };
    const rec = ((await r.json()).records || [])[0];
    if (!rec) return { onbekend: true };
    const f = rec.fields || {};
    return {
      actief: f.Active !== false,
      dealer: _vertical.isDealership(f),
      clientName: String(f['Client Name'] || '').trim().slice(0, 120),
    };
  } catch (_) {
    return { fout: 'onbereikbaar' };
  } finally {
    clearTimeout(t);
  }
}

/* ── De route ────────────────────────────────────────────────────────────── */

function padDelen(req) {
  const pad = String(req.url || '').split('?')[0].split('/').filter(Boolean).map((d) => {
    try { return decodeURIComponent(d); } catch { return ''; }
  });
  const i = pad.indexOf('inventory');
  const na = i === -1 ? [] : pad.slice(i + 1);
  const q = req.query || {};
  return {
    code: String(na[0] || q.code || '').trim().toUpperCase(),
    wagen: String(na[1] || q.vehicle || '').trim(),
  };
}

function stuur(res, status, body, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  /* Het JSON-antwoord zelf hoort niet in een zoekmachine; de pagina van de
     dealer wel. */
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(status).json(body);
}

async function handler(req, res) {
  /* Openbare, alleen-lezen gegevens, zonder cookies: elke oorsprong mag lezen.
     Een dealerwebsite op zijn eigen domein moet dit kunnen ophalen. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return stuur(res, 405, { code: 'method_not_allowed' });

  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'onbekend').split(',')[0].trim();
  const gate = await _rl.hit('voorraad', ip, RL_MAX, RL_WINDOW_MS);
  if (gate && gate.limited) return stuur(res, 429, { code: 'rate_limited' });

  const { code, wagen } = padDelen(req);
  if (!/^[A-Z0-9_]{1,50}$/.test(code)) return stuur(res, 400, { code: 'bad_dealer' });

  const d = await dealer(code);
  if (d.fout) return stuur(res, 503, { code: 'unavailable' });
  /* Onbekend, geen dealer, of uitgeschakeld: allemaal dezelfde 404. */
  if (d.onbekend || !d.dealer || !d.actief) return stuur(res, 404, { code: 'not_found' });

  if (!(await _vehicles.available())) return stuur(res, 503, { code: 'unavailable' });
  let alle;
  try {
    alle = await _vehicles.list(code, { inclusiefGearchiveerd: true });
  } catch (e) {
    console.warn('[voorraad-publiek] lijst mislukt voor', code, e && e.message);
    return stuur(res, 503, { code: 'unavailable' });
  }
  const ctx = { code, clientName: d.clientName };
  const q = req.query || {};

  /* ── Een wagen ── */
  if (wagen) {
    const vc = codeUitSlug(wagen);
    const v = vc ? alle.find((x) => x.code === vc) : null;
    if (!v) return stuur(res, 404, { code: 'vehicle_not_found' }, CACHE);
    /* Gearchiveerd = de veertien dagen zijn voorbij. 410 zegt een zoekmachine
       dat de pagina bewust weg is, niet kapot. */
    if (v.gearchiveerd) return stuur(res, 410, { code: 'vehicle_gone' }, CACHE);
    if (!publiekeStatus(v)) return stuur(res, 404, { code: 'vehicle_not_found' }, CACHE);
    const p = naarPubliek(v, ctx);
    return stuur(res, 200, { dealer: { name: d.clientName || null }, vehicle: p, jsonLd: jsonLd(p, ctx) }, CACHE);
  }

  /* ── De lijst ── */
  const metVerkocht = q.sold === '1' || q.sold === 'true';
  const zichtbaar = alle
    .map((v) => (publiekeStatus(v) ? naarPubliek(v, ctx) : null))
    .filter((p) => p && (metVerkocht || p.status !== 'sold'));

  if (q.facets === '1' || q.facets === 'true') {
    return stuur(res, 200, { facets: facetten(zichtbaar.filter((p) => p.status !== 'sold')) }, CACHE);
  }

  const gefilterd = filterEnSorteer(zichtbaar, q);
  const limiet = Math.min(200, Math.max(1, getalUit(q.limit) || 100));
  const vanaf = Math.max(0, getalUit(q.offset) || 0);
  return stuur(res, 200, {
    dealer: { name: d.clientName || null },
    total: gefilterd.length,
    offset: vanaf,
    limit: limiet,
    vehicles: gefilterd.slice(vanaf, vanaf + limiet),
    /* Alleen de filters die over de ACTIEVE voorraad iets zeggen. */
    facets: facetten(zichtbaar.filter((p) => p.status !== 'sold')),
  }, CACHE);
}

module.exports = {
  handler,
  _test: { slug, codeUitSlug, publiekeStatus, naarPubliek, jsonLd, facetten, filterEnSorteer, padDelen, jaarUit, CACHE },
};
