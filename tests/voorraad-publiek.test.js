'use strict';
/*
 * De publieke voorraad die de website van de dealer leest.
 *
 * Het zwaartepunt ligt op wat er NIET uit mag: de kortingsgrenzen van de
 * verkoper, de voorraad van een andere dealer, gearchiveerde wagens, en een
 * lege etalage op het moment dat Airtable hapert. Dat zijn de fouten die je
 * op een website niet ziet tot een koper of een concurrent ze vindt.
 *
 * Airtable, de rate limiter en het netwerk zijn nep.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';

const _rl = require(BASE + 'api/_ratelimit.js');
const _vehicles = require(BASE + 'api/_vehicles.js');
const pub = require(BASE + 'api/_voorraad-publiek.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
  ok ? pass++ : fail++;
};

/* ── Nep-wereld ─────────────────────────────────────────────────────────── */
const KLANTEN = {
  DEALER1: { 'Project Code': 'DEALER1', 'Client Name': 'Garage Een', Vertical: 'dealership', Active: true },
  DEALER2: { 'Project Code': 'DEALER2', 'Client Name': 'Garage Twee', Vertical: 'dealership', Active: true },
  MAKELAAR: { 'Project Code': 'MAKELAAR', 'Client Name': 'Immo', Vertical: 'vastgoed', Active: true },
  UIT: { 'Project Code': 'UIT', 'Client Name': 'Gestopt', Vertical: 'dealership', Active: false },
};
const rij = (tenant, code, extra) => ({ id: 'rec' + tenant + code, fields: Object.assign({
  'Vehicle Code': code, 'Project Code': tenant, Make: 'BMW', Model: 'X5', Variant: 'xDrive45e',
  Price: 52900, Mileage: 48000, Registration: '05/2023', Fuel: 'benzine', Transmission: 'automaat',
  'Power KW': 290, Status: 'beschikbaar', 'Photo URLs': 'https://img.example/1.jpg\nhttp://onveilig.example/2.jpg',
  'Max Discount EUR': 2500, 'Faro Discount Limit EUR': 1000, Description: 'Eerste eigenaar.',
  Source: 'feed', 'Source Record ID': 'DMS-' + code, 'Synced At': '2026-09-25T08:00:00.000Z',
  'Updated At': '2026-09-25T08:00:00.000Z',
}, extra || {}) });
const VOERTUIGEN = [
  rij('DEALER1', 'V1'),
  rij('DEALER1', 'V2', { Make: 'Audi', Model: 'A6', Variant: '', Price: 39900, Mileage: 90000, Registration: '2019', Fuel: 'diesel' }),
  rij('DEALER1', 'V3', { Status: 'verkocht', 'Sold At': '2026-09-20T10:00:00.000Z' }),
  rij('DEALER1', 'V4', { Status: 'verkocht', 'Sold At': '2026-08-01T10:00:00.000Z', Archived: true }),
  rij('DEALER1', 'V5', { Status: 'uit aanbod' }),
  rij('DEALER1', 'V6', { Public: false }),
  rij('DEALER1', 'V7', { Status: 'gereserveerd', Make: 'Mercedes', Model: 'C-Klasse' }),
  rij('DEALER2', 'V1', { Make: 'Porsche', Model: '911', Price: 149000 }),
];
const net = { klantStatus: 200, beperkt: false };

global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('/tblPidTrwGRzRt4LZ')) {
    if (net.klantStatus !== 200) return json({}, net.klantStatus);
    const m = /\{Project Code\}="([^"]*)"/.exec(u);
    const k = m && KLANTEN[m[1]];
    return json({ records: k ? [{ id: 'recK', fields: k }] : [] });
  }
  if (/\/vehicles\?/.test(u)) {
    const m = /\{Project Code\}="([^"]*)"/.exec(u);
    return json({ records: m ? VOERTUIGEN.filter((r) => r.fields['Project Code'] === m[1]) : VOERTUIGEN.slice(0, 1) });
  }
  return json({ records: [] });
};
_rl.hit = async () => ({ limited: net.beperkt });

