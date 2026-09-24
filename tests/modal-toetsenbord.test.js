'use strict';
/*
 * Elk venster houdt het toetsenbord vast, en geeft het weer af.
 *
 * ── Wat er mis was ──────────────────────────────────────────────────────────
 * Er STOND een nette toetsenbordval in dit bestand -- modalToetsenbord():
 * Escape, een Tab-cirkel, en de focus terug naar waar hij vandaan kwam. Drie
 * vensters gebruikten hem. Vier andere bouwden hun eigen overlay met alleen een
 * Escape-handler erbij:
 *
 *   showConfirmModal()          de algemene ja/nee-vraag
 *   toonSupportModal()          een bericht aan support
 *   vraagBtwEnBetaal()          het btw-nummer vlak voor het afrekenen
 *   vraagAccountVerwijdering()  je account wissen
 *
 * In die vier liep Tab gewoon door naar de pagina erachter: onzichtbaar, maar
 * wel bereikbaar. Je kon met het toetsenbord in een knop belanden die onder een
 * open venster lag. Bij het laatste venster in dat rijtje -- het venster dat
 * alles wist -- is dat geen schoonheidsfoutje.
 *
 * Gebouwd maar niet aangesloten, voor de vierde keer in deze branch.
 *
 * ── En waarom het een STAPEL werd ──────────────────────────────────────────
 * De helper bewaarde één handler en één 'vorige focus' in twee globale
 * variabelen. Dat gaat goed tot er een tweede venster over het eerste komt, en
 * dat gebeurt echt: het helppaneel heeft een link die het supportvenster
 * opent, en het paneel blijft eronder staan.
 *
 * Met één slot overschrijft het tweede venster de gegevens van het eerste. Bij
 * sluiten wordt dan de val van het HELPPANEEL opgeruimd terwijl dat paneel nog
 * openstaat -- en loopt Tab daar alsnog de pagina in. Precies de fout die deze
 * commit elders repareert, dan geïntroduceerd door de reparatie.
 *
 * Daarom een stapel: alleen de bovenste handler staat geregistreerd, en bij
 * sluiten gaat die eraf en de onderste er weer op.
 *
 * ── Wat hier getest wordt ──────────────────────────────────────────────────
 * De VORM in de bron. Het gedrag zelf (Tab-cirkel, Escape, focusherstel,
 * nesting) is in de browser nagemeten -- dat heeft een echte DOM nodig en die
 * is er in deze suite niet. Die metingen staan in de commitboodschap; deze test
 * zorgt dat de aansluiting blijft staan.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const dash = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');

/* Het lichaam van een functie pakken, zodat er per venster geoordeeld kan
   worden in plaats van op het bestand als geheel. Een controle op het hele
   bestand zegt "modalToetsenbord komt voor" en dat is precies wat er al gold
   toen vier vensters hem niet gebruikten. */
function lichaam(naam) {
  const start = dash.indexOf('function ' + naam + '(');
  if (start === -1) return null;
  /* Tot de volgende top-level functie of commentaarblok in kolom 0. */
  const rest = dash.slice(start + 10);
  const eind = rest.search(/\n(?:function |\/\* =|async function )/);
  return eind === -1 ? rest : rest.slice(0, eind);
}

/* [openfunctie, omschrijving, functie die hem sluit]. Die laatste is meestal
   dezelfde functie (de vier vensters bouwen hun overlay ter plekke en sluiten
   hem van binnenuit), maar het koopvenster staat al in het HTML en heeft een
   aparte closeKoopModal(). Een eerdere versie van deze test nam aan dat het
   altijd dezelfde functie was en meldde daardoor een venster fout dat het
   gewoon goed doet -- en zo'n melding klik je weg, waarna hij het echte geval
   ook niet meer vindt. */
const VENSTERS = [
  ['showConfirmModal',         'de algemene ja/nee-vraag',              'showConfirmModal'],
  ['toonSupportModal',         'het supportbericht',                    'toonSupportModal'],
  ['vraagBtwEnBetaal',         'het btw-nummer voor het afrekenen',     'vraagBtwEnBetaal'],
  ['vraagAccountVerwijdering', 'het wissen van je account',             'vraagAccountVerwijdering'],
  ['openKoopModal',            'credits bijkopen',                      'closeKoopModal'],
];

