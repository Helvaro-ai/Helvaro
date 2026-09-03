'use strict';
/*
 * HubSpot -- contact + deal.
 *
 * -- Wat hiervan geverifieerd is ---------------------------------------------
 * De vorm hieronder is nagetrokken in de documentatie van HubSpot, niet uit het
 * hoofd geschreven (zie de kop van api/_crm/index.js voor waarom dat verschil
 * hier zo zwaar weegt):
 *   - POST /crm/v3/objects/contacts  met  { properties: {...} }
 *   - POST /crm/v3/objects/deals     met  { properties: {...}, associations: [...] }
 *   - de koppeling deal -> contact is associationTypeId 3, categorie
 *     HUBSPOT_DEFINED, en mag mee in het aanmaakverzoek
 *   - authenticatie is een private-app-token als `Authorization: Bearer`
 *
 * NIET tegen een echte portal gedraaid -- dat kan pas met een sleutel. Draai
 * `node scripts/crm-check.js hubspot` zodra die er is; dat script doet precies
 * deze aanroepen en zegt welke aanname sneuvelt.
 *
 * -- HubSpot verwacht een e-mailadres, en dat hebben we niet ------------------
 * De hele ontdubbeling van HubSpot hangt aan e-mail. Helvaro vraagt nooit om
 * een e-mailadres: het product loopt over WhatsApp en heeft alleen een
 * telefoonnummer. Daarom:
 *   1. het gevonden contact-id wordt teruggeschreven op de lead (zie
 *      api/_crm/index.js) -- DAT is de echte ontdubbeling;
 *   2. de zoekopdracht op telefoon hieronder is alleen de terugval voor de
 *      eerste keer, en zoekt op precies het nummer dat wij ook wegschrijven.
 * Zoeken op telefoon is bij HubSpot gevoelig voor schrijfwijze (+32470... vindt
 * 0470... niet). Dat is bewust geaccepteerd: het ergste geval is één dubbel
 * contact bij de allereerste synchronisatie, en dat is beter dan een
 * fuzzy-match die twee verschillende leads samenvoegt.
 *
 * -- Fasen ------------------------------------------------------------------
 * `dealstage` wordt alleen meegestuurd als bij het koppelen een pijplijn is
 * gevonden. Een verzonnen stage-id ("appointmentscheduled") werkt op een
 * standaardportal en breekt op elke portal met een eigen pijplijn -- en dan
 * weigert HubSpot de HELE deal, niet alleen dat veld.
 */

const { json, CrmError } = require('../http');

const BASIS = 'https://api.hubapi.com';
const NAAM = 'HubSpot';

/* Onze vier fasen, in de volgorde waarin ze in een pijplijn horen. De index in
   deze lijst is de index in de stage-lijst van de klant. */
const FASE_VOLGORDE = ['new', 'contacted', 'qualified', 'booked'];

function koppen(cred) {
  return { Authorization: `Bearer ${cred.token}` };
}

/** Wat de klant moet invullen in het koppelscherm. */
const velden = [
  {
    sleutel: 'token',
    label: 'Private app token',
    type: 'geheim',
    hint: 'HubSpot > Instellingen > Integraties > Private apps. Rechten nodig: '
        + 'crm.objects.contacts (lezen + schrijven) en crm.objects.deals (lezen + schrijven).',
  },
];

/**
 * Bewijs dat de sleutel werkt EN dat de rechten kloppen.
 *
 * Twee aanroepen, met opzet: een token met alleen leesrecht op contacten komt
 * door de eerste en zakt door de tweede. Dat verschil bij het koppelen vinden
 * is veel goedkoper dan het over twee weken ontdekken doordat er geen enkele
 * deal in de pijplijn staat.
 */
