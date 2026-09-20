/*
 * Formulier → Stijl & merk: een klant zet het leadformulier op zijn huisstijl.
 *
 * ── Wat hier bewaakt wordt ──────────────────────────────────────────────────
 * Eén JSON-veld op Client Config ("Form Style") loopt van het dashboard naar
 * de formulierpagina. api/_form-stijl.js is de enige lezer én schrijver, en
 * die laat alleen door wat op een witte lijst staat: kleur (hex), keuzes uit
 * een vaste lijst, https- of data:image-afbeeldingen, korte tekst.
 *
 * Drie dingen mogen nooit:
 *   1. iets anders dan vormgeving de pagina in (javascript:-logo, <script> in
 *      een kop, een http-achtergrond);
 *   2. een onleesbaar formulier (tekst op grond onder 4,5:1);
 *   3. een klant die niets instelt anders krijgen dan gisteren.
 */
'use strict';

const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const stijl = require(BASE + 'api/_form-stijl.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
  ok ? pass++ : fail++;
};

console.log('\nStijl & merk -- sanering');

console.log('\n  niets ingesteld = standaard');
{
  const s = stijl.saneer('');
  ck('thema donker', s.thema === 'donker', s);
  ck('letter inter, hoek zacht, layout kaart', s.letter === 'inter' && s.hoek === 'zacht' && s.layout === 'kaart', s);
  ck('geen kleuren, geen logo, geen teksten', !s.merk && !s.grond && !s.logoUrl && !s.kop && !s.knop, s);
  ck('serialiseer van niets is leeg', stijl.serialiseer({}) === '', stijl.serialiseer({}));
  ck('kapotte JSON valt terug op standaard', stijl.saneer('{nope').thema === 'donker');
  ck('een array is geen stijl', stijl.saneer([1, 2]).thema === 'donker');
}

console.log('\n  witte lijst per veld');
{
  const s = stijl.saneer({ thema: 'LICHT', letter: 'comic', hoek: 'rond', layout: 'x', merk: 'ff0000', grond: '#zzzzzz' });
  ck('thema in kleine letters herkend', s.thema === 'licht', s.thema);
  ck('onbekende letter → inter', s.letter === 'inter', s.letter);
  ck('onbekende layout → kaart', s.layout === 'kaart', s.layout);
  ck('hex zonder # krijgt er een, in hoofdletters', s.merk === '#FF0000', s.merk);
  ck('geen geldige hex → leeg', s.grond === '', s.grond);
  ck('kop wordt op 200 geknipt', stijl.saneer({ kop: 'a'.repeat(300) }).kop.length === 200);
  ck('knop wordt op 40 geknipt', stijl.saneer({ knop: 'b'.repeat(80) }).knop.length === 40);
  ck('regeleinden in tekst worden spaties', stijl.saneer({ kop: 'een\nzin\r\nhier' }).kop === 'een zin hier');
  ck('avatarWeg alleen bij echte true', stijl.saneer({ avatarWeg: 'true' }).avatarWeg === false);
}

