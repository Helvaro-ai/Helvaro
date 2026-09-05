/*
 * De wachtrij per klant moet zichzelf opruimen.
 *
 * ── Wat er misging ──────────────────────────────────────────────────────────
 * api/_credits.js zet de afschrijvingen van DEZELFDE klant achter elkaar, want
 * recordUsage() is lezen-wijzigen-schrijven en twee overlappende beurten laten
 * anders één afschrijving verdampen. Die rij is een Map van projectcode naar
 * een beloftenketting, en het commentaar erboven zegt met zoveel woorden dat
 * hij wordt opgeruimd "anders groeit de Map met elke klant die ooit iets
 * verbruikt heeft".
 *
 * Dat opruimen is nooit één keer gebeurd:
 *
 *     _queues.set(code, next.catch(() => {}));
 *     next.catch(() => {}).then(() => { if (_queues.get(code) === next.catch(() => {})) ... });
 *
 * Elke .catch() maakt een NIEUWE belofte. Er werden dus twee verschillende
 * objecten vergeleken en de voorwaarde was altijd onwaar. Een lek dat begrensd
 * is door het aantal klanten -- klein, maar het deed het omgekeerde van wat er
 * stond, en dat is hoe je een codebase niet meer kunt vertrouwen.
 *
 * api/whatsapp.js doet het in opDeRij() wel goed: de stille variant één keer
 * maken, bewaren, en dáármee vergelijken.
 *
 * ── Waarom dit gedrag toetst en geen tekst ──────────────────────────────────
 * Deze test draait de echte recordUsage() en kijkt of de Map daarna leeg is.
 * Een grep op het patroon zou groen blijven bij elke variant die er goed
 * uitziet en niet werkt -- precies wat hier gebeurde.
 */
'use strict';

const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

/* Geen Airtable-gegevens zetten: recordUsageInner() stopt dan meteen, maar
   serialize() eromheen draait wel -- en dat is precies wat hier getoetst
   wordt. Geen enkele netwerkaanroep. */
delete process.env.API_AIRTABLE;
delete process.env.BASE_AIRTABLE;

const credits = require(BASE + 'api/_credits.js');

/* Wachten tot alle beloften in de rij afgehandeld zijn. setTimeout(0) is
   genoeg: alles hier is microtask-werk zonder echte I/O. */
const rust = () => new Promise((r) => setTimeout(r, 10));

(async () => {
  console.log('\nDe wachtrij per klant groeit niet eindeloos');

  ck('de rij begint leeg', credits._queueDepth() === 0, credits._queueDepth());

  console.log('\n  na één afschrijving is de rij weer leeg');
  {
    await credits.recordUsage('TESTKLANT', 'faro_chat', { credits: 1 });
    await rust();
    ck('geen achtergebleven regel', credits._queueDepth() === 0, credits._queueDepth());
  }

  console.log('\n  ook na veel klanten achter elkaar');
  {
    for (let i = 0; i < 25; i++) {
      await credits.recordUsage('KLANT' + i, 'faro_chat', { credits: 1 });
    }
    await rust();
    /* Dit is de regel die het echte lek zou vangen: 25 klanten, 25 regels die
       blijven staan. Met de fout erin stond hier 25. */
    ck('25 klanten laten niets achter', credits._queueDepth() === 0, credits._queueDepth());
  }

  console.log('\n  en na overlappende aanroepen voor dezelfde klant');
  {
    /* Niet awaiten: juist de overlap is waar de rij voor bestaat. */
    const drie = [
      credits.recordUsage('DRUKKEKLANT', 'faro_chat', { credits: 1 }),
      credits.recordUsage('DRUKKEKLANT', 'faro_chat', { credits: 1 }),
      credits.recordUsage('DRUKKEKLANT', 'faro_chat', { credits: 1 }),
    ];
    ck('tijdens het werk staat er precies één regel voor die klant',
      credits._queueDepth() === 1, credits._queueDepth());
    await Promise.all(drie);
    await rust();
    ck('en daarna is hij weg', credits._queueDepth() === 0, credits._queueDepth());
  }

  console.log('\n  een mislukking blokkeert de rij niet en laat niets achter');
  {
    /* De ketting vangt fouten bewust af, anders zou één mislukte afschrijving
       alle volgende van die klant blokkeren. */
    await credits.recordUsage('STUKKEKLANT', 'faro_chat', { credits: 1 });
    await credits.recordUsage('STUKKEKLANT', 'faro_chat', { credits: 1 });
    await rust();
    ck('ook dan leeg', credits._queueDepth() === 0, credits._queueDepth());
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST ZELF STUK:', e); process.exit(1); });
