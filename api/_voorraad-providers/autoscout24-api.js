'use strict';
/*
 * Provider 'autoscout24_api': de eigen advertenties van de dealer, gelezen via
 * de OFFICIELE AutoScout24 Listing Creation API
 * (https://listing-creation.api.autoscout24.com, docs/integrations/autoscout24_api).
 *
 * ── Wie logt waar in? (geverifieerd in de officiele documentatie) ───────────
 * De Basic Auth-gegevens zijn van een DATA PROVIDER -- Helvaro -- en niet van de
 * dealer: "The credentials are per data provider and not per dealer". Ze komen
 * uit AS24_API_USER en AS24_API_PASSWORD op de server en gaan nooit naar een
 * scherm, een bron-record of een log. De dealer doet twee dingen: in
 * AutoScout24 aangeven dat Helvaro namens hem mag werken, en zijn `customerId`
 * aan Helvaro geven. Dat nummer is het enige dat bij de dealer bewaard wordt.
 *
 * Zonder die twee omgevingsvariabelen is Helvaro nog geen data provider bij
 * AutoScout24: de kaart zegt "wacht op activatie", er wordt niets gelezen en
 * er gaat geen enkel verzoek het net op.
 *
 * ── Wat er gelezen wordt ────────────────────────────────────────────────────
 *   GET /customers/{customerId}/listings        -> { listings: [ { id, ... } ] }  (samenvattingen, geen paginering in de spec)
 *   GET /customers/{customerId}/listings/{id}   -> de volledige advertentie
 *   GET /makes en GET /references                -> id -> naam (merk, model, brandstof, ...)
 *   GET /customers                               -> health(): is dit klantnummer door de dealer aan Helvaro toegewezen?
 * De lijst geeft alleen samenvattingen; de details zijn een verzoek per advertentie,
 * rustig (beperkte gelijktijdigheid, uitstel bij 429/5xx) en binnen een tijdsbudget.
 * Is niet elke advertentie gelezen, dan faalt de run: een half gelezen voorraad
 * mag NOOIT wagens op verkocht zetten (zelfde regel als het profiel).
 *
 * De advertentie-id is een guid; hij is het bronId EN het AutoScout-nummer, zodat
 * dezelfde wagen via het openbare profiel (provider 'autoscout24') en via de API
 * een wagen blijft.
 *
 * Geen route: onderstreepje voorop.
 */

const crypto = require('crypto');
const { normaliseer, maakFout } = require('./fouten');
const { basicHeader, haalJson } = require('./http');
const { normVin } = require('./feed');

const BASIS = 'https://listing-creation.api.autoscout24.com';
/* De referentielijsten (merk, brandstof, ...) hangen volgens de documentatie af
   van het marktplaats-land. Helvaro werkt voor Belgische dealers: 'be' en nl-BE.
   Een merk dat daar ontbreekt wordt apart (zonder filter) opgezocht. */
const MARKT = 'be';
const CULTURE = 'nl-BE';
const REFERENTIES = Object.freeze(['FuelCategory', 'Transmission', 'BodyType', 'BodyColor']);
const MAX_ADVERTENTIES = 1500;
const GELIJKTIJDIG = 4;
const PAUZE_MS = 100;
const REFERENTIE_GELDIG_MS = 6 * 60 * 60 * 1000;
/* De spec zegt alleen "string"; elk voorbeeld in de documentatie is numeriek.
   Dit laat letters en streepjes toe maar houdt het veilig als padsegment. */
const KLANTNUMMER = /^[A-Za-z0-9_-]{1,40}$/;

const tekstDeel = (x) => (x == null ? '' : String(x).trim());

/** De gegevens van Helvaro als data provider, of null als die er niet zijn. */
function helvaroGegevens() {
  const u = process.env.AS24_API_USER, p = process.env.AS24_API_PASSWORD;
  return u && p ? { gebruiker: u, wachtwoord: p } : null;
}

function geldigKlantnummer(x) { return KLANTNUMMER.test(tekstDeel(x)); }

