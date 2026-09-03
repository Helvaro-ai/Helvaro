'use strict';
/*
 * Salesforce -- Lead.
 *
 * -- Wat hiervan geverifieerd is ---------------------------------------------
 *   - client-credentials-flow: POST {domein}/services/oauth2/token met
 *     grant_type=client_credentials, client_id en client_secret, als
 *     x-www-form-urlencoded. Het antwoord bevat access_token EN instance_url,
 *     en die instance_url is de basis voor alles daarna -- niet het domein
 *     waar je het token ophaalde.
 *   - aanmaken: POST {instance_url}/services/data/v{n}/sobjects/Lead
 *   - Lead VEREIST LastName en Company. Ontbreekt er een, dan geeft Salesforce
 *     REQUIRED_FIELD_MISSING en gaat de hele lead niet door.
 *
 * NIET tegen een echte org gedraaid. `node scripts/crm-check.js salesforce`.
 *
 * -- Company: het veld dat Helvaro niet heeft --------------------------------
 * Salesforce is gebouwd voor B2B; een Lead hoort bij een bedrijf. Een lead die
 * een appartement zoekt heeft er geen. We MOETEN iets invullen, dus:
 *     de volledige naam van de lead, en als die er niet is: "Particulier".
 * Dat is de gangbare oplossing bij B2C-koppelingen en het is eerlijk: de
 * makelaar ziet in de kolom Company hetzelfde als in de naam, en niet een
 * verzonnen bedrijfsnaam waar hij later op zou kunnen filteren.
 *
 * -- LastName: waarom dat het LAATSTE woord is -------------------------------
 * Zie splitsNaam() in api/_crm/vorm.js. Kort: bij een naam van één woord is dat
 * woord de ACHTERnaam, want een lege LastName wordt geweigerd en een lege
 * FirstName niet.
 *
 * -- De API-versie wordt opgehaald, niet ingetypt ----------------------------
 * /services/data/ geeft de versies terug die DEZE org kent. Een hard ingetypte
 * versie is een gok die op oudere orgs een 404 geeft en op nieuwe orgs jaren
 * achterloopt. Eén extra aanroep bij het koppelen kost minder dan die twee
 * soorten fouten samen.
 */

const { vraag, json, CrmError } = require('../http');
const { keurUrl } = require('../adres');   // het domein komt van de klant

const NAAM = 'Salesforce';

const velden = [
  {
    sleutel: 'domein',
    label: 'My Domain',
    type: 'tekst',
    hint: 'De URL waar je inlogt, bijvoorbeeld kantoorpeeters.my.salesforce.com.',
  },
  { sleutel: 'clientId',     label: 'Consumer Key',    type: 'geheim',
    hint: 'Van de Connected App / External Client App, met de client-credentials-flow aan.' },
  { sleutel: 'clientSecret', label: 'Consumer Secret', type: 'geheim' },
];

/* Alleen echte Salesforce-hosts. Elke org zit op een van deze achtervoegsels
   -- ook sandboxen (die staan op *.sandbox.my.salesforce.com, en dat valt onder
   .my.salesforce.com). */
const SF_HOSTS = ['.my.salesforce.com', '.salesforce.com', '.force.com'];

/**
 * Het domein van de klant, streng.
 *
 * -- Waarom dit meer doet dan http eraf halen --------------------------------
 * Dit is invoer van de klant waar onze server een POST met een clientSecret
 * naartoe stuurt. De vorige versie deed alleen een replace op het schema en het
 * pad, en liet dus "10.0.0.5:8443" en "slachtoffer@aanvaller.tld" gewoon door.
 * Het eerste maakt van het koppelscherm een poortscanner op ons interne
 * netwerk; het tweede laat het adres eruitzien als iets anders dan waar het
 * heen gaat.
 *
 * new URL() haalt de gebruikersnaam er correct af (.hostname negeert alles voor
 * de @), en daarna moet de host op een echt Salesforce-achtervoegsel eindigen.
 * Dat is strenger dan de IP-controle in adres.js en bewust: bij Salesforce
 * weten we welke hosts kunnen bestaan, en dan is een lijst beter dan een
 * afweging.
 */
