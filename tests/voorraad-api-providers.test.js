'use strict';
/*
 * De twee officiele API-koppelingen (AutoScout24 Listing Creation API en de
 * mobile.de Seller API) en AUTO1.com als niet-bron.
 *
 * Alles loopt door een nagemaakte fetch met antwoorden in de vorm die de
 * officiele documentatie beschrijft (OpenAPI-spec en Seller API-tekst). Er gaat
 * niets over het net, en er wordt niet echt gewacht (wacht is ingespoten).
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.GOOGLE_TOKEN_KEY = 'test-sleutel-voor-versleuteling';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.AS24_API_USER;
delete process.env.AS24_API_PASSWORD;
require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 320)}`); ok ? pass++ : fail++; };
const lees = (p) => fs.readFileSync(BASE + p, 'utf8');

const reg = require(BASE + 'api/_voorraad-providers');
const as24 = require(BASE + 'api/_voorraad-providers/autoscout24-api.js');
const mde = require(BASE + 'api/_voorraad-providers/mobile-de.js');
const as24Profiel = require(BASE + 'api/_voorraad-providers/autoscout24.js');
const creds = require(BASE + 'api/_voorraad-providers/credentials.js');
const fouten = require(BASE + 'api/_voorraad-providers/fouten.js');
const vsync = require(BASE + 'api/_voorraad-sync.js');
const inv = require(BASE + 'api/_inventaris.js');
const i18n = require(BASE + 'api/_i18n.js');

const AS24_URL = 'https://listing-creation.api.autoscout24.com';
const MDE_URL = 'https://services.mobile.de';
const AS24_USER = 'helvaro@example.test';
const AS24_PW = 'helvaro-geheim-wachtwoord';
const basic = (u, p) => 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
const echteWacht = async () => {};

/* ── Een nagemaakt AutoScout24: antwoorden per pad ───────────────────────── */
const ID_A = 'AAAAAAAA-1111-2222-3333-444444444444';
const ID_B = 'bbbbbbbb-1111-2222-3333-444444444444';
const ID_C = 'cccccccc-1111-2222-3333-444444444444';
const MAKES_BE = { makes: [{ id: 13, name: 'BMW', models: [{ id: 1641, name: 'X5', vehicleType: 'C' }], vehicleTypes: ['C'] }] };
const MAKES_99 = { makes: [{ id: 99, name: 'Volvo', models: [{ id: 7, name: 'V60', vehicleType: 'C' }], vehicleTypes: ['C'] }] };
const REFS = { references: [
  { id: 'D', name: 'Diesel', referenceType: 'FuelCategory' }, { id: 'B', name: 'Benzine', referenceType: 'FuelCategory' },
  { id: 'A', name: 'Automatisch', referenceType: 'Transmission' }, { id: 'M', name: 'Manueel', referenceType: 'Transmission' },
  { id: 5, name: 'SUV', referenceType: 'BodyType' }, { id: 6, name: 'Break', referenceType: 'BodyType' },
  { id: 2, name: 'Wit', referenceType: 'BodyColor' },
] };
const detailA = () => ({ id: ID_A.toLowerCase(), make: 13, model: 1641, modelVersion: 'xDrive30d', prices: { public: { price: 48500, currency: 'EUR' } }, mileage: 41200, mileageUnit: 'km',
  firstRegistrationDate: '2021-03', fuelCategory: 'D', transmission: 'A', power: 210, powerUnit: 'kW', bodyType: 5, bodyColor: 2, bodyColorName: 'Alpine White',
  images: [{ id: 'i1', previewUrl: 'https://prod.pictures.autoscout24.net/listing-images/a_1.jpg', md5: 'x' }, { id: 'i2', previewUrl: 'http://onveilig.example/x.jpg' }],
  vin: 'wba12345678901234', description: 'Mooie wagen', publication: { status: 'Active', channels: [] } });
const detailB = () => ({ id: ID_B, make: 99, model: 7, modelVersion: 'D3', prices: { public: { price: 30000, currency: 'EUR' } }, mileage: 20000, mileageUnit: 'mi', fuelCategory: 'B', transmission: 'M', bodyType: 6, power: 110,
  publication: { status: 'Inactive', channels: [] } });

function maakAs24(opties = {}) {
  const st = {
    aanroepen: [], klant: '42', customers: { customers: [{ id: '42', sellId: '1', companyName: 'Garage', canSetMiaRequestedTier: false, canUseSellOnline: true }] },
    lijst: { listings: [{ id: ID_A, createdAt: '2026-01-01T00:00:00Z', lastUpdatedAt: '2026-02-01T00:00:00Z' }, { id: ID_B, createdAt: '2026-01-01T00:00:00Z', lastUpdatedAt: '2026-02-01T00:00:00Z' }] },
    details: { [ID_A]: detailA(), [ID_B]: detailB() },
    status: {},            // pad -> http status (of een functie die een Response-achtig object geeft)
    makes: MAKES_BE, refs: REFS, makesPerId: { 99: MAKES_99 },
  };
  Object.assign(st, opties);
  const json = (o, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(o) });
  st.fetch = async (url, o = {}) => {
    const u = new URL(String(url));
    st.aanroepen.push({ pad: u.pathname, query: u.search, headers: o.headers || {}, methode: o.method });
    const sleutel = u.pathname;
    if (st.status[sleutel]) { const s = st.status[sleutel]; if (typeof s === 'function') return s(st); if (typeof s === 'number') return json({}, s); }
    if (sleutel === '/customers') return json(st.customers);
    if (sleutel === '/customers/' + st.klant + '/listings') return json(st.lijst);
    const dm = new RegExp('^/customers/' + st.klant + '/listings/([^/]+)$').exec(sleutel);
    if (dm) { const d = st.details[decodeURIComponent(dm[1])]; return d ? json(d) : json({ errors: [{ code: 'listing-not-found' }] }, 404); }
    if (sleutel === '/makes') {
      const ids = u.searchParams.getAll('makeId');
      if (ids.length) return json({ makes: ids.flatMap((i) => (st.makesPerId[i] || { makes: [] }).makes) });
      return json(st.makes);
    }
    if (sleutel === '/references') return json(st.refs);
    return json({}, 404);
  };
  return st;
}

