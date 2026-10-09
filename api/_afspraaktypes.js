'use strict';
/*
 * De soorten afspraak bij een dealer -- op EEN plek.
 *
 * ── Waarom dit een eigen bestand is ─────────────────────────────────────────
 * De vier sleutels (proefrit, bezichtiging, ophaling, gesprek) stonden drie
 * keer los in de code (api/_dealer-boeking.js, api/_dealer-melding.js,
 * api/_koop.js) plus een keer als opsomming in de prompt, met een commentaar
 * dat zegt dat ze "gelijk moeten blijven lopen". Dat is precies hoe lijsten
 * uit elkaar gaan lopen. Nu leest iedereen hier.
 *
 * ── Per segment ─────────────────────────────────────────────────────────────
 * Standaard (auto, en elke dealer met een leeg segment) zijn het de bestaande
 * vier, in dezelfde volgorde. Het motorsegment (api/_segment.js) gebruikt
 * testrit i.p.v. proefrit en voegt onderhoud en waardering toe. 'proefrit' is
 * voor motor een ALIAS van testrit (oude data, een model dat het woord toch
 * gebruikt) en wordt bij het normaliseren omgezet -- zo staat er nooit een
 * autowoord in een motorafspraak en blijft oude data leesbaar.
 *
 * Een nieuw segment krijgt zijn lijst door een regel in SEGMENT_TYPES; een
 * nieuw type door een regel in TYPES. Verhuur is bewust niet aanwezig: geen
 * enkele klant biedt het aan -- het mechanisme staat het toe, de data niet.
 *
 * Geen route, geen Airtable: zuivere data.
 */

/* Per type: of het een rit is (telt als 'proefrit' voor leadscore en
   overzicht), de standaardduur als de klant er zelf geen heeft, en de naam in
   vier talen. duurMin is null waar de bestaande tenantinstelling blijft
   gelden -- de vier oorspronkelijke types veranderen niet. */
const TYPES = Object.freeze({
  proefrit:     { rit: true,  duurMin: null, label: { nl: 'proefrit',     fr: 'essai',          en: 'test drive',   de: 'Probefahrt'   } },
  bezichtiging: { rit: false, duurMin: null, label: { nl: 'bezichtiging', fr: 'visite',         en: 'viewing',      de: 'Besichtigung' } },
  ophaling:     { rit: false, duurMin: null, label: { nl: 'ophaling',     fr: 'enlèvement',     en: 'pick-up',      de: 'Abholung'     } },
  gesprek:      { rit: false, duurMin: null, label: { nl: 'gesprek',      fr: 'discussion',     en: 'conversation', de: 'Gespräch'     } },
  /* Motor. De duren zijn standaardwaarden, geen feiten over een dealer: een
     testrit duurt langer dan een kijkmoment. */
  testrit:      { rit: true,  duurMin: 60,   label: { nl: 'testrit',      fr: 'essai routier',  en: 'test ride',    de: 'Probefahrt'   } },
  onderhoud:    { rit: false, duurMin: 30,   label: { nl: 'onderhoud',    fr: 'entretien',      en: 'service',      de: 'Service'      } },
  waardering:   { rit: false, duurMin: 30,   label: { nl: 'waardering',   fr: 'estimation',     en: 'valuation',    de: 'Bewertung'    } },
});

/* De types per segment, in de volgorde waarin ze aan het model getoond worden.
   `auto` is de standaard en mag NOOIT veranderen: er hangen momentopnamen aan. */
const SEGMENT_TYPES = Object.freeze({
  auto:  Object.freeze(['proefrit', 'bezichtiging', 'ophaling', 'gesprek']),
  motor: Object.freeze(['testrit', 'bezichtiging', 'ophaling', 'gesprek', 'onderhoud', 'waardering']),
});

/* Oude of afwijkende sleutels die per segment naar een echte sleutel gaan. */
const ALIAS = Object.freeze({
  motor: Object.freeze({ proefrit: 'testrit' }),
});

/* Wat standaard geboekt wordt binnen een dealership als er niets gevraagd is. */
const STANDAARD = Object.freeze({ auto: 'proefrit', motor: 'testrit' });

function segmentNaam(segment) {
  const s = String(segment == null ? '' : segment).trim().toLowerCase();
  return SEGMENT_TYPES[s] ? s : 'auto';
}

/** De geldige sleutels voor dit segment (leeg/onbekend = de bestaande vier). */
function typesVoor(segment) { return SEGMENT_TYPES[segmentNaam(segment)]; }

/**
 * Een door een model of client opgegeven type -> een geldige sleutel voor dit
 * segment, of ''. Hoofdletters en spaties maken niet uit; een alias wordt
 * omgezet; al het andere (ook een geldig type van een ANDER segment) is leeg.
 */
function normaliseer(type, segment) {
  const seg = segmentNaam(segment);
  let t = String(type == null ? '' : type).trim().toLowerCase();
  if (ALIAS[seg] && ALIAS[seg][t]) t = ALIAS[seg][t];
  return SEGMENT_TYPES[seg].indexOf(t) !== -1 ? t : '';
}

/** Het type dat een geldige of lege invoer oplevert: de gevraagde, anders de standaard. */
function kiesType(type, segment) {
  return normaliseer(type, segment) || STANDAARD[segmentNaam(segment)];
}

/** Naam van een type in een taal. Onbekend type -> de sleutel zelf. */
function label(type, taal) {
  const def = TYPES[String(type || '').trim().toLowerCase()];
  if (!def) return String(type || '');
  const t = String(taal || 'nl').slice(0, 2).toLowerCase();
  return def.label[t] || def.label.nl;
}

/** Is dit een rit (proefrit of testrit)? Voor leadscore en overzichten. */
function isRit(type) {
  const def = TYPES[String(type || '').trim().toLowerCase()];
  return !!(def && def.rit);
}

/** Standaardduur van dit type in minuten, of de terugval (de tenantinstelling). */
function duurMin(type, terugval) {
  const def = TYPES[String(type || '').trim().toLowerCase()];
  return def && def.duurMin ? def.duurMin : terugval;
}

module.exports = {
  TYPES, SEGMENT_TYPES, ALIAS, STANDAARD,
  typesVoor, normaliseer, kiesType, label, isRit, duurMin,
};
