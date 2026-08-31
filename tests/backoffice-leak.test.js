/*
 * De back-office van Helvaro mag niet in de HTML van een klant staan.
 *
 * Klanten en Founder zijn pagina's van HELVARO, niet van de makelaar. Er staat
 * in: de MRR, de vaste en variabele kosten, de nettowinst, de prijslijst
 * (EUR 1.000/maand), de contractvoorwaarden, de roadmap, de namen en
 * takenlijsten van de oprichters, en een tabel met alle klanten.
 *
 * Eerder werden alleen de NAV-KNOPPEN client-side weggelaten voor niet-admins.
 * De pagina's zelf gingen mee in de HTML die iedereen kreeg. navigateTo(
 * 'founder') vanuit de console toonde alles -- en zelfs dat hoefde niet:
 * "paginabron bekijken" volstond. Deze test bestaat zodat dat niet stilletjes
 * terugkomt.
 */
const dashboard = require('../api/dashboard.js');
const strip = dashboard.stripBackoffice;

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

/* Een miniatuur van de echte pagina: dezelfde markeringen, dezelfde soort
   inhoud. De echte HTML is 1 MB; wat deze functie moet doen hangt alleen van
   die markeringen af. */
const HTML = [
  '<body>',
  '<main class="page-content page active" id="page-dashboard">De leads van de klant</main>',
  '<main class="page-content page" id="page-admin">',
  '  <div>Klantenoverzicht, MRR per klant</div>',
  '</main>',
  '<main class="page-content page" id="page-pipeline">Kanban</main>',
  '<main class="page-content page" id="page-founder">',
  '  <div>Roadmap naar 5 klanten</div>',
  '  <div>Nettowinst EUR 0 - Vaste kosten -EUR 58</div>',
  '  <div>Prijslijst: Helvaro EUR 1.000/maand</div>',
  '  <div>Klantcontracten, 3 maanden + maandelijks</div>',
  '</main>',
  '<main class="page-content page" id="page-kosten">',
  '  <div>Vercel Pro USD 20/maand, Airtable Team USD 24/maand</div>',
  '  <div>ANTHROPIC_API_KEY gezet</div>',
  '</main>',
  '<main class="page-content page" id="page-instellingen">Instellingen</main>',
  '</body>',
].join('\n');

console.log('\n- wat een KLANT krijgt -');
const klant = strip(HTML);

for (const geheim of [
  /* Kosten kwam er later bij: leverancierstarieven en de vraag welke sleutels
     gezet zijn horen net zo min bij een makelaar als de MRR. */
  'Vercel Pro',
  'Airtable Team',
  'ANTHROPIC_API_KEY',
  'Roadmap naar 5 klanten',
  'Nettowinst',
  'Vaste kosten',
  '1.000/maand',
  'Klantcontracten',
  'Klantenoverzicht',
  'MRR per klant',
]) {
  ck(`"${geheim}" staat er niet meer in`, klant.indexOf(geheim) === -1, geheim);
}

ck('de founder-pagina bestaat niet meer', klant.indexOf('id="page-founder"') === -1, null);
ck('de kostenpagina ook niet', klant.indexOf('id="page-kosten"') === -1, null);
ck('de klanten-pagina ook niet',          klant.indexOf('id="page-admin"') === -1, null);

console.log('\n- en de app blijft heel -');
for (const eigen of ['id="page-dashboard"', 'id="page-pipeline"', 'id="page-instellingen"', 'De leads van de klant', 'Kanban']) {
  ck(`"${eigen}" staat er nog`, klant.indexOf(eigen) !== -1, eigen);
}
// De <main>-tags moeten in balans blijven: half wegknippen breekt de pagina.
const open = (klant.match(/<main/g) || []).length;
const dicht = (klant.match(/<\/main>/g) || []).length;
ck('evenveel <main> als </main>', open === dicht, { open, dicht });
ck('er blijven precies drie pagina\'s over', open === 3, open);

console.log('\n- HELVARO zelf krijgt alles wel -');
// De handler geeft de ongeknipte HTML door als de sessie admin is; hier
// controleren we dat strip() de enige knipper is en niets anders wegvalt.
ck('de ongeknipte HTML heeft de founder-pagina', HTML.indexOf('id="page-founder"') !== -1, null);
ck('en die is groter dan de geknipte', HTML.length > klant.length, { heel: HTML.length, geknipt: klant.length });

console.log('\n- randgevallen -');
ck('HTML zonder back-office blijft ongemoeid',
   strip('<main id="page-dashboard">x</main>') === '<main id="page-dashboard">x</main>', null);
ck('twee keer knippen verandert niets meer', strip(klant) === klant, null);
// Liever niets doen dan half knippen.
const kapot = '<main class="page-content page" id="page-founder">geen sluittag';
ck('een blok zonder sluittag wordt met rust gelaten', strip(kapot) === kapot, null);

/* ── Leaddata hoort niet in een gedeelde cache ──────────────────────────────
   Zonder eigen header zet Vercel "public, max-age=0, must-revalidate" neer.
   must-revalidate voorkomt verouderde data, maar "public" staat een gedeelde
   cache -- een CDN, een bedrijfsproxy -- toe het antwoord OP TE SLAAN. En dit
   antwoord bevat namen en telefoonnummers.

   Gevonden doordat een tweede verzoek zonder cookies in de browser een 200 met
   leads teruggaf, terwijl dezelfde aanvraag buiten de browser 401 gaf. */
console.log('\n— leaddata is niet cachebaar —');
{
  const headers = {};
  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status() { return this; }, json() { return this; }, end() { return this; },
  };
  const leads = require('../api/leads.js');
  // OPTIONS is de goedkoopste weg langs de handler: hij zet de headers en stopt.
  leads({ method: 'OPTIONS', headers: {}, url: '/api/leads' }, res);

  const cc = headers['cache-control'] || '';
  ck('er staat een eigen Cache-Control op', !!cc, cc || '(geen)');
  ck('en die is private, niet public', cc.indexOf('private') > -1 && cc.indexOf('public') === -1, cc);
  /* no-store, niet no-cache: no-cache staat opslaan nog toe zolang er
     gerevalideerd wordt, en op een gedeelde computer is die kopie op schijf
     nu juist het probleem. */
  ck('en verbiedt opslaan, niet alleen hergebruik', cc.indexOf('no-store') > -1, cc);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
