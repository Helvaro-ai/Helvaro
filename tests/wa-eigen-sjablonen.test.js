/*
 * Een klant met een eigen WhatsApp-nummer (Embedded Signup) zendt vanaf zijn
 * eigen WABA. Helvaro's sjablonen stonden daar niet, dus elk bericht buiten
 * het 24u-venster faalde met Meta 132001. Dit controleert dat de set wordt
 * ingediend bij het koppelen en bij de eerste mislukte verzending, hooguit
 * in korte rondes die verdergaan waar de vorige stopte, en dat de gebruiker een
 * vertaalde uitleg krijgt.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const lees = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  console.log('\nSjablonen op het eigen nummer');
  const teksten = require('../api/_wa-template-teksten');
  const lock = require('../api/_lock');
  const echtDienIn = teksten.dienIn, echtEenmalig = lock.eenmalig;
  const aanroepen = [];
  teksten.dienIn = async (o) => { aanroepen.push(o); return { bestaand: 1, resultaten: [{ action: 'created' }, { action: 'created' }, { action: 'skipped' }] }; };
  let vrij = true;
  lock.eenmalig = async () => { const v = vrij; vrij = false; return v; };
  const mod = require('../api/_wa-eigen-templates');

  const r1 = await mod.zorgVoorSjablonen({ wabaId: '123456789', token: 'tok' });
  ck('eerste keer: ingediend met commit, op de WABA van de klant', aanroepen.length === 1 && aanroepen[0].commit === true && aanroepen[0].wabaId === '123456789', aanroepen);
  ck('telling klopt', r1.ingediend === 2 && r1.bestond === 1 && r1.mislukt === 0, r1);
  const r2 = await mod.zorgVoorSjablonen({ wabaId: '123456789', token: 'tok' });
  ck('tweede gelijktijdige ronde (vergrendeld): niets', aanroepen.length === 1 && r2.overgeslagen === true, r2);
  const r3 = await mod.zorgVoorSjablonen({ wabaId: 'geen-id', token: 'tok' });
  ck('ongeldig WABA-id: niets', r3.overgeslagen === true && aanroepen.length === 1, r3);
  teksten.dienIn = echtDienIn; lock.eenmalig = echtEenmalig;

  const leads = lees('api/leads.js');
  ck('koppelen dient de sjablonen meteen in', /_waToken\.onthoud\(nummerId, uit\.token\);[\s\S]{0,600}zorgVoorSjablonen\(\{ wabaId, token: uit\.token \}\)/.test(leads), null);
  ck('handmatig antwoord: ontbrekend sjabloon op eigen nummer -> indienen + templates_pending',
     /tplR\.code === 'template_not_found' && clientPnid[\s\S]{0,900}code: 'templates_pending'/.test(leads), null);

  const i18n = require('../api/_i18n.js');
  const i18n2 = i18n;
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const w = i18n.woordenboek(taal);
    ck(taal + ': uitleg voor templates_pending en template_not_found', !!w['wa.fout.templates_pending'] && !!w['wa.fout.template_not_found'], null);
  }
  ck('dashboard vertaalt per foutcode', /'wa\.fout\.' \+ \(d\.code \|\| ''\)/.test(lees('api/dashboard.js')), null);

  /* Rondes: binnen het budget indienen, de rest uitstellen (serverloze 60s-grens). */
  {
    const echteFetch = global.fetch; let gemaakt = 0;
    global.fetch = async (url, o = {}) => {
      if ((o.method || 'GET') === 'POST') { gemaakt++; await new Promise((r) => setTimeout(r, 30)); return { ok: true, json: async () => ({ id: 'x' + gemaakt, status: 'PENDING' }) }; }
      return { ok: true, json: async () => ({ data: [] }) };
    };
    const sleutelT = require.resolve('../api/_wa-template-teksten'); const oudeT = require.cache[sleutelT];
    delete require.cache[sleutelT];
    const echt = require('../api/_wa-template-teksten');
    const uit = await echt.dienIn({ wabaId: '123456789', token: 't', commit: true, budgetMs: 40 });
    const acties = uit.resultaten.map((r) => r.action);
    ck('binnen het budget: een paar aangemaakt', acties.filter((a) => a === 'created').length >= 1 && acties.filter((a) => a === 'created').length < acties.length, acties.length);
    ck('de rest wordt uitgesteld (niet mislukt)', acties.includes('deferred') && !acties.includes('failed'), acties);
    const zonder = await echt.dienIn({ wabaId: '123456789', token: 't', commit: true });
    ck('zonder budget gaat alles door', zonder.resultaten.every((r) => r.action === 'created'), zonder.resultaten.length);
    global.fetch = echteFetch; require.cache[sleutelT] = oudeT;
  }

  /* De instellingen lezen de WABA van de klant zelf en dienen proactief in. */
  {
    let lijstCalls = 0, ingediendNa = false;
    teksten.listTemplates = async () => { lijstCalls++; return lijstCalls === 1 ? [] : [{ name: 'followup_24h', language: 'nl_BE', status: 'PENDING' }]; };
    teksten.dienIn = async () => { ingediendNa = true; return { bestaand: 0, resultaten: [{ action: 'created' }, { action: 'created' }] }; };
    let vrij2 = true; lock.eenmalig = async () => { const v = vrij2; vrij2 = false; return v; };
    delete require.cache[require.resolve('../api/_wa-eigen-templates')];
    const mod2 = require('../api/_wa-eigen-templates');
    const st = await mod2.toestand({ wabaId: '123456789', token: 'tok', taal: 'nl_BE' });
    ck('eigen WABA leeg: er wordt ingediend', ingediendNa === true && st.ingediend === 2, st.ingediend);
    ck('en de toestand daarna komt van de eigen WABA (onderweg, niet klaar)', st.bron === 'eigen' && st.klaar === false && st.regels.some((r) => r.toestand === 'onderweg'), st.regels && st.regels.map((r) => r.toestand));
    teksten.listTemplates = async () => { throw new Error('list failed (HTTP 403): permission'); };
    const kapot = await mod2.toestand({ wabaId: '123456789', token: 'tok', taal: 'nl_BE' });
    ck('een onleesbare lijst: onbekend en nooit "klaar"', kapot.onbekend === true && kapot.klaar === false, kapot);
    teksten.dienIn = echtDienIn; lock.eenmalig = echtEenmalig;
    const l2 = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
    ck('wa-readiness gebruikt de eigen WABA bij een eigen nummer', /eigenStaat = await _waEigenTpl\.toestand/.test(l2) && /staat = eigenStaat;/.test(l2));
    const d2 = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
    ck('het scherm vraagt zelf de volgende ronde (hooguit tien)', /eigenToestand\.bezig && \(_waRondes \|\| 0\) < 10/.test(d2));
    ck('de instellingen tonen "zojuist ingediend" en "onbekend"', /set\.wa\.zojuistIngediend/.test(d2) && /set\.wa\.eigenOnbekend/.test(d2));
    for (const taal of ['nl', 'fr', 'en', 'de']) { const w = i18n2.woordenboek(taal); ck(taal + ': beide meldingen vertaald', !!w['set.wa.zojuistIngediend'] && !!w['set.wa.eigenOnbekend']); }
  }
  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
