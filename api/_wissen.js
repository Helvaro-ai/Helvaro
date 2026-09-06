'use strict';
/*
 * Een account wissen. Nu, en alles.
 *
 * (Module met onderstreepje = geen route, zelfde afspraak als api/_credits.js.)
 *
 * ── Wat dit vervangt ─────────────────────────────────────────────────────────
 * Er was een knop "Account verwijderen" die een AANVRAAG verstuurde: een mail
 * naar support, met de belofte dat het binnen 30 dagen gebeurt. Dat is
 * verdedigbaar onder de AVG -- het recht op wissen kent een termijn -- maar het
 * is niet wat de eigenaar van dit product wil. De opdracht is: één knop, en
 * alles is meteen weg.
 *
 * Dus doet dit bestand dat echt. Geen markering, geen "gepland", geen
 * achtergrondtaak die het later opruimt: als deze functie terugkeert zonder
 * fout, staan de rijen niet meer in Airtable.
 *
 * ── De volgorde is de veiligheid ─────────────────────────────────────────────
 * Kinderen eerst, de klantrij als LAATSTE. Dat is niet willekeurig:
 *
 *   - Breekt het halverwege met de klantrij nog intact, dan kan de klant nog
 *     inloggen en het opnieuw proberen. Vervelend, herstelbaar.
 *   - Breekt het halverwege NADAT de klantrij weg is, dan kan niemand meer bij
 *     de rest: de projectcode waarop alles filtert bestaat niet meer, en de
 *     overgebleven leads en gesprekken zijn onzichtbaar en onverwijderbaar
 *     geworden. Dat is precies het soort restafval waar een AVG-verzoek over
 *     gaat.
 *
 * Om diezelfde reden gaan berichten vóór gesprekken: ai_messages heeft géén
 * project_code (zie de tabelomschrijving -- eigendom loopt via het gesprek).
 * Verdwijnt het gesprek eerst, dan is er geen sleutel meer om de berichten mee
 * terug te vinden.
 *
 * ── Wat er NIET weggaat, en waarom ───────────────────────────────────────────
 * De Stripe-KLANT en zijn facturen. Niet uit voorzichtigheid maar omdat het
 * moet: een factuur is een boekhoudkundig stuk en die bewaarplicht ligt niet
 * bij de klant maar bij Helvaro. Die stukken liggen ook niet hier -- ze liggen
 * bij Stripe, onder Stripe's eigen bewaartermijn. Wat hier stond en weggaat,
 * is alles wat Helvaro zelf over de klant bijhield.
 *
 * Het ABONNEMENT wordt wel opgezegd, en meteen. Dat is het verschil met
 * _stripe.cancelSubscription(), die tot het einde van de periode laat lopen
 * omdat de klant die maand betaald heeft. Bij een wisverzoek is dat verkeerd
 * om: iemand die zijn account vandaag weg wil hebben, hoort morgen geen
 * afschrijving te zien.
 *
 * ── Alles is best-effort behalve de volgorde ────────────────────────────────
 * Eén tabel die 500 geeft mag de rest niet tegenhouden -- half gewist en
 * gestopt is slechter dan bijna helemaal gewist met een melding erbij. Elke
 * stap rapporteert zijn eigen uitkomst, en de aanroeper krijgt te zien wat er
 * gelukt is en wat niet. Wat faalt, faalt LUID: het staat in het antwoord en
 * in de logs, nooit stilzwijgend.
 */

const _stripe = require('./_stripe');

/* ── De tabellen ──────────────────────────────────────────────────────────
   Namen en niet alleen ids, want filterByFormula werkt op veldNAMEN. De ids
   staan erbij zodat een hernoeming terug te vinden is; ze zijn geverifieerd
   tegen de echte base (Lead Qualification System) en niet aangenomen.

   De volgorde in deze lijst IS de uitvoeringsvolgorde. Zie de kop. */