function salesforceHost(ruw) {
  let d = String(ruw || '').trim().toLowerCase();
  if (!d) throw new CrmError('Vul eerst je Salesforce-domein in.', { code: 'geen_domein' });
  if (!/^https?:\/\//.test(d)) d = 'https://' + d;
  let u;
  try { u = new URL(d); } catch (_) {
    throw new CrmError('Dat is geen geldig Salesforce-domein.', { code: 'geen_domein' });
  }
  const host = u.hostname;
  if (!SF_HOSTS.some((achter) => host.endsWith(achter))) {
    throw new CrmError(
      'Dat ziet er niet uit als een Salesforce-domein. Gebruik het adres waarop je inlogt, '
      + 'bijvoorbeeld kantoorpeeters.my.salesforce.com.',
      { code: 'geen_salesforce_domein' },
    );
  }
  return host;
}

function basisUrl(cred) {
  return `https://${salesforceHost(cred && cred.domein)}`;
}

/* ── Toegangstoken ──────────────────────────────────────────────────────────
   Een client-credentials-token leeft kort. Het per aanroep opnieuw halen is
   veilig maar verdubbelt de latentie van elke synchronisatie, dus: onthouden
   per instantie, met een marge van een minuut. Dit is geheugen van één
   serverless-instantie -- verdwijnt bij een koude start, en dat is prima. */
const tokens = new Map();

function tokenSleutel(cred) {
  return `${cred.domein}|${cred.clientId}`;
}

async function toegangstoken(cred) {
  const sleutel = tokenSleutel(cred);
  const bekend = tokens.get(sleutel);
  if (bekend && bekend.verlooptOp > Date.now() + 60_000) return bekend;

  if (!cred.clientId || !cred.clientSecret) {
    throw new CrmError('Vul eerst de Salesforce Consumer Key en Secret in.', { code: 'geen_sleutel' });
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     cred.clientId,
    client_secret: cred.clientSecret,
  }).toString();

  /* Twee sloten op dezelfde deur. salesforceHost() zegt dat het een
     Salesforce-NAAM is; dit zegt dat die naam ook naar een publiek adres wijst.
     Klanten beheren zelf subdomeinen onder force.com, dus de naam alleen is niet
     genoeg om te weten waar het pakket heen gaat. */
  await keurUrl(`${basisUrl(cred)}/`);

  const r = await vraag(`${basisUrl(cred)}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    leverancier: NAAM,
  });

  if (!r.access_token || !r.instance_url) {
    /* Salesforce geeft bij een verkeerd ingestelde app een 200 met een
       error-veld in plaats van een 4xx. Dat is precies het geval dat je zonder
       deze controle pas merkt als er nooit een lead aankomt. */
    throw new CrmError(
      'Salesforce gaf geen toegangstoken terug. Staat de client-credentials-flow aan '
      + 'en is er een uitvoerende gebruiker ingesteld op de app?',
      { code: 'geen_token', detail: JSON.stringify(r).slice(0, 300) },
    );
  }

  /* De instance_url komt van Salesforce, maar hij komt terug van een host die de
     klant koos -- dus hij is net zo goed invoer van de klant. Zonder deze
     controle kan een verkeerd domein alsnog elke volgende aanroep ergens anders
     heen sturen. */
  const instanceHost = salesforceHost(r.instance_url);

  const bewaard = {
    token: r.access_token,
    instance: `https://${instanceHost}`,
    /* Salesforce geeft geen expires_in bij deze flow. Een half uur is ruim
       binnen elke sessieduur die een org kan instellen; loopt het token toch
       eerder af, dan geeft de eerstvolgende aanroep een 401 en halen we een
       nieuw token (zie metToken hieronder). */
    verlooptOp: Date.now() + 30 * 60 * 1000,
  };
  tokens.set(sleutel, bewaard);
  return bewaard;
}

