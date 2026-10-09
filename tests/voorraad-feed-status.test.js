/*
 * F5 -- gangbare statuswoorden in een feed (audit inventory F5).
 *
 * "Actief", "Te koop", "in voorraad" of een kolom `state` met used/new gaven
 * status 'onbekend': de hele voorraad verdween stil van de website (HTTP 200,
 * 0 wagens). Nu worden de gangbare woorden herkend; een woord dat we echt niet
 * kennen blijft 'onbekend', maar als daardoor een groot deel van de voorraad in
 * een run tegelijk 'onbekend' wordt, blokkeert de dalingswacht de run.
 */
'use strict';
const feed = require('../api/_voorraad-providers/feed');
const sync = require('../api/_voorraad-sync');
const { teller } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;

const st = (kol, w) => feed.mapRegel({ id: 'A1', make: 'BMW', [kol]: w }).status;

console.log('\nFeedstatus (F5)');
const beschikbaar = ['Actief', 'active', 'ACTIEF', 'Te koop', 'te_koop', 'For Sale', 'in voorraad', 'In-Voorraad', 'in stock', 'available', 'Beschikbaar',
  'Disponible', 'À vendre', 'a vendre', 'Verfügbar', 'verfugbar', 'Voorradig', 'online'];
for (const w of beschikbaar) ck(`status "${w}" -> beschikbaar`, st('status', w) === 'beschikbaar', st('status', w));
for (const w of ['used', 'new', 'Occasion', 'nieuw', 'gebruikt', 'Gebraucht', 'neuf']) ck(`state "${w}" -> beschikbaar (conditie, geen beschikbaarheid)`, st('state', w) === 'beschikbaar', st('state', w));
ck('gereserveerd / reserved / réservé blijven gereserveerd', ['gereserveerd', 'Reserved', 'Réservé', 'reserviert'].every((w) => st('status', w) === 'gereserveerd'));
ck('verkocht / sold / vendu / verkauft blijven verkocht', ['verkocht', 'SOLD', 'Vendu', 'verkauft'].every((w) => st('status', w) === 'verkocht'));
ck('een echt onbekend woord blijft onbekend', st('status', 'xyzzy') === 'onbekend', st('status', 'xyzzy'));
ck('geen status: aanwezig in de feed = beschikbaar (ongewijzigd)', feed.mapRegel({ id: 'A1', make: 'BMW' }).status === 'beschikbaar');

/* de wacht: ineens bijna alles onbekend wordt niet doorgevoerd */
const bestaand = Array.from({ length: 20 }, (_, i) => ({ id: 'rec' + i, code: 'V' + (i + 1), merk: 'BMW', model: 'X' + i, prijs: 1, km: 100 + i, status: 'beschikbaar', bron: 'feed', bronId: 'S' + (i + 1), gearchiveerd: false, aangemaakt: '2026-09-01T00:00:00.000Z' }));
const bron = (status, n) => Array.from({ length: 20 }, (_, i) => ({ bronId: 'S' + (i + 1), merk: 'BMW', model: 'X' + i, prijs: 1, km: 100 + i, status: i < n ? status : 'beschikbaar' }));
let p = sync.verzoen(bestaand, bron('onbekend', 20), { nu: '2026-10-09T10:00:00.000Z' });
ck('20 van 20 wagens worden ineens onbekend: geblokkeerd, geen wijziging', p.dalingGeblokkeerd === true && p.bijwerken.length === 0, { b: p.dalingGeblokkeerd, n: p.bijwerken.length });
p = sync.verzoen(bestaand, bron('onbekend', 8), { nu: '2026-10-09T10:00:00.000Z' });
ck('8 van 20 (40%): geblokkeerd', p.dalingGeblokkeerd === true && p.bijwerken.length === 0, { b: p.dalingGeblokkeerd, n: p.bijwerken.length });
p = sync.verzoen(bestaand, bron('onbekend', 1), { nu: '2026-10-09T10:00:00.000Z' });
ck('1 wagen met een vreemde status: gewoon onbekend (de dealer ziet hem)', p.dalingGeblokkeerd === false && p.bijwerken.length === 1 && p.bijwerken[0].invoer.status === 'onbekend', { b: p.dalingGeblokkeerd, n: p.bijwerken.length });
p = sync.verzoen(bestaand, bron('onbekend', 20), { nu: '2026-10-09T10:00:00.000Z', bevestigDaling: true });
ck('na bevestiging van de dealer: toegepast', p.dalingGeblokkeerd === false && p.bijwerken.length === 20, p.bijwerken.length);
t.klaar();
