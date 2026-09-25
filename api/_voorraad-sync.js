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
 * ── SOLD en ARCHIVED, in dit datamodel ─────────────────────────────────────
 *   SOLD      Status = 'verkocht', Archived = false, Sold At gezet.
 *             Telt niet als voorraad, boekt geen proefrit, mag op de website
 *             met een VERKOCHT-badge blijven staan.
 *   ARCHIVED  Archived = true. De status blijft 'verkocht' staan: de
 *             geschiedenis klopt, en de rij bestaat nog voor wie er later naar
 *             een oude lead kijkt.
 *
 * Geen route: onderstreepje voorop. Vercel Hobby staat twaalf functies toe en
 * die zijn op.
 */

const vehicles = require('./_vehicles');

const BEWAAR_DAGEN = 14;
const DAG_MS = 24 * 60 * 60 * 1000;

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

/**
 * @param {object[]} bestaand  alle voertuigen van deze dealer, INCLUSIEF gearchiveerde
 * @param {object[]} bron      genormaliseerde bronregels (zie _inventaris.mapRegel)
 * @param {object}   opties    { nu, verdwenen: 'verkocht'|'uit_aanbod'|'negeren', bevestigDaling }
 * @returns {{nieuw:object[], bijwerken:object[], weg:object[], ongewijzigd:number,
 *            geadopteerd:number, verdwenenAantal:number, dalingGeblokkeerd:boolean,
 *            gebeurtenissen:object[]}}
 */