/* Wat elk HTTP-antwoord voor de dealer betekent (zie docs: AuthenticationFailed,
   ResourceNotAuthorized, ResourceNotFound). */
function verfijn(status) {
  if (status === 401) return { genormaliseerd: 'AUTH_ERROR', sleutel: 'ig.fout.AS24_AUTH' };
  if (status === 403) return { genormaliseerd: 'PERMISSION_DENIED', sleutel: 'ig.fout.AS24_TOESTEMMING' };
  if (status === 404) return { genormaliseerd: 'INVALID_DATA', sleutel: 'ig.fout.AS24_KLANT' };
  return null;
}

/* ── Referentiegegevens: id -> naam ────────────────────────────────────────── */
let _refs = null, _refsTot = 0;
function _reset() { _refs = null; _refsTot = 0; }

function query(velden) {
  return velden.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

function leesMakes(d, uit) {
  for (const m of (d && Array.isArray(d.makes) ? d.makes : [])) {
    if (!m || m.id == null) continue;
    uit.merken.set(String(m.id), String(m.name || ''));
    for (const mo of (Array.isArray(m.models) ? m.models : [])) if (mo && mo.id != null) uit.modellen.set(String(m.id) + ':' + String(mo.id), String(mo.name || ''));
  }
}

async function laadReferenties(vraag) {
  if (_refs && Date.now() < _refsTot) return _refs;
  const uit = { merken: new Map(), modellen: new Map(), refs: {} };
  const makes = await vraag(BASIS + '/makes?' + query([['marketplace', MARKT], ['culture', CULTURE]]));
  leesMakes(makes, uit);
  const refs = await vraag(BASIS + '/references?' + query(REFERENTIES.map((t) => ['referenceType', t]).concat([['marketplace', MARKT], ['culture', CULTURE]])));
  for (const r of (refs && Array.isArray(refs.references) ? refs.references : [])) {
    if (!r || r.id == null || !r.referenceType) continue;
    (uit.refs[r.referenceType] = uit.refs[r.referenceType] || new Map()).set(String(r.id), String(r.name || ''));
  }
  _refs = uit; _refsTot = Date.now() + REFERENTIE_GELDIG_MS;
  return uit;
}

/* Een merk dat in de lijst van de markt ontbreekt: gericht opvragen (makeId-filter,
   zonder marktfilter). Alleen voor de ontbrekende ids. */
async function vulMerkenAan(vraag, refs, ids) {
  const ontbreekt = ids.filter((id) => !refs.merken.has(String(id)));
  if (!ontbreekt.length) return;
  const d = await vraag(BASIS + '/makes?' + query(ontbreekt.map((id) => ['makeId', id]).concat([['culture', CULTURE]])));
  leesMakes(d, refs);
}

/* ── Een advertentie -> dezelfde vorm als feed.mapRegel() ────────────────────── */

function naam(map, sleutel) {
  const n = map && sleutel != null ? map.get(String(sleutel)) : '';
  return n ? n.toLowerCase() : undefined;
}

/**
 * @param {object} l  de volledige advertentie (Listing in de spec)
 * @param {{merken:Map, modellen:Map, refs:object}} refs
 * @returns {object|null}
 */
function mapAdvertentie(l, refs) {
  if (!l || !l.id) return null;
  const id = String(l.id).trim().toLowerCase().slice(0, 120);
  const prijs = l.prices && l.prices.public && Number(l.prices.public.price);
  const merk = refs.merken.get(String(l.make)) || undefined;
  const modelNaam = refs.modellen.get(String(l.make) + ':' + String(l.model)) || (l.modelName ? String(l.modelName) : undefined);
  const isKm = !l.mileageUnit || String(l.mileageUnit).toLowerCase() === 'km';
  const kw = !l.powerUnit || String(l.powerUnit).toLowerCase() === 'kw';
  const fotos = (Array.isArray(l.images) ? l.images : []).map((i) => i && i.previewUrl).filter((u) => typeof u === 'string' && /^https:\/\/\S{8,500}$/.test(u)).slice(0, 20);
  /* Gepubliceerd (Active) of niet (Inactive) is het enige wat de spec over "te
     koop" zegt. Een niet-gepubliceerde advertentie staat niet op AutoScout24:
     uit aanbod, niet verkocht. Ontbreekt de publicatie, dan telt aanwezig = te koop. */
  const gepubliceerd = !l.publication || !l.publication.status || String(l.publication.status).toLowerCase() === 'active';
  return {
    bronId: id,
    autoscout: id.slice(0, 40),
    merk,
    model: modelNaam,
    uitvoering: l.modelVersion ? String(l.modelVersion).slice(0, 120) : undefined,
    prijs: Number.isFinite(prijs) && prijs > 0 ? prijs : undefined,
    km: isKm && Number.isFinite(Number(l.mileage)) ? Number(l.mileage) : undefined,
    inschrijving: l.firstRegistrationDate ? String(l.firstRegistrationDate).slice(0, 10) : undefined,
    brandstof: naam(refs.refs.FuelCategory, l.fuelCategory),
    transmissie: naam(refs.refs.Transmission, l.transmission),
    kw: kw && Number.isFinite(Number(l.power)) ? Number(l.power) : undefined,
    carrosserie: (refs.refs.BodyType && refs.refs.BodyType.get(String(l.bodyType))) || undefined,
    kleur: l.bodyColorName ? String(l.bodyColorName).slice(0, 60) : ((refs.refs.BodyColor && refs.refs.BodyColor.get(String(l.bodyColor))) || undefined),
    /* De spec heeft geen advertentieadres in Listing: geen link, niet zelf een adres bedenken. */
    fotos,
    status: gepubliceerd ? 'beschikbaar' : 'uit aanbod',
    omschrijving: l.description ? String(l.description).slice(0, 4000) : undefined,
    vin: normVin(l.vin),
  };
}

/* ── Lezen ───────────────────────────────────────────────────────────────── */

async function haalAutoscoutApi(bron, opties = {}) {
  const gegevens = helvaroGegevens();
  if (!gegevens) throw maakFout('AutoScout24 (API): Helvaro is nog geen geactiveerde data provider', 'activatie_vereist');
  const klant = tekstDeel(bron && bron.customerId);
  if (!geldigKlantnummer(klant)) throw maakFout('AutoScout24 (API): geen klantnummer ingesteld', 'geen_klantnummer');

  const eindtijd = Date.now() + (opties.budgetMs || 240000);
  const wacht = opties.wacht || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const kop = { Authorization: basicHeader(gegevens.gebruiker, gegevens.wachtwoord), Accept: 'application/json' };
  const vraag = (url, extra) => haalJson(url, Object.assign({ fetch: opties.fetch, wacht, headers: kop, label: 'AutoScout24', verfijn, eindtijd }, extra || {}));
  const basis = BASIS + '/customers/' + encodeURIComponent(klant) + '/listings';

  const lijst = await vraag(basis);
  if (!lijst || !Array.isArray(lijst.listings)) throw maakFout('AutoScout24: geen advertentielijst in het antwoord', 'bron_onleesbaar');
  const ids = Array.from(new Set(lijst.listings.map((s) => s && s.id).filter(Boolean).map(String)));
  if (ids.length > MAX_ADVERTENTIES) throw maakFout('AutoScout24: meer dan ' + MAX_ADVERTENTIES + ' advertenties', 'voorraad_te_groot');

  if (!ids.length) return { formaat: 'autoscout24_api', voertuigen: [], ongeldig: 0, hash: crypto.createHash('sha256').update('[]').digest('hex').slice(0, 16), totaalBijBron: 0 };
  const refs = await laadReferenties(vraag);
  const details = new Array(ids.length);
  let volgende = 0, weg = 0, gestopt = false;
  async function werker() {
    for (;;) {
      const i = volgende++;
      if (i >= ids.length || gestopt) return;
      if (Date.now() > eindtijd) { gestopt = true; throw maakFout(`tijd op na ${i} van ${ids.length} advertenties -- niets aangepast`, 'bron_onvolledig'); }
      try {
        details[i] = await vraag(basis + '/' + encodeURIComponent(ids[i]));
      } catch (e) {
        /* Tussen de lijst en de details verwijderd: bestaat niet meer, dus ook niet in de voorraad.
           Elke andere fout (ook een 500) betekent NIET dat hij weg is: dan faalt de hele run. */
        if (e && e.http === 404) { weg++; continue; }
        gestopt = true;   // de andere werkers stoppen ook: geen verzoeken meer na een mislukking
        throw e;
      }
      if (PAUZE_MS) await wacht(PAUZE_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(GELIJKTIJDIG, ids.length) }, werker));

  await vulMerkenAan(vraag, refs, Array.from(new Set(details.filter(Boolean).map((d) => d.make).filter((m) => m != null))));

  const gezien = new Set();
  const voertuigen = [];
  let ongeldig = 0;
  for (const d of details) {
    if (!d) continue;
    const m = mapAdvertentie(d, refs);
    if (!m || !m.merk || gezien.has(m.bronId)) { ongeldig++; continue; }
    gezien.add(m.bronId);
    voertuigen.push(m);
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(voertuigen.map((v) => [v.bronId, v.prijs, v.km, v.uitvoering, v.fotos.length, v.status]).sort())).digest('hex').slice(0, 16);
  return { formaat: 'autoscout24_api', voertuigen, ongeldig, hash, totaalBijBron: ids.length - weg };
}

const autoscout24Api = {
  id: 'autoscout24_api',
  label: 'AutoScout24 (API)',
  /* Dynamisch, niet vast: zonder gegevens van Helvaro kan de koppeling niets. */
  get status() { return helvaroGegevens() ? 'BETA' : 'FEED_REQUIRED'; },
  auth: 'customer_id',
  adresSoort: 'klant',
  /* Sleutels voor de kaart (api/_i18n.js). */
  wachtSleutel: 'ig.wacht.autoscout24_api',
  uitlegSleutel: 'ig.uitleg.autoscout24_api',
  kentReservering: false,
  /* Wat Helvaro NU kan: zonder data-provider-gegevens niets. */
  get capabilities() { return { lezen: Boolean(helvaroGegevens()), publiceren: false, leads: false }; },
  /* De velden van deze bron naast de gewone: alleen het klantnummer van de dealer. */
  velden: ['customerId'],
  saneer(o) {
    const id = tekstDeel(o && o.customerId);
    return { customerId: geldigKlantnummer(id) ? id : '' };
  },
  haal: (bron, opties) => haalAutoscoutApi(bron, opties),
  async health(bron, opties = {}) {
    const gegevens = helvaroGegevens();
    if (!gegevens) return { ok: false, toestand: 'wacht_op_activatie' };
    if (!bron || !geldigKlantnummer(bron.customerId)) return { ok: false, toestand: 'niet_geconfigureerd' };
    try {
      const d = await haalJson(BASIS + '/customers', { fetch: opties.fetch, wacht: opties.wacht, headers: { Authorization: basicHeader(gegevens.gebruiker, gegevens.wachtwoord), Accept: 'application/json' }, label: 'AutoScout24', verfijn });
      if (!d || !Array.isArray(d.customers)) return { ok: false, toestand: 'onleesbaar' };
      return d.customers.some((c) => c && String(c.id) === tekstDeel(bron.customerId)) ? { ok: true, toestand: 'ok' } : { ok: false, toestand: 'niet_gemachtigd' };
    } catch (e) {
      return { ok: false, toestand: normaliseer(e).code.toLowerCase() };
    }
  },
  normaliseerFout: normaliseer,
};

module.exports = { provider: autoscout24Api, BASIS, helvaroGegevens, geldigKlantnummer, mapAdvertentie, haalAutoscoutApi, laadReferenties, _reset };
