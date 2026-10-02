/* Saldo op bij de AI-provider: de eigenaar krijgt een mail, hoogstens één keer per uur (api/_ai-alarm.js). */
'use strict';
const fs = require('fs'); const path = require('path');
const alarm = require('../api/_ai-alarm.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`); ok ? pass++ : fail++; };
(async () => {
  console.log('\nHerkennen');
  ck('de echte melding van Anthropic', alarm.isBetaalfout('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'));
  ck('OpenAI: insufficient_quota', alarm.isBetaalfout('You exceeded your current quota, please check your plan and billing details.'));
  ck('HTTP 402', alarm.isBetaalfout('', 402));
  ck('een gewone 400 is geen saldoprobleem', !alarm.isBetaalfout('messages.0.role: first message must use the "user" role'));
  ck('een overbelasting is dat ook niet', !alarm.isBetaalfout('Overloaded'));

  console.log('\nVersturen');
  delete process.env.UPSTASH_REDIS_REST_URL;
  const mails = [];
  const stuur = async (m) => { mails.push(m); return { ok: true }; };
  const nu = Date.UTC(2026, 9, 2, 12);
  ck('de eerste keer gaat er een mail', (await alarm.meldBetaalfout('Faro', 'Your credit balance is too low', { nu, stuur })) === true && mails.length === 1);
  ck('met link naar de facturatie en wat er stilvalt', /console\.anthropic\.com\/settings\/billing/.test(mails[0].html) && /geen antwoord/.test(mails[0].html) && /KRITIEK/.test(mails[0].subject));
  ck('binnen het uur geen tweede mail', (await alarm.meldBetaalfout('Faro', 'Your credit balance is too low', { nu: nu + 30 * 60000, stuur })) === false && mails.length === 1);
  ck('na een uur wel weer', (await alarm.meldBetaalfout('Faro', 'Your credit balance is too low', { nu: nu + 61 * 60000, stuur })) === true && mails.length === 2);
  alarm._reset();
  ck('een andere fout stuurt niets', (await alarm.meldBetaalfout('Faro', 'Overloaded', { nu: nu + 9e9, stuur })) === false && mails.length === 2);
  ck('een kapotte mailer laat niets ontsporen', (await alarm.meldBetaalfout('Faro', 'credit balance', { nu: nu + 99e9, stuur: async () => { throw new Error('smtp plat'); } })) === false);

  console.log('\nAangesloten');
  const bron = (f) => fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
  ck('de WhatsApp-AI-adapter meldt het', /_ai-alarm'\)\.meldBetaalfout/.test(bron('_ai/providers/index.js')));
  ck('Faro meldt het en biedt geen nutteloze Retry', /isBetaalfout\(detail, res\.status\)/.test(bron('_faro/providers/claude.js')) && /code: 'provider_unconfigured'/.test(bron('_faro/providers/claude.js')));
  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
