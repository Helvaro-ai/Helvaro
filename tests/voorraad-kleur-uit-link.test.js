'use strict';
/*
 * Kleur uit de AutoScout24-advertentielink (2026-10-07).
 *
 * Het verkopersprofiel levert geen kleur, de slug van de link soms wel:
 *   .../mercedes-benz-eqa-250-amg-line-electrique-blanc-<uuid>
 * De extractie is bewust zuinig (hele woorden, na merk en model, precies één
 * kleur) en een afgeleide kleur overschrijft nooit wat de dealer zelf invulde.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const w = require(BASE + 'api/_voorraad-providers/waarden.js');
const as24 = require(BASE + 'api/_voorraad-providers/autoscout24.js');
const vsync = require(BASE + 'api/_voorraad-sync.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};
const UUID = '1a2b3c4d-1111-2222-3333-444455556666';
const link = (slug) => `https://www.autoscout24.be/nl/aanbod/${slug}-${UUID}`;

console.log('\nkleurUitLink');
ck('het voorbeeld: Mercedes-Benz EQA ... electrique-blanc = wit', w.kleurUitLink(link('mercedes-benz-eqa-250-amg-line-electrique-blanc'), 'Mercedes-Benz', 'EQA') === 'wit', w.kleurUitLink(link('mercedes-benz-eqa-250-amg-line-electrique-blanc'), 'Mercedes-Benz', 'EQA'));
const tabel = [
  ['bmw-x5-xdrive30d-noir', 'BMW', 'X5', 'zwart'],
  ['volkswagen-golf-1-5-tsi-grau', 'Volkswagen', 'Golf', 'grijs'],
  ['audi-a3-sportback-35-tfsi-silber', 'Audi', 'A3', 'zilver'],
  ['renault-clio-5-tce-bleu', 'Renault', 'Clio', 'blauw'],
  ['peugeot-208-rouge', 'Peugeot', '208', 'rood'],
  ['opel-corsa-vert', 'Opel', 'Corsa', 'groen'],
  ['fiat-500-giallo', 'Fiat', '500', 'geel'],
  ['mini-cooper-orange', 'MINI', 'Cooper', 'oranje'],
  ['skoda-octavia-marron', 'Skoda', 'Octavia', 'bruin'],
  ['toyota-yaris-beige', 'Toyota', 'Yaris', 'beige'],
  ['ford-focus-zwart', 'Ford', 'Focus', 'zwart'],
  ['seat-ibiza-white', 'SEAT', 'Ibiza', 'wit'],
  ['volkswagen-passat-weiß', 'Volkswagen', 'Passat', 'wit'],
  ['bmw-x5-noir-metallise', 'BMW', 'X5', 'zwart'],
];
for (const [slug, merk, model, verwacht] of tabel) {
  const uit = w.kleurUitLink(link(slug), merk, model);
  ck(`${slug} = ${verwacht}`, uit === verwacht, uit);
}

console.log('\nonzeker = niets');
const geen = [
  ['twee kleuren (tweekleurig)', 'bmw-x5-noir-blanc', 'BMW', 'X5'],
  ['uitvoering "Black Edition" is geen kleur', 'ford-focus-st-line-black-edition', 'Ford', 'Focus'],
  ['uitvoering naast een echte kleur: niet raden', 'ford-focus-black-edition-blanc', 'Ford', 'Focus'],
  ['"Red Line" is een uitvoering', 'opel-astra-red-line', 'Opel', 'Astra'],
  ['geen kleurwoord', 'bmw-x5-xdrive30d-m-sport', 'BMW', 'X5'],
  ['een stuk van een woord telt niet (bluehdi)', 'peugeot-308-bluehdi-130', 'Peugeot', '308'],
  ['een kleurwoord dat bij het model hoort telt niet (model "Orange")', 'mini-orange', 'MINI', 'Orange'],
  ['de slug begint niet met het merk', 'occasion-van-de-maand-blanc', 'BMW', 'X5'],
];
for (const [naam, slug, merk, model] of geen) {
  const uit = w.kleurUitLink(link(slug), merk, model);
  ck(naam, uit === undefined, uit);
}
ck('zonder merk: niets', w.kleurUitLink(link('bmw-x5-noir'), '', 'X5') === undefined);
ck('geen link / kapotte link: niets', w.kleurUitLink('', 'BMW', 'X5') === undefined && w.kleurUitLink('geen-url', 'BMW', 'X5') === undefined);
ck('een kleurwoord voor het model (in het merk/model-stuk) telt niet', w.kleurUitLink(link('mini-cooper-s-silver-edition'), 'MINI', 'Cooper') === undefined);

console.log('\nmapAutoscout');
const lijstRegel = (url, extra) => Object.assign({
  id: 'AAAA1111-0000-0000-0000-000000000001', url,
  vehicle: { make: 'Mercedes-Benz', model: 'EQA', modelVersionInput: '250 AMG Line' },
  prices: { public: { priceRaw: 40000 } }, images: [],
}, extra || {});
let m = as24.mapAutoscout(lijstRegel('/nl/aanbod/mercedes-benz-eqa-250-amg-line-electrique-blanc-' + UUID), 'https://www.autoscout24.be');
ck('kleur wit, gemarkeerd als afgeleid', m.kleur === 'wit' && m.kleurAfgeleid === true, m);
m = as24.mapAutoscout(lijstRegel('/nl/aanbod/mercedes-benz-eqa-250-amg-line-' + UUID), 'https://www.autoscout24.be');
ck('geen kleur in de slug = geen kleursleutel', !('kleur' in m) && !('kleurAfgeleid' in m), m);
m = as24.mapAutoscout(lijstRegel(undefined), 'https://www.autoscout24.be');
ck('zonder link ook geen kleur', !('kleur' in m), m);

console.log('\nin de sync: aanvullen, nooit overschrijven');
const NU = '2026-10-07T10:00:00.000Z';
const wagen = (o) => Object.assign({
  id: 'rec' + o.code, code: o.code, projectCode: 'P1', merk: 'Mercedes-Benz', model: 'EQA', uitvoering: '', prijs: 40000, km: 10000,
  status: 'beschikbaar', gearchiveerd: false, bron: 'feed', bronId: 'autoscout24:' + o.code, fotos: [], omschrijving: '', link: '', verkochtOp: '', kleur: '',
}, o);
const bronRegel = (o) => Object.assign({ bronId: 'bron1', merk: 'Mercedes-Benz', model: 'EQA', prijs: 40000, km: 10000, status: 'beschikbaar', kleur: 'wit', kleurAfgeleid: true }, o);
const plan = (bestaand, regel) => vsync.verzoen(bestaand, [regel], { nu: NU });

let p = plan([wagen({ code: 'V1', bronId: 'bron1', kleur: '' })], bronRegel());
ck('wagen zonder kleur krijgt de afgeleide kleur', p.bijwerken.length === 1 && p.bijwerken[0].wijzigingen.indexOf('kleur') !== -1 && p.bijwerken[0].invoer.kleur === 'wit', p.bijwerken);
ck('de markering kleurAfgeleid wordt nooit weggeschreven', !('kleurAfgeleid' in p.bijwerken[0].invoer));

p = plan([wagen({ code: 'V1', bronId: 'bron1', kleur: 'Parelmoer' })], bronRegel());
ck('door de dealer ingevulde kleur blijft staan (geen wijziging)', p.bijwerken.length === 0 && p.ongewijzigd === 1, p);

p = plan([wagen({ code: 'V1', bronId: 'bron1', kleur: 'Parelmoer' })], bronRegel({ prijs: 39000 }));
ck('andere wijziging: kleur niet in de wijzigingen en niet in de invoer', p.bijwerken.length === 1 && p.bijwerken[0].wijzigingen.indexOf('kleur') === -1 && !('kleur' in p.bijwerken[0].invoer), p.bijwerken);

p = plan([], bronRegel());
ck('nieuwe wagen krijgt de afgeleide kleur', p.nieuw.length === 1 && p.nieuw[0].kleur === 'wit' && !('kleurAfgeleid' in p.nieuw[0]), p.nieuw);

p = plan([wagen({ code: 'V1', bronId: 'bron1', kleur: 'Parelmoer' })], bronRegel({ kleurAfgeleid: undefined, kleur: 'Alpine White' }));
ck('een kleur die de bron ZELF levert werkt zoals altijd (overschrijft)', p.bijwerken.length === 1 && p.bijwerken[0].invoer.kleur === 'Alpine White', p.bijwerken);

console.log('\nregelversie');
ck('VERSIE is opgehoogd zodat de volgende sync alles opnieuw vergelijkt', w.VERSIE >= 2, w.VERSIE);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
