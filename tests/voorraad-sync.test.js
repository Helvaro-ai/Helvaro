'use strict';
/*
 * De voorraadsync: bron -> Helvaro, en verkocht -> 14 dagen -> archief.
 *
 * Twee lagen, met opzet:
 *
 *   1. verzoen() en planArchief() direct. Dat zijn pure functies: bronlijst en
 *      voorraad erin, een plan eruit. Hier zitten de scenario's uit de
 *      specificatie (TEST 1 t/m 11) plus de gevallen die in productie het
 *      meeste pijn zouden doen -- een half lege feed, een wagen die de dealer
 *      eerst met de hand invoerde, een veld dat de bron weglaat.
 *
 *   2. sync() van begin tot eind, met een nep-Airtable in het geheugen en een
 *      nep-feed. Daar gaat het om wat er ECHT weggeschreven wordt: geen
 *      dubbele rijen na twee runs, niets aangeraakt als de bron plat ligt, en
 *      een base zonder het veld 'Sold At' die niet stukloopt.
 *
 * Er gaat niets over het net: fetch en DNS zijn nep.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';

/* DNS: de feed moet naar een extern adres wijzen (SSRF-wacht). */
require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

const vehicles = require(BASE + 'api/_vehicles.js');
const vsync = require(BASE + 'api/_voorraad-sync.js');
const inv = require(BASE + 'api/_inventaris.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
  ok ? pass++ : fail++;
};

const NU = '2026-09-25T10:00:00.000Z';
const dagenGeleden = (d) => new Date(Date.parse(NU) - d * 86400000).toISOString();

/* Een wagen zoals vehicles.list() hem teruggeeft. */
const wagen = (o) => Object.assign({
  id: 'rec' + o.code, code: o.code, projectCode: 'P1', merk: 'BMW', model: 'X5',
  uitvoering: '', prijs: 50000, km: 40000, status: 'beschikbaar', gearchiveerd: false,
  bron: 'feed', bronId: o.code, fotos: [], omschrijving: '', link: '', verkochtOp: '',
}, o);
/* Een bronregel zoals mapRegel() hem aflevert. */
const regel = (o) => Object.assign({ bronId: 'X', merk: 'BMW', model: 'X5', prijs: 50000, km: 40000, status: 'beschikbaar' }, o);

