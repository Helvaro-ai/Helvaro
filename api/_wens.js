'use strict';
/*
 * Wat een koper zocht, en welke auto daar later bij past.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * Een dealership-lead komt binnen via AutoScout24: hij klikt WhatsApp op een
 * advertentie, stelt een vraag, en soms is het antwoord "die is net weg" of
 * "dat is net iets boven mijn budget". Dan houdt het op. Twee maanden later
 * rijdt precies wat hij zocht de garage binnen, en niemand legt dat verband.
 *
 * Dat is de duurste stilte in dit product. De lead was al betaald: hij is
 * gevonden, aangesproken, gekwalificeerd. Hem opnieuw bereiken kost een
 * sjabloonbericht van ongeveer elf cent. Een nieuwe lead kost een veelvoud.
 *
 * ── Wat hier NIET gebeurt ────────────────────────────────────────────────────
 * Er wordt niets verstuurd. Deze module rekent alleen uit WIE er bij een auto
 * past en HOE GOED. Wat daarmee gebeurt beslist Faro, en versturen loopt via
 * de bestaande campagne- en sjabloonweg -- inclusief de afmeldcontrole, want
 * iemand die STOP typte hoort ook geen "goed nieuws" te krijgen.
 *
 * ── Waarom de wens in de Notities-blob staat ─────────────────────────────────
 * Dezelfde plek als de aanbodcode. Geen nieuw Airtable-veld, dus geen migratie
 * en geen 422 op een tabel waar het veld nog niet bestaat. En de blob wordt al
 * gelezen en samengevoegd door drie andere plekken, dus de regels eromheen
 * staan er al.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* Wat een wens kan bevatten. Alles optioneel: een koper die alleen "iets van
   Mercedes onder de 30.000" zegt heeft een bruikbare wens, en hem dwingen tot
   een volledig profiel is precies het verhoor dat we niet willen. */
const VELDEN = Object.freeze(['merk', 'model', 'maxPrijs', 'maxKm', 'minJaar', 'brandstof', 'transmissie', 'carrosserie']);

function getal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function tekst(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 60);
}

/**
 * Een wens opschonen tot iets dat bewaard mag worden.
 * Geeft null als er niets bruikbaars in zit -- een lege wens opslaan zou elke
 * auto laten "matchen" met iedereen.
 */
function normaliseer(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;
  const w = {};
  if (tekst(ruw.merk))        w.merk        = tekst(ruw.merk, 40).toLowerCase();
  if (tekst(ruw.model))       w.model       = tekst(ruw.model, 40).toLowerCase();
  if (tekst(ruw.brandstof))   w.brandstof   = tekst(ruw.brandstof, 20).toLowerCase();
  if (tekst(ruw.transmissie)) w.transmissie = tekst(ruw.transmissie, 20).toLowerCase();
  if (tekst(ruw.carrosserie)) w.carrosserie = tekst(ruw.carrosserie, 30).toLowerCase();

  const p = getal(ruw.maxPrijs); if (p !== null && p > 0)          w.maxPrijs = Math.round(p);
  const k = getal(ruw.maxKm);    if (k !== null && k > 0)          w.maxKm    = Math.round(k);
  const j = getal(ruw.minJaar);
  /* Een bouwjaar buiten dit bereik is een typfout of een verzinsel, en een
     wens met minJaar 20190 laat nooit meer iets matchen. */
  if (j !== null && j >= 1950 && j <= 2100) w.minJaar = Math.round(j);

  return Object.keys(w).length ? w : null;
}

/** De wens uit een Notities-blob halen. Werpt nooit. */
function uitNotities(raw) {
  const t = raw ? String(raw).trim() : '';
  if (!t.startsWith('{')) return null;
  try {
    const d = JSON.parse(t);
    return normaliseer(d && d.wens);
  } catch (_) { return null; }
}

