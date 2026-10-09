/*
 * F3 -- een mislukte "verkocht"-PATCH wordt opnieuw geprobeerd (audit F3).
 *
 * De advertentierij van een verdwenen wagen ging op REMOVED, ook als de PATCH
 * die de wagen op verkocht zette mislukte. Zonder actieve advertentie was de
 * wagen daarna geen kandidaat meer: voor altijd beschikbaar op de website
 * terwijl hij uit de bron weg was. Nu schrijft de sync REMOVED pas als de PATCH
 * aankwam.
 */
'use strict';
const { maak, modules, teller, rijen } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;

(async () => {
  console.log('\nMislukte verkocht-PATCH komt terug (F3)');
  let aantal = 6, kapot = false;
  const h = maak({
    feed: () => rijen(aantal),
    onAt: (url, m, init) => {
      if (kapot && m === 'PATCH' && /\/vehicles$/.test(url.split('?')[0]) && /verkocht/.test(String(init.body))) return 'http500';
    },
  });
  global.fetch = h.fake;
  let mod = modules();
  await mod.inv.sync('T1', { trigger: 'handmatig' });
  const s6 = () => h.db.vehicles.find((v) => v.fields['Source Record ID'] === 'S6').fields;
  const l6 = () => h.db.vehicle_listings.find((l) => /s6$/i.test(l.fields['Listing Key'] || '')).fields;
  ck('start: S6 beschikbaar, advertentie ACTIVE', s6()['Status'] === 'beschikbaar' && l6()['Status'] === 'ACTIVE', { s: s6()['Status'], l: l6()['Status'] });

  aantal = 5; kapot = true;
  mod = modules();
  await mod.inv.sync('T1', { trigger: 'cron' });
  ck('PATCH mislukt: wagen nog beschikbaar', s6()['Status'] === 'beschikbaar', s6()['Status']);
  ck('... en zijn advertentie is NIET op REMOVED gezet', l6()['Status'] === 'ACTIVE', l6()['Status']);

  kapot = false; mod = modules();
  const r = await mod.inv.sync('T1', { trigger: 'cron' });
  ck('volgende run (PATCH werkt): S6 alsnog verkocht', s6()['Status'] === 'verkocht', { s: s6()['Status'], ok: r.ok });
  ck('... en de advertentie nu REMOVED', l6()['Status'] === 'REMOVED', l6()['Status']);

  mod = modules();
  const voor = h.log.length;
  await mod.inv.sync('T1', { trigger: 'cron' });
  ck('daarna stabiel: niets meer te schrijven aan de wagens', h.log.slice(voor).filter((x) => /^vehicles/.test(x)).length === 0, h.log.slice(voor));

  /* pure kant: de filter zelf, ook voor een door de schrijfgrens afgekapte PATCH */
  const sync = require('../api/_voorraad-sync');
  const plan = { weg: [{ id: 'recA', code: 'V1' }, { id: 'recB', code: 'V2' }], listings: [
    { vehicleCode: 'V1', status: 'REMOVED', provider: 'feed', externalId: 'a' },
    { vehicleCode: 'V2', status: 'REMOVED', provider: 'feed', externalId: 'b' },
    { vehicleCode: 'V3', status: 'REMOVED', provider: 'feed', externalId: 'c' },   // wagen blijft (ander platform)
    { vehicleCode: 'V4', status: 'ACTIVE', provider: 'feed', externalId: 'd' },
  ] };
  const uit = sync.advertentiesNaSchrijven(plan, new Set(['recA'])).map((l) => l.vehicleCode);
  ck('alleen REMOVED voor wagens waarvan de PATCH slaagde; de rest ongemoeid', JSON.stringify(uit) === JSON.stringify(['V1', 'V3', 'V4']), uit);
  t.klaar();
})().catch((e) => { console.error(e); process.exit(1); });
