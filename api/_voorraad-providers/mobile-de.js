'use strict';
/*
 * Provider 'mobile_de': de eigen advertenties van de dealer, gelezen via de
 * OFFICIELE mobile.de Seller API (https://services.mobile.de/docs/seller-api.html,
 * docs/integrations/mobile_de).
 *
 * ── Inloggen (geverifieerd in de officiele documentatie) ────────────────────
 * HTTP Basic Auth met de gegevens van een API-gebruiker. Een dealer die alleen
 * zijn EIGEN account wil koppelen ("Self-Uploading Dealer") heeft geen apart
 * Seller-API-account nodig: hij vraagt de activatie van de Seller API aan via
 * service@team.mobile.de (klantnummer en bedrijfsnaam) en krijgt daarvoor
 * inloggegevens. Die gegevens bewaart Helvaro versleuteld (./credentials.js) en
 * toont ze nooit meer. Het verkoper-id (mobileSellerId) is optioneel: hoort er
 * precies een verkoper bij het account, dan wordt hij uit GET /seller-api/sellers
 * gehaald.
 *
 * ── Wat er gelezen wordt ────────────────────────────────────────────────────
 *   GET /seller-api/sellers                       -> { sellers: [ { mobileSellerId, ... } ] }
 *   GET /seller-api/sellers/{mobileSellerId}/ads  -> { ads: [ ... ] }  alle details in een antwoord
 * Header Accept: application/vnd.de.mobile.api+json (zoals de documentatie vraagt).
 * Paginering staat NIET in de documentatie: het antwoord is de hele lijst.
 *
 * Een advertentie heeft in de documentatie geen adres naar de eigen pagina en
 * geen AutoScout-nummer; koppelen met andere platformen gaat dus alleen via
 * het chassisnummer.
 *
 * Geen route: onderstreepje voorop.
 */

const crypto = require('crypto');
const { normaliseer, maakFout } = require('./fouten');
const credentials = require('./credentials');
const { basicHeader, haalJson } = require('./http');
const { normVin } = require('./feed');

const BASIS = 'https://services.mobile.de';
const ACCEPT = 'application/vnd.de.mobile.api+json';
const VERKOPER = /^[A-Za-z0-9_-]{1,40}$/;

const tekstDeel = (x) => (x == null ? '' : String(x).trim());
function geldigVerkoper(x) { return VERKOPER.test(tekstDeel(x)); }

/* De documentatie: 401 = gegevens niet correct, 403 = onvoldoende rechten,
   404 = een verkoper die niet aan dit account gekoppeld is. */
function verfijn(status) {
  if (status === 404) return { genormaliseerd: 'PERMISSION_DENIED', sleutel: 'ig.fout.PERMISSION_DENIED' };
  return null;
}

/* Waarden uit de referentiegegevens van mobile.de (/refdata/fuels, /refdata/gearboxes)
   zoals ze in de documentatie voorkomen. Een onbekende waarde blijft leeg: niet raden. */
const BRANDSTOF = Object.freeze({
  PETROL: 'benzine', DIESEL: 'diesel', ELECTRICITY: 'elektrisch', HYBRID: 'hybride', HYBRID_DIESEL: 'hybride (diesel)',
  LPG: 'lpg', CNG: 'cng', HYDROGENIUM: 'waterstof', ETHANOL: 'ethanol',
});
const TRANSMISSIE = Object.freeze({ MANUAL_GEAR: 'manueel', AUTOMATIC_GEAR: 'automatisch', SEMIAUTOMATIC_GEAR: 'halfautomatisch' });

function getal(x) { return x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? undefined : Number(x); }

/** "201002" (yyyyMM) -> "2010-02". Alles anders blijft leeg. */
function maandJaar(x) {
  const m = /^(\d{4})(\d{2})$/.exec(tekstDeel(x));
  return m ? m[1] + '-' + m[2] : undefined;
}

/**
 * @param {object} a  een advertentie (Ad in de documentatie)
 * @returns {object|null} dezelfde vorm als feed.mapRegel()
 */
function mapAdvertentie(a) {
  if (!a || a.mobileAdId == null || tekstDeel(a.mobileAdId) === '') return null;
  const prijs = a.price && Number(a.price.consumerPriceGross);
  const fotos = (Array.isArray(a.images) ? a.images : []).map((i) => i && i.ref).filter((u) => typeof u === 'string' && /^https:\/\/\S{8,500}$/.test(u)).slice(0, 20);
  const kleur = a.manufacturerColorName || a.exteriorColor;
  return {
    bronId: tekstDeel(a.mobileAdId).slice(0, 120),
    merk: a.make ? String(a.make) : undefined,
    model: a.model ? String(a.model) : undefined,
    uitvoering: a.modelDescription ? String(a.modelDescription).slice(0, 120) : undefined,
    prijs: Number.isFinite(prijs) && prijs > 0 ? prijs : undefined,
    km: getal(a.mileage),
    inschrijving: maandJaar(a.firstRegistration),
    brandstof: BRANDSTOF[a.fuel],
    transmissie: TRANSMISSIE[a.gearbox],
    kw: getal(a.power),
    carrosserie: a.category ? String(a.category) : undefined,
    kleur: kleur ? String(kleur).slice(0, 60) : undefined,
    fotos,
    /* `reserved` is in de documentatie een Boolean "visible only for owner": met de
       eigen gegevens van de dealer dus leesbaar. Alleen "gereserveerd" is zeker. */
    status: a.reserved === true ? 'gereserveerd' : 'beschikbaar',
    omschrijving: a.description ? String(a.description).slice(0, 4000) : undefined,
    vin: normVin(a.vin),
  };
}

