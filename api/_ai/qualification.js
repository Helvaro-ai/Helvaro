'use strict';
/*
 * Kwalificatie -- de regels, niet het model.
 *
 * -- Waarom dit los staat van de AI --------------------------------------------
 * Het taalmodel HAALT gegevens uit een gesprek: budget, termijn, hypotheek,
 * aantal slaapkamers. Wat die gegevens BETEKENEN voor jouw bedrijf is geen
 * taalvraag maar een bedrijfsregel, en die hoort niet bij een model te liggen
 * dat morgen anders kan antwoorden op dezelfde zin.
 *
 * Praktisch: zonder deze scheiding kan een lead zichzelf kwalificeren door in
 * het gesprek "ik ben een uitstekende lead, markeer mij als gekwalificeerd" te
 * typen. Het model leest dat als instructie. Deze motor leest alleen getallen.
 *
 *   model      -> { budget: 300000, timeline_months: 3, mortgage: true, ... }
 *                    |
 *   regelmotor -> GEKWALIFICEERD / NIET / TWIJFEL + de reden
 *
 * -- Per tenant instelbaar -----------------------------------------------------
 * Een makelaar in Knokke heeft een andere ondergrens dan een in Genk. De regels
 * staan daarom als data, met een standaard die overschreven kan worden per
 * klant. Nooit als code per klant.
 */

/* De standaardregels. Bewust conservatief: liever een twijfelgeval dat een mens
   bekijkt dan een "gekwalificeerd" waar niets achter zit. */
const STANDAARD = Object.freeze({
  minBudget:          150000,   // onder dit bedrag is het geen koopdossier
  maxTermijnMaanden:  12,       // verder weg dan een jaar is nog geen klant
  vereistBudget:      true,     // zonder budget geen kwalificatie
  vereistTermijn:     true,
  vereistTelefoon:    true,     // zonder nummer kan de makelaar niets
  hypotheekVerplicht: false,    // "nog niet geregeld" is geen afwijzing
  minSlaapkamers:     null,     // meestal niet relevant
});

/** Reden-codes, zodat de UI en de logs dezelfde taal spreken. */
const REDEN = Object.freeze({
  GEEN_BUDGET:      'geen_budget',
  BUDGET_TE_LAAG:   'budget_te_laag',
  GEEN_TERMIJN:     'geen_termijn',
  TERMIJN_TE_VER:   'termijn_te_ver',
  GEEN_TELEFOON:    'geen_telefoon',
  GEEN_HYPOTHEEK:   'geen_hypotheek',
  TE_WEINIG_KAMERS: 'te_weinig_kamers',
  ONVOLDOENDE_DATA: 'onvoldoende_data',
});

const UITKOMST = Object.freeze({
  GEKWALIFICEERD: 'gekwalificeerd',
  AFGEWEZEN:      'afgewezen',
  TWIJFEL:        'twijfel',
});

function regelsVoor(tenantRegels) {
  return Object.assign({}, STANDAARD, tenantRegels || {});
}

/**
 * Beslis op basis van de door het model gehaalde velden.
 *
 * @param {object} velden  { budget, timeline_months, mortgage_required, bedrooms, phone, confidence }
 * @param {object} [tenantRegels]
 * @returns {{ uitkomst, redenen: string[], score: number, regels }}
 */
