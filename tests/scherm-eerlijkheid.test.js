/*
 * Zegt het scherm de waarheid?
 *
 * Deze test bewaakt één soort fout, en het is de soort die je pas ontdekt als
 * je hem al vertrouwd hebt: een scherm dat iets beweert wat niet gebeurd is.
 *
 *   - Een export waarvan de filters alleen de VOORBEELDWEERGAVE aanpasten. Je
 *     koos "laatste 7 dagen, alleen gekwalificeerd", las "4 leads geselecteerd",
 *     klikte downloaden, en kreeg alle 380.
 *   - Twee opslagknoppen zonder foutafhandeling, terwijl de schermstatus AL was
 *     bijgewerkt. Mislukte het bewaren, dan stond het resultaat gewoon op je
 *     scherm. Precies het veld waar de omzetcijfers op Analyse uit komen.
 *   - Een ontkoppelknop met een lege catch die daarna hoe dan ook "gelukt"
 *     meldde -- terwijl je Google-koppeling nog actief was.
 *   - Een kalender die een klant met NUL leads feliciteert dat al zijn
 *     gekwalificeerde leads een afspraak hebben.
 *
 * Alles wordt gecontroleerd op de UITGESTUURDE pagina, niet op de bron: het
 * hele dashboard is één sjabloonliteral, en wat daar staat is niet
 * noodzakelijk wat de browser krijgt.
 */
const mod = require('../api/dashboard.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 200));
  ok ? pass++ : fail++;
};

let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— de export levert wat je aanvinkte —');
ck('de filters gaan mee naar de server',
   /mode: 'csv-export',[\s\S]{0,200}periode:[\s\S]{0,80}status:/.test(html), null);
ck('en ze komen uit dezelfde velden als de telling op het scherm',
   /export-period/.test(html) && /export-status/.test(html), null);

/* De server moet ze ook echt toepassen. Zonder deze helft is het bovenstaande
   een lege belofte. */
const fs = require('fs');
const leadsBron = fs.readFileSync(require('path').join(__dirname, '..', 'api', 'leads.js'), 'utf8');
const csvBlok = leadsBron.slice(leadsBron.indexOf("if (body.mode === 'csv-export')"),
                               leadsBron.indexOf("if (body.mode === 'csv-export')") + 4000);
ck('de server filtert op periode', /grens !== null/.test(csvBlok), null);
ck('de server filtert op status', /statusFilter === 'qualified'/.test(csvBlok), null);
/* Dezelfde drempel als op het scherm (qualified === true OF score >= 7).
   Loopt die uiteen, dan klopt de telling weer niet met het bestand. */
ck('met dezelfde drempel als het scherm', /score >= 7/.test(csvBlok), null);
ck('en het scherm gebruikt die drempel ook', /leadScore >= 7/.test(html), null);

console.log('\n— een mislukte opslag ziet er niet uit als een geslaagde —');
ck('saveAfspraak vangt fouten op', /Opslaan mislukt, probeer opnieuw/.test(html), null);
ck('en zet de knop weer aan', /finally \{[\s\S]{0,120}knop\.disabled = false/.test(html), null);
ck('setVerschenen zet de knopstand terug bij een fout',
   /jaBtn\.className  = jaWas/.test(html), null);
ck('Google ontkoppelen meldt een fout in plaats van succes',
   /Ontkoppelen mislukt/.test(html), null);
/* De lege catch was het echte probleem: die slikte alles en meldde daarna
   succes. Hij mag niet terugkomen. */
ck('en de lege catch is weg', html.indexOf('} catch (e) {}\n  loadGcalStatus();') === -1, null);

console.log('\n— een nieuwe klant krijgt uitleg, geen felicitatie —');
ck('de kalender feliciteert niet bij nul leads',
   /Nog geen leads\. Zodra de AI/.test(html), null);
ck('en zegt nog steeds het juiste als er WEL leads zijn',
   /Alle gekwalificeerde leads hebben een afspraak/.test(html), null);
ck('Gesprekken zegt wat er moet gebeuren', /Nog geen gesprekken/.test(html), null);
ck('met de knop die er al was', /Nog geen gesprekken[\s\S]{0,300}emptyStateCta\(\)/.test(html), null);
/* Commentaar telt NIET mee. Er staat een uitleg in de bron over precies deze
   tekst -- waarom die pagina ooit leeg bleef door een veldnaam die nergens
   gezet werd. Daarover schrijven is juist goed; wat verboden is, is de tekst
   als UITVOER. Dezelfde val als bij de prijzen in tests/zelfbediening. */
const codeAlleen = html
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
ck('en "Geen gesprekken gevonden" staat niet meer in de uitvoer',
   codeAlleen.indexOf('Geen gesprekken gevonden') === -1,
   (codeAlleen.match(/.{0,70}Geen gesprekken gevonden.{0,40}/) || [])[0]);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
