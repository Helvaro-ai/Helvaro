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
/* ── Synoniemen ──────────────────────────────────────────────────────────────
 * Een voorraadfeed zegt 'Petrol', de dealer typt 'Benzine', een Franstalige
 * koper vraagt 'essence'. Tot 2026-09-26 was dat drie keer iets anders: de
 * wens 'benzine' paste niet op een auto met 'Petrol', en een koper die precies
 * vond wat hij zocht, kreeg hem niet aangeboden.
 *
 * Eén soort per groep. De eerste term is de naam van de groep. Alleen hele
 * woorden tellen -- 'van' (bestelwagen) mag niet matchen in 'van de garage'.
 * Daarom staan de te algemene woorden ('auto', 'van', 'gas') in VELD maar NIET
 * in TEKST: in een veld van een auto betekent 'Auto' een automaat, in een zin
 * betekent het gewoon een auto. */
const SOORTEN = Object.freeze({
  brandstof: {
    benzine:    ['benzine', 'petrol', 'gasoline', 'essence', 'benzin', 'super'],
    diesel:     ['diesel', 'gasoil', 'tdi', 'hdi', 'cdi'],
    elektrisch: ['elektrisch', 'elektrische', 'electric', 'électrique', 'electrique', 'elektro', 'ev', 'bev', 'volledig elektrisch'],
    hybride:    ['hybride', 'hybrid', 'hev', 'phev', 'plug-in', 'plugin', 'plug-in hybride'],
    lpg:        ['lpg', 'autogas'],
    cng:        ['cng', 'aardgas'],
  },
  transmissie: {
    automaat: ['automaat', 'automatic', 'automatique', 'automatik', 'automatisch', 'automatische', 'dsg', 'cvt', 'tiptronic', 'steptronic', 'edc', 'eat8'],
    manueel:  ['manueel', 'manuele', 'manual', 'handgeschakeld', 'handgeschakelde', 'manuelle', 'schaltgetriebe', 'handbak', 'schakel'],
  },
  carrosserie: {
    suv:         ['suv', '4x4', 'terreinwagen', 'crossover', 'tout-terrain'],
    break:       ['break', 'station', 'stationwagen', 'stationcar', 'touring', 'estate', 'kombi', 'avant', 'sportswagen', 'sports tourer'],
    cabrio:      ['cabrio', 'cabriolet', 'convertible', 'roadster'],
    coupe:       ['coupé', 'coupe'],
    berline:     ['berline', 'sedan', 'limousine', 'limo'],
    hatchback:   ['hatchback', 'hatch', 'stadsauto', 'citadine'],
    monovolume:  ['monovolume', 'mpv', 'minivan', 'ruimtewagen', 'monospace'],
    bestelwagen: ['bestelwagen', 'bestelwagens', 'lichte vracht', 'utilitaire', 'utility'],
  },
});
/* Alleen in een VELD, nooit uit een zin gehaald. */
const ALLEEN_VELD = Object.freeze({ transmissie: { automaat: ['auto', 'at'], manueel: ['mt'] }, carrosserie: { bestelwagen: ['van'] } });

function woordIn(hooi, naald) {
  const esc = String(naald).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9à-ÿ])' + esc + '($|[^a-z0-9à-ÿ])', 'i').test(hooi);
}

/** De groep waar deze waarde bij hoort ('Petrol' -> 'benzine'), of ''. */
function soortVan(soort, waarde, alleenTekst) {
  const v = String(waarde == null ? '' : waarde).toLowerCase().trim();
  const groepen = SOORTEN[soort];
  if (!v || !groepen) return '';
  for (const naam of Object.keys(groepen)) {
    const termen = groepen[naam].concat(
      !alleenTekst && ALLEEN_VELD[soort] && ALLEEN_VELD[soort][naam] ? ALLEEN_VELD[soort][naam] : []);
    /* Hybride vóór benzine en elektrisch lezen: 'Hybride (benzine/elektrisch)'
       is een hybride. Door de volgorde van de groepen hierboven zou benzine
       winnen, dus hybride krijgt voorrang. */
    if (soort === 'brandstof' && naam !== 'hybride'
        && groepen.hybride.some((t) => woordIn(v, t))) continue;
    if (termen.some((t) => woordIn(v, t))) return naam;
  }
  return '';
}

/**
 * Past de waarde van een auto bij wat de koper zocht? Zelfde groep, of (zoals
 * altijd al) de wens staat letterlijk in het veld.
 */
function zelfdeSoort(soort, veldwaarde, wenswaarde) {
  const v = String(veldwaarde == null ? '' : veldwaarde).toLowerCase();
  const w = String(wenswaarde == null ? '' : wenswaarde).toLowerCase();
  if (!v || !w) return false;
  if (v.indexOf(w) !== -1) return true;
  const a = soortVan(soort, v, false);
  return !!a && a === soortVan(soort, w, false);
}

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
    if (zelfdeSoort(sleutel, voertuig[veld], w[sleutel])) { punten += 10; redenen.push(label); }
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

