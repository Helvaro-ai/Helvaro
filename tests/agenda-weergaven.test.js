/*
 * De agenda (api/_dash/agenda.js): dag, week, maand en lijst, zoom en
 * sneltoetsen. Draait de echte clientcode in een vm met een minimale DOM, en
 * controleert de bereiken per weergave, de zoomgrenzen en dat de labels
 * vertaald zijn (geen Nederlandse tekst meer in de afspraakgegevens).
 */
'use strict';
const vm = require('vm');
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };

const bron = require('../api/_dash/agenda.js').js();
console.log('\nAgenda: weergaven, zoom en labels');
let fout = ''; try { new vm.Script(bron); } catch (e) { fout = e.message; }
ck('de clientcode parseert', !fout, fout);
ck('geen backtick of ${ (veilig in de template)', bron.indexOf('`') === -1 && bron.indexOf('${') === -1);

const ctx = {
  console, Date, Math, JSON, String, Number, Map, Promise, Intl, Array, Object, parseInt,
  LOCALE: 'en-GB', API_BASE: '', state: {},
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {}, readyState: 'complete' },
  tr: (k) => k, escHtml: (s) => String(s), lokaleDatum: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
};
vm.createContext(ctx);
vm.runInContext(bron + '\n;this.__api = { calBereik, calState, calRowH, CAL_ZOOM, calLabel };', ctx);
const api = ctx.__api;
const zet = (view, d) => { api.calState.view = view; api.calState.anchor = d; };

zet('day', new Date(2026, 9, 3));
ck('dag: één dag', api.calBereik().length === 1);
zet('week', new Date(2026, 9, 3));
const wk = api.calBereik();
ck('week: maandag tot zondag', wk.length === 7 && wk[0].getDay() === 1 && wk[6].getDay() === 0 && wk[0].getDate() === 28, wk.map(String));
zet('month', new Date(2026, 9, 15));
const mnd = api.calBereik();
ck('maand: hele weken, begint op maandag, dekt 1 en 31 oktober',
  mnd.length % 7 === 0 && mnd[0].getDay() === 1 && mnd.some((d) => d.getMonth() === 9 && d.getDate() === 1) && mnd.some((d) => d.getMonth() === 9 && d.getDate() === 31), mnd.length);
zet('month', new Date(2027, 1, 10));   // februari 2027 begint op maandag: precies 4 weken
ck('maand: februari 2027 is vier weken', api.calBereik().length === 28, api.calBereik().length);
zet('list', new Date(2026, 9, 3));
ck('lijst: dertig dagen vanaf het anker', api.calBereik().length === 30 && api.calBereik()[0].getDate() === 3);
ck('lijst over twee maanden: label met streepje', /3 Oct.*1 Nov 2026/.test(api.calLabel(api.calBereik())), api.calLabel(api.calBereik()));

api.calState.zoom = 0; ck('kleinste zoom', api.calRowH() === api.CAL_ZOOM[0]);
api.calState.zoom = 99; ck('zoom buiten bereik valt terug op 80', api.calRowH() === 80);

ck('geen Nederlandse afspraaklabels meer in de code',
  !/'Door je assistent geboekt'|'Geannuleerd'|'Handmatig'/.test(bron)
  /* 'Bezet' mag alleen voorkomen als de letterlijke serverwaarde die we vertalen. */
  && (bron.match(/'Bezet'/g) || []).length === 1 && /e\.title === 'Bezet'\) \? tr\('cal\.bezet'\)/.test(bron));
const i18n = require('../api/_i18n.js');
const nodig = ['cal.v.dag', 'cal.v.week', 'cal.v.maand', 'cal.v.lijst', 'cal.zoomIn', 'cal.zoomUit', 'cal.meer', 'cal.lijst.leeg',
  'cal.bron.assistent', 'cal.bron.handmatig', 'cal.st.geannuleerd', 'cal.st.noshow', 'cal.bezet', 'cal.googleAgenda'];
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const w = i18n.woordenboek(taal);
  const mist = nodig.filter((k) => !w[k]);
  ck(taal + ': alle agendalabels bestaan', mist.length === 0, mist);
}
/* De eerste weergave opent op vandaag, niet op de maandag van deze week. */
{
  const ctx2 = Object.assign({}, ctx);
  vm.createContext(ctx2);
  vm.runInContext(bron + '\n;this.__a = calAnchor; this.__s = calState;', ctx2);
  ctx2.__s.weekStart = new Date(2026, 8, 28);   // de maandag; mag het anker niet bepalen
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  ck('de agenda opent op vandaag, ook als weekStart een maandag is', ctx2.__a().getTime() === nu.getTime(), String(ctx2.__a()));
}
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
ck('dashboard laadt de module en heeft de vier weergaveknoppen',
  /\$\{_agenda\.js\(\)\}/.test(dash) && ['day', 'week', 'month', 'list'].every((v) => dash.includes('id="cal-view-' + v + '"')) && dash.includes('id="cal-alt-view"'));

console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
