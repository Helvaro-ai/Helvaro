'use strict';
/*
 * De hele keten, van begin tot eind (2026-09-27):
 *
 *   Setup → AutoScout24-profiel koppelen → eerste import → Helvaro-voorraad
 *   → automatische sync (nieuw, prijs, km, verkocht, terug) → websitefeed
 *
 * Met twee dealers in dezelfde nep-Airtable, zodat "dealer A raakt dealer B
 * nooit" getoetst wordt en niet aangenomen. Niets gaat over het net: Airtable,
 * AutoScout24 en robots.txt zijn nagemaakt.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };

/* ── De nagemaakte AutoScout24 ─────────────────────────────────────────── */
const AS24 = 'https://www.autoscout24.be/nl/verkopers/garage-a';
const as24 = { wagens: [], status: 200 };
const advertentie = (id, merk, model, prijs, km) => ({
  id, url: '/nl/aanbod/' + merk.toLowerCase() + '-' + id,
  images: ['https://prod.pictures.autoscout24.net/listing-images/' + id + '_1.jpg/250x188.webp'],
  prices: { public: { priceRaw: prijs } },
  vehicle: { make: merk, model, modelVersionInput: 'Testversie', mileageInKm: { raw: km }, firstRegistrationDate: { formatted: '05/2021' },
    fuelCategory: { formatted: 'Benzine' }, transmissionType: { formatted: 'Automatisch' }, powerInKw: { raw: 110 }, bodyType: { formatted: 'Berline' } },
});

/* ── De nagemaakte Airtable: Client Config (twee dealers) + vehicles ──── */
const klanten = {
  DEALERA: { id: 'recKA', fields: { 'Project Code': 'DEALERA', 'Client Name': 'Garage A', Vertical: 'dealership' } },
  DEALERB: { id: 'recKB', fields: { 'Project Code': 'DEALERB', 'Client Name': 'Garage B', Vertical: 'dealership' } },
};
const db = { vehicles: [], nr: 0 };
/* Dealer B heeft zijn eigen wagen; die mag door niets van A geraakt worden. */
db.vehicles.push({ id: 'recB1', createdTime: '2026-09-01T00:00:00.000Z', fields: { 'Project Code': 'DEALERB', 'Vehicle Code': 'V1', Make: 'Audi', Model: 'A4', Price: 30000, Status: 'beschikbaar', 'Is Public': true } });

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const methode = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });

  if (u === 'https://www.autoscout24.be/robots.txt') return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'User-agent: *\nDisallow: /dealerarea/\n' };
  if (u.startsWith(AS24)) {
    if (as24.status !== 200) return { ok: false, status: as24.status, headers: { get: () => null }, text: async () => 'nee' };
    const p = Number((/[?&]page=(\d+)/.exec(u) || [])[1] || 1);
    const stuk = as24.wagens.slice((p - 1) * 20, p * 20);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: { listings: stuk, numberOfResults: as24.wagens.length } } }) + '</script>' };
  }
  const km = /\/tblPidTrwGRzRt4LZ\/(rec\w+)/.exec(u);
  if (km) {
    const k = Object.values(klanten).find((x) => x.id === km[1]);
    if (methode === 'PATCH') Object.assign(k.fields, body.fields);
    return json(k);
  }
  if (u.includes('/tblPidTrwGRzRt4LZ')) {
    const m = /\{(?:Project Code|fldN4dL0bGgfBOXwM)\}="([^"]*)"/.exec(decodeURIComponent(u));
    const k = m && klanten[m[1]];
    return json({ records: k ? [k] : [] });
  }
  if (/\/vehicles(\?|$)/.test(u) && (methode === 'POST' || methode === 'PATCH')) {
    const uit = [];
    for (const r of (body.records || [body])) {
      if (methode === 'POST') { const n = { id: 'recN' + (++db.nr), createdTime: new Date().toISOString(), fields: Object.assign({}, r.fields) }; db.vehicles.push(n); uit.push(n); }
      else { const b = db.vehicles.find((x) => x.id === r.id); if (b) { Object.assign(b.fields, r.fields); uit.push(b); } }
    }
    return json({ records: uit });
  }
  if (/\/vehicles\?/.test(u)) {
    const m = /\{Project Code\}="([^"]*)"/.exec(decodeURIComponent(u));
    return json({ records: m ? db.vehicles.filter((r) => r.fields['Project Code'] === m[1]) : db.vehicles.slice(0, 1) });
  }
  return json({ records: [] });
};

