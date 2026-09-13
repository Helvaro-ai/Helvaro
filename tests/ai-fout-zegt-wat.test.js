/*
 * Als een AI-provider omvalt, hoort het log te zeggen WELKE en WAAROM.
 *
 * Op 2026-09-13 om 17:44 liet de WhatsApp-AI een echte beurt vallen en het
 * log zei: "geen enkele provider gaf een bruikbaar antwoord". Meer niet. Twee
 * gaten: de router logde de throw-tak niet, en de adapter gooide een fout
 * zonder statuscode of fouttype. Allebei hier vastgelegd. En wat er NIET in
 * mag: de sleutel, en de boodschap van Anthropic (die kan de prompt bevatten).
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

const providers = require('../api/_ai/providers').ADAPTERS;

(async () => {
  console.log('\n— de adapter zegt status en type —');
  global.fetch = async () => ({ ok: false, status: 529, json: async () => ({ error: { type: 'overloaded_error', message: 'GEHEIME PROMPTINHOUD' } }) });
  let fout = null;
  try { await providers.anthropic.generateText({ model: 'claude-test', messages: [{ role: 'user', content: 'hoi' }] }); } catch (e) { fout = e; }
  ck('Anthropic-fout bevat de HTTP-status', fout && /HTTP 529/.test(fout.message), fout && fout.message);
  ck('en het fouttype', fout && /overloaded_error/.test(fout.message));
  ck('en het model', fout && /claude-test/.test(fout.message));
  ck('maar NIET de boodschap (die kan de prompt bevatten)', fout && !/GEHEIME/.test(fout.message));
  ck('en niet de sleutel', fout && !/sk-ant/.test(fout.message));
  ck('status staat ook als veld op de fout', fout && fout.status === 529);

  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided: sk-test' } }) });
  fout = null;
  try { await providers.openai.generateText({ model: 'gpt-test', messages: [{ role: 'user', content: 'hoi' }] }); } catch (e) { fout = e; }
  ck('OpenAI-fout bevat status en code', fout && /HTTP 401/.test(fout.message) && /invalid_api_key/.test(fout.message), fout && fout.message);
  ck('en ook daar niet de boodschap', fout && !/Incorrect API key/.test(fout.message));

  console.log('\n— de router logt elke omgevallen poging —');
  const fs = require('fs'); const path = require('path');
  const bron = fs.readFileSync(path.join(__dirname, '..', 'api', '_ai', 'router.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = bron.indexOf('} catch (err) {\n      laatsteFout = err;');
  const tak = bron.slice(i, i + 700);
  ck('de catch-tak in de keten logt provider, tier en reden', /console\.warn\(`\[ai\] \$\{task\} \$\{stap\.providerId\}\/\$\{stap\.tier\}/.test(tak), tak.slice(0, 200));
  ck('en gaat daarna door naar de volgende provider', /continue;/.test(tak));

  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