/**
 * De wens IN een Notities-blob zetten, zonder de rest te slopen.
 * Zelfde merge-contract als mergeAanbodCode in api/whatsapp.js: notities,
 * taken en de escalatievlag blijven staan.
 * Geeft null als er niets verandert, zodat de aanroeper een overbodige
 * Airtable-schrijfactie kan overslaan.
 */
function naarNotities(raw, wens) {
  const schoon = normaliseer(wens);
  if (!schoon) return null;
  const t = raw ? String(raw).trim() : '';
  let data = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch (_) { /* kapotte JSON: hieronder als oude platte tekst bewaren */ }
  }
  if (!handled && t) {
    data.notes = [{ id: 'legacy', text: t, ts: new Date().toISOString() }];
  }
  if (JSON.stringify(data.wens || null) === JSON.stringify(schoon)) return null;
  data.wens = schoon;
  data.wensAt = new Date().toISOString();
  return JSON.stringify(data);
}

/* ── Matchen ─────────────────────────────────────────────────────────────────
 *
 * Punten en geen ja/nee, om één reden: een koper die "een Mercedes onder de
 * 30.000" zocht en er nu een van 30.500 binnenkrijgt, is een goede match. Een
 * harde grens zou hem afwijzen, en dat is precies de deal die een verkoper
 * met één telefoontje wél had gemaakt.
 *
 * Wat WEL hard is: een merk dat niet klopt. Wie een Mercedes zocht wil geen
 * Audi horen, hoe goedkoop ook -- dat leest als spam en kost je de lead voor
 * altijd. Merk is dus een filter, de rest is een score.
 */
const TOLERANTIE_PRIJS = 0.10;   // 10% boven het budget mag nog
const TOLERANTIE_KM     = 0.20;  // 20% boven de kilometergrens mag nog

function scoor(wens, voertuig) {
  const w = normaliseer(wens);
  if (!w || !voertuig) return null;

  const redenen = [];
  let punten = 0;
  let maximum = 0;

  /* Merk is een FILTER en geen score. Zie de kop hierboven. */
  if (w.merk) {
    const merk = String(voertuig.merk || '').toLowerCase();
    if (!merk || merk.indexOf(w.merk) === -1) return null;
    punten += 30; maximum += 30;
    redenen.push('merk klopt');
  }

  if (w.model) {
    maximum += 25;
    const model = String(voertuig.model || '').toLowerCase();
    if (model && model.indexOf(w.model) !== -1) { punten += 25; redenen.push('model klopt'); }
  }

  if (w.maxPrijs) {
    maximum += 25;
    const p = getal(voertuig.prijs);
    if (p !== null) {
      if (p <= w.maxPrijs) { punten += 25; redenen.push('binnen budget'); }
      else if (p <= w.maxPrijs * (1 + TOLERANTIE_PRIJS)) {
        punten += 12;
        redenen.push('net boven budget');
      } else return null;   /* ruim boven budget: niet aanbieden */
    }
  }

  if (w.maxKm) {
    maximum += 15;
    const km = getal(voertuig.km);
    if (km !== null) {
      if (km <= w.maxKm) { punten += 15; redenen.push('kilometerstand past'); }
      else if (km <= w.maxKm * (1 + TOLERANTIE_KM)) { punten += 7; redenen.push('iets meer kilometers'); }
      else return null;
    }
  }

  if (w.minJaar) {
    maximum += 15;
    const jaar = Number((String(voertuig.inschrijving || '').match(/(19|20)\d{2}/) || [])[0]);
    if (Number.isFinite(jaar) && jaar > 0) {
      if (jaar >= w.minJaar) { punten += 15; redenen.push('bouwjaar past'); }
      else if (jaar >= w.minJaar - 1) { punten += 7; redenen.push('een jaar ouder'); }
      else return null;
    }
  }

  for (const [sleutel, veld, label] of [
    ['brandstof', 'brandstof', 'brandstof klopt'],
    ['transmissie', 'transmissie', 'transmissie klopt'],
    ['carrosserie', 'carrosserie', 'carrosserie klopt'],
  ]) {
    if (!w[sleutel]) continue;
    maximum += 10;
    const v = String(voertuig[veld] || '').toLowerCase();
    if (v && v.indexOf(w[sleutel]) !== -1) { punten += 10; redenen.push(label); }
  }

  /* Hier stond een controle op `maximum === 0`, bedoeld als vangnet voor een
     wens zonder enig criterium. Die is weggehaald omdat hij ONBEREIKBAAR was:
     normaliseer() hierboven geeft al null voor een lege wens, en elke wens die
     daar doorheen komt heeft minstens één veld -- dus maximum is altijd > 0.

     Een mutatietest liet dat zien: de regel omdraaien maakte geen enkele test
     rood. Dat is precies wat "dode code" betekent, en dode code met een
     geruststellende opmerking erboven is erger dan geen code -- je denkt dat er
     iets bewaakt wordt.

     Het vangnet zelf is er nog steeds, alleen eerder: een lege wens komt nooit
     voorbij normaliseer(), en dat wordt wel getest. */
  const score = Math.round((punten / maximum) * 100);
  return { score, redenen, wens: w };
}

