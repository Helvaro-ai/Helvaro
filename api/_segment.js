'use strict';
/*
 * Segment binnen de dealermarkt: auto of motor.
 *
 * ── Waarom een segment en geen vertical ─────────────────────────────────────
 * Een motordealer is voor het PRODUCT een dealer: voorraad, gesprekken, leads,
 * afspraken, agenda. Wat verschilt zijn woorden (motor i.p.v. auto, testrit
 * i.p.v. proefrit), een paar kenmerken (cilinderinhoud, rijbewijsklasse) en de
 * soorten afspraak. Een nieuwe vertical zou ~20 server- en ~51 clientplekken
 * raken die `dealership` al goed lezen; een segment raakt alleen de plekken
 * die echt anders moeten.
 *
 * ── Leeg of onbekend betekent auto ──────────────────────────────────────────
 * Elke bestaande dealer heeft `Vehicle Segment` leeg en moet byte voor byte
 * hetzelfde blijven. Daarom is AUTO de terugval op ELK pad: leeg, onbekend,
 * null, record zonder dealership. Alleen letterlijk 'motor' (of een motor-niche
 * bij een leeg segmentveld) geeft de motorervaring.
 *
 * Dit bestand is bewust zuivere data + één lezer. De client spiegelt de lijst
 * (zie api/_dash/segment.js); tests/segment.test.js bewaakt dat ze gelijk zijn.
 */
const vertical = require('./_vertical');

const AUTO  = 'auto';
const MOTOR = 'motor';
const BEKEND = Object.freeze([AUTO, MOTOR]);

const VELD = 'Vehicle Segment';

/**
 * Welk segment hoort bij dit klantrecord.
 * @param {object} velden  `fields` van Client Config, of null
 * @returns {'auto'|'motor'}
 */
function van(velden) {
  if (!velden || typeof velden !== 'object') return AUTO;
  /* Een segment bestaat alleen binnen dealership. Een makelaar met per ongeluk
     'motor' in het veld blijft een makelaar. */
  if (vertical.van(velden) !== vertical.DEALERSHIP) return AUTO;

  const ruw = velden[VELD];
  const s = String(ruw == null ? '' : ruw).trim().toLowerCase();
  if (BEKEND.indexOf(s) !== -1) return s;

  /* Veld leeg of onbekend: een motor-niche beslist, anders auto. Alleen bij
     LEEG -- een expliciet geldige waarde is hierboven al gewonnen. */
  if (s === '') {
    const n = String(velden[vertical.NICHE_VELD] == null ? '' : velden[vertical.NICHE_VELD])
      .trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (vertical.NICHE_MOTOR.indexOf(n) !== -1) return MOTOR;
  }
  return AUTO;
}

function isMotor(velden) { return van(velden) === MOTOR; }

/** Veilig maken van een segmentnaam (ook van een client-string). */
function norm(segment) {
  const s = String(segment == null ? '' : segment).trim().toLowerCase();
  return BEKEND.indexOf(s) !== -1 ? s : AUTO;
}

/* ── Rijbewijsklasse (motor) ─────────────────────────────────────────────────
 * Wat een bike VEREIST (A1 <= 125 cc / 11 kW, A2 <= 35 kW, A onbeperkt) en wat
 * een klant HEEFT. Eén normalisatie voor beide kanten, zodat 'a2', 'A 2',
 * 'rijbewijs A2' en 'permis A2' hetzelfde zijn. Alles wat geen klasse is geeft
 * '' -- nooit een gok. */
const RIJBEWIJS = Object.freeze(['A1', 'A2', 'A']);
const RANG = Object.freeze({ A1: 1, A2: 2, A: 3 });
function normRijbewijs(x) {
  const t = String(x == null ? '' : x).trim().toUpperCase();
  if (!t) return '';
  const m = /(?:^|[^A-Z0-9])A\s?([12])?(?![A-Z0-9])/.exec(t) || /^A\s?([12])?$/.exec(t);
  if (!m) return '';
  return m[1] ? 'A' + m[1] : 'A';
}

/* Grenzen van de klassen (EU-richtlijn rijbewijzen). */
const KLASSE_GRENZEN = Object.freeze({
  A1: { maxKw: 11, maxCc: 125 },
  A2: { maxKw: 35, maxCc: null },
  A:  { maxKw: null, maxCc: null },
});

/**
 * Welke klasse heeft deze motor minstens nodig?
 * Uitdrukkelijk opgegeven wint; anders afgeleid uit vermogen, en alleen als
 * dat ondubbelzinnig is. 'onbekend' betekent: niet te bevestigen -- de
 * aanroeper mag dat NIET als 'past' lezen.
 * @returns {'A1'|'A2'|'A'|'onbekend'}
 */
function vereistRijbewijs(m) {
  const expliciet = normRijbewijs(m && m.rijbewijs);
  if (expliciet) return expliciet;
  const kw = m && m.kw != null && m.kw !== '' ? Number(m.kw) : NaN;
  if (Number.isFinite(kw) && kw > 35) return 'A';
  const cc = m && m.cc != null && m.cc !== '' ? Number(m.cc) : NaN;
  if (Number.isFinite(cc) && cc > 125 && Number.isFinite(kw) && kw > 11 && kw <= 35) return 'A2';
  if (Number.isFinite(cc) && cc > 125 && !Number.isFinite(kw)) return 'onbekend';
  if (Number.isFinite(cc) && cc <= 125 && Number.isFinite(kw) && kw <= 11) return 'A1';
  return 'onbekend';
}

/**
 * Mag iemand met rijbewijs `heeft` deze motor rijden?
 * @returns {'ja'|'nee'|'onbekend'}
 */
function mogelijkMetRijbewijs(m, heeft) {
  const h = normRijbewijs(heeft);
  if (!h) return 'ja';                 // geen rijbewijsbeperking opgegeven
  const nodig = vereistRijbewijs(m);
  if (nodig === 'onbekend') return h === 'A' ? 'ja' : 'onbekend';
  return RANG[h] >= RANG[nodig] ? 'ja' : 'nee';
}

module.exports = {
  AUTO, MOTOR, BEKEND, VELD, van, isMotor, norm,
  RIJBEWIJS, KLASSE_GRENZEN, normRijbewijs, vereistRijbewijs, mogelijkMetRijbewijs,
};
