'use strict';
/*
 * Voorraadsync — een bronlijst naast de Helvaro-voorraad leggen, en alleen
 * de verschillen toepassen.
 *
 * ── Wat dit is en wat niet ──────────────────────────────────────────────────
 * api/_inventaris.js is de dirigent: slot, toestand, versheid, de bron
 * ophalen. Dit bestand is het vergelijken en het schrijven. Die splitsing is
 * niet cosmetisch: verzoen() hieronder is een PURE functie -- bronlijst en
 * huidige voorraad erin, een plan eruit, zonder netwerk. Daardoor zijn de
 * scenario's die er echt toe doen (dubbel draaien, prijswijziging, verkocht,
 * een bron die half leeg terugkomt) te testen zonder een nep-Airtable per
 * geval. Zie tests/voorraad-sync.test.js.
 *
 * ── De regels, in volgorde van hoe erg het is als ze breken ────────────────
 *   1. Een tijdelijk falende bron raakt NIETS aan. Dat is al zo voordat dit
 *      bestand aan de beurt komt: ophalen, parsen of een lege feed gooit een
 *      fout in _inventaris.js, en dan wordt hier nooit iets gevraagd.
 *   2. Een bron die WEL antwoordt maar opvallend veel minder wagens bevat dan
 *      de vorige keer (een afgekapte export, een filter dat aanbleef) mag geen
 *      halve voorraad op verkocht zetten. Dat is de dalingswacht hieronder.
 *   3. Geen dubbele wagens. Identiteit is tenant + bron + Source Record ID. Een
 *      wagen die de dealer eerst met de hand invoerde en die daarna in de feed
 *      opduikt wordt OVERGENOMEN (herkend op AutoScout-nummer of advertentie-
 *      link), niet een tweede keer aangemaakt.
 *   4. Niets verzinnen en niets wissen. Een veld dat de bron niet levert, laten
 *      we staan zoals het is -- ook als het leeg is.
 *   5. Verkocht is niet actief, en verkocht wordt pas na 14 dagen gearchiveerd.
 *      Nooit verwijderd: aan een wagen hangen leads, gesprekken en afspraken.
 *
 * ── Meerdere bronnen (2026-10-05) ───────────────────────────────────────────
 * verzoenAlles() doet dit voor alle bronnen van een dealer tegelijk; verzoen()
 * is de enkele-bron-vorm en roept hem aan. Wat erbij kwam, in volgorde van
 * hoe erg het is als het breekt:
 *   6. Verkocht = elke bron die de wagen toonde slaagde in deze run en toont
 *      hem niet meer. Een mislukte bron is ONBEKEND, nooit "leeg".
 *   7. Dezelfde wagen op twee platformen koppelt alleen op een EXACTE sleutel
 *      (AutoScout-nummer, genormaliseerde link, chassisnummer). Nooit op
 *      merk, model of prijs.
 *   8. Een advertentie (api/_listings.js) die ouder is dan de wagen waar hij
 *      naar wijst, hoort bij een eerdere wagen met dezelfde code en telt niet.
 *
 * ── SOLD en ARCHIVED, in dit datamodel ─────────────────────────────────────
 *   SOLD      Status = 'verkocht', Archived = false, Sold At gezet.
 *             Telt niet als voorraad, boekt geen proefrit, mag op de website
 *             met een VERKOCHT-badge blijven staan.
 *   ARCHIVED  Archived = true. De status blijft 'verkocht' staan: de
 *             geschiedenis klopt, en de rij bestaat nog voor wie er later naar
 *             een oude lead kijkt.
 *
 * Geen route: onderstreepje voorop.
 */

const vehicles = require('./_vehicles');

const BEWAAR_DAGEN = 14;
const DAG_MS = 24 * 60 * 60 * 1000;
const GEZIEN_VERS_MS = DAG_MS;     // Last Seen At van een advertentie: hoogstens dagelijks verversen

/* Dalingswacht. Pas ingrijpen als er ZOWEL veel wagens tegelijk verdwijnen als
   het een groot deel is van wat er uit de bron actief stond. Alleen het tweede
   zou een kleine dealer die twee van zijn drie wagens verkoopt blokkeren;
   alleen het eerste een grote dealer die een drukke week heeft. */
const DALING_MIN = 5;
const DALING_AANDEEL = 0.5;

/* Hoeveel losse voertuiggebeurtenissen één sync in het activiteitenlogboek
   mag zetten. Een eerste import van tweehonderd wagens hoort daar als één
   regel te staan ("200 aangemaakt"), niet als tweehonderd. */
const MAX_GEBEURTENISSEN = 25;

/* Wat we vergelijken. Alleen velden die de bron zelf aanlevert tellen mee --
   zie gelijk() en regel 4 hierboven. */
