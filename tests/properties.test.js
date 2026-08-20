/*
 * Panden: de opslag, de regels en wat de AI ervan te zien krijgt.
 *
 * Waarom deze test bestaat: een pand is het enige gegeven in Helvaro dat
 * tegelijk PUBLIEK is (de code staat in /start/TELJO/P3, dus iedereen kan hem
 * raden) en TENANT-EIGEN (het pand van de ene makelaar hoort onzichtbaar te
 * zijn voor de andere). Die twee samen maken elke ontbrekende eigenaarscheck
 * een datalek, niet een bug.
 *
 * De tweede reden is de status. "Verkocht" is geen etiket maar een regel: er
 * mag geen bezichtiging voor ingepland worden. Zonder test verdwijnt zo'n
 * regel bij de eerstvolgende herschrijving van de prompt.
 */
const fs = require('fs');
const path = require('path');
const props = require('../api/_properties');
const prompts = require('../api/_ai/prompts');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 300));
  cond ? pass++ : fail++;
}
async function werptMet(fn, code) {
  try { await fn(); return false; } catch (e) { return e && e.code === code; }
}

/* ── Een nagemaakte Airtable ─────────────────────────────────────────────────
   Zodat de echte queries draaien -- inclusief de filterformule, want dat is
   precies de regel waar tenant-isolatie in zit. */
function nepAirtable(records, opties = {}) {
  const gezien = [];
  global.fetch = async (url, init) => {
    gezien.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
    if (opties.status && opties.status !== 200) {
      return { ok: false, status: opties.status, text: async () => '', json: async () => ({}) };
    }
    if (init && init.method === 'POST') {
      const velden = JSON.parse(init.body).fields;
      return { ok: true, status: 200, json: async () => ({ id: 'recNIEUW', fields: velden }) };
    }
    if (init && init.method === 'PATCH') {
      const velden = JSON.parse(init.body).fields;
      return { ok: true, status: 200, json: async () => ({ id: 'recPATCH', fields: velden }) };
    }
    /* De filterformule nabootsen op het enige dat telt: de projectcode. */
    const m = /filterByFormula=([^&]*)/.exec(String(url));
    const formule = m ? decodeURIComponent(m[1]) : '';
    const tenantM = /\{Project Code\}="([^"]*)"/.exec(formule);
    const codeM   = /UPPER\(\{Property Code\}\)="([^"]*)"/.exec(formule);
    let uit = records;
    if (tenantM) uit = uit.filter((r) => (r.fields['Project Code'] || '') === tenantM[1]);
    if (codeM)   uit = uit.filter((r) => String(r.fields['Property Code'] || '').toUpperCase() === codeM[1]);
    return { ok: true, status: 200, json: async () => ({ records: uit }) };
  };
  return gezien;
}

function rec(id, project, code, extra = {}) {
  return { id, fields: Object.assign({ 'Project Code': project, 'Property Code': code, Address: code + '-straat 1' }, extra) };
}

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test-base';