function verzoen(bestaand, bron, opties = {}) {
  const nu = opties.nu || new Date().toISOString();
  const modus = MODI.indexOf(opties.verdwenen) !== -1 ? opties.verdwenen : 'verkocht';

  /* Twee soorten bestaande wagens:
       - van DEZE bron (bron='feed' + bronId): die zijn van de sync
       - al het andere (met de hand, of via een advertentielink ingevoerd): die
         raakt de sync alleen aan als hij er zeker van is dat het dezelfde wagen
         is -- dan wordt hij overgenomen, en nooit verwijderd omdat hij niet in
         de feed staat. */
  const vanBron = new Map();
  const perAutoscout = new Map();
  const perLink = new Map();
  for (const v of bestaand) {
    if (v.bron === 'feed' && v.bronId) { vanBron.set(v.bronId, v); continue; }
    const as = autoscoutUit(v);
    if (as && !perAutoscout.has(as)) perAutoscout.set(as, v);
    const lk = linkSleutel(v.link);
    if (lk && !perLink.has(lk)) perLink.set(lk, v);
  }

  const plan = {
    nieuw: [], bijwerken: [], weg: [],
    ongewijzigd: 0, geadopteerd: 0,
    verdwenenAantal: 0, dalingGeblokkeerd: false,
    gebeurtenissen: [],
  };
  const gebeurtenis = (soort, v, extra) => {
    plan.gebeurtenissen.push(Object.assign({ soort, code: v && v.code, bronId: v && v.bronId,
      titel: [v && v.merk, v && v.model].filter(Boolean).join(' ') }, extra || {}));
  };

  const geraakt = new Set();

  for (const f of bron) {
    if (!f || !f.bronId) continue;
    const invoer = Object.assign({}, f, { bron: 'feed', gesynct: nu });

    let oud = vanBron.get(f.bronId) || null;
    let adoptie = false;
    if (!oud) {
      const kandidaat = perAutoscout.get(autoscoutUit(f)) || perLink.get(linkSleutel(f.link)) || null;
      if (kandidaat && !geraakt.has(kandidaat.id)) { oud = kandidaat; adoptie = true; }
    }

    if (!oud) {
      if (vehicles.normStatus(f.status) === 'verkocht') invoer.verkochtOp = nu;
      plan.nieuw.push(invoer);
      gebeurtenis('vehicle_created', f, { prijs: f.prijs });
      continue;
    }
    geraakt.add(oud.id);

    const wijzigingen = VERGELIJK.filter((k) => f[k] !== undefined && !gelijk(f[k], oud[k]));
    const nieuweStatus = vehicles.normStatus(f.status);
    const oudeStatus = vehicles.normStatus(oud.status);

    /* Een gearchiveerde wagen die opnieuw in de bron staat als NIET verkocht
       komt terug. Staat hij er nog steeds als verkocht, dan blijft hij in het
       archief -- dat is gewoon een export die oude verkopen meestuurt. */
    const herleef = oud.gearchiveerd === true && nieuweStatus !== 'verkocht';
    const vo = vehicles.verkochtOvergang(oudeStatus, nieuweStatus, oud.verkochtOp, nu);

    if (!wijzigingen.length && !adoptie && !herleef && vo === undefined) {
      plan.ongewijzigd++;
      continue;
    }
    if (herleef) invoer.gearchiveerd = false;
    if (vo !== undefined) invoer.verkochtOp = vo;
    plan.bijwerken.push({ id: oud.id, code: oud.code, invoer, wijzigingen, adoptie });
    if (adoptie) plan.geadopteerd++;

    if (wijzigingen.indexOf('prijs') !== -1) gebeurtenis('vehicle_price_changed', oud, { van: oud.prijs, naar: f.prijs });
    if (nieuweStatus === 'verkocht' && oudeStatus !== 'verkocht') gebeurtenis('vehicle_marked_sold', oud, { via: 'bron' });
    else if (wijzigingen.length) gebeurtenis('vehicle_updated', oud, { velden: wijzigingen });
  }

  /* Verdwenen: van deze bron, actief, en niet meer in de lijst. Alleen wagens
     van DEZE bron -- een met de hand ingevoerde wagen staat nooit in de feed
     en is daarom ook nooit "verdwenen". */
  const actiefVanBron = Array.from(vanBron.values()).filter(isActief);
  const verdwenen = actiefVanBron.filter((v) => !geraakt.has(v.id));
  plan.verdwenenAantal = verdwenen.length;

  if (modus !== 'negeren' && verdwenen.length) {
    const verdacht = verdwenen.length >= DALING_MIN && verdwenen.length > actiefVanBron.length * DALING_AANDEEL;
    if (verdacht && !opties.bevestigDaling) {
      plan.dalingGeblokkeerd = true;
    } else {
      for (const v of verdwenen) {
        const status = modus === 'verkocht' ? 'verkocht' : 'uit aanbod';
        const invoer = { status, gesynct: nu };
        if (status === 'verkocht') invoer.verkochtOp = v.verkochtOp || nu;
        plan.weg.push({ id: v.id, code: v.code, invoer });
        gebeurtenis(status === 'verkocht' ? 'vehicle_marked_sold' : 'vehicle_updated', v,
          status === 'verkocht' ? { via: 'verdwenen_uit_bron' } : { velden: ['status'] });
      }
    }
  }

  return plan;
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
  const staat = { geschreven: 0, failed: 0, zonderVerkochtVeld: false, afgekapt: false };
  const strip = (rec) => {
    if (!staat.zonderVerkochtVeld || !(I.F.verkochtOp in rec.fields)) return rec;
    const velden = Object.assign({}, rec.fields);
    delete velden[I.F.verkochtOp];
    return Object.assign({}, rec, { fields: velden });
  };
  async function batch(method, records) {
    for (let i = 0; i < records.length; i += 10) {
      if (staat.geschreven >= max) { staat.afgekapt = true; return; }
      let deel = records.slice(i, i + 10).map(strip);
      const stuur = () => I.atFetch(I.TABEL, { method, body: JSON.stringify({ records: deel, typecast: true }) });
      let r = await stuur();
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (!staat.zonderVerkochtVeld && I.onbekendVerkochtVeld(r.status, t)) {
          staat.zonderVerkochtVeld = true;
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
    const code = I.volgendeCode(codes);
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
  verzoen, planArchief, telling, pasToe, archiveerVerkocht, logGebeurtenissen,
  _test: { gelijk, linkSleutel, autoscoutUit, isActief, maakSchrijver },
};