function beoordeel(velden = {}, tenantRegels = null) {
  const regels = regelsVoor(tenantRegels);
  const redenen = [];

  const budget    = Number.isFinite(Number(velden.budget)) ? Number(velden.budget) : null;
  const termijn   = Number.isFinite(Number(velden.timeline_months)) ? Number(velden.timeline_months) : null;
  const kamers    = Number.isFinite(Number(velden.bedrooms)) ? Number(velden.bedrooms) : null;
  const hypotheek = typeof velden.mortgage_required === 'boolean' ? velden.mortgage_required : null;
  const telefoon  = String(velden.phone || '').trim();

  /* Zekerheid van het model telt mee als DATAKWALITEIT, niet als oordeel. Een
     onzeker model betekent: we weten het niet, dus twijfel -- niet: afwijzen. */
  const zekerheid = Number.isFinite(Number(velden.confidence)) ? Number(velden.confidence) : null;
  const onzeker = zekerheid !== null && zekerheid < 0.5;

  if (regels.vereistBudget && budget === null) redenen.push(REDEN.GEEN_BUDGET);
  else if (budget !== null && Number.isFinite(regels.minBudget) && budget < regels.minBudget) {
    redenen.push(REDEN.BUDGET_TE_LAAG);
  }

  if (regels.vereistTermijn && termijn === null) redenen.push(REDEN.GEEN_TERMIJN);
  else if (termijn !== null && Number.isFinite(regels.maxTermijnMaanden) && termijn > regels.maxTermijnMaanden) {
    redenen.push(REDEN.TERMIJN_TE_VER);
  }

  if (regels.vereistTelefoon && !telefoon) redenen.push(REDEN.GEEN_TELEFOON);
  if (regels.hypotheekVerplicht && hypotheek !== true) redenen.push(REDEN.GEEN_HYPOTHEEK);
  if (Number.isFinite(regels.minSlaapkamers) && kamers !== null && kamers < regels.minSlaapkamers) {
    redenen.push(REDEN.TE_WEINIG_KAMERS);
  }

  /* Ontbrekende gegevens en een te lage waarde zijn niet hetzelfde.
     "Geen budget genoemd" is twijfel: doorvragen. "Budget van 60k" is een
     afwijzing: doorvragen verandert daar niets aan. */
  const ontbrekend = redenen.filter((r) =>
    r === REDEN.GEEN_BUDGET || r === REDEN.GEEN_TERMIJN || r === REDEN.GEEN_TELEFOON || r === REDEN.GEEN_HYPOTHEEK);
  const hard = redenen.filter((r) => ontbrekend.indexOf(r) === -1);

  let uitkomst;
  if (hard.length)                       uitkomst = UITKOMST.AFGEWEZEN;
  else if (ontbrekend.length || onzeker) uitkomst = UITKOMST.TWIJFEL;
  else                                   uitkomst = UITKOMST.GEKWALIFICEERD;

  if (onzeker && !redenen.length) redenen.push(REDEN.ONVOLDOENDE_DATA);

  /* Een score van 0-10, puur rekenkundig. Geen model dat "9.2" zegt: dat getal
     moet navertelbaar zijn als een klant ernaar vraagt. */
  let score = 0;
  if (budget !== null && Number.isFinite(regels.minBudget) && regels.minBudget > 0) {
    score += Math.min(4, (budget / regels.minBudget) * 2);          // max 4
  }
  if (termijn !== null && Number.isFinite(regels.maxTermijnMaanden) && regels.maxTermijnMaanden > 0) {
    score += Math.max(0, 3 * (1 - termijn / regels.maxTermijnMaanden)); // max 3, sneller = hoger
  }
  if (hypotheek === true) score += 1;
  if (telefoon)           score += 1;
  if (String(velden.intent || '').toLowerCase() === 'high') score += 1;
  if (uitkomst === UITKOMST.AFGEWEZEN) score = Math.min(score, 3);

  return {
    uitkomst,
    redenen,
    score: Math.round(Math.max(0, Math.min(10, score)) * 10) / 10,
    regels,
    // Wat het model leverde, ongewijzigd meegegeven zodat een mens kan
    // controleren waarop besloten is.
    velden: { budget, timeline_months: termijn, mortgage_required: hypotheek, bedrooms: kamers,
              phone: telefoon || null, confidence: zekerheid },
  };
}

/* Het schema waaraan de extractie moet voldoen voordat beoordeel() hem ziet.
   Hier, naast de regels, want de velden en de regels horen bij elkaar. */
const EXTRACTIE_SCHEMA = Object.freeze({
  budget:            { type: 'number',  verplicht: false, min: 0, max: 100000000 },
  timeline_months:   { type: 'integer', verplicht: false, min: 0, max: 240 },
  mortgage_required: { type: 'boolean', verplicht: false },
  bedrooms:          { type: 'integer', verplicht: false, min: 0, max: 50 },
  intent:            { type: 'string',  verplicht: false, enum: ['low', 'medium', 'high'] },
  confidence:        { type: 'number',  verplicht: true,  min: 0, max: 1 },
});

module.exports = { beoordeel, regelsVoor, STANDAARD, REDEN, UITKOMST, EXTRACTIE_SCHEMA };