/**
 * Een aanroep met een token, en precies één herkansing bij een 401.
 *
 * Die herkansing is er omdat een token buiten onze controle ongeldig kan worden
 * (een beheerder die de app aanpast, een sessie-instelling die korter is dan
 * onze marge). Zonder deze lus zou dat een dag lang mislukte synchronisaties
 * opleveren tot de instantie koud werd.
 */
async function metToken(cred, doe) {
  let t = await toegangstoken(cred);
  try {
    return await doe(t);
  } catch (err) {
    if (!(err instanceof CrmError && err.status === 401)) throw err;
    tokens.delete(tokenSleutel(cred));
    t = await toegangstoken(cred);
    return doe(t);
  }
}

async function nieuwsteVersie(t) {
  try {
    const versies = await json(`${t.instance}/services/data/`, 'GET', undefined,
      { Authorization: `Bearer ${t.token}` }, { leverancier: NAAM });
    const lijst = Array.isArray(versies) ? versies : [];
    const nummers = lijst
      .map((v) => parseFloat(v.version))
      .filter((n) => Number.isFinite(n));
    if (!nummers.length) return '';
    return `v${Math.max(...nummers).toFixed(1)}`;
  } catch (err) {
    console.warn('[crm/salesforce] versielijst niet gelezen:', err && err.message);
    return '';
  }
}