console.log('\n  afbeeldingen');
{
  ck('https-logo mag', stijl.saneer({ logoUrl: 'https://x.be/l.png' }).logoUrl === 'https://x.be/l.png');
  ck('http-logo niet', stijl.saneer({ logoUrl: 'http://x.be/l.png' }).logoUrl === '');
  ck('javascript:-logo niet', stijl.saneer({ logoUrl: 'javascript:alert(1)' }).logoUrl === '');
  ck('data:image/png mag', stijl.saneer({ logoUrl: 'data:image/png;base64,iVBORw0KGgo=' }).logoUrl !== '');
  ck('data:text/html niet', stijl.saneer({ logoUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).logoUrl === '');
  ck('data-logo boven 200 KB niet', stijl.saneer({ logoUrl: 'data:image/png;base64,' + 'A'.repeat(210 * 1024) }).logoUrl === '');
  ck('achtergrond: alleen https, geen data', stijl.saneer({ achtergrond: 'data:image/png;base64,AAAA' }).achtergrond === '');
  ck('achtergrond met aanhalingsteken niet', stijl.saneer({ achtergrond: 'https://x.be/a.jpg") ; content:"' }).achtergrond === '');
}

console.log('\n  contrastwacht');
{
  const p = stijl.palet(stijl.saneer({ thema: 'licht', tekst: '#FFFFFF' }), 'licht', '');
  ck('wit op licht valt terug op de themastandaard', p.tekst === '#1F1D19', p);
  const p2 = stijl.palet(stijl.saneer({ thema: 'donker', tekst: '#1A1A1A' }), 'donker', '');
  ck('bijna-zwart op donker valt terug', p2.tekst === '#F1E9DA', p2);
  const p3 = stijl.palet(stijl.saneer({ thema: 'licht', tekst: '#333333' }), 'licht', '');
  ck('leesbare eigen tekstkleur blijft', p3.tekst === '#333333', p3);
  ck('tekst op lichte merkkleur wordt donker', stijl.palet(stijl.saneer({ merk: '#F5E6B8' }), 'donker', '').opMerk === '#1A1A1A');
  ck('tekst op donkere merkkleur wordt wit', stijl.palet(stijl.saneer({ merk: '#1E3A5F' }), 'donker', '').opMerk === '#FFFFFF');
  ck('contrast wit/zwart is 21', Math.round(stijl.contrast('#FFFFFF', '#000000')) === 21);
}

console.log('\n  css');
{
  const c = stijl.css(stijl.saneer({}), '#8A6D3F');
  ck('begint met :root', c.startsWith(':root{'), c.slice(0, 20));
  ck('merkFallback wordt --brand', c.includes('--brand:#8A6D3F'), c);
  ck('geen media-blok bij vast thema', !c.includes('@media'), c);
  const a = stijl.css(stijl.saneer({ thema: 'auto' }), '');
  ck('auto: lichte basis + donker media-blok', a.includes('@media (prefers-color-scheme: dark)') && a.includes('--grond:#F3EDE1') && a.includes('--grond:#17140F'), a);
  const r = stijl.css(stijl.saneer({ hoek: 'rond' }), '');
  ck('rond: pilvormige velden', r.includes('--hoek-veld:999px'), r);
  const eigen = stijl.css(stijl.saneer({ merk: '#1E3A5F' }), '#8A6D3F');
  ck('eigen merk overrulet Brand Color', eigen.includes('--brand:#1E3A5F') && !eigen.includes('#8A6D3F'), eigen);
  ck('geen < of > in de css (niets kan de style-tag uit)', !/[<>]/.test(stijl.css(stijl.saneer({ kop: '</style><script>' }), '')));
}

console.log('\n  serialiseer bewaart alleen afwijkingen');
{
  const j = stijl.serialiseer({ thema: 'licht', letter: 'inter', kop: ' Hallo ', avatarWeg: false });
  const o = JSON.parse(j);
  ck('thema en kop erin, inter/avatarWeg eruit', o.thema === 'licht' && o.kop === 'Hallo' && !('letter' in o) && !('avatarWeg' in o), o);
  ck('rondreis is stabiel', stijl.serialiseer(stijl.saneer(j)) === j);
}

/* ── De formulierpagina zelf: rendert met een stijl, zonder Airtable ────── */
console.log('\nFormulierpagina met eigen stijl');
(async () => {
  process.env.API_AIRTABLE = 'test';
  process.env.BASE_AIRTABLE = 'appTEST';
  const fields = {
    'AI Name': 'Mathijs', 'Client Name': 'Frade', 'Brand Color': '#8A6D3F',
    'Form Style': JSON.stringify({ thema: 'licht', merk: '#1E3A5F', hoek: 'rond', layout: 'vol', letter: 'serif',
      logoUrl: 'https://frade.be/logo.svg', avatarWeg: true, achtergrond: 'https://frade.be/bg.jpg',
      kop: 'Vertel me wat je zoekt <b>', knop: 'Stuur maar', toestemming: 'We bellen nooit ongevraagd.', voet: 'Frade bv' }),
  };
  let n = 0;
  global.fetch = async () => ({ ok: true, json: async () => (n++ === 0 ? { records: [{ fields }] } : { records: [] }) });
  delete require.cache[require.resolve(BASE + 'api/form-page.js')];
  const page = require(BASE + 'api/form-page.js');
  let html = '', status = 200;
  await page({ method: 'GET', url: '/start/FRADE', headers: {} },
    { setHeader() {}, status(s) { status = s; return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
  ck('pagina rendert (200)', status === 200 && html.length > 1000, { status, len: html.length });
  ck('licht thema in de css', html.includes('--grond:#F3EDE1'), html.match(/--grond:[^;]+/));
  ck('eigen merkkleur in de css', html.includes('--brand:#1E3A5F'));
  ck('serif-letter', html.includes("--letter:Georgia"));
  ck('layout-vol op body', /<body class="[^"]*layout-vol/.test(html));
  ck('achtergrond op body, gedimd', /met-achtergrond/.test(html) && /--achtergrond:url\((?:'|&#39;)?https:\/\/frade\.be\/bg\.jpg/.test(html));
  ck('logo in de kop', html.includes('class="logo"') && html.includes('src="https://frade.be/logo.svg"'));
  ck('geen assistent-avatar naast het logo', !/class="avatar"/.test(html) || !html.includes('Mathijs" class="avatar"'), html.match(/class="avatar"[^>]*/));
  ck('kop is ge-escaped', html.includes('Vertel me wat je zoekt &lt;b&gt;') && !html.includes('zoekt <b>'));
  ck('knoptekst', html.includes('Stuur maar'));
  ck('toestemming-zin', html.includes('We bellen nooit ongevraagd.'));
  ck('voettekst', html.includes('class="voet"') && html.includes('Frade bv'));

  /* En zonder stijl: exact het oude, donkere formulier. */
  n = 0;
  const kaal = { 'AI Name': 'Mathijs', 'Client Name': 'Frade', 'Brand Color': '#8A6D3F' };
  global.fetch = async () => ({ ok: true, json: async () => (n++ === 0 ? { records: [{ fields: kaal }] } : { records: [] }) });
  html = '';
  await page({ method: 'GET', url: '/start/FRADE', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
  ck('zonder stijl: donker, Inter, kaart, geen logo', html.includes('--grond:#17140F') && html.includes("--letter:'Inter'") && /<body class="">/.test(html) && !html.includes('class="logo"'), html.match(/<body[^>]*>/));


  /* ── Het dashboardscherm: de knoppen bestaan en praten in vier talen ──── */
  console.log('\nDashboard → Formulier → Stijl & merk');
  {
    delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
    const dash = require(BASE + 'api/dashboard.js');
    let dh = '';
    dash({ method: 'GET', url: '/dashboard', headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { dh = String(b); }, json() {}, end() {} });
    const ids = ['fs-thema', 'fs-layout', 'fs-letter', 'fs-hoek', 'fs-merk', 'fs-merk-pick', 'fs-grond', 'fs-vlak', 'fs-tekst',
      'fs-logo-file', 'fs-logo-url', 'fs-avatarweg', 'fs-achtergrond', 'fs-kop', 'fs-knop', 'fs-toestemming', 'fs-voet', 'fs-opslaan'];
    const weg = ids.filter((id) => !dh.includes('id="' + id + '"'));
    ck('alle velden staan op de Formulier-pagina', weg.length === 0, weg);
    ck('de kaart staat vóór QR/voorbeeld', dh.indexOf('id="fm-style"') > 0 && dh.indexOf('id="fm-style"') < dh.indexOf('id="fm-preview-iframe"'));
    ck('opslaan gaat via config-save met formStyle', dh.includes("mode: 'config-save', formStyle: stijl"));
    ck('laden leest formStyle uit config-get', dh.includes('fsVul(d.formStyle'));
    ck('geen rauwe fs.-sleutel in de pagina', !/>fs\.[a-zA-Z.]+</.test(dh), dh.match(/>fs\.[a-zA-Z.]+</));
    const i18n = require(BASE + 'api/_i18n.js');
    const sleutels = Object.keys(require(BASE + 'api/_i18n.js').woordenboek('nl')).filter((k) => k.startsWith('fs.'));
    const onvolledig = sleutels.filter((k) => ['nl', 'fr', 'en', 'de'].some((t) => !i18n.t(t, k) || i18n.t(t, k) === k));
    ck('elke fs.-sleutel bestaat in nl/fr/en/de (' + sleutels.length + ')', sleutels.length >= 40 && onvolledig.length === 0, onvolledig);
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
