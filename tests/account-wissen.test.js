'use strict';
/*
 * Een account wissen: alles weg, in de goede volgorde, en van de JUISTE tenant.
 *
 * ── Waarom dit bestand zwaarder weegt dan de meeste ─────────────────────────
 * Dit is de enige functie in deze codebase die records definitief verwijdert
 * en dat over tien tabellen tegelijk doet. Er is geen prullenbak en geen
 * ongedaan maken. Twee dingen kunnen hier misgaan en ze zijn allebei erg:
 *
 *   - te WEINIG wissen -> de klant kreeg te horen dat alles weg is terwijl zijn
 *     leads er nog staan. Dat is een AVG-belofte die niet waar is.
 *   - te VEEL wissen  -> de gegevens van een ANDER kantoor zijn weg.
 *
 * Daarom draait hier de echte api/_wissen.js tegen een nagemaakte Airtable die
 * elk verzoek meeschrijft. Wat getoetst wordt is niet "hij deed iets" maar
 * precies WELKE rijen hij aanraakte, in welke volgorde, en wat hij met rust
 * liet.
 */
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';

const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

/* ── De nagemaakte base ────────────────────────────────────────────────────
   Twee tenants, zodat "raakt de buurman niet aan" toetsbaar is en niet
   aangenomen hoeft te worden. */
const TENANT = 'CTESTAAAA1';
const BUUR   = 'CBUURBBBB2';

function verseBase() {
  return {
    tbliukTnDAbEDcZmt: [ // Leads
      { id: 'recL1', velden: { 'Project Code': TENANT } },
      { id: 'recL2', velden: { 'Project Code': TENANT } },
      { id: 'recL3', velden: { 'Project Code': BUUR } },
    ],
    tblD058vEITs1xYFc: [ { id: 'recA1', velden: { 'Project Code': TENANT } } ],
    tblvssH8kE1XYCTFF: [ { id: 'recP1', velden: { 'Project Code': TENANT } },
                         { id: 'recP2', velden: { 'Project Code': BUUR } } ],
    tblQAPdjEsh0l7lUe: [ { id: 'recV1', velden: { 'Project Code': TENANT } } ],
    tblaYyFWWTXivZJxW: [ { id: 'recC1', velden: { 'Project Code': TENANT } } ],
    tblT9BakIBtYErsDL: [ { id: 'recT1', velden: { 'Project Code': TENANT } },
                         { id: 'recT2', velden: { 'Project Code': TENANT } } ],
    tbl2hrPW7gIx5XF4S: [ { id: 'recU1', velden: { 'Project Code': TENANT } } ],
    tblo3pIgx9RT3A2wY: [ { id: 'recG1', velden: { project_code: TENANT } },
                         { id: 'recG2', velden: { project_code: TENANT } },
                         { id: 'recG9', velden: { project_code: BUUR } } ],
    tblJcqktFZwpXgwwh: [ { id: 'recM1', velden: { conversation_id: 'recG1' } },
                         { id: 'recM2', velden: { conversation_id: 'recG1' } },
                         { id: 'recM3', velden: { conversation_id: 'recG2' } },
                         { id: 'recM9', velden: { conversation_id: 'recG9' } } ],
    tblPidTrwGRzRt4LZ: [ { id: 'recK1', velden: { 'Project Code': TENANT } },
                         { id: 'recK2', velden: { 'Project Code': BUUR } } ],
  };
}

let BASEDATA, VOLGORDE, STUKKE_TABEL;

/* Een piepklein stukje Airtable: filterByFormula met {veld}="waarde", en
   DELETE met records[]=. Meer heeft _wissen.js niet nodig, en meer nabouwen zou
   betekenen dat de test iets toetst wat Airtable doet in plaats van iets wat
   wij doen. */
global.fetch = async (url, opts) => {
  const u = new URL(url);
  const tabel = u.pathname.split('/')[3];
  const methode = (opts && opts.method) || 'GET';

  if (STUKKE_TABEL === tabel) {
    return { ok: false, status: 500, text: async () => 'kapot', json: async () => ({}) };
  }

  if (methode === 'DELETE') {
    const ids = u.searchParams.getAll('records[]');
    VOLGORDE.push({ actie: 'DELETE', tabel, ids: ids.slice() });
    BASEDATA[tabel] = (BASEDATA[tabel] || []).filter((r) => ids.indexOf(r.id) === -1);
    return { ok: true, status: 200, json: async () => ({ records: ids.map((id) => ({ id, deleted: true })) }) };
  }

  const formule = u.searchParams.get('filterByFormula') || '';
  const m = /\{([^}]+)\}="([^"]*)"/.exec(formule);
  VOLGORDE.push({ actie: 'LEES', tabel, formule });
  let rijen = BASEDATA[tabel] || [];
  if (m) rijen = rijen.filter((r) => String(r.velden[m[1]] || '') === m[2]);
  return { ok: true, status: 200, json: async () => ({ records: rijen.map((r) => ({ id: r.id })) }) };
};

