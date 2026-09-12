'use strict';
/*
 * Eén getal voor "hoe dicht staat deze dealership-lead bij een verkoop", en
 * WAAROM.
 *
 * ── Waarom een getal, en waarom met redenen erbij ────────────────────────────
 * Een verkoper met dertig lopende WhatsApp-gesprekken kan niet elk gesprek
 * herlezen om te weten wie hij nu moet bellen. Een score sorteert dat in één
 * blik. Maar een score zonder reden is een zwarte doos: "waarom staat deze
 * lead op 65?" moet in de UI te beantwoorden zijn zonder in de Notities-blob
 * te gaan graven. Vandaar `redenen`.
 *
 * ── Waarom dit puur is ────────────────────────────────────────────────────
 * Geen fetch, geen Airtable, geen tijd behalve wat de aanroeper meegeeft via
 * `nu`. Dat is met opzet: hetzelfde signalenpakket moet altijd hetzelfde getal
 * geven, ook in een test, ook een jaar later. Alles wat met de klok te maken
 * heeft (volgendeActie) krijgt die klok dus EXPLICIET aangereikt in plaats van
 * `new Date()` zelf op te roepen -- anders is een test die "vandaag" nabootst
 * onmogelijk zonder de systeemklok te verzetten.
 *
 * ── Geen dubbeltelling ────────────────────────────────────────────────────
 * Een lead die zowel een proefrit ALS een bezichtiging vraagt (kan, twee
 * verschillende auto's) krijgt maar één keer punten voor "vraagt een
 * afspraak" -- de hoogste van de twee, niet de som. Zie de kop bij `bereken`.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const PUNTEN = Object.freeze({
  voertuig:      15,
  budget:        15,
  termijn:       10,
  termijn_kort:  10,
  financiering:  10,
  proefrit:      15,
  bezichtiging:  10,
  afspraak:      5,
  geboekt:       10,
  intentie:      10,
  inruil:        5,
});

function getal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * De score en de reden erachter.
 *
 * @param {object} signalen
 * @param {object} [signalen.wens]       zie api/_wens.js normaliseer()
 * @param {object} [signalen.koop]       zie api/_koop.js normaliseer()
 * @param {string} [signalen.voertuigCode]
 * @param {object} [signalen.afspraak]   { gevraagd, type, geboekt }
 * @param {*}      [signalen.qualified]  bewust ongebruikt in de puntentelling
 *                                       (zie onder) maar wel aanvaard, zodat
 *                                       de aanroeper niet eerst hoeft te
 *                                       filteren welke velden hij meegeeft.
 * @returns {{score:number, temperatuur:('hot'|'warm'|'cold'), redenen:{sleutel:string,punten:number}[]}}
 */
function bereken(signalen) {
  try {
    const s       = signalen && typeof signalen === 'object' ? signalen : {};
    const wens    = s.wens && typeof s.wens === 'object' ? s.wens : {};
    const koop    = s.koop && typeof s.koop === 'object' ? s.koop : {};
    const afspraak = s.afspraak && typeof s.afspraak === 'object' ? s.afspraak : {};

    const redenen = [];
    let punten = 0;
    const geef = (sleutel, n) => { punten += n; redenen.push({ sleutel, punten: n }); };

    if (String(s.voertuigCode || '').trim()) geef('voertuig', PUNTEN.voertuig);

    const koopBudget = getal(koop.budget);
    const wensBudget = getal(wens.maxPrijs);
    if ((koopBudget !== null && koopBudget > 0) || (wensBudget !== null && wensBudget > 0)) {
      geef('budget', PUNTEN.budget);
    }

    const termijn = String(koop.termijn || '').trim().toLowerCase();
    if (termijn) {
      geef('termijn', PUNTEN.termijn);
      if (termijn === 'kort') geef('termijn_kort', PUNTEN.termijn_kort);
    }

    const financiering = String(koop.financiering || '').trim().toLowerCase();
    if (financiering === 'goedgekeurd' || financiering === 'cash') {
      geef('financiering', PUNTEN.financiering);
    }

    /* EEN van de drie, nooit de som -- zie de kop hierboven. */
    if (afspraak.gevraagd === true) {
      const type = String(afspraak.type || '').trim().toLowerCase();
      if (type === 'proefrit') geef('proefrit', PUNTEN.proefrit);
      else if (type === 'bezichtiging') geef('bezichtiging', PUNTEN.bezichtiging);
      else geef('afspraak', PUNTEN.afspraak);
    }

    if (afspraak.geboekt === true) geef('geboekt', PUNTEN.geboekt);

    const intentie = String(koop.intentie || '').trim().toLowerCase();
    if (intentie === 'sterk') geef('intentie', PUNTEN.intentie);

    if (koop.inruil !== null && koop.inruil !== undefined && typeof koop.inruil === 'object') {
      geef('inruil', PUNTEN.inruil);
    }

    const score = Math.max(0, Math.min(100, Math.round(punten)));
    const temperatuur = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';

    return { score, temperatuur, redenen };
  } catch (_) {
    return { score: 0, temperatuur: 'cold', redenen: [] };
  }
}

