/*
 * De CRM-koppelingen.
 *
 * ── Waarom deze test bestaat ────────────────────────────────────────────────
 * Vier van de vijf dingen die hier kunnen misgaan geven GEEN foutmelding:
 *
 *   DUBBELE DEALS      -> de tweede synchronisatie ziet de id's van de eerste
 *                         niet en maakt alles opnieuw aan. De makelaar ziet
 *                         zijn pijplijn verdubbelen en heeft geen idee waarom.
 *   EEN VERZONNEN 0    -> een lead zonder budget komt binnen als een deal van
 *                         EUR 0,00 en verlaagt zijn pijplijnwaarde.
 *   EEN LEGE LastName  -> Salesforce weigert de HELE lead. Stil, in de logs.
 *   EEN v1-VELDNAAM    -> Pipedrive v2 wil `phones` als array; de v1-vorm
 *                         (`phone` als string) wordt geaccepteerd en genegeerd,
 *                         dus het contact komt aan ZONDER telefoonnummer.
 *
 * Alle vier zijn hier al in gemaakt of net voorkomen. Deze test legt ze vast.
 */
const BASE = require('path').join(__dirname, '..') + '/';
const vorm       = require(BASE + 'api/_crm/vorm.js');
const crm        = require(BASE + 'api/_crm/index.js');
const http       = require(BASE + 'api/_crm/http.js');
const hubspot    = require(BASE + 'api/_crm/adapters/hubspot.js');
const pipedrive  = require(BASE + 'api/_crm/adapters/pipedrive.js');
const salesforce = require(BASE + 'api/_crm/adapters/salesforce.js');
const whise      = require(BASE + 'api/_crm/adapters/whise.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const leadBasis = {
  id: 'recAAAAAAAAAAAAAA', naam: 'Jan Peeters', telefoon: '0470 12 34 56',
  qualified: true, afspraakGeboekt: false, samenvatting: 'Zoekt woning in Gent',
  leadScore: 82, property: 'P3', notities: '', verwachteWaarde: '',
};

console.log('\n— de naam, en waarom het laatste woord de ACHTERnaam is —');
/* Salesforce weigert een Lead zonder LastName en accepteert er een zonder
   FirstName. Een naam van één woord moet dus in LastName belanden. */
ck('"Jan" -> achternaam Jan', vorm.splitsNaam('Jan').achternaam === 'Jan', vorm.splitsNaam('Jan'));
ck('"Jan" -> voornaam leeg',  vorm.splitsNaam('Jan').voornaam === '', vorm.splitsNaam('Jan'));
ck('"Jan Peeters" splitst',   vorm.splitsNaam('Jan Peeters').achternaam === 'Peeters');
ck('dubbele spaties storen niet', vorm.splitsNaam('  Jan   Peeters ').volledig === 'Jan Peeters');
ck('een lege naam geeft lege velden, geen "undefined"',
   vorm.splitsNaam('').achternaam === '', vorm.splitsNaam(''));

console.log('\n— geen verzonnen cijfers —');
const zonderBudget = vorm.uitLead({ ...leadBasis, verwachteWaarde: '' });
ck('geen budget -> waarde null, niet 0', zonderBudget.deal.waarde === null, zonderBudget.deal.waarde);
const kamers = vorm.uitLead({ ...leadBasis, verwachteWaarde: '3 slaapkamers, 450.000' });
ck('"3 slaapkamers, 450.000" -> 450000 en niet 3', kamers.deal.waarde === 450000, kamers.deal.waarde);
const geenScore = vorm.uitLead({ ...leadBasis, leadScore: 0 });
ck('score 0 telt als onbekend', geenScore.deal.score === null, geenScore.deal.score);

console.log('\n— het telefoonnummer —');
const jan = vorm.uitLead(leadBasis);
ck('een Belgisch nummer wordt E.164 MET plus', jan.contact.telefoon === '+32470123456', jan.contact.telefoon);
const onleesbaar = vorm.uitLead({ ...leadBasis, telefoon: 'bel me maar' });
/* Een half nummer in het CRM laat de makelaar iemand anders bellen. Liever
   niets. */
ck('een onleesbaar nummer wordt leeg, nooit half', onleesbaar.contact.telefoon === '', onleesbaar.contact.telefoon);

console.log('\n— de fase komt uit dezelfde bron als het dashboard —');
ck('gekwalificeerd zonder afspraak', jan.deal.fase === 'qualified', jan.deal.fase);
ck('met afspraak wint de afspraak',
   vorm.uitLead({ ...leadBasis, afspraakGeboekt: true }).deal.fase === 'booked');
ck('koud is nieuw',
   vorm.uitLead({ ...leadBasis, qualified: false }).deal.fase === 'new');