/**
 * Welke leads passen bij dit voertuig.
 *
 * @param {object[]} leads    zoals api/_leads-read.js ze teruggeeft, met de
 *                            ruwe Notities erbij als `notities`
 * @param {object}   voertuig zoals api/_vehicles.js het teruggeeft
 * @param {object}   [opties] { minScore = 55, max = 10 }
 */
function matchLeads(leads, voertuig, opties = {}) {
  const minScore = Number(opties.minScore) || 55;
  const max      = Number(opties.max) || 10;
  const uit = [];

  for (const l of (leads || [])) {
    if (!l) continue;
    /* Afgemeld is afgemeld. Dit staat hier EN in de verzendcode, en dat is met
       opzet: hier zodat een afgemelde lead niet eens op de lijst verschijnt
       die een mens te zien krijgt, daar omdat een lijst nog met de hand
       bewerkt kan worden. */
    if (l.optedOut === true || l.opted_out === true) continue;

    const wens = l.wens ? normaliseer(l.wens) : uitNotities(l.notities || l.Notities || '');
    if (!wens) continue;

    const m = scoor(wens, voertuig);
    if (!m || m.score < minScore) continue;

    uit.push({
      leadId: l.id || l.leadId,
      naam:   l.naam || l.name || '',
      telefoon: l.telefoon || l.phone || '',
      score:  m.score,
      redenen: m.redenen,
      wens:   m.wens,
      /* Hoe lang geleden hij dit zocht. Dat bepaalt de toon: "twee maanden
         geleden vroeg je naar" klinkt anders dan "vorige week". */
      sinds:  l.aangemaakt || l.createdAt || '',
    });
  }

  return uit.sort((a, b) => b.score - a.score).slice(0, max);
}

/** De wens in gewone woorden, voor op een kaart of in een prompt. */
function omschrijf(wens) {
  const w = normaliseer(wens);
  if (!w) return '';
  const d = [];
  if (w.merk)        d.push(w.merk.charAt(0).toUpperCase() + w.merk.slice(1));
  if (w.model)       d.push(w.model.toUpperCase());
  if (w.carrosserie) d.push(w.carrosserie);
  if (w.brandstof)   d.push(w.brandstof);
  if (w.transmissie) d.push(w.transmissie);
  if (w.minJaar)     d.push('vanaf ' + w.minJaar);
  if (w.maxKm)       d.push('max ' + Math.round(w.maxKm).toLocaleString('nl-BE') + ' km');
  if (w.maxPrijs)    d.push('tot € ' + Math.round(w.maxPrijs).toLocaleString('nl-BE'));
  return d.join(', ');
}

module.exports = {
  VELDEN,
  TOLERANTIE_PRIJS,
  TOLERANTIE_KM,
  normaliseer,
  uitNotities,
  naarNotities,
  scoor,
  matchLeads,
  omschrijf,
};
