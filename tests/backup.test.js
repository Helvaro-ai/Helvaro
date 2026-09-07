/*
 * De backup moet compleet zijn, of luid zeggen dat hij het niet is.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Alles wat Helvaro weet staat in Airtable. Er was geen enkele manier om daar
 * een kopie van te maken; de revisiegeschiedenis per record helpt niet tegen
 * het geval waar je een backup voor nodig hebt (een base die leeggegooid
 * wordt, een automation die de verkeerde kant op loopt, een account dat dicht
 * gaat).
 *
 * ── Wat hier getoetst wordt, en waarom juist dat ────────────────────────────
 * De duurste fout van een backup is niet "hij faalt". Het is "hij lijkt
 * gelukt". Twee manieren waarop dat gebeurt, en beide worden hier afgedekt:
 *
 *   1. Een tabel die er later bijkomt wordt overgeslagen. Daarom vraagt het
 *      script het schema op in plaats van een lijst id's mee te dragen -- en
 *      als dat schema niet op te halen is, STOPT het, in plaats van een halve
 *      backup te maken die eruitziet als een hele.
 *   2. Eén tabel mislukt en de rest slaagt. Dan is het bestand er wel, maar
 *      klopt de inhoud niet. Dat moet een exitcode 1 opleveren en
 *      `volledig: false` in het overzicht.
 *
 * Draait tegen een nagebootste Airtable: geen sleutels, geen netwerk, en het
 * echte script in een echt subproces.
 */
'use strict';

const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const { execFileSync } = require('child_process');

const BASE   = path.join(__dirname, '..');
const SCRIPT = path.join(BASE, 'scripts', 'airtable-backup.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

/* Het script draaien met een fetch die we zelf schrijven. --require laadt een
   klein bestandje dat global.fetch vervangt vóór het script begint. */
function draai(nepFetch, argv = [], env = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-backup-'));
  const shim = path.join(tmp, 'shim.js');
  fs.writeFileSync(shim, `global.fetch = ${nepFetch};`);
  try {
    const uit = execFileSync(process.execPath, ['--require', shim, SCRIPT, ...argv], {
      env: { ...process.env, API_AIRTABLE: 'nep-token', BASE_AIRTABLE: 'appNEP', ...env },
      encoding: 'utf8', stdio: 'pipe',
    });
    return { code: 0, uit, tmp };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, uit: (e.stdout || '') + (e.stderr || ''), tmp };
  }
}

/* De haakjes eromheen zijn niet cosmetisch. Zonder is `async () => { ok: ... }`
   een BLOK en geen object-literal, en dan gooit de shim bij het laden. Het
   script eindigt dan ook met exitcode 1 -- dus een test die alleen op die
   exitcode kijkt wordt groen om precies de verkeerde reden. Dat gebeurde hier
   tijdens het schrijven, en het is dezelfde soort valse groen waar
   HELVARO-ARCHITECTUUR.md §7 voor waarschuwt. */
const antwoord = (obj, ok = true, status = 200) =>
  `({ ok: ${ok}, status: ${status}, json: async () => (${JSON.stringify(obj)}), text: async () => ${JSON.stringify(JSON.stringify(obj))} })`;

console.log('\nDe backup is compleet, of zegt luid dat hij het niet is');

console.log('\n  zonder sleutels doet hij niets');
{
  const r = draai('async () => ' + antwoord({}), [], { API_AIRTABLE: '', BASE_AIRTABLE: '' });
  ck('stopt met exitcode 1', r.code === 1, r.code);
  ck('en zegt welke variabelen ontbreken', /API_AIRTABLE en\/of BASE_AIRTABLE ontbreken/.test(r.uit), r.uit);
}

console.log('\n  een schema dat niet op te halen is, stopt de backup');
{
  /* Dit is de belangrijkste regel van het hele script: liever geen backup dan
     een halve die eruitziet als een hele. */
  const r = draai(`async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'geen scope' })`);
  ck('exitcode 1', r.code === 1, r.code);
  ck('en het zegt met zoveel woorden dat het gestopt is',
    /GESTOPT/.test(r.uit) && /Liever geen backup/.test(r.uit), r.uit);
  ck('en legt bij een 403 uit welke scope er mist',
    /schema\.bases:read/.test(r.uit), r.uit);
}

console.log('\n  nul tabellen is verdacht, geen succes');
{
  const r = draai('async () => ' + antwoord({ tables: [] }));
  ck('exitcode 1', r.code === 1, r.code);
  ck('en niet "compleet"', !/Compleet\./.test(r.uit), r.uit);
}

