/*
 * F4 -- de dalingswacht dekt ook kleine voorraden, kleinere dalingen en
 * statuswijzigingen (audit inventory F4).
 *
 * Voorheen: pas blokkeren bij >= 5 verdwenen EN > 50%. Een afgekapte feed van een
 * dealer met 8 wagens (4 weg) of 4 wagens (3 weg) zette dus gewoon alles op
 * verkocht, en een feed die plots overal status=verkocht meestuurde viel er
 * helemaal buiten.
 *
 * Drempels (api/_voorraad-sync.js): minstens 2 wagens die tegelijk uit de
 * actieve voorraad gaan EN meer dan 50% van wat de bron toonde; bij 10 of meer
 * wagens al vanaf meer dan 30%. Weg uit de feed, status verkocht en status
 * onbekend tellen samen.
 */
'use strict';
const { modules, teller, rijen } = require('./_nep-voorraad');
const sync = require('../api/_voorraad-sync');
const t = teller();
const ck = t.ck;
const NU = '2026-10-09T10:00:00.000Z';

function voorraad(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'rec' + i, code: 'V' + (i + 1), merk: 'BMW', model: 'X' + i, prijs: 20000, km: 1000 + i, status: 'beschikbaar', bron: 'feed', bronId: 'S' + (i + 1), gearchiveerd: false, aangemaakt: '2026-09-01T00:00:00.000Z' }));
}
const feedVan = (n, status) => Array.from({ length: n }, (_, i) => ({ bronId: 'S' + (i + 1), merk: 'BMW', model: 'X' + i, prijs: 20000, km: 1000 + i, status: status || 'beschikbaar' }));
const plan = (bestaand, voertuigen, extra) => sync.verzoen(bestaand, voertuigen, Object.assign({ nu: NU }, extra || {}));

(async () => {
  console.log('\nDalingswacht (F4)');

  let p = plan(voorraad(8), feedVan(4));
  ck('8 wagens, feed toont er 4: geblokkeerd, niets verkocht', p.dalingGeblokkeerd === true && p.weg.length === 0 && p.verdwenenAantal === 4, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(4), feedVan(1));
  ck('4 wagens, feed toont er 1: geblokkeerd', p.dalingGeblokkeerd === true && p.weg.length === 0, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(20), feedVan(12));
  ck('20 wagens, 8 weg (40%): geblokkeerd (>30% bij >=10)', p.dalingGeblokkeerd === true && p.weg.length === 0, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(20), feedVan(9));
  ck('20 wagens, 11 weg: nog steeds geblokkeerd', p.dalingGeblokkeerd === true, p.dalingGeblokkeerd);

  /* gewone verkoopdagen blijven doorgaan */
  p = plan(voorraad(20), feedVan(14));
  ck('20 wagens, 6 weg (30%): normale verkoop, gaat door', p.dalingGeblokkeerd === false && p.weg.length === 6, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(8), feedVan(5));
  ck('8 wagens, 3 weg (37%): gaat door', p.dalingGeblokkeerd === false && p.weg.length === 3, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(3), feedVan(2));
  ck('3 wagens, 1 weg: gaat door (een enkele verkoop is nooit abnormaal)', p.dalingGeblokkeerd === false && p.weg.length === 1, { b: p.dalingGeblokkeerd, weg: p.weg.length });
  p = plan(voorraad(1), feedVan(1).slice(0, 0).concat([]));
  ck('1 wagen, die verkocht wordt: gaat door', p.dalingGeblokkeerd === false && p.weg.length === 1, { b: p.dalingGeblokkeerd, weg: p.weg.length });

  /* bevestigd door de dealer: dan wel */
  p = plan(voorraad(8), feedVan(4), { bevestigDaling: true });
  ck('na bevestiging door de dealer: 4 verkocht', p.dalingGeblokkeerd === false && p.weg.length === 4, { b: p.dalingGeblokkeerd, weg: p.weg.length });

  /* een feed waarin plots alles verkocht staat telt als massale daling */
  p = plan(voorraad(20), feedVan(20, 'verkocht'));
  ck('feed: alle 20 wagens ineens status verkocht: geblokkeerd, geen enkele PATCH', p.dalingGeblokkeerd === true && p.bijwerken.length === 0 && p.weg.length === 0, { b: p.dalingGeblokkeerd, bij: p.bijwerken.length });
  ck('... en geen "verkocht"-gebeurtenis gelogd', !p.gebeurtenissen.some((g) => g.soort === 'vehicle_marked_sold'), p.gebeurtenissen.map((g) => g.soort));
  p = plan(voorraad(20), feedVan(20, 'verkocht'), { bevestigDaling: true });
  ck('... na bevestiging gaan ze wel op verkocht', p.dalingGeblokkeerd === false && p.bijwerken.length === 20 && p.bijwerken.every((b) => b.invoer.status === 'verkocht'), { bij: p.bijwerken.length });
  p = plan(voorraad(20), feedVan(20).map((f, i) => (i < 2 ? Object.assign({}, f, { status: 'verkocht' }) : f)));
  ck('2 van 20 via status verkocht: normaal, gaat door', p.dalingGeblokkeerd === false && p.bijwerken.filter((b) => b.invoer.status === 'verkocht').length === 2, p.dalingGeblokkeerd);
  p = plan(voorraad(20), feedVan(20).map((f, i) => (i < 8 ? Object.assign({}, f, { status: 'verkocht', prijs: 1 }) : f)));
  ck('8 van 20 via status verkocht + prijs: status geblokkeerd, prijs wel bijgewerkt', p.dalingGeblokkeerd === true && p.bijwerken.length === 8 && p.bijwerken.every((b) => b.invoer.status === undefined && b.wijzigingen.indexOf('prijs') !== -1), { n: p.bijwerken.length, st: p.bijwerken.map((b) => b.invoer.status).join() });

  /* de geblokkeerde run is zichtbaar voor de eigenaar: state/notitie/run.daling */
  const { maak: maak2 } = require('./_nep-voorraad');
  let mod;
  let aantal = 8;
  const h4 = maak2({ feed: () => rijen(aantal) });
  global.fetch = h4.fake; mod = modules();
  await mod.inv.sync('T1', { trigger: 'handmatig' });
  aantal = 4; mod = modules();
  const r = await mod.inv.sync('T1', { trigger: 'cron' });
  const st = h4.staat();
  ck('sync: 4 van 8 weg -> alle 8 nog beschikbaar', h4.db.vehicles.every((v) => v.fields['Status'] === 'beschikbaar'), h4.db.vehicles.map((v) => v.fields['Status']));
  ck('... run is "partial" met uitleg voor de eigenaar', st.lastResult === 'partial' && /NIET op verkocht/.test(st.lastError || ''), { lr: st.lastResult, le: st.lastError });
  ck('... en run.daling staat in de geschiedenis (voedt de push-melding)', st.runs && st.runs[0] && st.runs[0].daling === 4, st.runs && st.runs[0]);
  ck('... de volgende run slaat niet over (feedHash leeg)', !st.feedHash, st.feedHash);
  t.klaar();
})().catch((e) => { console.error(e); process.exit(1); });
