'use strict';
/*
 * Het eerste bericht gaat alleen weg in een taal waarin Meta het goedkeurde
 * (2026-09-26).
 *
 * Het Engelstalige reviewersaccount vroeg de intro-template in het Engels,
 * terwijl die variant nog niet ingediend was. Meta weigert dat, en de knop
 * "Send a test message" en het leadformulier deden dan niets zichtbaars.
 * goedgekeurdeTaalVoor() kiest de gevraagde taal als die goedgekeurd is,
 * anders Nederlands, anders de eerste goedgekeurde.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const tpl = require(BASE + 'api/_wa-templates.js');
const INTRO = tpl.naamVoor('intro');

function metaGeeft(lijst) {
  tpl._leegCache();
  process.env.WABA_ID = 'waba-test';
  process.env.WHATSAPP_MANAGEMENT_TOKEN = 'token-test';
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: lijst }) });
}
const t = (language, status) => ({ name: INTRO, language, status, category: 'UTILITY' });

(async () => {
  console.log('\nde keuze');
  metaGeeft([t('nl_BE', 'APPROVED')]);
  ck('Engels gevraagd, alleen nl_BE goedgekeurd -> nl_BE', await tpl.goedgekeurdeTaalVoor('intro', 'en') === 'nl_BE');

  metaGeeft([t('nl_BE', 'APPROVED'), t('en', 'APPROVED')]);
  ck('Engels goedgekeurd -> Engels', await tpl.goedgekeurdeTaalVoor('intro', 'en') === 'en');

  metaGeeft([t('nl_BE', 'APPROVED'), t('en', 'PENDING')]);
  ck('Engels nog in behandeling telt niet -> nl_BE', await tpl.goedgekeurdeTaalVoor('intro', 'en') === 'nl_BE');

  metaGeeft([t('fr_BE', 'APPROVED')]);
  ck('geen Nederlands, wel Frans -> fr_BE', await tpl.goedgekeurdeTaalVoor('intro', 'de') === 'fr_BE');

  metaGeeft([t('en', 'REJECTED')]);
  ck('nergens goedgekeurd -> leeg (aanroeper houdt zijn keuze)', await tpl.goedgekeurdeTaalVoor('intro', 'en') === '');

  metaGeeft([t('nl_BE', 'APPROVED')]);
  ck('Nederlands gevraagd -> blijft nl_BE', await tpl.goedgekeurdeTaalVoor('intro', 'nl') === 'nl_BE');

  console.log('\nde twee verzenders gebruiken het');
  const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
  const form = fs.readFileSync(BASE + 'api/form.js', 'utf8');
  ck('"Send a test message" (api/leads.js)', /introLang = \(await _waTpl\.goedgekeurdeTaalVoor\('intro', introLang\)\) \|\| introLang/.test(leads));
  ck('het leadformulier (api/form.js)', /introLang = \(await require\('\.\/_wa-templates'\)\.goedgekeurdeTaalVoor\('intro', introLang\)\) \|\| introLang/.test(form));
  ck('en de aanhef volgt de gekozen taal (na de keuze berekend)',
    leads.indexOf("goedgekeurdeTaalVoor('intro', introLang)") < leads.indexOf("const aanhef = { nl: 'daar'"));

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