/** De opgeslagen score uit een Notities-blob halen. Werpt nooit. */
function uitNotities(raw) {
  const t = raw ? String(raw).trim() : '';
  if (!t.startsWith('{')) return null;
  try {
    const d = JSON.parse(t);
    const sc = d && d.score;
    if (!sc || typeof sc !== 'object') return null;
    if (typeof sc.punten !== 'number' || !Number.isFinite(sc.punten)) return null;
    if (!sc.temperatuur || typeof sc.temperatuur !== 'string') return null;
    return {
      punten: Math.max(0, Math.min(100, Math.round(sc.punten))),
      temperatuur: sc.temperatuur,
      redenen: Array.isArray(sc.redenen) ? sc.redenen.filter((x) => typeof x === 'string') : [],
      at: typeof sc.at === 'string' ? sc.at : '',
    };
  } catch (_) { return null; }
}

/**
 * De score IN een Notities-blob zetten, zonder de rest te slopen.
 * Zelfde merge-contract als api/_wens.js naarNotities. `uitkomst` is wat
 * `bereken()` teruggeeft; hier wordt alleen de sleutel van elke reden bewaard
 * (`redenen: [sleutels]`), niet de punten -- de punten liggen al vast in
 * `punten`, en dubbel bewaren is een plek waar ze uit elkaar kunnen lopen.
 * Geeft null als er niets verandert.
 */
function naarNotities(raw, uitkomst) {
  if (!uitkomst || typeof uitkomst !== 'object') return null;
  const punten = getal(uitkomst.score);
  const temperatuur = String(uitkomst.temperatuur || '');
  if (punten === null || !temperatuur) return null;
  const redenen = Array.isArray(uitkomst.redenen)
    ? uitkomst.redenen.map((r) => (r && typeof r === 'object' ? r.sleutel : r)).filter((x) => typeof x === 'string')
    : [];

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

  const nieuw = { punten: Math.max(0, Math.min(100, Math.round(punten))), temperatuur, redenen };
  const oud = data.score && typeof data.score === 'object'
    ? { punten: data.score.punten, temperatuur: data.score.temperatuur, redenen: Array.isArray(data.score.redenen) ? data.score.redenen : [] }
    : null;
  if (oud && JSON.stringify(oud) === JSON.stringify(nieuw)) return null;

  data.score = Object.assign({}, nieuw, { at: new Date().toISOString() });
  return JSON.stringify(data);
}

/* ── Volgende actie ───────────────────────────────────────────────────────── */

/* Brussel-dagstring via Intl in plaats van UTC-dag: 01:30 UTC is al de volgende
   dag in Brussel tijdens zomertijd. Zonder dit zou een afspraak om 01:30 lokale
   tijd op "vandaag" soms als "morgen" worden geteld, afhankelijk van het
   seizoen -- precies het soort fout die maar de helft van het jaar optreedt. */