console.log('\n— Salesforce krijgt altijd zijn twee verplichte velden —');
for (const naam of ['Jan Peeters', 'Jan', '']) {
  const v = salesforce.leadVelden(vorm.uitLead({ ...leadBasis, naam }));
  ck(`naam ${JSON.stringify(naam)} -> LastName gevuld`, Boolean(v.LastName), v);
  ck(`naam ${JSON.stringify(naam)} -> Company gevuld`,  Boolean(v.Company), v);
}
ck('Status wordt NIET meegestuurd (keuzelijst per org, weigert de hele lead)',
   salesforce.leadVelden(jan).Status === undefined);
ck('SOQL-escaping sluit een apostrof af',
   salesforce.soql("O'Brien") === "O\\'Brien", salesforce.soql("O'Brien"));

console.log('\n— Pipedrive spreekt v2, niet v1 —');
ck('een geplakte volledige URL wordt het subdomein',
   pipedrive.subdomein('https://kantoorpeeters.pipedrive.com/deals') === 'kantoorpeeters',
   pipedrive.subdomein('https://kantoorpeeters.pipedrive.com/deals'));
ck('rommel wordt geweigerd', pipedrive.subdomein('een twee') === '');

console.log('\n— Whise doet niet alsof —');
ck('Whise staat als niet-beschikbaar in de lijst',
   crm.adapters().find((a) => a.naam === 'whise').beschikbaar === false);
ck('en noemt wat er ontbreekt', whise.ontbreekt.length >= 3, whise.ontbreekt);
ck('en vraagt geen sleutels die nergens heen gaan', whise.velden.length === 0);
ck('de andere vier zijn wel beschikbaar',
   crm.adapters().filter((a) => a.beschikbaar).length === 4,
   crm.adapters().map((a) => a.naam + ':' + a.beschikbaar));

console.log('\n— de id-blob in Notities —');
/* De blob is gedeeld met aiPaused, property, waFailed en de notities die een
   makelaar zelf typt. Alles daarvan moet een CRM-synchronisatie overleven. */
const bestaand = JSON.stringify({ _v: 1, notes: [{ id: 'n1', text: 'gebeld' }], aiPaused: { at: 'x' }, property: 'P3' });
const na = crm.schrijfIds(bestaand, 'hubspot', { contactId: '11', dealId: '22' });
const naObj = JSON.parse(na);
ck('de id\'s zijn terug te lezen', (crm.leesIds(na).hubspot || {}).contactId === '11', crm.leesIds(na));
ck('aiPaused blijft staan', Boolean(naObj.aiPaused), naObj);
ck('property blijft staan', naObj.property === 'P3', naObj);
ck('de notitie van de makelaar blijft staan', naObj.notes[0].text === 'gebeld', naObj);
const twee = crm.schrijfIds(na, 'pipedrive', { contactId: '33', dealId: '44' });
ck('een tweede CRM wist het eerste niet', (crm.leesIds(twee).hubspot || {}).contactId === '11', crm.leesIds(twee));
ck('en staat er zelf ook in', (crm.leesIds(twee).pipedrive || {}).dealId === '44', crm.leesIds(twee));
const losseTekst = crm.schrijfIds('gewoon een notitie die iemand typte', 'hubspot', { contactId: '9' });
ck('losse tekst gaat niet verloren',
   JSON.parse(losseTekst).notes[0].text === 'gewoon een notitie die iemand typte', losseTekst);
ck('lege notities zijn geen fout', crm.leesIds('').hubspot === undefined);
ck('onleesbare JSON leest als "nog nooit gesynchroniseerd"',
   Object.keys(crm.leesIds('{kapot')).length === 0);

/* ── Vanaf hier draait er een NEP-fetch ────────────────────────────────────
   Geen netwerk, geen sleutels: alleen de vraag of deze code de goede verzoeken
   in de goede volgorde stuurt. Dat is precies wat er hier fout kan gaan zonder
   dat iets rood wordt. */
const gedaan = [];
function nepFetch(antwoorden) {
  gedaan.length = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    gedaan.push(`${method} ${String(url).split('?')[0]}`);
    for (const [patroon, geef] of antwoorden) {
      if (new RegExp(patroon).test(`${method} ${url}`)) {
        return { ok: true, status: 200, text: async () => JSON.stringify(geef), json: async () => geef };
      }
    }
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };
}
const echteFetch = globalThis.fetch;
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'patTEST';

const HUBSPOT_ANTWOORDEN = [
  ['POST .*/objects/contacts/search', { results: [] }],
  ['POST .*/objects/contacts$',       { id: 'C1' }],
  ['PATCH .*/objects/contacts/',      { id: 'C1' }],
  ['POST .*/objects/deals$',          { id: 'D1' }],
  ['PATCH .*/objects/deals/',         { id: 'D1' }],
  ['POST .*/objects/notes$',          { id: 'N1' }],
];
const KOPPELING = { hubspot: { cred: { token: 'pat-nep' }, account: 'test' } };