async function test(cred) {
  if (!cred || !cred.token) throw new CrmError('Vul eerst het HubSpot-token in.', { code: 'geen_sleutel' });

  await json(`${BASIS}/crm/v3/objects/contacts?limit=1`, 'GET', undefined, koppen(cred), { leverancier: NAAM });

  /* De pijplijnen zijn tegelijk de tweede rechtencontrole en de bron van de
     fase-afbeelding. Lukt dit niet, dan koppelen we alsnog -- zonder fasen. */
  let pijplijn = null;
  try {
    const p = await json(`${BASIS}/crm/v3/pipelines/deals`, 'GET', undefined, koppen(cred), { leverancier: NAAM });
    const eerste = (p.results || [])[0];
    if (eerste) {
      const stages = (eerste.stages || [])
        .slice()
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
        .map((s) => s.id);
      if (stages.length) pijplijn = { id: eerste.id, label: eerste.label || '', stages };
    }
  } catch (err) {
    console.warn('[crm/hubspot] pijplijnen niet gelezen, fasen blijven leeg:', err && err.message);
  }

  return {
    ok: true,
    /* Wat de klant in het scherm ziet als bewijs dat dit de goede omgeving is.
       HubSpot geeft geen portalnaam terug op deze endpoints, dus dit is het
       eerlijkste dat er is: welke pijplijn we gaan vullen. */
    account: pijplijn ? `Pijplijn: ${pijplijn.label || pijplijn.id}` : 'Verbonden',
    extra: { pijplijn },
  };
}

/* De stage die bij onze fase hoort, of undefined als we het niet weten. */
function stageVoor(cred, fase) {
  const p = cred && cred.pijplijn;
  if (!p || !Array.isArray(p.stages) || !p.stages.length) return undefined;
  const i = FASE_VOLGORDE.indexOf(fase);
  if (i < 0) return undefined;
  /* Klemmen: een pijplijn met drie stages krijgt 'booked' op de laatste, niet
     op een index die niet bestaat. */
  return p.stages[Math.min(i, p.stages.length - 1)];
}

function contactEigenschappen(vorm) {
  const e = {
    phone: vorm.contact.telefoon,
    lifecyclestage: 'lead',
  };
  if (vorm.contact.voornaam)   e.firstname = vorm.contact.voornaam;
  if (vorm.contact.achternaam) e.lastname  = vorm.contact.achternaam;
  /* hs_lead_status is een standaardveld met een vaste keuzelijst; een eigen
     waarde erin weigert HubSpot. Daarom staat de kwalificatie in de
     samenvatting en niet in een veld dat we niet controleren. */
  return e;
}

async function zoekContactOpTelefoon(cred, telefoon) {
  if (!telefoon) return '';
  try {
    const r = await json(`${BASIS}/crm/v3/objects/contacts/search`, 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: telefoon }] }],
      properties: ['phone'],
      limit: 1,
    }, koppen(cred), { leverancier: NAAM });
    const eerste = (r.results || [])[0];
    return eerste ? String(eerste.id) : '';
  } catch (err) {
    /* Zoeken is een gemak, geen voorwaarde. Mislukt het, dan maken we een nieuw
       contact -- een dubbel contact is hinderlijk, een mislukte synchronisatie
       is erger. */
    console.warn('[crm/hubspot] zoeken op telefoon mislukt:', err && err.message);
    return '';
  }
}

/**
 * De lead naar HubSpot.
 *
 * @param {object} cred    { token, pijplijn? }
 * @param {object} vorm    api/_crm/vorm.js
 * @param {object} vorige  { contactId, dealId } uit een eerdere synchronisatie
 * @returns {Promise<{contactId: string, dealId: string}>}
 */
