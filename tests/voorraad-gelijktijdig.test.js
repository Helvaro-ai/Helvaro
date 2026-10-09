/*
 * F2 -- gelijktijdige syncs en bestaande dubbelen (audit inventory F2).
 *
 * Het oude slot was lezen-dan-schrijven op een momentopname met 2 minuten
 * levensduur: twee syncs die tegelijk begonnen gingen allebei door, en elke
 * wagen kwam twee keer (V1..V6 + V1..V6). Nu ligt er een Upstash-slot
 * (api/_lock.js, faalt open zonder Redis) om de sync van een dealer, en
 * heelt de sync dubbelen die er al staan.
 */
'use strict';
process.env.UPSTASH_REDIS_REST_URL = 'https://nep.upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'nep-token';
const { maak, modules, teller, rijen } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;
const codes = (h) => h.db.vehicles.map((v) => v.fields['Vehicle Code']);
const wisHash = (h) => { const st = h.staat(); st.feedHash = ''; st.listingsKlaar = false; if (st.bronnen) for (const k of Object.keys(st.bronnen)) st.bronnen[k].feedHash = ''; h.db.client.fields['Inventory State'] = JSON.stringify(st); };

(async () => {
  console.log('\nGelijktijdige syncs (F2)');

  /* A. twee syncs tegelijk, met Upstash: een wint, de ander hergebruikt */
  let clientPatch = 0;
  const h = maak({
    feed: () => rijen(6),
    latency: (url, m) => {
      if (url.includes('tblPidTrwGRzRt4LZ') && m === 'PATCH') { clientPatch++; return clientPatch === 2 ? 90 : 5; }
      if (/\/vehicles/.test(url) && m === 'POST') return 400;
      return 5;
    },
  });
  global.fetch = h.fake;
  let m = modules();
  const [a, b] = await Promise.all([
    m.inv.sync('T1', { trigger: 'cron', door: 'cron' }),
    m.inv.sync('T1', { trigger: 'verversen', door: 'dashboard' }),
  ]);
  ck('twee overlappende syncs: precies een voert uit', [a, b].filter((x) => x.hergebruikt === true).length === 1, { a: a.hergebruikt, b: b.hergebruikt });
  ck('... 6 wagens, geen dubbele codes', h.db.vehicles.length === 6 && new Set(codes(h)).size === 6, codes(h));
  ck('het slot is na afloop vrij', h.store.size === 0, Array.from(h.store.keys()));
  ck('de levensduur dekt een realistische sync (>= 240 s budget)', h.px.length > 0 && h.px.every((x) => x >= 240000), h.px);

  /* B. een mislukte sync geeft het slot ook vrij */
  const h3 = maak({ feed: () => rijen(3), onAt: (url) => { if (/\/vehicles\?pageSize=1/.test(url)) return 'fail'; } });
  global.fetch = h3.fake; m = modules();
  const r3 = await m.inv.sync('T1', { trigger: 'cron' });
  ck('mislukte sync: fout gemeld', r3.ok === false, r3.ok);
  ck('... en het slot is vrij', h3.store.size === 0, Array.from(h3.store.keys()));

  /* C. dubbelen die er al stonden worden geheeld, nooit verwijderd */
  const h2 = maak({ feed: () => rijen(6) });
  global.fetch = h2.fake; m = modules();
  await m.inv.sync('T1', { trigger: 'handmatig' });
  /* een tweede kopie van S6, zoals de race hem maakte: zelfde code, zelfde bron, ook beschikbaar */
  const orig = h2.db.vehicles.find((v) => v.fields['Source Record ID'] === 'S6');
  h2.db.vehicles.push({ id: 'recDUP', fields: Object.assign({}, orig.fields, { 'Created At': new Date(Date.parse(orig.fields['Created At'] || Date.now()) + 5000).toISOString() }) });
  const aantalRijen = h2.db.vehicles.length;
  m = modules(); wisHash(h2);
  await m.inv.sync('T1', { trigger: 'cron' });
  const kopie = h2.db.vehicles.find((v) => v.id === 'recDUP').fields;
  const eerste = h2.db.vehicles.find((v) => v.id === orig.id).fields;
  ck('de dubbele rij is niet meer beschikbaar', kopie['Status'] !== 'beschikbaar' && kopie['Archived'] === true, { status: kopie['Status'], arch: kopie['Archived'] });
  ck('de oorspronkelijke rij blijft beschikbaar', eerste['Status'] === 'beschikbaar' && !eerste['Archived'], eerste);
  ck('er is niets verwijderd', h2.db.vehicles.length === aantalRijen, h2.db.vehicles.length);

  /* D. daarna verdwijnt de bronwagen: er blijft nergens een beschikbare kopie over */
  let feed6 = true;
  const h4 = maak({ feed: () => rijen(feed6 ? 6 : 5) });
  global.fetch = h4.fake; m = modules();
  await m.inv.sync('T1', { trigger: 'handmatig' });
  const o4 = h4.db.vehicles.find((v) => v.fields['Source Record ID'] === 'S6');
  h4.db.vehicles.push({ id: 'recDUP2', fields: Object.assign({}, o4.fields) });
  feed6 = false;
  m = modules(); wisHash(h4);
  await m.inv.sync('T1', { trigger: 'cron' });
  const s6 = h4.db.vehicles.filter((v) => v.fields['Source Record ID'] === 'S6');
  ck('S6 weg uit de bron: geen enkele kopie blijft beschikbaar', s6.length === 2 && s6.every((v) => v.fields['Status'] !== 'beschikbaar'), s6.map((v) => v.fields['Status']));
  ck('... en de rest is ongemoeid', h4.db.vehicles.filter((v) => v.fields['Status'] === 'beschikbaar').length === 5);

  /* E. tweede run na helen: geen nieuwe schrijfacties (idempotent) */
  const voor = h2.log.length;
  m = modules(); wisHash(h2);
  await m.inv.sync('T1', { trigger: 'cron' });
  ck('opnieuw draaien schrijft niets meer aan de wagens', h2.log.slice(voor).filter((x) => /^vehicles/.test(x)).length === 0, h2.log.slice(voor));

  /* F. zonder Upstash gaat alles zoals voorheen (faalt open) */
  delete process.env.UPSTASH_REDIS_REST_URL;
  const h5 = maak({ feed: () => rijen(4) });
  global.fetch = h5.fake; m = modules();
  const r5 = await m.inv.sync('T1', { trigger: 'handmatig' });
  ck('zonder Upstash: gewone sync werkt nog', r5.ok === true && h5.db.vehicles.length === 4, { ok: r5.ok, n: h5.db.vehicles.length });

  t.klaar();
})().catch((e) => { console.error(e); process.exit(1); });
