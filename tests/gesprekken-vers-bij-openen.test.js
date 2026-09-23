/*
 * Twee dingen die de Meta-screencast van 2026-09-20 aan het licht bracht.
 *
 * 1. Gesprekken opende met oud nieuws: de lijst tekent uit state.leads, en die
 *    werd alleen bij het inloggen en daarna elke tien minuten opgehaald. Een
 *    lead die net antwoordde stond er dus niet, tot een harde herlaad.
 *    Nu haalt de pagina eerst op als de laatste ronde ouder is dan 30 s.
 *
 * 2. Het eerste WhatsApp-bericht na het formulier wachtte 45 s. Nu 5 s,
 *    instelbaar via INTRO_VERTRAGING_MS en nooit meer dan 45 s.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nGesprekken opent met verse data');
{
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('versBijOpenen bestaat met een drempel van 30 s', /var VERS_BIJ_OPENEN_MS = 30 \* 1000;/.test(html));
  ck('gesprekken roept hem aan en tekent daarna opnieuw', html.includes("if (page === 'gesprekken') { gesprekkenOpnieuw(); versBijOpenen(gesprekkenOpnieuw); loadExterneGesprekken(false); }"));
  ck('pipeline idem', html.includes("if (page === 'pipeline')   { renderPipeline();   versBijOpenen(renderPipeline); }"));
  ck('het geopende gesprek blijft open na hertekenen', html.includes("if (id) openConversation(id);"));
  ck('de tijdstempel wordt gezet waar echt opgehaald wordt', html.includes('const data = await fetchLeads(vers);\n      _laatstVerversMs = Date.now();'));
  ck('niet dubbel ophalen zolang er een ronde loopt', html.includes('if (!state.apiKey || _versBijOpenenBezig) return;'));
}

console.log('\nLive ophalen gaat langs de browsercache');
{
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('fetchLeads(vers) zet cache: no-store', html.includes("cache: vers ? 'no-store' : 'default',"));
  ck('de live-tik haalt vers', html.includes('try { await refreshData(false, true); } catch (e) {} finally { _versBijOpenenBezig = false; }'));
  ck('openen van Gesprekken/Pipeline haalt vers', html.includes('return refreshData(false, true); })'));
  ck('de knop Verversen haalt vers', html.includes("addEventListener('click', function () { refreshData(false, true); });"));
  ck('de gewone tienminutenronde blijft cachen', html.includes('  _laatstVerversMs = Date.now();\n  refreshData();\n}'));
}

console.log('\nEen open gesprek kijkt live mee');
{
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('tikt elke 6 s', /var GESPREK_LIVE_MS = 6 \* 1000;/.test(html));
  ck('terug op het tabblad: meteen een tik', html.includes("if (state.currentPage === 'gesprekken' && typeof gesprekLiveTick === 'function') gesprekLiveTick().catch(function () {});"));
  ck('alleen op Gesprekken, ook als het tabblad verborgen is', html.includes("if (!state.apiKey || state.currentPage !== 'gesprekken') return;") && !/async function gesprekLiveTick\(\) \{[^}]*visibilityState === 'hidden'\) return;/.test(html));
  ck('alleen als er een gesprek leeft (15 min)', /var GESPREK_LEEFT_MS = 15 \* 60 \* 1000;/.test(html) && html.includes('return nu - gesprekLaatsteMs(l) < GESPREK_LEEFT_MS; });'));
  ck('een lead zonder ts telt zijn aanmaakdatum', html.includes('if (!laatste && lead.datum) laatste = Date.parse(lead.datum) || 0;'));
  ck('hertekent alleen bij verandering, en bewaart het concept', html.includes('if (!anders) return;') && html.includes('if (ta2 && concept) ta2.value = concept;'));
}

console.log('\nEen nieuwe uitrol wordt opgepikt zonder harde herlaad');
{
  const src = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  ck('server zet X-Helvaro-Build en beantwoordt HEAD', src.includes("res.setHeader('X-Helvaro-Build', uit.jsHash);") && src.includes("if (req.method === 'HEAD') return res.status(200).end();"));
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '', hdrs = {};
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  /* Met Host-header gaat de handler het echte pad (CSS/JS apart), en dáár zit
     de header -- een HEAD moet kunnen zonder de 200 KB. */
  dash({ method: 'HEAD', url: '/dashboard', headers: { host: 'app.helvaro.pro' } },
    { setHeader(k, v) { hdrs[k] = v; }, status() { return this; }, send() {}, json() {}, end() {} });
  ck('client vergelijkt zijn eigen v= met de header', html.includes("var b = r.headers.get('x-helvaro-build');") && html.includes('if (b && b !== hvEigenBuild()) _hvNieuweBuild = true;'));
  ck('herladen gebeurt alleen bij een paginawissel', html.includes('function navigateTo(page) {\n  if (_hvNieuweBuild) { window.location.reload(); return; }'));
  ck('de header staat op het HTML-antwoord', typeof hdrs['X-Helvaro-Build'] === 'string' && /^[0-9a-f]{8,}$/.test(hdrs['X-Helvaro-Build']), hdrs['X-Helvaro-Build']);
}

console.log('\nEerste WhatsApp-bericht komt sneller');
{
  const src = fs.readFileSync(BASE + 'api/form.js', 'utf8');
  ck('geen vaste 45000 meer in de setTimeout', !/\}, 45000\);/.test(src));
  ck('de vertraging komt uit INTRO_VERTRAGING_MS', /\}, INTRO_VERTRAGING_MS\);/.test(src));
  const m = src.match(/const INTRO_VERTRAGING_MS = ([^\n]+);/);
  ck('standaard 5 s, geklemd op 0..45 s', !!m && m[1].includes('Math.min(45000') && m[1].includes('|| 5000'), m && m[1]);
  /* De formule zelf, los uitgevoerd. */
  const f = (v) => { process.env.INTRO_VERTRAGING_MS = v; return eval(m[1]); };
  ck('leeg → 5000', f('') === 5000);
  ck('"12000" → 12000', f('12000') === 12000);
  ck('"999999" → 45000', f('999999') === 45000);
  ck('"abc" → 5000', f('abc') === 5000);
  delete process.env.INTRO_VERTRAGING_MS;
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
