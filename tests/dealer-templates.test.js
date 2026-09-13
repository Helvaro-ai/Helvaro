/*
 * De rijke dealer-templates: alleen gebruikt als Meta ze goedgekeurd heeft.
 *
 * Twee templates die de auto kunnen dragen (verkopersmelding met voertuig,
 * prijs, type en score; herinnering met de auto). Ze bestaan pas na een
 * inzending bij Meta -- tot die tijd valt de code terug op de generieke, en
 * dat mag nooit stil misgaan: een template sturen die Meta niet kent geeft
 * 132001 en een melding die nergens aankomt.
 */
'use strict';

process.env.WHATSAPP_TOKEN = 'test-token-nooit-echt';
process.env.PHONE_NUMBER_ID = '100000000000000';
process.env.WABA_ID = '';                 // geen index: snapshot
delete process.env.WHATSAPP_MANAGEMENT_TOKEN;

const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tpl = require('../api/_wa-templates');
const melding = require('../api/_dealer-melding');

(async () => {
  console.log('\n— catalogus —');
  ck('dealerAfspraak bestaat, optioneel, zes parameters',
     tpl.VEREIST.dealerAfspraak && tpl.VEREIST.dealerAfspraak.optioneel === true && tpl.VEREIST.dealerAfspraak.params.length === 6);
  ck('dealerHerinnering bestaat, optioneel, drie parameters',
     tpl.VEREIST.dealerHerinnering && tpl.VEREIST.dealerHerinnering.optioneel === true && tpl.VEREIST.dealerHerinnering.params.length === 3);
  const klaar = await tpl.klaarVoor('nl');
  ck('de gereedheidscheck noemt de optionele templates NIET als gemis',
     !klaar.regels.some((r) => r.sleutel === 'dealerAfspraak' || r.sleutel === 'dealerHerinnering'), klaar.regels.map((r) => r.sleutel).join(','));
  ck('goedgekeurd() is nee zolang ze niet in de snapshot/index staan', (await tpl.goedgekeurd('dealerAfspraak', 'nl')) === false);
  ck('goedgekeurd() is ja voor een template die wél goedgekeurd is', (await tpl.goedgekeurd('notify', 'nl_BE')) === true);
  ck('onbekende sleutel is nee, geen crash', (await tpl.goedgekeurd('bestaat_niet', 'nl')) === false);

  console.log('\n— verzendpad: generiek zolang niet goedgekeurd —');
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    calls.push(body);
    if (body.type === 'text') {
      return { ok: false, status: 400, json: async () => ({ error: { code: 131047, type: 'OAuthException', message: 'Re-engagement message' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.test' }] }) };
  };
  const clientFields = { fldZEApe0gfse07AU: '+32470000000' };
  const uit = await melding.stuurAfspraakMelding({
    projectCode: 'DEMO', clientFields, phoneNumberId: '100000000000000', token: 'test-token-nooit-echt',
    lang: 'nl', tekst: 'hallo', terugval: { naam: 'Jan', telefoon: '+32471111111' },
    sjabloon: { naam: 'Jan', wanneer: 'morgen 10:30', voertuig: 'BMW 330e', prijs: '€ 29.500', type: 'proefrit', score: '91/100' },
  });
  const tplCall = calls.find((c) => c.type === 'template');
  ck('vrij bericht eerst, dan template', calls[0].type === 'text' && !!tplCall);
  ck('zonder goedkeuring gaat de GENERIEKE lead_alert uit', tplCall && tplCall.template.name === tpl.naamVoor('notify'), tplCall && tplCall.template.name);
  ck('met drie parameters (naam, telefoon, projectcode)', tplCall && tplCall.template.components[0].parameters.length === 3);
  ck('en de melding telt als verstuurd', uit.verstuurd === 1 && uit.mislukt === 0, JSON.stringify(uit));

  console.log('\n— verzendpad: rijk zodra goedgekeurd —');
  /* De index nabootsen: zelfde snapshotvorm, met de dealer-template erin. */
  const origHaal = tpl.haalIndex;
  tpl._leegCache();
  process.env.WABA_ID = '1000';
  process.env.WHATSAPP_MANAGEMENT_TOKEN = 'mgmt-nooit-echt';
  const metaFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('/message_templates')) {
      return { ok: true, status: 200, json: async () => ({ data: [
        { name: 'helvaro_dealer_afspraak', language: 'nl_BE', status: 'APPROVED', category: 'UTILITY' },
        { name: 'helvaro_lead_alert', language: 'nl_BE', status: 'APPROVED', category: 'UTILITY' },
      ] }) };
    }
    return metaFetch(url, opts);
  };
  ck('goedgekeurd() leest de dealer-template uit de index', (await tpl.goedgekeurd('dealerAfspraak', 'nl_BE')) === true);
  calls.length = 0;
  await melding.stuurAfspraakMelding({
    projectCode: 'DEMO', clientFields, phoneNumberId: '100000000000000', token: 'test-token-nooit-echt',
    lang: 'nl', tekst: 'hallo', terugval: { naam: 'Jan', telefoon: '+32471111111' },
    sjabloon: { naam: 'Jan', wanneer: 'morgen 10:30', voertuig: 'BMW 330e', prijs: '€ 29.500', type: 'proefrit', score: '91/100' },
  });
  const rijk = calls.find((c) => c.type === 'template');
  ck('nu gaat de dealer-template uit', rijk && rijk.template.name === 'helvaro_dealer_afspraak', rijk && rijk.template.name);
  const params = rijk ? rijk.template.components[0].parameters.map((p) => p.text) : [];
  ck('met zes parameters in de juiste volgorde', params.join('|') === 'Jan|morgen 10:30|BMW 330e|€ 29.500|proefrit|91/100', params.join('|'));
  calls.length = 0;
  await melding.stuurAfspraakMelding({
    projectCode: 'DEMO', clientFields, phoneNumberId: '100000000000000', token: 'test-token-nooit-echt',
    lang: 'nl', tekst: 'hallo', terugval: { naam: 'Jan', telefoon: '+32471111111' },
    sjabloon: { naam: 'Jan', wanneer: 'morgen 10:30', voertuig: '', prijs: null, type: undefined, score: '' },
  });
  const leeg = calls.find((c) => c.type === 'template');
  const p2 = leeg ? leeg.template.components[0].parameters.map((p) => p.text) : [];
  ck('ontbrekende waarden worden een streepje, nooit undefined/null', p2.every((x) => x && !/undefined|null|NaN/.test(x)) && p2.length === 6, p2.join('|'));
  ck('zonder sjabloon-object blijft het de generieke, ook al is de rijke goedgekeurd', await (async () => {
    calls.length = 0;
    await melding.stuurAfspraakMelding({ projectCode: 'DEMO', clientFields, phoneNumberId: '100000000000000', token: 'test-token-nooit-echt', lang: 'nl', tekst: 'hallo', terugval: { naam: 'Jan', telefoon: '+32471111111' } });
    const c = calls.find((x) => x.type === 'template');
    return c && c.template.name === tpl.naamVoor('notify');
  })());

  console.log('\n— de herinnering en het inzendscript —');
  const cron = strip(fs.readFileSync(path.join(__dirname, '..', 'api', 'cron-followup.js'), 'utf8'));
  ck('de herinnering kijkt eerst of dealerHerinnering goedgekeurd is', /goedgekeurd\('dealerHerinnering'/.test(cron));
  ck('en leest het voertuig van de afspraak', /appt\.fields\['Vehicle Code'\]/.test(cron));
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'create-wa-templates.js'), 'utf8');
  ck('het inzendscript kent beide dealer-templates', /helvaro_dealer_afspraak:\s*\{/.test(script) && /helvaro_dealer_herinnering:\s*\{/.test(script));
  ck('met voorbeeldwaarden in de vier talen', (script.match(/voertuig: 'BMW 330e'/g) || []).length === 4);
  const wa = strip(fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8'));
  const leads = strip(fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8'));
  ck('beide boekingspaden geven het sjabloon-object mee', /sjabloon:\s*\{/.test(wa) && /sjabloon:\s*\{/.test(leads));

  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
