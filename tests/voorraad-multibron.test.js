'use strict';
/*
 * Meerdere bronnen per dealer (2026-10-05): de oude enkele bron leest als een
 * lijst van een, elke bron draait apart, wagens die op twee platformen staan
 * blijven EEN wagen, en een mislukte bron verandert nooit iets aan wat hij
 * toonde.
 *
 * Twee lagen:
 *   1. verzoenAlles() direct: pure functie, de koppelregels en de verkocht-regel.
 *   2. sync() van begin tot eind, met een nep-Airtable in het geheugen
 *      (Client Config, vehicles, vehicle_listings) en nep-feeds. Er gaat niets
 *      over het net.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.GOOGLE_TOKEN_KEY = 'test-sleutel-voor-versleuteling';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 320)}`); ok ? pass++ : fail++; };

/* ── De nagemaakte feeds ─────────────────────────────────────────────────── */
const FEED_A = 'https://dms-a.example/voorraad.json';
const FEED_B = 'https://gocar-b.example/export.json';
const feeds = { [FEED_A]: { status: 200, items: [] }, [FEED_B]: { status: 200, items: [] } };
const geopend = [];

/* ── De nagemaakte Airtable ──────────────────────────────────────────────── */
const klanten = {
  DEALERA: { id: 'recKA', fields: { 'Project Code': 'DEALERA', Vertical: 'dealership' } },
  DEALERB: { id: 'recKB', fields: { 'Project Code': 'DEALERB', Vertical: 'dealership' } },
};
const db = { vehicles: [], vehicle_listings: [], nr: 0, tabelListings: true };
/* Dealer B heeft zijn eigen wagen en advertentie: die mogen door niets van A geraakt worden. */
db.vehicles.push({ id: 'recB1', fields: { 'Project Code': 'DEALERB', 'Vehicle Code': 'V1', Make: 'BMW', Model: 'X5', Price: 50000, Status: 'beschikbaar', VIN: 'WBA12345678901234' } });
db.vehicle_listings.push({ id: 'recL0', fields: { 'Listing Key': 'DEALERB|feed|a1', 'Project Code': 'DEALERB', 'Vehicle Code': 'V1', Provider: 'feed', 'External ID': 'A1', Status: 'ACTIVE', 'Last Seen At': '2026-10-01T00:00:00.000Z' } });