function eigenGegevens(bron) {
  const g = bron && bron.credentials ? credentials.ontsleutel(bron.credentials) : null;
  if (!g || !g.username || !g.password) throw maakFout('mobile.de: geen inloggegevens ingesteld', 'geen_credentials');
  return g;
}

const kopVoor = (g) => ({ Authorization: basicHeader(g.username, g.password), Accept: ACCEPT });

/** Het verkoper-id: dat van de dealer, of de enige verkoper van het account. */
async function bepaalVerkoper(bron, vraag) {
  if (geldigVerkoper(bron.mobileSellerId)) return tekstDeel(bron.mobileSellerId);
  const d = await vraag(BASIS + '/seller-api/sellers');
  const sellers = d && Array.isArray(d.sellers) ? d.sellers : null;
  if (!sellers) throw maakFout('mobile.de: geen verkopers in het antwoord', 'bron_onleesbaar');
  if (sellers.length === 0) throw maakFout('mobile.de: geen verkopers bij dit account', 'geen_verkoper');
  if (sellers.length > 1) throw maakFout('mobile.de: meerdere verkopers bij dit account; verkoper-id nodig', 'meerdere_verkopers');
  const id = tekstDeel(sellers[0] && sellers[0].mobileSellerId);
  if (!geldigVerkoper(id)) throw maakFout('mobile.de: verkoper zonder id', 'bron_onleesbaar');
  return id;
}

async function haalMobileDe(bron, opties = {}) {
  const g = eigenGegevens(bron);
  const eindtijd = Date.now() + (opties.budgetMs || 240000);
  const vraag = (url) => haalJson(url, { fetch: opties.fetch, wacht: opties.wacht, headers: kopVoor(g), label: 'mobile.de', verfijn, eindtijd, timeoutMs: 30000 });
  const verkoper = await bepaalVerkoper(bron || {}, vraag);
  const d = await vraag(BASIS + '/seller-api/sellers/' + encodeURIComponent(verkoper) + '/ads');
  if (!d || !Array.isArray(d.ads)) throw maakFout('mobile.de: geen advertentielijst in het antwoord', 'bron_onleesbaar');
  const gezien = new Set();
  const voertuigen = [];
  let ongeldig = 0;
  for (const a of d.ads) {
    const m = mapAdvertentie(a);
    if (!m || !m.merk || gezien.has(m.bronId)) { ongeldig++; continue; }
    gezien.add(m.bronId);
    voertuigen.push(m);
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(voertuigen.map((v) => [v.bronId, v.prijs, v.km, v.uitvoering, v.fotos.length, v.status]).sort())).digest('hex').slice(0, 16);
  return { formaat: 'mobile_de', voertuigen, ongeldig, hash, totaalBijBron: d.ads.length, verkoper };
}

const mobileDe = {
  id: 'mobile_de',
  label: 'mobile.de',
  status: 'ACTIVE',
  auth: 'basic',
  adresSoort: 'verkoper',
  uitlegSleutel: 'ig.uitleg.mobile_de',
  /* Een reservering die de dealer in Helvaro zet blijft staan; zet hij hem op
     mobile.de, dan komt hij binnen. */
  kentReservering: false,
  capabilities: { lezen: true, publiceren: false, leads: false },
  velden: ['mobileSellerId'],
  saneer(o) {
    const id = tekstDeel(o && o.mobileSellerId);
    return { mobileSellerId: geldigVerkoper(id) ? id : '' };
  },
  haal: (bron, opties) => haalMobileDe(bron, opties),
  async health(bron, opties = {}) {
    if (!bron || !bron.credentials) return { ok: false, toestand: 'niet_geconfigureerd' };
    let g;
    try { g = eigenGegevens(bron); } catch (_) { return { ok: false, toestand: 'niet_geconfigureerd' }; }
    try {
      const d = await haalJson(BASIS + '/seller-api/sellers', { fetch: opties.fetch, wacht: opties.wacht, headers: kopVoor(g), label: 'mobile.de', verfijn });
      return d && Array.isArray(d.sellers) ? { ok: true, toestand: 'ok' } : { ok: false, toestand: 'onleesbaar' };
    } catch (e) {
      return { ok: false, toestand: normaliseer(e).code.toLowerCase() };
    }
  },
  normaliseerFout: normaliseer,
};

module.exports = { provider: mobileDe, BASIS, ACCEPT, mapAdvertentie, haalMobileDe, geldigVerkoper };
