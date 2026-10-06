'use strict';
/*
 * Provider 'meta': Meta (Facebook/Instagram) als PUBLICEERkanaal.
 *
 * Hier gaat voorraad NAAR Meta, hij komt er niet vandaan. Daarom:
 *   - status ACTIVE, maar capabilities.lezen is false: registry.kanSyncen()
 *     zegt nee, dus de synchronisatie slaat dit platform altijd over en het
 *     kan nooit een wagen op verkocht zetten;
 *   - capabilities.publiceren is true: Helvaro serveert de catalogusfeed
 *     (api/_voorraad-providers/meta-feed.js) op /api/inventory/CODE/meta.csv.
 *
 * Wat de dealer hier bewaart is het adres van zijn showroom en de coordinaten:
 * Meta eist ze voor een dealerschap (address.*, latitude, longitude). Er zijn
 * geen geheimen: geen sleutels, geen tokens.
 *
 * Geen route: onderstreepje voorop.
 */

const { normaliseer } = require('./fouten');
const { ontbreekt } = require('./meta-feed');

const tekst = (x, max) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** "12,5" en "12.5" zijn allebei een getal; leeg of onzin is null. */
function getalOfNull(x) {
  if (x === null || x === undefined || String(x).trim() === '') return null;
  const n = Number(String(x).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
const breedteOk = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const lengteOk = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

/** Een telefoonnummer met landcode: +32 3 123 45 67 of 0032..., als +3231234567; anders ''. */
function telefoon(x) {
  let t = String(x == null ? '' : x).replace(/[\s().\-/]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  return /^\+[1-9]\d{6,14}$/.test(t) ? t : '';
}

/** Een Facebook-pagina-id is een getal. */
function paginaId(x) { const t = String(x == null ? '' : x).trim(); return /^\d{5,20}$/.test(t) ? t : ''; }

/** De dealerinstellingen, gesaneerd. Wat ongeldig is valt weg (en wordt in valideer() gemeld). */
function saneerMeta(o) {
  const r = o && typeof o === 'object' ? o : {};
  const lat = getalOfNull(r.lat), lng = getalOfNull(r.lng);
  return {
    addr1: tekst(r.addr1, 120),
    city: tekst(r.city, 80),
    region: tekst(r.region, 80),
    postalCode: tekst(r.postalCode, 20),
    country: tekst(r.country, 60) || 'Belgium',
    lat: breedteOk(lat) ? lat : null,
    lng: lengteOk(lng) ? lng : null,
    phone: telefoon(r.phone),
    fbPageId: paginaId(r.fbPageId),
  };
}

/** De reden (een kort woord voor ig.err.<reden>) waarom de invoer niet bewaard mag worden, of ''. */
function valideerInvoer(inv) {
  const m = inv && inv.meta;
  if (!m || typeof m !== 'object') return 'ongeldige_gegevens';
  const ingevuld = (x) => x !== null && x !== undefined && String(x).trim() !== '';
  if (ingevuld(m.lat) && !breedteOk(getalOfNull(m.lat))) return 'meta_breedtegraad';
  if (ingevuld(m.lng) && !lengteOk(getalOfNull(m.lng))) return 'meta_lengtegraad';
  if (ingevuld(m.phone) && !telefoon(m.phone)) return 'meta_telefoon';
  if (ingevuld(m.fbPageId) && !paginaId(m.fbPageId)) return 'meta_pagina';
  return '';
}

const meta = {
  id: 'meta',
  label: 'Meta (Facebook/Instagram)',
  status: 'ACTIVE',
  auth: 'catalog_feed',
  uitlegSleutel: 'ig.uitleg.meta',
  /* Publiceerkanaal: nooit een bron, raakt de verkocht-logica niet aan. */
  alleenPubliceren: true,
  kentReservering: false,
  capabilities: { lezen: false, publiceren: true, leads: false },
  velden: ['meta'],
  saneer(o) { return { meta: saneerMeta(o && o.meta) }; },
  valideerInvoer,
  /* Verbonden = de feed kan echt gebouwd worden: adres en coordinaten zijn er. */
  isGeconfigureerd(item) { return Boolean(item) && ontbreekt(item.meta).length === 0; },
  /* Wat de kaart over de dealerinstellingen weet (geen geheimen bestaan hier). */
  kaartExtra(item) {
    const m = item && item.meta ? item.meta : saneerMeta({});
    return { meta: Object.assign({}, m, { bestaat: Boolean(item), ontbreekt: ontbreekt(item ? m : {}) }) };
  },
  async haal() {
    const { maakFout } = require('./fouten');
    throw maakFout('Meta: dit is een publiceerkanaal, geen voorraadbron', 'provider_niet_beschikbaar');
  },
  async health(bron) {
    if (!bron || ontbreekt(bron.meta).length) return { ok: false, toestand: 'niet_geconfigureerd' };
    return { ok: true, toestand: 'ok' };
  },
  normaliseerFout: normaliseer,
};

module.exports = { provider: meta, saneerMeta, valideerInvoer, telefoon, paginaId };
