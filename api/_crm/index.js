'use strict';
/*
 * CRM -- de enige deur naar buiten.
 *
 *                        ┌→ Whise      (nog niet beschikbaar, zie ./adapters/whise.js)
 *                        ├→ HubSpot
 *   lead → deze module → ├→ Pipedrive
 *                        ├→ Omnicasa
 *                        └→ Salesforce
 *
 * -- Waarom er precies één deur is -------------------------------------------
 * Vijf CRM's die vanuit drie plekken in de code aangeroepen worden is vijftien
 * plekken waar de tenantcontrole moet kloppen, waar een time-out gezet moet
 * zijn, en waar iemand kan vergeten dat een CRM-storing geen WhatsApp-antwoord
 * mag tegenhouden. Eén deur is één plek.
 *
 * -- Faalt zacht, altijd -----------------------------------------------------
 * Dit hangt aan het pad waarlangs een lead een antwoord krijgt. Een CRM dat
 * traag is, plat ligt of een sleutel weigert mag dat antwoord NOOIT ophouden.
 * duwVeilig() gooit daarom niet -- dezelfde afspraak die api/_gcal.js met zijn
 * aanroepers heeft. duw() gooit wel, en is voor het scherm: daar wil de klant
 * juist zien wat er misging.
 *
 * -- Niet twee keer dezelfde deal --------------------------------------------
 * Wat het CRM teruggeeft (contact-id, deal-id) gaat terug op de lead, in de
 * JSON-blob in Notities waar aiPaused en property ook staan. Bij de volgende
 * synchronisatie is dat een bijwerking in plaats van een tweede deal.
 *
 * Die blob is de enige plek die zonder Airtable-schemawijziging werkt, en dat
 * is hier belangrijker dan netheid: een koppeling die pas werkt nadat de
 * eigenaar zes velden heeft aangemaakt, werkt in de praktijk niet. (Er is één
 * veld dat hij WEL moet aanmaken, voor de sleutels zelf -- zie ./config.js,
 * dat het ook zegt in plaats van stilletjes te falen.)
 *
 * -- De race die hierin zit, benoemd -----------------------------------------
 * api/whatsapp.js schrijft ook naar Notities. Wij lezen de blob die de
 * aanroeper al in handen heeft, voegen onze sleutel toe en schrijven terug. Twee
 * schrijvers binnen dezelfde seconde kunnen elkaars sleutel kwijtmaken. Het
 * gevolg is bekend en beperkt: één dubbele deal bij de volgende synchronisatie,
 * en voor HubSpot, Pipedrive en Salesforce vangt het zoeken-op-telefoon in de
 * adapter dat alsnog op. Een echte oplossing (een eigen veld, of een lees-
 * modificeer-schrijf per lead) kost een schemawijziging of een extra
 * Airtable-aanroep per lead; dat is het voor dit gevolg niet waard.
 */

const config = require('./config');
const vormen = require('./vorm');
const regio = require('../_regio');
const { CrmError } = require('./http');
const leadsRead = require('../_leads-read');

const ADAPTERS = {
  hubspot:    require('./adapters/hubspot'),
  pipedrive:  require('./adapters/pipedrive'),
  salesforce: require('./adapters/salesforce'),
  omnicasa:   require('./adapters/omnicasa'),
  whise:      require('./adapters/whise'),
};

const NOTITIES_VELD = 'fldoLRI5W12ThTls7';
const AT_TIMEOUT_MS = 10_000;

/** Alles wat het scherm moet weten om een koppelformulier te tekenen. */
function adapters() {
  return Object.values(ADAPTERS).map((a) => ({
    naam: a.naam,
    label: a.label,
    velden: a.velden,
    beschikbaar: a.beschikbaar !== false,
    ontbreekt: a.ontbreekt || [],
  }));
}

function adapter(naam) {
  const a = ADAPTERS[String(naam || '').toLowerCase()];
  if (!a) throw new CrmError('Onbekend CRM.', { code: 'onbekend_crm' });
  return a;
}

/* ── De ids die we al kennen, per lead ──────────────────────────────────────
   Vorm in de blob:  crm: { hubspot: { contactId, dealId, op } }
   Onleesbare of ontbrekende JSON leest als "nog nooit gesynchroniseerd", en dat
   is het goede antwoord -- een makelaar die zelf een notitie typte heeft geen
   JSON in dat veld staan, en dat is het normale geval. */
function leesIds(notities) {
  const t = String(notities || '').trim();
  if (t[0] !== '{') return {};
  try {
    const p = JSON.parse(t);
    return (p && typeof p.crm === 'object' && p.crm) || {};
  } catch (_) { return {}; }
}