function brusselsDagStr(datum) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(datum);
  } catch (_) {
    return datum.toISOString().slice(0, 10);
  }
}

function dagVerschil(nu, ander) {
  const a = Date.parse(brusselsDagStr(nu) + 'T00:00:00Z');
  const b = Date.parse(brusselsDagStr(ander) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

const VOERTUIG_WEG = Object.freeze(['verkocht', 'uit aanbod', 'gereserveerd']);

/**
 * Wat een verkoper nu het beste kan doen met deze lead, of null als er niets
 * dringends is.
 *
 * Volgorde is een prioriteit, geen los-van-elkaar lijstje: een vandaag geboekte
 * afspraak wint altijd van "bel deze hete lead", want die afspraak IS het
 * contactmoment. Zie elk blok hieronder voor de reden dat het precies daar
 * staat en niet hoger of lager.
 *
 * @param {object} input
 * @param {number} input.score
 * @param {object} [input.afspraak]        { startISO, status }
 * @param {string} [input.voertuigStatus]
 * @param {string} [input.laatsteContactISO]
 * @param {object} [input.koop]
 * @param {Date}   [input.nu]              voor testbaarheid; standaard nu
 * @returns {string|null}
 */
function volgendeActie(input) {
  try {
    const s  = input && typeof input === 'object' ? input : {};
    const nu = s.nu instanceof Date && !Number.isNaN(s.nu.getTime()) ? s.nu : new Date();
    const afspraak = s.afspraak && typeof s.afspraak === 'object' ? s.afspraak : {};
    const koop     = s.koop && typeof s.koop === 'object' ? s.koop : {};

    const geboekt = afspraak.status === 'booked';
    const start = afspraak.startISO ? new Date(afspraak.startISO) : null;
    const startGeldig = start && !Number.isNaN(start.getTime());

    /* 1. Een afspraak die er al staat, wint van alles: die voorbereiden of
       bevestigen is letterlijk het eerstvolgende dat moet gebeuren. */
    if (geboekt && startGeldig) {
      const verschil = dagVerschil(nu, start);
      if (verschil === 0) return 'voorbereiden';
      if (verschil === 1) return 'bevestigen';
    }

    /* 2. Het voertuig waar dit gesprek om draaide is weg. Dat is dringender
       dan "bel hem" -- zonder alternatief is bellen een gesprek voeren over
       een auto die niet meer bestaat. */
    const voertuigStatus = String(s.voertuigStatus || '').trim().toLowerCase();
    if (VOERTUIG_WEG.indexOf(voertuigStatus) !== -1) return 'alternatief';

    /* 3. Heet EN geen afspraak vast: dan is bellen de vervolgstap, niet
       wachten op een volgende WhatsApp-beurt. */
    const score = getal(s.score);
    if (!geboekt && score !== null && score >= 80) return 'contacteren';

    /* 4. Er is een inruilwagen genoemd maar geen merk/model erbij -- dat is
       een gat dat de verkoper meteen kan dichten in plaats van te gokken op de
       waarde ervan. */
    if (koop && koop.inruil && typeof koop.inruil === 'object'
        && !String(koop.inruil.merk || '').trim() && !String(koop.inruil.model || '').trim()) {
      return 'inruil';
    }

    /* 5. Stilte langer dan twee werkdagreacties (48 uur) zonder vaste
       afspraak: dat is de lead die stil aan het afkoelen is. */
    if (!geboekt && s.laatsteContactISO) {
      const laatste = new Date(s.laatsteContactISO);
      if (!Number.isNaN(laatste.getTime()) && (nu.getTime() - laatste.getTime()) > 48 * 3600 * 1000) {
        return 'opvolgen';
      }
    }

    return null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  PUNTEN,
  bereken,
  uitNotities,
  naarNotities,
  volgendeActie,
};
