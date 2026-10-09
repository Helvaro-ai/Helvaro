'use strict';
/*
 * Segment binnen dealership (auto | motor) -- de client-kant.
 *
 * De server beslist (api/_segment.js, config-get geeft `segment` terug); dit
 * bestand laat het dashboard het toepassen. De woordenlijst zelf
 * (HV_WOORDEN_MOTOR) staat bij HV_WOORDEN in api/dashboard.js, omdat vw() hem
 * leest; hier staan de functies.
 *
 * Hoe het erin komt: zoals api/_dash/agenda.js. De functie hieronder wordt
 * NOOIT op de server uitgevoerd; js() geeft de broncode van haar romp terug en
 * api/dashboard.js plakt die in het clientscript. Gebruikt de globale namen van
 * het dashboard (hvVertical, hvSegment, WIZARD_MARKTEN, tr).
 *
 * tests/segment.test.js bewaakt dat de segmentnamen hier en in
 * api/_segment.js gelijk zijn.
 */
/* eslint-disable no-undef, no-unused-vars */
function client() {
/* ── Segment (auto | motor) ─────────────────────────────────────────────── */
var SEG_BEKEND = ['auto', 'motor'];

/* Is dit een motordealer? Alleen binnen dealership; leeg/onbekend = auto. */
function isMotor() { return hvVertical === 'dealership' && hvSegment === 'motor'; }

/* Welk segment hoort bij een gekozen markt (sector-id uit WIZARD_MARKTEN). */
function segmentVoorSector(sector) {
  for (var i = 0; i < WIZARD_MARKTEN.length; i++) {
    if (WIZARD_MARKTEN[i].id === sector) return SEG_BEKEND.indexOf(WIZARD_MARKTEN[i].segment) !== -1 ? WIZARD_MARKTEN[i].segment : 'auto';
  }
  return 'auto';
}

/* De delen van het voertuigformulier die per segment verschillen: bij motor
   cilinderinhoud en rijbewijsklasse erbij, en het "carrosserie"-veld heet dan
   type motor. Voor auto is dit precies wat er al stond. */
function segmentToepassen() {
  var motor = isMotor();
  var rij = document.getElementById('pd-motor-velden');
  if (rij) rij.style.display = motor ? '' : 'none';
  var label = document.getElementById('pd-l-carrosserie');
  if (label) label.textContent = tr(motor ? 'mot.f.type' : 'veh.f.carrosserie');
  var veld = document.getElementById('pd-f-carrosserie');
  if (veld) veld.placeholder = motor ? 'Cruiser' : 'Coupé';
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
