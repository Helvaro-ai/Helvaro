'use strict';
/*
 * CRM -- de neutrale vorm van een lead.
 *
 * -- Waarom hier en niet in elke adapter --------------------------------------
 * Vijf CRM's, vijf woordenboeken. HubSpot noemt het een contact met een deal,
 * Pipedrive een person met een deal, Salesforce propt allebei in een Lead, en
 * Whise en Omnicasa denken in vastgoedtermen. Als elke adapter zelf uit het
 * Airtable-record mag lezen, dan splitst elke adapter ook zelf de naam, parseert
 * elke adapter zelf het budget, en verzint elke adapter zelf wat er gebeurt als
 * "Verwachte Waarde" leeg is. Dat gaat vijf keer nét anders, en het verschil
 * merk je pas als een klant zegt dat zijn HubSpot een andere achternaam toont
 * dan zijn Pipedrive.
 *
 * Dus: dit bestand kent api/_leads-read.js, en de adapters kennen alleen dit.
 * Een adapter die `lead.fields` aanraakt doet iets fout.
 *
 * -- Wat hier NIET gebeurt ----------------------------------------------------
 * Niets verzinnen. Een onbekend budget is `null`, geen 0 -- een deal van
 * EUR 0,00 in de pijplijn van de makelaar is een verzonnen cijfer, en die
 * staan hier niet (zie CLAUDE.md). Hetzelfde voor de score en de achternaam.
 */

const data = require('../_faro/data');      // parseBudget: al gehard op vrije tekst
const regio = require('../_regio');         // land, munt en E.164 per klant

/* De vier fasen die het product zelf hanteert. Ze komen uit _faro/data.js zodat
   de pijplijn in het dashboard en de fase in het CRM niet uit elkaar kunnen
   lopen -- dat is precies het soort verschil dat niemand ziet tot een makelaar
   zijn twee schermen naast elkaar legt. */
const FASEN = data.STAGES.map((s) => s.key);

function faseVan(lead) {
  const treffer = data.STAGES.find((s) => s.test(lead));
  return treffer ? treffer.key : 'new';
}

/**
 * Een naam in voor- en achternaam.
 *
 * Het formulier vraagt om EEN naamveld, dus hier komt van alles binnen: "Jan",
 * "Jan Peeters", "jan peeters", "Van den Broeck". Salesforce weigert een Lead
 * zonder LastName, dus dit moet altijd iets teruggeven.
 *
 * De regel: het LAATSTE woord is de achternaam, de rest de voornaam. Bij een
 * naam van een woord is dat woord de ACHTERnaam en blijft de voornaam leeg --
 * andersom zou Salesforce alsnog weigeren, en een leeg voornaamveld is eerlijk
 * terwijl een verzonnen achternaam dat niet is.
 *
 * "Van den Broeck" wordt zo voornaam "Van den" + achternaam "Broeck". Dat is
 * fout, en het is bewust niet opgelost: een tussenvoegsellijst die "van", "de",
 * "den", "der", "ter", "'t" kent werkt voor Nederlandstalige namen en breekt op
 * "De Souza" en "Van Damme" als artiestennaam. Een half-goede heuristiek die
 * soms de verkeerde kant op raadt is hier slechter dan een domme regel die
 * altijd hetzelfde doet en die een makelaar in twee seconden zelf corrigeert.
 */
function splitsNaam(ruw) {
  const schoon = String(ruw || '').replace(/\s+/g, ' ').trim();
  if (!schoon) return { voornaam: '', achternaam: '', volledig: '' };
  const delen = schoon.split(' ');
  if (delen.length === 1) return { voornaam: '', achternaam: delen[0], volledig: schoon };
  return {
    voornaam:   delen.slice(0, -1).join(' '),
    achternaam: delen[delen.length - 1],
    volledig:   schoon,
  };
}

