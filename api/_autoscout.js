'use strict';
/*
 * Van een WhatsApp-bericht naar een auto.
 *
 * ── Wat er echt gebeurt ─────────────────────────────────────────────────────
 * Op AutoScout24 staat bij een advertentie een WhatsApp-knop. Wie erop klikt
 * krijgt WhatsApp open met een VOORGEVULD bericht, en daar staat de link naar
 * het aanbod in. In de praktijk ziet dat er zo uit:
 *
 *   "Hallo, ik heb interesse in het volgende voertuig. Aanbodnummer:
 *    https://www.autoscout24.be/aanbod/bmw-m4-.....-a1b2c3d4-....."
 *
 * De koper heeft dus AL verteld welke auto hij bedoelt. Hij hoort dat geen
 * tweede keer te moeten doen, en Faro hoort er niet naar te raden.
 *
 * ── De MVP werkt met de URL alleen ──────────────────────────────────────────
 * Dit bestand haalt het aanbodnummer uit de link en zoekt daarmee in de
 * voorraad van DEZE dealer. Meer is er niet nodig: de dealer heeft de auto zelf
 * ingevoerd, dus alle gegevens staan al in Helvaro.
 *
 * Er wordt met opzet GEEN pagina opgehaald. Scrapen van AutoScout24 zou een
 * afhankelijkheid maken van hun opmaak, van hun bot-detectie en van hun
 * beschikbaarheid -- en dat allemaal midden in het verzendpad van een
 * leadgesprek, waar een trage of geblokkeerde oproep betekent dat een koper
 * geen antwoord krijgt. Een lead zonder voertuigfiche is vervelend; een lead
 * zonder antwoord is een verloren deal.
 *
 * Staat de auto niet in de voorraad, dan valt alles netjes terug: Faro krijgt
 * de lijst en de opdracht om te VRAGEN, precies zoals bij panden.
 *
 * ── Wat een aanbodnummer is ─────────────────────────────────────────────────
 * AutoScout24 gebruikt een UUID-achtige sleutel achteraan het pad:
 *   /aanbod/<slug>-<8>-<4>-<4>-<4>-<12>
 * Daarnaast bestaan er kortere numerieke ids in oudere links en in
 * partnerfeeds. Allebei worden herkend; wat er uitkomt is de string die in het
 * veld `AutoScout ID` op het voertuig hoort te staan.
 *
 * ── Geen route ──────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* De hosts die als AutoScout24 tellen. Expliciete lijst en geen
   /autoscout24/-test op de hele URL: dan zou een link naar
   "mijn-autoscout24-tips.blogspot.com" ook meetellen, en dat is precies het
   soort bijna-goed dat later een verkeerde auto oplevert. */
const HOSTS = Object.freeze([
  'autoscout24.be', 'autoscout24.nl', 'autoscout24.de', 'autoscout24.fr',
  'autoscout24.com', 'autoscout24.it', 'autoscout24.es', 'autoscout24.at',
  'autoscout24.lu', 'autoscout24.pl', 'autoscout24.se',
]);

/* De UUID-vorm die AutoScout24 achter de slug hangt. Hoofdletterongevoelig,
   want links worden overgetypt en doorgestuurd. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/* Oudere, numerieke aanbod-ids. Minstens zeven cijfers: korter is een
   huisnummer, een postcode of een prijs, en die staan ook in zo'n bericht. */
const NUMERIEK = /\b(\d{7,12})\b/;

/**
 * Alle http(s)-links uit een stuk tekst.
 * Bewust ruim: WhatsApp plakt er soms leestekens tegenaan.
 */
function linksUit(tekst) {
  const t = String(tekst == null ? '' : tekst);
  const uit = [];
  const re = /https?:\/\/[^\s<>"'\])]+/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    /* Een punt of komma pal achter een URL hoort bij de zin, niet bij de link. */
    uit.push(m[0].replace(/[.,;:!?]+$/, ''));
  }
  return uit;
}

function hostVan(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) { return ''; }
}

/**
 * Is dit een AutoScout24-link?
 * Kijkt naar de HOST en niet naar de hele URL, zodat een willekeurige pagina
 * die het woord bevat niet meetelt.
 */
function isAutoscoutLink(url) {
  const h = hostVan(url);
  if (!h) return false;
  return HOSTS.some((d) => h === d || h.endsWith('.' + d));
}

/**
 * Het aanbodnummer uit één link.
 * @returns {string} het id, of '' als er geen in zit
 */