(async () => {
  console.log('\nAutoScout24 (API): zonder de gegevens van Helvaro doet de koppeling niets');
  {
    const p = reg.get('autoscout24_api');
    const st = maakAs24();
    ck('status FEED_REQUIRED, geen sync, wel te bewaren', p.status === 'FEED_REQUIRED' && !reg.kanSyncen(p) && reg.kanBewaren(p));
    ck('geen inloggegevens van de dealer nodig (auth customer_id)', p.auth === 'customer_id' && !reg.vraagtCredentials(p));
    ck('en het kan nu niets lezen (capabilities.lezen is onwaar)', p.capabilities.lezen === false && reg.controleerContract(p).length === 0);
    let e; try { await p.haal({ customerId: '42' }, { fetch: st.fetch, wacht: echteWacht }); } catch (x) { e = x; }
    ck('haal() gooit activatie_vereist (PERMISSION_DENIED, zin ACTIVATIE)', e && e.code === 'activatie_vereist' && p.normaliseerFout(e).sleutel === 'ig.fout.ACTIVATIE' && p.normaliseerFout(e).code === 'PERMISSION_DENIED', e && e.code);
    ck('en er is geen enkel verzoek gedaan', st.aanroepen.length === 0, st.aanroepen);
    const h = await p.health({ customerId: '42' }, { fetch: st.fetch });
    ck('health() zegt wacht_op_activatie, ook zonder verzoek', h.ok === false && h.toestand === 'wacht_op_activatie' && st.aanroepen.length === 0, h);
    process.env.AS24_API_USER = AS24_USER;
    ck('slechts een van de twee variabelen is niet genoeg', p.status === 'FEED_REQUIRED');
    process.env.AS24_API_PASSWORD = AS24_PW;
    ck('met beide: ACTIVE, kan synchroniseren en lezen', p.status === 'ACTIVE' && reg.kanSyncen(p) && p.capabilities.lezen === true);
    ck('het register blijft bevroren (de getters veranderen dat niet)', Object.isFrozen(reg.get('autoscout24_api')));
  }

  console.log('\nAutoScout24 (API): het klantnummer van de dealer');
  {
    const p = reg.get('autoscout24_api');
    ck('een numeriek klantnummer', p.saneer({ customerId: '2142082683' }).customerId === '2142082683');
    ck('spaties eraf', p.saneer({ customerId: ' 42 ' }).customerId === '42');
    ck('een pad-sleutel of een adres wordt geweigerd', p.saneer({ customerId: '../x' }).customerId === '' && p.saneer({ customerId: '42/listings' }).customerId === '' && p.saneer({ customerId: 'a b' }).customerId === '');
    ck('leeg of te lang wordt geweigerd', p.saneer({}).customerId === '' && p.saneer({ customerId: 'x'.repeat(41) }).customerId === '');
    ck('het item bewaart alleen het klantnummer, geen inloggegevens', (() => { const i = inv._test.saneerBronItem({ provider: 'autoscout24_api', customerId: '42', credentials: 'v1:AAAA', username: 'x', password: 'y' }); return i.customerId === '42' && !('credentials' in i) && !('password' in i) && !('username' in i); })());
    let e; try { await p.haal({}, { fetch: maakAs24().fetch }); } catch (x) { e = x; }
    ck('zonder klantnummer: MISSING_FIELD met een eigen zin', e && p.normaliseerFout(e).code === 'MISSING_FIELD' && p.normaliseerFout(e).sleutel === 'ig.fout.GEEN_KLANTNUMMER', e && e.code);
  }

  console.log('\nAutoScout24 (API): lezen volgens de spec');
  {
    const p = reg.get('autoscout24_api');
    as24._reset();
    const st = maakAs24();
    const res = await p.haal({ customerId: '42' }, { fetch: st.fetch, wacht: echteWacht });
    const paden = st.aanroepen.map((a) => a.pad);
    ck('de lijst, de details, de merken en de referenties worden gevraagd', paden.includes('/customers/42/listings') && paden.includes('/customers/42/listings/' + ID_A) && paden.includes('/customers/42/listings/' + ID_B) && paden.includes('/makes') && paden.includes('/references'), paden);
    const lijstAanroep = st.aanroepen.find((a) => a.pad === '/customers/42/listings');
    ck('Basic Auth met de gegevens van Helvaro (data provider)', lijstAanroep.headers.Authorization === basic(AS24_USER, AS24_PW), lijstAanroep.headers);
    ck('alleen GET-verzoeken', st.aanroepen.every((a) => a.methode === 'GET'));
    ck('referenties per marktplaats be en cultuur nl-BE, met de vier types', (() => { const r = st.aanroepen.find((a) => a.pad === '/references'); const q = new URLSearchParams(r.query); return q.get('marketplace') === 'be' && q.get('culture') === 'nl-BE' && q.getAll('referenceType').sort().join() === 'BodyColor,BodyType,FuelCategory,Transmission'; })());
    ck('een merk dat de markt niet kent wordt gericht opgezocht (makeId)', st.aanroepen.some((a) => a.pad === '/makes' && new URLSearchParams(a.query).get('makeId') === '99'));
    ck('twee wagens', res.voertuigen.length === 2 && res.formaat === 'autoscout24_api', res.voertuigen.length);
    const a = res.voertuigen.find((v) => v.bronId === ID_A.toLowerCase());
    ck('bronId is het advertentie-id in kleine letters, en ook het AutoScout-nummer', a && a.autoscout === ID_A.toLowerCase(), a);
    ck('merk en model uit de merkenlijst, uitvoering uit modelVersion', a.merk === 'BMW' && a.model === 'X5' && a.uitvoering === 'xDrive30d', a);
    ck('prijs uit prices.public.price, km, inschrijving, kw', a.prijs === 48500 && a.km === 41200 && a.inschrijving === '2021-03' && a.kw === 210, a);
    ck('brandstof, transmissie, carrosserie uit de referenties (kleine letters, behalve carrosserie)', a.brandstof === 'diesel' && a.transmissie === 'automatisch' && a.carrosserie === 'SUV', a);
    ck('kleur: de naam van de fabrikant', a.kleur === 'Alpine White');
    ck('alleen https-foto\'s', a.fotos.length === 1 && a.fotos[0].startsWith('https://'), a.fotos);
    ck('het chassisnummer wordt hoofdletters', a.vin === 'WBA12345678901234', a.vin);
    ck('er is geen verzonnen link: de spec heeft geen advertentieadres', a.link === undefined);
    ck('Active = beschikbaar', a.status === 'beschikbaar');
    const b = res.voertuigen.find((v) => v.bronId === ID_B);
    ck('de gericht opgezochte merk en model komen binnen', b.merk === 'Volvo' && b.model === 'V60', b);
    ck('Inactive = uit aanbod (niet verkocht)', b.status === 'uit aanbod', b.status);
    ck('km in een andere eenheid dan km wordt niet als km gelezen', b.km === undefined, b.km);
    ck('de inhoudshash is stabiel', res.hash === (await p.haal({ customerId: '42' }, { fetch: st.fetch, wacht: echteWacht })).hash);
    ck('geen enkel wachtwoord of header in het resultaat', !JSON.stringify(res).includes(AS24_PW) && !JSON.stringify(res).includes(AS24_USER));
    const aantalRefs = st.aanroepen.filter((x) => x.pad === '/references').length;
    ck('de referentielijsten worden onthouden (een keer gevraagd voor twee runs)', aantalRefs === 1, aantalRefs);

    /* Een advertentie die tussen de lijst en het detail verdween: overgeslagen. */
    as24._reset();
    const st2 = maakAs24({ lijst: { listings: [{ id: ID_A }, { id: ID_B }, { id: ID_C }] } });
    const r2 = await p.haal({ customerId: '42' }, { fetch: st2.fetch, wacht: echteWacht });
    ck('een 404 op een detail: die advertentie bestaat niet meer, de rest komt binnen', r2.voertuigen.length === 2, r2.voertuigen.length);
    as24._reset();
    const s3 = maakAs24({ lijst: { listings: [{ id: ID_A }, { id: ID_A }] } });
    const r3 = await p.haal({ customerId: '42' }, { fetch: s3.fetch, wacht: echteWacht });
    ck('een dubbel id in de lijst wordt een keer gelezen', r3.voertuigen.length === 1 && s3.aanroepen.filter((x) => x.pad.endsWith(ID_A)).length === 1);
    ck('een lege lijst geeft nul wagens (de sync maakt daar een fout van, nooit "alles verkocht")', await (async () => { as24._reset(); const s4 = maakAs24({ lijst: { listings: [] } }); const r = await p.haal({ customerId: '42' }, { fetch: s4.fetch, wacht: echteWacht }); return r.voertuigen.length === 0; })());
    let e; try { as24._reset(); await p.haal({ customerId: '42' }, { fetch: maakAs24({ lijst: { oops: true } }).fetch, wacht: echteWacht }); } catch (x) { e = x; }
    ck('een antwoord zonder listings: INVALID_DATA', e && p.normaliseerFout(e).code === 'INVALID_DATA', e && e.code);
  }

  console.log('\nAutoScout24 (API): fouten uit de spec');
  {
    const p = reg.get('autoscout24_api');
    const probeer = async (st, extra) => { as24._reset(); try { await p.haal({ customerId: '42' }, Object.assign({ fetch: st.fetch, wacht: echteWacht }, extra || {})); return null; } catch (e) { return e; } };
    const norm = (e) => e && p.normaliseerFout(e);
    let st = maakAs24({ status: { '/customers/42/listings': 401 } });
    let e = await probeer(st);
    ck('401 -> AUTH_ERROR, met een zin die Helvaro de schuld geeft (niet "controleer je wachtwoord")', norm(e).code === 'AUTH_ERROR' && norm(e).sleutel === 'ig.fout.AS24_AUTH', norm(e));
    ck('en een 401 wordt niet opnieuw geprobeerd', st.aanroepen.filter((a) => a.pad === '/customers/42/listings').length === 1);
    ck('de foutmelding bevat geen gegevens van Helvaro', !String(e.message).includes(AS24_PW) && !String(e.message).includes(AS24_USER) && !JSON.stringify(norm(e)).includes(AS24_PW));
    e = await probeer(maakAs24({ status: { '/customers/42/listings': 403 } }));
    ck('403 -> PERMISSION_DENIED (de dealer heeft Helvaro niet gemachtigd)', norm(e).code === 'PERMISSION_DENIED' && norm(e).sleutel === 'ig.fout.AS24_TOESTEMMING', norm(e));
    e = await probeer(maakAs24({ status: { '/customers/42/listings': 404 } }));
    ck('404 op de lijst -> INVALID_DATA (onbekend klantnummer)', norm(e).code === 'INVALID_DATA' && norm(e).sleutel === 'ig.fout.AS24_KLANT', norm(e));
    st = maakAs24({ status: { '/customers/42/listings': 429 } });
    let wachtte = [];
    e = await probeer(st, { wacht: async (ms) => { wachtte.push(ms); } });
    ck('429 -> RATE_LIMIT, na drie keer opnieuw proberen met oplopend uitstel (100, 200, 400 + jitter)', norm(e).code === 'RATE_LIMIT' && st.aanroepen.filter((a) => a.pad === '/customers/42/listings').length === 4 && wachtte.length === 3 && wachtte[0] >= 100 && wachtte[0] < 130 && wachtte[1] >= 200 && wachtte[2] >= 400, { w: wachtte, n: st.aanroepen.length });
    let nummer = 0;
    st = maakAs24({ status: { '/customers/42/listings': (s) => (++nummer < 3 ? { ok: false, status: 429, headers: { get: () => null }, text: async () => '' } : { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(s.lijst) }) } });
    as24._reset();
    const herstel = await p.haal({ customerId: '42' }, { fetch: st.fetch, wacht: echteWacht });
    ck('een 429 die overgaat: de run slaagt', herstel.voertuigen.length === 2 && nummer === 3, nummer);
    st = maakAs24({ status: { '/customers/42/listings': 503 } });
    e = await probeer(st);
    ck('503 (onderhoud) -> PROVIDER_DOWN, niet opnieuw geprobeerd', norm(e).code === 'PROVIDER_DOWN' && st.aanroepen.filter((a) => a.pad === '/customers/42/listings').length === 1, norm(e));
    st = maakAs24({ status: { '/customers/42/listings': 500 } });
    e = await probeer(st);
    ck('500 -> PROVIDER_DOWN, wel opnieuw geprobeerd', norm(e).code === 'PROVIDER_DOWN' && st.aanroepen.filter((a) => a.pad === '/customers/42/listings').length === 4);
    e = await probeer(maakAs24({ status: { '/customers/42/listings': () => { const x = new Error('The operation was aborted due to timeout'); x.name = 'TimeoutError'; throw x; } } }));
    ck('een time-out -> SYNC_TIMEOUT', norm(e).code === 'SYNC_TIMEOUT', norm(e));
    e = await probeer(maakAs24({ status: { '/customers/42/listings': () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } } }));
    ck('een netwerkfout -> PROVIDER_DOWN', norm(e).code === 'PROVIDER_DOWN');

    /* Een detail dat faalt: de hele run faalt, nooit een halve voorraad. */
    st = maakAs24({ status: { ['/customers/42/listings/' + ID_B]: 500 } });
    e = await probeer(st);
    ck('een 500 op een detail breekt de hele run af (het is NIET "advertentie weg")', norm(e).code === 'PROVIDER_DOWN');
    st = maakAs24({ lijst: { listings: Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i })) }, details: {}, status: { '/customers/42/listings/d1': 401 } });
    e = await probeer(st);
    const detailAanroepen = st.aanroepen.filter((a) => /listings\/d\d+$/.test(a.pad)).length;
    ck('na de eerste fout starten er geen nieuwe verzoeken meer', norm(e).code === 'AUTH_ERROR' && detailAanroepen <= 6, detailAanroepen);

    /* Tijdsbudget. */
    e = await probeer(maakAs24(), { budgetMs: -1 });
    ck('geen tijd: SYNC_TIMEOUT (bron_onvolledig), niets gelezen', e && e.code === 'bron_onvolledig' && norm(e).code === 'SYNC_TIMEOUT', e && e.code);
    const echteNu = Date.now; let klok = 1000000;
    Date.now = () => klok;
    try {
      st = maakAs24({ lijst: { listings: Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i })) }, details: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['e' + i, Object.assign(detailA(), { id: 'e' + i })])) });
      const f0 = st.fetch;
      st.fetch = async (u, o) => { if (/listings\/e\d+$/.test(String(u))) klok += 30000; return f0(u, o); };
      e = await probeer(st, { budgetMs: 60000 });
      ck('het budget raakt halverwege op: de run faalt, hij levert geen halve lijst', e && e.code === 'bron_onvolledig', e && e.code);
    } finally { Date.now = echteNu; }
  }

  console.log('\nAutoScout24 (API): health() is een goedkope, geautoriseerde aanroep');
  {
    const p = reg.get('autoscout24_api');
    let st = maakAs24();
    let h = await p.health({ customerId: '42' }, { fetch: st.fetch, wacht: echteWacht });
    ck('GET /customers, en het klantnummer staat erin: ok', h.ok === true && st.aanroepen.length === 1 && st.aanroepen[0].pad === '/customers' && st.aanroepen[0].headers.Authorization === basic(AS24_USER, AS24_PW), { h, a: st.aanroepen.length });
    h = await p.health({ customerId: '777' }, { fetch: st.fetch, wacht: echteWacht });
    ck('een klantnummer dat Helvaro niet mag bedienen: niet_gemachtigd', h.ok === false && h.toestand === 'niet_gemachtigd', h);
    h = await p.health({ customerId: '42' }, { fetch: maakAs24({ status: { '/customers': 401 } }).fetch, wacht: echteWacht });
    ck('401 -> auth_error', h.ok === false && h.toestand === 'auth_error', h);
    h = await p.health({}, { fetch: st.fetch });
    ck('zonder klantnummer: niet_geconfigureerd', h.toestand === 'niet_geconfigureerd');
  }

  console.log('\nEen wagen op het profiel EN in de API is een wagen');
  {
    const p = reg.get('autoscout24_api');
    as24._reset();
    const api = (await p.haal({ customerId: '42' }, { fetch: maakAs24().fetch, wacht: echteWacht })).voertuigen;
    const profiel = as24Profiel.mapAutoscout({ id: ID_A.toLowerCase(), url: '/nl/aanbod/bmw-x5-' + ID_A.toLowerCase(), vehicle: { make: 'BMW', model: 'X5' }, prices: { public: { priceRaw: 48500 } } }, 'https://www.autoscout24.be');
    const wagen = (o) => Object.assign({ id: 'rec' + o.code, code: o.code, projectCode: 'P1', merk: 'BMW', model: 'X5', uitvoering: '', prijs: 48500, km: 41200, status: 'beschikbaar', gearchiveerd: false, bron: '', bronId: '', fotos: [], omschrijving: '', link: '', verkochtOp: '', vin: '', autoscout: '' }, o);
    const NU = '2026-10-05T10:00:00.000Z';
    const toon = (provider, voertuigen) => ({ provider, verdwenen: 'verkocht', kentReservering: false, voertuigen });
    ck('het profiel en de API geven hetzelfde nummer', profiel.autoscout === api.find((v) => v.bronId === ID_A.toLowerCase()).autoscout);
    /* De wagen bestaat al via het profiel (zoals bij de live dealer): de API koppelt eraan. */
    const bestaand = [wagen({ code: 'V1', bron: 'feed', bronId: ID_A.toLowerCase(), autoscout: ID_A.toLowerCase() })];
    const lijstBestaand = [{ provider: 'autoscout24', externalId: ID_A.toLowerCase(), vehicleCode: 'V1', status: 'ACTIVE', url: '', gezien: NU }];
    let plan = vsync.verzoenAlles(bestaand, lijstBestaand, [toon('autoscout24', [profiel]), toon('autoscout24_api', api.filter((v) => v.bronId === ID_A.toLowerCase()))], { nu: NU, legacyProvider: 'autoscout24', codesToewijzen: true, geconfigureerd: ['autoscout24', 'autoscout24_api'] });
    ck('geen nieuwe wagen: dezelfde wagen met twee advertenties', plan.nieuw.length === 0 && plan.listings.some((l) => l.provider === 'autoscout24_api' && l.vehicleCode === 'V1' && l.externalId === ID_A.toLowerCase()), plan.listings);
    /* Eerst alleen de API, dan komt het profiel erbij. */
    plan = vsync.verzoenAlles([], [], [toon('autoscout24_api', api.filter((v) => v.bronId === ID_A.toLowerCase())), toon('autoscout24', [profiel])], { nu: NU, legacyProvider: 'autoscout24_api', codesToewijzen: true });
    ck('dezelfde run: een wagen aangemaakt, het profiel hangt er alleen aan', plan.nieuw.length === 1 && plan.listings.length === 2, { n: plan.nieuw.length, l: plan.listings.length });
    /* De API laat hem vallen, het profiel toont hem nog: niet verkocht. */
    const nu2 = vsync.verzoenAlles([wagen({ code: 'V1', bron: 'feed', bronId: ID_A.toLowerCase(), autoscout: ID_A.toLowerCase() })],
      [{ provider: 'autoscout24', externalId: ID_A.toLowerCase(), vehicleCode: 'V1', status: 'ACTIVE', gezien: NU }, { provider: 'autoscout24_api', externalId: ID_A.toLowerCase(), vehicleCode: 'V1', status: 'ACTIVE', gezien: NU }],
      [toon('autoscout24_api', [api.find((v) => v.bronId === ID_B)]), toon('autoscout24', [profiel])], { nu: NU, legacyProvider: 'autoscout24', geconfigureerd: ['autoscout24', 'autoscout24_api'] });
    ck('laat de API de wagen vallen terwijl het profiel hem nog toont: niet verkocht', nu2.weg.length === 0, nu2.weg);
  }

  console.log('\nAutoScout24 (API): de hele sync, met een nagemaakte Airtable');
  {
    const klanten = { DEALERA: { id: 'recKA', fields: { 'Project Code': 'DEALERA', Vertical: 'dealership' } }, DEALERB: { id: 'recKB', fields: { 'Project Code': 'DEALERB', Vertical: 'dealership' } } };
    const db = { vehicles: [], vehicle_listings: [], nr: 0 };
    const as24st = maakAs24();
    const okAt = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
    const echteFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.startsWith(AS24_URL)) return as24st.fetch(u, opts);
      const methode = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      const km = /\/tblPidTrwGRzRt4LZ\/(rec\w+)/.exec(u);
      if (km) { const k = Object.values(klanten).find((x) => x.id === km[1]); if (methode === 'PATCH') Object.assign(k.fields, body.fields); return okAt(k); }
      if (u.includes('/tblPidTrwGRzRt4LZ') && /FIND\(/.test(decodeURIComponent(u))) {
        const dec = decodeURIComponent(u);
        const naald = /FIND\("((?:[^"\\]|\\.)*)"/.exec(dec)[1].replace(/\\"/g, '"');
        const eigen = /NOT\(\{fldN4dL0bGgfBOXwM\}="([^"]*)"\)/.exec(dec)[1];
        return okAt({ records: Object.values(klanten).filter((k) => k.fields['Project Code'] !== eigen && String(k.fields['Inventory Source'] || '').includes(naald)) });
      }
      if (u.includes('/tblPidTrwGRzRt4LZ')) { const m = /\{(?:Project Code|fldN4dL0bGgfBOXwM)\}="([^"]*)"/.exec(decodeURIComponent(u)); const k = m && klanten[m[1]]; return okAt({ records: k ? [k] : [] }); }
      const tm = /appTEST\/(vehicles|vehicle_listings)(\?|$)/.exec(u);
      if (tm) {
        const rijen = db[tm[1]];
        if (methode === 'POST' || methode === 'PATCH') {
          const uit = [];
          for (const r of body.records) {
            if (methode === 'POST') { const n = { id: 'rec' + tm[1][0] + (++db.nr), fields: Object.assign({}, r.fields) }; rijen.push(n); uit.push(n); }
            else { const b = rijen.find((x) => x.id === r.id); if (b) { Object.assign(b.fields, r.fields); uit.push(b); } }
          }
          return okAt({ records: uit });
        }
        const pm = /\{Project Code\}="([^"]*)"/.exec(decodeURIComponent(u));
        return okAt({ records: pm ? rijen.filter((r) => r.fields['Project Code'] === pm[1]) : rijen.slice(0, 1) });
      }
      return okAt({ records: [] });
    };
    try {
      as24._reset();
      const o = await inv.bewaarProvider('DEALERA', { provider: 'autoscout24_api', customerId: '42' });
      const opgeslagen = JSON.parse(klanten.DEALERA.fields['Inventory Source']);
      ck('het klantnummer wordt bewaard', o.ok === true && opgeslagen.bronnen[0].customerId === '42' && !('credentials' in opgeslagen.bronnen[0]), opgeslagen);
      ck('geen wachtwoord of gebruikersnaam van Helvaro in Airtable', !JSON.stringify(klanten.DEALERA.fields).includes(AS24_PW) && !JSON.stringify(klanten.DEALERA.fields).includes(AS24_USER));
      const kaart = (await inv.providersOverzicht('DEALERA')).providers.find((x) => x.id === 'autoscout24_api');
      ck('de kaart: verbonden, klantnummer zichtbaar, geen geheimen', kaart.geconfigureerd === true && kaart.klantnummer === '42' && kaart.status === 'ACTIVE' && kaart.kanSyncen === true && !JSON.stringify(kaart).includes(AS24_PW), kaart);
      /* Een klantnummer is geen geheim: een tweede dealer mag het van de eerste niet overnemen. */
      const kaper = await inv.bewaarProvider('DEALERB', { provider: 'autoscout24_api', customerId: '42' });
      ck('een tweede dealer met hetzelfde klantnummer wordt geweigerd (anders leest hij de voorraad van de eerste)', kaper.ok === false && kaper.reden === 'klantnummer_bezet' && !klanten.DEALERB.fields['Inventory Source'], kaper);
      const eigenOpnieuw = await inv.bewaarProvider('DEALERA', { provider: 'autoscout24_api', customerId: '42' });
      ck('dezelfde dealer mag zijn eigen klantnummer opnieuw bewaren', eigenOpnieuw.ok === true, eigenOpnieuw);
      const ander = await inv.bewaarProvider('DEALERB', { provider: 'autoscout24_api', customerId: '43' });
      ck('een ander nummer mag wel', ander.ok === true && JSON.parse(klanten.DEALERB.fields['Inventory Source']).bronnen[0].customerId === '43', ander);
      await inv.bewaarProvider('DEALERB', { provider: 'autoscout24_api', verwijder: true });
      const fout1 = await inv.bewaarProvider('DEALERA', { provider: 'autoscout24_api', customerId: '../x' });
      ck('een ongeldig klantnummer wordt geweigerd', fout1.ok === false && fout1.reden === 'ongeldige_gegevens', fout1);
      const fout2 = await inv.bewaarProvider('DEALERA', { provider: 'autoscout24_api', customerId: '' });
      ck('en een leeg klantnummer ook', fout2.ok === false, fout2);
      const r = await inv.sync('DEALERA', { door: 'test', budgetMs: 60000 });
      ck('de sync slaagt', r.ok === true, r);
      ck('twee wagens aangemaakt met het kale advertentie-id (de eerste bron)', db.vehicles.length === 2 && db.vehicles.every((v) => v.fields.Source === 'feed' && [ID_A.toLowerCase(), ID_B].includes(v.fields['Source Record ID'])), db.vehicles.map((v) => v.fields['Source Record ID']));
      ck('met AutoScout-nummer en chassisnummer; de niet-gepubliceerde staat op uit aanbod', (() => { const a = db.vehicles.find((v) => v.fields.Make === 'BMW').fields; const b = db.vehicles.find((v) => v.fields.Make === 'Volvo').fields; return a['AutoScout ID'] === ID_A.toLowerCase() && a.VIN === 'WBA12345678901234' && b.Status === 'uit aanbod'; })(), db.vehicles.map((v) => v.fields));
      ck('advertenties met platform autoscout24_api', db.vehicle_listings.length === 2 && db.vehicle_listings.every((l) => l.fields.Provider === 'autoscout24_api'), db.vehicle_listings.map((l) => l.fields.Provider));
      const stand = JSON.parse(klanten.DEALERA.fields['Inventory State']);
      ck('de toestand per bron: ok, twee wagens', stand.bronnen.autoscout24_api.lastResult === 'ok' && stand.bronnen.autoscout24_api.count === 2, stand.bronnen);
      /* Een 403: de dealer trekt de machtiging in. Niets verandert. */
      as24st.status['/customers/42/listings'] = 403;
      const voor = JSON.stringify(db.vehicles.map((v) => v.fields));
      const r2 = await inv.sync('DEALERA', { door: 'test', budgetMs: 60000 });
      const stand2 = JSON.parse(klanten.DEALERA.fields['Inventory State']);
      ck('403: de run mislukt, met genormaliseerde code en zin', r2.ok === false && stand2.bronnen.autoscout24_api.lastErrorCode === 'PERMISSION_DENIED' && stand2.bronnen.autoscout24_api.lastErrorKey === 'ig.fout.AS24_TOESTEMMING', stand2.bronnen.autoscout24_api);
      ck('en geen wagen is veranderd', JSON.stringify(db.vehicles.map((v) => v.fields)) === voor);
      ck('de hele toestand bevat geen geheim', !klanten.DEALERA.fields['Inventory State'].includes(AS24_PW) && !klanten.DEALERA.fields['Inventory State'].includes(AS24_USER));
      /* De gegevens van Helvaro verdwijnen (variabelen weg): de bron wordt overgeslagen, zonder fout of verzoek. */
      delete process.env.AS24_API_USER; delete process.env.AS24_API_PASSWORD;
      as24st.aanroepen.length = 0;
      const r3 = await inv.sync('DEALERA', { door: 'test', budgetMs: 60000 });
      const kaartZonder = (await inv.providersOverzicht('DEALERA')).providers.find((x) => x.id === 'autoscout24_api');
      ck('zonder de gegevens van Helvaro: geen verzoek, de kaart wacht op activatie en toont geen oude fout', as24st.aanroepen.length === 0 && kaartZonder.status === 'FEED_REQUIRED' && kaartZonder.kanSyncen === false && kaartZonder.wachtSleutel === 'ig.wacht.autoscout24_api' && r3.ok === true, { n: as24st.aanroepen.length, k: kaartZonder.status, ok: r3.ok });
      process.env.AS24_API_USER = AS24_USER; process.env.AS24_API_PASSWORD = AS24_PW;
    } finally { global.fetch = echteFetch; }
  }

  console.log('\nmobile.de: lezen volgens de Seller API');
  {
    const p = reg.get('mobile_de');
    const sleutel = creds.versleutel({ username: 'api-gebruiker', password: 'mobile-geheim' });
    const bron = (extra) => Object.assign({ provider: 'mobile_de', credentials: sleutel }, extra || {});
    const ADS = { ads: [
      { mobileAdId: '173955', mobileSellerId: '12', creationDate: '2015-12-01T18:40:44+01:00', make: 'AUDI', model: 'A4', modelDescription: 'A4 Avant 2.0 TFSI multitronic Attraction', category: 'EstateCar', vehicleClass: 'Car', condition: 'USED',
        firstRegistration: '201002', mileage: 25000, power: 155, fuel: 'PETROL', gearbox: 'AUTOMATIC_GEAR', vin: 'WAUZZZ8E9TA002011', exteriorColor: 'SILVER', manufacturerColorName: 'Silver Moon',
        price: { dealerPriceGross: '12541.81', consumerPriceGross: '13169.72', vatRate: '19.60', type: 'FIXED', currency: 'EUR' },
        images: [{ ref: 'https://img.classistatic.de/api/v1/mo-prod/images/46/467621f9-dcca-4c7f-ba2b-5f50942b713b?rule=mo-640.jpg', hash: 'e7f6' }, { ref: 'http://x.example/nee.jpg' }], description: 'Getriebe Automatik', reserved: false },
      { mobileAdId: '260251', mobileSellerId: '12', make: 'ASTON MARTIN', model: 'DB9', modelDescription: 'DB9 Volante', category: 'Cabrio', fuel: 'HYBRID_DIESEL', gearbox: 'SEMIAUTOMATIC_GEAR', power: 283, price: { consumerPriceGross: '19000.00', type: 'FIXED', currency: 'EUR' }, reserved: true, vin: 'ABC123' },
      { mobileAdId: '363142', mobileSellerId: '12', make: 'IVECO', modelDescription: '420 SX', category: 'CementMixerTruck', price: { type: 'ON_REQUEST', currency: 'EUR' }, firstRegistration: '200302', mileage: 26000, fuel: 'IETS_NIEUWS' },
      { mobileAdId: '999', mobileSellerId: '12', model: 'Zonder merk' },
    ] };
    const maak = (o = {}) => {
      const st = Object.assign({ aanroepen: [], sellers: { sellers: [{ mobileSellerId: '12', customerNumber: '8', type: 'DEALER', siteId: 'GERMANY', readonly: false, companyName: 'Smoke AG' }] }, ads: ADS, status: {} }, o);
      st.fetch = async (url, opts = {}) => {
        const u = new URL(String(url));
        st.aanroepen.push({ pad: u.pathname, headers: opts.headers || {}, methode: opts.method });
        if (st.status[u.pathname]) return { ok: false, status: st.status[u.pathname], headers: { get: () => null }, text: async () => '{"errors":[]}' };
        const j = (x) => ({ ok: true, status: 200, headers: { get: () => 'application/vnd.de.mobile.api+json' }, text: async () => JSON.stringify(x) });
        if (u.pathname === '/seller-api/sellers') return j(st.sellers);
        const m = /^\/seller-api\/sellers\/([^/]+)\/ads$/.exec(u.pathname);
        if (m) return j(st.ads);
        return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
      };
      return st;
    };
    ck('mobile.de is ACTIVE, leest, en kent reserveringen niet terug (een reservering van de dealer blijft)', p.status === 'ACTIVE' && p.capabilities.lezen === true && p.kentReservering === false && reg.kanSyncen(p));
    let st = maak();
    const res = await p.haal(bron(), { fetch: st.fetch, wacht: echteWacht });
    ck('eerst de verkopers, dan de advertenties van die verkoper', st.aanroepen.map((a) => a.pad).join() === '/seller-api/sellers,/seller-api/sellers/12/ads', st.aanroepen.map((a) => a.pad));
    ck('Accept: application/vnd.de.mobile.api+json bij elk verzoek', st.aanroepen.every((a) => a.headers.Accept === 'application/vnd.de.mobile.api+json'), st.aanroepen.map((a) => a.headers.Accept));
    ck('Basic Auth met de gegevens van de dealer', st.aanroepen.every((a) => a.headers.Authorization === basic('api-gebruiker', 'mobile-geheim')));
    ck('alleen GET', st.aanroepen.every((a) => a.methode === 'GET'));
    ck('drie wagens: de vierde heeft geen merk en telt als ongeldig', res.voertuigen.length === 3 && res.ongeldig === 1, { n: res.voertuigen.length, o: res.ongeldig });
    const a = res.voertuigen.find((v) => v.bronId === '173955');
    ck('merk, model, uitvoering', a.merk === 'AUDI' && a.model === 'A4' && a.uitvoering.startsWith('A4 Avant'), a);
    ck('prijs uit consumerPriceGross (een tekst met decimalen)', a.prijs === 13169.72, a.prijs);
    ck('km, kw, inschrijving (yyyyMM -> yyyy-MM)', a.km === 25000 && a.kw === 155 && a.inschrijving === '2010-02', a);
    ck('brandstof en transmissie uit de gedocumenteerde waarden', a.brandstof === 'benzine' && a.transmissie === 'automatisch', a);
    ck('carrosserie = category, kleur = de naam van de fabrikant', a.carrosserie === 'EstateCar' && a.kleur === 'Silver Moon', a);
    ck('foto\'s: alleen https, uit images[].ref', a.fotos.length === 1 && a.fotos[0].startsWith('https://img.classistatic.de/'), a.fotos);
    ck('het chassisnummer klopt, en een ongeldig nummer telt niet', a.vin === 'WAUZZZ8E9TA002011' && res.voertuigen.find((v) => v.bronId === '260251').vin === undefined);
    ck('geen link: de documentatie heeft er geen', a.link === undefined);
    ck('reserved: true = gereserveerd, anders beschikbaar', res.voertuigen.find((v) => v.bronId === '260251').status === 'gereserveerd' && a.status === 'beschikbaar');
    ck('hybride (diesel) en halfautomatisch', (() => { const x = res.voertuigen.find((v) => v.bronId === '260251'); return x.brandstof === 'hybride (diesel)' && x.transmissie === 'halfautomatisch'; })());
    ck('prijs "op aanvraag" en een onbekende brandstof blijven leeg (niet raden)', (() => { const x = res.voertuigen.find((v) => v.bronId === '363142'); return x.prijs === undefined && x.brandstof === undefined; })());
    ck('nooit de gegevens van de dealer in het resultaat', !JSON.stringify(res).includes('mobile-geheim') && !JSON.stringify(res).includes('api-gebruiker'));

    st = maak();
    await p.haal(bron({ mobileSellerId: '77' }), { fetch: st.fetch, wacht: echteWacht });
    ck('met een verkoper-id: geen zoekactie, direct zijn advertenties', st.aanroepen.length === 1 && st.aanroepen[0].pad === '/seller-api/sellers/77/ads', st.aanroepen.map((x) => x.pad));
    const probeer = async (s, b) => { try { await p.haal(b || bron(), { fetch: s.fetch, wacht: echteWacht }); return null; } catch (e) { return e; } };
    const norm = (e) => e && p.normaliseerFout(e);
    let e = await probeer(maak({ sellers: { sellers: [] } }));
    ck('geen verkopers: MISSING_FIELD met eigen zin', norm(e).code === 'MISSING_FIELD' && norm(e).sleutel === 'ig.fout.GEEN_VERKOPER', norm(e));
    e = await probeer(maak({ sellers: { sellers: [{ mobileSellerId: '1' }, { mobileSellerId: '2' }] } }));
    ck('meerdere verkopers: de dealer moet kiezen (INVALID_DATA, zin KIES_VERKOPER), er wordt niets geraden', norm(e).code === 'INVALID_DATA' && norm(e).sleutel === 'ig.fout.KIES_VERKOPER', norm(e));
    e = await probeer(maak({ sellers: { oops: 1 } }));
    ck('een antwoord zonder sellers: INVALID_DATA', norm(e).code === 'INVALID_DATA');
    e = await probeer(maak({ ads: { oops: 1 } }));
    ck('een antwoord zonder ads: INVALID_DATA', norm(e).code === 'INVALID_DATA');
    e = await probeer(maak(), { credentials: '' });
    ck('zonder gegevens: MISSING_FIELD', norm(e).code === 'MISSING_FIELD' && e.code === 'geen_credentials');
    e = await probeer(maak({ status: { '/seller-api/sellers': 401 } }));
    ck('401 -> AUTH_ERROR met de gewone zin (de dealer kan zijn gegevens nakijken)', norm(e).code === 'AUTH_ERROR' && norm(e).sleutel === 'ig.fout.AUTH_ERROR', norm(e));
    e = await probeer(maak({ status: { '/seller-api/sellers': 403 } }));
    ck('403 -> PERMISSION_DENIED', norm(e).code === 'PERMISSION_DENIED');
    e = await probeer(maak({ status: { '/seller-api/sellers/12/ads': 404 } }));
    ck('404 (verkoper niet gekoppeld aan dit account) -> PERMISSION_DENIED', norm(e).code === 'PERMISSION_DENIED', norm(e));
    st = maak({ status: { '/seller-api/sellers/12/ads': 429 } });
    e = await probeer(st);
    ck('429 -> RATE_LIMIT na nieuwe pogingen', norm(e).code === 'RATE_LIMIT' && st.aanroepen.filter((x) => x.pad.endsWith('/ads')).length === 4);
    st = maak({ status: { '/seller-api/sellers/12/ads': 503 } });
    e = await probeer(st);
    ck('503 -> PROVIDER_DOWN, een keer', norm(e).code === 'PROVIDER_DOWN' && st.aanroepen.filter((x) => x.pad.endsWith('/ads')).length === 1);
    e = await probeer(maak({ status: { '/seller-api/sellers/12/ads': 500 } }));
    ck('500 -> PROVIDER_DOWN', norm(e).code === 'PROVIDER_DOWN');
    e = await probeer(maak({ status: { '/seller-api/sellers/12/ads': 405 } }));
    ck('405 (de Accept-header wordt niet geaccepteerd) -> INVALID_DATA', norm(e).code === 'INVALID_DATA');
    let h = await p.health(bron(), { fetch: maak().fetch, wacht: echteWacht });
    ck('health(): GET /seller-api/sellers, ok', h.ok === true && h.toestand === 'ok', h);
    h = await p.health(bron(), { fetch: maak({ status: { '/seller-api/sellers': 401 } }).fetch, wacht: echteWacht });
    ck('health() bij 401: auth_error', h.ok === false && h.toestand === 'auth_error', h);
    ck('health() zonder gegevens: niet_geconfigureerd, zonder verzoek', (await p.health({}, { fetch: () => { throw new Error('geen net'); } })).toestand === 'niet_geconfigureerd');
    ck('een verkoper-id met rare tekens wordt geweigerd', p.saneer({ mobileSellerId: '../12' }).mobileSellerId === '' && p.saneer({ mobileSellerId: '12' }).mobileSellerId === '12');
  }

  console.log('\nmobile.de: opslaan en echt synchroniseren');
  {
    const klanten = { DEALERA: { id: 'recKA', fields: { 'Project Code': 'DEALERA', Vertical: 'dealership' } } };
    const db = { vehicles: [], vehicle_listings: [], nr: 0 };
    const aanroepen = [];
    const okAt = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
    const echteFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.startsWith(MDE_URL)) {
        aanroepen.push({ u, h: opts.headers });
        const j = (x) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(x) });
        if (u.endsWith('/seller-api/sellers')) return j({ sellers: [{ mobileSellerId: '12' }] });
        return j({ ads: [{ mobileAdId: '1', make: 'VW', model: 'Golf', modelDescription: 'Golf 8', price: { consumerPriceGross: '21000.00' }, mileage: 12000, vin: 'WVWZZZ1KZAW123456' }, { mobileAdId: '2', make: 'Seat', model: 'Leon', price: { consumerPriceGross: '15000.00' } }] });
      }
      const methode = opts.method || 'GET';
      const body = opts.body ? JSON.parse(opts.body) : null;
      const km = /\/tblPidTrwGRzRt4LZ\/(rec\w+)/.exec(u);
      if (km) { const k = Object.values(klanten).find((x) => x.id === km[1]); if (methode === 'PATCH') Object.assign(k.fields, body.fields); return okAt(k); }
      if (u.includes('/tblPidTrwGRzRt4LZ')) { const m = /\{(?:Project Code|fldN4dL0bGgfBOXwM)\}="([^"]*)"/.exec(decodeURIComponent(u)); const k = m && klanten[m[1]]; return okAt({ records: k ? [k] : [] }); }
      const tm = /appTEST\/(vehicles|vehicle_listings)(\?|$)/.exec(u);
      if (tm) {
        const rijen = db[tm[1]];
        if (methode === 'POST' || methode === 'PATCH') {
          const uit = [];
          for (const r of body.records) {
            if (methode === 'POST') { const n = { id: 'rec' + tm[1][0] + (++db.nr), fields: Object.assign({}, r.fields) }; rijen.push(n); uit.push(n); }
            else { const b = rijen.find((x) => x.id === r.id); if (b) { Object.assign(b.fields, r.fields); uit.push(b); } }
          }
          return okAt({ records: uit });
        }
        const pm = /\{Project Code\}="([^"]*)"/.exec(decodeURIComponent(u));
        return okAt({ records: pm ? rijen.filter((r) => r.fields['Project Code'] === pm[1]) : rijen.slice(0, 1) });
      }
      return okAt({ records: [] });
    };
    try {
      const o = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', credentials: { username: 'api-gebruiker', password: 'mobile-geheim' }, mobileSellerId: '12' });
      const opgeslagen = klanten.DEALERA.fields['Inventory Source'];
      ck('bewaard: versleuteld, het verkoper-id erbij, geen platte tekst', o.ok === true && /"credentials":"v1:/.test(opgeslagen) && !opgeslagen.includes('mobile-geheim') && JSON.parse(opgeslagen).bronnen[0].mobileSellerId === '12', opgeslagen.slice(0, 200));
      ck('het antwoord en de kaart bevatten geen geheim', !JSON.stringify(o).includes('mobile-geheim') && (await inv.providersOverzicht('DEALERA')).providers.find((x) => x.id === 'mobile_de').verkoperId === '12');
      const r = await inv.sync('DEALERA', { door: 'test', budgetMs: 60000 });
      ck('met opgeslagen gegevens synchroniseert hij echt', r.ok === true && db.vehicles.length === 2, { ok: r.ok, n: db.vehicles.length });
      ck('met de Accept-header en de gegevens van de dealer', aanroepen.length >= 1 && aanroepen.every((a) => a.h.Accept === 'application/vnd.de.mobile.api+json' && a.h.Authorization === basic('api-gebruiker', 'mobile-geheim')));
      ck('het verkoper-id staat er direct in (geen zoekactie)', aanroepen.length === 1 && aanroepen[0].u.endsWith('/seller-api/sellers/12/ads'), aanroepen.map((a) => a.u));
      ck('de advertentie-sleutel is dealer|mobile_de|id', db.vehicle_listings.length === 2 && db.vehicle_listings.every((l) => l.fields['Listing Key'].startsWith('DEALERA|mobile_de|')), db.vehicle_listings.map((l) => l.fields['Listing Key']));
      const zonderVerkoper = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', mobileSellerId: '../x' });
      ck('een ongeldig verkoper-id wordt geweigerd', zonderVerkoper.ok === false && zonderVerkoper.reden === 'ongeldige_gegevens', zonderVerkoper);
      const andersAdres = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', mobileSellerId: '13' });
      const nu = JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen[0];
      ck('alleen het verkoper-id wijzigen laat de gegevens staan', andersAdres.ok === true && /^v1:/.test(nu.credentials) && nu.mobileSellerId === '13', nu);
    } finally { global.fetch = echteFetch; }
  }

  console.log('\nAUTO1.com / wijkopenautos.be: via een export of feed van AUTO1.com Remarketing');
  {
    const p = reg.get('auto1');
    ck('staat in het register met de juiste naam', p && p.label === 'AUTO1.com / wijkopenautos.be' && p.id === 'auto1');
    ck('ACTIVE via het feedpad: lezen, uploaden, geen eigen API', p.status === 'ACTIVE' && p.auth === 'csv' && p.capabilities.lezen === true && reg.kanSyncen(p) && reg.kanUploaden(p) && !reg.vraagtCredentials(p));
  }

  console.log('\nTeksten en geen platformlogica in het register');
  {
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const w = i18n.woordenboek(taal);
      const sleutels = ['ig.fout.AS24_AUTH', 'ig.fout.AS24_TOESTEMMING', 'ig.fout.AS24_KLANT', 'ig.fout.GEEN_KLANTNUMMER', 'ig.fout.GEEN_VERKOPER', 'ig.fout.KIES_VERKOPER', 'ig.wacht.autoscout24_api', 'ig.uitleg.autoscout24_api', 'ig.uitleg.mobile_de', 'ig.uitleg.gocar', 'ig.uitleg.auto1', 'ig.veld.klantnummer', 'ig.veld.verkoper'];
      ck(`${taal}: de nieuwe kaartteksten bestaan`, sleutels.every((k) => w[k] && w[k].length > 5), sleutels.filter((k) => !w[k]));
    }
    const nl = i18n.woordenboek('nl');
    ck('de AUTO1-uitleg noemt Remarketing en dat wijkopenautos.be zelf wagens van particulieren koopt', /Remarketing/.test(nl['ig.uitleg.auto1']) && /particulieren/.test(nl['ig.uitleg.auto1']));
    const as24Bron = lees('api/_voorraad-providers/autoscout24-api.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ck('de gegevens van Helvaro komen alleen uit de omgeving, nooit uit de bron of het scherm', /process\.env\.AS24_API_USER/.test(as24Bron) && !/body\.|req\./.test(as24Bron));
    ck('nergens een AS24-gegeven in een route, scherm of vertaling', !/AS24_API_(USER|PASSWORD)/.test(lees('api/leads.js') + lees('api/_dash/integraties.js') + lees('api/_i18n.js') + lees('api/_inventaris.js')));
    ck('api/_inventaris.js bleef vrij van platformnamen en eindpunten', !/'(autoscout24|autoscout24_api|mobile_de|gocar|auto1)'|listing-creation|services\.mobile\.de/.test(lees('api/_inventaris.js')));
    ck('de mobile.de-bron noemt geen verzonnen eindpunten buiten de documentatie', (lees('api/_voorraad-providers/mobile-de.js').match(/\/seller-api\/[a-z/{}A-Z-]+/g) || []).every((x) => /^\/seller-api\/sellers(\/|$)/.test(x) || /ads$/.test(x)));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('STUK:', e && e.stack); process.exit(1); });
