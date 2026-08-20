/*
 * Bewaakt de afspraak dat AI-aanroepen via de router lopen.
 *
 * Een router die je kunt omzeilen is geen router: dan staat de modelkeuze weer
 * verspreid, valt het verbruik buiten de boekhouding, en werkt uitwijken niet
 * voor de plek die hem het hardst nodig heeft.
 *
 * Deze test leest de BRON, want dat is de enige manier om te zien of iemand er
 * een fetch naast heeft gezet.
 */
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..', 'api');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

function lees(rel) { return fs.readFileSync(path.join(API, rel), 'utf8'); }

/* Bestanden die de router MOETEN gebruiken en dus geen eigen provideraanroep
   horen te hebben. admin.js staat er (nog) niet bij -- zie de TODO onderaan. */
const GEMIGREERD = ['whatsapp.js', 'leads.js', 'cron-followup.js'];

console.log('\n— gemigreerde bestanden bellen geen provider meer rechtstreeks —');
for (const f of GEMIGREERD) {
  const src = lees(f);
  ck(`${f} roept Anthropic niet rechtstreeks aan`, src.indexOf('api.anthropic.com') === -1, f);
  ck(`${f} gebruikt de router`, /require\('\.\/_ai'\)/.test(src), f);
}

console.log('\n— elke module die gebruikt wordt, wordt ook geimporteerd —');
/* Precies de fout die hier gemaakt is: _ai werd aangeroepen in
   cron-followup.js terwijl de require er niet in stond. Dat crasht niet bij
   het laden -- alleen wanneer de cron draait, dus 's nachts en zonder
   toeschouwer. */
for (const f of GEMIGREERD) {
  const src = lees(f);
  const gebruikt = /\b_ai\s*\./.test(src);
  const geimporteerd = /const\s+_ai\s*=\s*require\('\.\/_ai'\)/.test(src);
  ck(`${f}: _ai gebruikt (${gebruikt}) en geimporteerd (${geimporteerd})`,
     !gebruikt || geimporteerd, { f, gebruikt, geimporteerd });
}

console.log('\n— de router-modules laden zonder omgeving —');
for (const m of ['_ai', '_ai/registry', '_ai/tasks', '_ai/router', '_ai/usage',
                 '_ai/validate', '_ai/qualification', '_ai/prompts', '_ai/providers']) {
  let ok = true, fout = '';
  try { require(path.join(API, m)); } catch (e) { ok = false; fout = e.message.slice(0, 90); }
  ck(`${m} laadt`, ok, fout);
}

console.log('\n— de router is de enige plek die een providerdomein kent —');
/* Buiten de adapters mag geen enkel bestand een AI-endpoint noemen. Beeld en
   video hebben hun eigen, aparte pijplijn (_images.js, _video-adapters.js) --
   die staan hier los van omdat ze geen tekstmodel aanroepen. */
const uitgezonderd = new Set([
  '_ai/providers/index.js',      // de adapters zelf
  '_images.js',                  // beeldpijplijn, eigen weg
  '_media-models.js',            // het beeld/video-register
  '_video-adapters.js',          // videopijplijn
  '_faro/providers/claude.js',   // streaming-adapters van de chatwerkomgeving
  '_faro/providers/openai.js',
  'admin.js',                    // nog niet gemigreerd, zie TODO
]);

function loopDoor(dir, prefix = '') {
  const uit = [];
  for (const naam of fs.readdirSync(dir)) {
    const vol = path.join(dir, naam);
    const rel = prefix ? prefix + '/' + naam : naam;
    if (fs.statSync(vol).isDirectory()) uit.push(...loopDoor(vol, rel));
    else if (naam.endsWith('.js')) uit.push(rel);
  }
  return uit;
}

const overtreders = loopDoor(API)
  .filter((rel) => !uitgezonderd.has(rel))
  .filter((rel) => /api\.anthropic\.com|api\.openai\.com\/v1\/chat/.test(lees(rel)));

ck('geen enkel ander bestand belt een tekstmodel rechtstreeks',
   overtreders.length === 0, overtreders);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);

/* TODO: api/admin.js heeft nog vijf directe Anthropic-aanroepen (de
   founder-tools: ai-chat, ai-advice, personalized-dm, content-post en de
   signup-guard). Die zijn niet gemigreerd omdat ze Helvaro's eigen
   back-office zijn, geen klantverkeer: ze draaien op jouw tenant, niet op die
   van een makelaar, en ze staan in een bestand van 137 KB dat ik niet in
   dezelfde beweging wilde openbreken. Zet ze in de GEMIGREERD-lijst zodra ze
   over zijn. */