console.log('\n— twee keer duwen in één beurt maakt GEEN tweede deal —');
/* Dit is de bug die deze test bewaakt. api/whatsapp.js kan in één beurt twee
   keer duwen: één keer als de assistent het gesprek afrondt, en één keer als
   hij in datzelfde antwoord een bezichtiging boekt. De tweede duw las het
   lead-record dat de eerste duw net verouderd had gemaakt, zag geen CRM-id's,
   en maakte een tweede contact én een tweede deal aan.

   Zet de fix terug en deze test wordt rood: geef de tweede duw `leadBasis`
   (met lege notities) in plaats van `nu.notities`, en er staat weer een POST. */
nepFetch(HUBSPOT_ANTWOORDEN);
(async () => {
  const eerste = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: 'Kantoor' });
  const eersteCalls = gedaan.slice();
  ck('de eerste duw maakt een contact aan',
     eersteCalls.some((c) => /POST .*objects\/contacts$/.test(c)), eersteCalls);
  ck('en een deal', eersteCalls.some((c) => /POST .*objects\/deals$/.test(c)), eersteCalls);
  ck('en schrijft de id\'s terug naar Airtable',
     eersteCalls.some((c) => /PATCH .*api\.airtable\.com/.test(c)), eersteCalls);
  ck('de teruggegeven notities dragen het contact-id',
     (crm.leesIds(eerste.notities).hubspot || {}).contactId === 'C1', eerste.notities);

  nepFetch(HUBSPOT_ANTWOORDEN);
  await crm.duw('TELJO', { ...leadBasis, notities: eerste.notities },
                { koppelingen: KOPPELING, velden: {}, kantoor: 'Kantoor' });
  const tweedeCalls = gedaan.slice();
  ck('de tweede duw maakt GEEN tweede contact aan',
     !tweedeCalls.some((c) => /POST .*objects\/contacts$/.test(c)), tweedeCalls);
  ck('en GEEN tweede deal',
     !tweedeCalls.some((c) => /POST .*objects\/deals$/.test(c)), tweedeCalls);
  ck('maar werkt het bestaande contact bij',
     tweedeCalls.some((c) => /PATCH .*objects\/contacts\//.test(c)), tweedeCalls);
  ck('en de bestaande deal',
     tweedeCalls.some((c) => /PATCH .*objects\/deals\//.test(c)), tweedeCalls);
  ck('zonder opnieuw te zoeken (het id was al bekend)',
     !tweedeCalls.some((c) => /contacts\/search/.test(c)), tweedeCalls);

  console.log('\n— zonder koppeling gebeurt er niets —');
  nepFetch([]);
  const leeg = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: {}, velden: {}, kantoor: '' });
  ck('geen resultaten', leeg.resultaten.length === 0, leeg);
  ck('en geen enkele aanroep', gedaan.length === 0, gedaan);

  console.log('\n— een CRM dat weigert sleept de rest niet mee —');
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (/api\.airtable\.com/.test(u)) return { ok: true, status: 200, text: async () => '{}' };
    if (/hubapi/.test(u)) return { ok: false, status: 401, text: async () => 'unauthorized' };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  const stuk = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  const stukEen = stuk.resultaten[0] || {};
  ck('een 401 geeft een nette uitslag, geen exception', stukEen.ok === false, stuk.resultaten);
  ck('met een code waar de klant iets aan heeft',
     stukEen.code === 'geen_toegang', stukEen);
  /* De rauwe tekst van de leverancier hoort nooit in beeld. */
  ck('en zonder de foutmelding van HubSpot erin',
     !/unauthorized/i.test(stukEen.fout || ''), stukEen.fout);

  console.log('\n— duwVeilig gooit nooit —');
  globalThis.fetch = async () => { throw new Error('netwerk weg'); };
  const veilig = await crm.duwVeilig('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('een kapot netwerk geeft een uitslag, geen exception',
     Array.isArray(veilig.resultaten), veilig);
  ck('en houdt de notities zoals ze waren', typeof veilig.notities === 'string', veilig);

  console.log('\n— statuscodes worden vertaald naar wat de klant kan doen —');
  const gevallen = [[401, 'geen_toegang', false], [429, 'te_druk', true], [500, 'storing', true], [400, 'geweigerd', false]];
  for (const [status, code, opnieuw] of gevallen) {
    globalThis.fetch = async () => ({ ok: false, status, text: async () => 'detail van de leverancier' });
    try {
      await http.vraag('https://voorbeeld.test/x', { leverancier: 'Test' });
      ck(`${status} gooit`, false);
    } catch (err) {
      ck(`${status} -> ${code}`, err.code === code, err.code);
      ck(`${status} -> opnieuw ${opnieuw}`, err.opnieuw === opnieuw, err.opnieuw);
      ck(`${status} lekt de tekst van de leverancier niet`, !/detail van de leverancier/.test(err.message), err.message);
    }
  }

  globalThis.fetch = echteFetch;
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
