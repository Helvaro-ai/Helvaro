/*
 * De testpagina voor de websiteassistent (/chatbot-test).
 * Een testpagina die zelf kapot is, is erger dan geen: dit bewaakt dat hij
 * rendert, dat zijn script parseert, dat er geen sleutel in staat en dat hij
 * bereikbaar is zonder een extra serverless functie (api/*.js telt per bestand).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nChatbot-testpagina');
const pagina = require(BASE + 'api/_chatbot-test.js');
let html = '', kopregels = {};
pagina({ method: 'GET', url: '/chatbot-test', headers: {} }, { setHeader(k, v) { kopregels[k] = v; }, status() { return this; }, send(b) { html = String(b); } });
ck('rendert HTML', /<title>Chatbot testen/.test(html) && html.length > 5000, html.length);
ck('noindex, zoals de andere interne pagina', /noindex/.test(html) && /noindex/.test(kopregels['X-Robots-Tag'] || ''));
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let parseert = true;
try { new vm.Script(m[1]); } catch (e) { parseert = e.message; }
ck('het script parseert', parseert === true, parseert);
ck('er staat geen echte sitesleutel in de pagina', !/hv_site_[a-f0-9]{24}/.test(html));
ck('de sleutel komt niet in het logboek', /delete kopie\.siteKey/.test(html));
ck('de widget wordt geladen zoals een dealer dat doet (data-site)', /setAttribute\('data-site', sleutel\)/.test(html) && /'\/assistant\.js'/.test(html));
ck('widget en scenario\'s gebruiken dezelfde server', /data-api', location\.origin/.test(html));
ck('geen scenario maakt een lead of afspraak aan', !/action: 'contact'|action: 'book'|actie: 'contact'|actie: 'book'/.test(html));
ck('er zijn scenario\'s voor beschikbaarheid, prijs, afspraak, kortingstruc en promptlek', ['beschikbaar', 'prijs', 'proefrijden', 'Kortingstruc', 'Systeemprompt'].every((w) => html.indexOf(w) !== -1));

console.log('\nBereikbaarheid');
const vercel = JSON.parse(fs.readFileSync(BASE + 'vercel.json', 'utf8'));
const route = (vercel.rewrites || []).find((r) => r.source === '/chatbot-test');
ck('route /chatbot-test bestaat', !!route, route);
ck('en loopt via api/demo.js, niet via een nieuw functiebestand', route && /^\/api\/demo\?test=1$/.test(route.destination));
const functies = fs.readdirSync(BASE + 'api').filter((f) => /\.js$/.test(f) && f[0] !== '_' && !/ 2\.js$/.test(f));
ck('het aantal serverless functies stijgt niet (' + functies.length + ')', functies.length <= 12, functies);
let uit = '';
require(BASE + 'api/demo.js')({ method: 'GET', url: '/api/demo?test=1', headers: {} }, { setHeader() {}, status() { return this; }, send(b) { uit = String(b); } });
ck('demo.js geeft ?test=1 door aan de testpagina', /Chatbot testen/.test(uit));
let gewoon = '';
require(BASE + 'api/demo.js')({ method: 'GET', url: '/api/demo', headers: {} }, { setHeader() {}, status() { return this; }, send(b) { gewoon = String(b); } });
ck('en /demo zelf blijft zoals het was', /Helvaro Widget Demo/.test(gewoon));

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
