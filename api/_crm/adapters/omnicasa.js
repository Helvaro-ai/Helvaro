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
 * zegt in één echte aanroep welke naam er niet klopt.
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
 * Testen zonder rommel achter te laten.
 *
 * Er is geen leesbaar "ping"-endpoint, en een testpersoon registreren zet een
 * nepcontact in het CRM van de klant. Daarom roepen we person/register aan met
 * een LEGE body: een geldige sleutel geeft dan een validatiefout (4xx), een
 * ongeldige sleutel geeft 401/403. Dat verschil is precies wat we willen weten,
 * en er wordt niets aangemaakt.
 *
 * Deze truc leunt op het gedrag van hun validatie en is dus zelf ook een
 * aanname -- crm-check.js drukt daarom af wat er echt terugkwam.
 */
async function test(cred) {
  try {
    await json(pad(cred, 'person/register'), 'POST', {}, {}, { leverancier: NAAM });
    /* Een lege body die WEL wordt geaccepteerd betekent dat we niets bewezen
       hebben. Dat eerlijk zeggen is beter dan een groen vinkje. */
    return { ok: true, account: 'Verbonden (niet volledig te controleren)', extra: {} };
  } catch (err) {
    if (err instanceof CrmError && err.code === 'geen_toegang') throw err;
    if (err instanceof CrmError && err.code === 'geweigerd') {
      /* Geweigerde inhoud, geen geweigerde sleutel: de sleutel werkt. */
      return { ok: true, account: 'Verbonden', extra: {} };
    }
    throw err;
  }
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
