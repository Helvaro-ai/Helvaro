'use strict';
/*
 * Gedeelde testhulp voor de voorraadsync-tests (geen test zelf: geen .test.js).
 *
 * Een nep-Airtable (vehicles, vehicle_listings, de klantentabel) en een nep-
 * Upstash in het geheugen, met een gemockte global fetch. Zo draait de ECHTE
 * api/_inventaris.sync() zonder netwerk, en kunnen de gevaarlijke momenten
 * (een afgebroken beschikbaarheidscontrole, twee syncs tegelijk, een
 * mislukte PATCH) opzettelijk veroorzaakt worden.
 *
 * Opties van maak():
 *   feed()          -> array van feedregels (willekeurige kolomnamen, zie feed.js ALIASSEN)
 *   bronnen         -> Inventory Source.bronnen (standaard een feed)
 *   drempels        -> Inventory Source.drempels
 *   latency(url,m)  -> vertraging in ms per verzoek
 *   onAt(url,m,init)-> 'fail' (fetch gooit), 'http500' (HTTP 500) of undefined
 *   upstash         -> true: nep-Upstash aan (SET NX PX / GET / DEL / EVAL)
 */
const R = require('path').join(__dirname, '..', 'api') + '/';
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'patTest';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appX';
const CLIENTS = 'tblPidTrwGRzRt4LZ';

function csvVan(rijen) {
  if (!rijen.length) return 'id,make,model\n';
  const kolommen = Array.from(rijen.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set()));
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return kolommen.join(',') + '\n' + rijen.map((r) => kolommen.map((k) => cel(r[k])).join(',')).join('\n');
}

function maak(opts = {}) {
  const bronnen = opts.bronnen || [{ provider: 'feed', url: 'https://93.184.216.34/feed.csv', verdwenen: 'verkocht' }];
  const db = {
    vehicles: [], vehicle_listings: [],
    client: { id: 'recC', fields: { 'Project Code': 'T1', fldN4dL0bGgfBOXwM: 'T1', 'Inventory Source': JSON.stringify(Object.assign({ bronnen }, opts.drempels ? { drempels: opts.drempels } : {})), 'Inventory State': '' } },
  };
  const store = new Map();               // nep-Upstash
  const px = [];                          // gevraagde TTL's (ms) van SET ... PX
  let n = 0;
  const log = [];
  const fake = async (url, init = {}) => {
    url = String(url);
    const m = (init.method || 'GET').toUpperCase();
    const J = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => JSON.stringify(o), headers: { get: () => null } });
    if (url.startsWith('https://nep.upstash.test')) {
      const [naam, ...a] = JSON.parse(init.body)[0];
      let result = null;
      if (naam === 'SET') { const [k, v, nx] = a; px.push(Number(a[a.indexOf('PX') + 1])); if (nx === 'NX' && store.has(k)) result = null; else { store.set(k, v); result = 'OK'; } }
      else if (naam === 'GET') result = store.has(a[0]) ? store.get(a[0]) : null;
      else if (naam === 'DEL') result = store.delete(a[0]) ? 1 : 0;
      else if (naam === 'EVAL') { const [, , k, v] = a; if (store.get(k) === v) { store.delete(k); result = 1; } else result = 0; }
      log.push('upstash ' + naam);
      return J([{ result }]);
    }
    if (url.startsWith('https://93.184.216.34/feed')) {
      const rijen = opts.feed();
      const csv = csvVan(rijen);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => csv };
    }
    await new Promise((r) => setTimeout(r, opts.latency ? opts.latency(url, m) : 0));
    if (opts.onAt) {
      const r = opts.onAt(url, m, init);
      if (r === 'fail') throw new Error('This operation was aborted');
      if (r === 'http500') return J({ error: 'boom' }, 500);
    }
    const pth = url.replace('https://api.airtable.com/v0/' + process.env.BASE_AIRTABLE + '/', '');
    const tab = pth.split('?')[0].split('/')[0];
    if (tab === CLIENTS) {
      if (m === 'PATCH') { Object.assign(db.client.fields, JSON.parse(init.body).fields); return J(db.client); }
      if (pth.split('?')[0].includes('/')) return J(JSON.parse(JSON.stringify(db.client)));
      return J({ records: [JSON.parse(JSON.stringify(db.client))] });
    }
    if (tab === 'vehicles' || tab === 'vehicle_listings') {
      const T = db[tab];
      if (m === 'GET') return J({ records: T.map((r) => JSON.parse(JSON.stringify(r))) });
      if (m === 'POST') {
        const b = JSON.parse(init.body);
        const out = b.records.map((r) => { const x = { id: 'rec' + (++n), fields: r.fields }; T.push(x); return x; });
        log.push(tab + ' POST ' + out.length);
        return J({ records: out });
      }
      if (m === 'PATCH') {
        const b = JSON.parse(init.body);
        for (const r of b.records) { const x = T.find((y) => y.id === r.id); if (x) Object.assign(x.fields, r.fields); }
        log.push(tab + ' PATCH ' + b.records.length);
        return J({ records: b.records });
      }
    }
    return J({}, 404);
  };
  const staat = () => { try { return JSON.parse(db.client.fields['Inventory State'] || '{}'); } catch (_) { return {}; } };
  return { db, fake, log, store, px, staat };
}

/** Vers ingeladen modules (caches van beschikbaarheid leeg). */
function modules() {
  const veh = require(R + '_vehicles'), lst = require(R + '_listings');
  veh._resetAvailability(); lst._reset();
  return { inv: require(R + '_inventaris'), veh, lst, sync: require(R + '_voorraad-sync') };
}

function teller() {
  const t = { pass: 0, fail: 0 };
  t.ck = (naam, ok, got) => {
    console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${naam}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
    ok ? t.pass++ : t.fail++;
  };
  t.klaar = () => { console.log(`\n  ${t.pass} ok, ${t.fail} fout\n`); process.exit(t.fail ? 1 : 0); };
  return t;
}

const rijen = (nr, extra) => Array.from({ length: nr }, (_, i) => Object.assign({ id: 'S' + (i + 1), make: 'BMW', model: 'X' + (i + 1), price: 20000 + i, mileage: 1000 + i }, extra || {}));

module.exports = { maak, modules, teller, rijen, csvVan, R };
