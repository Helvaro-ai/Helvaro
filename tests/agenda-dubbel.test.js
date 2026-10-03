/*
 * Helvaro zet elke afspraak ook in de Google Agenda van de klant; die kopie kwam
 * er als aparte "Google"-afspraak overheen te liggen (Sindi, 2026-10-03: "why is
 * this like this"). Een Google-item dat bij een Helvaro-afspraak hoort verdwijnt;
 * een echte Google-afspraak van de klant blijft.
 */
'use strict';
const vm = require('vm');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
(async () => {
  console.log('\nAgenda: geen dubbele afspraak uit Google');
  const bron = require('../api/_dash/agenda.js').js();
  const dag = new Date(2026, 9, 3);
  const iso = (u, m) => new Date(2026, 9, 3, u, m).toISOString();
  const antwoord = {
    appointments: [
      { id: 'recA', fields: { 'Start Time': iso(12, 30), Duration: 30, 'Lead Name': 'k', Status: 'booked', Source: 'manual', 'Google Event ID': 'g-abc' } },
      { id: 'recB', fields: { 'Start Time': iso(15, 0), Duration: 30, 'Lead Name': 'oud', Status: 'booked', Source: 'manual' } },
    ],
    externalEvents: [
      { id: 'g-abc', title: 'Afspraak: k (Helvaro)', start: iso(12, 30), end: iso(13, 0) },          // zelfde id: weg
      { id: 'g-oud', title: 'Afspraak: oud (Helvaro)', start: iso(15, 0), end: iso(15, 30) },         // geen id, zelfde tijd + (Helvaro): weg
      { id: 'g-echt', title: 'Tandarts', start: iso(12, 30), end: iso(13, 0) },                        // echte Google-afspraak: blijft
      { id: 'g-prive', title: 'Bezet', start: iso(9, 0), end: iso(10, 0) },                            // privé: blijft, vertaald
    ],
  };
  const ctx = {
    console, Date, Math, JSON, String, Number, Map, Promise, Intl, Array, Object, parseInt,
    LOCALE: 'en-GB', API_BASE: '', state: { apiKey: 'x' },
    fetch: async () => ({ ok: true, json: async () => antwoord }),
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {}, readyState: 'complete' },
    tr: (k) => (k === 'cal.bezet' ? 'Busy' : k), escHtml: (s) => String(s),
    lokaleDatum: (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(),
  };
  vm.createContext(ctx);
  vm.runInContext(bron + '\n;this.__haal = calHaal;', ctx);
  const uit = await ctx.__haal([dag]);
  const namen = uit.map((e) => e.name);
  ck('de Helvaro-afspraak staat er één keer in', uit.filter((e) => e.name === 'k').length === 1 && !namen.includes('Afspraak: k (Helvaro)'), namen);
  ck('de oude afspraak zonder opgeslagen id ook niet dubbel', !namen.includes('Afspraak: oud (Helvaro)') && namen.includes('oud'), namen);
  ck('een echte Google-afspraak blijft staan', namen.includes('Tandarts'), namen);
  ck('"Bezet" komt vertaald', namen.includes('Busy') && !namen.includes('Bezet'), namen);
  ck('4 items: 2 van Helvaro, 2 echte van Google', uit.length === 4, uit.length);
  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
