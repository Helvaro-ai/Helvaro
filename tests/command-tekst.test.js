/*
 * Het Command Center in de taal van de klant (api/_command-tekst.js).
 * De eerste regel van Faro -- "Je grootste kans vandaag" -- stond voor een
 * Engelstalige dealer in het Nederlands.
 */
'use strict';
const cmd = require('../api/_command.js');
const tekst = require('../api/_command-tekst.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`); ok ? pass++ : fail++; };

const nu = Date.now(), dag = 86400000;
const gesprek = JSON.stringify([{ role: 'assistant', content: 'Hallo', ts: nu - 6 * dag }, { role: 'user', content: 'Ja graag', ts: nu - 6 * dag + 60000 }, { role: 'assistant', content: 'Wanneer past het?', ts: nu - 6 * dag + 120000 }]);
const lead = (o) => Object.assign({ id: 'r1', naam: 'Marie Declercq', telefoon: '+32470111111', qualified: true, afspraakGeboekt: false, leadScore: 9, urgentie: 'Hoog', verwachteWaarde: '475000', datum: new Date(nu - 10 * dag).toISOString(), gesprek }, o || {});
const leads = [lead(), lead({ id: 'r2', naam: 'Jonas Peeters', leadScore: 5, urgentie: 'Middel', verwachteWaarde: '300000' })];

const nl = cmd.build(leads, { appointmentsToday: 1 });
console.log('\nNederlands blijft zoals het was');
ck('zonder taal is het resultaat gelijk', JSON.stringify(cmd.build(leads, { appointmentsToday: 1, lang: 'nl' })) === JSON.stringify(nl));
ck('de Nederlandse kop is er nog', !nl.briefing.top || /koper|lead/.test(nl.briefing.top.line), nl.briefing.top && nl.briefing.top.line);

for (const taal of ['en', 'fr', 'de']) {
  console.log('\n' + taal);
  const v = cmd.build(leads, { appointmentsToday: 1, lang: taal });
  const alles = JSON.stringify(v);
  ck('geen Nederlandse categorienaam meer', !/Zet weer in gang|Hoge prioriteit|Dreigt af te koelen|Afgekoeld|Wacht op jou|Opvolgen"|Bellen"/.test(alles), (alles.match(/Zet weer in gang|Hoge prioriteit|Dreigt af te koelen|Afgekoeld|Wacht op jou/) || [])[0]);
  ck('geen Nederlandse reden meer', !/Sterk gekwalificeerde koper|Gekwalificeerd en nog in gesprek|reageert al|dagen stil|Bovengemiddeld/.test(alles));
  ck('de kop is vertaald en noemt de naam', v.briefing.top && !/ is een | koper/.test(v.briefing.top.line) && /Marie|Jonas/.test(v.briefing.top.line), v.briefing.top && v.briefing.top.line);
  ck('namen en id\'s blijven ongemoeid', v.opportunities.every((o) => /^r\d/.test(o.id)) && v.opportunities.some((o) => /Marie|Jonas/.test(o.name)));
  ck('de aantallen blijven gelijk', v.totalOpportunities === nl.totalOpportunities && v.overview.potentialPipeline === nl.overview.potentialPipeline);
}

console.log('\nPatronen');
ck('dagen stil (en)', tekst.zin('Gekwalificeerd maar al 7 dagen stil.', 'en') === 'Qualified but silent for 7 days.');
ck('reden met getal (de)', tekst.zin('Was betrokken, maar reageert al 5 dagen niet meer.', 'de') === 'War engagiert, antwortet aber seit 5 Tagen nicht mehr.');
ck('een onbekende zin blijft staan in plaats van te breken', tekst.zin('Een nieuwe zin die nog niet in de tabel staat.', 'en') === 'Een nieuwe zin die nog niet in de tabel staat.');
ck('een onbekende taal laat alles zoals het was', tekst.vertaal(nl, 'pl') === nl);
ck('niets in de tabel noemt het woord "AI" tegenover de klant', !/\bAI\b|\bIA\b|\bKI\b/.test(JSON.stringify(Object.values(tekst.VAST).map((x) => x.join(' ')))));

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
