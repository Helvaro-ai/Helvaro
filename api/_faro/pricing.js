'use strict';
/*
 * Prijsadvies -- wat vragen kopers, en wat zegt de markt.
 *
 * -- Waarom dit bestand voorzichtig is met het woord "marktwaarde" -----------
 * Helvaro heeft geen verkoopcijfers. Het heeft `Verwachte Waarde` per lead:
 * vrije tekst die uit een WhatsApp-gesprek komt of die de makelaar zelf
 * intikte. Dat is wat KOPERS zeggen te willen betalen -- vraagzijde, geen
 * transactiedata. Het is bruikbaar en zelfs zeldzaam (niemand anders heeft de
 * uitstoot van die gesprekken), maar het is niet hetzelfde als "dit pand is
 * X waard", en dat verschil verzwijgen zou precies de verzonnen zekerheid zijn
 * die CLAUDE.md verbiedt.
 *
 * Daarom draagt ELK getal hier een bron, en scheidt de uitvoer twee dingen die
 * makkelijk door elkaar lopen:
 *
 *   vraagzijde  -- mediaan/spreiding van budgetten van EIGEN leads
 *   markt       -- externe verkoopstatistiek, alleen als die gekoppeld is
 *
 * Zonder externe bron zegt het advies dat het die niet heeft. Het verzint er
 * geen.
 *
 * -- Waarom de mediaan en niet het gemiddelde --------------------------------
 * Een lead die "1.2M" zei tilt het gemiddelde van tien leads met 350k op naar
 * 435k, en daar prijs je een huis mee dat vervolgens blijft staan. De mediaan
 * doet dat niet. Het gemiddelde staat er wel bij, want als die twee ver uit
 * elkaar liggen is DAT het interessante signaal.
 */

const data = require('./data');

/* Onder dit aantal is een mediaan geen mediaan maar een anekdote. Vier kopers
   die toevallig ruim zitten zeggen niets over een segment. Het advies blijft
   dan bestaan, maar zegt expliciet dat het te weinig is om op te sturen. */
const MIN_SAMPLE = 8;

/* Hoe ver terug we kijken. Budgetten van twee jaar geleden zijn geen signaal
   meer over de prijs van vandaag. */
const DEFAULT_DAYS = 180;

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Waarde op percentiel p (0..1), lineair geinterpoleerd. */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

/* Trefwoorden die een lead aan een segment binden. Bewust simpel: dit zoekt in
   tekst die een mens heeft getypt, en een slimme parser die er soms naast zit
   is hier erger dan een domme die je kunt navertellen. */
function matchesSegment(lead, segment) {
  if (!segment) return true;
  const needles = String(segment).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!needles.length) return true;
  const hay = [lead.samenvatting, lead.reden, lead.notities, lead.verwachteWaarde, lead.gesprek]
    .map((v) => String(v == null ? '' : v).toLowerCase())
    .join('   ');
  // ALLE woorden moeten voorkomen: "3 slaapkamers gent" mag niet elk pand in
  // Gent teruggeven.
  return needles.every((n) => hay.indexOf(n) !== -1);
}

/**
 * Vraagzijde: wat zeggen de kopers van DEZE makelaar te willen betalen.
 *
 * Geeft altijd een bron terug, en betrouwbaar:false zodra de steekproef te
 * klein is om op te sturen.
 */
function demandSide(leads, { segment = '', days = DEFAULT_DAYS } = {}) {
  const since = Number.isFinite(days) && days > 0 ? Date.now() - days * 86400000 : null;

  const inScope = (leads || []).filter((l) => {
    if (!l) return false;
    if (since != null) {
      const t = Date.parse(l.datum);
      if (!Number.isFinite(t) || t < since) return false;
    }
    return matchesSegment(l, segment);
  });

  const budgets = inScope
    .map((l) => data.parseBudget(l.verwachteWaarde))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const totaal = inScope.length;
  const met    = budgets.length;

  if (!met) {
    return {
      bron: 'eigen leads',
      segment: segment || 'alle',
      periodeDagen: days,
      aantalLeads: totaal,
      aantalMetBudget: 0,
      betrouwbaar: false,
      reden: totaal
        ? 'Wel leads in dit segment, maar bij geen enkele staat een bruikbaar budget.'
        : 'Geen leads in dit segment in deze periode.',
    };
  }

  const som = budgets.reduce((a, b) => a + b, 0);
  return {
    bron: 'eigen leads',
    segment: segment || 'alle',
    periodeDagen: days,
    aantalLeads: totaal,
    aantalMetBudget: met,
    mediaan: median(budgets),
    gemiddelde: Math.round(som / met),
    p25: percentile(budgets, 0.25),
    p75: percentile(budgets, 0.75),
    laagste: budgets[0],
    hoogste: budgets[budgets.length - 1],
    betrouwbaar: met >= MIN_SAMPLE,
    reden: met >= MIN_SAMPLE
      ? ''
      : 'Gebaseerd op ' + met + ' budget(ten). Onder ' + MIN_SAMPLE
        + ' is dit een indruk, geen cijfer om een vraagprijs op te zetten.',
  };
}

