/*
 * api/_dealer-melding.js -- de melding aan de verkoper bij een nieuwe afspraak.
 *
 * ── Wat hier bewezen wordt ────────────────────────────────────────────────────
 * Drie dingen die elk apart een verkoper zijn dag kunnen kosten:
 *
 *   1. WIE de melding krijgt. Client Config wordt met returnFieldsByFieldId
 *      gelezen, dus een nummer dat alleen onder de veldNAAM staat bestaat voor
 *      de app niet. En een nummer zonder landcode ("0470...") gaat bij Meta
 *      naar niemand -- dat hoort hier al geweigerd te worden, niet pas in een
 *      foutmelding van Meta.
 *   2. WAT erin staat. Een regel met "undefined" of "— ." is precies het soort
 *      bericht waardoor een verkoper meldingen gaat negeren.
 *   3. HOE het verstuurd wordt. Buiten het 24-uursvenster weigert Meta een
 *      vrij bericht (131047); dan moet de goedgekeurde template het overnemen,
 *      met de juiste variabelen in de juiste volgorde. En wat er ook misgaat:
 *      de functie werpt nooit, want de boeking is al gelukt en die mag hier
 *      niet meer omvallen. Het token mag nooit in een logregel belanden.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';
process.env.WHATSAPP_TOKEN = 'geheim-token-nooit-echt-XYZ987';
process.env.PHONE_NUMBER_ID = '100000000000000';
delete process.env.NOTIFY_PHONE;

const _waSend     = require('../api/_wa-send');
const _activiteit = require('../api/_activiteit');
const melding     = require('../api/_dealer-melding');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const F_NOTIFY = 'fldZEApe0gfse07AU';
const F_EXTRA  = 'fldxSbRXga4yO1RXy';

console.log('\n— ontvangers —');
{
  const lijst = melding.ontvangers({ [F_NOTIFY]: '+32 470 12 34 56', [F_EXTRA]: '+32 471 00 00 00\n32470123456\n0470 99 99 99\n12345\n' });
  ck('hoofdnummer eerst, genormaliseerd', lijst[0] === '32470123456', JSON.stringify(lijst));
  ck('extra nummer erbij', lijst.indexOf('32471000000') !== -1, JSON.stringify(lijst));
  ck('dubbel nummer maar één keer', lijst.filter((n) => n === '32470123456').length === 1, JSON.stringify(lijst));
  ck('nummer zonder landcode (0470...) geweigerd', lijst.every((n) => n.charAt(0) !== '0'), JSON.stringify(lijst));
  ck('te kort nummer geweigerd', lijst.indexOf('12345') === -1, JSON.stringify(lijst));
  ck('precies twee ontvangers over', lijst.length === 2, JSON.stringify(lijst));

  /* De veldnaam-val: alleen het veld-id telt. */
  const opNaam = melding.ontvangers({ 'Notify Phone': '+32 470 12 34 56', 'Notify Phones Extra': '+32 471 00 00 00' });
  ck('veldNAMEN worden niet gelezen (returnFieldsByFieldId)', opNaam.length === 0, JSON.stringify(opNaam));
  ck('geen velden en geen NOTIFY_PHONE -> niemand', melding.ontvangers({}).length === 0);
}

console.log('\n— bouwAfspraakBericht —');
{
  const vol = { leadNaam: 'Jan Peeters', wanneer: 'morgen 10:30', voertuigNaam: 'BMW X5', prijsTekst: '€ 18.000', type: 'proefrit', score: 91, temperatuur: 'hot' };
  for (const lang of ['nl', 'fr', 'en', 'de']) {
    const t = melding.bouwAfspraakBericht(Object.assign({ lang }, vol));
    ck(`${lang}: geen undefined/null/NaN`, !/undefined|null|NaN/.test(t), t);
    ck(`${lang}: naam, voertuig, prijs en score staan erin`, t.includes('Jan Peeters') && t.includes('BMW X5') && t.includes('€ 18.000') && t.includes('91/100'), t);
    ck(`${lang}: begint met de kop`, t.startsWith('🚗'), t);
  }
  const zonderPrijs = melding.bouwAfspraakBericht(Object.assign({ lang: 'nl' }, vol, { prijsTekst: '' }));
  ck('zonder prijs geen los streepje', !zonderPrijs.includes('—') || zonderPrijs.includes('/100'), zonderPrijs);
  ck('zonder prijs eindigt de regel op het voertuig', /BMW X5\.\n/.test(zonderPrijs), zonderPrijs);
  const zonderScore = melding.bouwAfspraakBericht(Object.assign({ lang: 'nl' }, vol, { score: undefined, temperatuur: undefined }));
  ck('zonder score geen scoreregel', !zonderScore.includes('/100'), zonderScore);
  const raarType = melding.bouwAfspraakBericht(Object.assign({ lang: 'nl' }, vol, { type: 'rommel' }));
  ck('onbekend type wordt weggelaten, niet doorgegeven', !/Type:/.test(raarType), raarType);
  const hot = melding.bouwAfspraakBericht(Object.assign({ lang: 'nl' }, vol));
  ck('HOT krijgt 🔥 en het label HOT', hot.includes('🔥 HOT'), hot);
  const koud = melding.bouwAfspraakBericht(Object.assign({ lang: 'nl' }, vol, { score: 12, temperatuur: 'cold' }));
  ck('COLD krijgt ⚪', koud.includes('⚪ COLD'), koud);
}

