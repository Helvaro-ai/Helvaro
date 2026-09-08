/*
 * Drie dingen die op de schermafbeeldingen van 8 september stuk stonden.
 *
 * ── 1. Een AutoScout24-link uitlezen mislukte altijd ────────────────────────
 * De dealer plakte een echte advertentielink en kreeg "Het uitlezen van die
 * pagina lukte niet". De pagina was WEL gelezen -- de logs zeggen 10.929
 * tekens, 3 json-ld, 2 foto's. Wat faalde was de validatie: zowel haiku als
 * sonnet gaven status "invalid".
 *
 * De oorzaak: het schema in api/_ai/prompts.js wordt in api/_ai/router.js
 * ALLEEN gebruikt om het antwoord achteraf te controleren. Het gaat nooit mee
 * naar de provider. Het model moest dus raden dat het JSON moest teruggeven,
 * hoe de velden heten, en dat brandstof letterlijk "plug-in hybride" moet zijn.
 *
 * pandImport deed dat al goed en somt zijn sleutels op. voertuigImport is
 * later bijgekomen en heeft dat nooit meegekregen.
 *
 * ── 2. Faro was leeg na het inloggen ────────────────────────────────────────
 * Wie Faro als laatste gebruikt had, landde er meteen weer in en zag een leeg
 * paneel. Geen gesprekken, geen context, geen activiteit, en geen foutmelding.
 *
 * faroInit draait op DOMContentLoaded en vraagt dan: is er iemand ingelogd?
 * Dat leest de klasse 'visible' op #dashboard-app, en die wordt pas gezet
 * NADAT de sessiecontrole terug is. Op dat moment dus nog niet. De drie loads
 * werden overgeslagen en niemand riep ze daarna nog aan.
 *
 * ── 3. "Vehicle toevoegen" ──────────────────────────────────────────────────
 * Het woord voor de markt was vertaald, het woord ernaast niet.
 */
'use strict';