function aanbodIdUit(url) {
  if (!isAutoscoutLink(url)) return '';
  let u;
  try { u = new URL(String(url)); } catch (_) { return ''; }

  /* Eerst het pad: daar staat de UUID die AutoScout24 vandaag gebruikt. */
  const inPad = UUID.exec(u.pathname);
  if (inPad) return inPad[0].toLowerCase();

  /* Dan de queryparameters die in partner- en deellinks voorkomen. */
  for (const sleutel of ['id', 'offerId', 'offer', 'guid', 'articleId']) {
    const v = u.searchParams.get(sleutel);
    if (!v) continue;
    const alsUuid = UUID.exec(v);
    if (alsUuid) return alsUuid[0].toLowerCase();
    if (/^\d{7,12}$/.test(v.trim())) return v.trim();
  }

  /* Tot slot een numeriek id in het pad, voor oudere links. */
  const cijfers = NUMERIEK.exec(u.pathname);
  return cijfers ? cijfers[1] : '';
}

/**
 * Leest een binnenkomend bericht en zegt wat het over een voertuig prijsgeeft.
 *
 * Geeft ALTIJD een object terug, ook als er niets in stond. Deze functie zit in
 * het verzendpad van een leadgesprek en mag nooit werpen -- een bericht dat
 * niet over een auto gaat is het normale geval, geen fout.
 *
 * @param {string} tekst
 * @returns {{isAutoscout:boolean, aanbodId:string, link:string, links:string[]}}
 */
function lees(tekst) {
  const links = linksUit(tekst);
  const asLinks = links.filter(isAutoscoutLink);
  for (const l of asLinks) {
    const id = aanbodIdUit(l);
    if (id) return { isAutoscout: true, aanbodId: id, link: l, links };
  }
  /* Wel een AutoScout-link, maar er zit geen bruikbaar nummer in. Dat is nog
     steeds informatie: we weten dat dit een dealership-lead uit AutoScout24 is,
     en de link kan alsnog letterlijk matchen met Listing URL op een voertuig. */
  if (asLinks.length) return { isAutoscout: true, aanbodId: '', link: asLinks[0], links };
  return { isAutoscout: false, aanbodId: '', link: '', links };
}

/**
 * Zoek het voertuig waar dit bericht over gaat.
 *
 * Drie sporen, van zeker naar onzeker, en het stopt bij het eerste dat treft:
 *
 *   1. Het aanbodnummer uit de link. Dit is de koppeling waar de hele vertical
 *      op leunt en hij is exact -- geen gok.
 *   2. De link zelf tegen Listing URL. Voor het geval de dealer de link wel
 *      invulde maar het nummer (nog) niet.
 *   3. Merk, model en uitvoering uit de tekst. Voor de koper die zonder link
 *      schrijft.
 *
 * Vindt geen enkel spoor iets, dan komt er null uit en hoort de aanroeper Faro
 * de lijst te geven met de opdracht om te VRAGEN. Nooit gokken.
 *
 * @param {object} vehicles   de module api/_vehicles.js
 * @param {string} projectCode
 * @param {string} tekst      wat de lead schreef (alleen zijn eigen berichten)
 */
async function herken(vehicles, projectCode, tekst) {
  const gelezen = lees(tekst);
  const leeg = { voertuig: null, via: 'geen', autoscout: gelezen };

  if (!projectCode) return leeg;
  if (!(await vehicles.available())) return leeg;

  /* 1. Het aanbodnummer. */
  if (gelezen.aanbodId) {
    const v = await vehicles.getByAutoscout(projectCode, gelezen.aanbodId);
    if (v) return { voertuig: v, via: 'aanbodnummer', autoscout: gelezen };
  }

  const voorraad = await vehicles.list(projectCode, { alleenPubliek: true });

  /* 2. De link letterlijk tegen Listing URL. Genormaliseerd, want een link die
     via WhatsApp is doorgestuurd krijgt er vaak tracking-parameters bij. */
  if (gelezen.link) {
    const kaal = (u) => {
      try {
        const x = new URL(String(u));
        return (x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname).replace(/\/+$/, '').toLowerCase();
      } catch (_) { return String(u || '').trim().toLowerCase(); }
    };
    const doel = kaal(gelezen.link);
    const treffer = voorraad.find((v) => v.link && kaal(v.link) === doel);
    if (treffer) return { voertuig: treffer, via: 'link', autoscout: gelezen };
  }

  /* 3. Uit de tekst. Kan bewust null geven bij gelijkspel. */
  const m = vehicles.matchUitTekst(voorraad, tekst);
  if (m.voertuig) return { voertuig: m.voertuig, via: 'tekst', autoscout: gelezen };

  return { voertuig: null, via: m.reden === 'meerdere' ? 'meerdere' : 'geen',
           kandidaten: m.kandidaten || [], autoscout: gelezen };
}

module.exports = {
  HOSTS,
  linksUit,
  hostVan,
  isAutoscoutLink,
  aanbodIdUit,
  lees,
  herken,
};
