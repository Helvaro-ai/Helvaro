'use strict';
/*
 * Het helpcentrum: twaalf artikelen, vier talen.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * De artikelen stonden als 114 regels Nederlands proza midden in
 * api/dashboard.js. Twee van de drie markten die Helvaro bedient lazen ze dus
 * niet -- en uitgerekend een helpcentrum is het laatste scherm waar je iemand
 * in een vreemde taal aanspreekt: wie hier komt, is al iets aan het uitzoeken.
 *
 * Ze zijn verhuisd naar api/_dash/help.js. Deze test bewaakt de drie dingen
 * die bij zo'n verhuizing stilletjes stukgaan:
 *
 *   1. Een taal die achterloopt. Vier arrays naast elkaar betekent dat iemand
 *      er drie kan bijwerken. Dan valt de Duitse lezer terug op niets.
 *   2. Een id dat per taal verschilt. De id staat in de zoekindex en in de
 *      URL van een gedeelde helplink; loopt hij uiteen, dan opent dezelfde
 *      link in het Frans een ander artikel of geen.
 *   3. De module die er wel is maar niet wordt gebruikt. Dat patroon is in
 *      dit project al vijf keer gevonden (LOCALE, importeerUitLink,
 *      appointment-update, tst.ietsMis, de gespreksacties): gebouwd, getest,
 *      en nooit aangeroepen. Een module met perfecte vertalingen die de
 *      pagina niet bereikt is precies even nuttig als geen vertaling.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const help  = require(path.join(BASE, 'api/_dash/help.js'));
const _i18n = require(path.join(BASE, 'api/_i18n.js'));
const bron  = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');

const TALEN = ['nl', 'fr', 'en', 'de'];
const perTaal = {};
for (const taal of TALEN) perTaal[taal] = help.artikelen((k, v) => _i18n.t(taal, k, v), taal);

console.log('\n  vier talen, dezelfde twaalf artikelen');
{
  for (const taal of TALEN) ck(taal + ': twaalf artikelen', perTaal[taal].length === 12, perTaal[taal].length);
  /* De id is de sleutel van een gedeelde link. Zou hij per taal verschillen,
     dan opent dezelfde URL in het Frans een ander artikel -- of geen. */
  const ids = perTaal.nl.map((a) => a.id);
  for (const taal of TALEN.slice(1)) {
    ck(taal + ': dezelfde ids in dezelfde volgorde',
      JSON.stringify(perTaal[taal].map((a) => a.id)) === JSON.stringify(ids),
      perTaal[taal].map((a) => a.id));
  }
  ck('geen dubbele ids', new Set(ids).size === ids.length, ids);
}

console.log('\n  elk artikel is compleet');
{
  for (const taal of TALEN) {
    const leeg = perTaal[taal].filter((a) => !a.title || !a.sec || !a.tags || !a.body || a.body.length < 80);
    ck(taal + ': titel, sectie, tags en een body van betekenis', leeg.length === 0, leeg.map((a) => a.id));
  }
  /* De zoekfunctie doet indexOf op de tags in kleine letters. Een tag met een
     hoofdletter is stil onvindbaar: geen fout, gewoon nul resultaten. */
  for (const taal of TALEN) {
    const raar = perTaal[taal].filter((a) => a.tags !== a.tags.toLowerCase());
    ck(taal + ': tags staan in kleine letters', raar.length === 0, raar.map((a) => a.id));
  }
}

console.log('\n  de secties groeperen aaneengesloten');
{
  /* De renderer zet een kop zodra a.sec verandert. Staat dezelfde sectie twee
     keer los in de lijst, dan krijgt de lezer die kop twee keer -- wat er
     uitziet als een fout in het scherm en niet in de data. */
  for (const taal of TALEN) {
    const secs = perTaal[taal].map((a) => a.sec);
    const blokken = secs.filter((s, i) => i === 0 || s !== secs[i - 1]);
    ck(taal + ': elke sectie komt in één blok', new Set(blokken).size === blokken.length, blokken);
  }
}

console.log('\n  echt vertaald, niet gekopieerd');
{
  /* Vier arrays naast elkaar nodigen uit tot plakken-en-vergeten. Zonder deze
     controle staat er over een maand een Nederlandse alinea in het Duits en
     valt dat pas op bij een klant. */
  const NL_WOORDEN = /\b(je|jouw|wordt|hierboven|zodat|omdat|meteen|klaar|gesprekken|leads krijgt|niet)\b/;
  for (const taal of ['fr', 'en', 'de']) {
    const verdacht = perTaal[taal].filter((a) => NL_WOORDEN.test(a.body) || NL_WOORDEN.test(a.title));
    ck(taal + ': geen Nederlandse zinnen blijven staan', verdacht.length === 0, verdacht.map((a) => a.id));
    ck(taal + ': de titels verschillen van het Nederlands',
      perTaal[taal].every((a, i) => a.title !== perTaal.nl[i].title
        /* 'Pipeline' heet in elke taal Pipeline. Dat is geen vergeten
           vertaling maar een productnaam. */
        || a.title === 'Pipeline' || /pipeline/i.test(a.id)),
      perTaal[taal].filter((a, i) => a.title === perTaal.nl[i].title).map((a) => a.id));
  }
}