const TABELLEN = Object.freeze([
  { tabel: 'tbliukTnDAbEDcZmt', naam: 'Leads',               veld: 'Project Code' },
  { tabel: 'tblD058vEITs1xYFc', naam: 'Appointments',        veld: 'Project Code' },
  { tabel: 'tblvssH8kE1XYCTFF', naam: 'properties',          veld: 'Project Code' },
  { tabel: 'tblQAPdjEsh0l7lUe', naam: 'vehicles',            veld: 'Project Code' },
  { tabel: 'tblaYyFWWTXivZJxW', naam: 'campaigns',           veld: 'Project Code' },
  { tabel: 'tblT9BakIBtYErsDL', naam: 'credit_transactions', veld: 'Project Code' },
  { tabel: 'tbl2hrPW7gIx5XF4S', naam: 'Users',               veld: 'Project Code' },
]);

const T_CONVERSATIES = 'tblo3pIgx9RT3A2wY';   // ai_conversations, veld project_code
const T_BERICHTEN    = 'tblJcqktFZwpXgwwh';   // ai_messages, veld conversation_id
const T_CLIENT       = 'tblPidTrwGRzRt4LZ';   // Client Config, veld Project Code

class WisFout extends Error {
  constructor(bericht, code) { super(bericht); this.name = 'WisFout'; this.code = code || 'wis_fout'; }
}

