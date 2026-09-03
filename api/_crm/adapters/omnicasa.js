'use strict';
/*
 * Omnicasa -- persoon registreren.
 *
 * -- Wat hiervan geverifieerd is, en wat niet --------------------------------
 * GEVERIFIEERD (uit de open-source PHP-client van fw4, die Omnicasa zelf als
 * referentie noemt):
 *   - basis-URL:  https://omnicasaapiv3.omnicasa.com/cre/
 *   - POST person/register/{secret}
 *   - POST contactonme/{secret}
 *   - de sleutel zit IN HET PAD, niet in een header en niet in de body
 *   - de client wordt gemaakt met een secret plus een taalcode
 *
 * NIET GEVERIFIEERD: de VELDNAMEN in de body. Die staan in geen enkele
 * publieke bron -- Omnicasa geeft de documentatie alleen aan partners met een
 * sleutel. De namen in VELDEN hieronder zijn dus een aanname, en de enige die
 * dat is.
 *
 * -- Daarom staat de veldafbeelding bovenaan en niet verspreid ---------------
 * Zodra iemand de echte documentatie heeft, is dit bestand aangepast door één
 * object te wijzigen. Klopt een naam niet, dan is het ook per klant te
 * overschrijven (cred.velden) zonder een nieuwe uitrol. Dat is de hele reden
 * dat die indirectie er is; hij is niet netter, hij is sneller te repareren.
 *
 *   node scripts/crm-check.js omnicasa
 *
 * zegt welke naam er niet klopt -- maar pas zodra er echt een lead doorgaat.
 * Het koppelen zelf raakt hun API niet aan; zie test() hieronder voor waarom.
 *
 * -- LET OP: er zijn twee Omnicasa-API's -------------------------------------
 * Deze is de CRE-API (commercieel vastgoed). Er bestaat daarnaast een oudere
 * dienst op newapi.omnicasa.com/1.8/OmnicasaService.svc die met CustomerName en
 * CustomerPassword werkt, en een residentieel kantoor in Vlaanderen zit
 * mogelijk op DIE. Het scherm vraagt daarom ook de basis-URL, met de CRE-URL
 * als standaard: een klant die de andere heeft hoeft niet te wachten op een
 * uitrol, en wij doen niet alsof we weten welke van de twee hij gebruikt.
 */

const { json, CrmError } = require('../http');

const NAAM = 'Omnicasa';
const STANDAARD_BASIS = 'https://omnicasaapiv3.omnicasa.com/cre';

/* DE AANNAME. Links onze neutrale vorm, rechts hoe Omnicasa het veld volgens
   onze beste inschatting noemt. Alles wat hier fout staat is één regel werk. */
const VELDEN = Object.freeze({
  voornaam:   'FirstName',
  achternaam: 'LastName',
  telefoon:   'Mobile',
  taal:       'LanguageId',
  opmerking:  'Remark',
  bron:       'Source',
});

const velden = [
  { sleutel: 'secret', label: 'API-sleutel', type: 'geheim',
    hint: 'Krijg je van Omnicasa. Vraag erbij welke API je account gebruikt.' },
  { sleutel: 'basis', label: 'API-adres', type: 'tekst', optioneel: true,
    hint: `Laat leeg voor ${STANDAARD_BASIS}. Gebruik je de oudere OmnicasaService, vul dan dat adres in.` },
];

function basisUrl(cred) {
  const b = String((cred && cred.basis) || STANDAARD_BASIS).trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(b)) {
    /* Geen http. De sleutel zit in het PAD, dus een onversleutelde aanroep zet
       hem in elke log tussen hier en daar. */
    throw new CrmError('Het Omnicasa-adres moet met https:// beginnen.', { code: 'geen_https' });
  }
  return b;
}

function pad(cred, endpoint) {
  if (!cred || !cred.secret) throw new CrmError('Vul eerst de Omnicasa-sleutel in.', { code: 'geen_sleutel' });
  return `${basisUrl(cred)}/${endpoint}/${encodeURIComponent(cred.secret)}`;
}

