/*
 * F13 -- AutoScout24-profiel zonder bruikbaar totaal (audit inventory F13).
 *
 * Ontbrak `numberOfResults` op de eerste pagina (of stond er 0), dan werd er
 * 1 pagina gelezen, werd de 95%-controle overgeslagen en gold een half gelezen
 * voorraad als geslaagde lezing: de rest ging op verkocht. Nu wordt zo'n lezing
 * als niet-controleerbaar gemarkeerd (geenVerwijdering): toevoegen en bijwerken
 * mag, maar er gaat niets op verkocht en de run is 'partial'.
 */
'use strict';
const { maak, modules, teller } = require('./_nep-voorraad');
const { haalAutoscout } = require('../api/_voorraad-providers/autoscout24');
const t = teller();
const ck = t.ck;

const listing = (i) => ({ id: 'id' + i, url: '/nl/aanbod/x-' + i, vehicle: { make: 'BMW', model: 'X' + i }, prices: { public: { priceRaw: 20000 + i } }, images: [] });
const pagina = (van, n, totaal) => '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: Object.assign({ listings: Array.from({ length: n }, (_, i) => listing(van + i)) }, totaal === undefined ? {} : { numberOfResults: totaal }) } }) + '</script>';
/* n wagens in werkelijkheid; `meld` is wat de pagina als totaal opgeeft (undefined = ontbreekt) */
const bron = (n, meld) => async (u) => {
  if (String(u).endsWith('robots.txt')) return { status: 404, ok: false };
  const p = Number((String(u).match(/page=(\d+)/) || [0, 1])[1]);
  const van = (p - 1) * 20;
  return { status: 200, ok: true, text: async () => pagina(van, Math.max(0, Math.min(20, n - van)), meld) };
};
const lees = (n, meld) => haalAutoscout({ url: 'https://www.autoscout24.be/nl/verkopers/demo' }, { fetch: bron(n, meld), wacht: async () => {} });

(async () => {
  console.log('\nAutoScout24 zonder bruikbaar totaal (F13)');
  let r = await lees(60, 60);
  ck('normaal (totaal 60): 60 wagens, gewoon controleerbaar', r.voertuigen.length === 60 && !r.geenVerwijdering, { n: r.voertuigen.length, g: r.geenVerwijdering });
  r = await lees(45, undefined);
  ck('totaal ontbreekt, 45 wagens over 3 pagina\'s: alles gelezen maar niet controleerbaar', r.voertuigen.length === 45 && r.geenVerwijdering === true && r.geenVerwijderingReden === 'totaal_ontbreekt', { n: r.voertuigen.length, g: r.geenVerwijdering });
  r = await lees(45, 0);
  ck('totaal 0: idem', r.voertuigen.length === 45 && r.geenVerwijdering === true, { n: r.voertuigen.length, g: r.geenVerwijdering });
  r = await lees(20, 10);
  ck('totaal (10) kleiner dan gelezen (20): niet controleerbaar', r.voertuigen.length === 20 && r.geenVerwijdering === true && r.geenVerwijderingReden === 'totaal_kleiner_dan_gelezen', { n: r.voertuigen.length, g: r.geenVerwijderingReden });
  r = await lees(20, 18);
  ck('net iets meer gelezen (20) dan het totaal (18): verwijderen mag wel (geen eeuwige blokkade)', r.voertuigen.length === 20 && !r.geenVerwijdering, { n: r.voertuigen.length, g: r.geenVerwijdering });
  let e = null;
  try { await lees(30, 60); } catch (x) { e = x; }
  ck('onvolledig t.o.v. een bruikbaar totaal (30 van 60): nog steeds een fout', e && e.code === 'bron_onvolledig', e && e.code);

  /* door de hele sync: de ene wagen die uit de lezing ontbreekt gaat NIET op verkocht */
  let aantal = 10, meld = 10;
  const h = maak({ bronnen: [{ provider: 'autoscout24', url: 'https://www.autoscout24.be/nl/verkopers/demo', verdwenen: 'verkocht' }], feed: () => [] });
  const basis = h.fake;
  global.fetch = async (url, init) => {
    if (String(url).startsWith('https://www.autoscout24.be')) return bron(aantal, meld)(url, init);
    return basis(url, init);
  };
  let mod = modules();
  let s = await mod.inv.sync('T1', { trigger: 'handmatig' });
  ck('eerste run (totaal 10): 10 wagens aangemaakt', h.db.vehicles.length === 10 && s.ok === true, { n: h.db.vehicles.length, ok: s.ok });
  aantal = 9; meld = undefined; mod = modules();
  s = await mod.inv.sync('T1', { trigger: 'cron' });
  const verkocht = h.db.vehicles.filter((v) => v.fields['Status'] === 'verkocht').length;
  ck('pagina zonder totaal toont 9 van 10: niets op verkocht', verkocht === 0, verkocht);
  const st = h.staat();
  ck('... run is "partial" met uitleg voor de eigenaar', st.lastResult === 'partial' && /niet volledig te controleren/.test(st.lastError || ''), { lr: st.lastResult, le: st.lastError });
  ck('... de volgende run slaat niet over', !st.bronnen.autoscout24.feedHash, st.bronnen.autoscout24.feedHash);
  meld = 9; mod = modules();
  s = await mod.inv.sync('T1', { trigger: 'cron' });
  ck('met een bruikbaar totaal (9) gaat de verdwenen wagen wel op verkocht', h.db.vehicles.filter((v) => v.fields['Status'] === 'verkocht').length === 1, h.db.vehicles.map((v) => v.fields['Status']));
  t.klaar();
})().catch((e) => { console.error(e); process.exit(1); });