const inv = require(BASE + 'api/_inventaris.js');
const publiek = require(BASE + 'api/_voorraad-publiek.js');
const vanA = () => db.vehicles.filter((r) => r.fields['Project Code'] === 'DEALERA');
const actiefA = () => vanA().filter((r) => !r.fields.Archived);
const perId = (id) => vanA().find((r) => String(r.fields['Source Record ID']).toLowerCase() === id);
const snel = { budgetMs: 60000 };
const wagenB = () => JSON.stringify(db.vehicles.find((r) => r.id === 'recB1').fields);
const bVoor = wagenB();

async function feed(code) {
  return new Promise((klaar) => {
    const res = { _h: {}, _code: 0, setHeader(k, v) { this._h[k] = v; }, status(c) { this._code = c; return this; },
      send(b) { klaar({ code: this._code, body: JSON.parse(b) }); }, json(o) { klaar({ code: this._code, body: o }); }, end() { klaar({ code: this._code, body: null }); } };
    publiek.handler({ method: 'GET', url: '/api/inventory/' + code, headers: { 'x-forwarded-for': '10.1.1.' + Math.floor(Math.random() * 200) }, query: {} }, res);
  });
}

(async () => {
  /* De wacht van 1 s tussen pagina's is echt; 45 wagens = 3 pagina's = 2 s. */
  console.log('\n— 1. Setup: het AutoScout24-profiel koppelen —');
  let r = await inv.bewaarBron('DEALERA', { type: 'feed', provider: 'autoscout24', url: AS24 + '?atype=C&gclid=abc' });
  ck('bewaard als provider autoscout24, zonder tracking in het adres', r.ok && JSON.parse(klanten.DEALERA.fields['Inventory Source']).provider === 'autoscout24'
    && JSON.parse(klanten.DEALERA.fields['Inventory Source']).url === AS24, klanten.DEALERA.fields['Inventory Source']);
  const slecht = await inv.bewaarBron('DEALERA', { type: 'feed', provider: 'autoscout24', url: 'https://evil.example/nl/verkopers/x' });
  ck('een ander domein wordt geweigerd', slecht.ok === false && slecht.reden === 'ongeldig_adres', slecht);
  await inv.bewaarBron('DEALERA', { type: 'feed', provider: 'autoscout24', url: AS24 });

  console.log('\n— 2. De eerste import —');
  as24.wagens = Array.from({ length: 45 }, (_, i) => advertentie('ad-' + i, i % 2 ? 'BMW' : 'Volkswagen', i % 2 ? 'X5' : 'Golf', 20000 + i * 100, 50000 + i));
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de sync slaagt', r.ok === true, r);
  ck('45 wagens in Helvaro, elk één keer', actiefA().length === 45 && new Set(vanA().map((x) => x.fields['Source Record ID'])).size === 45, actiefA().length);
  ck('met een Helvaro-code, prijs, km en foto’s', vanA().every((x) => /^V\d+$/.test(x.fields['Vehicle Code']) && x.fields.Price > 0 && x.fields.Mileage > 0), vanA()[0] && vanA()[0].fields);
  ck('de wagen van dealer B is niet aangeraakt', wagenB() === bVoor);

  console.log('\n— 3. Een uur later: dezelfde bron = niets te schrijven —');
  const aantalRijen = db.vehicles.length;
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('geen dubbels na een tweede run', r.ok && db.vehicles.length === aantalRijen, db.vehicles.length);

  console.log('\n— 4. Wijzigingen bij AutoScout24 —');
  as24.wagens[3].prices.public.priceRaw = 17500;          // prijs
  as24.wagens[4].vehicle.mileageInKm.raw = 61234;         // km
  const weg = as24.wagens.splice(10, 1)[0];               // verkocht
  as24.wagens.push(advertentie('ad-nieuw', 'Audi', 'Q5', 39900, 20000));   // nieuw
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de sync slaagt', r.ok === true, r);
  ck('prijs bijgewerkt', perId('ad-3').fields.Price === 17500, perId('ad-3').fields.Price);
  ck('kilometers bijgewerkt', perId('ad-4').fields.Mileage === 61234, perId('ad-4').fields.Mileage);
  ck('de verdwenen wagen staat op verkocht (niet gewist)', perId(weg.id) && perId(weg.id).fields.Status === 'verkocht' && Boolean(perId(weg.id).fields['Sold At']), perId(weg.id) && perId(weg.id).fields);
  ck('de nieuwe wagen staat erin', perId('ad-nieuw') && perId('ad-nieuw').fields.Make === 'Audi');
  ck('nog steeds geen dubbels', new Set(vanA().map((x) => x.fields['Source Record ID'])).size === vanA().length);

  console.log('\n— 5. De dealer reserveert, AutoScout24 weet dat niet —');
  perId('ad-5').fields.Status = 'gereserveerd';
  as24.wagens[5].prices.public.priceRaw = 20555;
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de reservering blijft staan, de prijs gaat wel mee', perId('ad-5').fields.Status === 'gereserveerd' && perId('ad-5').fields.Price === 20555, perId('ad-5').fields);

  console.log('\n— 6. De verkochte wagen komt terug —');
  as24.wagens.push(weg);
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('weer beschikbaar, dezelfde rij (geen nieuwe)', perId(weg.id).fields.Status === 'beschikbaar' && vanA().filter((x) => x.fields['Source Record ID'] === weg.id).length === 1, perId(weg.id).fields);

  console.log('\n— 7. AutoScout24 blokkeert —');
  const staat = JSON.stringify(vanA().map((x) => x.fields));
  as24.status = 429;
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de sync faalt met een duidelijke code', r.ok === false && r.lastErrorCode === 'bron_geblokkeerd', r);
  ck('en er is NIETS aangepast in de voorraad', JSON.stringify(vanA().map((x) => x.fields)) === staat);
  as24.status = 200;

  console.log('\n— 8. Een abnormaal kleine respons —');
  const alles = as24.wagens.slice();
  as24.wagens = alles.slice(0, 5);
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('geblokkeerd: niets op verkocht gezet', actiefA().filter((x) => x.fields.Status === 'verkocht').length <= 1 && /niet op verkocht/i.test(r.lastError || '') , { res: r.lastError, verkocht: actiefA().filter((x) => x.fields.Status === 'verkocht').length });
  as24.wagens = alles;
  await inv.sync('DEALERA', { door: 'test', ...snel });

  console.log('\n— 9. De websitefeed leest dezelfde voorraad —');
  const f = await feed('DEALERA');
  ck('200 met de actieve wagens van A', f.code === 200 && f.body.total === actiefA().filter((x) => x.fields.Status !== 'verkocht').length, { code: f.code, total: f.body && f.body.total });
  const eenWagen = f.body.vehicles.find((v) => v.make === 'Audi' && v.model === 'Q5');
  ck('met prijs, km, foto’s en de assistent-code', eenWagen && eenWagen.price === 39900 && eenWagen.mileage === 20000 && eenWagen.photos.length > 0 && /^V\d+$/.test(eenWagen.assistantVehicle), eenWagen);
  ck('de gereserveerde wagen staat als reserved', f.body.vehicles.some((v) => v.status === 'reserved'));
  const fB = await feed('DEALERB');
  ck('de feed van B toont alleen de wagen van B', fB.code === 200 && fB.body.vehicles.length === 1 && fB.body.vehicles[0].make === 'Audi' && fB.body.vehicles[0].model === 'A4', fB.body);
  ck('en niets van A', !fB.body.vehicles.some((v) => v.model === 'X5' || v.model === 'Golf'));

  console.log('\n— 10. De geschiedenis voor het Setup-scherm —');
  const st = await inv.status('DEALERA');
  ck('de laatste runs staan erin, met de mislukte erbij', Array.isArray(st.runs) && st.runs.length >= 5 && st.runs.some((x) => x.ok === false && x.code === 'bron_geblokkeerd'), st.runs && st.runs.map((x) => [x.ok, x.code]));
  ck('de bron zegt autoscout24', st.feed && st.feed.provider === 'autoscout24', st.feed);

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