const fs      = require('fs');
const path    = require('path');
const prompts = require('../api/_ai/prompts.js');
const i18n    = require('../api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};
const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* Commentaar telt niet als code: de uitleg bij deze reparaties citeert de oude
   fouten, en zonder deze stap slaat de test aan op zijn eigen verantwoording. */
const alleenCode = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');

/* ── 1. De voertuigimport vertelt het model het contract ─────────────────── */
console.log('\n— de voertuigimport geeft het model de sleutels en de waarden —');
{
  const sys = prompts.voertuigImport.system();

  ck('hij vraagt expliciet om JSON',
     /UITSLUITEND een JSON-object/.test(sys), sys.slice(0, 120));

  /* Elke sleutel uit het schema moet in de prompt genoemd worden. Dit is de
     controle die de hele bug had gevangen: het schema en de prompt liepen
     uiteen zonder dat iets dat merkte. */
  const schema = prompts.VOERTUIG_IMPORT_SCHEMA;
  ck('het schema is bereikbaar vanuit de test', !!schema && typeof schema === 'object', typeof schema);

  const ontbreekt = Object.keys(schema || {}).filter((k) => sys.indexOf('"' + k + '"') === -1);
  ck('elke schemasleutel staat in de prompt', ontbreekt.length === 0, 'mist: ' + ontbreekt.join(', '));

  /* En elke toegestane enumwaarde, want dáár liep een 250e PHEV op stuk:
     het model schrijft "Plug-in Hybride" en het schema wil "plug-in hybride". */
  const enums = [];
  for (const [veld, regel] of Object.entries(schema || {})) {
    if (regel && regel.enum) regel.enum.forEach((w) => enums.push([veld, w]));
  }
  ck('er zijn enumwaarden om te controleren', enums.length > 0, enums.length);

  /* Op de REGEL van dat veld, niet ergens in de prompt. Een eerdere versie
     zocht in de hele tekst en bleef groen toen "plug-in hybride" uit de
     opsomming verdween -- de waarde stond namelijk ook nog in de losse regel
     eronder ("Een 250e PHEV is ..."). Dat bewijst niet dat het model de
     volledige keuzelijst ziet, en dat is precies wat het nodig heeft. */
  const regelVan = (veld) => (sys.split('\n').find((r) => r.indexOf('"' + veld + '":') !== -1) || '');
  const missendeEnum = enums.filter(([veld, w]) => regelVan(veld).indexOf('"' + w + '"') === -1);
  ck('elke toegestane enumwaarde staat op de declaratieregel van zijn veld',
     missendeEnum.length === 0,
     'mist: ' + missendeEnum.map(([v, w]) => v + '=' + w).join(', '));

  /* De JSON-LD van de pagina moet meegestuurd worden. Op AutoScout24 staan
     merk, model, prijs en kilometerstand daarin; de gemeten pagina had er drie
     en ze gingen allemaal ongebruikt weg. */
  const u = prompts.voertuigImport.user({
    url: 'https://www.autoscout24.be/nl/aanbod/test',
    jsonLd: [{ '@type': 'Car', name: 'Test' }],
    meta: { 'og:title': 'Een titel' },
    text: 'de platte tekst van de pagina',
  });
  ck('de JSON-LD gaat mee naar het model', /JSON-LD/.test(u) && /"@type"/.test(u), u.slice(0, 160));
  ck('de metagegevens gaan mee', /og:title/.test(u), null);
  ck('de URL gaat mee', /^URL: https/.test(u), u.slice(0, 60));
  ck('de platte tekst gaat mee', /platte tekst van de pagina/.test(u), null);
}

/* ── 2. De afgekeurde poging is te zien in de logs ───────────────────────── */
console.log('\n— een afgekeurd modelantwoord zegt WAAROM —');
{
  const router = alleenCode(lees('api/_ai/router.js'));
  ck('de reden wordt gelogd en niet alleen weggestopt in de fout',
     /console\.warn\([^)]*reden/.test(router),
     'zonder dit staat er in de logs alleen "geen bruikbaar antwoord"');
  ck('en het model staat erbij, zodat je prompt en provider uit elkaar houdt',
     /console\.warn\(`\[ai\] \$\{task\} \$\{poging\.model\}/.test(router), null);
}

/* ── 3. Faro laadt alsnog zodra de sessie bevestigd is ───────────────────── */
console.log('\n— Faro haalt alsnog op zodra je binnen bent —');
{
  const client = alleenCode(lees('api/_faro/ui/client.js'));
  const dash   = alleenCode(lees('api/dashboard.js'));

  ck('faroNaLogin bestaat', /function faroNaLogin\(\)/.test(client), null);

  const fn = (client.match(/function faroNaLogin\(\)[\s\S]*?\n\}/) || [''])[0];
  ck('hij doet niets als er niemand binnen is', /if \(!faroIngelogd\(\)\) return;/.test(fn), fn.slice(0, 200));
  ck('hij doet niets als Faro dicht staat', /if \(!open\) return;/.test(fn), fn.slice(0, 300));
  for (const laad of ['faroLoadConversations', 'faroLoadContext', 'faroLoadActivity']) {
    ck(`hij haalt ${laad} alsnog op`, fn.indexOf(laad) !== -1, null);
  }

  /* Het aanroeppunt. Zonder dit is de functie dode code. */
  ck('startDashboard roept hem aan nadat de app zichtbaar is',
     /classList\.add\('visible'\);[\s\S]{0,400}faroNaLogin\(\)/.test(dash),
     'de aanroep staat niet (meer) na het zetten van visible');

  /* En de poort die dit nodig maakte moet blijven bestaan: verdwijnt hij,
     dan is deze reparatie zinloos geworden en mag iemand hem opnieuw wegen. */
  ck('de eenmalige inlogpoort in faroInit staat er nog',
     /if \(faroIngelogd\(\)\) \{[\s\S]{0,120}faroLoadConversations\(\);/.test(client), null);
}

/* ── 4. De modaltitel is niet half vertaald ──────────────────────────────── */
console.log('\n— de titel van de aanbodmodal is helemaal vertaald —');
{
  const dash = alleenCode(lees('api/dashboard.js'));
  ck("er staat geen hardgecodeerd ' toevoegen' meer achter vw('Een')",
     !/vw\('Een'\) \+ ' toevoegen'/.test(dash), null);
  ck("de titel gebruikt vw('toevoegen')",
     /pd-modal-title'\)\.textContent = pand[\s\S]{0,120}vw\('toevoegen'\)/.test(dash), null);

  /* En die sleutel moet in alle vier de talen een HELE zin zijn, niet één woord
     waar iemand later weer iets achter plakt. */
  for (const [markt, sleutel] of [['vastgoed', 'prop.add'], ['dealership', 'veh.add']]) {
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const v = i18n.t(taal, sleutel);
      ck(`${markt}/${taal}: "${v}" is vertaald`, !!v && v !== sleutel && v !== taal, v);
    }
  }
  /* De kern: op een Engels scherm mag er geen Nederlands woord in staan. */
  ck('de Engelse variant bevat geen "toevoegen"',
     !/toevoegen/i.test(i18n.t('en', 'veh.add')) && !/toevoegen/i.test(i18n.t('en', 'prop.add')),
     i18n.t('en', 'veh.add'));
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
