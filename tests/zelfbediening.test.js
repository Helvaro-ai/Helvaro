/*
 * Kan een klant van buiten naar betalend komen zonder dat er iemand aan te pas
 * komt?
 *
 * Deze test bewaakt precies één ding, en het is het duurste ding in de app: dat
 * er nergens meer een MAILTO staat op het moment dat iemand wil betalen. Elke
 * mailto op zo'n plek is een klant die moet wachten tot er iemand wakker is, en
 * die wacht niet.
 *
 * Er stonden er vier:
 *   - "Accounts worden voor je klaargezet, mail ons"   (inlogscherm)
 *   - "Upgrade nu"                                     (proefbanner)
 *   - "Heractiveer account"                            (verlopen proef)
 *   - "Limiet bereikt — vraag een upgrade aan"         (creditbalk in de zijbalk)
 *
 * De laatste twee zijn het ergst: die verschijnen exact wanneer de klant zelf
 * concludeert dat hij meer wil afnemen.
 */
const mod = require('../api/dashboard.js');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  cond ? pass++ : fail++;
}

let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

console.log('\n— geen mailto op een betaalmoment —');
// De teksten die aan zo'n mailto hingen. Komen ze terug, dan is er iets
// teruggedraaid zonder dat iemand het merkte.
const verboden = [
  ['Accounts worden voor je klaargezet', 'inlogscherm'],
  ['Reactivatie%20account',              'verlopen proefperiode'],
  ['Upgrade%20na%20proefperiode',        'lopende proefperiode'],
  ['Credit%20limiet%20verhogen',         'creditbalk in de zijbalk'],
];
for (const [tekst, waar] of verboden) {
  ck(`geen mailto meer bij: ${waar}`, html.indexOf(tekst) === -1 && js.indexOf(tekst) === -1, tekst);
}

console.log('\n— en er is wél een weg naar de plannen —');
/* Niet meer op de Nederlandse tekst pinnen: die knop is vertaalbaar geworden
   (tr('trial.cta')) omdat een Engelstalige klant anders "Bekijk de plannen"
   las. Wat hier bewaakt moet worden is de WEG naar de plannen, niet de taal
   waarin het knopje toevallig staat. */
ck('de proefbanner stuurt naar de plannen',
   /trial\.cta[\s\S]{0,240}naarPlannen/.test(js), null);
ck('de verlopen proefperiode ook',
   /Kies een plan[\s\S]{0,240}naarPlannen/.test(js), null);
/* De creditbalk in de zijbalk is nu een knop die een detailvenster opent (het
   percentage staat er altijd, de cijfers achter een klik). De weg naar de
   plannen zit daardoor IN dat venster in plaats van als losse link onder de
   balk -- de eis blijft dezelfde: wie door zijn credits heen is, kan van daar
   naar de plannen zonder te mailen. */
{
  const popFn = (js.match(/function tekenCreditPop\(\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('het detailvenster bestaat', popFn.length > 0, null);
  ck('en de creditbalk bij een bereikte limiet',
     /d\.overLimit/.test(popFn) && /creditPopPlannen/.test(popFn), null);
  ck('die knop gaat naar de plannen',
     /function creditPopPlannen\(\)[\s\S]{0,240}naarPlannen/.test(js), null);
  ck('en er staat ook een weg om bij te kopen',
     /creditPopBijkopen/.test(popFn)
     && /function creditPopBijkopen\(\)[\s\S]{0,160}openKoopModal/.test(js), null);
}
ck('naarPlannen bestaat', js.indexOf('function naarPlannen') !== -1);

console.log('\n— de plannen zijn te kiezen en te beheren —');
ck('er is een planblok op de facturatiepagina', html.indexOf('id="fa-plannen"') !== -1);
ck('de plannen worden bij de SERVER opgehaald', js.indexOf("mode: 'plan-list'") !== -1);
ck('kiezen start een betaling', js.indexOf("mode: 'plan-checkout'") !== -1);
ck('en beheren gaat naar het portaal van Stripe', js.indexOf("mode: 'billing-portal'") !== -1);

console.log('\n— de browser rekent geen prijzen uit —');
/* Zou de pagina zelf een prijs berekenen, dan is het getal dat de klant ziet
   ook het getal dat hij kan aanpassen. Alle bedragen horen van de server te
   komen.

   Commentaar telt NIET mee. Een eerdere versie van deze test sloeg aan op het
   woord "249,99" in een uitleg over waarom prijzen met centen getoond worden --
   een terechte melding op een verkeerde plek. Wat verboden is, is een prijs in
   UITVOERBARE code; erover schrijven is juist goed. */
const codeAlleen = js
  .replace(/\/\*[\s\S]*?\*\//g, ' ')     // blokcommentaar
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');  // regelcommentaar, maar niet http://
for (const bedrag of ['249.99', '249,99', '499', '799']) {
  ck(`geen planprijs "${bedrag}" in uitvoerbare code`,
     codeAlleen.indexOf(bedrag) === -1,
     (codeAlleen.match(new RegExp('.{0,70}' + bedrag.replace('.', '\\.') + '.{0,40}')) || [])[0]);
}
ck('geen creditaantal hardgecodeerd',
   !/credits\s*[:=]\s*(3000|10000|20000)\b/.test(codeAlleen), 'creditaantal staat in de frontend');

console.log('\n— de weg naar binnen —');
ck('registreren wacht op Clerk in plaats van meteen te falen',
   /await\s+clerkInit\(\)/.test(js));
ck('en valt terug op zelfaanmelden als Clerk uit staat',
   js.indexOf("'/onboard'") !== -1);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