console.log('\n  de artikelen belanden ook echt in de pagina');
{
  ck('dashboard.js laadt de module', /require\('\.\/_dash\/help'\)/.test(bron));
  ck('en zet hem in HELP_ARTICLES', /var HELP_ARTICLES = \$\{JSON\.stringify\(_help\.artikelen\(/.test(bron));
  /* Met de TAAL van dit dashboard erbij. Zonder dat argument staat er altijd
     Nederlands in de pagina en is al het werk hierboven onzichtbaar. */
  ck('in de taal van het dashboard', /_help\.artikelen\(T, _i18n\.kort\(UI_LANG\)\)/.test(bron));
  ck('het oude ingebakken blok is weg', bron.indexOf("var HELP_ARTICLES = [\n") === -1);
  ck('de zoekfunctie leest nog dezelfde variabele', /HELP_ARTICLES\.filter\(/.test(bron));
}

console.log('\n  veilig binnen een <script> in de pagina');
{
  /* De array gaat als JSON een <script>-blok in. Een body met </script> erin
     sluit dat blok vroegtijdig -- de rest van het dashboard wordt dan als
     HTML gelezen en het scherm blijft leeg. JSON.stringify ontsnapt quotes
     en accenten, maar NIET dit. Het is een van die fouten die alleen in de
     browser zichtbaar wordt en nergens een foutmelding geeft. */
  for (const taal of TALEN) {
    const json = JSON.stringify(perTaal[taal]);
    ck(taal + ': geen </script> of <!-- in de teksten',
      json.indexOf('</script') === -1 && json.indexOf('<!--') === -1);
    /* En het moet ook echt terug te lezen zijn. */
    ck(taal + ': de JSON is rond', JSON.parse(json).length === 12);
  }
}

console.log('\n  de schermnamen komen uit de vertaaltabel');
{
  /* Een artikel dat "Ga naar Dashboard" zegt moet dezelfde woorden gebruiken
     als de knop waar de lezer op moet klikken. Vandaar t() in de body en niet
     het woord zelf: hernoemt iemand een pagina, dan verandert de help mee. */
  const mod = fs.readFileSync(path.join(BASE, 'api/_dash/help.js'), 'utf8');
  const sleutels = ['nav.dashboard', 'nav.pipeline', 'nav.conversations', 'nav.settings',
                    'nav.persona', 'nav.form', 'nav.exports', 'set.danger',
                    'a11y.veld.begroeting', 'a11y.veld.instructies', 'conv.mensAanRoer', 'conv.assistentActief'];
  for (const s of sleutels) {
    ck(s + ' bestaat en wordt gebruikt',
      mod.indexOf("t('" + s + "')") !== -1 && _i18n.t('fr', s) !== s, _i18n.t('fr', s));
  }
  ck('het Franse artikel noemt de Franse paginanaam',
    perTaal.fr[0].body.indexOf(_i18n.t('fr', 'nav.dashboard')) !== -1, _i18n.t('fr', 'nav.dashboard'));
  ck('en het Duitse de Duitse',
    perTaal.de[0].body.indexOf(_i18n.t('de', 'nav.dashboard')) !== -1, _i18n.t('de', 'nav.dashboard'));
}

console.log('\n  het privacy-artikel klopt met wat de app kan');
{
  /* Dit artikel beloofde tot vorige week dat account-verwijdering handmatig
     ging. Sindsdien staat er een knop in Instellingen die alles onmiddellijk
     wist. Een helpartikel dat een oude waarheid vertelt is erger dan geen
     artikel: de lezer zoekt naar iets wat er wél is en concludeert dat het
     niet bestaat. */
  for (const taal of TALEN) {
    const p = perTaal[taal].filter((a) => a.id === 'privacy')[0];
    ck(taal + ': verwijst naar de knop in ' + _i18n.t(taal, 'set.danger'),
      p.body.indexOf(_i18n.t(taal, 'set.danger')) !== -1, p.body.slice(-260));
  }
  ck('en zegt dat de facturen bij Stripe blijven',
    TALEN.every((l) => /Stripe/.test(perTaal[l].filter((a) => a.id === 'privacy')[0].body)));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