async function test(cred) {
  return metToken(cred, async (t) => {
    const versie = await nieuwsteVersie(t);
    if (!versie) {
      throw new CrmError(
        'Salesforce gaf geen API-versies terug. Heeft de gekoppelde gebruiker API-toegang?',
        { code: 'geen_versie' },
      );
    }
    /* Bewijst het schrijfrecht niet, maar wel dat Lead bestaat en leesbaar is.
       Een echte testlead aanmaken zou wél alles bewijzen en laat rommel achter
       in de org van de klant; dat is het niet waard. */
    await json(`${t.instance}/services/data/${versie}/sobjects/Lead/describe`, 'GET', undefined,
      { Authorization: `Bearer ${t.token}` }, { leverancier: NAAM });
    return { ok: true, account: t.instance.replace(/^https?:\/\//, ''), extra: { versie } };
  });
}

function leadVelden(vorm) {
  const v = {
    LastName: vorm.contact.achternaam || 'Onbekend',
    /* Zie de kop: Company is verplicht en Helvaro heeft er geen. */
    Company:  vorm.contact.volledig || 'Particulier',
    LeadSource: vorm.deal.bron || 'WhatsApp',
  };
  if (vorm.contact.voornaam) v.FirstName = vorm.contact.voornaam;
  if (vorm.contact.telefoon) v.Phone = vorm.contact.telefoon;

  const regels = [
    vorm.deal.samenvatting && `Samenvatting: ${vorm.deal.samenvatting}`,
    vorm.deal.capaciteit && `Budget: ${vorm.deal.capaciteit}`,
    vorm.deal.urgentie && `Timing: ${vorm.deal.urgentie}`,
    vorm.deal.fit && `Fit: ${vorm.deal.fit}`,
    vorm.deal.pand && `Pand: ${vorm.deal.pand}`,
    vorm.deal.waarde !== null && `Verwachte waarde: ${vorm.deal.waarde} ${vorm.deal.valuta}`,
  ].filter(Boolean);
  if (regels.length) v.Description = regels.join('\n').slice(0, 32000);

  /* Status is een keuzelijst die per org anders is. Een waarde die er niet in
     staat laat Salesforce de HELE lead weigeren, dus die sturen we niet mee --
     de org houdt zijn eigen standaardstatus. */
  return v;
}

/* SOQL-escaping. Een E.164-nummer bevat alleen cijfers en een plus, dus dit kan
   nooit iets doen -- en staat er precies daarom: de dag dat iemand deze functie
   op een naam of een adres loslaat, is dit het verschil tussen een query en een
   injectie. Salesforce escapet met een backslash. */
function soql(waarde) {
  return String(waarde == null ? '' : waarde).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Bestaat er al een lead met dit nummer?
 *
 * Salesforce ontdubbelt zelf niet op telefoon, dus zonder deze vraag maakt een
 * tweede synchronisatie van dezelfde lead een tweede Lead-record -- precies wat
 * er gebeurt als het terugschrijven van het id een keer mislukt (zie de kop van
 * api/_crm/index.js).
 *
 * IsConverted = false, want een geconverteerde lead is al een Contact en een
 * Opportunity geworden; die opnieuw bijwerken mag niet en zou de makelaar zijn
 * eigen werk afpakken.
 */
async function zoekOpTelefoon(t, versie, telefoon) {
  if (!telefoon) return '';
  try {
    const q = `SELECT Id FROM Lead WHERE Phone = '${soql(telefoon)}' AND IsConverted = false `
            + 'ORDER BY CreatedDate DESC LIMIT 1';
    const r = await json(`${t.instance}/services/data/${versie}/query/?q=${encodeURIComponent(q)}`,
      'GET', undefined, { Authorization: `Bearer ${t.token}` }, { leverancier: NAAM });
    const eerste = (r.records || [])[0];
    return eerste ? String(eerste.Id) : '';
  } catch (err) {
    console.warn('[crm/salesforce] zoeken op telefoon mislukt:', err && err.message);
    return '';
  }
}

async function duwLead(cred, vorm, vorige = {}) {
  return metToken(cred, async (t) => {
    const versie = (cred.versie) || await nieuwsteVersie(t);
    if (!versie) throw new CrmError('Salesforce-API-versie onbekend.', { code: 'geen_versie' });
    const basis = `${t.instance}/services/data/${versie}/sobjects/Lead`;
    const kop = { Authorization: `Bearer ${t.token}` };

    let leadId = String(vorige.contactId || '');
    if (!leadId) leadId = await zoekOpTelefoon(t, versie, vorm.contact.telefoon);
    if (leadId) {
      try {
        /* PATCH op een bestaande Lead geeft 204 zonder body. */
        await json(`${basis}/${encodeURIComponent(leadId)}`, 'PATCH', leadVelden(vorm), kop, { leverancier: NAAM });
        return { contactId: leadId, dealId: leadId };
      } catch (err) {
        /* 404 = weg. 400 met ENTITY_IS_DELETED of een geconverteerde lead:
           hetzelfde gevolg, opnieuw aanmaken. Een geconverteerde lead is
           trouwens de normale gang van zaken zodra de makelaar ermee aan de
           slag gaat -- dat mag geen rode synchronisatie opleveren. */
        const weg = err instanceof CrmError
          && (err.status === 404 || /ENTITY_IS_DELETED|CANNOT_UPDATE_CONVERTED_LEAD/i.test(err.detail || ''));
        if (!weg) throw err;
        leadId = '';
      }
    }

    const gemaakt = await json(basis, 'POST', leadVelden(vorm), kop, { leverancier: NAAM });
    const id = String(gemaakt.id || '');
    if (!id) throw new CrmError('Salesforce maakte de lead niet aan.', { code: 'geen_id' });
    /* Eén object voor beide: bij Salesforce IS de Lead zowel het contact als de
       kans. index.js bewaart ze allebei, zodat de vorm gelijk blijft aan die van
       de andere adapters. */
    return { contactId: id, dealId: id };
  });
}

/* Salesforce heeft de samenvatting al in Description staan; een aparte notitie
   zou hetzelfde twee keer tonen. */
async function duwNotitie() { return { notitieId: '' }; }

module.exports = { naam: 'salesforce', label: NAAM, velden, test, duwLead, duwNotitie, leadVelden, soql, salesforceHost, SF_HOSTS };