function schrijfIds(notities, crm, ids) {
  const t = String(notities || '').trim();
  let blob = { _v: 1, notes: [], tasks: [], calls: [] };
  let herkend = false;
  if (t[0] === '{') {
    try {
      const p = JSON.parse(t);
      if (p && typeof p === 'object') { blob = { ...blob, ...p }; herkend = true; }
    } catch (_) { /* geen JSON: hieronder als tekst bewaren */ }
  }
  /* Een makelaar die er ooit gewoon tekst in typte raakt die tekst niet kwijt.
     Dezelfde bewaarregel als mergeWaFailedFlag() in api/whatsapp.js. */
  if (!herkend && t) blob.notes = [{ id: 'legacy', text: t, ts: new Date().toISOString() }];

  blob.crm = { ...(blob.crm || {}) };
  blob.crm[crm] = { ...ids, op: new Date().toISOString() };
  return JSON.stringify(blob);
}

async function bewaarIds(leadId, notities, crm, ids) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  if (!BASE_ID || !TOKEN || !leadId) return false;
  try {
    /* Alleen Notities in deze PATCH. Zie CLAUDE.md 4.2: één onbekend veld laat
       Airtable de hele request weigeren, dus een schrijfactie die iets nieuws
       probeert staat altijd alleen. */
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${leadsRead.LEADS_TABLE}/${leadId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [NOTITIES_VELD]: schrijfIds(notities, crm, ids) } }),
      signal: AbortSignal.timeout(AT_TIMEOUT_MS),
    });
    if (!r.ok) {
      /* Dit is de fout die pas over een week zichtbaar wordt, als dubbele
         deals. Luid loggen, want stil falen is hier het duurst. */
      console.error(`[crm] ids terugschrijven mislukt voor lead ${leadId} (HTTP ${r.status}) `
        + '-- volgende synchronisatie kan een dubbele deal maken');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[crm] ids terugschrijven mislukt:', err && err.message);
    return false;
  }
}

/* ── Status en koppelen ────────────────────────────────────────────────────── */

/** Wat heeft deze klant gekoppeld? Zonder sleutels -- die gaan nooit naar de client. */
async function status(projectCode) {
  const { koppelingen } = await config.lees(projectCode);
  return {
    beschikbaar: adapters(),
    verbonden: Object.keys(koppelingen).map((naam) => ({
      naam,
      label: (ADAPTERS[naam] && ADAPTERS[naam].label) || naam,
      account: koppelingen[naam].account || '',
      verbondenOp: koppelingen[naam].verbondenOp || '',
    })),
  };
}

/**
 * Koppelen: eerst bewijzen dat het werkt, dan pas opslaan.
 *
 * Die volgorde is het hele punt. Sleutels opslaan die niet werken geeft een
 * klant die denkt dat hij klaar is en een synchronisatie die elke nacht stil
 * faalt.
 */
async function verbind(projectCode, crm, cred) {
  const a = adapter(crm);
  const uitslag = await a.test(cred);
  /* Wat test() erbij ontdekte (de pijplijn, de API-versie) hoort bij de
     sleutels: anders moet elke duw() het opnieuw ophalen. */
  const compleet = { ...cred, ...(uitslag.extra || {}) };
  await config.schrijf(projectCode, a.naam, compleet, { account: uitslag.account });
  return { naam: a.naam, label: a.label, account: uitslag.account || '' };
}

async function ontkoppel(projectCode, crm) {
  return config.verwijder(projectCode, adapter(crm).naam);
}

/* ── Duwen ─────────────────────────────────────────────────────────────────── */

/**
 * Eén lead naar elk gekoppeld CRM.
 *
 * @param {string} projectCode
 * @param {object} lead      zoals _leads-read.mapLead() hem geeft
 * @param {object} [opties]  { koppelingen, velden, kantoor } -- meegeven scheelt
 *                           een Airtable-aanroep als de aanroeper ze al heeft
 *                           (de bulk-synchronisatie leest ze één keer voor 100
 *                           leads in plaats van 100 keer)
 * @returns {Promise<{resultaten: Array, notities: string}>}
 *          `resultaten` is per CRM { crm, ok, ids?, fout?, code? }.
 *          `notities` is de bijgewerkte Notities-blob van deze lead.
 *
 * -- Waarom `notities` mee teruggaat -------------------------------------------
 * Een aanroeper kan binnen ÉÉN beurt twee keer duwen: api/whatsapp.js doet dat
 * als de assistent in dezelfde beurt afrondt én een bezichtiging boekt. De
 * tweede duw leest dan het lead-record dat de eerste duw net verouderd heeft
 * gemaakt, ziet geen CRM-id's staan, en maakt een TWEEDE deal aan. Precies de
 * dubbele deal die dit hele bestand probeert te voorkomen.
 *
 * Terugsturen wat er nu in Notities staat is de goedkoopste oplossing: de
 * aanroeper legt het over zijn eigen kopie heen en de tweede duw werkt bij in
 * plaats van aan te maken. Het alternatief -- de lead opnieuw ophalen bij elke
 * duw -- kost een Airtable-aanroep per lead per keer.
 */