function escapeFormule(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sleutels() {
  const token  = process.env.API_AIRTABLE;
  const baseId = process.env.BASE_AIRTABLE;
  if (!token || !baseId) throw new WisFout('Airtable niet geconfigureerd.', 'geen_airtable');
  return { token, baseId };
}

async function at(pad, opts) {
  const { token, baseId } = sleutels();
  return fetch(`https://api.airtable.com/v0/${baseId}/${pad}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts && opts.headers) },
  });
}

/** Alle record-ids in een tabel die aan de formule voldoen. Pagineert door. */
async function idsVan(tabel, formule) {
  const ids = [];
  let offset = '';
  /* Een hard plafond. Een tenant met meer dan 10.000 rijen in één tabel bestaat
     hier niet, en zonder grens zou een fout in de formule -- eentje die alles
     matcht in plaats van één tenant -- de hele base doorlopen. Wordt het
     plafond geraakt, dan is dat een fout en geen "klaar". */
  for (let ronde = 0; ronde < 100; ronde++) {
    const q = `filterByFormula=${encodeURIComponent(formule)}&pageSize=100&fields%5B%5D=`
            + (offset ? `&offset=${encodeURIComponent(offset)}` : '');
    const r = await at(`${tabel}?${q}`);
    if (!r.ok) throw new WisFout(`Airtable ${r.status} bij het lezen van ${tabel}.`, 'lezen_mislukt');
    const d = await r.json();
    (d.records || []).forEach((rec) => ids.push(rec.id));
    if (!d.offset) return ids;
    offset = d.offset;
  }
  throw new WisFout(`Meer dan 10.000 rijen in ${tabel} -- gestopt in plaats van door te gaan.`, 'te_veel');
}

/** Records verwijderen, tien per verzoek (het maximum van Airtable). */
async function verwijderIds(tabel, ids) {
  let weg = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const groep = ids.slice(i, i + 10);
    const q = groep.map((id) => `records%5B%5D=${encodeURIComponent(id)}`).join('&');
    const r = await at(`${tabel}?${q}`, { method: 'DELETE' });
    if (!r.ok) throw new WisFout(`Airtable ${r.status} bij het wissen in ${tabel}.`, 'wissen_mislukt');
    const d = await r.json().catch(() => ({}));
    weg += (d.records || groep).length;
  }
  return weg;
}

/** Eén tabel leegmaken voor deze tenant. Geeft het aantal terug, of de fout. */
async function wisTabel(tabel, veld, projectCode) {
  const ids = await idsVan(tabel, `{${veld}}="${escapeFormule(projectCode)}"`);
  if (!ids.length) return 0;
  return verwijderIds(tabel, ids);
}

/**
 * Alles van één tenant wissen.
 *
 * @param {object} ctx
 *   projectCode      de tenant. VERPLICHT, en komt van de aanroeper uit de
 *                    SESSIE -- nooit uit een request body.
 *   clientRecordId   de rij in Client Config. Optioneel; wordt anders opgezocht.
 *   userId           de Clerk-gebruiker, om te verwijderen. Optioneel.
 *   stripeAbonnement lopend abonnement-id, om meteen op te zeggen. Optioneel.
 */
async function wisAlles(ctx = {}) {
  const projectCode = String(ctx.projectCode || '').trim();
  if (!projectCode) throw new WisFout('Wissen zonder projectcode.', 'geen_tenant');
  /* Een projectcode is A-Z0-9, 4 tot 20 tekens (zie deriveProjectCode in
     api/_clerk.js: "C" plus een hash). Alles daarbuiten is geen tenant maar een
     poging tot iets anders, en dan wordt er niets gewist. Dit is de laatste rem
     vóór een DELETE-lus: een formule met een aanhalingsteken erin zou een
     bredere selectie kunnen maken dan bedoeld. */
  if (!/^[A-Za-z0-9]{4,20}$/.test(projectCode)) {
    throw new WisFout('Die projectcode heeft niet de goede vorm.', 'rare_tenant');
  }

  const verslag = { projectCode, gewist: {}, mislukt: {}, stripe: null, clerk: null };
  const stap = async (naam, fn) => {
    try { verslag.gewist[naam] = await fn(); }
    catch (e) {
      verslag.mislukt[naam] = (e && e.message) || String(e);
      console.error(`[wissen] ${naam} mislukt voor ${projectCode}:`, e && e.message);
    }
  };

  /* 1. Het abonnement eerst. Als er verderop iets misgaat is dit het enige dat
        de klant nog GELD kost, dus het hoort niet achteraan te wachten. */
  if (ctx.stripeAbonnement) {
    try {
      await _stripe.cancelSubscriptionNow(ctx.stripeAbonnement);
      verslag.stripe = 'opgezegd';
    } catch (e) {
      verslag.stripe = 'mislukt: ' + ((e && e.message) || String(e));
      console.error(`[wissen] Stripe-opzegging mislukt voor ${projectCode}:`, e && e.message);
    }
  } else {
    verslag.stripe = 'geen abonnement';
  }

  /* 2. Faro: berichten vóór gesprekken. ai_messages heeft geen project_code --
        het gesprek is de enige weg ernaartoe. */
  await stap('ai_messages', async () => {
    const gesprekken = await idsVan(T_CONVERSATIES, `{project_code}="${escapeFormule(projectCode)}"`);
    let weg = 0;
    for (const gid of gesprekken) {
      const berichten = await idsVan(T_BERICHTEN, `{conversation_id}="${escapeFormule(gid)}"`);
      if (berichten.length) weg += await verwijderIds(T_BERICHTEN, berichten);
    }
    return weg;
  });
  await stap('ai_conversations', () => wisTabel(T_CONVERSATIES, 'project_code', projectCode));

  /* 3. De rest van de gegevens. */
  for (const t of TABELLEN) {
    await stap(t.naam, () => wisTabel(t.tabel, t.veld, projectCode));
  }

  /* 4. De inlog. Na de gegevens: kan de gebruiker niet meer inloggen terwijl
        zijn rijen er nog staan, dan kan hij ook niet meer opnieuw proberen. */
  if (ctx.userId) {
    try {
      const _clerk = require('./_clerk');
      await _clerk.deleteUser(ctx.userId);
      verslag.clerk = 'verwijderd';
    } catch (e) {
      verslag.clerk = 'mislukt: ' + ((e && e.message) || String(e));
      console.error(`[wissen] Clerk-gebruiker verwijderen mislukt voor ${projectCode}:`, e && e.message);
    }
  } else {
    verslag.clerk = 'geen gebruiker meegegeven';
  }

  /* 5. En als allerlaatste de klantrij zelf. Zie de kop voor waarom deze
        achteraan hoort en niet vooraan. */
  await stap('Client Config', async () => {
    let ids = ctx.clientRecordId ? [ctx.clientRecordId] : null;
    if (!ids) ids = await idsVan(T_CLIENT, `{Project Code}="${escapeFormule(projectCode)}"`);
    if (!ids.length) return 0;
    return verwijderIds(T_CLIENT, ids);
  });

  verslag.volledig = Object.keys(verslag.mislukt).length === 0
                     && !/^mislukt/.test(String(verslag.stripe))
                     && !/^mislukt/.test(String(verslag.clerk));
  return verslag;
}

module.exports = { wisAlles, WisFout, TABELLEN, T_CONVERSATIES, T_BERICHTEN, T_CLIENT, idsVan, verwijderIds };
