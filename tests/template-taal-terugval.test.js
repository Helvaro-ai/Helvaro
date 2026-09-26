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
  ck('"Send a test message" (api/leads.js)', /introLang = \(await _waTpl\.goedgekeurdeTaalVoor\('intro', process\.env\.INTRO_TEMPLATE_LANG \|\| klantTaal\)\) \|\| introLang/.test(leads));
  ck('het leadformulier (api/form.js)', /introLang = \(await require\('\.\/_wa-templates'\)\.goedgekeurdeTaalVoor\('intro', process\.env\.INTRO_TEMPLATE_LANG \|\| lang\)\) \|\| introLang/.test(form));
  const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
  ck('de 24u-opvolging (api/cron-followup.js)', /TEMPLATE_LANG = \(await require\('\.\/_wa-templates'\)\.goedgekeurdeTaalVoor\('followup', process\.env\.FOLLOWUP_TEMPLATE_LANG \|\| 'nl'\)\) \|\| TEMPLATE_LANG/.test(cron));
  ck('en ze vragen de taal van de KLANT, niet de al-teruggevallen code', !/goedgekeurdeTaalVoor\('intro', introLang\)/.test(leads + form));

  console.log('\nde snapshot (koude lambda)');
  tpl._leegCache(); process.env.WABA_ID = ''; delete process.env.WHATSAPP_MANAGEMENT_TOKEN;
  ck('Engels is goedgekeurd in de snapshot: een Engelse klant krijgt Engels', await tpl.goedgekeurdeTaalVoor('intro', 'en') === 'en_GB');
  ck('Frans nog niet (in behandeling): terugval op nl_BE', await tpl.goedgekeurdeTaalVoor('intro', 'fr') === 'nl_BE');
  const vier = [];
  for (const t of ['fr_BE', 'de', 'en_GB', 'nl_BE']) vier.push(await tpl.goedgekeurd('booking', t));
  ck('de afspraakbevestiging is wel al in vier talen goedgekeurd', vier.every(Boolean), vier);

  ck('en de aanhef volgt de gekozen taal (na de keuze berekend)',
    leads.indexOf("goedgekeurdeTaalVoor('intro', process.env.INTRO_TEMPLATE_LANG || klantTaal)") > -1
    && leads.indexOf("goedgekeurdeTaalVoor('intro', process.env.INTRO_TEMPLATE_LANG || klantTaal)") < leads.indexOf("const aanhef = { nl: 'daar'"));

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
