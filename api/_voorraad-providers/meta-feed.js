'use strict';
/*
 * De automotive-catalogusfeed voor Meta (Facebook/Instagram), als CSV.
 *
 * Meta haalt de feed zelf op een vast tijdstip op, vanaf een adres dat de dealer
 * in Commerce Manager invult (Catalogus type Voertuigen -> Gegevensbronnen ->
 * Gegevensfeed -> Geplande feed). Helvaro serveert die feed uit de voorraad die
 * er al is: GET /api/inventory/CODE/meta.csv (zie api/_voorraad-publiek.js).
 *
 * Bron van de velden: Meta, "Automotive inventory ads -- supported fields --
 * Vehicle" en "Dealership". Dit bestand verzint geen veld: alles wat Helvaro
 * niet weet (aandrijving, interieurkleur, eerste dag op de lot) blijft weg.
 *
 * ── Wat een voertuig in de feed brengt ──────────────────────────────────────
 * Alleen wagens die publiek zijn (Public aan), niet gearchiveerd, en nog niet
 * verkocht of uit aanbod. Beschikbaar -> availability "available",
 * gereserveerd -> "not_available" (Meta toont die niet in advertenties maar de
 * wagen blijft in de catalogus). Verkocht en uit aanbod staan er NIET in: dan
 * verdwijnt de wagen uit de catalogus, zoals het hoort.
 *
 * Een wagen waarvan een VERPLICHT veld ontbreekt (foto, prijs, jaar, merk,
 * model, kilometerstand, kleur, adres) gaat er niet in: Meta zou hem toch
 * afkeuren. De telling met reden gaat naar de integratiekaart.
 *
 * Wat nooit in de feed komt: kortingsgrenzen, bron, bron-ID, notities.
 *
 * Geen route: onderstreepje voorop.
 */

/* Lazy: het register (./index.js) laadt dit bestand al bij het opstarten. */
const _vehicles = { normStatus: (s) => require('../_vehicles').normStatus(s) };

const APP = 'https://app.helvaro.pro';
const MAX_FOTOS = 20;

/* ── Waarden naar de enums van Meta ──────────────────────────────────────── */

const plat = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Brandstof (NL/EN door elkaar) -> DIESEL, ELECTRIC, FLEX, GASOLINE, HYBRID, OTHER. */
function brandstofNaarMeta(x) {
  const t = plat(x);
  if (!t) return 'OTHER';
  const hybride = /hybrid|hybride|phev|plug-?in/.test(t);
  const benzine = /benzine|gasoline|petrol|essence|super/.test(t);
  const elektrisch = /elektr|electr|\bev\b|\bbev\b/.test(t);
  if (hybride || (benzine && elektrisch) || (/diesel/.test(t) && elektrisch)) return 'HYBRID';
  if (elektrisch) return 'ELECTRIC';
  if (/diesel/.test(t)) return 'DIESEL';
  if (benzine) return 'GASOLINE';
  if (/flex/.test(t)) return 'FLEX';
  return 'OTHER';
}

/** Transmissie -> Automatic | Manual; onbekend = null (veld blijft leeg, geen verzonnen waarde). */
function transmissieNaarMeta(x) {
  const t = plat(x);
  if (!t) return null;
  if (/automa|automatic|dsg|tiptronic|cvt|s-?tronic|halfautomaat|semi/.test(t)) return 'Automatic';
  if (/hand|manu|schakel|mechanisch/.test(t)) return 'Manual';
  return null;
}

/** Carrosserie (NL/EN door elkaar) -> enum van Meta, OTHER als terugval. */
function carrosserieNaarMeta(x) {
  const t = plat(x);
  if (!t) return 'OTHER';
  if (/crossover/.test(t)) return 'CROSSOVER';
  if (/suv|terrein|4x4|geländewagen/.test(t)) return 'SUV';
  if (/cabrio|convertible|roadster|spider/.test(t)) return 'CONVERTIBLE';
  if (/coupe/.test(t)) return 'COUPE';
  if (/break|station|wagon|touring|estate|combi/.test(t)) return 'WAGON';
  if (/monovolume|minivan|mpv|\bmono\b/.test(t)) return 'MINIVAN';
  if (/berline|sedan|limousine|saloon/.test(t)) return 'SEDAN';
  if (/stadswagen|kleine wagen|small car|city ?car|citadine|micro/.test(t)) return 'SMALL_CAR';
  if (/hatchback|compact|schuin/.test(t)) return 'HATCHBACK';
  if (/pick-?up|truck/.test(t)) return 'TRUCK';
  if (/bestel|\bvan\b|bedrijfs|lichte vracht|utilitair/.test(t)) return 'VAN';
  return 'OTHER';
}