const ok = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });

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
  const tm = /appTEST\/(vehicles|vehicle_listings)(\?|$)/.exec(u);
  if (tm) {
    const tabel = tm[1];
    if (tabel === 'vehicle_listings' && !db.tabelListings) return ok({ error: { type: 'TABLE_NOT_FOUND' } }, 404);
    const rijen = db[tabel];
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

const vsync = require(BASE + 'api/_voorraad-sync.js');
const inv = require(BASE + 'api/_inventaris.js');
const reg = require(BASE + 'api/_voorraad-providers');
const listings = require(BASE + 'api/_listings.js');
const vehicles = require(BASE + 'api/_vehicles.js');

const VIN1 = 'WBA12345678901234';
const VIN2 = 'WAU98765432109876';
const AS_ID = '11111111-2222-3333-4444-555555555555';
const NU = '2026-10-05T10:00:00.000Z';

/* Een wagen zoals vehicles.list() hem teruggeeft, en een bronregel zoals mapRegel() hem aflevert. */
const wagen = (o) => Object.assign({ id: 'rec' + o.code, code: o.code, projectCode: 'P1', merk: 'BMW', model: 'X5', uitvoering: '', prijs: 50000, km: 40000,
  status: 'beschikbaar', gearchiveerd: false, bron: '', bronId: '', fotos: [], omschrijving: '', link: '', verkochtOp: '', vin: '', autoscout: '' }, o);
const regel = (o) => Object.assign({ bronId: 'X', merk: 'BMW', model: 'X5', prijs: 50000, km: 40000, status: 'beschikbaar' }, o);
const adv = (provider, ext, code, extra) => Object.assign({ provider, externalId: ext, vehicleCode: code, status: 'ACTIVE', url: '', gezien: NU }, extra || {});

const vanA = () => db.vehicles.filter((r) => r.fields['Project Code'] === 'DEALERA');
const bij = (code) => vanA().find((r) => r.fields['Vehicle Code'] === code);
const perMerkModel = (merk, model) => vanA().filter((r) => r.fields.Make === merk && r.fields.Model === model);
const listingsA = () => db.vehicle_listings.filter((r) => r.fields['Project Code'] === 'DEALERA');
const snel = { budgetMs: 60000 };
const zet = (o) => { klanten.DEALERA.fields['Inventory Source'] = JSON.stringify(o); };
const stand = () => JSON.parse(klanten.DEALERA.fields['Inventory State'] || '{}');

(async () => {
  /* ═══════════════════════════ LAAG 1: verzoenAlles ═══════════════════════════ */

  console.log('\nKoppelen: alleen op EXACTE sleutels, nooit op wat erop lijkt');
  {
    const bestaand = [wagen({ code: 'V1', vin: VIN1, bron: 'feed', bronId: 'A1' })];
    const bronnen = (items) => [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1' })] }, { provider: 'gocar', verdwenen: 'verkocht', voertuigen: items }];
    const opt = { nu: NU, legacyProvider: 'feed', codesToewijzen: true };

    let p = vsync.verzoenAlles(bestaand, [], bronnen([regel({ bronId: 'G9', vin: VIN1.toLowerCase() })]), opt);
    ck('zelfde chassisnummer (andere hoofdletters): een wagen, geen nieuwe', p.nieuw.length === 0, p.nieuw);
    ck('en de advertentie van het tweede platform hangt eraan', p.listings.some((l) => l.provider === 'gocar' && l.vehicleCode === 'V1'), p.listings);

    p = vsync.verzoenAlles(bestaand, [], bronnen([regel({ bronId: 'G9' })]), opt);
    ck('zelfde merk, model, prijs en km zonder exacte sleutel: NIEUWE wagen (nooit fuzzy)', p.nieuw.length === 1, p.nieuw);

    /* Kenmerken: merk, model, EXACTE km en eerste inschrijving, alleen bij precies een kandidaat. */
    const metDatum = [wagen({ code: 'V1', bron: 'feed', bronId: 'A1', inschrijving: '03/2021' })];
    const bronnenD = (items) => [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1', inschrijving: '03/2021' })] }, { provider: 'gocar', verdwenen: 'verkocht', voertuigen: items }];
    p = vsync.verzoenAlles(metDatum, [], bronnenD([regel({ bronId: 'G9', merk: 'bmw', model: 'X 5', inschrijving: '2021-03' })]), opt);
    ck('zelfde merk, model, exacte km en inschrijving (andere schrijfwijze): een wagen', p.nieuw.length === 0 && p.listings.some((l) => l.provider === 'gocar' && l.vehicleCode === 'V1'), p.nieuw);
    p = vsync.verzoenAlles(metDatum, [], bronnenD([regel({ bronId: 'G9', km: 40001, inschrijving: '03/2021' })]), opt);
    ck('een kilometer verschil: nieuwe wagen', p.nieuw.length === 1, p.nieuw);
    p = vsync.verzoenAlles(metDatum, [], bronnenD([regel({ bronId: 'G9', inschrijving: '04/2021' })]), opt);
    ck('andere inschrijvingsmaand: nieuwe wagen', p.nieuw.length === 1, p.nieuw);
    p = vsync.verzoenAlles([wagen({ code: 'V1', bron: 'feed', bronId: 'A1', inschrijving: '03/2021', vin: VIN1 })], [], [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1', inschrijving: '03/2021', vin: VIN1 })] }, { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G9', inschrijving: '03/2021', vin: 'WBA00000000000002' })] }], opt);
    ck('zelfde kenmerken maar een ANDER chassisnummer: nieuwe wagen', p.nieuw.length === 1, p.nieuw);
    const tweeGelijk = [wagen({ code: 'V1', bron: 'feed', bronId: 'A1', inschrijving: '03/2021' }), wagen({ code: 'V2', bron: 'feed', bronId: 'A2', inschrijving: '03/2021' })];
    p = vsync.verzoenAlles(tweeGelijk, [], [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1', inschrijving: '03/2021' }), regel({ bronId: 'A2', inschrijving: '03/2021' })] }, { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G9', inschrijving: '03/2021' })] }], opt);
    ck('twee kandidaten met dezelfde kenmerken: niet gokken, nieuwe wagen', p.nieuw.length === 1, p.nieuw);
    ck('zonder km of datum geen kenmerksleutel', vsync._test.kenmerkSleutel({ merk: 'BMW', model: 'X5', km: 0, inschrijving: '03/2021' }) === '' && vsync._test.kenmerkSleutel({ merk: 'BMW', model: 'X5', km: 10 }) === '');

    const metLink = [wagen({ code: 'V1', link: 'https://www.autoscout24.be/nl/aanbod/bmw-x5-' + AS_ID, bron: 'feed', bronId: 'A1' })];
    p = vsync.verzoenAlles(metLink, [], bronnen([regel({ bronId: 'G9', link: 'https://WWW.autoscout24.be/nl/aanbod/bmw-x5-' + AS_ID + '?utm=x#top' })]), opt);
    ck('zelfde genormaliseerde link (hoofdletters, query, hash): een wagen', p.nieuw.length === 0 && p.listings.some((l) => l.provider === 'gocar'), p);

    p = vsync.verzoenAlles(metLink, [], bronnen([regel({ bronId: 'G9', link: 'https://www.autoscout24.be/nl/aanbod/bmw-x5-ANDERE-advertentie' })]), opt);
    ck('een andere link: nieuwe wagen', p.nieuw.length === 1, p.nieuw);

    p = vsync.verzoenAlles(metLink, [], bronnen([regel({ bronId: 'G9', autoscout: AS_ID.toUpperCase() })]), opt);
    ck('zelfde AutoScout-nummer (uit de link van de wagen, hoofdletters maken niets uit): een wagen', p.nieuw.length === 0, p.nieuw);

    const dubbel = [wagen({ code: 'V1', vin: VIN1, bron: 'feed', bronId: 'A1' }), wagen({ code: 'V2', vin: VIN1, bron: 'feed', bronId: 'A2' })];
    p = vsync.verzoenAlles(dubbel, [], [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1' }), regel({ bronId: 'A2' })] }, { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G9', vin: VIN1 })] }], opt);
    ck('een chassisnummer dat op twee wagens past wordt NIET samengevoegd (en gemeld)', p.dubbelGemeld === 1 && p.nieuw.length === 1, { d: p.dubbelGemeld, n: p.nieuw.length });
  }

  console.log('\nHet AutoScout-nummer: een platform dat het meelevert wordt meteen herkend, ook in dezelfde run');
  {
    const toon = (provider, items) => ({ provider, verdwenen: 'verkocht', kentReservering: false, voertuigen: items });
    let p = vsync.verzoenAlles([], [], [toon('autoscout24', [regel({ bronId: AS_ID, autoscout: AS_ID })]), toon('feed', [regel({ bronId: 'A1', autoscout: AS_ID.toUpperCase() })])], { nu: NU, legacyProvider: 'autoscout24', codesToewijzen: true });
    ck('AutoScout24 maakt de wagen, de feed hangt er zijn advertentie aan', p.nieuw.length === 1 && p.listings.length === 2, { n: p.nieuw.length, l: p.listings.length });
    const oud = [wagen({ code: 'V1', bron: 'feed', bronId: AS_ID })];                  // een oude AutoScout24-wagen zonder AutoScout ID of link
    p = vsync.verzoenAlles(oud, [], [toon('autoscout24', [regel({ bronId: AS_ID, autoscout: AS_ID })]), toon('feed', [regel({ bronId: 'A1', autoscout: AS_ID })])], { nu: NU, legacyProvider: 'autoscout24', codesToewijzen: true });
    ck('een bestaande AutoScout24-wagen krijgt zijn nummer aangevuld en de feed herkent hem in dezelfde run', p.nieuw.length === 0 && p.bijwerken.length === 1 && p.bijwerken[0].invoer.autoscout === AS_ID && p.listings.some((l) => l.provider === 'feed'), p);
    ck('de lijst van de aanroeper is niet aangepast', oud[0].autoscout === '');
  }

  console.log('\nTwee bronnen, een nieuwe wagen: precies een keer aangemaakt');
  {
    const p = vsync.verzoenAlles([], [], [
      { provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1', vin: VIN2 })] },
      { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G1', vin: VIN2 })] },
    ], { nu: NU, legacyProvider: 'feed', codesToewijzen: true });
    ck('een wagen, twee advertenties', p.nieuw.length === 1 && p.listings.length === 2, { n: p.nieuw.length, l: p.listings.length });
    ck('de wagen kreeg zijn code meteen', /^V\d+$/.test(p.nieuw[0].code) && p.listings.every((l) => l.vehicleCode === p.nieuw[0].code), p.nieuw[0]);
    ck('het tweede platform heeft zijn eigen bron-id niet nodig op de wagen: de eerste bron bepaalt de herkomst', p.nieuw[0].bronId === 'A1', p.nieuw[0]);
    const q = vsync.verzoenAlles([], [], [{ provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G1' })] }], { nu: NU, legacyProvider: 'feed', codesToewijzen: true });
    ck('een wagen van een niet-oude bron krijgt het voorvoegsel in zijn bron-id', q.nieuw[0].bronId === 'gocar:G1', q.nieuw[0]);
  }

  console.log('\nVerkocht: alleen als ELKE bron die de wagen toonde slaagde en hem niet meer toont');
  {
    const bestaand = [wagen({ code: 'V1', bron: 'feed', bronId: 'A1', vin: VIN1 }), wagen({ code: 'V2', bron: 'feed', bronId: 'A2' })];
    const rijen = [adv('feed', 'A1', 'V1'), adv('gocar', 'G1', 'V1'), adv('feed', 'A2', 'V2')];
    const opt = { nu: NU, legacyProvider: 'feed', geconfigureerd: ['feed', 'gocar'] };
    const toon = (provider, items) => ({ provider, verdwenen: 'verkocht', voertuigen: items });
    const mislukt = (provider) => ({ provider, verdwenen: 'verkocht', voertuigen: null });

    let p = vsync.verzoenAlles(bestaand, rijen, [toon('feed', []), mislukt('gocar')], opt);
    ck('V1 staat op twee platformen, het ene mislukt: V1 blijft', !p.weg.some((w) => w.code === 'V1'), p.weg);
    ck('V2 stond alleen op het geslaagde platform en is weg: verkocht', p.weg.some((w) => w.code === 'V2' && w.invoer.status === 'verkocht'), p.weg);
    ck('maar het platform dat V1 liet vallen onthoudt dat (REMOVED)', p.listings.some((l) => l.provider === 'feed' && l.vehicleCode === 'V1' && l.status === 'REMOVED'), p.listings);

    p = vsync.verzoenAlles(bestaand, rijen, [toon('feed', []), toon('gocar', [regel({ bronId: 'G1' })])], opt);
    ck('beide geslaagd, een toont hem nog: V1 blijft', !p.weg.some((w) => w.code === 'V1'), p.weg);

    p = vsync.verzoenAlles(bestaand, rijen, [toon('feed', []), toon('gocar', [])], opt);
    ck('beide geslaagd en geen toont hem: V1 verkocht', p.weg.some((w) => w.code === 'V1' && w.invoer.status === 'verkocht'), p.weg);

    /* Het eerste platform liet V1 gisteren al vallen (REMOVED). Nu laat het tweede hem ook vallen. */
    const gisteren = [adv('feed', 'A1', 'V1', { status: 'REMOVED' }), adv('gocar', 'G1', 'V1'), adv('feed', 'A2', 'V2')];
    p = vsync.verzoenAlles(bestaand, gisteren, [toon('feed', [regel({ bronId: 'A2' })]), toon('gocar', [])], opt);
    ck('een eerder weggehaalde advertentie telt niet meer als houder: V1 verkocht', p.weg.some((w) => w.code === 'V1'), p.weg);

    p = vsync.verzoenAlles(bestaand, rijen, [mislukt('feed'), mislukt('gocar')], opt);
    ck('alles mislukt: er verandert helemaal niets', p.weg.length === 0 && p.nieuw.length === 0 && p.bijwerken.length === 0 && p.listings.length === 0, p);

    p = vsync.verzoenAlles(bestaand, rijen, [toon('feed', []), toon('gocar', [])], Object.assign({}, opt, { geconfigureerd: ['feed', 'gocar', 'autoscout24'] }));
    ck('een geconfigureerd platform dat niet draaide telt als onbekend (V2 stond er niet op: wel weg)', p.weg.some((w) => w.code === 'V2'), p.weg);
    const metAs = rijen.concat([adv('autoscout24', 'as-1', 'V1')]);
    p = vsync.verzoenAlles(bestaand, metAs, [toon('feed', []), toon('gocar', [])], Object.assign({}, opt, { geconfigureerd: ['feed', 'gocar', 'autoscout24'] }));
    ck('V1 staat ook op een platform dat deze run niet las: V1 blijft', !p.weg.some((w) => w.code === 'V1'), p.weg);
    p = vsync.verzoenAlles(bestaand, metAs, [toon('feed', []), toon('gocar', [])], Object.assign({}, opt, { geconfigureerd: ['feed', 'gocar'] }));
    ck('is dat platform losgekoppeld, dan telt het niet meer mee: V1 verkocht', p.weg.some((w) => w.code === 'V1'), p.weg);
  }

  console.log('\nEen advertentie die naar een eerdere wagen met dezelfde code wees, wijst nooit een andere wagen aan');
  {
    /* V25 is verwijderd en de code is hergebruikt voor een andere wagen (Audi). Het tweede platform toont de oude BMW nog. */
    const nieuweWagen = wagen({ code: 'V25', merk: 'Audi', model: 'A4', bron: 'feed', bronId: 'A99', aangemaakt: '2026-10-05T09:00:00.000Z' });
    const oudeRij = adv('gocar', 'G25', 'V25', { id: 'recL25', aangemaakt: '2026-09-01T09:00:00.000Z', sleutel: 'P1|gocar|g25' });
    const p = vsync.verzoenAlles([nieuweWagen], [oudeRij], [
      { provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A99', merk: 'Audi', model: 'A4' })] },
      { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G25', merk: 'BMW', model: 'X5' })] },
    ], { nu: NU, legacyProvider: 'feed', codesToewijzen: true });
    ck('de BMW wordt een nieuwe wagen, hij overschrijft de Audi niet', p.nieuw.length === 1 && p.nieuw[0].merk === 'BMW' && p.bijwerken.length === 0, { n: p.nieuw.map((x) => x.merk), b: p.bijwerken.length });
    const rij = p.listings.find((l) => l.provider === 'gocar');
    ck('de oude rij wordt bijgewerkt (zelfde rij, geen dubbele sleutel) en wijst naar de nieuwe wagen', rij && rij.id === 'recL25' && rij.vehicleCode === p.nieuw[0].code && rij.vehicleCode !== 'V25', rij);
    ck('met een nieuw Created At, zodat hij niet opnieuw als oud geldt', rij && rij.aangemaakt === NU, rij);
    /* Een rij van na de wagen is gewoon geldig. */
    const geldig = vsync.verzoenAlles([nieuweWagen], [Object.assign({}, oudeRij, { aangemaakt: '2026-10-05T10:00:00.000Z', externalId: 'G25' })], [
      { provider: 'gocar', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'G25', merk: 'Audi', model: 'A4' })] }], { nu: NU, legacyProvider: 'feed', codesToewijzen: true });
    ck('een rij die jonger is dan zijn wagen blijft gelden', geldig.nieuw.length === 0, geldig.nieuw);
  }

  console.log('\nDe dalingswacht geldt per bron');
  {
    const bestaand = Array.from({ length: 8 }, (_, i) => wagen({ code: 'V' + (i + 1), bron: 'feed', bronId: 'A' + (i + 1) }));
    const rijen = bestaand.map((v) => adv('feed', v.bronId, v.code));
    const p = vsync.verzoenAlles(bestaand, rijen, [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1' })] }], { nu: NU, legacyProvider: 'feed' });
    ck('7 van 8 ineens weg: geblokkeerd, niets verkocht, geen advertentie weggehaald', p.dalingGeblokkeerd && p.weg.length === 0 && !p.listings.some((l) => l.status === 'REMOVED'), p);
    const q = vsync.verzoenAlles(bestaand, rijen, [{ provider: 'feed', verdwenen: 'verkocht', voertuigen: [regel({ bronId: 'A1' })] }], { nu: NU, legacyProvider: 'feed', bevestigDaling: true });
    ck('de dealer bevestigt: dan wel', q.weg.length === 7, q.weg.length);
  }

  /* ═════════════════════════════ LAAG 2: sync() ════════════════════════════ */

  console.log('\nDe oude enkele bron leest als een lijst van een');
  {
    const legacy = inv.saneerBron({ type: 'feed', url: FEED_A, formaat: 'json', verdwenen: 'uit_aanbod' });
    ck('een bron in de lijst, provider feed', legacy.bronnen.length === 1 && legacy.bronnen[0].provider === 'feed' && legacy.bronnen[0].url === FEED_A, legacy.bronnen);
    ck('de platte velden blijven kloppen (type, provider, url, verdwenen)', legacy.type === 'feed' && legacy.provider === 'feed' && legacy.url === FEED_A && legacy.verdwenen === 'uit_aanbod');
    ck('de bewaartermijn is 14 dagen als er niets staat', legacy.bewaarDagen === 14, legacy.bewaarDagen);
    ck('een AutoScout24-profiel in een oude bron wordt provider autoscout24',
      inv.saneerBron({ type: 'feed', url: 'https://www.autoscout24.be/nl/verkopers/garage-x' }).bronnen[0].provider === 'autoscout24');
    ck('native: geen bronnen', inv.saneerBron({ type: 'native' }).bronnen.length === 0 && inv.saneerBron({}).type === 'native');
    const opslag = inv.naarOpslag(legacy);
    ck('opgeslagen: de lijst EN de oude velden (terugdraaien blijft veilig)', Array.isArray(opslag.bronnen) && opslag.type === 'feed' && opslag.url === FEED_A && opslag.provider === 'feed', opslag);
    ck('opnieuw gesaneerd geeft hetzelfde', JSON.stringify(inv.saneerBron(opslag).bronnen) === JSON.stringify(legacy.bronnen));
    ck('een bron per platform: een dubbele valt weg', inv.saneerBron({ bronnen: [{ provider: 'feed', url: FEED_A }, { provider: 'feed', url: FEED_B }] }).bronnen.length === 1);
    ck('een onbekend platform in de lijst valt weg', inv.saneerBron({ bronnen: [{ provider: 'bestaatniet' }, { provider: 'feed', url: FEED_A }] }).bronnen.length === 1);
    ck('bewaarDagen wordt begrensd (1 tot 365)', inv.saneerBron({ bewaarDagen: 0 }).bewaarDagen === 1 && inv.saneerBron({ bewaarDagen: 9999 }).bewaarDagen === 365 && inv.saneerBron({ bewaarDagen: 30 }).bewaarDagen === 30);
  }

  console.log('\nSync met een oude opgeslagen bron: werkt zoals altijd, en maakt advertenties aan');
  zet({ type: 'feed', url: FEED_A, formaat: 'json' });
  feeds[FEED_A].items = [
    { id: 'A1', make: 'BMW', model: 'X5', price: 50000, mileage: 40000, vin: VIN1, url: 'https://dms-a.example/x5' },
    { id: 'A2', make: 'Audi', model: 'A4', price: 30000, mileage: 90000, url: 'https://www.autoscout24.be/nl/aanbod/audi-a4-' + AS_ID },
    { id: 'A3', make: 'Mercedes', model: 'C220', price: 25000, mileage: 70000 },
  ];
  let r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de sync slaagt', r.ok === true, r);
  ck('drie wagens, met het kale bron-id (zoals voor de meerbronnenvorm)', vanA().length === 3 && vanA().every((x) => x.fields.Source === 'feed' && ['A1', 'A2', 'A3'].includes(x.fields['Source Record ID'])), vanA().map((x) => x.fields));
  ck('het chassisnummer staat op de wagen', bij('V1') && perMerkModel('BMW', 'X5')[0].fields.VIN === VIN1);
  ck('drie advertenties met sleutel dealer|platform|id', listingsA().length === 3 && listingsA().every((l) => l.fields['Listing Key'].startsWith('DEALERA|feed|')), listingsA().map((l) => l.fields['Listing Key']));
  ck('en elke advertentie wijst naar een bestaande wagen van deze dealer', listingsA().every((l) => vanA().some((v) => v.fields['Vehicle Code'] === l.fields['Vehicle Code'])));
  ck('de toestand staat per bron', stand().bronnen && stand().bronnen.feed && stand().bronnen.feed.lastResult === 'ok' && stand().bronnen.feed.imported === 3, stand().bronnen);
  ck('en bovenaan zoals altijd (count, lastResult)', stand().count === 3 && stand().lastResult === 'ok', { c: stand().count, r: stand().lastResult });
  ck('de wagen van dealer B en zijn advertentie zijn niet aangeraakt', db.vehicles.find((x) => x.id === 'recB1').fields.Price === 50000 && db.vehicle_listings.find((x) => x.id === 'recL0').fields.Status === 'ACTIVE');

  const aantal = [db.vehicles.length, db.vehicle_listings.length];
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('dezelfde bron opnieuw: niets aangemaakt', r.ok && db.vehicles.length === aantal[0] && db.vehicle_listings.length === aantal[1], [db.vehicles.length, db.vehicle_listings.length]);

  console.log('\nEen tweede platform erbij (gocar, via zijn export): geen dubbels');
  let uit = await inv.bewaarProvider('DEALERA', { provider: 'gocar', url: FEED_B });
  ck('gocar bewaard als bron nummer twee', uit.ok === true && JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen.length === 2, uit);
  ck('de oude bron staat er nog (en blijft de eerste)', JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen[0].provider === 'feed');
  feeds[FEED_B].items = [
    { id: 'G1', make: 'BMW', model: 'X5', price: 49500, mileage: 40100, vin: VIN1.toLowerCase(), url: 'https://gocar-b.example/bmw-x5' },
    { id: 'G2', make: 'Audi', model: 'A4', price: 29900, mileage: 90000, url: 'https://WWW.autoscout24.be/nl/aanbod/audi-a4-' + AS_ID + '?utm=gocar' },
    { id: 'G3', make: 'Mercedes', model: 'C220', price: 25000, mileage: 70000 },
    { id: 'G4', make: 'Volvo', model: 'V60', price: 22000, mileage: 50000 },
  ];
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de sync slaagt', r.ok === true, r);
  ck('X5 (zelfde VIN): een wagen met twee advertenties', perMerkModel('BMW', 'X5').length === 1 && listingsA().filter((l) => l.fields['Vehicle Code'] === perMerkModel('BMW', 'X5')[0].fields['Vehicle Code']).length === 2);
  ck('A4 (zelfde AutoScout-link, andere schrijfwijze): een wagen met twee advertenties', perMerkModel('Audi', 'A4').length === 1 && listingsA().filter((l) => l.fields['Vehicle Code'] === perMerkModel('Audi', 'A4')[0].fields['Vehicle Code']).length === 2);
  ck('C220 (alleen merk, model, prijs gelijk): TWEE wagens, niets op gevoel samengevoegd', perMerkModel('Mercedes', 'C220').length === 2, perMerkModel('Mercedes', 'C220').length);
  ck('V60 stond alleen bij gocar: nieuwe wagen', perMerkModel('Volvo', 'V60').length === 1);
  ck('de eerste bron bepaalt de velden: de X5 houdt de prijs van de eerste bron', perMerkModel('BMW', 'X5')[0].fields.Price === 50000, perMerkModel('BMW', 'X5')[0].fields.Price);
  ck('de V60 van het tweede platform draagt het voorvoegsel', perMerkModel('Volvo', 'V60')[0].fields['Source Record ID'] === 'gocar:G4', perMerkModel('Volvo', 'V60')[0].fields);
  ck('geen dubbele advertentiesleutels', new Set(listingsA().map((l) => l.fields['Listing Key'])).size === listingsA().length, listingsA().map((l) => l.fields['Listing Key']));
  ck('beide bronnen hebben hun eigen toestand', stand().bronnen.feed.lastResult === 'ok' && stand().bronnen.gocar.lastResult === 'ok' && stand().bronnen.gocar.imported === 2, stand().bronnen);
  const totaal = [vanA().length, listingsA().length];
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('en een tweede run met dezelfde twee bronnen verandert niets aan de aantallen', r.ok && vanA().length === totaal[0] && listingsA().length === totaal[1], [vanA().length, listingsA().length]);

  console.log('\nEen bron mislukt: niets verandert voor wat hij toonde');
  const x5 = () => perMerkModel('BMW', 'X5')[0].fields;
  const v60 = () => perMerkModel('Volvo', 'V60')[0].fields;
  feeds[FEED_B].status = 500;
  feeds[FEED_A].items = feeds[FEED_A].items.filter((i) => i.id !== 'A1');            // de eerste bron laat de X5 vallen
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('de run slaagt gedeeltelijk (een bron wel)', r.ok === true && r.lastResult === 'partial', { ok: r.ok, res: r.lastResult });
  ck('de X5 stond OOK bij de mislukte bron: blijft beschikbaar', x5().Status === 'beschikbaar' && !x5()['Sold At'], x5());
  ck('de V60 stond alleen bij de mislukte bron: onaangeroerd', v60().Status === 'beschikbaar', v60());
  ck('de mislukte bron staat als mislukt, met een genormaliseerde code', stand().bronnen.gocar.lastResult === 'failed' && stand().bronnen.gocar.lastErrorCode === 'PROVIDER_DOWN', stand().bronnen.gocar);
  ck('de geslaagde bron staat gewoon op ok', stand().bronnen.feed.lastResult === 'ok');
  ck('de advertentie die de eerste bron liet vallen is REMOVED; die van de ander blijft', listingsA().some((l) => l.fields['Listing Key'] === 'DEALERA|feed|a1' && l.fields.Status === 'REMOVED') && listingsA().some((l) => l.fields['Listing Key'] === 'DEALERA|gocar|g1' && l.fields.Status === 'ACTIVE'));
  ck('het geheel is niet "vers": de oudste geslaagde sync telt', typeof stand().lastSuccessAt === 'string');
  ck('de technische fout staat niet in wat het dashboard krijgt per bron', !JSON.stringify(r.bronnen).includes('HTTP 500'), r.bronnen);

  feeds[FEED_B].status = 200;
  feeds[FEED_B].items = feeds[FEED_B].items.filter((i) => i.id !== 'G1');            // nu laat ook de tweede hem vallen
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('beide bronnen slagen en geen toont de X5: nu verkocht', x5().Status === 'verkocht' && Boolean(x5()['Sold At']), x5());
  ck('de V60 staat er nog (bron twee toont hem)', v60().Status === 'beschikbaar');
  ck('de verkochte X5 is niet gewist', perMerkModel('BMW', 'X5').length === 1);

  console.log('\nAlle bronnen mislukt: de run mislukt, niets verandert');
  feeds[FEED_A].status = 503; feeds[FEED_B].status = 429;
  const voor = JSON.stringify(vanA().map((x) => x.fields));
  r = await inv.sync('DEALERA', { door: 'test', ...snel });
  ck('ok: false, en een foutcode per bron', r.ok === false && stand().bronnen.feed.lastErrorCode === 'PROVIDER_DOWN' && stand().bronnen.gocar.lastErrorCode === 'RATE_LIMIT', stand().bronnen);
  ck('geen enkele wagen veranderd', JSON.stringify(vanA().map((x) => x.fields)) === voor);
  feeds[FEED_A].status = 200; feeds[FEED_B].status = 200;

  console.log('\nVerkocht -> archief met een eigen bewaartermijn per dealer');
  {
    const nu = '2026-10-05T10:00:00.000Z';
    const dagenTerug = (d) => new Date(Date.parse(nu) - d * 86400000).toISOString();
    x5()['Sold At'] = dagenTerug(20);
    const standaard = await vsync.archiveerVerkocht('DEALERA', { nu, pauze: 0 });
    ck('standaard (14 dagen): 20 dagen verkocht = gearchiveerd', standaard.gearchiveerd === 1 && x5().Archived === true, standaard);
    x5().Archived = false;
    const lang = await vsync.archiveerVerkocht('DEALERA', { nu, pauze: 0, dagen: inv.saneerBron({ bewaarDagen: 30 }).bewaarDagen });
    ck('met 30 dagen: 20 dagen verkocht blijft staan', lang.gearchiveerd === 0 && !x5().Archived, lang);
    x5()['Sold At'] = dagenTerug(31);
    const na = await vsync.archiveerVerkocht('DEALERA', { nu, pauze: 0, dagen: 30 });
    ck('met 30 dagen: na 31 dagen wel', na.gearchiveerd === 1 && x5().Archived === true, na);
    const kort = vsync.planArchief([{ code: 'V9', status: 'verkocht', verkochtOp: dagenTerug(4), gearchiveerd: false }], { nu, dagen: 3 });
    ck('met 3 dagen: 4 dagen verkocht = archief', kort.archiveren.length === 1);
  }

  console.log('\nTenant-isolatie van de advertenties');
  {
    const eigen = await listings.list('DEALERB');
    ck('dealer B ziet alleen zijn eigen advertentie', eigen.listings.length === 1 && eigen.listings[0].projectCode === 'DEALERB', eigen.listings);
    const zonderCode = await listings.list('DEALERA');
    ck('dealer A ziet geen advertentie van B', zonderCode.listings.every((l) => l.projectCode === 'DEALERA' && l.sleutel.startsWith('DEALERA|')) && zonderCode.listings.length > 0);
    let gooit = false;
    try { await listings.list(''); } catch (e) { gooit = true; }
    ck('zonder projectcode geen lezen', gooit);
    const voorRijen = db.vehicle_listings.length;
    const w = await listings.schrijf('DEALERB', [{ provider: 'feed', externalId: 'ZZ', vehicleCode: 'V1', projectCode: 'DEALERA', sleutel: 'DEALERA|feed|zz' }], { pauze: 0 });
    ck('schrijven met de sleutel van een andere dealer wordt geweigerd', w.geweigerd === 1 && db.vehicle_listings.length === voorRijen, w);
    ck('de sleutel bevat altijd de dealer', listings.sleutel('DEALERA', 'Feed', 'AbC') === 'DEALERA|feed|abc');
    const kruis = await listings.voorVoertuig('DEALERB', 'V1');
    ck('advertenties van een wagen: alleen van de eigen dealer (V1 bestaat bij beide)', kruis.length === 1 && kruis[0].projectCode === 'DEALERB', kruis);
    ck('dealer B kan door een sync van A niet geraakt zijn', db.vehicles.find((x) => x.id === 'recB1').fields.Status === 'beschikbaar' && db.vehicle_listings.find((x) => x.id === 'recL0').fields.Status === 'ACTIVE');
  }

  console.log('\nZonder advertentietabel werkt alles zoals voor deze module');
  {
    db.tabelListings = false; listings._reset();
    zet({ type: 'feed', url: FEED_A, formaat: 'json' });
    klanten.DEALERA.fields['Inventory State'] = '';
    feeds[FEED_A].items = [{ id: 'Z1', make: 'Fiat', model: 'Panda', price: 8000 }];
    const rijenVoor = db.vehicle_listings.length;
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('de sync slaagt zonder de tabel', r.ok === true, r);
    ck('de wagen is aangemaakt, geen advertenties weggeschreven', perMerkModel('Fiat', 'Panda').length === 1 && db.vehicle_listings.length === rijenVoor);
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('en geen dubbel bij de volgende run (de wagen onthoudt zijn bron)', perMerkModel('Fiat', 'Panda').length === 1, perMerkModel('Fiat', 'Panda').length);
    db.tabelListings = true; listings._reset();
  }

  console.log('\nInloggegevens: versleuteld, en nooit terug naar het scherm');
  {
    const GEHEIM = 'sterk-wachtwoord-123';
    const o = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', credentials: { username: 'garage-gebruiker', password: GEHEIM } });
    const opgeslagen = klanten.DEALERA.fields['Inventory Source'];
    ck('bewaren lukt', o.ok === true, o);
    ck('in Airtable staat geen platte tekst', !opgeslagen.includes(GEHEIM) && !opgeslagen.includes('garage-gebruiker'), opgeslagen.slice(0, 300));
    const bronMd = JSON.parse(opgeslagen).bronnen.find((b) => b.provider === 'mobile_de');
    ck('maar een versleutelde waarde (v1:)', /^v1:/.test(bronMd.credentials), bronMd);
    const creds = require(BASE + 'api/_voorraad-providers/credentials.js');
    ck('die met de sleutel terug te lezen is', (creds.ontsleutel(bronMd.credentials) || {}).password === GEHEIM);
    const antwoord = JSON.stringify(o);
    ck('het antwoord bevat geen wachtwoord, gebruikersnaam of versleutelde waarde', !antwoord.includes(GEHEIM) && !antwoord.includes('garage-gebruiker') && !antwoord.includes(bronMd.credentials), antwoord.slice(0, 200));
    const overzicht = JSON.stringify(await inv.providersOverzicht('DEALERA'));
    ck('ook het overzicht niet', !overzicht.includes(GEHEIM) && !overzicht.includes(bronMd.credentials) && !overzicht.includes('garage-gebruiker'));
    const st = JSON.stringify(await inv.status('DEALERA'));
    ck('ook de status niet', !st.includes(GEHEIM) && !st.includes(bronMd.credentials));
    ck('het overzicht zegt alleen dat ze er zijn', JSON.parse(overzicht).providers.find((p) => p.id === 'mobile_de').heeftCredentials === true);
    const stuk = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', credentials: 'v1:AAAA' });
    ck('een client kan geen eigen "versleutelde" waarde instellen', stuk.ok === false && stuk.reden === 'ongeldige_gegevens', stuk);
    const leeg = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', credentials: { username: 'x' } });
    ck('onvolledige gegevens worden geweigerd', leeg.ok === false, leeg);
    const geenSleutel = process.env.GOOGLE_TOKEN_KEY;
    delete process.env.GOOGLE_TOKEN_KEY; delete process.env.SESSION_SECRET; delete process.env.ADMIN_KEY;
    const zonder = await inv.bewaarProvider('DEALERA', { provider: 'mobile_de', credentials: { username: 'x', password: 'y' } });
    ck('zonder encryptiesleutel op de server: weigeren in plaats van platte tekst bewaren', zonder.ok === false && zonder.reden === 'geen_versleuteling' && !(klanten.DEALERA.fields['Inventory Source'] || '').includes('"password"'), zonder);
    process.env.GOOGLE_TOKEN_KEY = geenSleutel;
  }

  console.log('\nHet afgeschermde adres terugsturen wist het geheim niet');
  {
    zet({ type: 'feed', url: 'https://dms-a.example/voorraad.json?token=GEHEIM123', formaat: 'json' });
    const kaart = (await inv.providersOverzicht('DEALERA')).providers.find((p) => p.id === 'feed');
    ck('het scherm krijgt het adres afgeschermd', kaart.url === 'https://dms-a.example/voorraad.json?token=***', kaart.url);
    const o = await inv.bewaarProvider('DEALERA', { provider: 'feed', url: kaart.url, verdwenen: 'uit_aanbod' });
    ck('onveranderd terugsturen laat het echte adres staan (en past de rest wel aan)', o.ok && JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen[0].url.endsWith('token=GEHEIM123') && JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen[0].verdwenen === 'uit_aanbod', klanten.DEALERA.fields['Inventory Source']);
    const stuk = await inv.bewaarProvider('DEALERA', { provider: 'feed', url: 'https://ander.example/f.json?token=***' });
    ck('een ander adres met *** erin wordt geweigerd', stuk.ok === false && stuk.reden === 'ongeldig_adres', stuk);
    ck('en het echte adres bleef staan', JSON.parse(klanten.DEALERA.fields['Inventory Source']).bronnen[0].url.endsWith('token=GEHEIM123'));
  }

  console.log('\nPlatformen zonder eigen API: werken via een feedadres of export');
  {
    for (const id of ['marktplaats', 'tweedehands', 'vroom', 'heycar', 'auto1']) {
      ck(id + ': actief, leest via het feedpad en kan uploaden', reg.get(id).status === 'ACTIVE' && reg.kanSyncen(reg.get(id)) && reg.kanUploaden(reg.get(id)));
    }
    ck('een platform zonder adres en zonder bestand kan niet bewaard worden', (await inv.bewaarProvider('DEALERA', { provider: 'marktplaats', url: '' })).reden === 'ongeldig_adres');
    ck('een onbekend platform ook niet', (await inv.bewaarProvider('DEALERA', { provider: 'bestaatniet' })).reden === 'onbekende_provider');
    /* Een met de hand in Airtable gezette bron voor een platform dat er niet is: de sync slaat hem over. */
    zet({ bronnen: [{ provider: 'feed', url: FEED_A, formaat: 'json' }, { provider: 'autoscout24_api', customerId: '42' }] });
    klanten.DEALERA.fields['Inventory State'] = '';
    feeds[FEED_A].items = [{ id: 'Z1', make: 'Fiat', model: 'Panda', price: 8000 }];
    geopend.length = 0;
    r = await inv.sync('DEALERA', { door: 'test', ...snel });
    ck('de sync slaagt zonder een foutmelding voor die bronnen', r.ok === true && r.lastResult === 'ok', { ok: r.ok, res: r.lastResult });
    ck('er is niets opgehaald bij een ander adres dan de feed', geopend.every((u) => u === FEED_A), geopend);
    ck('de AutoScout24-API zonder gegevens van Helvaro ook: overgeslagen, geen verzoek', stand().bronnen.autoscout24_api.lastResult === 'skipped' && !stand().bronnen.autoscout24_api.lastErrorCode, stand().bronnen.autoscout24_api);
    const md = reg.get('mobile_de');
    let fout;
    try { await md.haal({ credentials: '' }); } catch (e) { fout = e; }
    ck('mobile_de zonder gegevens: MISSING_FIELD', fout && md.normaliseerFout(fout).code === 'MISSING_FIELD', fout && fout.code);
    const creds = require(BASE + 'api/_voorraad-providers/credentials.js');
    fout = null;
    try { await reg.get('autoscout24_api').haal({ customerId: '42' }); } catch (e) { fout = e; }
    const n = fout && reg.get('autoscout24_api').normaliseerFout(fout);
    ck('autoscout24_api zonder gegevens van Helvaro: een uitleg dat activatie nog moet komen', n && n.code === 'PERMISSION_DENIED' && n.sleutel === 'ig.fout.ACTIVATIE', n);
    ck('geen netwerk gebruikt door die stubs', geopend.every((u) => u === FEED_A));
    fout = null;
    try { await reg.get('marktplaats').haal({}); } catch (e) { fout = e; }
    ck('marktplaats zonder adres: een duidelijke fout, geen verzoek', fout && fout.code === 'geen_url' && geopend.every((u) => u === FEED_A), fout && fout.code);
  }

  console.log('\nHet dashboard krijgt per bron alleen gewone gegevens');
  {
    const o = await inv.providersOverzicht('DEALERA');
    const ingesteld = JSON.parse(klanten.DEALERA.fields['Inventory Source'] || '{}').bronnen || [];
    const verwacht = reg.lijst().filter((p) => !p.verborgen || ingesteld.some((x) => x.provider === p.id)).length;
    ck('alle zichtbare platformen staan erin (een verborgen koppeling alleen als de dealer hem al had)', o.ok && o.providers.length === verwacht, { n: o.providers.length, verwacht });
    ck('de AutoScout24-API zonder gegevens van Helvaro: alleen zichtbaar voor wie hem al instelde', o.providers.some((p) => p.id === 'autoscout24_api') === ingesteld.some((x) => x.provider === 'autoscout24_api'));
    ck('met status en wat het kan', o.providers.every((p) => p.status && p.auth && p.capabilities && typeof p.kanVerbinden === 'boolean'));
    const feedKaart = o.providers.find((p) => p.id === 'feed');
    ck('een gesynchroniseerd platform toont aantal, nieuw, bijgewerkt, verwijderd', feedKaart.aantal === 1 && feedKaart.nieuw !== null && feedKaart.verwijderd !== null, feedKaart);
    ck('geen technische foutteksten, wel een sleutel voor een fout', o.providers.every((p) => !('fout' in p) && !('lastError' in p)));
  }

  console.log('\nEen nieuwe advertentietabel wordt ook gevuld als de bron niet veranderde');
  {
    const bronTekst = require('fs').readFileSync(BASE + 'api/_inventaris.js', 'utf8');
    ck('overslaan vraagt een eerder gevulde advertentietabel', /const ongewijzigd = [^\n]*staat\.listingsKlaar === true/.test(bronTekst));
    ck('een volledige run onthoudt of de tabel gevuld is', /listingsKlaar: lijstAdv\.beschikbaar === true && !partial/.test(bronTekst));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('STUK:', e && e.stack); process.exit(1); });