console.log('\n  elk venster zet de toetsenbordval aan');
for (const [naam, wat] of VENSTERS) {
  const body = lichaam(naam);
  ck(naam + ' bestaat', !!body, naam);
  if (!body) continue;
  ck(naam + ' (' + wat + ') roept modalToetsenbord aan',
    /modalToetsenbord\(/.test(body), null);
}

console.log('\n  en zet hem weer uit bij sluiten');
{
  /* Zonder modalToetsenbordUit() blijft de handler op document staan nadat het
     venster weg is: Escape op een lege pagina roept dan een sluit-functie aan
     van een venster dat niet meer bestaat, en de focus komt nooit terug. */
  for (const [naam, , sluiter] of VENSTERS) {
    const body = lichaam(sluiter);
    if (!body) continue;
    ck(sluiter + '() ruimt de val op' + (sluiter === naam ? '' : ' (sluit ' + naam + ')'),
      /modalToetsenbordUit\(\)/.test(body), null);
  }
}

console.log('\n  geen enkel venster registreert nog zijn eigen keydown');
{
  /* DIT is de regressie. Zet iemand er weer een eigen document-handler bij,
     dan werkt Escape nog steeds -- en ontbreekt de Tab-cirkel weer, zonder dat
     er iets stukgaat. */
  const eigen = [];
  for (const [naam] of VENSTERS) {
    const body = lichaam(naam);
    if (!body) continue;
    /* Enter mag: showConfirmModal bevestigt daarmee, en dat kan de gedeelde
       val niet. Wat NIET mag is een eigen handler die Escape of Tab afvangt --
       dan is de val er weer naast in plaats van aan. */
    for (const m of body.matchAll(/document\.addEventListener\('keydown', ([A-Za-z0-9_]+)/g)) {
      const hnaam = m[1];
      const h = new RegExp('function ' + hnaam + '\\(e\\) \\{[\\s\\S]{0,400}?\\n  \\}').exec(body)
             || new RegExp('function ' + hnaam + '\\(e\\) \\{[^}]*\\}').exec(body);
      const tekst = h ? h[0] : body;
      if (/'Escape'|'Tab'/.test(tekst)) eigen.push(naam + ' via ' + hnaam);
    }
  }
  ck('nul eigen keydown-registraties in de vensters', eigen.length === 0, eigen);
}

console.log('\n  de val is een stapel, geen enkel paar variabelen');
{
  ck('er is een stapel', /var _modalStapel = \[\];/.test(dash), null);
  ck('en geen losse _modalToetsHandler meer',
    !/var _modalToetsHandler = null;/.test(dash), null);
  ck('en geen losse _modalVorigeFocus meer',
    !/var _modalVorigeFocus = null;/.test(dash), null);

  const open = lichaam('modalToetsenbord');
  ck('openen haalt de handler eronder van de pagina',
    /var onder = _modalStapel\[_modalStapel\.length - 1\];\s*\n\s*if \(onder\) document\.removeEventListener\('keydown', onder\.handler, true\);/.test(open), null);
  ck('en legt zichzelf bovenop', /_modalStapel\.push\(laag\);/.test(open), null);

  const uit = lichaam('modalToetsenbordUit');
  ck('sluiten haalt de bovenste eraf', /var laag = _modalStapel\.pop\(\);/.test(uit), null);
  /* Dit is het hele punt van de stapel. Valt deze regel weg, dan verliest een
     openstaand paneel eronder stilletjes zijn val. */
  ck('en geeft het venster eronder zijn val terug',
    /var onder = _modalStapel\[_modalStapel\.length - 1\];\s*\n\s*if \(onder\) document\.addEventListener\('keydown', onder\.handler, true\);/.test(uit), null);
  ck('en geeft de focus terug aan wat dat venster onthield',
    /laag\.vorigeFocus/.test(uit), null);
}

console.log('\n  de voorwaarde "niet sluiten terwijl het loopt" is bewaard');
{
  /* Twee vensters mochten niet dicht terwijl er iets onderweg was. Die
     voorwaarde zat in hun eigen Escape-handler; bij het overzetten naar de
     gedeelde val kon hij makkelijk sneuvelen -- en dan kan je midden in een
     betaling of een accountverwijdering het venster wegtikken zonder te weten
     wat er nog loopt. */
  const sup = lichaam('toonSupportModal');
  ck('support sluit niet tijdens versturen',
    /function sluitAlsMag\(\) \{\s*\n?\s*if \(!stuurBtn\.disabled\) sluit\(\);/.test(sup), null);
  ck('en geeft die voorwaarde mee aan de val',
    /modalToetsenbord\(card, sluitAlsMag\)/.test(sup), null);

  const btw = lichaam('vraagBtwEnBetaal');
  ck('btw sluit niet tijdens het openen van de betaalpagina',
    /function sluitAlsMag\(\) \{ if \(!ga\.disabled\) sluit\(\); \}/.test(btw), null);
  ck('en geeft die voorwaarde mee aan de val',
    /modalToetsenbord\(card, sluitAlsMag\)/.test(btw), null);

  const del = lichaam('vraagAccountVerwijdering');
  ck('verwijderen sluit niet tijdens het wissen',
    /function sluitAlsMag\(\) \{ if \(!bevestig\.dataset\.bezig\) sluit\(\); \}/.test(del), null);
  ck('en geeft die voorwaarde mee aan de val',
    /modalToetsenbord\(card, sluitAlsMag\)/.test(del), null);
}

console.log('\n  Enter blijft bevestigen in het ja/nee-venster');
{
  /* De gedeelde val kent alleen Escape en Tab. showConfirmModal had Enter als
     bevestiging, en dat is geen detail: het venster focust met opzet de
     bevestigknop zodat Enter meteen werkt. */
  const cm = lichaam('showConfirmModal');
  ck('er is een aparte Enter-handler',
    /function enterHandler\(e\) \{\s*\n\s*if \(e\.key === 'Enter'\)/.test(cm), null);
  ck('die geregistreerd wordt', /document\.addEventListener\('keydown', enterHandler\);/.test(cm), null);
  ck('en weer opgeruimd', /document\.removeEventListener\('keydown', enterHandler\);/.test(cm), null);
}

console.log('\n  de knoppen van het ja/nee-venster spreken de taal van de pagina');
{
  const cm = lichaam('showConfirmModal');
  ck("annuleren valt terug op een vertaling", /cancelText \|\| tr\('btn\.annuleren'\)/.test(cm), null);
  ck("bevestigen ook", /confirmText \|\| tr\('cm\.gaDoor'\)/.test(cm), null);
  const i18n = require(path.join(BASE, 'api/_i18n.js'));
  for (const k of ['btn.annuleren', 'cm.gaDoor']) {
    const per = ['nl', 'fr', 'en', 'de'].map((l) => i18n.t(l, k));
    ck(k + ' bestaat in vier talen', per.every((w) => w && w !== k), per);
    ck(k + ' is echt vertaald', new Set(per).size === 4, per);
  }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