/* ── Velden schoonmaken ──────────────────────────────────────────────────── */

const een = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * De omschrijving voor Meta: max 5000 tekens, geen links, geen woorden in
 * hoofdletters. Staat er niets bruikbaars, dan een zin uit de echte gegevens.
 */
function omschrijving(v, titel) {
  let t = een(v.omschrijving)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b[\w.-]+@[\w-]+\.\w{2,}\b/g, '')
    .replace(/\s+/g, ' ').trim();
  /* Een tekst die grotendeels in hoofdletters staat: zinsvorm. */
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const hoofd = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (letters.length >= 8 && hoofd / letters.length > 0.5) {
    t = t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }
  if (!t) {
    const stuk = [titel, Number.isFinite(v.km) ? v.km + ' km' : '', v.brandstof, v.transmissie, v.kleur].map(een).filter(Boolean);
    t = stuk.join(', ');
  }
  return t.slice(0, 5000);
}

function jaarUit(inschrijving) {
  const m = /(19|20)\d{2}/.exec(String(inschrijving || ''));
  return m ? Number(m[0]) : null;
}

/** "18000 EUR": bedrag, spatie, ISO-valuta. */
function prijsTekst(p) {
  if (!Number.isFinite(p) || p <= 0) return '';
  return (Number.isInteger(p) ? String(p) : p.toFixed(2)) + ' EUR';
}

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
function vinOfLeeg(x) { const v = String(x || '').trim().toUpperCase(); return VIN.test(v) ? v : ''; }

