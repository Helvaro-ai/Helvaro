'use strict';
/*
 * Pipedrive -- person + deal.
 *
 * -- Wat hiervan geverifieerd is ---------------------------------------------
 *   - v2 draait op het EIGEN domein van de klant:
 *     https://{bedrijf}.pipedrive.com/api/v2/...   -- niet op api.pipedrive.com
 *   - een API-token gaat mee als querystring `?api_token=...`
 *   - in v2 heten `email`, `phone` en `im` MEERVOUD: `emails`, `phones`, `ims`,
 *     en het zijn arrays van { value, primary, label } -- in v1 waren het losse
 *     strings. Dit is precies het soort verschil dat uit het hoofd geschreven
 *     fout gaat en pas bij de eerste echte klant opvalt.
 *   - `visible_to` is in v2 een GETAL, in v1 een string.
 *
 * NIET tegen een echt account gedraaid. `node scripts/crm-check.js pipedrive`
 * doet dat in één aanroep zodra er een token is.
 *
 * -- Waarom het bedrijfsdomein apart gevraagd wordt ---------------------------
 * api.pipedrive.com werkt voor v1, maar v2 wil het domein van de klant. Dat
 * domein staat in hun eigen URL als ze ingelogd zijn, dus het is te vragen. Wij
 * raden het niet: een verkeerd gegokt subdomein geeft een 404 die eruitziet als
 * "de lead bestaat niet" in plaats van "je zit op het verkeerde account".
 */

const { json, CrmError } = require('../http');

const NAAM = 'Pipedrive';
const FASE_VOLGORDE = ['new', 'contacted', 'qualified', 'booked'];

const velden = [
  {
    sleutel: 'domein',
    label: 'Bedrijfsdomein',
    type: 'tekst',
    hint: 'Het stukje voor .pipedrive.com in je eigen adresbalk. Staat er '
        + 'https://kantoorpeeters.pipedrive.com, vul dan kantoorpeeters in.',
  },
  {
    sleutel: 'token',
    label: 'API-token',
    type: 'geheim',
    hint: 'Pipedrive > je profiel rechtsboven > Persoonlijke voorkeuren > API.',
  },
];

/* Het domein mag alleen het subdomein zijn. Iemand die de hele URL plakt is de
   normale fout, en die hier opvangen scheelt een supportbericht: van
   "https://kantoor.pipedrive.com/deals" blijft "kantoor" over. */
