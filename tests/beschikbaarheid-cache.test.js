/*
 * Een nee van Airtable is geen nee voor altijd.
 *
 * ── Wat er op de live app gebeurde (2026-09-13) ─────────────────────────────
 * De Voorraad-pagina zei "de tabel vehicles bestaat nog niet in Airtable"
 * terwijl die tabel er gewoon stond. In het log: "[voertuigen] Airtable
 * onbereikbaar: This operation was aborted" -- één time-out bij een koude
 * start. available() onthield dat als false, voorgoed, voor de hele instance.
 *
 * Vier modules hadden hetzelfde patroon (voertuigen, panden, activiteit, de
 * Faro-opslag). Alle vier: een JA blijft, een NEE verloopt na dertig seconden,
 * en de reden gaat mee zodat een scherm "even niet" kan onderscheiden van
 * "nog inrichten".
 */
'use strict';

process.env.API_AIRTABLE = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const modules = [
  ['voertuigen', require('../api/_vehicles')],
  ['panden',     require('../api/_properties')],
  ['activiteit', require('../api/_activiteit')],
  ['faro/store', require('../api/_faro/store')],
];

const echteNow = Date.now;
let klok = 1_000_000;
Date.now = () => klok;

(async () => {
  for (const [naam, mod] of modules) {
    console.log(`\n— ${naam} —`);
    mod._resetAvailability();

    /* 1. een afgebroken verzoek */
    let aanroepen = 0;
    global.fetch = async () => { aanroepen++; const e = new Error('This operation was aborted'); e.name = 'AbortError'; throw e; };
    ck('een time-out geeft nee', (await mod.available()) === false);
    ck('met reden onbereikbaar', mod.onbeschikbaarReden() === 'onbereikbaar', mod.onbeschikbaarReden());

    /* 2. binnen de dertig seconden wordt niet opnieuw gevraagd */
    klok += 5_000;
    await mod.available();
    ck('binnen 30 s geen tweede verzoek', aanroepen === 1, aanroepen);

    /* 3. na dertig seconden wel, en dan is Airtable er gewoon */
    klok += 30_000;
    global.fetch = async () => { aanroepen++; return { ok: true, status: 200, json: async () => ({ records: [] }) }; };
    ck('na 30 s wordt opnieuw gekeken en is het ja', (await mod.available()) === true, aanroepen);
    ck('en de reden is leeg', mod.onbeschikbaarReden() === '');

    /* 4. een ja blijft, ook als Airtable daarna omvalt */
    global.fetch = async () => { throw new Error('nee'); };
    klok += 60_000;
    ck('een ja wordt niet meer nagevraagd', (await mod.available()) === true);

    /* 5. een 404 is wél "geen tabel" */
    mod._resetAvailability();
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await mod.available();
    ck('een 404 geeft reden geen_tabel', mod.onbeschikbaarReden() === 'geen_tabel', mod.onbeschikbaarReden());
    mod._resetAvailability();
  }

  Date.now = echteNow;
  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
