/*
 * De schermtaal van het dashboard.
 *
 * ── Twee talen die niets met elkaar te maken hebben ─────────────────────────
 * api/_lang.js gaat over de taal waarin de AI met een LEAD praat (40 talen,
 * met aanspreekvormen en WhatsApp-sjablonen). api/_i18n.js gaat over de taal
 * van de KNOPPEN die de makelaar ziet. Een Brussels kantoor kan Franstalige
 * leads bedienen met een Nederlands dashboard; die twee mogen elkaar niet
 * overschrijven. Deze test bewaakt dat ze gescheiden blijven.
 *
 * ── Waarom "fr-BE" hier een eigen test heeft ────────────────────────────────
 * _lang.normalizeLanguageCode('fr-BE') geeft 'nl' terug: bij een onbekende
 * waarde valt hij terug op de standaardtaal, en met de regiocode erbij is
 * 'fr-BE' onbekend. Browsers sturen in Accept-Language bijna ALTIJD een
 * regiocode. Had _i18n die functie hergebruikt, dan was er nooit iemand op een
 * Franse pagina beland en had niemand geweten waarom.
 */
'use strict';

const i18n = require('../api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};
const req = (url, headers) => ({ url, headers: headers || {} });

console.log('\n— de volgorde: wie wint van wie —');
{
  const oudeEnv = process.env.DASHBOARD_LANG;
  delete process.env.DASHBOARD_LANG;

  ck('?lang= wint van alles',
     i18n.resolveer(req('/dashboard?lang=fr', { cookie: 'hv_lang=de', 'accept-language': 'en' })) === 'fr', null);
  ck('cookie wint van de browser',
     i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=de', 'accept-language': 'en' })) === 'de', null);
  ck('de browser telt als er niets gekozen is',
     i18n.resolveer(req('/dashboard', { 'accept-language': 'en-GB,en' })) === 'en', null);
  ck('en anders Nederlands', i18n.resolveer(req('/dashboard')) === 'nl', null);

  process.env.DASHBOARD_LANG = 'de';
  ck('DASHBOARD_LANG is de terugval van de eigenaar',
     i18n.resolveer(req('/dashboard')) === 'de', null);
  ck('maar de bezoeker wint daarvan',
     i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=fr' })) === 'fr', null);
  if (oudeEnv === undefined) delete process.env.DASHBOARD_LANG; else process.env.DASHBOARD_LANG = oudeEnv;
}

console.log('\n— regiocodes, want die stuurt elke browser mee —');
{
  ck('fr-BE -> fr', i18n.resolveer(req('/dashboard', { 'accept-language': 'fr-BE,fr;q=0.9' })) === 'fr', null);
  ck('nl-BE -> nl', i18n.resolveer(req('/dashboard', { 'accept-language': 'nl-BE' })) === 'nl', null);
  ck('de_AT -> de', i18n.kort('de_AT') === 'de', i18n.kort('de_AT'));
  /* Dit is precies waar _lang.js de fout in gaat; als _i18n die ooit gaat
     hergebruiken, valt deze test om. */
  const _lang = require('../api/_lang.js');
  ck('en _lang.js zou hier "nl" van maken (daarom eigen normalisatie)',
     _lang.normalizeLanguageCode('fr-BE') === 'nl', _lang.normalizeLanguageCode('fr-BE'));
}

console.log('\n— onzin leidt nooit tot een kapot scherm —');
{
  for (const rommel of ['es', 'zz', '', '../etc', 'nl; DROP', null]) {
    const uit = i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=' + rommel }));
    ck(`cookie "${rommel}" -> een geldige taal (${uit})`, i18n.TALEN.indexOf(uit) > -1, uit);
  }
  ck('een kapotte URL laat de rest van de keten werken',
     i18n.TALEN.indexOf(i18n.resolveer({ url: '%%%', headers: { cookie: 'hv_lang=fr' } })) > -1, null);
}

console.log('\n— elke sleutel bestaat in ELKE taal —');
{
  /* Dit is de test die het onderhoud draagt. Een ontbrekende vertaling valt
     terug op Nederlands, dus je ZIET hem niet: het scherm blijft werken en er
     staat gewoon een Nederlands woord tussen het Frans. Zonder deze controle
     sluipt dat er bij elke nieuwe sleutel weer in. */
  const nlDict = i18n.woordenboek('nl');
  const sleutels = Object.keys(nlDict);
  ck('er zijn sleutels', sleutels.length > 20, sleutels.length);

  const ontbreekt = [];
  for (const taal of i18n.TALEN) {
    const d = i18n.woordenboek(taal);
    for (const k of sleutels) {
      if (!d[k] || !String(d[k]).trim()) ontbreekt.push(taal + ':' + k);
    }
  }
  ck('geen enkele ontbreekt', ontbreekt.length === 0, ontbreekt.slice(0, 8).join(', '));

  /* Vertaald, niet gekopieerd. Een handvol woorden is in meerdere talen
     hetzelfde (Pipeline, Exports) -- dat mag. Maar als de MEERDERHEID van een
     taal gelijk is aan het Nederlands, is die taal niet vertaald maar geplakt. */
  for (const taal of i18n.TALEN.filter((t) => t !== 'nl')) {
    const d = i18n.woordenboek(taal);
    const zelfde = sleutels.filter((k) => d[k] === nlDict[k]).length;
    ck(`${taal} is echt vertaald (${zelfde}/${sleutels.length} gelijk aan nl)`,
       zelfde < sleutels.length * 0.3, zelfde + ' van ' + sleutels.length);
  }
}

console.log('\n— variabelen worden ingevuld, in elke taal —');
{
  for (const taal of i18n.TALEN) {
    const s = i18n.t(taal, 'push.credit80.body', { used: 800, total: 1000 });
    ck(`${taal}: {used}/{total} ingevuld`, /800/.test(s) && /1000/.test(s) && !/\{used\}/.test(s), s.slice(0, 60));
  }
  ck('een onbekende sleutel geeft de sleutel terug, niet leeg',
     i18n.t('nl', 'bestaat.niet') === 'bestaat.niet', null);
}

console.log('\n— de pagina komt in de gekozen taal binnen —');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  const render = (url, headers) => {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dash = require('../api/dashboard.js');
    let html = '';
    dash({ method: 'GET', url, headers: headers || {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    return html;
  };

  const nl = render('/dashboard');
  const fr = render('/dashboard?lang=fr');
  const de = render('/dashboard', { cookie: 'hv_lang=de' });

  ck('html lang volgt de taal',
     /<html lang="nl"/.test(nl) && /<html lang="fr"/.test(fr) && /<html lang="de"/.test(de), null);
  /* Het label staat op een eigen ingesprongen regel tussen icoon en </button>,
     dus niet strak tussen > en <. Zoeken op het woord binnen de navigatieknop. */
  const navLabel = (html, id) => {
    const i = html.indexOf('id="nav-' + id + '"');
    return i === -1 ? '' : html.slice(i, i + 900);
  };
  ck('de navigatie is vertaald',
     /Facturatie/.test(navLabel(nl, 'facturatie'))
     && /Facturation/.test(navLabel(fr, 'facturatie'))
     && /Abrechnung/.test(navLabel(de, 'facturatie')), navLabel(fr, 'facturatie').slice(-90));
  ck('en de groepskoppen ook',
     /aria-hidden="true">WERK</.test(nl) && /aria-hidden="true">TRAVAIL</.test(fr), null);

  /* Er mag geen moment zijn waarop er Nederlands staat dat daarna Frans wordt:
     de server zet het woordenboek van ÉÉN taal in de pagina. */
  ck('het woordenboek zit in de pagina', fr.indexOf('const T_DICT =') > -1, null);
  ck('en bevat alleen de gekozen taal',
     fr.indexOf('Facturation') > -1 && !/T_DICT = \{[^\n]*Abrechnung/.test(fr), null);

  /* De pagina is één grote template literal. Een backtick of ${ in een
     vertaling zou hem breken -- faro-check vangt dat ook, hier expliciet. */
  const dict = (fr.match(/const T_DICT = (\{[\s\S]*?\});/) || [])[1] || '';
  ck('het woordenboek is splice-veilig',
     dict.indexOf('`') === -1 && dict.indexOf('${') === -1, null);
}

console.log('\n— de taalkeuze blijft hangen —');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
       { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

  ck('er is een taalkiezer', html.indexOf('id="ui-taal"') > -1, null);
  ck('met vier talen',
     ['nl', 'fr', 'en', 'de'].every((c) => html.indexOf('value="' + c + '"') > -1), null);
  /* Een cookie en niet localStorage: de SERVER rendert de taal, dus die moet
     de keuze al bij het eerste verzoek kennen. */
  ck('de keuze gaat in een cookie', /document\.cookie = 'hv_lang='/.test(html), null);
  ck('en niet in localStorage',
     !/localStorage[^\n]{0,40}hv_lang/.test(html), null);
  ck('?lang= wordt uit de URL gehaald na het wisselen',
     /searchParams\.delete\('lang'\)/.test(html), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