async function vraag(pad, query) {
  const res = {
    statusCode: 0, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  const q = Object.assign({ __voorraad: '1' }, query || {});
  const qs = Object.keys(query || {}).map((k) => k + '=' + encodeURIComponent(query[k])).join('&');
  await pub.handler({ method: 'GET', url: pad + (qs ? '?' + qs : ''), query: q, headers: { 'x-forwarded-for': '1.2.3.4' } }, res);
  return res;
}

(async () => {
  console.log('\nTEST 13: alleen de publieke voorraad van DEZE dealer');
  {
    const r = await vraag('/api/inventory/DEALER1');
    ck('200', r.statusCode === 200, r.statusCode);
    const codes = r.body.vehicles.map((v) => v.id).sort();
    ck('beschikbaar en gereserveerd staan erin', codes.includes('V1') && codes.includes('V2') && codes.includes('V7'), codes);
    ck('verkocht staat er standaard NIET in', !codes.includes('V3'), codes);
    ck('gearchiveerd nooit', !codes.includes('V4'));
    ck('uit aanbod nooit', !codes.includes('V5'));
    ck('Public uit nooit', !codes.includes('V6'));
    ck('geen enkele wagen van DEALER2 (Porsche)', !r.body.vehicles.some((v) => v.make === 'Porsche'));

    const r2 = await vraag('/api/inventory/DEALER2');
    ck('DEALER2 ziet alleen zijn eigen wagen', r2.body.vehicles.length === 1 && r2.body.vehicles[0].make === 'Porsche', r2.body.vehicles.map((v) => v.make));
  }

  console.log('\nwat er NOOIT naar buiten mag');
  {
    const r = await vraag('/api/inventory/DEALER1', { sold: '1' });
    const tekst = JSON.stringify(r.body);
    ck('geen kortingsgrens (Max Discount)', !/2500/.test(tekst) && !/maxKorting|maxDiscount|Max Discount/i.test(tekst));
    ck('geen Faro-kortingsgrens', !/faroKorting|Faro Discount/i.test(tekst));
    ck('geen Airtable-rij-ID', !/recDEALER1/.test(tekst));
    ck('geen bron-ID of synctijd', !/DMS-V|Synced At|bronId|gesynct/.test(tekst));
    ck('geen projectcode als veld', !r.body.vehicles.some((v) => 'projectCode' in v));
    ck('alleen https-foto\'s', r.body.vehicles.every((v) => v.photos.every((u) => u.startsWith('https://'))));

    /* De witte lijst zelf: elk veld dat erbij komt moet hier bewust bij. */
    const TOEGESTAAN = ['id', 'slug', 'title', 'make', 'model', 'variant', 'price', 'currency', 'mileage',
      'firstRegistration', 'year', 'fuel', 'transmission', 'powerKw', 'powerHp', 'body', 'color',
      'description', 'highlights', 'photos', 'status', 'soldAt', 'updatedAt', 'enquiryUrl', 'assistantVehicle'];
    const extra = Object.keys(r.body.vehicles[0]).filter((k) => !TOEGESTAAN.includes(k));
    ck('geen veld buiten de witte lijst', extra.length === 0, extra);
  }

  console.log('\nverkocht (VERKOCHT-badge) en de veertien dagen');
  {
    const r = await vraag('/api/inventory/DEALER1', { sold: '1' });
    const v3 = r.body.vehicles.find((v) => v.id === 'V3');
    ck('?sold=1 toont de verkochte wagen', v3 && v3.status === 'sold', v3);
    ck('met soldAt voor de badge', v3 && v3.soldAt === '2026-09-20T10:00:00.000Z');
    ck('verkochte wagens achteraan', r.body.vehicles[r.body.vehicles.length - 1].status === 'sold', r.body.vehicles.map((v) => v.status));
    ck('gearchiveerd ook met ?sold=1 niet', !r.body.vehicles.some((v) => v.id === 'V4'));

    let d = await vraag('/api/inventory/DEALER1/V3');
    ck('detailpagina van een verkochte wagen: 200 met status sold', d.statusCode === 200 && d.body.vehicle.status === 'sold', d.body);
    ck('JSON-LD zegt SoldOut, niet InStock', d.body.jsonLd.offers && d.body.jsonLd.offers.availability === 'https://schema.org/SoldOut', d.body.jsonLd);

    d = await vraag('/api/inventory/DEALER1/V4');
    ck('na de veertien dagen: 410 Gone', d.statusCode === 410, d.statusCode);
    d = await vraag('/api/inventory/DEALER1/V5');
    ck('uit aanbod: 404', d.statusCode === 404);
    d = await vraag('/api/inventory/DEALER1/V6');
    ck('Public uit: 404', d.statusCode === 404);
  }

  console.log('\nde detailpagina');
  {
    let d = await vraag('/api/inventory/DEALER1/V1');
    ck('op code', d.statusCode === 200 && d.body.vehicle.id === 'V1');
    ck('slug eindigt op de code', d.body.vehicle.slug === 'bmw-x5-xdrive45e-v1', d.body.vehicle.slug);
    ck('JSON-LD InStock met echte prijs', d.body.jsonLd.offers.availability === 'https://schema.org/InStock' && d.body.jsonLd.offers.price === 52900);
    ck('JSON-LD zonder lege velden', !JSON.stringify(d.body.jsonLd).includes('undefined'));
    ck('aanvraaglink draagt de wagen mee', d.body.vehicle.enquiryUrl === 'https://app.helvaro.pro/start/DEALER1/V1', d.body.vehicle.enquiryUrl);

    d = await vraag('/api/inventory/DEALER1/bmw-x5-xdrive45e-v1');
    ck('op slug', d.statusCode === 200 && d.body.vehicle.id === 'V1');
    d = await vraag('/api/inventory/DEALER1/bmw-x5-v1');
    ck('een oude slug (voor de titel veranderde) werkt nog', d.statusCode === 200 && d.body.vehicle.id === 'V1');
    d = await vraag('/api/inventory/DEALER2/V3');
    ck('TEST 12: een code van DEALER1 onder DEALER2 bestaat niet', d.statusCode === 404);
  }

  console.log('\nfilters uit echte gegevens');
  {
    let r = await vraag('/api/inventory/DEALER1', { facets: '1' });
    const f = r.body.facets;
    ck('merken met aantallen', f.make.some((x) => x.value === 'BMW') && f.make.some((x) => x.value === 'Audi'), f.make);
    ck('een filter zonder waarden bestaat niet (geen kleur ingevuld)', !('color' in f), Object.keys(f));
    ck('prijsbereik uit de echte prijzen', f.price.min === 39900 && f.price.max === 52900, f.price);
    ck('verkochte wagens tellen niet mee in de filters', f.make.find((x) => x.value === 'BMW').count === 1, f.make);

    r = await vraag('/api/inventory/DEALER1', { make: 'bmw' });
    ck('filter op merk (hoofdletterongevoelig)', r.body.vehicles.length === 1 && r.body.vehicles[0].make === 'BMW');
    r = await vraag('/api/inventory/DEALER1', { maxPrice: '45000' });
    ck('filter op maximumprijs', r.body.vehicles.every((v) => v.price <= 45000) && r.body.vehicles.some((v) => v.id === 'V2'));
    r = await vraag('/api/inventory/DEALER1', { minYear: '2021' });
    ck('filter op bouwjaar', r.body.vehicles.every((v) => v.year >= 2021), r.body.vehicles.map((v) => v.year));
    r = await vraag('/api/inventory/DEALER1', { sort: 'price_asc' });
    const prijzen = r.body.vehicles.map((v) => v.price);
    ck('sorteren op prijs', prijzen.every((p, i) => i === 0 || prijzen[i - 1] <= p), prijzen);
  }

  console.log('\nwie krijgt antwoord');
  {
    let r = await vraag('/api/inventory/MAKELAAR');
    ck('een makelaar: 404', r.statusCode === 404);
    const onbekend = await vraag('/api/inventory/BESTAATNIET');
    ck('onbekende code: 404, en hetzelfde antwoord (niet af te tasten)',
      onbekend.statusCode === 404 && JSON.stringify(onbekend.body) === JSON.stringify(r.body));
    r = await vraag('/api/inventory/UIT');
    ck('uitgeschakelde dealer: 404', r.statusCode === 404);
    r = await vraag('/api/inventory/bad;code');
    ck('ongeldige code: 400', r.statusCode === 400);
  }

  console.log('\nals Helvaro hapert: nooit een lege etalage');
  {
    net.klantStatus = 500;
    let r = await vraag('/api/inventory/DEALER1');
    ck('klantrecord onbereikbaar: 503, geen lege lijst', r.statusCode === 503 && !(r.body && r.body.vehicles), r);
    ck('en niet gecachet', /no-store/.test(r.headers['cache-control']), r.headers['cache-control']);
    net.klantStatus = 200;

    const echt = _vehicles.available;
    _vehicles.available = async () => false;
    r = await vraag('/api/inventory/DEALER1');
    ck('voertuigentabel onbereikbaar: 503, geen lege lijst', r.statusCode === 503 && !(r.body && r.body.vehicles));
    _vehicles.available = echt;

    r = await vraag('/api/inventory/DEALER1');
    ck('succes: CDN mag bij een latere fout een dag de vorige versie tonen', /stale-if-error=86400/.test(r.headers['cache-control']), r.headers['cache-control']);
    ck('en ververst binnen een minuut (prijswijziging zonder deploy)', /s-maxage=60/.test(r.headers['cache-control']));
  }

  console.log('\nde deur');
  {
    net.beperkt = true;
    let r = await vraag('/api/inventory/DEALER1');
    ck('rate limit: 429', r.statusCode === 429);
    net.beperkt = false;
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.statusCode = s; return this; }, json() { return this; }, end() { return this; } };
    await pub.handler({ method: 'OPTIONS', url: '/api/inventory/DEALER1', query: {}, headers: {} }, res);
    ck('OPTIONS: 204 met CORS voor elke oorsprong', res.statusCode === 204 && res.headers['access-control-allow-origin'] === '*');
    r = await vraag('/api/inventory/DEALER1');
    ck('het JSON zelf staat niet in zoekmachines', r.headers['x-robots-tag'] === 'noindex');
  }

  console.log('\nbedrading');
  {
    const form = fs.readFileSync(BASE + 'api/form.js', 'utf8');
    const iVoorraad = form.indexOf("req.query.__voorraad");
    const iPost = form.indexOf("'Access-Control-Allow-Methods', 'POST, OPTIONS'");
    ck('form.js stuurt __voorraad door VOOR de POST-regels', iVoorraad > 0 && iVoorraad < iPost);
    const vj = JSON.parse(fs.readFileSync(BASE + 'vercel.json', 'utf8'));
    const i2 = vj.rewrites.findIndex((r) => r.source === '/api/inventory/:code/:vehicle');
    const i1 = vj.rewrites.findIndex((r) => r.source === '/api/inventory/:code');
    ck('twee rewrites, de specifieke eerst', i2 >= 0 && i1 > i2, { i1, i2 });
    const fns = fs.readdirSync(BASE + 'api').filter((f) => f.endsWith('.js') && !f.startsWith('_'));
    ck('geen nieuwe Vercel-functie (budget: 12)', fns.length === 12, fns.length);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