const VERGELIJK = Object.freeze([
  'merk', 'model', 'uitvoering', 'prijs', 'km', 'inschrijving', 'brandstof',
  'transmissie', 'kw', 'carrosserie', 'kleur', 'link', 'omschrijving', 'fotos', 'status',
]);

const MODI = Object.freeze(['verkocht', 'uit_aanbod', 'negeren']);

/* ── Kleine hulpjes ──────────────────────────────────────────────────────── */

function normWaarde(x) {
  if (Array.isArray(x)) return x.map((s) => String(s).trim()).filter(Boolean).join('\n');
  if (x === null || x === undefined) return '';
  if (typeof x === 'number') return String(x);
  return String(x).trim().toLowerCase();
}

/** Zelfde waarde, ongeacht hoofdletters, witruimte of getal-als-tekst. */
function gelijk(bron, helvaro) {
  return normWaarde(bron) === normWaarde(helvaro);
}

/* Een advertentielink als identiteit: host in kleine letters, zonder query,
   hash of slash op het eind. Twee keer dezelfde advertentie met een ander
   trackingparametertje erachter is dezelfde wagen. */
function linkSleutel(url) {
  const t = String(url || '').trim();
  if (!/^https?:\/\//i.test(t)) return '';
  try {
    const u = new URL(t);
    return (u.hostname.toLowerCase() + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return ''; }
}

function autoscoutUit(v) {
  if (v && v.autoscout) return String(v.autoscout).trim().toLowerCase();
  try {
    const id = require('./_autoscout').aanbodIdUit(v && v.link);
    return id ? String(id).trim().toLowerCase() : '';
  } catch { return ''; }
}

function isActief(v) {
  if (!v || v.gearchiveerd) return false;
  const s = vehicles.normStatus(v.status);
  return s !== 'verkocht' && s !== 'uit aanbod';
}

/* ── verzoen(): het plan, zonder netwerk ─────────────────────────────────── */

/* Een voorraadnummer is hetzelfde nummer, ook als de feed er morgen
   hoofdletters van maakt ("ab-123" -> "AB-123"). Hoofdlettergevoelig
   vergelijken maakte daar een nieuwe wagen van en markeerde de oude als
   verkocht. Opgeslagen wordt wat de bron stuurt; alleen het vergelijken is
   ongevoelig. */
function bronSleutel(id) { return String(id == null ? '' : id).trim().toLowerCase(); }

/* ── Bron-ID's: wiens id is dit? ─────────────────────────────────────────────
 * Een wagen onthoudt in Source Record ID uit welke bron hij kwam. Dat veld
 * bestond al voor er meerdere bronnen waren en bevat voor elke bestaande
 * dealer het kale id van de ENE bron ("de oude bron", legacyProvider). Een
 * tweede platform krijgt het voorvoegsel "<provider>:" -- zodat twee platformen
 * die allebei voorraadnummer 1234 gebruiken nooit dezelfde wagen lijken.
 * Dit is de terugval als de advertentietabel (api/_listings.js) er niet is of
 * een schrijfactie mislukte: de identiteit staat dan nog op de wagen zelf. */
function bronIdVoor(provider, externalId, legacyProvider) {
  const id = String(externalId == null ? '' : externalId).trim();
  return provider === legacyProvider ? id : provider + ':' + id;
}

function splitsBronId(bronId, legacyProvider, bekend) {
  const s = String(bronId == null ? '' : bronId).trim();
  const ids = (bekend || []).slice().sort((a, b) => b.length - a.length);
  for (const p of ids) {
    if (p !== legacyProvider && s.toLowerCase().indexOf(p + ':') === 0) return { provider: p, externalId: s.slice(p.length + 1) };
  }
  return { provider: legacyProvider, externalId: s };
}

const lkSleutel = (provider, id) => provider + '|' + bronSleutel(id);

/* Een chassisnummer als sleutel; ongeldig of leeg telt nooit mee. */
/* Kenmerken als laatste herkenning tussen platformen, voor bronnen zonder
   chassisnummer of AutoScout-nummer (exports van partners, uploads): zelfde merk,
   model, EXACTE kilometerstand en eerste inschrijving (maand/jaar). Een exacte
   kilometerstand is per wagen bijna uniek; zonder km of datum geen sleutel, en
   alleen bij precies een kandidaat (zie kandidaat()). */
function kenmerkSleutel(v) {
  if (!v) return '';
  const km = Number(v.km);
  if (!Number.isFinite(km) || km <= 0) return '';
  const merk = String(v.merk || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const model = String(v.model || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const d = String(v.inschrijving || '').match(/(\d{1,2})\D+(\d{4})|(\d{4})\D+(\d{1,2})/);
  if (!merk || !model || !d) return '';
  const maand = Number(d[1] || d[4]), jaar = Number(d[2] || d[3]);
  if (!(maand >= 1 && maand <= 12) || !(jaar > 1950 && jaar < 2100)) return '';
  return [merk, model, Math.round(km), jaar, maand].join('|');
}

function vinSleutel(x) {
  const v = String(x == null ? '' : x).trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : '';
}

/**
 * Het plan voor ALLE bronnen van een dealer tegelijk. Pure functie: geen
 * netwerk, geen klok (opties.nu).
 *
 * @param {object[]} bestaand  alle voertuigen van deze dealer, INCLUSIEF gearchiveerde
 * @param {object[]} listings  bestaande advertenties (api/_listings.js vanRecord); mag leeg
 * @param {object[]} bronnen   per bron, in volgorde van belang:
 *     { provider, verdwenen:'verkocht'|'uit_aanbod'|'negeren', kentReservering,
 *       voertuigen: object[] | null }   null = deze bron is niet geslaagd of
 *                                       niet gedraaid: ONBEKEND, nooit "leeg"
 * @param {object} opties
 *     nu, bevestigDaling,
 *     legacyProvider      wiens id een kaal Source Record ID is (standaard: de eerste bron)
 *     geconfigureerd      alle providers die de dealer nog heeft; advertenties van
 *                         een provider die er niet meer tussen staat tellen niet mee
 *     dalingMin           vanaf hoeveel verdwenen wagens de dalingswacht geldt (standaard DALING_MIN)
     codesToewijzen      geef nieuwe wagens meteen hun Helvaro-code (nodig om er
 *                         advertenties aan te hangen); zonder dit doet pasToe het
 * @returns {{nieuw, bijwerken, weg, ongewijzigd, geadopteerd, verdwenenAantal,
 *            dalingGeblokkeerd, gebeurtenissen, listings, perBron, dubbelGemeld}}
 *
 * ── De regels (zie ook de kop van dit bestand) ──────────────────────────────
 *   - Welke wagen is dit? Eerst de advertentie zelf (platform + id), dan de
 *     oude Source Record ID, dan EXACT: AutoScout-nummer, genormaliseerde link,
 *     chassisnummer. Nooit op merk, model of prijs. Geen treffer = nieuwe wagen.
 *   - De eerste bron (in volgorde) die een wagen toont bepaalt zijn velden. De
 *     andere koppelen alleen hun advertentie eraan.
 *   - Verkocht wordt een wagen alleen als ELKE bron die hem toonde geslaagd is
 *     in deze run en hem niet meer toont. Een mislukte bron is onbekend: geen
 *     statuswijziging, nooit.
 */
function verzoenAlles(bestaand, listings, bronnen, opties = {}) {
  const nu = opties.nu || new Date().toISOString();
  const legacy = opties.legacyProvider || (bronnen[0] && bronnen[0].provider) || 'feed';
  const bekend = Array.from(new Set((opties.geconfigureerd || bronnen.map((b) => b.provider)).concat([legacy])));
  const geconfigureerd = new Set(opties.geconfigureerd || bronnen.map((b) => b.provider));
  /* Kopieen: het plan beschrijft wat er moet gebeuren, en raakt de lijst van de aanroeper niet aan. */
  const werk = (bestaand || []).map((v) => Object.assign({}, v));
  const codes = werk.map((v) => v.code);

  /* ── Wat al bekend is ──────────────────────────────────────────────────── */
  const lk = new Map();                 // provider|id -> advertentie
  for (const l of listings || []) {
    if (l && l.provider && l.externalId) lk.set(lkSleutel(l.provider, l.externalId), Object.assign({}, l));
  }
  const byCode = new Map(werk.map((v) => [v.code, v]));
  /* Een advertentie die ouder is dan de wagen waar hij naar wijst, hoort bij
     een EERDERE wagen met dezelfde code (verwijderd, of nooit aangemaakt omdat
     een schrijfactie mislukte; een code wordt hergebruikt). Zo'n rij mag nooit
     een andere wagen aanwijzen. Hij wordt niet vertrouwd en bij de volgende
     schrijfactie opnieuw gekoppeld. */
  const staleRijen = new Map();
  for (const [k, l] of Array.from(lk.entries())) {
    const v = byCode.get(l.vehicleCode);
    const tl = Date.parse(l.aangemaakt || ''), tv = Date.parse((v && v.aangemaakt) || '');
    if (v && Number.isFinite(tl) && Number.isFinite(tv) && tl < tv) { staleRijen.set(k, l); lk.delete(k); }
  }
  for (const v of werk) {
    if (v.bron !== 'feed' || !v.bronId) continue;
    const s = splitsBronId(v.bronId, legacy, bekend);
    const k = lkSleutel(s.provider, s.externalId);
    /* Een wagen die zijn bron onthoudt maar nog geen advertentierij heeft
       (van voor deze tabel, of een mislukte schrijfactie): een voorlopige. */
    if (!lk.has(k)) lk.set(k, { provider: s.provider, externalId: s.externalId, vehicleCode: v.code, status: 'ACTIVE', url: v.link || '', gezien: '', voorlopig: true });
  }

  const houdersVan = (code) => Array.from(lk.values()).filter((l) => l.vehicleCode === code && l.status !== 'REMOVED');
  const heeftActief = (code, provider) => houdersVan(code).some((l) => l.provider === provider);

  const perAutoscout = new Map(), perLink = new Map(), perVin = new Map(), perKenmerk = new Map();
  const indexeer = (v) => {
    const as = autoscoutUit(v);
    if (as && !perAutoscout.has(as)) perAutoscout.set(as, v);
    const lnk = linkSleutel(v.link);
    if (lnk && !perLink.has(lnk)) perLink.set(lnk, v);
    const vin = vinSleutel(v.vin);
    if (vin) { if (!perVin.has(vin)) perVin.set(vin, []); perVin.get(vin).push(v); }
    const km = kenmerkSleutel(v);
    if (km) { if (!perKenmerk.has(km)) perKenmerk.set(km, []); if (perKenmerk.get(km).indexOf(v) === -1) perKenmerk.get(km).push(v); }
  };
  for (const v of werk) indexeer(v);
  /* Een bron die een AutoScout-nummer of chassisnummer levert dat de wagen nog
     niet had: onthoud het voor de volgende bron in DEZE run, anders herkent het
     tweede platform de wagen pas bij de run daarna. */
  const verrijk = (v, f) => {
    let nieuw = false;
    if (f.autoscout && !v.autoscout) { v.autoscout = String(f.autoscout).trim().toLowerCase(); nieuw = true; }
    const vin = vinSleutel(f.vin);
    if (vin && !v.vin) { v.vin = vin; nieuw = true; }
    if (nieuw) indexeer(v);
  };
  const plan = {
    nieuw: [], bijwerken: [], weg: [],
    ongewijzigd: 0, geadopteerd: 0,
    verdwenenAantal: 0, dalingGeblokkeerd: false,
    gebeurtenissen: [], listings: [], perBron: {}, dubbelGemeld: 0,
  };
  const gebeurtenis = (soort, v, extra) => {
    plan.gebeurtenissen.push(Object.assign({ soort, code: v && v.code, bronId: v && v.bronId,
      titel: [v && v.merk, v && v.model].filter(Boolean).join(' ') }, extra || {}));
  };

  const schrijven = new Map();          // advertenties die weggeschreven moeten worden
  const gezien = {};                    // provider -> Set(voertuigcode)
  const aangeraakt = new Set();         // wagens waarvan een eerdere bron de velden al deed
  const nieuweCodes = new Set();

  /* herbind: de rij hoort bij een wagen die in DEZE run is aangemaakt of
     overgenomen (of de oude rij was niet te vertrouwen): hij krijgt een nieuw
     Created At, zodat hij niet ouder is dan zijn wagen. */
  const zetAdvertentie = (provider, f, code, herbind) => {
    const k = lkSleutel(provider, f.bronId);
    const was = lk.get(k) || staleRijen.get(k);
    const url = f.link || '';
    const verouderd = !was || !was.gezien || (Date.parse(nu) - Date.parse(was.gezien)) > GEZIEN_VERS_MS;
    const rij = Object.assign({}, was || {}, { provider, externalId: String(f.bronId).trim(), vehicleCode: code, status: 'ACTIVE', url: url || (was && was.url) || '' });
    const nodig = !was || was.voorlopig || herbind || !lk.has(k) || was.vehicleCode !== code || was.status === 'REMOVED' || (url && was.url !== url) || verouderd;
    if (nodig) rij.gezien = nu;
    if (herbind || !was || was.voorlopig || !lk.has(k)) rij.aangemaakt = nu;
    delete rij.voorlopig;
    if (nodig) { lk.set(k, rij); schrijven.set(k, rij); }
  };

  /* ── Per bron: wie is welke wagen? ─────────────────────────────────────── */
  for (const S of bronnen) {
    if (!S.voertuigen) continue;
    const P = S.provider;
    const st = plan.perBron[P] = { nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, geadopteerd: 0, gekoppeld: 0, verdwenen: 0, verwijderd: 0, dalingGeblokkeerd: false, gezien: 0 };
    gezien[P] = new Set();

    const kandidaat = (f) => {
      const goed = (v) => v && !gezien[P].has(v.code) && !heeftActief(v.code, P);
      const as = autoscoutUit(f);
      const a = as ? perAutoscout.get(as) : null;
      if (goed(a)) return a;
      const l = perLink.get(linkSleutel(f.link));
      if (goed(l)) return l;
      const vin = vinSleutel(f.vin);
      if (vin) {
        const eigen = (perVin.get(vin) || []).filter(goed);
        if (eigen.length === 1) return eigen[0];
        if (eigen.length > 1) { plan.dubbelGemeld++; gebeurtenis('listing_ambiguous', { merk: f.merk, model: f.model, bronId: f.bronId }, { via: 'vin', provider: P }); }
      }
      /* Laatste kans: kenmerken. Nooit als beide een ANDER chassisnummer hebben,
         en alleen bij precies een kandidaat. */
      const ks = kenmerkSleutel(f);
      if (ks) {
        const kand = (perKenmerk.get(ks) || []).filter((v) => goed(v) && !(vin && vinSleutel(v.vin) && vinSleutel(v.vin) !== vin));
        if (kand.length === 1) return kand[0];
      }
      return null;
    };

    for (const f of S.voertuigen) {
      if (!f || !f.bronId) continue;
      const invoer = Object.assign({}, f, { bron: 'feed', bronId: bronIdVoor(P, f.bronId, legacy), gesynct: nu });
      /* Een kleur die de bron zelf niet leverde maar uit de advertentielink is
         afgeleid (waarden.kleurUitLink) mag een bestaande wagen alleen aanvullen. */
      const kleurAfgeleid = f.kleurAfgeleid === true;
      delete invoer.kleurAfgeleid;

      const eigen = lk.get(lkSleutel(P, f.bronId));
      let oud = eigen ? (byCode.get(eigen.vehicleCode) || null) : null;
      let adoptie = false;
      if (!oud) {
        const k = kandidaat(f);
        if (k) { oud = k; adoptie = true; }
      }

      if (!oud) {
        if (vehicles.normStatus(f.status) === 'verkocht') invoer.verkochtOp = nu;
        if (opties.codesToewijzen) {
          invoer.code = vehicles._intern.volgendeCode(codes);
          codes.push(invoer.code);
          nieuweCodes.add(invoer.code);
          /* Meteen zichtbaar voor de volgende bron en het volgende item: anders
             maakt het tweede platform dezelfde wagen nog een keer aan. */
          const vl = { id: 'nieuw:' + invoer.code, code: invoer.code, merk: f.merk, model: f.model, prijs: f.prijs, km: f.km, inschrijving: f.inschrijving, link: f.link || '',
            autoscout: autoscoutUit(f), vin: vinSleutel(f.vin), status: vehicles.normStatus(f.status), gearchiveerd: false,
            bron: 'feed', bronId: invoer.bronId, verkochtOp: invoer.verkochtOp || '' };
          werk.push(vl); byCode.set(vl.code, vl); indexeer(vl);
          zetAdvertentie(P, f, vl.code, true);
          gezien[P].add(vl.code);
        }
        plan.nieuw.push(invoer);
        st.nieuw++;
        gebeurtenis('vehicle_created', f, { prijs: f.prijs });
        continue;
      }

      gezien[P].add(oud.code);
      zetAdvertentie(P, f, oud.code, adoptie);

      /* Een eerdere bron (of een net aangemaakte wagen) bepaalt de velden. */
      if (aangeraakt.has(oud.code) || nieuweCodes.has(oud.code)) { verrijk(oud, f); st.gekoppeld++; continue; }
      aangeraakt.add(oud.code);

      let wijzigingen = VERGELIJK.filter((k) => f[k] !== undefined && !gelijk(f[k], oud[k]));
      /* Afgeleide kleur: nooit over een kleur heen die er al staat (de dealer
         vulde hem in, of een betrouwbaardere bron deed het). */
      if (kleurAfgeleid && String(oud.kleur || '').trim()) {
        wijzigingen = wijzigingen.filter((k) => k !== 'kleur');
        delete invoer.kleur;
      }
      let nieuweStatus = vehicles.normStatus(f.status);
      const oudeStatus = vehicles.normStatus(oud.status);
      /* Een bron die geen reserveringen kent (AutoScout24 toont alleen "te
         koop") mag een reservering die de dealer in Helvaro zette niet elk uur
         terugdraaien naar beschikbaar. */
      if (S.kentReservering === false && oudeStatus === 'gereserveerd' && nieuweStatus === 'beschikbaar') {
        wijzigingen = wijzigingen.filter((k) => k !== 'status');
        invoer.status = oud.status;
        nieuweStatus = oudeStatus;
      }
      /* Een chassisnummer of AutoScout-nummer dat de wagen nog niet had, wordt
         aangevuld; een ander nummer overschrijft nooit het bestaande. */
      const aanvullen = ['vin', 'autoscout'].filter((k) => invoer[k] && !oud[k]);
      if (oud.vin) delete invoer.vin;
      if (oud.autoscout) delete invoer.autoscout;
      verrijk(oud, f);

      /* Een gearchiveerde wagen die opnieuw in de bron staat als NIET verkocht
         komt terug. Staat hij er nog steeds als verkocht, dan blijft hij in het
         archief -- dat is gewoon een export die oude verkopen meestuurt. */
      const herleef = oud.gearchiveerd === true && nieuweStatus !== 'verkocht';
      const vo = vehicles.verkochtOvergang(oudeStatus, nieuweStatus, oud.verkochtOp, nu);

      if (!wijzigingen.length && !adoptie && !herleef && vo === undefined && !aanvullen.length) {
        plan.ongewijzigd++; st.ongewijzigd++;
        continue;
      }
      if (herleef) invoer.gearchiveerd = false;
      if (vo !== undefined) invoer.verkochtOp = vo;
      /* De herkomst van een wagen die al een andere bron heeft blijft die. */
      if (oud.bron && (oud.bron !== 'feed' || bronSleutel(oud.bronId) !== bronSleutel(invoer.bronId))) { delete invoer.bron; delete invoer.bronId; }
      plan.bijwerken.push({ id: oud.id, code: oud.code, invoer, wijzigingen, adoptie });
      st.bijgewerkt++;
      if (adoptie) { plan.geadopteerd++; st.geadopteerd++; }

      if (wijzigingen.indexOf('prijs') !== -1) gebeurtenis('vehicle_price_changed', oud, { van: oud.prijs, naar: f.prijs });
      if (nieuweStatus === 'verkocht' && oudeStatus !== 'verkocht') gebeurtenis('vehicle_marked_sold', oud, { via: 'bron' });
      else if (wijzigingen.length) gebeurtenis('vehicle_updated', oud, { velden: wijzigingen });
    }
  }

  /* ── Verdwenen ─────────────────────────────────────────────────────────────
     Per geslaagde bron: welke actieve wagens van DIE bron tonen ze niet meer?
     Een met de hand ingevoerde wagen heeft geen advertentie en is daarom nooit
     "verdwenen". De dalingswacht geldt per bron. */
  const weggelaten = {};                // provider -> Set(code): deze bron toont hem niet meer, en dat telt
  const modusVan = {};
  for (const S of bronnen) {
    if (!S.voertuigen) continue;
    const P = S.provider;
    const st = plan.perBron[P];
    const gehouden = new Map();
    for (const l of lk.values()) {
      if (l.provider !== P || l.status === 'REMOVED') continue;
      const v = byCode.get(l.vehicleCode);
      if (v && isActief(v) && !nieuweCodes.has(v.code)) gehouden.set(v.code, v);
    }
    const verdwenen = Array.from(gehouden.values()).filter((v) => !gezien[P].has(v.code));
    plan.verdwenenAantal += verdwenen.length;
    st.verdwenen = verdwenen.length;
    const modus = MODI.indexOf(S.verdwenen) !== -1 ? S.verdwenen : 'verkocht';
    if (modus === 'negeren' || !verdwenen.length) continue;
    const verdacht = verdwenen.length >= (Number.isFinite(opties.dalingMin) ? opties.dalingMin : DALING_MIN) && verdwenen.length > gehouden.size * DALING_AANDEEL;
    if (verdacht && !opties.bevestigDaling) { plan.dalingGeblokkeerd = true; st.dalingGeblokkeerd = true; continue; }
    weggelaten[P] = new Set(verdwenen.map((v) => v.code));
    modusVan[P] = modus;
    st.verwijderd = verdwenen.length;
  }

  /* Verkocht: alleen als ELKE bron die hem toonde hem nu laat vallen. */
  const kandidaten = new Set();
  for (const set of Object.values(weggelaten)) for (const c of set) kandidaten.add(c);
  for (const code of kandidaten) {
    const v = byCode.get(code);
    const houders = houdersVan(code).filter((l) => geconfigureerd.has(l.provider));
    if (!v || !houders.length) continue;
    if (!houders.every((l) => weggelaten[l.provider] && weggelaten[l.provider].has(code))) continue;
    const modi = Array.from(new Set(houders.map((l) => modusVan[l.provider])));
    const status = modi.indexOf('verkocht') !== -1 ? 'verkocht' : 'uit aanbod';
    const invoer = { status, gesynct: nu };
    if (status === 'verkocht') invoer.verkochtOp = v.verkochtOp || nu;
    plan.weg.push({ id: v.id, code: v.code, invoer });
    gebeurtenis(status === 'verkocht' ? 'vehicle_marked_sold' : 'vehicle_updated', v,
      status === 'verkocht' ? { via: 'verdwenen_uit_bron' } : { velden: ['status'] });
  }

  /* De advertenties die niet meer getoond worden, als verwijderd bijhouden --
     ook als de wagen zelf blijft staan omdat een ander platform hem nog toont. */
  for (const [P, set] of Object.entries(weggelaten)) {
    for (const code of set) {
      for (const [k, l] of lk.entries()) {
        if (l.provider !== P || l.vehicleCode !== code || l.status === 'REMOVED') continue;
        const rij = Object.assign({}, l, { status: 'REMOVED' });
        delete rij.voorlopig;
        lk.set(k, rij);
        schrijven.set(k, rij);
      }
    }
  }
  plan.listings = Array.from(schrijven.values());
  for (const [P, set] of Object.entries(gezien)) plan.perBron[P].gezien = set.size;

  return plan;
}

/**
 * Een bronlijst naast de voorraad leggen: de enkele-bron-vorm van verzoenAlles.
 * Dit is wat er was voor er meerdere bronnen waren, en wat de tests van die tijd
 * nog steeds aanroepen. Het is een dunne laag: de regels staan in verzoenAlles.
 *
 * @param {object[]} bestaand  alle voertuigen van deze dealer, INCLUSIEF gearchiveerde
 * @param {object[]} bron      genormaliseerde bronregels (zie _inventaris.mapRegel)
 * @param {object}   opties    { nu, verdwenen: 'verkocht'|'uit_aanbod'|'negeren', bevestigDaling, kentReservering }
 */
function verzoen(bestaand, bron, opties = {}) {
  return verzoenAlles(bestaand, [], [{
    provider: 'feed', verdwenen: opties.verdwenen, kentReservering: opties.kentReservering, voertuigen: bron,
  }], { nu: opties.nu, bevestigDaling: opties.bevestigDaling, legacyProvider: 'feed' });
}

/* ── planArchief(): welke verkochte wagens zijn aan het archief toe ──────── */

/**
 * Pure: geen netwerk. Een wagen zonder Sold At maar met status verkocht (van
 * vóór deze functie, of een schrijfactie op een base zonder het veld) krijgt
 * NU een datum -- nooit een verzonnen datum in het verleden, want dan zou hij
 * morgen gearchiveerd worden zonder dat iemand de 14 dagen gezien heeft.
 */
function planArchief(voertuigen, opties = {}) {
  const nu = opties.nu || new Date().toISOString();
  const dagen = Number.isFinite(opties.dagen) ? opties.dagen : BEWAAR_DAGEN;
  const grens = Date.parse(nu) - dagen * DAG_MS;
  const archiveren = [], klokStarten = [];
  for (const v of voertuigen || []) {
    if (!v || v.gearchiveerd) continue;
    if (vehicles.normStatus(v.status) !== 'verkocht') continue;
    const t = Date.parse(v.verkochtOp || '');
    if (!Number.isFinite(t)) { klokStarten.push(v); continue; }
    if (t <= grens) archiveren.push(v);
  }
  return { archiveren, klokStarten };
}

/** Tellen voor het dashboard: ACTIVE / SOLD / ARCHIVED en wat aandacht vraagt. */
function telling(voertuigen) {
  const t = { actief: 0, gereserveerd: 0, verkocht: 0, uitAanbod: 0, gearchiveerd: 0, onbekend: 0, totaal: 0 };
  for (const v of voertuigen || []) {
    t.totaal++;
    if (v.gearchiveerd) { t.gearchiveerd++; continue; }
    const s = vehicles.normStatus(v.status);
    if (s === 'verkocht') t.verkocht++;
    else if (s === 'uit aanbod') t.uitAanbod++;
    else if (s === 'onbekend') t.onbekend++;
    else if (s === 'gereserveerd') t.gereserveerd++;
    else t.actief++;
  }
  return t;
}

/* ── Schrijven ───────────────────────────────────────────────────────────── */

const wacht = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Batches van tien (Airtable's plafond per verzoek), met een pauze ertussen
 * (vijf verzoeken per seconde per base). Is 'Sold At' er nog niet op deze base,
 * dan één keer opnieuw zonder dat veld -- en de rest van deze run ook zonder.
 */
function maakSchrijver(opties = {}) {
  const I = vehicles._intern;
  const max = Number.isFinite(opties.max) ? opties.max : 400;
  const pauze = Number.isFinite(opties.pauze) ? opties.pauze : 220;
  const staat = { geschreven: 0, failed: 0, zonderVerkochtVeld: false, afgekapt: false, zonderVelden: new Set() };
  /* Optionele velden (Sold At, VIN) die op deze base nog niet bestaan: een 422
     erover laat de run opnieuw proberen zonder die velden, en de rest van de
     run ook. De schemamigratie maakt ze aan; tot dan werkt de sync gewoon. */
  const strip = (rec) => {
    if (!staat.zonderVelden.size) return rec;
    const velden = Object.assign({}, rec.fields);
    let geraakt = false;
    for (const naam of staat.zonderVelden) if (naam in velden) { delete velden[naam]; geraakt = true; }
    return geraakt ? Object.assign({}, rec, { fields: velden }) : rec;
  };
  async function batch(method, records) {
    for (let i = 0; i < records.length; i += 10) {
      if (staat.geschreven >= max) { staat.afgekapt = true; return; }
      let deel = records.slice(i, i + 10).map(strip);
      const stuur = () => I.atFetch(I.TABEL, { method, body: JSON.stringify({ records: deel, typecast: true }) });
      let r = await stuur();
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const mist = I.onbekendOptioneelVeld(r.status, t).filter((n) => !staat.zonderVelden.has(n));
        if (mist.length) {
          for (const n of mist) staat.zonderVelden.add(n);
          staat.zonderVerkochtVeld = staat.zonderVelden.has(I.F.verkochtOp);
          deel = deel.map(strip);
          r = await stuur();
        }
        if (!r.ok) {
          staat.failed += deel.length;
          console.warn('[voorraadsync] batch', method, r.status, deel.length, 'wagens');
        }
      }
      staat.geschreven += deel.length;
      if (pauze) await wacht(pauze);
    }
  }
  return { batch, staat };
}

/**
 * Het plan uitvoeren. Nieuwe wagens krijgen een eigen Helvaro-code (V1, V2...)
 * zoals een met de hand ingevoerde wagen; de bron-ID staat daarnaast.
 */
async function pasToe(projectCode, plan, opties = {}) {
  const I = vehicles._intern;
  const nu = opties.nu || new Date().toISOString();
  const codes = Array.isArray(opties.codes) ? opties.codes.slice() : [];
  const { batch, staat } = maakSchrijver(opties);

  const nieuweRecords = plan.nieuw.map((inv) => {
    const velden = I.naarVelden(inv, projectCode);
    /* Al een code (verzoenAlles met codesToewijzen): die hoort bij de
       advertenties die er al aan hangen. Anders de eerstvolgende vrije. */
    const code = inv.code || I.volgendeCode(codes);
    codes.push(code);
    velden[I.F.code] = code;
    velden[I.F.aangemaakt] = nu;
    velden[I.F.bijgewerkt] = nu;
    return { fields: velden };
  });
  const patch = (lijst) => lijst.map((b) => {
    const velden = I.naarVelden(b.invoer, projectCode);
    velden[I.F.bijgewerkt] = nu;
    return { id: b.id, fields: velden };
  });

  await batch('POST', nieuweRecords);
  await batch('PATCH', patch(plan.bijwerken));
  await batch('PATCH', patch(plan.weg));

  const totaal = nieuweRecords.length + plan.bijwerken.length + plan.weg.length;
  return {
    geschreven: staat.geschreven,
    failed: staat.failed,
    afgekapt: staat.afgekapt,
    totaal,
    zonderVerkochtVeld: staat.zonderVerkochtVeld,
  };
}

/**
 * De veertien dagen. Draait dagelijks uit de cron voor elke dealer, ook zonder
 * feed: een wagen die de dealer met de hand op verkocht zette hoort er net zo
 * goed na twee weken uit.
 */
async function archiveerVerkocht(projectCode, opties = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new Error('archiveren zonder projectcode');
  const I = vehicles._intern;
  const nu = opties.nu || new Date().toISOString();
  const alle = await vehicles.list(tenant, { inclusiefGearchiveerd: true });
  const { archiveren, klokStarten } = planArchief(alle, { nu, dagen: opties.dagen });
  if (!archiveren.length && !klokStarten.length) return { gearchiveerd: 0, klokGestart: 0, failed: 0 };

  const { batch, staat } = maakSchrijver({ max: opties.max, pauze: opties.pauze });
  await batch('PATCH', archiveren.map((v) => ({ id: v.id, fields: { [I.F.gearchiveerd]: true, [I.F.bijgewerkt]: nu } })));
  await batch('PATCH', klokStarten.map((v) => ({ id: v.id, fields: { [I.F.verkochtOp]: nu, [I.F.bijgewerkt]: nu } })));

  if (archiveren.length) {
    logGebeurtenissen(tenant, archiveren.map((v) => ({
      soort: 'vehicle_archived', code: v.code, bronId: v.bronId,
      titel: [v.merk, v.model].filter(Boolean).join(' '), verkochtOp: v.verkochtOp,
    })));
  }
  return { gearchiveerd: archiveren.length, klokGestart: klokStarten.length, failed: staat.failed };
}

/* Gebeurtenissen naar het activiteitenlogboek, begrensd. Nooit laten falen:
   het logboek is er om achteraf te zien wat er gebeurde, niet om een sync te
   laten mislukken. */
function logGebeurtenissen(projectCode, lijst) {
  if (!Array.isArray(lijst) || !lijst.length) return;
  let _activiteit;
  try { _activiteit = require('./_activiteit'); } catch (_) { return; }
  const deel = lijst.slice(0, MAX_GEBEURTENISSEN);
  for (const g of deel) {
    const details = Object.assign({}, g);
    delete details.soort;
    _activiteit.log(projectCode, g.soort, { details }).catch(() => {});
  }
}

module.exports = {
  BEWAAR_DAGEN, DALING_MIN, DALING_AANDEEL, MAX_GEBEURTENISSEN, VERGELIJK,
  verzoen, verzoenAlles, bronIdVoor, splitsBronId, planArchief, telling, pasToe, archiveerVerkocht, logGebeurtenissen,
  _test: { gelijk, linkSleutel, autoscoutUit, isActief, maakSchrijver, kenmerkSleutel },
};
