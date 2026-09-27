'use strict';
/*
 * De Setup-pagina (2026-09-27): vijf onderdelen met hun echte status, en het
 * clientscript dat in elke taal echt parseert.
 *
 * Waarom dat laatste: het clientscript staat in een grote template literal in
 * api/dashboard.js. Een \' of \/ die daar niet verdubbeld is, verdwijnt stil
 * bij het renderen -- de server rendert dan gewoon, maar de browser weigert
 * het HELE script. Dat gebeurde bij het bouwen van deze pagina één keer; deze
 * test houdt het tegen.
 */
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`); ok ? pass++ : fail++; };

const dash = require(BASE + 'api/dashboard.js');
function render(url, query) {
  return new Promise((klaar) => {
    const res = { setHeader() {}, getHeader() {}, status() { return this; }, send(b) { klaar(String(b)); }, end(b) { klaar(String(b || '')); }, json() { klaar(''); } };
    dash({ method: 'GET', url, headers: { host: 't' }, query }, res);
  });
}

(async () => {
  console.log('\n— het clientscript parseert in elke taal —');
  for (const lang of ['nl', 'fr', 'en', 'de']) {
    const js = await render('/dashboard.js?asset=js&lang=' + lang, { asset: 'js', lang });
    let fout = '';
    try { new vm.Script(js, { filename: 'dashboard-client-' + lang + '.js' }); } catch (e) { fout = e.message; }
    ck(lang + ': geen syntaxfout', !fout && js.length > 100000, fout || js.length);
    if (lang === 'nl') {
      ck('setupTab, setupLaad en setupBronBewaar staan erin', /function setupTab\(/.test(js) && /async function setupLaad\(/.test(js) && /async function setupBronBewaar\(/.test(js));
      ck('de websitecode sluit het script correct af (<\\/script>)', js.includes('async><\\/script>') && !/async><\/script>'\)/.test(js));
      /* De adrescontrole in de browser moet het profiel van de opdracht aannemen. */
      const m = /if \(waarde === 'autoscout24' && !(\/\^https[^\n]*?\/i)\.test\(url\)\)/.exec(js);
      let re = null; try { re = m && eval(m[1]); } catch (e) { re = null; }
      ck('de browsercontrole neemt een AutoScout24-profiel aan', re && re.test('https://www.autoscout24.be/nl/verkopers/provan-motors?atype=C&_gl=1*x'), m && m[1]);
      ck('en weigert een ander domein', re && !re.test('https://evil.example/nl/verkopers/x'));
    }
  }

  console.log('\n— de pagina —');
  for (const lang of ['nl', 'en']) {
    const html = await render('/dashboard?lang=' + lang, { lang });
    const setup = (html.split('id="page-formulier"')[1] || '').split('id="page-instellingen"')[0];
    ck(lang + ': vijf tabs', ['su-tab-chatbot', 'su-tab-formulier', 'su-tab-voorraad', 'su-tab-agenda', 'su-tab-email'].every((id) => setup.includes('id="' + id + '"')));
    ck(lang + ': vijf panelen', ['su-p-chatbot', 'su-p-formulier', 'su-p-voorraad', 'su-p-agenda', 'su-p-email'].every((id) => setup.includes('id="' + id + '"')));
    for (const id of ['widget-instellingen', 'mail-instellingen', 'gcal-status-sub', 'fm-url']) {
      const n = html.split('id="' + id + '"').length - 1;
      ck(lang + ': #' + id + ' bestaat precies één keer, in Setup', n === 1 && setup.includes('id="' + id + '"'), n);
    }
    const inst = (html.split('id="page-instellingen"')[1] || '').split('</main>')[0];
    ck(lang + ': Instellingen wijst naar Setup', /navigateTo\('formulier'\)/.test(inst));
  }
  const en = await render('/dashboard?lang=en', { lang: 'en' });
  ck('het menu heet Setup', /data-page="formulier"[\s\S]{0,700}?Setup/.test(en));

  console.log('\n— het voorraadblok voor de website —');
  const vj = fs.readFileSync(BASE + 'public/voorraad.js', 'utf8');
  let fout = ''; try { new vm.Script(vj); } catch (e) { fout = e.message; }
  ck('public/voorraad.js parseert', !fout, fout);
  ck('geen innerHTML met data (alles via textContent)', !/\.innerHTML\s*=/.test(vj));
  ck('afbeeldingen alleen via https', /function veiligeUrl/.test(vj) && /\^https:\\\/\\\//.test(vj));
  ck('bladert door tot alles binnen is (limit 200)', /limit=200&offset=/.test(vj));
  const vercel = JSON.parse(fs.readFileSync(BASE + 'vercel.json', 'utf8'));
  ck('/voorraad.js is gerouteerd', (vercel.rewrites || vercel.routes || []).some((r) => r.source === '/voorraad.js' && /public\/voorraad\.js/.test(r.destination)));

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