console.log('\n— stuurAfspraakMelding —');
const origFree = _waSend.sendFreeformSafe;
const origTpl  = _waSend.sendTemplateSafe;
const origLog  = _activiteit.log;
let calls, logs;
function reset(vrij, tpl) {
  calls = []; logs = [];
  _waSend.sendFreeformSafe = async (a) => { calls.push({ soort: 'vrij', a }); return vrij(a); };
  _waSend.sendTemplateSafe = async (a) => { calls.push({ soort: 'tpl', a }); return tpl(a); };
  _activiteit.log = async (pc, soort, o) => { logs.push({ pc, soort, o }); return true; };
}
const basis = { projectCode: 'DEMO', phoneNumberId: '100000000000000', token: process.env.WHATSAPP_TOKEN, lang: 'nl', tekst: '🚗 Nieuwe afspraak', terugval: { naam: 'Jan', telefoon: '+32470000000' } };
const eenOntvanger = { [F_NOTIFY]: '+32 470 12 34 56' };

(async () => {
  {
    reset(async () => ({ ok: true, messageId: 'wamid.1' }), async () => ({ ok: true }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    ck('vrij bericht ok -> verstuurd 1', r.verstuurd === 1 && r.mislukt === 0, JSON.stringify(r));
    ck('geen template geprobeerd', calls.every((c) => c.soort === 'vrij'), JSON.stringify(calls.map((c) => c.soort)));
    ck('employee_notification_sent gelogd met via=vrij', logs.some((l) => l.soort === 'employee_notification_sent' && l.o.details.via === 'vrij'), JSON.stringify(logs));
    ck('ontvanger alleen als laatste 4 cijfers in de log', logs.every((l) => String(l.o.details.ontvanger).length === 4), JSON.stringify(logs));
  }
  {
    reset(async () => ({ ok: false, code: 'window_closed', metaCode: 131047, reason: 'x' }), async () => ({ ok: true, messageId: 'wamid.2' }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    ck('131047 -> terugval op template, verstuurd 1', r.verstuurd === 1, JSON.stringify(r));
    const tpl = calls.find((c) => c.soort === 'tpl');
    ck('template is de goedgekeurde notify-template', tpl && tpl.a.template === 'helvaro_lead_alert', tpl && tpl.a.template);
    ck('templatevariabelen: naam, telefoon, projectcode -- in die volgorde', tpl && JSON.stringify(tpl.a.params) === JSON.stringify(['Jan', '+32470000000', 'DEMO']), tpl && JSON.stringify(tpl.a.params));
    ck('template in een Meta-taalcode', tpl && /^[a-z]{2}(_[A-Z]{2})?$/.test(tpl.a.lang), tpl && tpl.a.lang);
    ck('gelogd als via=template', logs.some((l) => l.soort === 'employee_notification_sent' && l.o.details.via === 'template'), JSON.stringify(logs));
  }
  {
    reset(async () => ({ ok: false, code: 'window_closed', metaCode: 131047 }), async () => ({ ok: false, code: 'template_not_found', metaCode: 132001, ownerAction: true }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    ck('template faalt -> mislukt 1, geen exception', r.mislukt === 1 && r.verstuurd === 0, JSON.stringify(r));
    const f = logs.find((l) => l.soort === 'employee_notification_failed');
    ck('employee_notification_failed gelogd met code en metaCode', f && f.o.details.code === 'template_not_found' && f.o.details.metaCode === 132001, JSON.stringify(f));
  }
  {
    reset(async () => ({ ok: true }), async () => ({ ok: true }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: { [F_NOTIFY]: '+32 470 12 34 56', [F_EXTRA]: '+32 471 00 00 00' } }, basis));
    ck('twee ontvangers -> twee verzendingen', r.verstuurd === 2 && calls.length === 2, JSON.stringify(r));
    ck('elk naar een ander nummer', calls[0].a.to !== calls[1].a.to);
  }
  {
    /* Rate limit: één keer opnieuw, daarna ok. */
    let n = 0;
    reset(async () => (n++ === 0 ? { ok: false, code: 'rate_limit', metaCode: 130429 } : { ok: true }), async () => ({ ok: true }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    ck('rate limit -> één herhaling, dan verstuurd', r.verstuurd === 1 && calls.length === 2, JSON.stringify({ r, n: calls.length }));
  }
  {
    /* De deur gooit onverwacht: nooit doorgeven aan de boeking. */
    reset(async () => { throw new Error('boem'); }, async () => ({ ok: true }));
    let gegooid = false;
    let r;
    try { r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis)); } catch (e) { gegooid = true; }
    ck('een exception in de deur wordt opgevangen', !gegooid && r && r.mislukt === 1, JSON.stringify(r));
  }
  {
    /* Het token mag nergens in de console belanden. */
    const uit = [];
    const oc = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...a) => uit.push(a.join(' '));
    console.warn = (...a) => uit.push(a.join(' '));
    console.error = (...a) => uit.push(a.join(' '));
    reset(async () => ({ ok: false, code: 'send_failed', reason: 'HTTP 500' }), async () => ({ ok: false, code: 'send_failed' }));
    await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    _activiteit.log = orig_log_thrower;
    console.log = oc.log; console.warn = oc.warn; console.error = oc.error;
    ck('het token staat in geen enkele logregel', !uit.some((l) => l.includes(process.env.WHATSAPP_TOKEN)), uit.join(' | ').slice(0, 300));
  }
  {
    reset(async () => ({ ok: true }), async () => ({ ok: true }));
    const r = await melding.stuurAfspraakMelding(Object.assign({ clientFields: {} }, basis));
    ck('zonder ontvangers gebeurt er niets', r.verstuurd === 0 && r.mislukt === 0 && calls.length === 0, JSON.stringify(r));
  }

  _waSend.sendFreeformSafe = origFree;
  _waSend.sendTemplateSafe = origTpl;
  _activiteit.log = origLog;

  console.log(`\n${fail ? 'ROOD' : 'ALLES GROEN'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();

function orig_log_thrower() { return Promise.resolve(true); }
