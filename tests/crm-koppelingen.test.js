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
const omnicasa   = require(BASE + 'api/_crm/adapters/omnicasa.js');
const webhook    = require(BASE + 'api/_crm/adapters/webhook.js');
const crmConfig  = require(BASE + 'api/_crm/config.js');

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
ck('de andere vijf zijn wel beschikbaar',
   crm.adapters().filter((a) => a.beschikbaar).length === 5,
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

  console.log('\n— de webhook weigert elk adres dat naar binnen wijst —');
  /* Dit is het enige punt waar een KLANT een adres opgeeft dat onze server zelf
     aanroept. Zonder deze controle is dat een sleutel tot het interne netwerk
     van de hostingomgeving: 169.254.169.254 geeft op de meeste clouds metadata. */
  const adressen = [
    ['https://10.0.0.1/h',                     'intern_adres',  'privaat bereik'],
    ['https://127.0.0.1/h',                    'intern_adres',  'loopback'],
    ['https://169.254.169.254/latest/meta',    'intern_adres',  'cloud-metadata'],
    ['https://[::1]/h',                        'intern_adres',  'IPv6-loopback'],
    ['http://example.com/h',                   'geen_https',    'onversleuteld'],
    ['https://gebruiker:pw@example.com/h',     'url_met_login',  'inloggegevens in de URL'],
    ['helemaal geen url',                      'geen_url',      'onleesbaar'],
  ];
  for (const [url, code, waarom] of adressen) {
    let gekregen = 'GEEN FOUT';
    try { await webhook.keurUrl(url); } catch (e) { gekregen = e.code; }
    ck(`${waarom} -> geweigerd`, gekregen === code, { url, gekregen, verwacht: code });
  }
  /* Een publiek adres moet er wél door, anders is de controle waardeloos. */
  let publiekOk = false;
  try { await webhook.keurUrl('https://example.com/hook'); publiekOk = true; } catch (e) { publiekOk = e.code; }
  ck('een gewoon publiek adres mag wel', publiekOk === true, publiekOk);

  console.log('\n— de handtekening is die van Stripe —');
  /* Zelfde vorm als api/_stripe.js verifieert, zodat een ontvanger elke
     bestaande Stripe-verificatie kan hergebruiken. */
  const sig = webhook.tekenen('whsec_test', '{"a":1}', 1_700_000_000_000);
  ck('vorm t=<unix>,v1=<hex>', /^t=\d+,v1=[0-9a-f]{64}$/.test(sig.kop), sig.kop);
  ck('t is seconden, niet milliseconden', sig.t === 1_700_000_000, sig.t);
  const anders = webhook.tekenen('whsec_test', '{"a":2}', 1_700_000_000_000);
  ck('een andere body geeft een andere handtekening', anders.v1 !== sig.v1);
  const andereSleutel = webhook.tekenen('whsec_ANDERS', '{"a":1}', 1_700_000_000_000);
  ck('een andere sleutel geeft een andere handtekening', andereSleutel.v1 !== sig.v1);
  const zelfde = webhook.tekenen('whsec_test', '{"a":1}', 1_700_000_000_000);
  ck('zelfde invoer geeft zelfde handtekening', zelfde.v1 === sig.v1);
  ck('een gemaakte sleutel is lang genoeg om niet te raden',
     webhook.nieuweSleutel().length >= 48, webhook.nieuweSleutel().length);
  ck('en twee sleutels zijn niet gelijk', webhook.nieuweSleutel() !== webhook.nieuweSleutel());

  console.log('\n— één herkansing, en alleen als dat zin heeft —');
  let pogingen = 0;
  globalThis.fetch = async (url) => {
    if (/airtable/.test(String(url))) return { ok: true, status: 200, text: async () => '{}' };
    pogingen++;
    /* 503 = tijdelijk. De eerste poging faalt, de tweede lukt. */
    if (pogingen <= 1) return { ok: false, status: 503, text: async () => 'even weg' };
    if (/contacts\/search/.test(String(url))) return { ok: true, status: 200, text: async () => JSON.stringify({ results: [] }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'X1' }) };
  };
  const naStoring = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('een 503 wordt één keer opnieuw geprobeerd en slaagt dan',
     (naStoring.resultaten[0] || {}).ok === true, naStoring.resultaten);

  pogingen = 0;
  globalThis.fetch = async (url) => {
    if (/airtable/.test(String(url))) return { ok: true, status: 200, text: async () => '{}' };
    pogingen++;
    return { ok: false, status: 401, text: async () => 'unauthorized' };
  };
  const naWeigering = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('een 401 wordt NIET opnieuw geprobeerd', (naWeigering.resultaten[0] || {}).ok === false, naWeigering.resultaten);
  /* Precies één zoek- plus één schrijfpoging, geen herkansing: een verkeerde
     sleutel wordt niet beter van wachten, en de klant wacht wel. */
  ck('een verlopen sleutel kost geen extra wachttijd', pogingen <= 2, pogingen);

  console.log('\n— sleutels verlaten de server nooit —');
  /* status() tekent het scherm. Als daar ooit een `cred` in belandt, staat het
     token van een klant in elke browser-devtools en in elke HAR-export. */
  const echteLees = crmConfig.lees;
  crmConfig.lees = async () => ({
    koppelingen: {
      hubspot: { cred: { token: 'pat-GEHEIM-NOOIT-TONEN' }, account: 'Pijplijn: Verkoop', verbondenOp: 'x' },
      webhook: { cred: { url: 'https://klant.be/h', secret: 'whsec_GEHEIM' }, account: 'klant.be' },
    },
    kantoor: 'Kantoor', velden: {}, recordId: 'recX',
  });
  const st = await crm.status('TELJO');
  const alsTekst = JSON.stringify(st);
  ck('geen token in de status', !/GEHEIM/.test(alsTekst), alsTekst.slice(0, 200));
  ck('geen cred-object in de status', !/"cred"/.test(alsTekst));
  ck('wel het account, als bewijs voor de klant', /Pijplijn: Verkoop/.test(alsTekst));
  ck('en de webhook staat er als koppeling in', st.verbonden.some((v) => v.naam === 'webhook'), st.verbonden);
  crmConfig.lees = echteLees;

  console.log('\n— de webhook hoort bij de andere adapters, niet ernaast —');
  ck('zes adapters', crm.adapters().length === 6, crm.adapters().map((a) => a.naam));
  ck('webhook is beschikbaar', crm.adapters().find((a) => a.naam === 'webhook').beschikbaar === true);
  ck('en vraagt een url', webhook.velden.some((v) => v.sleutel === 'url'));
  ck('de sleutel is optioneel (we maken er zelf een)',
     webhook.velden.find((v) => v.sleutel === 'secret').optioneel === true);

  console.log('\n— een sleutel komt nooit in een logregel —');
  /* `detail` is het RUWE antwoord van de leverancier, en dat is het nut ervan.
     Het gevaar ook: Pipedrive zet zijn token in de QUERYSTRING, dus een API die
     het verzoek terug-echoot zet de sleutel van een klant in de Vercel-logs,
     waar hij blijft staan. */
  const lekken = [
    ['?api_token=abc123GEHEIM&limit=1',            'querystring-token'],
    ['{"access_token":"ya29.LANGGEHEIM"}',         'JSON-token'],
    ['Authorization: Bearer pat-na1-GEHEIM',        'Bearer-kop'],
    ["{'client_secret': 'sup3rgeheim'}",            'client secret'],
  ];
  for (const [rauw, wat] of lekken) {
    const schoon = http.schoonDetail(rauw);
    ck(`${wat} wordt afgeschermd`, !/GEHEIM|geheim|ya29\.|abc123/.test(schoon), schoon);
    ck(`${wat} houdt wel context over`, schoon.length > 5, schoon);
  }
  ck('een gewone fout blijft leesbaar',
     http.schoonDetail('lead heeft geen telefoonnummer') === 'lead heeft geen telefoonnummer');
  ck('en dat gebeurt in de constructor, niet alleen in de helper',
     new http.CrmError('x', { detail: '?api_token=GEHEIM' }).detail.indexOf('GEHEIM') === -1);

  console.log('\n— sleutels liggen versleuteld, of ze liggen er niet —');
  const oudeSecret = process.env.SESSION_SECRET;
  const oudeCrmKey = process.env.CRM_TOKEN_KEY;
  delete process.env.CRM_TOKEN_KEY;
  process.env.SESSION_SECRET = 'test-geheim-voor-deze-test';
  const klaar = crmConfig.versleutel(JSON.stringify({ hubspot: { cred: { token: 'pat-GEHEIM' } } }));
  ck('versleuteld begint met de versiemarkering', klaar.slice(0, 3) === 'v1:', klaar.slice(0, 12));
  ck('en het token is niet terug te lezen uit de opslag', klaar.indexOf('GEHEIM') === -1);
  ck('heen en terug geeft hetzelfde',
     JSON.parse(crmConfig.ontsleutel(klaar)).hubspot.cred.token === 'pat-GEHEIM');
  ck('twee keer versleutelen geeft niet dezelfde tekst (eigen IV)',
     crmConfig.versleutel('zelfde') !== crmConfig.versleutel('zelfde'));
  ck('geknoei met de tekst geeft leeg, geen halve waarde',
     crmConfig.ontsleutel(klaar.slice(0, -6) + 'AAAAAA') === '');
  ck('onzin geeft leeg', crmConfig.ontsleutel('zomaar wat') === '');

  /* De sleutel van Google mag die van het CRM niet openen. Zelfde basis,
     andere afleiding -- anders opent één gelekt geheim allebei. */
  const gcal = require(BASE + 'api/_gcal.js');
  const gcalTekst = gcal.encryptToken('google-refresh-GEHEIM');
  ck('een Google-token is niet met de CRM-sleutel te openen',
     crmConfig.ontsleutel(gcalTekst) === '', crmConfig.ontsleutel(gcalTekst));

  /* Fail closed: liever niets opslaan dan met een raadbare sleutel. */
  delete process.env.SESSION_SECRET;
  delete process.env.ADMIN_KEY;
  let weigerde = false;
  try { crmConfig.versleutel('x'); } catch (e) { weigerde = e.code === 'geen_sleutel'; }
  ck('zonder sleutel WEIGERT hij op te slaan', weigerde);
  if (oudeSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oudeSecret;
  if (oudeCrmKey !== undefined) process.env.CRM_TOKEN_KEY = oudeCrmKey;

  console.log('\n— geen tenant, geen toegang —');
  /* CLAUDE.md: leeg leest verderop als "admin, toon alles". Hier is dat een
     harde fout, nooit een standaard. */
  for (const leeg of ['', null, undefined, '   ']) {
    let code = 'GEEN FOUT';
    try { await crmConfig.lees(leeg); } catch (e) { code = e.code; }
    ck(`projectCode ${JSON.stringify(leeg)} -> geweigerd`, code === 'geen_tenant', code);
  }

  console.log('\n— een lead van kantoor A gaat nooit naar het CRM van kantoor B —');
  /* Dit is de enige plek in Helvaro die leadgegevens naar een systeem van een
     ANDER bedrijf stuurt. Een verwisseling is daar geen zichtbare bug maar een
     datalek dat niemand opmerkt. Elke aanroeper controleert dit vandaag zelf;
     deze grendel is er voor de vijfde aanroeper die dat vergeet. */
  nepFetch(HUBSPOT_ANTWOORDEN);
  let tenantCode = 'GEEN FOUT';
  try {
    await crm.duw('TELJO', { ...leadBasis, projectCode: 'ANDERKANTOOR' },
                  { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  } catch (e) { tenantCode = e.code; }
  ck('een lead met een andere projectcode wordt geweigerd', tenantCode === 'verkeerde_tenant', tenantCode);
  ck('en er is niets verstuurd', gedaan.length === 0, gedaan);

  nepFetch(HUBSPOT_ANTWOORDEN);
  const zelfdeTenant = await crm.duw('TELJO', { ...leadBasis, projectCode: 'TELJO' },
                                     { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('dezelfde projectcode gaat gewoon door', (zelfdeTenant.resultaten[0] || {}).ok === true, zelfdeTenant.resultaten);

  nepFetch(HUBSPOT_ANTWOORDEN);
  const geenCode = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('een lead zonder projectcode blijft doorgaan (niets vast te stellen)',
     (geenCode.resultaten[0] || {}).ok === true, geenCode.resultaten);

  /* mapLead moet die code ook echt meegeven, anders grendelt de grendel niets. */
  const leadsRead = require(BASE + 'api/_leads-read.js');
  ck('mapLead draagt de projectcode',
     leadsRead.mapLead({ id: 'rec1', fields: { fldSmczuyUJd26HLe: 'TELJO' } }).projectCode === 'TELJO');

  console.log('\n— Omnicasa maakt niets aan bij het koppelen —');
  /* Er stond hier een POST met een lege body naar person/register, in de aanname
     dat hun validatie die zou weigeren. Klopt die aanname niet, dan staat er na
     elke koppelpoging een lege persoon in het CRM van een makelaar. */
  let geraakt = 0;
  globalThis.fetch = async () => { geraakt++; return { ok: true, status: 200, text: async () => '{}' }; };
  const omni = await omnicasa.test({ secret: 'test-sleutel' });
  ck('koppelen raakt hun API niet aan', geraakt === 0, geraakt);
  ck('en zegt eerlijk dat het onbevestigd is', omni.onbevestigd === true, omni);
  ck('http:// wordt geweigerd', await (async () => {
    try { await omnicasa.test({ secret: 'x', basis: 'http://onveilig.example' }); return false; }
    catch (e) { return e.code === 'geen_https'; }
  })());

  console.log('\n— ontkoppelen haalt de sleutel echt weg —');
  /* Een "ontkoppeld" dat het token laat staan is het ergste soort: het scherm
     zegt weg, de sleutel ligt er nog, en niemand kijkt ooit terug.
     Dit loopt door de ECHTE lees- en schrijfweg (met een nep-fetch als
     Airtable), want verwijder() roept zijn eigen lees() aan -- een gestubde
     export onderschept dat niet, en dan zou de test iets anders bewijzen dan
     hij beweert. */
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-geheim';
  const blobMet = crmConfig.versleutel(JSON.stringify({
    hubspot: { cred: { token: 'pat-MOET-WEG' }, account: 'x' },
    webhook: { cred: { url: 'https://klant.be/h', secret: 'whsec_BLIJFT' }, account: 'klant.be' },
  }));
  let geschrevenBlob = null;
  globalThis.fetch = async (url, opts = {}) => {
    const m = opts.method || 'GET';
    if (m === 'PATCH') {
      geschrevenBlob = Object.values(JSON.parse(opts.body).fields)[0];
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    }
    return {
      ok: true, status: 200,
      json: async () => ({ records: [{ id: 'recKLANT', fields: { fld5UwV0QS8m7UAHF: blobMet } }] }),
      text: async () => '{}',
    };
  };
  const weg = await crm.ontkoppel('TELJO', 'hubspot');
  ck('ontkoppelen meldt dat er iets weg is', weg === true, weg);
  ck('er is echt iets weggeschreven', Boolean(geschrevenBlob));
  const naOntkoppelen = crmConfig.ontsleutel(String(geschrevenBlob || ''));
  ck('het HubSpot-token is uit de opslag verdwenen',
     naOntkoppelen.indexOf('MOET-WEG') === -1, naOntkoppelen.slice(0, 120));
  ck('en de ANDERE koppeling staat er nog',
     naOntkoppelen.indexOf('whsec_BLIJFT') !== -1, naOntkoppelen.slice(0, 120));

  console.log('\n— de noodrem —');
  /* Dit is de enige functie die namens een klant schrijft in het systeem van een
     ANDER bedrijf, en hij heeft nog nooit tegen een echte CRM-API gedraaid.
     Zonder deze schakelaar zijn de opties bij een structurele fout: een revert
     uitrollen, of elke klant vragen te ontkoppelen. */
  nepFetch(HUBSPOT_ANTWOORDEN);
  process.env.CRM_DISABLED = '1';
  const metRem = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('met de rem erop gaat er niets naar buiten', gedaan.length === 0, gedaan);
  ck('en de klant krijgt een uitslag, geen exception',
     (metRem.resultaten[0] || {}).code === 'crm_uit', metRem.resultaten);
  ck('die zegt dat de leads bewaard blijven',
     /bewaard/i.test((metRem.resultaten[0] || {}).fout || ''), (metRem.resultaten[0] || {}).fout);
  /* Belangrijk: GEEN id's wegschrijven. Anders denkt de volgende synchronisatie
     dat deze lead al verstuurd is en slaat hij hem over. */
  ck('en er zijn geen id\'s weggeschreven',
     Object.keys(crm.leesIds(metRem.notities)).length === 0, metRem.notities);

  let koppelCode = 'GEEN FOUT';
  try { await crm.verbind('TELJO', 'hubspot', { token: 'x' }); } catch (e) { koppelCode = e.code; }
  ck('koppelen kan ook niet terwijl alles stilstaat', koppelCode === 'crm_uit', koppelCode);

  delete process.env.CRM_DISABLED;
  nepFetch(HUBSPOT_ANTWOORDEN);
  const zonderRem = await crm.duw('TELJO', { ...leadBasis }, { koppelingen: KOPPELING, velden: {}, kantoor: '' });
  ck('rem eraf en het loopt weer', (zonderRem.resultaten[0] || {}).ok === true, zonderRem.resultaten);

  console.log('\n— een omleiding is geen sprong naar binnen —');
  /* Gevonden bij een onafhankelijke beveiligingsronde, en nagespeeld: fetch()
     volgt standaard tot twintig omleidingen, en de adrescontrole geldt alleen
     voor de EERSTE hop. Een keurig publiek adres dat 307 antwoordt met
     Location: http://169.254.169.254/... haalde onze server dus alsnog het
     interne netwerk in -- met de POST en de body intact.
     api/_lib/fetch-website.js deed dit al goed; deze module week ervan af. */
  for (const status of [301, 302, 303, 307, 308]) {
    globalThis.fetch = async () => ({
      ok: false, status,
      headers: { get: (k) => (k === 'location' ? 'http://169.254.169.254/latest/meta-data/' : null) },
      text: async () => '',
    });
    let code = 'GEEN FOUT';
    try { await http.vraag('https://net-publiek.example/hook', { leverancier: 'Test' }); }
    catch (e) { code = e.code; }
    ck(`${status} wordt geweigerd in plaats van gevolgd`, code === 'omleiding', code);
  }
  /* De bovenstaande vijf gebruiken een NEP-fetch, en die volgt uit zichzelf al
     niets. Ze bewijzen dus alleen dat een 3xx netjes wordt afgehandeld -- niet
     dat de echte aanroep geen omleidingen volgt.

     Hier stond eerst een controle op de BRONTEKST (staat er redirect:'manual'
     in het bestand). Die was waardeloos: de opmerking eronder noemt diezelfde
     tekst, dus hij bleef groen toen de regel uit de fetch werd gehaald. Precies
     het soort test dat CLAUDE.md beschrijft -- groen met de fout erin.

     Dus nu de echte weg: twee lokale servers, een die doorstuurt naar een die
     zich als intern doelwit gedraagt. Wordt de tweede geraakt, dan is de
     bescherming weg. Geen extern netwerk nodig. */
  /* EERST de echte fetch terugzetten. Zonder deze regel draaide de test
     hieronder nog op de nep-fetch van de lus hierboven -- die geeft altijd een
     3xx terug, ongeacht het adres, dus de test was groen om de verkeerde reden
     en bleef groen toen redirect:'manual' uit de code werd gehaald.
     Gevonden door de mutatie, niet door te kijken. */
  globalThis.fetch = echteFetch;

  const nodeHttp = require('http');
  const omleidingUitslag = await new Promise((klaar) => {
    let internGeraakt = false;
    const intern = nodeHttp.createServer((req, res) => { internGeraakt = true; res.end('{"geheim":"metadata"}'); });
    const doorstuur = nodeHttp.createServer((req, res) => {
      res.writeHead(307, { Location: 'http://127.0.0.1:' + intern.address().port + '/latest/meta-data/' });
      res.end();
    });
    intern.listen(0, '127.0.0.1', () => doorstuur.listen(0, '127.0.0.1', async () => {
      let code = 'GEVOLGD';
      try { await http.vraag('http://127.0.0.1:' + doorstuur.address().port + '/hook',
                             { method: 'POST', body: '{}', leverancier: 'Test' }); }
      catch (e) { code = e.code; }
      intern.close(); doorstuur.close();
      klaar({ internGeraakt, code });
    }));
  });
  ck('een ECHTE omleiding bereikt het interne doelwit niet',
     omleidingUitslag.internGeraakt === false, omleidingUitslag);
  ck('en levert de omleidingsfout op', omleidingUitslag.code === 'omleiding', omleidingUitslag);

  console.log('\n— alle drie de klantadressen worden gecontroleerd —');
  /* Deze controle stond alleen in de webhook-adapter, terwijl Omnicasa en
     Salesforce ook een adres van de klant aannemen. api/leads.js beweerde in een
     opmerking dat het interne netwerk "al dicht" was; dat was het niet. */
  const adres = require(BASE + 'api/_crm/adres.js');
  ck('de controle is een gedeelde module', typeof adres.keurUrl === 'function');
  ck('en de webhook gebruikt diezelfde', webhook.keurUrl === adres.keurUrl);

  let omniCode = 'GEEN FOUT';
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '{}' });
  try { await omnicasa.test({ secret: 'x', basis: 'https://10.0.0.5' }); } catch (e) { omniCode = e.code; }
  ck('Omnicasa weigert een intern adres', omniCode === 'intern_adres', omniCode);

  const sfGevallen = [
    ['10.0.0.5:8443',                       'geen_salesforce_domein', 'een intern IP'],
    ['slachtoffer@aanvaller.tld',           'geen_salesforce_domein', 'inloggegevens die het adres verhullen'],
    ['evil.my.salesforce.com.aanvaller.tld','geen_salesforce_domein', 'een achtervoegsel dat er alleen op lijkt'],
    ['localhost',                           'geen_salesforce_domein', 'loopback'],
  ];
  for (const [domein, code, waarom] of sfGevallen) {
    let gekregen = 'GEEN FOUT';
    try { salesforce.salesforceHost(domein); } catch (e) { gekregen = e.code; }
    ck(`Salesforce weigert ${waarom}`, gekregen === code, { domein, gekregen });
  }
  ck('en laat een echt My Domain door',
     salesforce.salesforceHost('https://kantoor.my.salesforce.com/lightning') === 'kantoor.my.salesforce.com');
  ck('ook een sandbox',
     salesforce.salesforceHost('kantoor.sandbox.my.salesforce.com') === 'kantoor.sandbox.my.salesforce.com');

  globalThis.fetch = echteFetch;
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