/* Stripe en Clerk: alleen vastleggen DAT ze aangeroepen zijn en waarmee. */
const _stripe = require(path.join(BASE, 'api/_stripe'));
const _clerk  = require(path.join(BASE, 'api/_clerk'));
let STRIPE_AANROEP, CLERK_AANROEP, STRIPE_FAALT;
_stripe.cancelSubscriptionNow = async (id) => {
  STRIPE_AANROEP = id;
  if (STRIPE_FAALT) throw new Error('stripe plat');
  return { id, status: 'canceled' };
};
_clerk.deleteUser = async (uid) => { CLERK_AANROEP = uid; return true; };

const wissen = require(path.join(BASE, 'api/_wissen.js'));

function reset() {
  BASEDATA = verseBase(); VOLGORDE = []; STUKKE_TABEL = null;
  STRIPE_AANROEP = null; CLERK_AANROEP = null; STRIPE_FAALT = false;
}
const nog = (tabel) => (BASEDATA[tabel] || []).map((r) => r.id);

(async () => {
  console.log('\n  alles van deze tenant gaat weg');
  {
    reset();
    const v = await wissen.wisAlles({ projectCode: TENANT, clientRecordId: 'recK1',
                                      userId: 'user_x', stripeAbonnement: 'sub_x' });
    ck('het verslag zegt dat het volledig was', v.volledig === true, v.mislukt);
    ck('leads weg',            nog('tbliukTnDAbEDcZmt').indexOf('recL1') === -1);
    ck('afspraken weg',        nog('tblD058vEITs1xYFc').length === 0);
    ck('panden weg',           nog('tblvssH8kE1XYCTFF').indexOf('recP1') === -1);
    ck('voertuigen weg',       nog('tblQAPdjEsh0l7lUe').length === 0);
    ck('campagnes weg',        nog('tblaYyFWWTXivZJxW').length === 0);
    ck('creditgrootboek weg',  nog('tblT9BakIBtYErsDL').length === 0);
    ck('dashboardgebruikers weg', nog('tbl2hrPW7gIx5XF4S').length === 0);
    ck('faro-gesprekken weg',  nog('tblo3pIgx9RT3A2wY').indexOf('recG1') === -1);
    ck('faro-berichten weg',   nog('tblJcqktFZwpXgwwh').indexOf('recM1') === -1
                            && nog('tblJcqktFZwpXgwwh').indexOf('recM3') === -1);
    ck('de klantrij weg',      nog('tblPidTrwGRzRt4LZ').indexOf('recK1') === -1);
  }

  console.log('\n  en NIETS van de buurman');
  {
    ck('de lead van de buur staat er nog',       nog('tbliukTnDAbEDcZmt').indexOf('recL3') !== -1);
    ck('het pand van de buur staat er nog',      nog('tblvssH8kE1XYCTFF').indexOf('recP2') !== -1);
    ck('het gesprek van de buur staat er nog',   nog('tblo3pIgx9RT3A2wY').indexOf('recG9') !== -1);
    /* De belangrijkste: berichten hebben geen project_code. Zonder de omweg via
       de gesprekken zou een te brede selectie hier ook het bericht van de buur
       meenemen, en dat zou niemand merken. */
    ck('het BERICHT van de buur staat er nog',   nog('tblJcqktFZwpXgwwh').indexOf('recM9') !== -1);
    ck('de klantrij van de buur staat er nog',   nog('tblPidTrwGRzRt4LZ').indexOf('recK2') !== -1);
  }

  console.log('\n  de volgorde, want die is de veiligheid');
  {
    const deletes = VOLGORDE.filter((s) => s.actie === 'DELETE');
    const eerste = (t) => deletes.findIndex((s) => s.tabel === t);
    /* Let op de eerste voorwaarde. Zonder die was dit een misleidende
       controle: draai je de volgorde om, dan wordt er GEEN enkel bericht meer
       gewist (de sleutel ernaartoe is dan al weg), findIndex geeft -1, en -1 is
       kleiner dan alles -- de regel bleef groen terwijl er berichten
       achterbleven. Eerst eisen dat er iets gewist IS, dan pas waar. */
    ck('berichten gaan vóór gesprekken',
      eerste('tblJcqktFZwpXgwwh') !== -1
      && eerste('tblo3pIgx9RT3A2wY') !== -1
      && eerste('tblJcqktFZwpXgwwh') < eerste('tblo3pIgx9RT3A2wY'),
      deletes.map((d) => d.tabel));
    /* De klantrij als allerlaatste. Ging hij eerst, dan is de projectcode weg
       waarop al het andere filtert en is de rest onbereikbaar geworden. */
    const klant = eerste('tblPidTrwGRzRt4LZ');
    ck('de klantrij gaat als allerlaatste',
      klant === deletes.length - 1, deletes.map((d) => d.tabel));
    ck('het abonnement is meteen opgezegd', STRIPE_AANROEP === 'sub_x', STRIPE_AANROEP);
    ck('de inlog is verwijderd',            CLERK_AANROEP === 'user_x', CLERK_AANROEP);
  }

  console.log('\n  zonder tenant gebeurt er niets');
  {
    /* Wat hier NIET in staat: 'kort'. Vier tekens is een geldige VORM voor een
       projectcode, en de vormcontrole in _wissen.js is precies dat -- een rem
       tegen een waarde die de formule zou kunnen oprekken, geen lengtecontrole.

       De verleiding was om de ondergrens op te trekken tot 7 (het kortste
       bestaande account) en 'kort' te laten weigeren. Dat zou een test zijn die
       de code strenger maakt dan wat hij moet bewaken, en die de dag breekt dat
       er een ouder account met een korte code opduikt. De echte bescherming is
       dat de projectcode uit de SESSIE komt en niet uit een request body; wat
       hier staat is de laatste zeef daarna. */
    for (const slecht of ['', null, undefined, '   ', 'met spatie', 'met"quote', "met'quote",
                          'met\\backslash', 'A'.repeat(30), 'OR 1=1', '}{']) {
      reset();
      let gooide = false;
      try { await wissen.wisAlles({ projectCode: slecht }); } catch (e) { gooide = true; }
      const onaangeroerd = VOLGORDE.length === 0;
      ck('geweigerd: ' + JSON.stringify(slecht), gooide && onaangeroerd,
         { gooide, verzoeken: VOLGORDE.length });
    }
  }

  console.log('\n  een tabel die stukgaat stopt de rest niet');
  {
    reset();
    STUKKE_TABEL = 'tblaYyFWWTXivZJxW';   // campagnes
    const v = await wissen.wisAlles({ projectCode: TENANT, clientRecordId: 'recK1',
                                      userId: 'user_x', stripeAbonnement: 'sub_x' });
    ck('het verslag meldt de mislukking', !!v.mislukt.campaigns, v.mislukt);
    ck('en zegt NIET dat het volledig was', v.volledig === false, v.volledig);
    /* Dit is het punt: half gewist en gestopt is slechter dan bijna helemaal
       gewist met een eerlijke melding. */
    ck('de leads zijn toch weg',      nog('tbliukTnDAbEDcZmt').indexOf('recL1') === -1);
    ck('de klantrij is toch weg',     nog('tblPidTrwGRzRt4LZ').indexOf('recK1') === -1);
  }

  console.log('\n  een mislukte opzegging wordt niet verzwegen');
  {
    reset();
    STRIPE_FAALT = true;
    const v = await wissen.wisAlles({ projectCode: TENANT, clientRecordId: 'recK1',
                                      userId: 'user_x', stripeAbonnement: 'sub_x' });
    ck('stripe staat als mislukt in het verslag', /^mislukt/.test(String(v.stripe)), v.stripe);
    ck('en het geheel heet niet volledig',        v.volledig === false, v.volledig);
    /* De gegevens gaan wél weg. Een abonnement dat blijft lopen is een
       geldprobleem dat een mens kan rechtzetten; gegevens die blijven staan na
       een wisverzoek zijn dat niet. */
    ck('de gegevens zijn toch gewist',            nog('tbliukTnDAbEDcZmt').indexOf('recL1') === -1);
  }

  console.log('\n  zonder abonnement of gebruiker gaat het gewoon door');
  {
    reset();
    const v = await wissen.wisAlles({ projectCode: TENANT, clientRecordId: 'recK1' });
    ck('geen abonnement is geen fout', v.stripe === 'geen abonnement', v.stripe);
    ck('geen gebruiker is geen fout',  /geen gebruiker/.test(String(v.clerk)), v.clerk);
    ck('en alles is weg',              v.volledig === true && nog('tblPidTrwGRzRt4LZ').indexOf('recK1') === -1);
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
