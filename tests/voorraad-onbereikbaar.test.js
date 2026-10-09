/*
 * F1 -- een onleesbare tabel is NIET "leeg" (audit inventory F1).
 *
 * Een afgebroken beschikbaarheidscontrole (koude start, 8 s time-out) liet
 * vehicles.list() een lege lijst teruggeven; het plan zag elke feedwagen als
 * nieuw en POSTte alles een tweede keer, met hergebruikte V-codes. Nu gooit de
 * sync zodra de voertuigen- of de advertentietabel niet te lezen is, en
 * schrijft hij niets.
 */
'use strict';
const { maak, modules, teller, rijen } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;

const codes = (h) => h.db.vehicles.map((v) => v.fields['Vehicle Code']);
const wisHash = (h) => { const st = h.staat(); st.feedHash = ''; st.listingsKlaar = false; if (st.bronnen) for (const k of Object.keys(st.bronnen)) st.bronnen[k].feedHash = ''; h.db.client.fields['Inventory State'] = JSON.stringify(st); };

(async () => {
  console.log('\nOnbereikbare tabel stopt de sync (F1)');

  /* A. voertuigentabel: de beschikbaarheidscontrole breekt af */
  let probe = 0, falen = false;
  const h = maak({ feed: () => rijen(6), onAt: (url) => { if (falen && /\/vehicles\?pageSize=1/.test(url)) { probe++; return 'fail'; } } });
  global.fetch = h.fake;
  let m = modules();
  let r = await m.inv.sync('T1', { trigger: 'handmatig' });
  ck('gezonde eerste run: 6 wagens', r.ok === true && h.db.vehicles.length === 6, { ok: r.ok, n: h.db.vehicles.length });

  m = modules(); wisHash(h); falen = true;
  const voor = h.log.length;
  r = await m.inv.sync('T1', { trigger: 'cron' });
  ck('afgebroken controle: de sync meldt een fout', r.ok === false, r.ok);
  ck('... zonder ook maar een wagen te POSTen', h.db.vehicles.length === 6 && !h.log.slice(voor).some((x) => /vehicles POST/.test(x)), { n: h.db.vehicles.length, log: h.log.slice(voor) });
  ck('... en zonder dubbele codes', new Set(codes(h)).size === codes(h).length, codes(h));
  ck('de fout is leesbaar: onbereikbaar', h.staat().lastErrorCode === 'onbereikbaar', h.staat().lastErrorCode);

  /* B. daarna herstel: weer gezond, dan geen duplicaten en geen verlies */
  falen = false; m = modules(); wisHash(h);
  r = await m.inv.sync('T1', { trigger: 'cron' });
  ck('herstel: volgende run slaagt zonder dubbels', r.ok === true && h.db.vehicles.length === 6, { ok: r.ok, n: h.db.vehicles.length });

  /* C. advertentietabel: bestaat maar is niet te lezen */
  let lfalen = false;
  const h2 = maak({ feed: () => rijen(6), onAt: (url) => { if (lfalen && /\/vehicle_listings\?pageSize=1/.test(url)) return 'fail'; } });
  global.fetch = h2.fake;
  m = modules();
  await m.inv.sync('T1', { trigger: 'handmatig' });
  const eerste = h2.db.vehicles.length;
  m = modules(); wisHash(h2); lfalen = true;
  const v2 = h2.log.length;
  r = await m.inv.sync('T1', { trigger: 'cron' });
  ck('onleesbare advertentietabel: sync meldt een fout', r.ok === false, r.ok);
  ck('... en schrijft niets', h2.db.vehicles.length === eerste && h2.log.slice(v2).filter((x) => /POST|PATCH/.test(x) && !/Inventory/.test(x)).length === 0, h2.log.slice(v2));

  t.klaar();
})().catch((e) => { console.error(e); process.exit(1); });
