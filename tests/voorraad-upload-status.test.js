'use strict';
/*
 * Een exportbestand als voorraadbron (inventory-upload), de laatste
 * synchronisatie van een bron uit de tijd van een enkele bron, de melding als
 * een bron twee keer faalt, en het opruimen van advertenties bij verwijderen.
 *
 * Een nagemaakte Airtable in het geheugen (Client Config, vehicles,
 * vehicle_listings, met verwijderen) en nagemaakte feeds. Er gaat niets over het net.
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

const PUSH = [];
require(BASE + 'api/_push.js').stuurVertaald = async (o) => { PUSH.push(o); return { ok: true }; };

const FEED_A = 'https://dms-a.example/voorraad.json';
const FEED_B = 'https://gocar-b.example/export.json';
const feeds = { [FEED_A]: { status: 200, items: [] }, [FEED_B]: { status: 200, items: [] } };
const geopend = [];
const klanten = {
  DEALERA: { id: 'recKA', fields: { 'Project Code': 'DEALERA', Vertical: 'dealership' } },
  DEALERB: { id: 'recKB', fields: { 'Project Code': 'DEALERB', Vertical: 'dealership' } },
};
const db = { vehicles: [], vehicle_listings: [], nr: 0 };
db.vehicles.push({ id: 'recB1', fields: { 'Project Code': 'DEALERB', 'Vehicle Code': 'V1', Make: 'BMW', Model: 'X5', Price: 50000, Status: 'beschikbaar' } });
db.vehicle_listings.push({ id: 'recL0', fields: { 'Listing Key': 'DEALERB|gocar|g1', 'Project Code': 'DEALERB', 'Vehicle Code': 'V1', Provider: 'gocar', 'External ID': 'G1', Status: 'ACTIVE', 'Last Seen At': '2026-10-01T00:00:00.000Z' } });

const ok = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
const echteFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const methode = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (feeds[u]) {
    geopend.push(u);
    const f = feeds[u];
    if (f.status !== 200) return { ok: false, status: f.status, headers: { get: () => null }, text: async () => 'nee' };
    const t = JSON.stringify(f.items);
    return { ok: true, status: 200, headers: { get: (k) => (/content-type/i.test(k) ? 'application/json' : null) }, text: async () => t };
  }
  const km = /\/tblPidTrwGRzRt4LZ\/(rec\w+)/.exec(u);
  if (km) {
    const k = Object.values(klanten).find((x) => x.id === km[1]);
    if (methode === 'PATCH') Object.assign(k.fields, body.fields);
    return ok(k);
  }
  if (u.includes('/tblPidTrwGRzRt4LZ')) {
    const m = /\{(?:Project Code|fldN4dL0bGgfBOXwM)\}="([^"]*)"/.exec(decodeURIComponent(u));
    const k = m && klanten[m[1]];
    return ok({ records: k ? [k] : [] });
  }
  const tm = /appTEST\/(vehicles|vehicle_listings)(?:\/(rec\w+))?(\?|$)/.exec(u);
  if (tm) {
    const tabel = tm[1];
    const rijen = db[tabel];
    if (methode === 'DELETE') {
      const ids = tm[2] ? [tm[2]] : (decodeURIComponent(u).match(/records\[\]=(rec\w+)/g) || []).map((x) => x.replace('records[]=', ''));
      for (const id of ids) { const i = rijen.findIndex((r) => r.id === id); if (i >= 0) rijen.splice(i, 1); }
      return ok({ deleted: true });
    }
    if (methode === 'POST' || methode === 'PATCH') {
      const uit = [];
      for (const r of body.records) {
        if (methode === 'POST') { const n = { id: 'rec' + tabel[0] + (++db.nr), fields: Object.assign({}, r.fields) }; rijen.push(n); uit.push(n); }
        else { const b = rijen.find((x) => x.id === r.id); if (b) { Object.assign(b.fields, r.fields); uit.push(b); } }
      }
      return ok({ records: uit });
    }
    const dec = decodeURIComponent(u);
    const pm = /\{Project Code\}="([^"]*)"/.exec(dec);
    const cm = /\{Vehicle Code\}="([^"]*)"/.exec(dec);
    let sel = pm ? rijen.filter((r) => r.fields['Project Code'] === pm[1]) : rijen.slice(0, 1);
    if (cm) sel = sel.filter((r) => r.fields['Vehicle Code'] === cm[1]);
    return ok({ records: sel });
  }
  return ok({ records: [] });
};

const inv = require(BASE + 'api/_inventaris.js');
const reg = require(BASE + 'api/_voorraad-providers');
const vsync = require(BASE + 'api/_voorraad-sync.js');
const listings = require(BASE + 'api/_listings.js');
const vehicles = require(BASE + 'api/_vehicles.js');
const i18n = require(BASE + 'api/_i18n.js');
const leesLeads = require(BASE + 'api/_leads-read.js');

const vanA = () => db.vehicles.filter((r) => r.fields['Project Code'] === 'DEALERA');
const vanB = () => db.vehicles.filter((r) => r.fields['Project Code'] === 'DEALERB');
const bijMerk = (merk) => vanA().find((r) => r.fields.Make === merk);
const listingsA = () => db.vehicle_listings.filter((r) => r.fields['Project Code'] === 'DEALERA');
const snel = { budgetMs: 60000 };
const zet = (o) => { klanten.DEALERA.fields['Inventory Source'] = JSON.stringify(o); };
const zetStaat = (o) => { klanten.DEALERA.fields['Inventory State'] = JSON.stringify(o); };
const stand = () => JSON.parse(klanten.DEALERA.fields['Inventory State'] || '{}');
const bron = () => JSON.parse(klanten.DEALERA.fields['Inventory Source'] || '{}');
const CSV1 = 'id;make;model;price;mileage\nG1;BMW;X5;50000;40000\nG2;Audi;A4;30000;90000\nG3;Fiat;Panda;8000;100000\nG4;Opel;Corsa;9000;50000\n';

(async () => {
  console.log('\nUpload: een exportbestand voor een platform zonder adres');
  {
    ck('Gocar.be en Feed kunnen uploaden, de officiele API\'s en AUTO1 niet', reg.kanUploaden(reg.get('gocar')) && reg.kanUploaden(reg.get('feed')) && !['autoscout24', 'autoscout24_api', 'mobile_de', 'auto1', 'marktplaats', 'heycar'].some((id) => reg.kanUploaden(reg.get(id))));
    const voorOverzicht = (await inv.providersOverzicht('DEALERA')).providers.find((x) => x.id === 'gocar');
    ck('de kaart weet dat er geupload kan worden', voorOverzicht.kanUploaden === true && voorOverzicht.uploadBron === false && voorOverzicht.geconfigureerd === false);

    const r = await inv.syncUpload('DEALERA', { provider: 'gocar', tekst: CSV1, door: 'test', ...snel });
    ck('de upload slaagt', r.ok === true && r.upload && r.upload.ok === true, r);
    ck('vier wagens van dealer A', vanA().length === 4 && vanA().every((v) => v.fields.Source === 'feed'), vanA().map((v) => v.fields.Make));
    ck('het bron-id is het id uit het bestand (de eerste bron is de oude bron)', vanA().every((v) => /^G[1-4]$/.test(v.fields['Source Record ID'])), vanA().map((v) => v.fields['Source Record ID']));
    ck('en de advertenties hebben platform gocar met de sleutel van de dealer', listingsA().length === 4 && listingsA().every((l) => l.fields['Listing Key'].startsWith('DEALERA|gocar|')), listingsA().map((l) => l.fields['Listing Key']));
    ck('het antwoord zegt wat er gebeurde', r.upload.aantal === 4 && r.upload.aangemaakt === 4 && r.upload.verkocht === 0 && r.upload.dalingGeblokkeerd === false, r.upload);
    ck('zonder eerder verwijderde wagens: niets overgeslagen', r.upload.overgeslagen === 0, r.upload);
    ck('de bron is een upload-bron: gocar zonder adres', bron().bronnen.length === 1 && bron().bronnen[0].provider === 'gocar' && !bron().bronnen[0].url, bron());
    ck('dealer B is niet aangeraakt', vanB().length === 1 && vanB()[0].fields.Price === 50000 && db.vehicle_listings.find((l) => l.id === 'recL0').fields.Status === 'ACTIVE');
    const kaart = (await inv.providersOverzicht('DEALERA')).providers.find((x) => x.id === 'gocar');
    ck('de kaart toont verbonden, laatste synchronisatie en aantal', kaart.geconfigureerd === true && kaart.uploadBron === true && kaart.laatsteSync && kaart.laatsteSucces && kaart.aantal === 4 && kaart.nieuw === 4, kaart);
    ck('de bron draagt zelf de markering upload: true', bron().bronnen[0].upload === true, bron());
    ck('een upload-bron telt niet als "feed": de voorraad blijft zoals ze was (native)', inv.saneerBron(bron()).type === 'native');
    ck('een feed zonder adres en zonder die markering blijft een onvolledige feed (zoals altijd)', inv.saneerBron({ type: 'feed', url: '' }).type === 'feed' && inv.saneerBron({ bronnen: [{ provider: 'gocar' }] }).type === 'feed');
    ck('krijgt een upload-bron alsnog een adres, dan is hij gewoon een bron met adres', inv.saneerBron({ bronnen: [{ provider: 'gocar', upload: true, url: FEED_B }] }).bronnen[0].upload === undefined && inv.saneerBron({ bronnen: [{ provider: 'gocar', upload: true, url: FEED_B }] }).type === 'feed');
    ck('de markering werkt alleen voor platformen die uploaden mogen', inv.saneerBron({ bronnen: [{ provider: 'mobile_de', upload: true }] }).bronnen[0].upload === undefined);
    ck('een upload zet de toestand van de hele voorraad niet op mislukt of vers', stand().lastResult === undefined && stand().lastSuccessAt === undefined, { r: stand().lastResult, s: stand().lastSuccessAt });
    ck('de run staat in de geschiedenis met trigger upload', stand().runs[0].trigger === 'upload' && stand().runs[0].ok === true, stand().runs[0]);

    console.log('\nUpload: de uursync laat een upload-bron met rust');
    geopend.length = 0;
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('de gewone sync raakt de toestand van de upload-bron niet aan', stand().bronnen.gocar.lastResult === 'ok' && stand().bronnen.gocar.count === 4);
    zet(Object.assign({}, bron(), { bronnen: bron().bronnen.concat([{ provider: 'feed', url: FEED_A, formaat: 'json' }]) }));
    feeds[FEED_A].items = [{ id: 'A1', make: 'Mazda', model: '3', price: 20000 }];
    const rf = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('met een feed erbij: de feed draait, de upload-bron niet (geen verzoek naar gocar)', rf.ok === true && geopend.every((u) => u === FEED_A) && stand().bronnen.feed.lastResult === 'ok' && stand().bronnen.gocar.lastResult === 'ok', { g: geopend, b: stand().bronnen });
    ck('de wagens uit het bestand blijven staan (de uursync zet ze niet op verkocht)', vanA().filter((v) => ['BMW', 'Audi', 'Fiat', 'Opel'].includes(v.fields.Make) && v.fields.Status === 'beschikbaar').length === 4);
    zet({ bronnen: [{ provider: 'gocar', upload: true }], bewaarDagen: 14, legacyProvider: 'gocar' });
    for (const v of vanA().filter((x) => x.fields.Make === 'Mazda')) db.vehicles.splice(db.vehicles.indexOf(v), 1);
    for (const l of db.vehicle_listings.filter((x) => x.fields.Provider === 'feed' && x.fields['Project Code'] === 'DEALERA')) db.vehicle_listings.splice(db.vehicle_listings.indexOf(l), 1);
  }

  console.log('\nUpload: meer dan de helft weg = bevestiging vragen, nooit stil verkocht');
  {
    /* Vier actieve wagens; het nieuwe bestand laat er twee vallen: precies de helft, dat mag. */
    let r = await inv.syncUpload('DEALERA', { provider: 'gocar', tekst: 'id;make;model;price\nG1;BMW;X5;50000\nG2;Audi;A4;30000\n', door: 'test', ...snel });
    ck('de helft weg: wel verwerkt, twee op verkocht', r.ok && r.upload.dalingGeblokkeerd === false && r.upload.verkocht === 2 && bijMerk('Fiat').fields.Status === 'verkocht' && bijMerk('Opel').fields.Status === 'verkocht', r.upload);
    ck('en de verkoopdatum staat erbij (de bewaartermijn loopt)', Boolean(bijMerk('Fiat').fields['Sold At']));
    /* Twee actieve (G1, G2); het bestand heeft alleen een nieuwe wagen: beide vallen weg = 100%. */
    const voor = JSON.stringify(vanA().map((v) => [v.fields.Make, v.fields.Status]));
    r = await inv.syncUpload('DEALERA', { provider: 'gocar', tekst: 'id;make;model;price\nG9;Tesla;Model 3;40000\n', door: 'test', ...snel });
    ck('meer dan de helft weg: niets op verkocht, het scherm vraagt om bevestiging', r.upload.dalingGeblokkeerd === true && r.upload.verdwenenAantal === 2 && r.upload.verkocht === 0, r.upload);
    ck('BMW en Audi zijn nog beschikbaar', bijMerk('BMW').fields.Status === 'beschikbaar' && bijMerk('Audi').fields.Status === 'beschikbaar');
    ck('wat er in het bestand stond komt wel binnen (nieuw is geen verkoop)', Boolean(bijMerk('Tesla')) && vanA().length === JSON.parse(voor).length + 1);
    ck('een geblokkeerde upload kan niet als onveranderd worden overgeslagen: bevestigen werkt meteen', (await inv.syncUpload('DEALERA', { provider: 'gocar', tekst: 'id;make;model;price\nG9;Tesla;Model 3;40000\n', bevestigDaling: true, door: 'test', ...snel })).upload.verkocht === 2);
    ck('na bevestiging: BMW en Audi op verkocht', bijMerk('BMW').fields.Status === 'verkocht' && bijMerk('Audi').fields.Status === 'verkocht');
    ck('en de wagens zijn niet gewist', vanA().filter((v) => v.fields.Make === 'BMW').length === 1);
    /* Een klein bestand: een feed laat de grens pas bij 5 gelden, een upload al bij 1. */
    const bestaand = [1, 2, 3].map((n) => ({ id: 'rec' + n, code: 'V' + n, merk: 'M' + n, model: 'X', status: 'beschikbaar', gearchiveerd: false, bron: 'feed', bronId: 'G' + n, vin: '', autoscout: '', link: '' }));
    const rijen = [1, 2, 3].map((n) => ({ provider: 'gocar', externalId: 'G' + n, vehicleCode: 'V' + n, status: 'ACTIVE', gezien: '2026-10-05T00:00:00.000Z' }));
    const bronnen = [{ provider: 'gocar', verdwenen: 'verkocht', voertuigen: [{ bronId: 'G9', merk: 'Nieuw', model: 'X' }] }];
    ck('een feed met drie wagens die allemaal verdwijnen wordt niet tegengehouden (ondergrens 5)', vsync.verzoenAlles(bestaand, rijen, bronnen, { nu: '2026-10-05T10:00:00.000Z', legacyProvider: 'gocar' }).dalingGeblokkeerd === false);
    ck('een upload met dezelfde cijfers wel (dalingMin 1)', vsync.verzoenAlles(bestaand, rijen, bronnen, { nu: '2026-10-05T10:00:00.000Z', legacyProvider: 'gocar', dalingMin: 1 }).dalingGeblokkeerd === true);
  }

  console.log('\nUpload: grens, onleesbaar, verkeerd platform, andere dealer');
  {
    const voorAantal = [db.vehicles.length, db.vehicle_listings.length];
    const voorStaat = klanten.DEALERA.fields['Inventory State'];
    const reden = async (invoer) => (await inv.syncUpload('DEALERA', invoer)).reden;
    ck('2 MB is de grens: net eronder mag, erboven niet', inv.MAX_UPLOAD_BYTES === 2 * 1024 * 1024);
    const groot = 'id;make\n' + 'X;BMW\n'.repeat(Math.ceil(inv.MAX_UPLOAD_BYTES / 6) + 10);
    ck('een bestand boven de grens: bestand_te_groot', await reden({ provider: 'gocar', tekst: groot }) === 'bestand_te_groot');
    ck('meetekens tellen als bytes, niet als tekens', await reden({ provider: 'gocar', tekst: 'é'.repeat(inv.MAX_UPLOAD_BYTES / 2 + 10) }) === 'bestand_te_groot');
    ck('geen bestand of alleen witruimte: geen_bestand', await reden({ provider: 'gocar', tekst: '   \n' }) === 'geen_bestand' && await reden({ provider: 'gocar' }) === 'geen_bestand' && await reden({ provider: 'gocar', tekst: { x: 1 } }) === 'geen_bestand');
    ck('een bestand zonder herkenbare wagens: bestand_leeg', await reden({ provider: 'gocar', tekst: 'a;b;c\n1;2;3\n' }) === 'bestand_leeg' && await reden({ provider: 'gocar', tekst: '[]' }) === 'bestand_leeg');
    ck('kapotte JSON: bestand_onleesbaar', await reden({ provider: 'gocar', tekst: '{"vehicles": [' }) === 'bestand_onleesbaar');
    for (const id of ['autoscout24', 'autoscout24_api', 'mobile_de', 'auto1', 'marktplaats', 'heycar', 'meta']) ck(`${id}: upload_niet_mogelijk`, await reden({ provider: id, tekst: CSV1 }) === 'upload_niet_mogelijk');
    ck('een onbekend platform: onbekende_provider', await reden({ provider: 'bestaatniet', tekst: CSV1 }) === 'onbekende_provider' && await reden({ provider: undefined, tekst: CSV1 }) === 'onbekende_provider');
    ck('niets veranderde bij al die weigeringen', db.vehicles.length === voorAantal[0] && db.vehicle_listings.length === voorAantal[1] && klanten.DEALERA.fields['Inventory State'] === voorStaat);
    let gooit = false;
    try { await inv.syncUpload('', { provider: 'gocar', tekst: CSV1 }); } catch (_) { gooit = true; }
    ck('zonder projectcode (sessie) gooit het', gooit);

    /* Een andere dealer: zijn bestand raakt A niet, en andersom. */
    const aVoor = JSON.stringify(vanA().map((v) => v.fields));
    const rb = await inv.syncUpload('DEALERB', { provider: 'gocar', tekst: 'id;make;model;price\nG1;BMW;X5;51000\nB2;Skoda;Octavia;18000\n', door: 'test', ...snel });
    ck('dealer B: upload verwerkt', rb.ok === true && rb.upload.aantal === 2, rb);
    ck('dealer A is niet veranderd', JSON.stringify(vanA().map((v) => v.fields)) === aVoor);
    ck('de advertenties van B dragen de sleutel van B', db.vehicle_listings.filter((l) => l.fields['Project Code'] === 'DEALERB').every((l) => l.fields['Listing Key'].startsWith('DEALERB|')));
    ck('dezelfde ids (G1) bij twee dealers botsen niet', db.vehicle_listings.filter((l) => /\|gocar\|g1$/.test(l.fields['Listing Key'])).length === 2);

    const leads = lees('api/leads.js');
    const i = leads.indexOf("body.mode === 'inventory-upload'");
    const blok = leads.slice(i, i + 3500);
    ck('de route: blok gevonden, weigert zonder sessie-tenant', i > 0 && /if \(!projectCode\) return res\.status\(403\)/.test(blok.slice(0, 300)));
    ck('de tenant komt nooit uit de body', !/body\.(projectCode|project_code|tenant|projectcode)\b/.test(blok));
    ck('de route vertaalt te groot naar 413 en geeft de reden mee', /bestand_te_groot' \? 413/.test(blok) && /code: uit\.reden/.test(blok));
    ck('alleen bevestigDaling === true telt', /bevestigDaling: body\.bevestigDaling === true/.test(blok));
    ck('de route staat in de tenant-controlelijst', /\["inventory-upload", "body\.mode === 'inventory-upload'"\]/.test(lees('tests/tenant-nieuwe-modes.test.js')));
    ck('de lokale harness (scripts/faro-dev.js) kent de mode', /case 'inventory-upload':/.test(lees('scripts/faro-dev.js')));
  }

  console.log('\nLaatste synchronisatie: een bron van voor de meerbronnenvorm');
  {
    const NU = '2026-10-05T08:00:00.000Z';
    zet({ type: 'feed', url: FEED_A, formaat: 'json' });
    zetStaat({ source: 'feed', lastAttemptAt: NU, lastSuccessAt: NU, lastResult: 'ok', count: 12, changed: 1, removed: 0, failed: 0, version: 'abc', runs: [] });
    let kaarten = (await inv.providersOverzicht('DEALERA')).providers;
    const feedKaart = kaarten.find((p) => p.id === 'feed');
    ck('de feed-kaart toont de oude laatste synchronisatie en het aantal (niet "nooit")', feedKaart.laatsteSucces === NU && feedKaart.laatsteSync === NU && feedKaart.aantal === 12 && feedKaart.resultaat === 'ok', feedKaart);
    ck('een ander platform krijgt die oude toestand niet', kaarten.filter((p) => p.id !== 'feed').every((p) => p.laatsteSucces === null && p.aantal === null));
    const st = await inv.status('DEALERA');
    ck('ook in de status (bronnen)', st.bronnen[0].laatsteSucces === NU && st.bronnen[0].aantal === 12, st.bronnen[0]);
    /* De live AutoScout24-dealer: legacyProvider is het profiel. */
    zet({ type: 'feed', url: 'https://www.autoscout24.be/nl/verkopers/garage-x', provider: 'autoscout24' });
    kaarten = (await inv.providersOverzicht('DEALERA')).providers;
    ck('een AutoScout24-profielbron van voor de meerbronnenvorm: de terugval hoort bij dat profiel', kaarten.find((p) => p.id === 'autoscout24').laatsteSucces === NU && kaarten.find((p) => p.id === 'autoscout24').aantal === 12 && kaarten.find((p) => p.id === 'feed').laatsteSucces === null);
    /* Er is al een toestand per bron: die wint. */
    zetStaat({ source: 'feed', lastAttemptAt: NU, lastSuccessAt: NU, lastResult: 'ok', count: 12, bronnen: { autoscout24: { lastAttemptAt: '2026-10-05T09:00:00.000Z', lastSuccessAt: '2026-10-05T09:00:00.000Z', lastResult: 'ok', count: 14 } } });
    const nieuw = (await inv.providersOverzicht('DEALERA')).providers.find((p) => p.id === 'autoscout24');
    ck('met een toestand per bron wint die, niet de oude bovenste velden', nieuw.laatsteSucces === '2026-10-05T09:00:00.000Z' && nieuw.aantal === 14, nieuw);
    /* Een tweede bron zonder eigen toestand krijgt de bovenste velden NIET. */
    zet({ bronnen: [{ provider: 'autoscout24', url: 'https://www.autoscout24.be/nl/verkopers/garage-x' }, { provider: 'feed', url: FEED_A }], legacyProvider: 'autoscout24' });
    const tweede = (await inv.providersOverzicht('DEALERA')).providers.find((p) => p.id === 'feed');
    ck('een tweede bron zonder eigen toestand blijft "nooit"', tweede.laatsteSucces === null && tweede.aantal === null, tweede);
    ck('zonder enige toestand: niets verzonnen', inv._test.bronStaatVan({}, { legacyProvider: 'feed' }, 'feed') === undefined && inv._test.bronStaatVan(undefined, undefined, 'feed') === undefined);
    ck('de oude fout hoort bij de legacy-bron, alleen als de laatste poging mislukte', inv._test.bronStaatVan({ lastAttemptAt: NU, lastResult: 'failed', lastErrorCode: 'feed_http', count: 3 }, { legacyProvider: 'feed' }, 'feed').lastErrorCode === 'feed_http' && inv._test.bronStaatVan({ lastSuccessAt: NU, lastResult: 'ok', lastErrorCode: 'oud' }, { legacyProvider: 'feed' }, 'feed').lastErrorCode === '');
  }

  console.log('\nEen bron die twee keer op rij faalt terwijl een andere slaagt: een melding');
  {
    const meld = () => PUSH.filter((p) => p.tekstSleutel === 'push.voorraad.bron');
    const alle = () => PUSH.filter((p) => p.projectCode === 'DEALERA');
    zet({ bronnen: [{ provider: 'feed', url: FEED_A, formaat: 'json' }, { provider: 'gocar', url: FEED_B, formaat: 'json' }], legacyProvider: 'feed' });
    zetStaat({});
    feeds[FEED_A].items = [{ id: 'A1', make: 'Mazda', model: '3', price: 20000 }];
    feeds[FEED_B].items = [{ id: 'G1', make: 'Seat', model: 'Ibiza', price: 9000 }];
    feeds[FEED_B].status = 500;
    PUSH.length = 0;
    let r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('eerste mislukking van een bron: een gedeeltelijke run, nog geen melding', r.ok === true && r.lastResult === 'partial' && alle().length === 0 && stand().bronnen.gocar.fouten === 1, { ok: r.ok, p: PUSH, f: stand().bronnen.gocar });
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('tweede op rij: een melding, met de naam van het platform', meld().length === 1 && meld()[0].vars.bron === 'Gocar.be' && meld()[0].titelSleutel === 'push.voorraad.titel' && meld()[0].projectCode === 'DEALERA', PUSH);
    ck('en het is niet de melding voor een mislukte hele run', alle().every((p) => p.tekstSleutel === 'push.voorraad.bron'));
    ck('de teller staat op 2', stand().bronnen.gocar.fouten === 2);
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('derde op rij: geen nieuwe melding (alleen bij de overgang)', meld().length === 1 && stand().bronnen.gocar.fouten === 3, { n: meld().length });
    feeds[FEED_B].status = 200;
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('de bron herstelt: de teller gaat naar 0, geen melding', stand().bronnen.gocar.fouten === 0 && stand().bronnen.gocar.lastResult === 'ok' && meld().length === 1);
    feeds[FEED_B].status = 500;
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('een nieuwe mislukking na herstel: een keer opnieuw 1, geen melding', stand().bronnen.gocar.fouten === 1 && meld().length === 1);
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('en de tweede daarna: weer een melding', meld().length === 2);

    /* Alles faalt: de bestaande run-melding, niet een per bron. */
    feeds[FEED_A].status = 503;
    PUSH.length = 0; zetStaat({});
    await inv.sync('DEALERA', { door: 'test', ...snel });
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('alle bronnen mislukt: een run-melding, geen melding per bron', PUSH.length === 1 && PUSH[0].tekstSleutel === 'push.voorraad.mislukt', PUSH.map((p) => p.tekstSleutel));
    feeds[FEED_A].status = 200;

    /* Een toestand van voor de teller met een mislukte bron telt als een keer. */
    PUSH.length = 0;
    zetStaat({ lastResult: 'ok', lastSuccessAt: '2026-10-05T08:00:00.000Z', bronnen: { feed: { lastResult: 'ok', lastSuccessAt: '2026-10-05T08:00:00.000Z' }, gocar: { lastResult: 'failed', lastErrorCode: 'PROVIDER_DOWN' } } });
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('een oude toestand "failed" zonder teller + een nieuwe mislukking = de tweede: melding', meld().length === 1, PUSH);
    ck('een melding is vuur-en-vergeet: een kapotte push laat de sync niet falen', await (async () => {
      const echte = require(BASE + 'api/_push.js').stuurVertaald;
      require(BASE + 'api/_push.js').stuurVertaald = () => { throw new Error('push stuk'); };
      try { zetStaat({ bronnen: { gocar: { lastResult: 'failed', fouten: 1 } } }); const x = await inv.sync('DEALERA', { door: 'test', ...snel }); return x.ok === true; } finally { require(BASE + 'api/_push.js').stuurVertaald = echte; }
    })());
    ck('een upload meldt nooit (het is geen geplande bron)', (() => { PUSH.length = 0; inv.meldBronAlsNodig('DEALERA', [{ provider: 'gocar' }], { gocar: { lastResult: 'failed', fouten: 2 } }, null); return PUSH.length === 0; })());
    const tekst = lees('api/_i18n.js');
    ck('de tekst bestaat in vier talen met {bron}', /'push\.voorraad\.bron':\s*\{ nl: [^}]*\{bron\}[^}]*fr: [^}]*\{bron\}[^}]*en: [^}]*\{bron\}[^}]*de: [^}]*\{bron\}/.test(tekst));
  }

  console.log('\nVerwijderen: ook de advertentierijen van die wagen');
  {
    zet({ bronnen: [{ provider: 'feed', url: FEED_A, formaat: 'json' }, { provider: 'gocar', url: FEED_B, formaat: 'json' }], legacyProvider: 'feed' });
    zetStaat({});
    feeds[FEED_B].status = 200;
    feeds[FEED_A].items = [{ id: 'A1', make: 'Mazda', model: '3', price: 20000, vin: 'WBA12345678901234' }, { id: 'A2', make: 'Ford', model: 'Focus', price: 12000 }];
    feeds[FEED_B].items = [{ id: 'G1', make: 'Mazda', model: '3', price: 20100, vin: 'WBA12345678901234' }, { id: 'G2', make: 'Seat', model: 'Ibiza', price: 9000 }];
    for (const r of vanA().slice()) db.vehicles.splice(db.vehicles.indexOf(r), 1);
    for (const r of listingsA().slice()) db.vehicle_listings.splice(db.vehicle_listings.indexOf(r), 1);
    await inv.sync('DEALERA', { door: 'test', ...snel });
    const mazda = bijMerk('Mazda');
    const code = mazda.fields['Vehicle Code'];
    ck('opzet: een Mazda op twee platformen (zelfde VIN), met twee advertentierijen', vanA().length === 3 && listingsA().filter((l) => l.fields['Vehicle Code'] === code).length === 2, listingsA().map((l) => [l.fields['Listing Key'], l.fields['Vehicle Code']]));
    /* Dealer B heeft ook een wagen met die code: mag niet geraakt worden. */
    db.vehicle_listings.push({ id: 'recLB', fields: { 'Listing Key': 'DEALERB|feed|zz', 'Project Code': 'DEALERB', 'Vehicle Code': code, Provider: 'feed', 'External ID': 'ZZ', Status: 'ACTIVE' } });
    const bRijenVoor = db.vehicle_listings.filter((l) => l.fields['Project Code'] === 'DEALERB').length;

    /* Dezelfde stappen als de route vehicle-delete. */
    const adv = await listings.voorVoertuig('DEALERA', code);
    ck('de advertenties van de wagen zijn te lezen voor het verwijderen', adv.length === 2 && adv.every((l) => l.projectCode === 'DEALERA'), adv);
    const weg = await vehicles.verwijder('DEALERA', code);
    ck('de wagen is weg', !bijMerk('Mazda') && weg.code === code);
    const uit = await inv.sluitUitAdvertenties('DEALERA', adv);
    ck('alle platformen waar de wagen stond worden uitgesloten (anders komt hij via het tweede terug)', uit.ok === true && uit.aantal === 2 && bron().uitgesloten.includes('A1') && bron().uitgesloten.includes('gocar:G1'), bron().uitgesloten);
    const ruim = await listings.verwijderVoorVoertuig('DEALERA', code);
    ck('de advertentierijen van die wagen zijn weg', ruim.verwijderd === 2 && ruim.failed === 0 && listingsA().filter((l) => l.fields['Vehicle Code'] === code).length === 0, ruim);
    ck('die van de andere wagens van A blijven', listingsA().length === 2, listingsA().map((l) => l.fields['Listing Key']));
    ck('die van dealer B met dezelfde code blijven (tenant-scoped)', db.vehicle_listings.filter((l) => l.fields['Project Code'] === 'DEALERB').length === bRijenVoor && db.vehicle_listings.some((l) => l.id === 'recLB'));
    await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('de volgende sync zet de wagen niet terug', !bijMerk('Mazda') && vanA().length === 2, vanA().map((v) => v.fields.Make));
    let gooit = false;
    try { await listings.verwijderVoorVoertuig('', code); } catch (_) { gooit = true; }
    ck('zonder projectcode gooit het opruimen', gooit);
    ck('een wagen zonder advertenties: niets te doen, geen fout', (await listings.verwijderVoorVoertuig('DEALERA', 'V404')).verwijderd === 0);
    ck('rijen van een andere dealer worden niet uitgesloten', (await inv.sluitUitAdvertenties('DEALERA', [{ projectCode: 'DEALERB', provider: 'feed', externalId: 'ZZ' }])).overgeslagen === true && !bron().uitgesloten.includes('ZZ'));

    const leads = lees('api/leads.js');
    const i = leads.indexOf("body.mode === 'vehicle-delete'");
    const blok = leads.slice(i, i + 3500);
    ck('de route leest de advertenties VOOR het verwijderen', blok.indexOf('_listings.voorVoertuig') > 0 && blok.indexOf('_listings.voorVoertuig') < blok.indexOf('_vehicles.verwijder('));
    ck('en ruimt ze daarna op, tenant uit de sessie', /_inventaris\.sluitUitAdvertenties\(projectCode, advertenties\)/.test(blok) && /_listings\.verwijderVoorVoertuig\(projectCode, weg\.code\)/.test(blok));
    ck('een fout bij het opruimen laat het verwijderen niet mislukken (best effort, gelogd)', /advertenties opruimen mislukt/.test(blok) && blok.indexOf('advertenties opruimen mislukt') < blok.indexOf("status(200).json({ ok: true, code: weg.code"));
  }

  console.log('\nHet scherm en de teksten');
  {
    const mod = lees('api/_dash/integraties.js');
    const dash = lees('api/dashboard.js');
    const nl = i18n.woordenboek('nl');
    ck('de bevestigingsvraag noemt de bewaartermijn van de dealer, niet "14 dagen"', ['nl', 'fr', 'en', 'de'].every((t) => { const x = i18n.woordenboek(t)['inv.daling.vraag']; return /\{dagen\}/.test(x) && /\{n\}/.test(x) && !/\b14\b/.test(x); }));
    ck('het scherm geeft de bewaartermijn van de dealer mee', /tr\('inv\.daling\.vraag', \{ n: n, dagen: HV_BEWAAR_DAGEN \}\)/.test(dash));
    ck('de upload-vraag in het integratiescherm noemt hem ook', ['nl', 'fr', 'en', 'de'].every((t) => /\{dagen\}/.test(i18n.woordenboek(t)['ig.upload.daling']) && /\{n\}/.test(i18n.woordenboek(t)['ig.upload.daling'])));
    ck('de module stuurt het bestand naar inventory-upload en vraagt bevestiging bij een daling', /voorraadVraag\('inventory-upload', \{ provider: id, csv: tekst, bevestigDaling: bevestig === true \}\)/.test(mod) && /u\.dalingGeblokkeerd && !bevestig/.test(mod) && /igUpload\(id, tekst, true\)/.test(mod));
    ck('het bestandsveld is verborgen, klikken via data-attributen, grens 2 MB ook in de browser', /type="file"[^>]*style="display:none"/.test(mod) && !/onclick=/.test(mod) && /2 \* 1024 \* 1024/.test(mod));
    ck('de module heeft geen backticks of ${ (hij wordt in een template geplakt)', !/[`]|\$\{/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')));
    ck('mobile.de: de inloggegevens worden alleen opnieuw gestuurd als de dealer iets invult', /if \(gebruiker \|\| geheim \|\| !p\.heeftCredentials\) body\.credentials/.test(mod));
    ck('AutoScout24 (API): alleen het klantnummer, geen wachtwoordveld', /p\.auth === 'customer_id'/.test(mod) && /body\.customerId = /.test(mod));
    /* De leadkaart. */
    const lead = leesLeads.mapLead({ id: 'recL1', fields: { 'Project Code': 'DEALERA', 'Listing Provider': 'autoscout24', 'Listing ID': 'ABC-123' } });
    ck('de lead heeft listingProvider en listingId', lead.listingProvider === 'autoscout24' && lead.listingId === 'ABC-123', lead);
    ck('en leeg als er niets is (geen undefined)', leesLeads.mapLead({ id: 'x', fields: {} }).listingProvider === '' && leesLeads.mapLead({ id: 'x', fields: {} }).listingId === '');
    ck('het paneel toont een kleine, alleen-lezen kaart voor dealers', /if \(isDealer\(\) && typeof dealerAdvertentieKaart === 'function'\) bodyHTML \+= dealerAdvertentieKaart\(lead\);/.test(dash) && /function dealerAdvertentieKaart\(lead\)/.test(mod) && !/<input|<button/.test(mod.slice(mod.indexOf('function dealerAdvertentieKaart'), mod.indexOf('async function igDagen'))));
    ck('zonder platform op de lead: geen kaart', /if \(!lead \|\| !lead\.listingProvider\) return ''/.test(mod));
    for (const t of ['nl', 'fr', 'en', 'de']) {
      const w = i18n.woordenboek(t);
      ck(`${t}: lead.listing.* en ig.upload.* bestaan`, ['lead.listing.titel', 'lead.listing.regel', 'ig.upload.knop', 'ig.upload.klaar', 'ig.upload.daling', 'ig.err.bestand_te_groot', 'ig.err.bestand_leeg', 'ig.err.bestand_onleesbaar', 'push.voorraad.bron'].every((k) => w[k] && w[k].length > 3));
    }
    ck('en de sleutels die de module gebruikt bestaan in vier talen', (() => { const sleutels = new Set(); const re = /\b(?:tr|igTekst)\(\s*'([a-zA-Z0-9_.\-]+)'/g; let m; while ((m = re.exec(mod))) if (m[1].slice(-1) !== '.') sleutels.add(m[1]); return ['nl', 'fr', 'en', 'de'].every((t) => [...sleutels].every((k) => i18n.woordenboek(t)[k])); })());
    ck('de dashboardgrens van 22.000 regels blijft heel', dash.split('\n').length < 22000, dash.split('\n').length);
  }

  console.log('\nUpload: een eerder verwijderde wagen komt niet terug, en het scherm zegt dat');
  {
    /* Op dit punt is 'feed' de oude bron, dus een gocar-wagen heet gocar:<id>. */
    await inv.sluitUit('DEALERA', 'gocar:G9');
    const r = await inv.syncUpload('DEALERA', { provider: 'gocar', tekst: 'id;make;model;price\nG9;Tesla;Model 3;40000\nG10;Kia;Ceed;20000\n', bevestigDaling: true, door: 'test', ...snel });
    const invBron = require('fs').readFileSync(BASE + 'api/_inventaris.js', 'utf8');
    ck('verwijderen sluit ook uit bij een dealer met alleen een upload-bron (type native)', (invBron.match(/bron\.type !== 'feed' && !\(bron\.bronnen \|\| \[\]\)\.length/g) || []).length === 2);
    ck('een eerder verwijderde wagen in het bestand telt als overgeslagen', r && r.upload && r.upload.overgeslagen === 1, r && r.upload);
    ck('en de kaart telt hem niet mee als wagen van dit platform', stand().bronnen.gocar.count === 1, stand().bronnen.gocar);
  }

  global.fetch = echteFetch;
  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('STUK:', e && e.stack); process.exit(1); });