/**
 * Het telefoonnummer zoals een CRM het wil zien: E.164 MET plus.
 *
 * _regio.naarE164() geeft kale cijfers terug omdat WhatsApp het zo wil. Elk CRM
 * hier toont het nummer aan een mens en verwacht de plus. Die plus hoort dus op
 * de grens gezet te worden, niet in _regio -- anders moet WhatsApp hem er weer
 * afhalen.
 *
 * Onleesbaar nummer -> lege string. Een half nummer in het CRM is erger dan
 * geen nummer: de makelaar belt en krijgt iemand anders.
 */
function telefoonVoorCrm(ruw, r) {
  const cijfers = regio.naarE164(ruw, r);
  return cijfers ? '+' + cijfers : '';
}

/**
 * De titel van de deal/opportunity.
 *
 * Een makelaar ziet in zijn CRM een lijst met tientallen regels. "Lead" als
 * titel is daar waardeloos. Naam plus pandcode is het kortste dat hem laat
 * kiezen zonder te klikken.
 */
function dealTitel(naam, pand) {
  const wie = naam || 'Onbekende lead';
  return pand ? `${wie} - ${pand}` : wie;
}

/**
 * Een lead (de vorm die _leads-read.mapLead teruggeeft) -> de neutrale vorm.
 *
 * @param {object} lead            zoals mapLead() hem oplevert
 * @param {object} [opties]
 * @param {object} [opties.regio]  regio.lees(clientFields); anders de standaard
 * @param {string} [opties.kantoor] naam van het makelaarskantoor, voor context
 *                                  in het CRM ("waar komt deze lead vandaan")
 * @returns {object} de vorm die elke adapter leest
 */
function uitLead(lead, opties = {}) {
  const l = lead || {};
  const r = opties.regio || regio.standaard();
  const naam = splitsNaam(l.naam);
  const budget = data.parseBudget(l.verwachteWaarde);

  return {
    /* De idempotentiesleutel. Stabiel over de hele levensduur van de lead, want
       hij hangt aan het Airtable-record-id en niet aan het telefoonnummer: een
       lead die van nummer wisselt blijft dezelfde deal, en twee leads die
       hetzelfde nummer delen (een koppel dat om beurten typt) blijven twee. */
    sleutel: `helvaro-${l.id || ''}`,

    contact: {
      voornaam:   naam.voornaam,
      achternaam: naam.achternaam,
      volledig:   naam.volledig,
      telefoon:   telefoonVoorCrm(l.telefoon, r),
      /* Er is bewust GEEN e-mailadres. Helvaro vraagt er nooit om -- het hele
         product loopt over WhatsApp. Elke adapter die op e-mail wil ontdubbelen
         moet dus op telefoon ontdubbelen, en dat staat in die adapters ook zo
         opgeschreven. */
      taal:       String(l.taal || '').toLowerCase() || '',
    },

    deal: {
      titel:          dealTitel(naam.volledig, l.property),
      /* null = onbekend, en dat is een geldig antwoord. Zie de kop. */
      waarde:         budget,
      valuta:         r.valuta,
      fase:           faseVan(l),
      gekwalificeerd: Boolean(l.qualified),
      score:          Number.isFinite(l.leadScore) && l.leadScore > 0 ? l.leadScore : null,
      bron:           l.bron || 'WhatsApp',
      samenvatting:   String(l.samenvatting || '').slice(0, 2000),
      reden:          String(l.reden || '').slice(0, 500),
      pand:           l.property || '',
      capaciteit:     l.capaciteit || '',
      urgentie:       l.urgentie || '',
      fit:            l.fit || '',
      afspraak:       Boolean(l.afspraakGeboekt),
    },

    herkomst: {
      projectCode: String(opties.projectCode || ''),
      leadId:      String(l.id || ''),
      kantoor:     String(opties.kantoor || ''),
      aangemaakt:  l.datum || '',
    },
  };
}

module.exports = { uitLead, splitsNaam, telefoonVoorCrm, dealTitel, faseVan, FASEN };