function subdomein(ruw) {
  let s = String(ruw || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  s = s.replace(/\.pipedrive\.com$/, '');
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(s) ? s : '';
}

function url(cred, pad, extraQuery = '') {
  const dom = subdomein(cred && cred.domein);
  if (!dom) throw new CrmError('Vul eerst je Pipedrive-bedrijfsdomein in.', { code: 'geen_domein' });
  if (!cred.token) throw new CrmError('Vul eerst je Pipedrive-token in.', { code: 'geen_sleutel' });
  const q = `api_token=${encodeURIComponent(cred.token)}${extraQuery ? '&' + extraQuery : ''}`;
  return `https://${dom}.pipedrive.com/api/v2/${pad}?${q}`;
}

async function test(cred) {
  /* /users/me staat op v1 en niet op v2; dat is geen slordigheid maar de reden
     dat deze controle bestaat: hij bewijst het token EN geeft de bedrijfsnaam
     terug, zodat de klant in het scherm ziet welk account hij zojuist koppelde. */
  const dom = subdomein(cred && cred.domein);
  if (!dom) throw new CrmError('Vul eerst je Pipedrive-bedrijfsdomein in.', { code: 'geen_domein' });
  if (!cred || !cred.token) throw new CrmError('Vul eerst je Pipedrive-token in.', { code: 'geen_sleutel' });

  const mij = await json(
    `https://${dom}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(cred.token)}`,
    'GET', undefined, {}, { leverancier: NAAM },
  );
  const bedrijf = (mij.data && (mij.data.company_name || mij.data.company_domain)) || dom;

  /* De pijplijn erbij, om dezelfde reden als bij HubSpot: zonder geldige
     stage_id weigert Pipedrive de hele deal, dus liever geen fase dan een
     verzonnen id. */
  let pijplijn = null;
  try {
    const p = await json(url(cred, 'stages'), 'GET', undefined, {}, { leverancier: NAAM });
    const stages = (p.data || [])
      .slice()
      .sort((a, b) => (a.order_nr || 0) - (b.order_nr || 0));
    const eerstePijplijn = stages.length ? stages[0].pipeline_id : null;
    const vanDiePijplijn = stages.filter((s) => s.pipeline_id === eerstePijplijn).map((s) => s.id);
    if (vanDiePijplijn.length) pijplijn = { id: eerstePijplijn, stages: vanDiePijplijn };
  } catch (err) {
    console.warn('[crm/pipedrive] stages niet gelezen, fasen blijven leeg:', err && err.message);
  }

  return { ok: true, account: String(bedrijf), extra: { pijplijn } };
}

function stageVoor(cred, fase) {
  const p = cred && cred.pijplijn;
  if (!p || !Array.isArray(p.stages) || !p.stages.length) return undefined;
  const i = FASE_VOLGORDE.indexOf(fase);
  if (i < 0) return undefined;
  return p.stages[Math.min(i, p.stages.length - 1)];
}

function persoonBody(vorm) {
  const body = { name: vorm.contact.volledig || 'Onbekende lead' };
  /* v2: array van objecten, niet een string. Zie de kop. */
  if (vorm.contact.telefoon) {
    body.phones = [{ value: vorm.contact.telefoon, primary: true, label: 'mobile' }];
  }
  return body;
}

async function zoekPersoonOpTelefoon(cred, telefoon) {
  if (!telefoon) return '';
  try {
    const r = await json(
      url(cred, 'persons/search', `term=${encodeURIComponent(telefoon)}&fields=phone&exact_match=true&limit=1`),
      'GET', undefined, {}, { leverancier: NAAM },
    );
    const treffer = ((r.data && r.data.items) || [])[0];
    return treffer && treffer.item ? String(treffer.item.id) : '';
  } catch (err) {
    console.warn('[crm/pipedrive] zoeken op telefoon mislukt:', err && err.message);
    return '';
  }
}

async function duwLead(cred, vorm, vorige = {}) {
  const body = persoonBody(vorm);

  let personId = String(vorige.contactId || '');
  if (!personId) personId = await zoekPersoonOpTelefoon(cred, vorm.contact.telefoon);

  if (personId) {
    try {
      await json(url(cred, `persons/${encodeURIComponent(personId)}`), 'PATCH', body, {}, { leverancier: NAAM });
    } catch (err) {
      if (err instanceof CrmError && err.status === 404) personId = '';
      else throw err;
    }
  }
  if (!personId) {
    const gemaakt = await json(url(cred, 'persons'), 'POST', body, {}, { leverancier: NAAM });
    personId = String((gemaakt.data && gemaakt.data.id) || '');
    if (!personId) throw new CrmError('Pipedrive maakte de persoon niet aan.', { code: 'geen_id' });
  }

  const dealBody = { title: vorm.deal.titel, person_id: Number(personId) };
  if (vorm.deal.waarde !== null) {
    dealBody.value = vorm.deal.waarde;
    dealBody.currency = vorm.deal.valuta;
  }
  const stage = stageVoor(cred, vorm.deal.fase);
  if (stage) {
    dealBody.stage_id = stage;
    if (cred.pijplijn && cred.pijplijn.id) dealBody.pipeline_id = cred.pijplijn.id;
  }

  let dealId = String(vorige.dealId || '');
  if (dealId) {
    try {
      await json(url(cred, `deals/${encodeURIComponent(dealId)}`), 'PATCH', dealBody, {}, { leverancier: NAAM });
      return { contactId: personId, dealId };
    } catch (err) {
      if (!(err instanceof CrmError && err.status === 404)) throw err;
      dealId = '';
    }
  }

  const deal = await json(url(cred, 'deals'), 'POST', dealBody, {}, { leverancier: NAAM });
  return { contactId: personId, dealId: String((deal.data && deal.data.id) || '') };
}

/**
 * Wat de assistent te weten kwam, als notitie.
 *
 * Notes staan (nog) op v1: er is geen v2-endpoint voor. Vandaar de afwijkende
 * URL-opbouw hier -- die is geen vergissing.
 */
async function duwNotitie(cred, vorm, ids = {}) {
  const regels = [
    vorm.deal.samenvatting && `Samenvatting: ${vorm.deal.samenvatting}`,
    vorm.deal.capaciteit && `Budget: ${vorm.deal.capaciteit}`,
    vorm.deal.urgentie && `Timing: ${vorm.deal.urgentie}`,
    vorm.deal.fit && `Fit: ${vorm.deal.fit}`,
    vorm.deal.pand && `Pand: ${vorm.deal.pand}`,
  ].filter(Boolean);
  if (!regels.length) return { notitieId: '' };

  const dom = subdomein(cred.domein);
  const body = { content: regels.join('\n') };
  if (ids.dealId) body.deal_id = Number(ids.dealId);
  else if (ids.contactId) body.person_id = Number(ids.contactId);

  const r = await json(
    `https://${dom}.pipedrive.com/api/v1/notes?api_token=${encodeURIComponent(cred.token)}`,
    'POST', body, {}, { leverancier: NAAM },
  );
  return { notitieId: String((r.data && r.data.id) || '') };
}

module.exports = { naam: 'pipedrive', label: NAAM, velden, test, duwLead, duwNotitie, subdomein };
