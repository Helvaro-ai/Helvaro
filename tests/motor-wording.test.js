'use strict';
/*
 * Motorsegment, woordenronde: wat een MOTORdealer in het dashboard en op de
 * website leest, zonder autowoorden, in nl/fr/en/de. Auto blijft letterlijk.
 *  - tr() leest 'mot.o.<sleutel>' alleen bij dealership + segment motor;
 *  - elke mot.o.-sleutel heeft een origineel en vier talen, en geen autowoord;
 *  - het formulier: brandstof, versnelling en typelijst per segment;
 *  - de webboekingsmeldingen voor motor in vier talen; auto houdt zijn tekst.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'x'; process.env.BASE_AIRTABLE = 'y';

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`); ok ? pass++ : fail++; };
const TALEN = ['nl', 'fr', 'en', 'de'];
const AUTOWOORD = /\bauto\b|auto's|\bautos\b|wagen|proefrit|voiture|\bcars?\b|AutoScout|test drive|\bAuto\b|Autos\b|Fahrzeug|Autohaus|inruilwagen/i;

const i18n = require(BASE + 'api/_i18n.js');
const wens = require(BASE + 'api/_wens.js');
const segDash = require(BASE + 'api/_dash/segment.js');

console.log('\ni18n: mot.o.-overschrijvingen');
{
  const sleutels = Object.keys(i18n.woordenboek('nl')).filter((k) => k.startsWith('mot.o.'));
  ck('er zijn overschrijvingen', sleutels.length >= 25, sleutels.length);
  const zonderOrigineel = sleutels.filter((k) => i18n.t('nl', k.slice(6)) === k.slice(6));
  ck('elke mot.o.-sleutel overschrijft een bestaande sleutel', zonderOrigineel.length === 0, zonderOrigineel);
  const leeg = [], auto = [], vars = [];
  for (const k of sleutels) for (const l of TALEN) {
    const v = i18n.t(l, k);
    if (!v || v === k) leeg.push(l + ':' + k);
    if (AUTOWOORD.test(v)) auto.push(l + ':' + k + ' = ' + v);
  }
  for (const k of sleutels) {
    const orig = (i18n.t('nl', k.slice(6)).match(/\{\w+\}/g) || []).sort().join();
    for (const l of TALEN) if ((i18n.t(l, k).match(/\{\w+\}/g) || []).sort().join() !== orig) vars.push(l + ':' + k);
  }
  ck('alle vier de talen aanwezig', leeg.length === 0, leeg);
  ck('geen autowoord in een motortekst (nl/fr/en/de)', auto.length === 0, auto);
  ck('dezelfde {variabelen} als het origineel', vars.length === 0, vars);
  ck('funnel: Testrit / Essai routier / Test ride / Probefahrt',
    ['Testrit', 'Essai routier', 'Test ride', 'Probefahrt'].every((w, n) => i18n.t(TALEN[n], 'mot.o.dash.funnel.proefrit') === w));
  ck('score: inruilmotor, niet inruilwagen', i18n.t('nl', 'mot.o.score.reden.inruil') === 'inruilmotor vermeld' && i18n.t('nl', 'score.reden.inruil') === 'inruilwagen vermeld');
}

console.log('\ntr() in de uitgestuurde pagina');
{
  let html = '';
  require(BASE + 'api/dashboard.js')({ method: 'GET', url: '/dashboard', headers: {} }, { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  const van = html.indexOf('function tr(sleutel, vars)');
  const tot = html.indexOf('/* De API antwoordt met Nederlandse foutteksten');
  const dict = {};
  for (const k of Object.keys(i18n.woordenboek('nl'))) dict[k] = i18n.t('nl', k);
  const sb = { T_DICT: dict, console: { warn() {} } };
  vm.createContext(sb);
  vm.runInContext('var hvVertical, hvSegment;\n' + html.slice(van, tot) + '\nthis.api = { tr: tr, zet: function (v, s) { hvVertical = v; hvSegment = s; } };', sb);
  const a = sb.api;
  a.zet('dealership', 'auto');
  ck('auto: Proefrit, inruilwagen en de AutoScout-tekst ongewijzigd', a.tr('dash.funnel.proefrit') === 'Proefrit' && a.tr('score.reden.inruil') === 'inruilwagen vermeld' && /AutoScout24/.test(a.tr('veh.import.sub')));
  a.zet('dealership', undefined);
  ck('zonder segment (nog niet geladen): ook auto', a.tr('dash.funnel.proefrit') === 'Proefrit');
  a.zet('dealership', 'motor');
  ck('motor: Testrit, inruilmotor, generieke importtekst', a.tr('dash.funnel.proefrit') === 'Testrit' && a.tr('score.reden.inruil') === 'inruilmotor vermeld' && !/AutoScout/.test(a.tr('veh.import.sub')));
  ck('motor: {variabelen} werken nog', a.tr('inv.daling.tekst', { n: 3 }).startsWith('3 motoren'));
  a.zet('vastgoed', 'motor');
  ck('een segment buiten dealership telt niet', a.tr('dash.funnel.proefrit') === 'Proefrit');
}

console.log('\nformulier per segment (kale nepdocument)');
{
  const el = (o) => Object.assign({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; } }, o);
  const opts = (sel, lijst) => { sel.options = lijst.map(([value, textContent]) => ({ value, textContent, hidden: false, disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, remove() { sel.options = sel.options.filter((x) => x !== this); } })); return sel; };
  const els = {
    'pd-motor-velden': el({}), 'pd-l-carrosserie': el({ textContent: '' }), 'pd-f-carrosserie': el({ placeholder: '' }),
    'pd-f-brandstof': opts(el({ value: 'benzine' }), ['benzine', 'diesel', 'hybride', 'elektrisch', 'lpg', 'overig'].map((v) => [v, v])),
    'pd-f-transmissie': el({ value: 'automaat', querySelector(q) { return q.includes('handgeschakeld') ? this.options.find((o) => o.value === 'handgeschakeld') : this.options.find((o) => o.attrs['data-motor']) || null; }, appendChild(o) { this.options.push(o); } }),
    'pd-l-adlink': el({ textContent: 'Advertentielink (AutoScout24)' }), 'pd-f-adlink': el({ placeholder: '' }),
  };
  opts(els['pd-f-transmissie'], [['automaat', 'automaat'], ['handgeschakeld', 'handgeschakeld']]);
  const datalijst = el({ id: 'pd-dl-motortype', innerHTML: '', children: [], appendChild(o) { this.children.push(o); } });
  const doc = { getElementById: (id) => (id === 'pd-dl-motortype' ? (doc._dl || null) : els[id] || null), createElement: (t) => (t === 'datalist' ? Object.assign(datalijst, { set innerHTML(v) { this.children = []; } }) : Object.assign(el({}), { remove() { els['pd-f-transmissie'].options = els['pd-f-transmissie'].options.filter((x) => x !== this); } })), body: { appendChild(d) { doc._dl = d; } } };
  const WB = i18n.woordenboek('nl');
  const sb = { document: doc, tr: (k) => (sb.hvSegment === 'motor' && WB['mot.o.' + k] !== undefined ? i18n.t('nl', 'mot.o.' + k) : i18n.t('nl', k)) };
  vm.createContext(sb);
  vm.runInContext('var hvVertical = "dealership", hvSegment = "motor";\n' + segDash.js() + '\nthis.api = { toepassen: segmentToepassen, zet: function (s) { hvSegment = s; this.hvSegment = s; }, types: MOTOR_TYPES };', sb);
  const a = sb.api;
  ck('de typelijst = de motorgroepen van api/_wens.js (MOTORTYPES)', a.types.slice().sort().join() === Object.keys(wens.MOTORTYPES).sort().join(), a.types);
  const label = (k) => TALEN.every((l) => i18n.t(l, 'mot.type.' + k) && i18n.t(l, 'mot.type.' + k) !== 'mot.type.' + k);
  ck('elk motortype heeft een label in vier talen', a.types.every(label));
  a.toepassen();
  ck('motor: suggestielijst gekoppeld aan het typeveld', els['pd-f-carrosserie'].attrs.list === 'pd-dl-motortype' && datalijst.children.length === a.types.length);
  ck('motor: brandstof alleen benzine en elektrisch zichtbaar', els['pd-f-brandstof'].options.filter((o) => !o.hidden).map((o) => o.value).join() === 'benzine,elektrisch');
  const t = els['pd-f-transmissie'].options;
  ck('motor: manueel / automaat / semi-automaat; opgeslagen waarden compatibel', t.map((o) => o.value).join() === 'automaat,handgeschakeld,semi-automaat' && t[1].textContent === 'manueel', t.map((o) => o.value + '=' + o.textContent));
  ck('motor: advertentielink zonder AutoScout', !/AutoScout/.test(els['pd-l-adlink'].textContent) && els['pd-f-adlink'].placeholder === 'https://...');
  a.zet('auto');
  els['pd-f-transmissie'].value = 'semi-automaat';
  a.toepassen();
  ck('auto: alles terug (brandstof, versnelling, geen lijst)', els['pd-f-brandstof'].options.every((o) => !o.hidden && !o.disabled)
    && els['pd-f-transmissie'].options.map((o) => o.value + '=' + o.textContent).join() === 'automaat=automaat,handgeschakeld=handgeschakeld'
    && els['pd-f-transmissie'].value === 'automaat' && els['pd-f-carrosserie'].attrs.list === undefined && els['pd-f-adlink'].placeholder.includes('autoscout24'));
}

console.log('\nwebboeking: motormeldingen in vier talen');
(async () => {
  const mm = require(BASE + 'api/_motor-meldingen.js');
  const lege = Object.keys(mm.TEKSTEN).filter((k) => mm.TALEN.some((l) => !mm.TEKSTEN[k][l]));
  ck('elke melding heeft nl, fr, en, de', lege.length === 0, lege);
  const auto = Object.keys(mm.TEKSTEN).filter((k) => mm.TALEN.some((l) => AUTOWOORD.test(mm.TEKSTEN[k][l])));
  ck('geen autowoord in een motormelding', auto.length === 0, auto);
  ck('onbekende taal = Nederlands; onbekende sleutel = leeg', mm.melding('nakijken', 'xx') === mm.TEKSTEN.nakijken.nl && mm.melding('bestaat-niet', 'fr') === '');
  const bron = fs.readFileSync(BASE + 'api/_webboeking.js', 'utf8');
  ck('elke sleutel die _webboeking doorgeeft bestaat in de motortekst', [...new Set(bron.match(/(?:409|400|502), '([a-z_]+)'\)/g).map((s) => s.match(/'([a-z_]+)'/)[1]))].every((k) => mm.TEKSTEN[k]), null);

  /* boek(): een motordealer krijgt de fout in de taal van de bezoeker; auto de oude tekst. */
  const wb = require(BASE + 'api/_webboeking.js');
  const vorige = global.fetch;
  const klant = (velden) => { global.fetch = async () => ({ ok: true, json: async () => ({ records: [{ fields: velden }] }) }); };
  const fout = async (taal) => { try { await wb.boek('PROJ', { leadId: '', taal }); } catch (e) { return e.message; } return ''; };
  klant({ Vertical: 'dealership', 'Vehicle Segment': 'motor' });
  ck('motor fr', await fout('fr') === mm.TEKSTEN.geen_contact.fr);
  ck('motor en', await fout('en') === mm.TEKSTEN.geen_contact.en);
  ck('motor de', await fout('de') === mm.TEKSTEN.geen_contact.de);
  ck('motor zonder taal (WhatsApp, tests): de bestaande tekst', await fout('') === 'Laat eerst een e-mailadres of telefoonnummer achter.');
  klant({ Vertical: 'dealership' });
  ck('auto met taal fr: nog steeds de Nederlandse autotekst', await fout('fr') === 'Laat eerst een e-mailadres of telefoonnummer achter.');
  global.fetch = vorige;

  console.log(`\n${pass} geslaagd, ${fail} mislukt`);
  process.exit(fail ? 1 : 0);
})();
