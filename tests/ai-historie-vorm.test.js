/*
 * De gesprekshistorie uit Airtable is niet de vorm die Anthropic eist.
 *
 * Op 2026-09-13 (19:44 en 21:23) weigerde Anthropic twee echte WhatsApp-
 * beurten met HTTP 400 op beide modellen. De lead was via het formulier
 * binnengekomen: de historie begon met een assistant-begroeting, gevolgd door
 * een handmatig template (ook assistant), en pas dan "Hey". Elke beurt droeg
 * bovendien ts/mid/manual/template mee. Anthropic wil role/content, een
 * gesprek dat met de gebruiker begint en geen lege beurten.
 */
'use strict';

process.env.ANTHROPIC_API_KEY = 'sk-ant-test-nooit-echt-000';
process.env.OPENAI_API_KEY = 'sk-test-nooit-echt-000';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const providers = require('../api/_ai/providers');
const { normaliseer } = providers;

(async () => {
  console.log('\n— normaliseer() —');
  const hist = [
    { role: 'assistant', content: 'Dag Sindi, we hebben uw aanvraag goed ontvangen.' },
    { role: 'assistant', content: 'Nieuwe lead via Helvaro.', manual: true, template: true, ts: 1 },
    { role: 'user', content: 'Hey', ts: 2, mid: 'wamid.x' },
    { role: 'user', content: '   ', ts: 3 },
  ];
  const uit = normaliseer(hist);
  ck('begint met een gebruikersbeurt', uit[0].role === 'user', JSON.stringify(uit[0]));
  ck('de begroeting blijft als context staan', uit[1].role === 'assistant' && /goed ontvangen/.test(uit[1].content));
  ck('twee assistant-beurten na elkaar zijn samengevoegd', /goed ontvangen[\s\S]*Nieuwe lead/.test(uit[1].content) && uit.length === 3, JSON.stringify(uit));
  ck('lege beurten vallen weg', uit[uit.length - 1].content === 'Hey');
  ck('alleen role en content blijven over', uit.every((m) => Object.keys(m).sort().join(',') === 'content,role'), JSON.stringify(uit));
  ck('een gewone historie blijft ongewijzigd',
    JSON.stringify(normaliseer([{ role: 'user', content: 'hoi' }, { role: 'assistant', content: 'dag' }])) ===
    JSON.stringify([{ role: 'user', content: 'hoi' }, { role: 'assistant', content: 'dag' }]));
  ck('lege invoer geeft een lege lijst', normaliseer(undefined).length === 0);

  console.log('\n— de Anthropic-adapter stuurt de genormaliseerde vorm —');
  let body = null;
  global.fetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: {} }) }; };
  await providers.ADAPTERS.anthropic.generateText({ model: 'claude-test', system: 's', messages: hist });
  ck('eerste beurt op de draad is van de gebruiker', body && body.messages[0].role === 'user', body && JSON.stringify(body.messages[0]));
  ck('geen ts/mid/manual/template op de draad', body && !/"ts"|"mid"|"manual"|"template"/.test(JSON.stringify(body.messages)));

  console.log('\n— en een 400 wordt met reden gelogd, zonder de prompt —');
  const oud = console.warn; const regels = [];
  console.warn = (...a) => regels.push(a.join(' '));
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { type: 'invalid_request_error', message: 'messages: first message must use the "user" role' } }) });
  let fout = null;
  try { await providers.ADAPTERS.anthropic.generateText({ model: 'claude-test', messages: [{ role: 'user', content: 'hoi' }] }); } catch (e) { fout = e; }
  console.warn = oud;
  ck('de fout blijft een ProviderError met HTTP 400', fout && /HTTP 400/.test(fout.message));
  ck('de reden staat in het log', regels.some((r) => /first message must use/.test(r)), regels.join(' | '));

  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