async function duw(projectCode, lead, opties = {}) {
  let koppelingen = opties.koppelingen;
  let velden = opties.velden;
  let kantoor = opties.kantoor;
  if (!koppelingen) {
    const gelezen = await config.lees(projectCode);
    koppelingen = gelezen.koppelingen;
    velden = gelezen.velden;
    kantoor = gelezen.kantoor;
  }

  const namen = Object.keys(koppelingen || {});
  let notities = String(lead.notities || '');
  if (!namen.length) return { resultaten: [], notities };

  const vorm = vormen.uitLead(lead, {
    regio: regio.lees(velden),
    kantoor,
    projectCode,
  });
  const bekend = leesIds(notities);

  /* Per CRM apart, en niet in één Promise.all met een gedeelde afloop: als
     HubSpot een storing heeft mag Pipedrive gewoon doorgaan. */
  const resultaten = [];
  /* Een tijdsbudget, voor de aanroeper die in het WhatsApp-pad zit.
     Rekensom: twee gekoppelde CRM's, elk drie aanroepen, elk in het slechtste
     geval twaalf seconden -- dat is meer dan de 120 seconden die vercel.json
     die route geeft, waar al een menselijke vertraging van 25-55 seconden van
     af gaat. Wordt de functie afgekapt, dan is het antwoord aan de lead al weg
     (dat gaat eerder), maar zijn de CRM-id's NIET teruggeschreven -- en dan
     staat er morgen een tweede deal.
     Dus: geen nieuw CRM meer beginnen als het budget op is. Dat begrenst de
     totale tijd op het budget plus één adapter, in plaats van op het aantal
     gekoppelde CRM's maal de slechtste dag van hun server. */
  const budgetMs = Number(opties.budgetMs) > 0 ? Number(opties.budgetMs) : 0;
  const start = Date.now();

  for (const naam of namen) {
    if (budgetMs && Date.now() - start > budgetMs) {
      resultaten.push({ crm: naam, ok: false, fout: 'Geen tijd meer in deze beurt; volgt bij de volgende synchronisatie.', code: 'geen_tijd', opnieuw: true });
      continue;
    }
    const a = ADAPTERS[naam];
    if (!a) { resultaten.push({ crm: naam, ok: false, fout: 'Onbekend CRM.', code: 'onbekend_crm' }); continue; }
    const cred = koppelingen[naam] && koppelingen[naam].cred;
    if (!cred) { resultaten.push({ crm: naam, ok: false, fout: 'Geen sleutels.', code: 'geen_sleutel' }); continue; }

    try {
      const ids = await a.duwLead(cred, vorm, bekend[naam] || {});
      resultaten.push({ crm: naam, ok: true, ids });

      /* De notitie is een extraatje: mislukt hij, dan staat de lead er nog
         steeds. Daarom een eigen try en geen rode uitslag. */
      if (a.duwNotitie) {
        try { await a.duwNotitie(cred, vorm, ids); }
        catch (err) { console.warn(`[crm/${naam}] notitie mislukt:`, err && err.message); }
      }

      if (!ids.overgeslagen) {
        const bewaard = { contactId: ids.contactId || '', dealId: ids.dealId || '' };
        await bewaarIds(lead.id, notities, naam, bewaard);
        /* De blob die we net wegschreven is nu de baseline voor het volgende
           CRM in deze lus -- anders wist CRM twee de id's van CRM een. */
        notities = schrijfIds(notities, naam, bewaard);
      }
    } catch (err) {
      const crmFout = err instanceof CrmError;
      if (crmFout && err.detail) console.error(`[crm/${naam}]`, err.code, err.detail);
      else if (!crmFout) console.error(`[crm/${naam}] onverwachte fout:`, err && err.message);
      resultaten.push({
        crm: naam,
        ok: false,
        /* Nooit de tekst van de leverancier. Zie ./http.js. */
        fout: crmFout ? err.message : 'De koppeling gaf een onverwachte fout.',
        code: crmFout ? err.code : 'onbekend',
        opnieuw: crmFout ? err.opnieuw : true,
      });
    }
  }
  return { resultaten, notities };
}

/**
 * Hetzelfde, maar gooit nooit. Voor het pad waar een lead op antwoord wacht.
 *
 * Geeft een lege lijst resultaten terug als er niets gekoppeld is of als er iets
 * stukging (de notities-sleutel blijft dan wat hij was);
 * de aanroeper hoeft niets te doen met de uitslag en hoort er ook niets aan de
 * lead over te vertellen (zie CLAUDE.md: nooit een actie melden die niet is
 * uitgevoerd).
 */
async function duwVeilig(projectCode, lead, opties = {}) {
  try {
    return await duw(projectCode, lead, opties);
  } catch (err) {
    console.error('[crm] duwVeilig ving:', err && err.message);
    return { resultaten: [], notities: String((lead && lead.notities) || '') };
  }
}

module.exports = {
  adapters, adapter, status, verbind, ontkoppel,
  duw, duwVeilig,
  leesIds, schrijfIds,
  CrmError,
};
