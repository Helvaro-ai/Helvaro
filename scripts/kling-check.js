#!/usr/bin/env node
'use strict';
/*
 * Klopt de Kling-adapter met de echte API?
 *
 * api/_kling.js is geschreven zonder toegang tot Kling's documentatie -- de
 * bouwmachine kan api.klingai.com niet bereiken. Zes aannames (A1 tot A6) staan
 * daar met naam en toenaam in de kop. Dit script controleert ze in één echte
 * aanroep en zegt per aanname of hij klopt.
 *
 *   node scripts/kling-check.js            controleert alleen A1-A4
 *   node scripts/kling-check.js --wacht    wacht ook op de video (A5), duurt
 *                                          een paar minuten en KOST GELD
 *
 * Zonder --wacht wordt er wel een opdracht ingestuurd. Die kost ook geld: een
 * video van vijf seconden is ongeveer een halve euro. Dat is met opzet, want
 * een controle die niets echt instuurt bewijst niets over A2 en A3.
 *
 * Draai dit VOORDAT je video aanzet voor klanten. Faalt er iets, dan zegt de
 * uitvoer welke aanname het is en wat Kling in plaats daarvan terugstuurde --
 * dat is genoeg om de adapter in vijf minuten recht te zetten.
 */

const path = require('path');
const K = require(path.join(__dirname, '..', 'api', '_kling.js'));

const WACHT = process.argv.includes('--wacht');

let goed = 0, fout = 0;
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

function ok(aanname, wat)  { goed++; console.log(`  ${g('OK  ')} ${aanname}  ${wat}`); }
function nee(aanname, wat, detail) {
  fout++;
  console.log(`  ${r('FOUT')} ${aanname}  ${wat}`);
  if (detail) console.log(d('        ' + String(detail).replace(/\n/g, '\n        ').slice(0, 600)));
}

(async () => {
  console.log('\nKling-controle — er wordt ECHT een opdracht ingestuurd, en die kost geld.\n');
  console.log(d(`  endpoint  ${K.BASIS}`));
  console.log(d(`  modus     ${WACHT ? 'wacht op de video (A5 wordt ook gecontroleerd)' : 'alleen insturen (A1-A4)'}\n`));

  // ── A1: de sleutels en het token ──────────────────────────────────────────
  if (!K.configured()) {
    nee('A1', 'KLING_ACCESS_KEY / KLING_SECRET_KEY ontbreken',
        'Zet ze in je omgeving, of draai met `vercel env pull .env.local` en `node --env-file=.env.local scripts/kling-check.js`.');
    console.log(`\n${goed} goed, ${fout} fout\n`);
    process.exit(1);
  }
  try {
    const t = K.maakToken();
    ok('A1', `token gemaakt (${t.split('.').length} delen, ${t.length} tekens)`);
  } catch (e) {
    nee('A1', 'token maken mislukt', e.message);
    process.exit(1);
  }

  // ── A2 + A3: een opdracht insturen ────────────────────────────────────────
  let jobId = null;
  try {
    const uit = await K.kling.submit({
      prompt: 'Een rustige panoramische opname van een moderne woonkamer met daglicht.',
      seconds: 5,
      size: '1280x720',
    });
    jobId = uit.providerJobId;
    ok('A2', 'het endpoint bestaat en accepteerde de opdracht');
    ok('A3', `er kwam een task_id terug  ${d(jobId)}`);
  } catch (e) {
    if (e.code === 'bad_response') {
      nee('A3', 'Kling gaf geen JSON terug', `HTTP ${e.httpStatus}\n${e.body}`);
    } else if (e.code === 'rejected') {
      nee('A2/A3', `Kling weigerde: ${e.message}`,
          `Kijk of het endpoint klopt (A2) en of je account het model mag gebruiken.\n${e.body || ''}`);
    } else if (e.code === 'no_task_id') {
      nee('A3', 'geen task_id in het antwoord', e.body);
    } else {
      nee('A2', 'de aanroep mislukte', e.message);
    }
    console.log(`\n${goed} goed, ${fout} fout\n`);
    process.exit(1);
  }

  // ── A4: de status opvragen ────────────────────────────────────────────────
  let eerste;
  try {
    eerste = await K.kling.poll({ providerJobId: jobId });
    if (eerste.state === 'failed' && /A5/.test(eerste.error || '')) {
      nee('A5', eerste.error);
    } else {
      ok('A4', `status opgevraagd  ${d(eerste.state)}`);
    }
  } catch (e) {
    nee('A4', 'status opvragen mislukte', e.message);
    console.log(`\n${goed} goed, ${fout} fout\n`);
    process.exit(1);
  }

  if (!WACHT) {
    console.log(`\n${d('A5 (de video zelf) is niet gecontroleerd. Draai met --wacht om dat wel te doen.')}`);
    console.log(`${d('De opdracht loopt nu door bij Kling; je kunt hem daar in het dashboard terugvinden.')}`);
    console.log(`\n${goed} goed, ${fout} fout\n`);
    process.exit(fout ? 1 : 0);
  }

  // ── A5: wachten op de video ───────────────────────────────────────────────
  console.log(d('\n  wachten op de video, dit duurt meestal 1 tot 3 minuten...'));
  const start = Date.now();
  const MAX_MS = 10 * 60 * 1000;
  let laatsteStand = '';

  while (Date.now() - start < MAX_MS) {
    await new Promise((res) => setTimeout(res, 10000));
    let uit;
    try {
      uit = await K.kling.poll({ providerJobId: jobId });
    } catch (e) {
      nee('A4', 'status opvragen mislukte halverwege', e.message);
      break;
    }
    if (uit.state !== laatsteStand) {
      laatsteStand = uit.state;
      console.log(d(`  ${Math.round((Date.now() - start) / 1000)}s  ${uit.state}`));
    }
    if (uit.state === 'ready') {
      ok('A5', `video klaar  ${d(uit.url)}`);
      break;
    }
    if (uit.state === 'failed') {
      nee('A5', 'Kling meldt mislukt', uit.error);
      break;
    }
  }
  if (laatsteStand !== 'ready' && !fout) {
    nee('A5', `na ${Math.round((Date.now() - start) / 1000)}s nog niet klaar`,
        'Dat hoeft geen fout te zijn -- druk is druk. Kijk in het Kling-dashboard of de opdracht er staat.');
  }

  console.log(`\n${goed} goed, ${fout} fout\n`);
  if (fout) {
    console.log('Elke aanname staat met naam en uitleg in de kop van api/_kling.js.');
    console.log('Pas daar de vorm aan die niet klopte, en draai dit script opnieuw.\n');
  }
  process.exit(fout ? 1 : 0);
})();