async function duwLead(cred, vorm, vorige = {}) {
  const props = contactEigenschappen(vorm);

  /* Een bekend id is de goedkoopste weg: bijwerken zonder eerst te zoeken.
     Is er geen, dan zoeken we één keer op telefoon; levert dat ook niets op,
     dan pas maken we iets nieuws aan. Precies één schrijfactie per lead. */
  let contactId = String(vorige.contactId || '');
  if (!contactId) contactId = await zoekContactOpTelefoon(cred, vorm.contact.telefoon);

  if (contactId) {
    /* Een 404 betekent dat iemand het contact in HubSpot heeft verwijderd. Dan
       maken we het opnieuw aan in plaats van de hele synchronisatie te laten
       falen -- de makelaar heeft de lead nog steeds. */
    try {
      await json(`${BASIS}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
        'PATCH', { properties: props }, koppen(cred), { leverancier: NAAM });
    } catch (err) {
      if (err instanceof CrmError && err.status === 404) contactId = '';
      else throw err;
    }
  }

  if (!contactId) {
    const gemaakt = await json(`${BASIS}/crm/v3/objects/contacts`,
      'POST', { properties: props }, koppen(cred), { leverancier: NAAM });
    contactId = String(gemaakt.id || '');
    if (!contactId) throw new CrmError('HubSpot maakte het contact niet aan.', { code: 'geen_id' });
  }

  /* ── De deal ────────────────────────────────────────────────────────────── */
  const dealProps = { dealname: vorm.deal.titel };
  /* Alleen een bedrag als er een bedrag IS. Zie CLAUDE.md: geen verzonnen
     cijfers -- een deal van EUR 0 vervuilt de pijplijnwaarde van de makelaar. */
  if (vorm.deal.waarde !== null) dealProps.amount = String(vorm.deal.waarde);
  const stage = stageVoor(cred, vorm.deal.fase);
  if (stage) {
    dealProps.dealstage = stage;
    if (cred.pijplijn && cred.pijplijn.id) dealProps.pipeline = cred.pijplijn.id;
  }

  let dealId = String(vorige.dealId || '');
  if (dealId) {
    try {
      await json(`${BASIS}/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,
        'PATCH', { properties: dealProps }, koppen(cred), { leverancier: NAAM });
      return { contactId, dealId };
    } catch (err) {
      if (!(err instanceof CrmError && err.status === 404)) throw err;
      dealId = '';
    }
  }

  const deal = await json(`${BASIS}/crm/v3/objects/deals`, 'POST', {
    properties: dealProps,
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
    }],
  }, koppen(cred), { leverancier: NAAM });

  return { contactId, dealId: String(deal.id || '') };
}

/**
 * Wat de assistent te weten kwam, als notitie bij het contact.
 *
 * Dit is bewust een aparte stap: een notitie die faalt mag de deal niet
 * meeslepen, en de samenvatting verandert bij elke beurt terwijl de deal dat
 * niet doet.
 */
async function duwNotitie(cred, vorm, ids = {}) {
  const regels = [
    vorm.deal.samenvatting && `Samenvatting: ${vorm.deal.samenvatting}`,
    vorm.deal.capaciteit && `Budget: ${vorm.deal.capaciteit}`,
    vorm.deal.urgentie && `Timing: ${vorm.deal.urgentie}`,
    vorm.deal.fit && `Fit: ${vorm.deal.fit}`,
    vorm.deal.pand && `Pand: ${vorm.deal.pand}`,
    vorm.deal.reden && `Reden: ${vorm.deal.reden}`,
  ].filter(Boolean);
  if (!regels.length) return { notitieId: '' };

  const body = {
    properties: {
      hs_note_body: regels.join('\n'),
      hs_timestamp: new Date().toISOString(),
    },
    associations: [],
  };
  /* Notitie -> contact is associationTypeId 202 (HUBSPOT_DEFINED). Dat getal is
     NIET nagetrokken zoals de 3 hierboven wel is; daarom staat deze aanroep in
     zijn eigen try in index.js en is een mislukte notitie geen mislukte sync. */
  if (ids.contactId) {
    body.associations.push({
      to: { id: ids.contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    });
  }
  const r = await json(`${BASIS}/crm/v3/objects/notes`, 'POST', body, koppen(cred), { leverancier: NAAM });
  return { notitieId: String(r.id || '') };
}

module.exports = { naam: 'hubspot', label: NAAM, velden, test, duwLead, duwNotitie, FASE_VOLGORDE };
