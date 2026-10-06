'use strict';
/*
 * De Meta-catalogusfeed (CSV): wat erin komt, wat eruit blijft, en dat een
 * dealer nooit de wagens van een andere dealer in zijn feed krijgt.
 * Airtable, de rate limiter en het netwerk zijn nep.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';

const _rl = require(BASE + 'api/_ratelimit.js');
const pub = require(BASE + 'api/_voorraad-publiek.js');
const mf = require(BASE + 'api/_voorraad-providers/meta-feed.js');
const meta = require(BASE + 'api/_voorraad-providers/meta.js');
const reg = require(BASE + 'api/_voorraad-providers/index.js');
const inv = require(BASE + 'api/_inventaris.js');
const i18n = require(BASE + 'api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const META = { addr1: 'Kerkstraat 1', city: 'Gent', region: 'Oost-Vlaanderen', postalCode: '9000', country: 'Belgium', lat: 51.0543, lng: 3.7174 };
const bron = (m) => JSON.stringify({ type: 'native', bronnen: [{ provider: 'meta', enabled: true, meta: m }] });
const KLANTEN = {
  DEALER1: { 'Project Code': 'DEALER1', 'Client Name': 'Garage "Een", BV', Vertical: 'dealership', Active: true, 'Inventory Source': bron(META) },
  DEALER2: { 'Project Code': 'DEALER2', 'Client Name': 'Garage Twee', Vertical: 'dealership', Active: true, 'Inventory Source': bron(Object.assign({}, META, { city: 'Brugge' })) },
  ZONDER: { 'Project Code': 'ZONDER', 'Client Name': 'Zonder Meta', Vertical: 'dealership', Active: true },
  HALF: { 'Project Code': 'HALF', 'Client Name': 'Half', Vertical: 'dealership', Active: true, 'Inventory Source': bron({ addr1: 'x', city: 'y' }) },
  MAKELAAR: { 'Project Code': 'MAKELAAR', 'Client Name': 'Immo', Vertical: 'vastgoed', Active: true, 'Inventory Source': bron(META) },
  UIT: { 'Project Code': 'UIT', 'Client Name': 'Uit', Vertical: 'dealership', Active: false, 'Inventory Source': bron(META) },
};
const rij = (tenant, code, extra) => ({ id: 'rec' + tenant + code, fields: Object.assign({
  'Vehicle Code': code, 'Project Code': tenant, Make: 'BMW', Model: 'X5', Variant: 'xDrive45e', Price: 52900, Mileage: 48000,
  Registration: '05/2023', Fuel: 'Hybride', Transmission: 'automaat', Color: 'Zwart', Body: 'SUV/Terreinwagen', Status: 'beschikbaar',
  'Photo URLs': 'https://img.example/1.jpg', 'Max Discount EUR': 2500, Description: 'Eerste eigenaar.', 'Listing URL': 'https://dealer.example/v/' + code,
}, extra || {}) });
const VOERTUIGEN = [
  rij('DEALER1', 'V1'),
  rij('DEALER1', 'V2', { Make: 'Audi', Model: 'A6', 'Photo URLs': Array.from({ length: 25 }, (_, i) => 'https://img.example/' + i + '.jpg').join('\n') }),
  rij('DEALER1', 'V3', { Status: 'verkocht' }),
  rij('DEALER1', 'V4', { Archived: true }),
  rij('DEALER1', 'V5', { 'Photo URLs': '' }),
  rij('DEALER1', 'V6', { Price: '' }),
  rij('DEALER1', 'V7', { Status: 'gereserveerd', Make: 'Mercedes' }),
  rij('DEALER1', 'V8', { Public: false }),
  rij('DEALER1', 'V9', { Registration: '' }),
  rij('DEALER1', 'V10', { 'Listing URL': '' }),
  rij('DEALER2', 'V1', { Make: 'Porsche', Model: '911' }),
];
const net = { beperkt: false };
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('/tblPidTrwGRzRt4LZ')) {
    const m = /\{Project Code\}="([^"]*)"/.exec(u);
    const k = m && KLANTEN[m[1]];
    return json({ records: k ? [{ id: 'recK', fields: k }] : [] });
  }
  if (/\/vehicles\?/.test(u)) {
    const m = /\{Project Code\}="([^"]*)"/.exec(u);
    return json({ records: m ? VOERTUIGEN.filter((r) => r.fields['Project Code'] === m[1]) : [] });
  }
  return json({ records: [] });
};
_rl.hit = async () => ({ limited: net.beperkt });

async function vraag(pad) {
  const res = { statusCode: 0, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.statusCode = s; return this; },
    json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  await pub.handler({ method: 'GET', url: pad, query: { __voorraad: '1' }, headers: { 'x-forwarded-for': '1.2.3.4' } }, res);
  return res;
}
/* Een eenvoudige CSV-lezer (kent aanhalingstekens en verdubbelde aanhalingstekens). */
function parseCsv(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f.replace(/\r$/, '')); rows.push(r); r = []; f = ''; }
    else f += c;
  }
  return rows;
}
const tabel = (t) => { const [k, ...rest] = parseCsv(t); return rest.map((r) => Object.fromEntries(k.map((n, i) => [n, r[i]]))); };

