/*
 * Het creditgrootboek.
 *
 * Credits waren een TELLER: "Credits Used = 1240". Dat werkt tot iemand vraagt
 * waar die 1240 vandaan komen -- en dan is er geen antwoord, want er stond
 * niets bewaard. Vanaf nu is elke beweging een regel.
 *
 * Waar deze test op let, in volgorde van hoeveel het kost als het misgaat:
 *   1. Tenant. Een klant mag de boekingen van een ander nooit zien.
 *   2. Het TEKEN. Een verbruik dat positief geboekt wordt geeft gratis
 *      credits weg, en dat merk je pas bij de jaarrekening.
 *   3. Idempotentie. Tweemaal dezelfde referentie is één boeking -- dat is
 *      wat een herhaalde aanroep na een time-out onschadelijk maakt.
 *   4. Dat een terugbetaling niet dubbel geboekt wordt.
 */
const fs = require('fs');
const path = require('path');
const ledger = require('../api/_ledger');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 300));
  cond ? pass++ : fail++;
}

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test-base';

/* Een nagemaakte Airtable die de echte queries beantwoordt -- inclusief de
   filterformule, want daar zit de tenant-isolatie in. */
function nepAirtable(records, opties = {}) {
  const geschreven = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (opties.status && opties.status !== 200) {
      return { ok: false, status: opties.status, text: async () => '', json: async () => ({}) };
    }
    if (init && init.method === 'POST') {
      const velden = JSON.parse(init.body).fields;
      const rec = { id: 'rec' + records.length, fields: velden };
      records.push(rec); geschreven.push(velden);
      return { ok: true, status: 200, json: async () => rec };
    }
    const m = /filterByFormula=([^&]*)/.exec(u);
    const formule = m ? decodeURIComponent(m[1]) : '';
    const tenant = (/\{Project Code\}="([^"]*)"/.exec(formule) || [])[1];
    const ref    = (/\{Reference\}="([^"]*)"/.exec(formule) || [])[1];
    let uit = records;
    if (tenant) uit = uit.filter((r) => r.fields['Project Code'] === tenant);
    if (ref)    uit = uit.filter((r) => r.fields['Reference'] === ref);
    return { ok: true, status: 200, json: async () => ({ records: uit }) };
  };
  return geschreven;
}