console.log('\n  de gelukkige weg schrijft alles weg');
{
  const uitMap = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-uit-'));
  /* Twee tabellen, en de eerste heeft twee pagina's — zo wordt ook de
     paginering echt doorlopen in plaats van alleen de eerste 100. */
  const nep = `async (url) => {
    if (url.includes('/meta/bases/')) return ${antwoord({ tables: [
      { id: 'tblAAA', name: 'Leads', fields: [{}, {}] },
      { id: 'tblBBB', name: 'Client Config', fields: [{}] },
    ] })};
    if (url.includes('tblAAA') && !url.includes('offset=')) return ${antwoord({ records: [{ id: 'rec1' }, { id: 'rec2' }], offset: 'pag2' })};
    if (url.includes('tblAAA')) return ${antwoord({ records: [{ id: 'rec3' }] })};
    return ${antwoord({ records: [{ id: 'recX' }] })};
  }`;
  const r = draai(nep, ['--uit', uitMap]);
  ck('exitcode 0', r.code === 0, r.uit);
  ck('meldt het totaal over alle tabellen', /4 record\(s\) uit 2\/2 tabel\(len\)/.test(r.uit), r.uit);
  ck('en zegt Compleet', /Compleet\./.test(r.uit), r.uit);

  const mappen = fs.readdirSync(uitMap);
  ck('er staat een map met een tijdstempel', mappen.length === 1, mappen);
  const bestanden = fs.readdirSync(path.join(uitMap, mappen[0]));
  ck('met een bestand per tabel plus een overzicht',
    bestanden.length === 3 && bestanden.includes('_overzicht.json'), bestanden);

  const ov = JSON.parse(fs.readFileSync(path.join(uitMap, mappen[0], '_overzicht.json'), 'utf8'));
  ck('het overzicht zegt volledig: true', ov.volledig === true, ov);
  ck('en telt 4 records', ov.totaalRecords === 4, ov);

  /* De paginering: tblAAA had 2+1 records over twee pagina's. Staat er 2, dan
     is de tweede pagina stil verdwenen -- precies het soort verlies dat je
     pas ontdekt als je de backup nodig hebt. */
  const leads = JSON.parse(fs.readFileSync(path.join(uitMap, mappen[0],
    bestanden.find((b) => b.startsWith('tblAAA'))), 'utf8'));
  ck('de tweede pagina is meegenomen', leads.records.length === 3, leads.records.length);
}

console.log('\n  één mislukte tabel maakt de hele backup onbetrouwbaar');
{
  const uitMap = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-uit2-'));
  const nep = `async (url) => {
    if (url.includes('/meta/bases/')) return ${antwoord({ tables: [
      { id: 'tblAAA', name: 'Leads', fields: [{}] },
      { id: 'tblSTUK', name: 'Kapot', fields: [{}] },
    ] })};
    if (url.includes('tblSTUK')) return { ok: false, status: 500, json: async () => ({}), text: async () => 'boem' };
    return ${antwoord({ records: [{ id: 'rec1' }] })};
  }`;
  const r = draai(nep, ['--uit', uitMap]);
  ck('exitcode 1, ook al slaagde de rest', r.code === 1, r.code);
  ck('en het zegt welke tabel het was', /Kapot/.test(r.uit) && /niet compleet/.test(r.uit), r.uit);

  const mappen = fs.readdirSync(uitMap);
  const ov = JSON.parse(fs.readFileSync(path.join(uitMap, mappen[0], '_overzicht.json'), 'utf8'));
  ck('het overzicht zegt volledig: false', ov.volledig === false, ov);
}

console.log('\n  --check kijkt alleen');
{
  const uitMap = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-uit3-'));
  const r = draai('async () => ' + antwoord({ tables: [{ id: 'tblAAA', name: 'Leads', fields: [{}] }] }),
                  ['--check', '--uit', uitMap]);
  ck('exitcode 0', r.code === 0, r.uit);
  ck('en er is niets weggeschreven', fs.readdirSync(uitMap).length === 0, fs.readdirSync(uitMap));
}

console.log('\n  het script schrijft nooit naar Airtable');
{
  /* Een backup die kan schrijven is geen backup meer maar een risico. */
  const bron = fs.readFileSync(SCRIPT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  ck('geen POST/PATCH/DELETE in het script',
    !/method:\s*['"](POST|PATCH|DELETE|PUT)['"]/i.test(bron), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
