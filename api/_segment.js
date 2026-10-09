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

module.exports = { AUTO, MOTOR, BEKEND, VELD, van, isMotor, norm };