(async () => {
  /* ═══════════════════════════════ LAAG 1 ═══════════════════════════════ */

  console.log('\nTEST 1-2: nieuw, en daarna geen dubbel');
  {
    let p = vsync.verzoen([], [regel({ bronId: 'A1' })], { nu: NU });
    ck('TEST 1: een nieuwe wagen wordt precies een keer aangemaakt', p.nieuw.length === 1 && p.bijwerken.length === 0, p);
    ck('en krijgt de bron mee', p.nieuw[0].bron === 'feed' && p.nieuw[0].bronId === 'A1');
    ck('en een gebeurtenis', p.gebeurtenissen.some((g) => g.soort === 'vehicle_created'));

    p = vsync.verzoen([wagen({ code: 'A1' })], [regel({ bronId: 'A1' })], { nu: NU });
    ck('TEST 2: dezelfde sync opnieuw maakt niets aan', p.nieuw.length === 0 && p.bijwerken.length === 0 && p.ongewijzigd === 1, p);
  }

  console.log('\nTEST 3-5: bijwerken, niet opnieuw aanmaken');
  {
    let p = vsync.verzoen([wagen({ code: 'A1', prijs: 54900 })], [regel({ bronId: 'A1', prijs: 52900 })], { nu: NU });
    ck('TEST 3: prijswijziging werkt de bestaande wagen bij', p.nieuw.length === 0 && p.bijwerken.length === 1 && p.bijwerken[0].wijzigingen.includes('prijs'), p);
    const pg = p.gebeurtenissen.find((g) => g.soort === 'vehicle_price_changed');
    ck('met oude en nieuwe prijs in de gebeurtenis', pg && pg.van === 54900 && pg.naar === 52900, pg);

    p = vsync.verzoen([wagen({ code: 'A1', omschrijving: 'oud' })], [regel({ bronId: 'A1', omschrijving: 'nieuw' })], { nu: NU });
    ck('TEST 4: omschrijving wordt bijgewerkt', p.bijwerken.length === 1 && p.bijwerken[0].wijzigingen.includes('omschrijving'), p);

    p = vsync.verzoen([wagen({ code: 'A1', fotos: ['https://img.example/1.jpg'] })],
      [regel({ bronId: 'A1', fotos: ['https://img.example/1.jpg', 'https://img.example/2.jpg'] })], { nu: NU });
    ck('TEST 5: gewijzigde foto\'s werken de galerij bij', p.bijwerken.length === 1 && p.bijwerken[0].wijzigingen.includes('fotos'), p);

    p = vsync.verzoen([wagen({ code: 'A1', fotos: ['https://img.example/1.jpg'] })],
      [regel({ bronId: 'A1', fotos: ['https://img.example/1.jpg'] })], { nu: NU });
    ck('zelfde foto\'s = geen wijziging (geen onnodige schrijfactie)', p.bijwerken.length === 0);
  }

  console.log('\nregel 4: niets wissen omdat de bron een veld weglaat');
  {
    /* De bron levert GEEN omschrijving mee. De omschrijving die de dealer in
       Helvaro schreef mag daarom niet leeg worden gemaakt. */
    const p = vsync.verzoen([wagen({ code: 'A1', omschrijving: 'Mooi onderhouden, eerste eigenaar.' })],
      [regel({ bronId: 'A1' })], { nu: NU });
    ck('een weggelaten veld telt niet als wijziging', p.bijwerken.length === 0 && p.ongewijzigd === 1, p);
  }

  console.log('\nTEST 6: verkocht');
  {
    let p = vsync.verzoen([wagen({ code: 'A1' })], [regel({ bronId: 'A1', status: 'verkocht' })], { nu: NU });
    const b = p.bijwerken[0];
    ck('bron zegt verkocht -> status verkocht', b && b.invoer.status === 'verkocht', p);
    ck('en Sold At is gezet', b && b.invoer.verkochtOp === NU, b && b.invoer);
    ck('en een vehicle_marked_sold-gebeurtenis', p.gebeurtenissen.some((g) => g.soort === 'vehicle_marked_sold'));

    /* Verdwijnt uit een geslaagde bron: standaard verkocht. */
    p = vsync.verzoen([wagen({ code: 'A1' }), wagen({ code: 'A2' })], [regel({ bronId: 'A2' })], { nu: NU });
    ck('verdwenen uit een geslaagde bron -> verkocht', p.weg.length === 1 && p.weg[0].code === 'A1' && p.weg[0].invoer.status === 'verkocht', p);
    ck('met Sold At', p.weg[0].invoer.verkochtOp === NU);

    p = vsync.verzoen([wagen({ code: 'A1' }), wagen({ code: 'A2' })], [regel({ bronId: 'A2' })], { nu: NU, verdwenen: 'uit_aanbod' });
    ck('modus uit_aanbod blijft mogelijk', p.weg[0].invoer.status === 'uit aanbod' && p.weg[0].invoer.verkochtOp === undefined, p.weg[0]);
    p = vsync.verzoen([wagen({ code: 'A1' }), wagen({ code: 'A2' })], [regel({ bronId: 'A2' })], { nu: NU, verdwenen: 'negeren' });
    ck('modus negeren raakt niets aan', p.weg.length === 0);

    /* De klok mag niet elke dag opnieuw beginnen. */
    p = vsync.verzoen([wagen({ code: 'A1', status: 'verkocht', verkochtOp: dagenGeleden(9) })],
      [regel({ bronId: 'A1', status: 'verkocht' })], { nu: NU });
    ck('al verkocht en nog steeds verkocht: Sold At blijft staan', p.bijwerken.length === 0 && p.ongewijzigd === 1, p);

    /* Een al verkochte wagen die uit de bron verdwijnt is niet "opnieuw verkocht". */
    p = vsync.verzoen([wagen({ code: 'A1', status: 'verkocht', verkochtOp: dagenGeleden(3) }), wagen({ code: 'A2' })],
      [regel({ bronId: 'A2' })], { nu: NU });
    ck('een verkochte wagen die verdwijnt wordt niet nog eens verkocht', p.weg.length === 0, p);

    /* Terug in de verkoop. */
    p = vsync.verzoen([wagen({ code: 'A1', status: 'verkocht', verkochtOp: dagenGeleden(3) })],
      [regel({ bronId: 'A1', status: 'beschikbaar' })], { nu: NU });
    ck('terug beschikbaar: Sold At wordt gewist', p.bijwerken[0] && p.bijwerken[0].invoer.verkochtOp === '', p.bijwerken[0]);
  }

  console.log('\nTEST 7-8: veertien dagen');
  {
    const lijst = [
      wagen({ code: 'Z7', status: 'verkocht', verkochtOp: dagenGeleden(7) }),
      wagen({ code: 'Z13', status: 'verkocht', verkochtOp: dagenGeleden(13.9) }),
      wagen({ code: 'Z14', status: 'verkocht', verkochtOp: dagenGeleden(14) }),
      wagen({ code: 'Z30', status: 'verkocht', verkochtOp: dagenGeleden(30) }),
      wagen({ code: 'ZOUD', status: 'verkocht', verkochtOp: '' }),
      wagen({ code: 'ZARCH', status: 'verkocht', verkochtOp: dagenGeleden(60), gearchiveerd: true }),
      wagen({ code: 'ZVRIJ', status: 'beschikbaar' }),
    ];
    const a = vsync.planArchief(lijst, { nu: NU });
    const codes = a.archiveren.map((v) => v.code).sort();
    ck('TEST 7: na 7 dagen nog steeds VERKOCHT, niet gearchiveerd', !codes.includes('Z7'));
    ck('13,9 dagen: nog niet', !codes.includes('Z13'));
    ck('TEST 8: na 14 dagen gearchiveerd', codes.includes('Z14'));
    ck('na 30 dagen ook', codes.includes('Z30'));
    ck('al gearchiveerd: niet nog eens', !codes.includes('ZARCH'));
    ck('beschikbare wagen: nooit', !codes.includes('ZVRIJ'));
    ck('verkocht zonder datum: klok start NU, geen verzonnen verleden',
      a.klokStarten.length === 1 && a.klokStarten[0].code === 'ZOUD' && !codes.includes('ZOUD'), a.klokStarten.map((v) => v.code));
  }

  console.log('\ndalingswacht: een half lege bron zet geen halve voorraad op verkocht');
  {
    const veertig = Array.from({ length: 40 }, (_, i) => wagen({ code: 'W' + i }));
    let p = vsync.verzoen(veertig, [regel({ bronId: 'W0' })], { nu: NU });
    ck('39 van 40 ineens weg = tegengehouden', p.dalingGeblokkeerd === true && p.weg.length === 0 && p.verdwenenAantal === 39, { g: p.dalingGeblokkeerd, w: p.weg.length });
    p = vsync.verzoen(veertig, [regel({ bronId: 'W0' })], { nu: NU, bevestigDaling: true });
    ck('met bevestiging van de dealer gaat het wel door', p.dalingGeblokkeerd === false && p.weg.length === 39);

    const drie = [wagen({ code: 'K1' }), wagen({ code: 'K2' }), wagen({ code: 'K3' })];
    p = vsync.verzoen(drie, [regel({ bronId: 'K3' })], { nu: NU });
    ck('kleine dealer verkoopt 2 van 3: gewoon doorgevoerd', p.dalingGeblokkeerd === false && p.weg.length === 2, p);

    const twintig = Array.from({ length: 20 }, (_, i) => wagen({ code: 'T' + i }));
    p = vsync.verzoen(twintig, twintig.slice(0, 16).map((v) => regel({ bronId: v.bronId })), { nu: NU });
    ck('drukke week, 4 van 20 verkocht: doorgevoerd', p.dalingGeblokkeerd === false && p.weg.length === 4, p);
  }

  console.log('\nTEST 11 en identiteit');
  {
    const p = vsync.verzoen([], [regel({ bronId: 'S1', model: 'M340i' }), regel({ bronId: 'S2', model: 'M340i' })], { nu: NU });
    ck('TEST 11: twee gelijkaardige wagens met verschillende ID blijven apart', p.nieuw.length === 2);

    /* De dealer voerde de wagen eerst met de hand in, via een AutoScout-link.
       Daarna zet hij zijn feed aan: dezelfde wagen staat erin. Geen tweede rij. */
    const hand = wagen({ code: 'V7', bron: '', bronId: '', link: 'https://www.autoscout24.be/nl/aanbod/bmw-x5-benzine-zwart-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', autoscout: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d' });
    let q = vsync.verzoen([hand], [regel({ bronId: 'DMS-99', link: 'https://www.autoscout24.be/nl/aanbod/bmw-x5-benzine-zwart-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d?utm=feed' })], { nu: NU });
    ck('een met de hand ingevoerde wagen wordt overgenomen, niet verdubbeld', q.nieuw.length === 0 && q.bijwerken.length === 1 && q.bijwerken[0].id === 'recV7' && q.geadopteerd === 1, q);
    ck('en krijgt vanaf nu de bron-ID', q.bijwerken[0].invoer.bron === 'feed' && q.bijwerken[0].invoer.bronId === 'DMS-99');

    /* Een handmatige wagen die NIET in de feed staat is niet "verdwenen". */
    q = vsync.verzoen([wagen({ code: 'M1', bron: '', bronId: '' }), wagen({ code: 'F1' })], [regel({ bronId: 'F1' })], { nu: NU });
    ck('handmatige wagens worden nooit op verkocht gezet door de feed', q.weg.length === 0, q);
  }

  console.log('\narchief en terugkeer');
  {
    let p = vsync.verzoen([wagen({ code: 'R1', status: 'verkocht', verkochtOp: dagenGeleden(40), gearchiveerd: true })],
      [regel({ bronId: 'R1', status: 'beschikbaar' })], { nu: NU });
    ck('een gearchiveerde wagen die weer te koop staat komt terug', p.bijwerken[0] && p.bijwerken[0].invoer.gearchiveerd === false && p.bijwerken[0].invoer.verkochtOp === '', p.bijwerken[0]);
    p = vsync.verzoen([wagen({ code: 'R1', status: 'verkocht', verkochtOp: dagenGeleden(40), gearchiveerd: true })],
      [regel({ bronId: 'R1', status: 'verkocht' })], { nu: NU });
    ck('een gearchiveerde wagen die nog als verkocht in de export staat blijft in het archief', p.bijwerken.length === 0, p);
  }

  console.log('\ntelling voor het dashboard');
  {
    const t = vsync.telling([
      wagen({ code: 'a' }), wagen({ code: 'b', status: 'gereserveerd' }),
      wagen({ code: 'c', status: 'verkocht' }), wagen({ code: 'd', gearchiveerd: true, status: 'verkocht' }),
      wagen({ code: 'e', status: 'uit aanbod' }),
    ]);
    ck('actief / gereserveerd / verkocht / gearchiveerd / uit aanbod', t.actief === 1 && t.gereserveerd === 1 && t.verkocht === 1 && t.gearchiveerd === 1 && t.uitAanbod === 1 && t.totaal === 5, t);
  }

  console.log('\nbronnen-instellingen');
  {
    ck('oude opgeslagen standaard (uit aanbod, met spatie) leest als verkocht',
      inv.saneerBron({ type: 'feed', url: 'https://x.example/f', verdwenen: 'uit aanbod' }).verdwenen === 'verkocht');
    ck('expliciet uit_aanbod blijft uit_aanbod',
      inv.saneerBron({ type: 'feed', url: 'https://x.example/f', verdwenen: 'uit_aanbod' }).verdwenen === 'uit_aanbod');
    ck('negeren blijft negeren',
      inv.saneerBron({ type: 'feed', url: 'https://x.example/f', verdwenen: 'negeren' }).verdwenen === 'negeren');
  }

  /* ═══════════════════════════════ LAAG 2 ═══════════════════════════════ */

  console.log('\nsync() van begin tot eind');
  const FEED_URL = 'https://dms.example/feed.csv';
  const db = { vehicles: [], volgnummer: 0 };
  const klant = { id: 'recC1', fields: { 'Project Code': 'P1', 'Inventory Source': JSON.stringify({ type: 'feed', url: FEED_URL }) } };
  const net = { feed: '', feedStatus: 200, soldAtBestaat: true, schrijf: 0 };

  const echtFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });

    if (u.startsWith(FEED_URL)) {
      if (net.feedStatus !== 200) return { ok: false, status: net.feedStatus, headers: { get: () => null }, text: async () => 'down' };
      return { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/csv' : null) }, text: async () => net.feed };
    }
    if (u.includes('/tblPidTrwGRzRt4LZ/recC1') && opts.method === 'PATCH') {
      Object.assign(klant.fields, body.fields);
      return json(klant);
    }
    /* Het slot wordt genomen door een token weg te schrijven en het record
       daarna ENKEL terug te lezen. Een lijst teruggeven op die enkele lezing
       laat het token nooit overeenkomen, en dan denkt sync() dat er al een
       andere loopt. */
    if (u.includes('/tblPidTrwGRzRt4LZ/recC1')) return json(klant);
    if (u.includes('/tblPidTrwGRzRt4LZ')) return json({ records: [klant] });

    if (/\/vehicles(\?|$)/.test(u) && (opts.method === 'POST' || opts.method === 'PATCH')) {
      net.schrijf++;
      const recs = body.records || [body];
      if (!net.soldAtBestaat && recs.some((r) => r.fields && 'Sold At' in r.fields)) {
        return json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Sold At"' } }, 422);
      }
      const uit = [];
      for (const r of recs) {
        if (opts.method === 'POST') {
          const nieuw = { id: 'recN' + (++db.volgnummer), fields: Object.assign({}, r.fields) };
          db.vehicles.push(nieuw); uit.push(nieuw);
        } else {
          const bestaand = db.vehicles.find((x) => x.id === r.id);
          if (bestaand) { Object.assign(bestaand.fields, r.fields); uit.push(bestaand); }
        }
      }
      return json({ records: uit });
    }
    if (/\/vehicles\?/.test(u)) {
      const m = /Project%20Code%7D%3D%22([^%]*)%22/.exec(u) || /\{Project Code\}="([^"]*)"/.exec(decodeURIComponent(u));
      const tenant = m ? decodeURIComponent(m[1]) : null;
      return json({ records: tenant ? db.vehicles.filter((r) => r.fields['Project Code'] === tenant) : db.vehicles.slice(0, 1) });
    }
    return json({ records: [] });
  };

  const feed = (rijen) => 'Stocknumber;Make;Model;Price;Mileage;Status;Description\n'
    + rijen.map((r) => [r.id, r.merk || 'BMW', r.model, r.prijs, r.km || 40000, r.status || '', r.oms || ''].join(';')).join('\n') + '\n';
  const actief = () => db.vehicles.filter((r) => r.fields['Project Code'] === 'P1');
  const doeSync = async (o) => {
    /* Het slot uit de vorige run is vrij; state als die van een verse run. */
    return inv.sync('P1', Object.assign({ door: 'test' }, o || {}));
  };

  net.feed = feed([{ id: 'X5-1', model: 'X5', prijs: 54900 }, { id: 'M3-1', model: 'M340i', prijs: 49900 }]);
  let r = await doeSync();
  ck('eerste sync slaagt', r.ok === true, r);
  ck('TEST 1 (eind tot eind): twee wagens, elk een keer', actief().length === 2, actief().map((x) => x.fields['Source Record ID']));
  ck('met een eigen Helvaro-code', actief().length === 2 && actief().every((x) => /^V\d+$/.test(x.fields['Vehicle Code'])), actief().map((x) => x.fields['Vehicle Code']));

  r = await doeSync();
  ck('TEST 2 (eind tot eind): zelfde feed opnieuw -> geen dubbels', actief().length === 2 && r.ok, actief().length);

  net.feed = feed([{ id: 'X5-1', model: 'X5', prijs: 52900 }, { id: 'M3-1', model: 'M340i', prijs: 49900 }]);
  r = await doeSync();
  const x5 = actief().find((x) => x.fields['Source Record ID'] === 'X5-1');
  ck('TEST 3 (eind tot eind): prijs bijgewerkt, geen nieuwe rij', actief().length === 2 && x5.fields.Price === 52900, { n: actief().length, prijs: x5 && x5.fields.Price });

  const schrijfVoor = net.schrijf;
  const staatVoor = JSON.stringify(actief().map((x) => x.fields));
  net.feedStatus = 503;
  r = await doeSync();
  ck('TEST 9: bron plat -> sync mislukt', r.ok === false, r);
  ck('en er is NIETS geschreven naar de voorraad', net.schrijf === schrijfVoor && JSON.stringify(actief().map((x) => x.fields)) === staatVoor);
  ck('geen enkele wagen is op verkocht gezet', actief().every((x) => x.fields.Status !== 'verkocht'));

  net.feedStatus = 200;
  net.feed = feed([{ id: 'M3-1', model: 'M340i', prijs: 49900 }]);
  r = await doeSync();
  const x5b = actief().find((x) => x.fields['Source Record ID'] === 'X5-1');
  ck('TEST 10: bron terug -> verzoening loopt, X5 verdween -> verkocht', r.ok && x5b.fields.Status === 'verkocht', x5b && x5b.fields);
  ck('TEST 6 (eind tot eind): Sold At gezet', Boolean(x5b.fields['Sold At']));
  ck('en de wagen bestaat nog (nooit verwijderd)', actief().length === 2);

  /* Base zonder het veld Sold At: de sync mag niet stuklopen. */
  net.soldAtBestaat = false;
  net.feed = feed([{ id: 'M3-1', model: 'M340i', prijs: 49900 }, { id: 'A6-1', model: 'A6', merk: 'Audi', prijs: 39900, status: 'sold' }]);
  r = await doeSync();
  const a6 = actief().find((x) => x.fields['Source Record ID'] === 'A6-1');
  ck('base zonder Sold At: sync slaagt toch', r.ok === true && Boolean(a6), r);
  ck('en schrijft de wagen zonder dat veld weg', a6 && a6.fields.Status === 'verkocht' && !('Sold At' in a6.fields), a6 && a6.fields);
  net.soldAtBestaat = true;

  /* archiveerVerkocht() eind tot eind: X5 staat 20 dagen verkocht. */
  x5b.fields['Sold At'] = new Date(Date.now() - 20 * 86400000).toISOString();
  const ar = await vsync.archiveerVerkocht('P1', { pauze: 0 });
  ck('archiveerVerkocht: X5 na 20 dagen gearchiveerd', ar.gearchiveerd === 1 && x5b.fields.Archived === true, { ar, f: x5b.fields });
  ck('A6 zonder datum kreeg nu een datum (klok gestart)', ar.klokGestart === 1 && Boolean(a6.fields['Sold At']), { ar, f: a6.fields });
  ck('de rij van de X5 bestaat nog, status blijft verkocht', x5b.fields.Status === 'verkocht');

  /* TEST 12 in het klein: een andere dealer ziet niets van P1. */
  const vanP2 = await vehicles.list('P2', { inclusiefGearchiveerd: true });
  ck('TEST 12: dealer P2 krijgt geen wagens van P1', vanP2.length === 0, vanP2.length);

  global.fetch = echtFetch;

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