/*
 * -- Externe marktbron -------------------------------------------------------
 * Bewust een seam en geen implementatie. De eerlijke kandidaat voor Belgie is
 * Statbel, dat mediane verkoopprijzen per gemeente en woningtype publiceert.
 *
 * Die koppeling is NIET gebouwd, en dat is hier zichtbaar in plaats van
 * weggemoffeld: zolang er geen bron gekoppeld is geeft dit null terug en zegt
 * het advies hieronder dat het geen marktcijfer heeft. Een getal verzinnen dat
 * eruitziet als een verkoopstatistiek is precies de fout die deze hele module
 * probeert te vermijden.
 *
 * Aansluiten betekent: een module die { mediaanPrijs, gemeente, woningtype,
 * periode, bron, bronUrl } teruggeeft, en die hier injecteren.
 */
function marketSide(_opts = {}) {
  return null;
}

/** Alleen hele euro's, en nooit een valse precisie van centen. */
function eur(n) {
  if (!Number.isFinite(n)) return '--';
  return '€' + Math.round(n).toLocaleString('nl-BE');
}

/**
 * Het advies zelf.
 *
 * De aanbevolen vraagprijs is bewust de P75 van de vraagzijde en niet de
 * mediaan: op de mediaan prijzen betekent dat de helft van je geinteresseerde
 * kopers je pand per definitie te duur vindt. P75 laat ruimte om te zakken en
 * houdt het kwart kopers dat ruimer zit binnen bereik. Bij een te kleine
 * steekproef wordt er GEEN prijs aanbevolen -- dan is "ik weet het niet" het
 * juiste antwoord.
 */
function advise({ leads, segment = '', days = DEFAULT_DAYS, market } = {}) {
  const demand = demandSide(leads, { segment, days });
  const markt  = market === undefined ? marketSide({ segment }) : market;

  const uitleg = [];
  let aanbevolen = null;

  if (demand.aantalMetBudget && demand.betrouwbaar) {
    aanbevolen = demand.p75;
    uitleg.push(
      demand.aantalMetBudget + ' van je ' + demand.aantalLeads + ' leads in dit segment noemden een budget. '
      + 'Mediaan ' + eur(demand.mediaan) + ', middenmoot ' + eur(demand.p25) + '-' + eur(demand.p75) + '.',
    );
    uitleg.push(
      'Advies ' + eur(aanbevolen) + ': dat is het 75e percentiel. Op de mediaan prijzen betekent dat de helft '
      + 'van je geinteresseerden je pand te duur vindt; hier houd je het ruimere kwart binnen bereik en '
      + 'heb je marge om te zakken.',
    );
    if (demand.gemiddelde > demand.mediaan * 1.2) {
      uitleg.push(
        'Let op: het gemiddelde (' + eur(demand.gemiddelde) + ') ligt fors boven de mediaan. Een paar hoge '
        + 'budgetten trekken dat omhoog -- stuur op de mediaan, niet op het gemiddelde.',
      );
    }
  } else {
    uitleg.push(demand.reden || 'Te weinig gegevens voor een prijsadvies.');
    uitleg.push('Zonder genoeg budgetten geef ik liever geen vraagprijs dan een verzonnen vraagprijs.');
  }

  if (markt && Number.isFinite(markt.mediaanPrijs)) {
    uitleg.push('Marktcijfer (' + markt.bron + '): mediane verkoopprijs ' + eur(markt.mediaanPrijs) + '.');
  } else {
    uitleg.push(
      'Dit is de vraagzijde: wat kopers zeggen te willen betalen, uit je eigen gesprekken. '
      + 'Het is geen verkoopstatistiek -- er is geen externe marktbron gekoppeld.',
    );
  }

  return {
    aanbevolenPrijs: aanbevolen,
    vraagzijde: demand,
    markt: markt || null,
    uitleg,
    // Expliciet, zodat de UI en de AI nooit "marktwaarde" boven een getal
    // kunnen zetten dat uit budgetten komt.
    bronnen: markt ? ['eigen leads', markt.bron] : ['eigen leads'],
  };
}

module.exports = {
  advise, demandSide, marketSide,
  median, percentile, matchesSegment, eur,
  MIN_SAMPLE, DEFAULT_DAYS,
};