(async () => {
  console.log('\nCSV: aanhalingstekens en prijsformaat');
  {
    ck('veld met komma tussen aanhalingstekens', mf.csvVeld('a,b') === '"a,b"');
    ck('veld met spatie tussen aanhalingstekens', mf.csvVeld('a b') === '"a b"');
    ck('aanhalingsteken wordt verdubbeld', mf.csvVeld('zeg "hoi"') === '"zeg ""hoi"""');
    ck('gewoon veld blijft kaal', mf.csvVeld('BMW') === 'BMW');
    ck('prijs "12345 EUR"', mf.prijsTekst(12345) === '12345 EUR' && mf.prijsTekst(12345.5) === '12345.50 EUR' && mf.prijsTekst(0) === '');
  }

  console.log('\nEnum-vertaling naar Meta');
  {
    const F = mf.brandstofNaarMeta;
    ck('brandstof', F('diesel') === 'DIESEL' && F('Benzine') === 'GASOLINE' && F('gasoline') === 'GASOLINE' && F('elektrisch') === 'ELECTRIC' && F('Electric') === 'ELECTRIC'
      && F('hybride') === 'HYBRID' && F('Plug-in hybride') === 'HYBRID' && F('benzine/elektrisch') === 'HYBRID' && F('CNG') === 'OTHER' && F('') === 'OTHER', ['diesel', 'benzine', 'elektrisch', 'hybride', 'cng'].map(F));
    const T = mf.transmissieNaarMeta;
    ck('transmissie', T('automaat') === 'Automatic' && T('Automatic') === 'Automatic' && T('handgeschakeld') === 'Manual' && T('manueel') === 'Manual' && T('') === null && T('raar') === null);
    const B = mf.carrosserieNaarMeta;
    const tabelB = { 'SUV/Terreinwagen': 'SUV', Berline: 'SEDAN', Break: 'WAGON', Cabrio: 'CONVERTIBLE', 'Coupé': 'COUPE', Monovolume: 'MINIVAN', Stadswagen: 'SMALL_CAR', Hatchback: 'HATCHBACK', Pick_up: 'OTHER', Bestelwagen: 'VAN', Crossover: 'CROSSOVER', '': 'OTHER', Onbekend: 'OTHER' };
    const slecht = Object.entries(tabelB).filter(([k, v]) => B(k) !== v).map(([k]) => k + '=' + B(k));
    ck('carrosserie (NL/EN door elkaar, OTHER als terugval)', slecht.length === 0, slecht);
    ck('pick-up -> TRUCK', B('Pick-up') === 'TRUCK');
  }

  console.log('\nEen feed bouwen');
  {
    const r = mf.bouw(VOERTUIGEN.filter((x) => x.fields['Project Code'] === 'DEALER1').map((x) => require(BASE + 'api/_vehicles.js')._test ? null : null).filter(Boolean), { code: 'D', meta: META });
    ck('lege lijst geeft alleen een kop, geen fout', r.inFeed === 0 && /^vehicle_id,/.test(r.csv));
  }
  const _v = require(BASE + 'api/_vehicles.js');
  const lijst1 = await _v.list('DEALER1', { inclusiefGearchiveerd: true });
  const r1 = mf.bouw(lijst1, { code: 'DEALER1', clientName: 'Garage "Een", BV', meta: Object.assign({}, META, { phone: '+3291234567', fbPageId: '12345678' }) });
  const rijen = tabel(r1.csv);
  {
    const ids = rijen.map((x) => x.vehicle_id).sort();
    ck('alleen beschikbaar en gereserveerd, publiek, niet gearchiveerd, met alle verplichte velden', ids.join() === 'V1,V10,V2,V7', ids);
    ck('weggelaten met reden: foto, prijs, jaar', r1.weggelaten === 3 && r1.redenen.foto === 1 && r1.redenen.prijs === 1 && r1.redenen.jaar === 1, r1);
    ck('de weggelaten wagens staan met code en reden in een lijst, zodat de dealer ze kan aanvullen', Array.isArray(r1.ontbrekend) && r1.ontbrekend.length === 3 && r1.ontbrekend.every((w) => w.code && w.reden), r1.ontbrekend);
    ck('zonder eigen advertentielink: de aanvraagpagina van Helvaro voor die wagen', rijen.find((x) => x.vehicle_id === 'V10').url === 'https://app.helvaro.pro/start/DEALER1/V10');
    const v1 = rijen.find((x) => x.vehicle_id === 'V1');
    ck('prijs "52900 EUR"', v1.price === '52900 EUR', v1.price);
    ck('mileage.value en mileage.unit', v1['mileage.value'] === '48000' && v1['mileage.unit'] === 'KM');
    ck('year, make, model, titel met jaar+merk+model+trim', v1.year === '2023' && v1.title === '2023 BMW X5 xDrive45e', v1.title);
    ck('enums: SUV, HYBRID, Automatic, Used, active', v1.body_style === 'SUV' && v1.fuel_type === 'HYBRID' && v1.transmission === 'Automatic' && v1.state_of_vehicle === 'Used' && v1.status === 'active');
    ck('availability: beschikbaar = available, gereserveerd = not_available', v1.availability === 'available' && rijen.find((x) => x.vehicle_id === 'V7').availability === 'not_available');
    ck('url is de eigen advertentielink', v1.url === 'https://dealer.example/v/V1', v1.url);
    ck('dealernaam met komma en aanhalingsteken blijft heel', v1.dealer_name === 'Garage "Een", BV', v1.dealer_name);
    ck('dealer_phone en fb_page_id alleen als ingevuld', v1.dealer_phone === '+3291234567' && v1.fb_page_id === '12345678' && !('dealer_phone' in tabel(mf.bouw(lijst1, { code: 'DEALER1', meta: META }).csv)[0]));
    const kop = r1.csv.split('\r\n')[0].split(',');
    ck('adres als aparte kolommen, nooit ook als samengestelde kolom', kop.includes('address.addr1') && kop.includes('address.postal_code') && kop.includes('address.country') && !kop.includes('address'), kop);
    ck('adreswaarden en coordinaten', v1['address.addr1'] === 'Kerkstraat 1' && v1['address.city'] === 'Gent' && v1['address.country'] === 'Belgium' && v1.latitude === '51.0543' && v1.longitude === '3.7174');
    const v2 = rijen.find((x) => x.vehicle_id === 'V2');
    const fotoKolommen = kop.filter((k) => /^image\[\d+\]\.url$/.test(k));
    ck('maximaal 20 fotokolommen (image[0].url .. image[19].url)', fotoKolommen.length === 20 && fotoKolommen[19] === 'image[19].url' && v2['image[19].url'] === 'https://img.example/19.jpg', fotoKolommen.length);
    ck('geen kortingsgrens, geen Airtable-id in de feed', !/2500|Max Discount|rec[A-Z]/.test(r1.csv));
    ck('omschrijving: geen links, geen alles-hoofdletters', !/https?:|www\./.test(mf.omschrijving({ omschrijving: 'Kijk op https://x.be of www.y.be' }, 'T')) && mf.omschrijving({ omschrijving: 'ZEER NETTE WAGEN MET ALLE OPTIES' }, 'T') !== 'ZEER NETTE WAGEN MET ALLE OPTIES');
    ck('omschrijving: leeg wordt een zin uit echte gegevens, max 5000', /BMW/.test(mf.omschrijving({ km: 5, merk: 'BMW' }, 'BMW X5')) && mf.omschrijving({ omschrijving: 'a '.repeat(4000) }, 'T').length <= 5000);
    ck('vin alleen met precies 17 tekens', mf.vinOfLeeg('WBA12345678901234').length === 17 && mf.vinOfLeeg('kort') === '');
  }

  console.log('\nDe route: /api/inventory/CODE/meta.csv');
  {
    const r = await vraag('/api/inventory/DEALER1/meta.csv');
    ck('200 en text/csv', r.statusCode === 200 && /^text\/csv/.test(r.headers['content-type']), [r.statusCode, r.headers['content-type']]);
    ck('zelfde caching als de rest (s-maxage, stale-if-error)', /s-maxage=60/.test(r.headers['cache-control']) && /stale-if-error/.test(r.headers['cache-control']), r.headers['cache-control']);
    ck('noindex', r.headers['x-robots-tag'] === 'noindex');
    const ids = tabel(r.body).map((x) => x.vehicle_id).sort();
    ck('inhoud: V1, V10, V2, V7', ids.join() === 'V1,V10,V2,V7', ids);
    ck('tenant-isolatie: geen Porsche van DEALER2 in de feed van DEALER1', !/Porsche/.test(r.body));
    const r2 = await vraag('/api/inventory/DEALER2/meta.csv');
    const t2 = tabel(r2.body);
    ck('DEALER2 krijgt alleen zijn eigen wagen, met zijn eigen adres', t2.length === 1 && t2[0].make === 'Porsche' && t2[0]['address.city'] === 'Brugge' && !/BMW/.test(r2.body), t2.map((x) => x.make));
    for (const [code, naam] of [['ONBEKEND', 'onbekende code'], ['MAKELAAR', 'geen dealer'], ['UIT', 'niet actief'], ['ZONDER', 'Meta niet ingesteld'], ['HALF', 'adres niet compleet']]) {
      const x = await vraag('/api/inventory/' + code + '/meta.csv');
      ck(`${naam}: 404`, x.statusCode === 404 && (!x.body || x.body.code === 'not_found'), x.statusCode);
    }
    net.beperkt = true;
    const lim = await vraag('/api/inventory/DEALER1/meta.csv');
    ck('rate limit: 429', lim.statusCode === 429, lim.statusCode);
    net.beperkt = false;
  }

  console.log('\nProvider en kaart');
  {
    const p = reg.get('meta');
    ck('ACTIVE, publiceren ja, lezen/leads nee', p.status === 'ACTIVE' && p.capabilities.publiceren === true && p.capabilities.lezen === false && p.capabilities.leads === false);
    ck('nooit een bron: kanSyncen false, kanBewaren true', !reg.kanSyncen(p) && reg.kanBewaren(p));
    ck('contract in orde', reg.controleerContract(p).length === 0, reg.controleerContract(p));
    const b = inv.saneerBron({ bronnen: [{ provider: 'meta', meta: META }, { provider: 'feed', url: 'https://x.example/f.csv' }] });
    ck('Meta telt niet als synchroniseerbron: type blijft feed door de feed, Meta staat achteraan, legacyProvider is de feed', b.type === 'feed' && b.bronnen[0].provider === 'feed' && b.legacyProvider === 'feed', b.bronnen.map((x) => x.provider));
    ck('alleen Meta: type native (de assistent blijft niet "feed" denken)', inv.saneerBron({ bronnen: [{ provider: 'meta', meta: META }] }).type === 'native');
    ck('saneer: ongeldige coordinaten vallen weg, land standaard Belgium', meta.saneerMeta({ lat: '91', lng: 'x' }).lat === null && meta.saneerMeta({}).country === 'Belgium' && meta.saneerMeta({ lat: '51,5' }).lat === 51.5);
    ck('validatie: breedtegraad, lengtegraad, telefoon, pagina-id', meta.valideerInvoer({ meta: { lat: '95' } }) === 'meta_breedtegraad' && meta.valideerInvoer({ meta: { lng: '200' } }) === 'meta_lengtegraad'
      && meta.valideerInvoer({ meta: { phone: '0123' } }) === 'meta_telefoon' && meta.valideerInvoer({ meta: { fbPageId: 'abc' } }) === 'meta_pagina' && meta.valideerInvoer({ meta: META }) === '');
    const kaart = reg.get('meta').kaartExtra({ meta: meta.saneerMeta({ addr1: 'x' }) });
    ck('kaart: noemt wat ontbreekt', kaart.meta.ontbreekt.includes('city') && kaart.meta.ontbreekt.includes('lat'), kaart.meta.ontbreekt);
    const kaarten = [{ id: 'meta', auth: 'catalog_feed', geconfigureerd: false, meta: { ontbreekt: ['lat'] } }, { id: 'meta', auth: 'catalog_feed', geconfigureerd: true, meta: META }];
    const o = inv.verrijkMeta ? inv.verrijkMeta(kaarten, 'DEALER1', lijst1, 'X') : null;
    ck('feed-URL alleen als adres en coordinaten er zijn; dan met telling en redenen', (o[0].feedUrl === '' && /\/api\/inventory\/DEALER1\/meta\.csv$/.test(o[1].feedUrl) && o[1].feedTelling.inFeed === 4 && o[1].feedTelling.weggelaten === 3), o);
  }

  console.log('\nHet scherm (integraties)');
  {
    const mod = fs.readFileSync(BASE + 'api/_dash/integraties.js', 'utf8');
    const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
    const w = i18n.woordenboek('nl');
    ck('geen backticks of ${ in de module', !/[`]|\$\{/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')));
    ck('dashboard.js onder 22.000 regels', dash.split('\n').length < 22000, dash.split('\n').length);
    const sleutels = new Set(); let m; const re = /\b(?:tr|igTekst)\(\s*'([a-zA-Z0-9_.\-]+)'/g;
    while ((m = re.exec(mod))) if (m[1].slice(-1) !== '.') sleutels.add(m[1]);
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const wd = i18n.woordenboek(taal);
      const mist = [...sleutels].filter((k) => !wd[k]);
      ck(`${taal}: alle sleutels van de module bestaan`, mist.length === 0, mist);
    }
    const platforms = reg.lijst().map((p) => p.id);
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const wd = i18n.woordenboek(taal);
      const zonder = platforms.filter((id) => !wd['ig.gids.' + id] || wd['ig.gids.' + id].split('\n').length < 2);
      ck(`${taal}: elke kaart heeft een gids met genummerde stappen`, zonder.length === 0, zonder);
      ck(`${taal}: enkelvoud en meervoud voor voertuigen`, wd['inv.aantal.een'] && !/\{n\}/.test(wd['inv.aantal.een']) && /\{n\}/.test(wd['inv.aantal']));
    }
    ck('de kaart heeft per fout een zichtbare melding (inv-fout, role=alert) en de toast', /role="' \+ \(m\.type === 'error' \? 'alert'/.test(mod) && /function igFout\(id, e\)[\s\S]*igMeld\(id, 'error', z\)[\s\S]*toast\(z, 'error'\)/.test(mod));
    ck('upload: de bestandsinvoer wordt leeggemaakt zodat hetzelfde bestand opnieuw werkt', /el\.value = ''/.test(mod.slice(mod.indexOf('function igBestand'))));
    ck('upload: succes en elke fout geven een melding', /var klaarTekst = tr\(Number\(u\.aantal\) === 1[\s\S]*ig\.upload\.overgeslagen[\s\S]*igKlaar\(id, klaarTekst\)/.test(mod) && /igFout\(id, e\)/.test(mod.slice(mod.indexOf('async function igUpload'))));
    ck('foutcodes van de server hebben een tekst (bestand_leeg, bestand_onleesbaar, slot_mislukt, unavailable, meta_*)', ['bestand_leeg', 'bestand_onleesbaar', 'slot_mislukt', 'unavailable', 'meta_breedtegraad', 'meta_lengtegraad', 'meta_telefoon', 'meta_pagina', 'bestand_te_groot'].every((c) => w['ig.err.' + c]));
    ck('de bevestiging bij ontkoppelen noemt het platform en het aantal wagens', /ig\.ontkoppel\.titel', \{ platform: igLabel\(p\) \}/.test(mod) && /ig\.ontkoppel\.aantal/.test(mod));
    ck('het platform staat in de tekst van de ontkoppelvraag', /\{platform\}/.test(w['ig.ontkoppel.vraag']) && /\{platform\}/.test(w['ig.ontkoppel.titel']));
    ck('AutoScout24 (API) zonder activatie: wacht-tekst in plaats van een werkend uitziend formulier', /ig\.pending\./.test(mod) && /ig\.veld\.klantnummerLater/.test(mod) && /ig\.knop\.bewaarLater/.test(mod));
    ck('de lijst met aan te vullen wagens opent het bestaande bewerkvenster', /data-ig-actie="bewerk"/.test(mod) && /actie === 'bewerk'\) igBewerk\(id\)/.test(mod) && /async function igBewerk[\s\S]*await loadPanden\(true\)[\s\S]*if \(!gevonden[\s\S]*openPandModal\(code\)/.test(mod) && w['ig.err.voertuigWeg'] && w['ig.meta.aanvullen']);
    ck('"Binnenkort" en "Niet beschikbaar" staan er alleen zonder eigen uitleg', /uitleg \|\| '<div class="settings-label-sub">' \+ escHtml\(tr\('ig\.binnenkort'\)\)/.test(mod));
  }

  console.log(`\n${pass} geslaagd, ${fail} mislukt`);
  process.exit(fail ? 1 : 0);
})();
