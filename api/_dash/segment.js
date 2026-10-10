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
/* Motortypes: dezelfde groepen als MOTORTYPES in api/_wens.js (tests/motor-wording.test.js bewaakt dat). */
var MOTOR_TYPES = ['adventure', 'cruiser', 'naked', 'scooter', 'softail', 'sport', 'sportster', 'touring', 'trike'];
var MOTOR_BRANDSTOF = ['benzine', 'elektrisch'];

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

  /* Typelijst: bij motor een suggestielijst met de motortypes uit api/_wens.js
     (MOTORTYPES). De opgeslagen waarde is de vaste sleutel (cruiser, naked, ...),
     het label is vertaald. Voor auto is het veld precies wat het was: vrije tekst. */
  if (veld) {
    var dl = document.getElementById('pd-dl-motortype');
    if (motor) {
      if (!dl) { dl = document.createElement('datalist'); dl.id = 'pd-dl-motortype'; document.body.appendChild(dl); }
      dl.innerHTML = '';
      MOTOR_TYPES.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t; o.label = tr('mot.type.' + t); dl.appendChild(o);
      });
      veld.setAttribute('list', 'pd-dl-motortype');
    } else {
      veld.removeAttribute('list');
    }
  }

  /* Brandstof: een motor rijdt op benzine of elektrisch. De andere opties zijn
     verborgen (niet verwijderd): een bestaand voertuig met een andere waarde
     behoudt die. */
  var brandstof = document.getElementById('pd-f-brandstof');
  if (brandstof) Array.prototype.forEach.call(brandstof.options, function (o) {
    var toon = !motor || MOTOR_BRANDSTOF.indexOf(o.value) !== -1;
    o.hidden = !toon; o.disabled = !toon;
  });

  /* Versnelling: bij motor "manueel" in plaats van "handgeschakeld", en
     "semi-automaat" erbij. De opgeslagen waarden blijven 'handgeschakeld' en
     'automaat' (compatibel met wat er al staat); 'semi-automaat' is nieuw. */
  var trans = document.getElementById('pd-f-transmissie');
  if (trans) {
    var hand = trans.querySelector('option[value="handgeschakeld"]');
    if (hand) {
      if (!hand.getAttribute('data-orig')) hand.setAttribute('data-orig', hand.textContent);
      hand.textContent = motor ? tr('mot.trans.handgeschakeld') : hand.getAttribute('data-orig');
    }
    var semi = trans.querySelector('option[data-motor]');
    if (motor && !semi) {
      semi = document.createElement('option');
      semi.value = 'semi-automaat'; semi.setAttribute('data-motor', '1');
      trans.appendChild(semi);
    }
    if (semi && motor) semi.textContent = tr('mot.trans.semi');
    if (semi && !motor) { if (trans.value === 'semi-automaat') trans.value = 'automaat'; semi.remove(); }
  }

  /* Voorbeeldtekst in de velden: geen BMW M4 bij een motor. De originele
     plaatshouder wordt onthouden en voor auto teruggezet. */
  [['pd-f-merk', 'Harley-Davidson'], ['pd-f-model', 'Breakout'], ['pd-f-uitvoering', 'Milwaukee-Eight 117'], ['pd-f-kw', '66']].forEach(function (p) {
    var f = document.getElementById(p[0]);
    if (!f) return;
    if (f.getAttribute('data-orig-ph') === null) f.setAttribute('data-orig-ph', f.placeholder);
    f.placeholder = motor ? p[1] : f.getAttribute('data-orig-ph');
  });

  /* Advertentielink: voor motor geen AutoScout24 als enige voorbeeld. */
  var advLabel = document.getElementById('pd-l-adlink');
  if (advLabel) advLabel.textContent = tr('veh.f.adlink');
  var advVeld = document.getElementById('pd-f-adlink');
  if (advVeld) advVeld.placeholder = motor ? 'https://...' : 'https://www.autoscout24.be/aanbod/...';
}
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