(async () => {
  console.log('\n— zonder projectcode wordt er niets geboekt —');
  ledger._resetAvailability(); nepAirtable([]);
  ck('record() weigert', (await ledger.record({ type: ledger.TYPE.VERBRUIK, credits: 10 })) === null);
  let wierp = false;
  try { await ledger.list(''); } catch (e) { wierp = e.code === 'no_tenant'; }
  ck('list() werpt no_tenant', wierp);

  console.log('\n— een klant ziet alleen zijn eigen boekingen —');
  ledger._resetAvailability();
  nepAirtable([
    { id: 'a', fields: { 'Project Code': 'TELJO',  Type: 'usage', Credits: -20, 'Created At': '2026-08-20T10:00:00Z' } },
    { id: 'b', fields: { 'Project Code': 'ANDERE', Type: 'usage', Credits: -99, 'Created At': '2026-08-20T11:00:00Z' } },
    { id: 'c', fields: { 'Project Code': 'TELJO',  Type: 'usage', Credits: -3,  'Created At': '2026-08-20T12:00:00Z' } },
  ]);
  const mijn = await ledger.list('TELJO');
  ck('twee regels, allebei van TELJO', mijn.length === 2 && mijn.every((t) => t.projectCode === 'TELJO'),
     mijn.map((t) => t.projectCode));
  ck('de -99 van de ander zit er niet bij', !mijn.some((t) => t.credits === -99));

  console.log('\n— het teken hoort bij de soort, niet bij de aanroeper —');
  ledger._resetAvailability();
  let geschreven = nepAirtable([]);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 20, feature: 'faro_chat' });
  ck('verbruik wordt negatief geboekt', geschreven[0].Credits === -20, geschreven[0].Credits);
  /* Ook als de aanroeper per ongeluk een negatief getal meegeeft: dan zou een
     dubbel minteken van een afschrijving een bijstorting maken. */
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: -20 });
  ck('een meegegeven minteken maakt er geen bijstorting van', geschreven[1].Credits === -20, geschreven[1].Credits);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.TOEWIJZING, credits: 2000 });
  ck('toewijzing is positief', geschreven[2].Credits === 2000, geschreven[2].Credits);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.TERUGBETALING, credits: 50 });
  ck('terugbetaling is positief', geschreven[3].Credits === 50, geschreven[3].Credits);

  console.log('\n— dezelfde referentie is één boeking —');
  ledger._resetAvailability();
  const rijen = [];
  geschreven = nepAirtable(rijen);
  const een = await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 50,
                                    feature: 'image_generation', reference: 'beeld-abc123' });
  const twee = await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 50,
                                     feature: 'image_generation', reference: 'beeld-abc123' });
  ck('er staat maar één regel in het grootboek', geschreven.length === 1, geschreven.length);
  ck('en de tweede aanroep geeft de bestaande terug', !!twee && twee.referentie === 'beeld-abc123');
  ck('de eerste is ook echt geboekt', !!een && een.credits === -50);
  /* Een referentie van een ANDERE klant mag niet als duplicaat gelden. */
  await ledger.record({ projectCode: 'ANDERE', type: ledger.TYPE.VERBRUIK, credits: 50, reference: 'beeld-abc123' });
  ck('dezelfde referentie bij een andere klant is een nieuwe boeking', geschreven.length === 2, geschreven.length);

  console.log('\n— onzin wordt niet geboekt —');
  ledger._resetAvailability(); geschreven = nepAirtable([]);
  ck('onbekend type', (await ledger.record({ projectCode: 'T', type: 'gratis', credits: 10 })) === null);
  ck('nul credits', (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 0 })) === null);
  ck('niet-getal', (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 'veel' })) === null);
  ck('er is niets weggeschreven', geschreven.length === 0, geschreven.length);

  console.log('\n— een terugbetaling zonder reden wordt geweigerd —');
  /* Een terugbetaling zonder uitleg is niet na te vertellen als een klant
     ernaar vraagt, en dat is precies wanneer je hem nodig hebt. */
  ledger._resetAvailability(); geschreven = nepAirtable([]);
  ck('zonder reden geen boeking', (await ledger.refund({ projectCode: 'T', credits: 50, reason: '  ' })) === null);
  const terug = await ledger.refund({ projectCode: 'T', credits: 50, reason: 'Beeld kon niet opgeslagen worden' });
  ck('met reden wel', !!terug && terug.credits === 50);
  ck('de reden staat in de regel', geschreven[0].Note.indexOf('niet opgeslagen') !== -1, geschreven[0].Note);

  console.log('\n— optellen —');
  ledger._resetAvailability();
  nepAirtable([
    { id: '1', fields: { 'Project Code': 'T', Type: 'allocation', Credits: 2000, 'Created At': '2026-08-01T00:00:00Z' } },
    { id: '2', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -20, Feature: 'whatsapp_conversation', 'Created At': '2026-08-05T00:00:00Z' } },
    { id: '3', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -50, Feature: 'image_generation',      'Created At': '2026-08-06T00:00:00Z' } },
    { id: '4', fields: { 'Project Code': 'T', Type: 'refund',     Credits: 50,  Feature: 'image_generation',      'Created At': '2026-08-06T00:00:00Z' } },
    { id: '5', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -20, Feature: 'whatsapp_conversation', 'Created At': '2026-08-07T00:00:00Z' } },
  ]);
  const t = await ledger.totals('T');
  ck('toegewezen', t.toegewezen === 2000, t.toegewezen);
  ck('verbruikt telt absoluut', t.verbruikt === 90, t.verbruikt);
  ck('terugbetaald', t.terugbetaald === 50, t.terugbetaald);
  ck('saldo klopt met de som', t.saldo === 2000 - 90 + 50, t.saldo);
  ck('per onderdeel: whatsapp 40', t.perFeature.whatsapp_conversation === 40, t.perFeature);
  ck('per onderdeel: beeld 50 (de terugbetaling telt niet als verbruik)',
     t.perFeature.image_generation === 50, t.perFeature);

  console.log('\n— de tabel bestaat nog niet —');
  ledger._resetAvailability(); nepAirtable([], { status: 404 });
  ck('available() is onwaar', (await ledger.available()) === false);
  ck('boeken doet niets in plaats van te ontploffen',
     (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 10 })) === null);
  ck('lijst is leeg', (await ledger.list('T')).length === 0);

  console.log('\n— de aansluiting op de creditstroom —');
  const lees = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const cred = lees('api/_credits.js');
  ck('recordUsage boekt in het grootboek', cred.indexOf("_ledger.TYPE.VERBRUIK") !== -1);
  /* Pas NA een geslaagde PATCH: een regel voor een afschrijving die niet
     doorging maakt de geschiedenis onbetrouwbaar. */
  const iClear = cred.indexOf('clearUnrecorded(code);');
  const iBoek  = cred.indexOf("_ledger.TYPE.VERBRUIK");
  ck('en pas na de geslaagde afschrijving', iClear !== -1 && iBoek > iClear, { iClear, iBoek });
  ck('er is een terugbetaalfunctie', cred.indexOf('async function refundCredits') !== -1);
  ck('terugbetalen eist een reden', /terugbetaling zonder reden geweigerd/.test(cred));
  /* Zonder skip-ledger boekt addCredits ook een correctie, en dan staan er
     twee regels voor één terugbetaling. */
  ck('een terugbetaling levert maar één grootboekregel op',
     cred.indexOf("opts.type === 'skip-ledger'") !== -1);
  ck('refundCredits is geëxporteerd', /module\.exports = \{\s*\n\s*refundCredits/.test(cred));

  const leads = lees('api/leads.js');
  ck('leads.js kent billing-overview', leads.indexOf("body.mode === 'billing-overview'") !== -1);
  const iMode = leads.indexOf("body.mode === 'billing-overview'");
  ck('en controleert de client context',
     leads.slice(iMode, iMode + 220).indexOf('if (!projectCode)') !== -1);

  const dash = lees('api/dashboard.js');
  ck('het dashboard heeft een facturatiepagina', dash.indexOf('id="page-facturatie"') !== -1);
  ck('en een navigatieknop', dash.indexOf('data-page="facturatie"') !== -1);
  ck('en laadt hem bij navigeren', dash.indexOf("if (page === 'facturatie')") !== -1);
  /* Geen verzonnen verdeling als het grootboek er niet is. */
  ck('zonder grootboek zegt de pagina dat, in plaats van een verdeling te tonen',
     dash.indexOf('De geschiedenis staat nog niet aan') !== -1);

  console.log('\n— credits bijkopen: de prijs staat op de server —');
  /* De offerte wordt op de SERVER berekend. Zou de browser dat doen, dan is het
     getal dat een klant ziet ook het getal dat hij kan aanpassen. */
  const c = require('../api/_credits');
  const o100 = c.topupOfferte(100);
  ck('100 euro geeft credits', o100.geldig && o100.credits > 0, o100.credits);
  ck('en vertaalt naar leadgesprekken', o100.gesprekken === Math.floor(o100.credits / 20), o100);
  ck('onder het minimum wordt geweigerd', c.topupOfferte(5).reden === 'te_laag');
  ck('boven het maximum ook', c.topupOfferte(999999).reden === 'te_hoog');
  ck('onzin geeft geen credits', c.topupOfferte('veel').credits === 0);
  ck('een negatief bedrag geeft geen credits', c.topupOfferte(-500).credits === 0);
  /* Meer kopen mag nooit MINDER credits opleveren. */
  const oplopend = [25, 100, 200, 500, 1000, 2000].map((n) => c.topupOfferte(n).credits);
  ck('meer betalen geeft nooit minder credits',
     oplopend.every((n, i) => i === 0 || n > oplopend[i - 1]), oplopend);
  /* En de prijs per credit mag nooit stijgen bij een hoger bedrag. */
  const perCredit = [25, 200, 500, 1000].map((n) => c.topupOfferte(n).perCredit);
  ck('de prijs per credit daalt of blijft gelijk',
     perCredit.every((n, i) => i === 0 || n <= perCredit[i - 1]), perCredit);
  /* Hier stond: bij EUR 500 hoort 10% bonus. Die staffel is bewust weg.
     Doorgerekend gaf hij voor EUR 249,99 aan bijgekochte credits er 3.151,
     terwijl Starter voor datzelfde bedrag 3.000 geeft -- bijkopen was dus
     voordeliger dan een abonnement, en dan is je abonnement een instapfee.
     Volumekorting hoort in de PLANNEN te zitten (0,083 / 0,050 / 0,040 per
     credit) en niet in het bijkopen. */
  ck('geen volumebonus meer op bijkopen', c.topupOfferte(500).bonusPct === 0, c.topupOfferte(500).bonusPct);
  ck('en de prijs per credit is overal gelijk aan Starter',
     [25, 200, 500, 1000].every((n) => Math.abs(c.topupOfferte(n).perCredit - c.TOPUP_RATE_EUR) < 0.0005),
     [25, 200, 500, 1000].map((n) => c.topupOfferte(n).perCredit));
  /* In plaats daarvan wijst het scherm op een groter plan zodra dat meer geeft. */
  ck('bij EUR 500 wordt Growth aangeraden',
     (c.topupOfferte(500).beterPlan || {}).id === 'growth', c.topupOfferte(500).beterPlan);
  ck('bij een klein bedrag geen verkooppraatje',
     c.topupOfferte(25).beterPlan === null, c.topupOfferte(25).beterPlan);
  ck('bonuscredits tellen op tot het totaal',
     [100, 500, 1000].every((n) => { const q = c.topupOfferte(n);
       return q.basisCredits + q.bonusCredits === q.credits; }));
  /* Het tarief hoort instelbaar te zijn, niet verspreid door de code. */
  const credSrc = lees('api/_credits.js');
  ck('het tarief komt uit de omgeving', credSrc.indexOf('CREDIT_TOPUP_RATE_EUR') !== -1);

  console.log('\n— een aanvraag boekt GEEN credits bij —');
  /* Een saldo dat omhoog gaat voordat er betaald is, is een verzonnen saldo. */
  const iAanvraag = leads.indexOf("body.mode === 'credit-purchase-request'");
  ck('de mode bestaat', iAanvraag !== -1);
  const aanvraagBlok = leads.slice(iAanvraag, iAanvraag + 2600);
  ck('client context wordt gecontroleerd', aanvraagBlok.indexOf('if (!projectCode)') !== -1);
  ck('de offerte wordt op de server HERberekend',
     aanvraagBlok.indexOf('credits.topupOfferte(body.amountEur)') !== -1);
  /* Zoek naar een AANROEP, niet naar de tekst. In de mail aan Helvaro staat
     addCredits(...) als instructie voor de eigenaar -- dat is uitleg, geen code
     die draait. */
  ck('er worden geen credits bijgeboekt',
     !/await\s+credits\.addCredits\(/.test(aanvraagBlok), 'aanroep gevonden');
  ck('en geen grootboekregel geschreven', aanvraagBlok.indexOf('_ledger.record') === -1);
  ck('zonder ontvanger komt er een eerlijke fout in plaats van een bedankje',
     aanvraagBlok.indexOf('kan nergens heen') !== -1);

  const dashSrc = lees('api/dashboard.js');
  ck('het koopvenster bestaat', dashSrc.indexOf('id="koop-modal"') !== -1);
  ck('met een vrij in te vullen bedrag', dashSrc.indexOf('id="koop-bedrag"') !== -1);
  /* De snelkeuzes stonden hier als KOOP_PRESETS in de frontend. Ze staan nu in
     api/_credits.js, bij de rest van de bedragen: een browser die zelf weet
     welke bedragen bestaan is een browser waarin iemand er een verzint. */
  ck('en snelkeuzes', dashSrc.indexOf('id="koop-tegels"') !== -1);
  ck('die van de server komen, niet uit de frontend',
     /koopState\.presets = d\.presets/.test(dashSrc) && dashSrc.indexOf('KOOP_PRESETS') === -1);
  /* De browser mag de prijs niet zelf uitrekenen. */
  ck('de browser rekent de prijs niet zelf uit',
     dashSrc.indexOf("mode: 'credit-quote'") !== -1
     && !/koopState\.bedrag\s*\/\s*[0-9.]+/.test(dashSrc));

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