/* ── Uit wat de koper NU schrijft ──────────────────────────────────────────────
 * De opgeslagen wens komt uit het WENS-blok van het model, en dat blok komt
 * pas NA een antwoord. Wie als eerste bericht "ik zoek een automaat SUV tot
 * 25.000" stuurt, kreeg dus een lijst van de eerste twaalf auto's op code --
 * precies het antwoord dat laat zien dat er niet geluisterd wordt.
 *
 * Dit leest alleen wat ondubbelzinnig is: een bedrag met een bovengrens-woord
 * ervoor, een kilometergrens, een bouwjaar met 'vanaf', en vaste woorden voor
 * brandstof, versnellingsbak en carrosserie. Twijfel = niets. Het resultaat
 * wordt NIET bewaard -- dat blijft het werk van het WENS-blok -- het ordent
 * alleen de lijst die het model deze beurt ziet.
 *
 * @param {string|string[]} berichten  de berichten van de koper, oudste eerst;
 *                                     een later bericht overschrijft een eerder
 * @param {{merken?:string[]}} [opties] merken uit de voorraad van deze dealer
 */
function bedragUit(getalTekst, achter) {
  let t = String(getalTekst || '').replace(/\s/g, '');
  const k = /^(k|duizend|mille|tausend)/i.test(String(achter || '').trim());
  /* 25.000 en 25,000 = 25000; 24,5k = 24500. */
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else t = t.replace(',', '.');
  let n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (k) n = n * 1000;
  return Math.round(n);
}

const GETAL = '(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(k\\b|duizend|mille|tausend)?';
const BOVENGRENS = '(?:tot|onder|max(?:imum)?|budget(?: van| is| tot)?|niet meer dan|hoogstens|minder dan|jusqu[\'’]?(?:à|a)|moins de|maximum de|under|up to|less than|bis|unter|höchstens|weniger als)';
const IN_BEREIK = (n) => n !== null && n >= 1000 && n <= 1000000;

/* De laatste treffer in de tekst telt: "tot 20k... nee, tot 25k" is 25k. */
function laatste(re, t) {
  let m, uit = null;
  re.lastIndex = 0;
  while ((m = re.exec(t))) uit = bedragUit(m[1], m[2]);
  return uit;
}

function uitTekst(berichten, opties) {
  const lijst = (Array.isArray(berichten) ? berichten : [berichten])
    .map((b) => String(b == null ? '' : b).toLowerCase()).filter(Boolean);
  const merken = ((opties && opties.merken) || []).map((m) => String(m || '').toLowerCase().trim()).filter((m) => m.length >= 2);
  const KM     = new RegExp(BOVENGRENS + '\\s*' + GETAL + '\\s*(?:km|kilometer)', 'g');
  const KM_WEG = new RegExp(GETAL + '\\s*(?:km|kilometer)', 'g');
  const PRIJS  = new RegExp(BOVENGRENS + '\\s*(?:€|eur(?:o)?\\s*)?\\s*' + GETAL + '\\s*(?:€|eur(?:o)?)?', 'g');
  const w = {};

  for (const t of lijst) {
    /* Budget: kilometers eerst weghalen, want 'max 100.000 km' is geen budget. */
    const prijs = laatste(PRIJS, t.replace(KM_WEG, ' '));
    if (IN_BEREIK(prijs)) w.maxPrijs = prijs;

    /* Een bericht over zijn INRUILWAGEN beschrijft de auto die hij kwijt wil,
       niet die hij zoekt: "mijn Audi diesel met 150.000 km om in te ruilen".
       Daaruit halen we alleen het budget hierboven, verder niets. */
    if (/inruil|in te ruilen|ruilen|reprise|trade[- ]?in|inzahlung/.test(t)) continue;

    const km = laatste(KM, t);
    if (IN_BEREIK(km)) w.maxKm = km;

    const jaar = /(?:vanaf|na|niet ouder dan|from|after|à partir de|a partir de|depuis|ab|nach)\s*(?:bouwjaar\s*)?((?:19|20)\d{2})\b/.exec(t)
      || /\b((?:19|20)\d{2})\s*(?:of|or|ou|oder)\s*(?:nieuwer|recenter|jonger|later|newer|plus récent|neuer)/.exec(t);
    if (jaar) {
      const j = Number(jaar[1]);
      if (j >= 1990 && j <= 2100) w.minJaar = j;
    }

    for (const soort of ['brandstof', 'transmissie', 'carrosserie']) {
      const g = soortVan(soort, t, true);
      if (g) w[soort] = g;
    }

    /* Twee merken in één bericht ("BMW of Audi") is geen merkwens: merk is
       een harde filter in scoor(), en de verkeerde kiezen verbergt de helft. */
    const genoemd = merken.filter((mk, i) => merken.indexOf(mk) === i && woordIn(t, mk));
    if (genoemd.length === 1) w.merk = genoemd[0];
    else if (genoemd.length > 1) delete w.merk;
  }
  return normaliseer(w);
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
  uitTekst,
  soortVan,
  zelfdeSoort,
  SOORTEN,
};