(async () => {
  console.log('\n— zonder projectcode gebeurt er niets —');
  /* Leeg leest verderop als "admin, toon alles". Dat mag hier nooit kunnen. */
  props._resetAvailability();
  nepAirtable([]);
  ck('list() weigert', await werptMet(() => props.list(''), 'no_tenant'));
  ck('getByCode() weigert', await werptMet(() => props.getByCode('', 'P1'), 'no_tenant'));
  ck('save() weigert', await werptMet(() => props.save('', { adres: 'x' }), 'no_tenant'));
  ck('archive() weigert', await werptMet(() => props.archive(null, 'P1'), 'no_tenant'));

  console.log('\n— een makelaar ziet alleen zijn eigen panden —');
  props._resetAvailability();
  nepAirtable([rec('r1', 'TELJO', 'P1'), rec('r2', 'ANDERE', 'P1'), rec('r3', 'TELJO', 'P2')]);
  const mijn = await props.list('TELJO');
  ck('twee panden, allebei van TELJO', mijn.length === 2 && mijn.every((p) => p.projectCode === 'TELJO'),
     mijn.map((p) => p.projectCode + '/' + p.code));
  /* Twee klanten mogen allebei "P1" gebruiken. Dat is precies waarom de code
     alleen binnen een tenant uniek hoeft te zijn -- en waarom een opzoeking
     zonder tenantfilter het verkeerde pand zou opleveren. */
  const p1 = await props.getByCode('TELJO', 'P1');
  ck('P1 van TELJO is die van TELJO', p1 && p1.id === 'r1', p1 && p1.id);
  const anders = await props.getByCode('ANDERE', 'P1');
  ck('P1 van ANDERE is een ander record', anders && anders.id === 'r2', anders && anders.id);

  console.log('\n— gearchiveerd en niet-publiek vallen weg waar dat hoort —');
  props._resetAvailability();
  nepAirtable([
    rec('a', 'T', 'P1'),
    rec('b', 'T', 'P2', { Archived: true }),
    rec('c', 'T', 'P3', { Public: false }),
    rec('d', 'T', 'P4', { Status: 'verkocht' }),
  ]);
  ck('standaard zonder gearchiveerde', (await props.list('T')).map((p) => p.code).join(',') === 'P1,P3,P4');
  ck('mét gearchiveerde op verzoek', (await props.list('T', { inclusiefGearchiveerd: true })).length === 4);
  ck('alleen publiek', (await props.list('T', { alleenPubliek: true })).map((p) => p.code).join(',') === 'P1,P4');
  ck('alleen bezichtigbaar laat verkocht vallen',
     (await props.list('T', { alleenBezichtigbaar: true })).map((p) => p.code).join(',') === 'P1,P3');

  console.log('\n— sorteren op code is natuurlijk, niet alfabetisch —');
  props._resetAvailability();
  nepAirtable([rec('x', 'T', 'P10'), rec('y', 'T', 'P2'), rec('z', 'T', 'P1')]);
  ck('P1, P2, P10 — niet P1, P10, P2',
     (await props.list('T')).map((p) => p.code).join(',') === 'P1,P2,P10');

  console.log('\n— status is een regel, geen etiket —');
  ck('beschikbaar mag bezichtigd worden', props.kanBezichtigen('beschikbaar'));
  ck('onder bod mag ook', props.kanBezichtigen('onder bod'));
  ck('verkocht niet', !props.kanBezichtigen('verkocht'));
  ck('verhuurd niet', !props.kanBezichtigen('verhuurd'));
  ck('uit aanbod niet', !props.kanBezichtigen('uit aanbod'));
  /* Onzin valt terug op beschikbaar. Dat is de veilige kant: een pand dat per
     ongeluk zichtbaar blijft is te herstellen, een pand dat onzichtbaar wordt
     kost de makelaar leads zonder dat hij weet waarom. */
  ck('onbekende status valt terug op beschikbaar', props.normStatus('bananen') === 'beschikbaar');

  console.log('\n— pandcodes —');
  ck('P3 is geldig', props.geldigeCode('P3'));
  ck('een eigen referentie mag', props.geldigeCode('VH-2291'));
  ck('kleine letters worden hoofdletters', props.normCode('vh-2291') === 'VH-2291');
  ck('een spatie wordt een streepje', props.normCode('VH 2291') === 'VH-2291');
  ck('leeg is ongeldig', !props.geldigeCode(''));
  ck('een schuine streep is ongeldig', !props.geldigeCode('P3/../P4'));
  ck('een aanhalingsteken is ongeldig', !props.geldigeCode('P3"'));
  ck('te lang is ongeldig', !props.geldigeCode('P'.repeat(25)));
  ck('volgende code springt over de eigen referenties heen',
     props.volgendeCode([{ code: 'P1' }, { code: 'VH-2291' }, { code: 'P7' }]) === 'P8');
  ck('eerste pand wordt P1', props.volgendeCode([]) === 'P1');

  console.log('\n— wat een klant instuurt wordt begrensd —');
  const v = props.naarVelden({
    prijs: 1e12, slaapkamers: 900, oppervlakte: -5, bouwjaar: 9999,
    type: 'kasteel', transactie: 'te ruilen', status: 'gestolen',
    fotos: ['https://ok.example/a.jpg', 'http://onveilig.example/b.jpg', 'javascript:alert(1)'],
    troeven: Array(40).fill('troef'),
  }, 'T');
  ck('prijs afgetopt', v.Price === 100000000, v.Price);
  ck('slaapkamers afgetopt', v.Bedrooms === 50, v.Bedrooms);
  ck('negatieve oppervlakte wordt 0', v.Surface === 0, v.Surface);
  ck('onbekend type wordt overig', v.Type === 'overig', v.Type);
  ck('onbekende transactie wordt te koop', v.Transaction === 'te koop', v.Transaction);
  ck('onbekende status wordt beschikbaar', v.Status === 'beschikbaar', v.Status);
  ck('alleen https-fotos overleven', v['Photo URLs'] === 'https://ok.example/a.jpg', v['Photo URLs']);
  ck('troeven afgetopt op 12', v.Highlights.split('\n').length === 12);
  ck('de projectcode komt van de aanroeper', v['Project Code'] === 'T');

  console.log('\n— opslaan —');
  props._resetAvailability();
  nepAirtable([rec('r1', 'T', 'P1')]);
  ck('zonder adres weigert hij', await werptMet(() => props.save('T', { adres: '  ' }), 'no_address'));
  const nieuw = await props.save('T', { adres: 'Nieuwstraat 5' });
  ck('nieuw pand krijgt de volgende code', nieuw.code === 'P2', nieuw.code);
  const eigen = await props.save('T', { adres: 'Eigen 1', code: 'vh-9' });
  ck('eigen referentie wordt genormaliseerd', eigen.code === 'VH-9', eigen.code);
  ck('een onmogelijke code weigert hij', await werptMet(() => props.save('T', { adres: 'x', code: 'a/b' }), 'bad_code'));

  console.log('\n— de tabel bestaat nog niet —');
  props._resetAvailability();
  nepAirtable([], { status: 404 });
  ck('available() is onwaar', (await props.available()) === false);
  ck('list() geeft leeg terug in plaats van te ontploffen', (await props.list('T')).length === 0);
  ck('getByCode() geeft null', (await props.getByCode('T', 'P1')) === null);
  ck('save() zegt waarom het niet kan', await werptMet(() => props.save('T', { adres: 'x' }), 'no_table'));

  /* ── Herkennen uit een gesprek ─────────────────────────────────────────── */
  console.log('\n— welk pand bedoelt deze lead? —');
  const lijst = [
    { code: 'P1', adres: 'Lange Violettestraat 12', plaats: 'Gent', status: 'beschikbaar' },
    { code: 'P2', adres: 'Korenmarkt 4', plaats: 'Gent', status: 'beschikbaar' },
    { code: 'P10', adres: 'Brugsesteenweg 118', plaats: 'Mariakerke', status: 'beschikbaar' },
  ];
  ck('op straatnaam', props.matchUitTekst(lijst, 'die woning in de Lange Violettestraat').pand.code === 'P1');
  ck('op referentie', props.matchUitTekst(lijst, 'ik zag P2 op jullie site').pand.code === 'P2');
  /* P1 mag niet matchen in P10: dat is het verschil tussen twee panden. */
  ck('P10 matcht niet als P1', props.matchUitTekst(lijst, 'gaat over P10').pand.code === 'P10');
  ck('alleen een stad is niet genoeg', props.matchUitTekst(lijst, 'iets in Gent').pand === null);
  ck('bij twijfel geen keuze', props.matchUitTekst(lijst, 'iets in Gent').reden === 'meerdere');
  ck('niets herkenbaars', props.matchUitTekst(lijst, 'hallo, ben je er?').pand === null);
  ck('lege lijst valt niet om', props.matchUitTekst([], 'Lange Violettestraat').pand === null);

  /* ── Wat de AI te zien krijgt ──────────────────────────────────────────── */
  console.log('\n— de pandfiche voor de AI —');
  const fiche = prompts.panden.fiche({
    code: 'P1', adres: 'Lange Violettestraat 12', postcode: '9000', plaats: 'Gent',
    type: 'huis', transactie: 'te koop', prijs: 395000, slaapkamers: 3, oppervlakte: 145,
    epc: 'C', status: 'beschikbaar', troeven: ['Tuin'], omschrijving: 'Ruime rijwoning.',
  });
  ck('de prijs staat erin', fiche.indexOf('395.000') !== -1);
  ck('het adres staat erin', fiche.indexOf('Lange Violettestraat 12') !== -1);
  ck('de verzin-geen-getal regel staat erin', fiche.indexOf('Verzin NOOIT een getal') !== -1);
  ck('geen waardebepaling', fiche.indexOf('wat het pand waard is') !== -1);

  const ficheWeg = prompts.panden.fiche({ code: 'P9', adres: 'Weg 1', status: 'verkocht', troeven: [] });
  ck('verkocht: geen bezichtiging', ficheWeg.indexOf('GEEN bezichtiging') !== -1);
  const ficheBod = prompts.panden.fiche({ code: 'P8', adres: 'Bod 1', status: 'onder bod', troeven: [] });
  ck('onder bod: wel bezichtigen, wel eerlijk zijn', ficheBod.indexOf('ONDER BOD') !== -1
     && ficheBod.indexOf('GEEN bezichtiging') === -1);
  ck('lege fiche bij geen pand', prompts.panden.fiche(null) === '');
  /* Een pand zonder prijs mag geen prijs krijgen. */
  const ficheGeenPrijs = prompts.panden.fiche({ code: 'P7', adres: 'Zonder 1', prijs: null, status: 'beschikbaar', troeven: [] });
  ck('geen prijs betekent geen prijsregel', ficheGeenPrijs.indexOf('Vraagprijs') === -1);

  console.log('\n— de pandenlijst als het pand onbekend is —');
  const index = prompts.panden.index(lijst.concat([{ code: 'P4', adres: 'Weg 2', status: 'verkocht' }]));
  ck('drie bezichtigbare panden staan erin', (index.match(/\n- P/g) || []).length === 3, index);
  ck('het verkochte pand staat er niet in', index.indexOf('P4') === -1);
  ck('de opdracht is vragen, niet gokken', index.indexOf('Gok nooit') !== -1);
  ck('lege lijst geeft leeg blok', prompts.panden.index([]) === '');
  ck('alleen verkochte panden geeft leeg blok',
     prompts.panden.index([{ code: 'P4', adres: 'x', status: 'verkocht' }]) === '');
  const veel = [];
  for (let i = 1; i <= 30; i++) veel.push({ code: 'P' + i, adres: 'Straat ' + i, status: 'beschikbaar' });
  const grootIndex = prompts.panden.index(veel);
  ck('bij dertig panden hoogstens twaalf regels', (grootIndex.match(/\n- P\d/g) || []).length <= 12);
  ck('en hij zegt dat er meer zijn', grootIndex.indexOf('en nog 18 andere') !== -1);

  /* ── De aansluitingen ──────────────────────────────────────────────────── */
  console.log('\n— de onderdelen zijn echt aangesloten —');
  const lees = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  const leads = lees('api/leads.js');
  for (const m of ['listing-list', 'listing-save', 'listing-archive']) {
    ck(`leads.js kent mode ${m}`, leads.indexOf(`body.mode === '${m}'`) !== -1);
  }
  /* Elke mode moet de tenantcheck hebben. Zonder die regel leest een lege
     projectcode verderop als "alles". */
  const modeBlokken = leads.split(/if \(body\.mode === 'listing-/).slice(1);
  ck('elke listing-mode controleert de client context',
     modeBlokken.every((b) => b.slice(0, 200).indexOf("if (!projectCode)") !== -1), modeBlokken.length);
  ck('de projectcode komt niet uit de body',
     leads.indexOf('_properties.list(body.projectCode') === -1
     && leads.indexOf('_properties.save(body.projectCode') === -1);

  const vercel = JSON.parse(lees('vercel.json'));
  const routes = (vercel.rewrites || []).map((r) => r.source);
  ck('/start/:code/:pand bestaat', routes.indexOf('/start/:code/:pand') !== -1, routes);
  ck('en staat vóór /start/:code', routes.indexOf('/start/:code/:pand') < routes.indexOf('/start/:code'));

  const form = lees('api/form.js');
  ck('form.js leest de pandcode', form.indexOf('body.property') !== -1);
  ck('form.js bewaart hem op de lead', form.indexOf('{ property: pand }') !== -1);

  const wa = lees('api/whatsapp.js');
  ck('whatsapp.js bouwt pandcontext', wa.indexOf('pandSectie') !== -1);
  ck('whatsapp.js weigert te boeken voor een pand dat niet bezichtigd kan worden',
     wa.indexOf('ctx.pandBezichtigbaar === false') !== -1);
  /* De rem moet VOOR de toewijzing staan, anders staat de afspraak er al. */
  const iRem = wa.indexOf('ctx.pandBezichtigbaar === false');
  const iZet = wa.indexOf('appointment = { start: bookData.start');
  ck('en die rem staat vóór het zetten van de afspraak', iRem !== -1 && iZet !== -1 && iRem < iZet, { iRem, iZet });

  const dash = lees('api/dashboard.js');
  ck('het dashboard heeft een Panden-pagina', dash.indexOf('id="page-panden"') !== -1);
  ck('en een navigatieknop', dash.indexOf('data-page="panden"') !== -1);
  ck('en laadt hem bij navigeren', dash.indexOf("if (page === 'panden')") !== -1);

  const leadsRead = lees('api/_leads-read.js');
  ck('een lead draagt zijn pandcode', leadsRead.indexOf("'property'") !== -1);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