/** De pagina van de wagen: zijn eigen advertentielink, anders de aanvraagpagina van Helvaro (toont de wagen). */
function paginaUrl(v, code) {
  const link = String(v.link || '').trim();
  if (/^https:\/\/[^\s"<>]{4,480}$/i.test(link)) return link;
  if (!v.code || !code) return '';
  return APP + '/start/' + encodeURIComponent(code) + '/' + encodeURIComponent(v.code);
}

/* ── De dealer ───────────────────────────────────────────────────────────── */

/** Wat er voor een volledige feed nog van de dealer ontbreekt (namen van de velden in de kaart). */
function ontbreekt(meta) {
  const m = meta || {};
  const uit = [];
  if (!m.addr1) uit.push('addr1');
  if (!m.city) uit.push('city');
  if (!m.region) uit.push('region');
  if (!m.postalCode) uit.push('postalCode');
  if (!Number.isFinite(m.lat)) uit.push('lat');
  if (!Number.isFinite(m.lng)) uit.push('lng');
  return uit;
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** Een veld: tussen aanhalingstekens bij spatie, komma, aanhalingsteken of regeleinde; aanhalingstekens verdubbeld. */
function csvVeld(w) {
  const s = w == null ? '' : String(w);
  return /[\s,"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Een wagen -> een rij, of de reden waarom hij er niet in kan. */
function maakRij(v, ctx) {
  const status = _vehicles.normStatus(v.status);
  const jaar = jaarUit(v.inschrijving);
  const fotos = (Array.isArray(v.fotos) ? v.fotos : []).filter((u) => /^https:\/\/\S{4,}$/i.test(u)).slice(0, MAX_FOTOS);
  const merk = een(v.merk), model = een(v.model);
  const prijs = prijsTekst(v.prijs);
  const url = paginaUrl(v, ctx.code);
  const km = Number.isFinite(v.km) && v.km >= 0 ? Math.round(v.km) : null;
  const kleur = een(v.kleur);
  /* De volgorde is de volgorde van "wat de dealer het eerst moet doen". */
  if (!fotos.length) return { reden: 'foto' };
  if (!prijs) return { reden: 'prijs' };
  if (!jaar) return { reden: 'jaar' };
  if (!merk) return { reden: 'merk' };
  if (!model) return { reden: 'model' };
  if (km === null) return { reden: 'km' };
  if (!kleur) return { reden: 'kleur' };
  if (!url) return { reden: 'url' };
  const trim = een(v.uitvoering).slice(0, 50);
  const titel = [jaar, merk, model, trim].filter(Boolean).join(' ').slice(0, 500);
  const rij = {
    vehicle_id: String(v.code).slice(0, 100),
    title: titel,
    description: omschrijving(v, titel),
    url,
    make: merk,
    model,
    year: jaar,
    'mileage.value': km,
    'mileage.unit': 'KM',
    body_style: carrosserieNaarMeta(v.carrosserie),
    price: prijs,
    exterior_color: kleur,
    /* Helvaro kent geen "nieuw of tweedehands": 0 km is nieuw (zo vraagt Meta het ook), de rest tweedehands. */
    state_of_vehicle: km === 0 ? 'New' : 'Used',
    vin: vinOfLeeg(v.vin),
    transmission: transmissieNaarMeta(v.transmissie) || '',
    fuel_type: brandstofNaarMeta(v.brandstof),
    trim,
    availability: status === 'beschikbaar' ? 'available' : 'not_available',
    status: 'active',
    stock_number: String(v.code).slice(0, 100),
  };
  fotos.forEach((u, i) => { rij['image[' + i + '].url'] = u; });
  return { rij, aantalFotos: fotos.length };
}

/**
 * De hele feed.
 * @param {object[]} voertuigen  uit api/_vehicles.js (kan ook gearchiveerde bevatten)
 * @param {{code:string, clientName:string, meta:object}} ctx
 * @returns {{csv:string, inFeed:number, weggelaten:number, redenen:object, gereserveerd:number}}
 */
function bouw(voertuigen, ctx) {
  const meta = (ctx && ctx.meta) || {};
  const rijen = [];
  const redenen = {};
  let weggelaten = 0, gereserveerd = 0, maxFotos = 1;
  for (const v of (voertuigen || [])) {
    if (!v || v.gearchiveerd || v.publiek === false) continue;
    const s = _vehicles.normStatus(v.status);
    if (s !== 'beschikbaar' && s !== 'gereserveerd') continue;
    const r = maakRij(v, ctx);
    if (r.reden) { weggelaten++; redenen[r.reden] = (redenen[r.reden] || 0) + 1; continue; }
    if (s === 'gereserveerd') gereserveerd++;
    maxFotos = Math.max(maxFotos, r.aantalFotos);
    rijen.push(r.rij);
  }
  const kolommen = ['vehicle_id', 'title', 'description', 'url', 'make', 'model', 'year', 'mileage.value', 'mileage.unit'];
  for (let i = 0; i < maxFotos; i++) kolommen.push('image[' + i + '].url');
  kolommen.push('body_style', 'price', 'exterior_color', 'state_of_vehicle', 'vin', 'transmission', 'fuel_type', 'trim', 'availability', 'status', 'stock_number', 'dealer_name', 'dealer_id');
  if (meta.phone) kolommen.push('dealer_phone');
  if (meta.fbPageId) kolommen.push('fb_page_id');
  /* Het adres als aparte kolommen (address.addr1, ...), nooit ook nog als een samengestelde kolom address. */
  kolommen.push('address.addr1', 'address.city', 'address.region', 'address.country', 'address.postal_code', 'latitude', 'longitude');
  const dealer = {
    dealer_name: een(ctx && ctx.clientName), dealer_id: String((ctx && ctx.code) || ''),
    dealer_phone: meta.phone || '', fb_page_id: meta.fbPageId || '',
    'address.addr1': meta.addr1 || '', 'address.city': meta.city || '', 'address.region': meta.region || '',
    'address.country': meta.country || 'Belgium', 'address.postal_code': meta.postalCode || '',
    latitude: Number.isFinite(meta.lat) ? meta.lat : '', longitude: Number.isFinite(meta.lng) ? meta.lng : '',
  };
  const regels = [kolommen.map(csvVeld).join(',')];
  for (const rij of rijen) {
    const vol = Object.assign({}, rij, dealer);
    regels.push(kolommen.map((k) => csvVeld(vol[k])).join(','));
  }
  return { csv: regels.join('\r\n') + '\r\n', inFeed: rijen.length, weggelaten, redenen, gereserveerd };
}

/** Het adres van de feed zoals de dealer het in Commerce Manager plakt. */
function feedUrl(code) { return APP + '/api/inventory/' + encodeURIComponent(code) + '/meta.csv'; }

module.exports = { bouw, ontbreekt, feedUrl, csvVeld, brandstofNaarMeta, transmissieNaarMeta, carrosserieNaarMeta, omschrijving, prijsTekst, vinOfLeeg, paginaUrl, MAX_FOTOS };