/**
 * Testen kan hier NIET zonder te schrijven -- en dus testen we niet.
 *
 * -- Waarom hier een uitzondering staat --------------------------------------
 * Elke andere adapter bewijst bij het koppelen dat de sleutel werkt, met een
 * LEESactie. Omnicasa heeft in de publieke beschrijving geen enkel leesbaar
 * endpoint: er is person/register en contactonme, en dat zijn er twee die
 * schrijven.
 *
 * Hier stond eerst een POST met een lege body, in de aanname dat hun validatie
 * dat zou weigeren en we daarmee de sleutel bewezen. Dat is een gok met de
 * verkeerde inzet: als die aanname niet klopt, staat er na elke koppelpoging
 * een lege persoon in het CRM van een makelaar. Ik weet niet welke van de twee
 * het is, en dat is precies de reden om het niet te doen -- zeker niet in een
 * controle die zichzelf "er komt niets bij" noemt.
 *
 * Dus: we controleren wat we kunnen (is er een sleutel, is het adres https), we
 * slaan op, en we zeggen er eerlijk bij dat dit de enige koppeling is die pas
 * bij de eerste echte lead bewijst dat hij werkt. Dat is minder mooi dan een
 * groen vinkje en het is waar.
 */
async function test(cred) {
  if (!cred || !String(cred.secret || '').trim()) {
    throw new CrmError('Vul eerst de Omnicasa-sleutel in.', { code: 'geen_sleutel' });
  }
  basisUrl(cred);   // gooit bij http:// of een onleesbaar adres
  return {
    ok: true,
    account: 'Opgeslagen — bevestigt zich bij de eerste lead',
    onbevestigd: true,
    extra: {},
  };
}

function persoonBody(cred, vorm) {
  const v = { ...VELDEN, ...((cred && cred.velden) || {}) };
  const body = {};
  if (vorm.contact.voornaam)   body[v.voornaam]   = vorm.contact.voornaam;
  if (vorm.contact.achternaam) body[v.achternaam] = vorm.contact.achternaam;
  if (vorm.contact.telefoon)   body[v.telefoon]   = vorm.contact.telefoon;
  if (vorm.contact.taal)       body[v.taal]       = vorm.contact.taal;
  body[v.bron] = vorm.deal.bron || 'WhatsApp';

  const regels = [
    vorm.deal.samenvatting && `Samenvatting: ${vorm.deal.samenvatting}`,
    vorm.deal.capaciteit && `Budget: ${vorm.deal.capaciteit}`,
    vorm.deal.urgentie && `Timing: ${vorm.deal.urgentie}`,
    vorm.deal.pand && `Pand: ${vorm.deal.pand}`,
    vorm.deal.waarde !== null && `Verwachte waarde: ${vorm.deal.waarde} ${vorm.deal.valuta}`,
  ].filter(Boolean);
  if (regels.length) body[v.opmerking] = regels.join('\n');

  return body;
}

/**
 * De lead naar Omnicasa.
 *
 * Er is geen bijwerk-endpoint in de publieke beschrijving, alleen register.
 * Daarom slaan we een lead die AL een id heeft over in plaats van hem opnieuw
 * te registreren: twee keer registreren is twee contacten, en dat is erger dan
 * een samenvatting die een dag oud is. Zodra er een update-endpoint bekend is,
 * hoort die hier.
 */
async function duwLead(cred, vorm, vorige = {}) {
  if (vorige.contactId) return { contactId: String(vorige.contactId), dealId: '', overgeslagen: true };

  const r = await json(pad(cred, 'person/register'), 'POST', persoonBody(cred, vorm), {}, { leverancier: NAAM });
  /* Welke sleutel het id draagt is onbekend; dit zijn de gebruikelijke namen.
     Vindt hij niets, dan is de registratie wél gelukt en bewaren we de sleutel
     die we zelf al hadden, zodat we niet elke keer opnieuw registreren. */
  const id = r && (r.Id || r.id || r.PersonId || r.personId || (r.Data && r.Data.Id));
  return { contactId: String(id || vorm.sleutel), dealId: '' };
}

async function duwNotitie() { return { notitieId: '' }; }

module.exports = { naam: 'omnicasa', label: NAAM, velden, test, duwLead, duwNotitie, VELDEN, STANDAARD_BASIS, persoonBody };
