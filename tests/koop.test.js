/*
 * api/_koop.js -- koopinformatie opschonen (financiering, termijn, intentie,
 * budget, inruil) en veilig terugschrijven in de Notities-blob.
 *
 * Puur bestand, geen fetch: alles hier is gewoon input -> output.
 */
'use strict';

const koop = require('../api/_koop.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

console.log('\n— normaliseer: enums —');
{
  ck('onbekende financiering-waarde wordt weggegooid (niet gecrasht, gewoon leeg)',
     koop.normaliseer({ financiering: 'bitcoin', budget: 5000 }).financiering === '',
     JSON.stringify(koop.normaliseer({ financiering: 'bitcoin', budget: 5000 })));

  ck('onbekende termijn-waarde wordt weggegooid',
     koop.normaliseer({ termijn: 'ooit-misschien', budget: 5000 }).termijn === '', null);

  ck('onbekende intentie-waarde wordt weggegooid',
     koop.normaliseer({ intentie: 'gemiddeld-plus', budget: 5000 }).intentie === '', null);

  ck('geldige financiering wordt bewaard en gelowercased',
     koop.normaliseer({ financiering: 'CASH' }).financiering === 'cash', null);

  ck('geldige termijn in hoofdletters wordt gelowercased',
     koop.normaliseer({ termijn: 'KORT' }).termijn === 'kort', null);

  ck('inruil-merk en -model worden gelowercased',
     koop.normaliseer({ inruil: { merk: 'BMW', model: 'X5' } }).inruil.merk === 'bmw'
       && koop.normaliseer({ inruil: { merk: 'BMW', model: 'X5' } }).inruil.model === 'x5', null);
}

console.log('\n— normaliseer: getallen ─ eindig en >= 0 —');
{
  /* Elk geval krijgt ook `intentie: 'sterk'` mee, zodat het object niet
     helemaal null wordt en we echt het BUDGET-veld apart kunnen aflezen. */
  ck('negatief budget is ongeldig -> null',
     koop.normaliseer({ intentie: 'sterk', budget: -100 }).budget === null, null);

  ck('niet-numeriek budget is ongeldig -> null',
     koop.normaliseer({ intentie: 'sterk', budget: 'heel veel geld' }).budget === null, null);

  ck('budget 0 is een geldige waarde (niet hetzelfde als "niets ingevuld")',
     koop.normaliseer({ budget: 0 }) !== null && koop.normaliseer({ budget: 0 }).budget === 0, null);

  ck('geldig budget als string wordt een getal',
     koop.normaliseer({ budget: '15000' }).budget === 15000, null);

  ck('negatief maandbudget is ongeldig -> null',
     koop.normaliseer({ intentie: 'sterk', maandbudget: -1 }).maandbudget === null, null);

  ck('NaN/Infinity komen er nooit doorheen',
     koop.normaliseer({ intentie: 'sterk', budget: NaN }).budget === null
       && koop.normaliseer({ intentie: 'sterk', budget: Infinity }).budget === null, null);
}

console.log('\n— normaliseer: jaar-bereik van de inruilwagen —');
{
  ck('jaar 1949 (net onder de grens) wordt geschrapt',
     koop.normaliseer({ inruil: { merk: 'bmw', jaar: 1949 } }).inruil.jaar === undefined, null);

  ck('jaar 1950 (ondergrens) wordt bewaard',
     koop.normaliseer({ inruil: { merk: 'bmw', jaar: 1950 } }).inruil.jaar === 1950, null);

  ck('jaar 2100 (bovengrens) wordt bewaard',
     koop.normaliseer({ inruil: { merk: 'bmw', jaar: 2100 } }).inruil.jaar === 2100, null);

  ck('jaar 2101 (net boven de grens) wordt geschrapt',
     koop.normaliseer({ inruil: { merk: 'bmw', jaar: 2101 } }).inruil.jaar === undefined, null);

  ck('een redelijk jaar blijft gewoon staan',
     koop.normaliseer({ inruil: { merk: 'bmw', jaar: 2019 } }).inruil.jaar === 2019, null);
}

console.log('\n— normaliseer: leeg blijft leeg —');
{
  ck('een leeg object geeft null', koop.normaliseer({}) === null, null);
  ck('null geeft null', koop.normaliseer(null) === null, null);
  ck('undefined geeft null', koop.normaliseer(undefined) === null, null);
  ck('een string in plaats van een object geeft null', koop.normaliseer('geen object') === null, null);
  ck('alleen onbekende enums en een lege inruil geeft nog steeds null',
     koop.normaliseer({ financiering: 'x', termijn: 'y', inruil: {} }) === null, null);
}

console.log('\n— uitNotities —');
{
  ck('platte tekst (geen JSON) geeft null', koop.uitNotities('gewoon een notitie van de verkoper') === null, null);
  ck('kapotte JSON geeft null', koop.uitNotities('{"koop": {financiering: cash}') === null, null);
  ck('lege string geeft null', koop.uitNotities('') === null, null);
  ck('geen argument geeft null', koop.uitNotities(undefined) === null, null);

  const blob = JSON.stringify({ _v: 1, notes: [], tasks: [], calls: [], koop: { financiering: 'cash', budget: 20000 } });
  const eruit = koop.uitNotities(blob);
  ck('een geldige blob geeft de koopinfo terug',
     eruit !== null && eruit.financiering === 'cash' && eruit.budget === 20000, JSON.stringify(eruit));

  const blobZonderKoop = JSON.stringify({ _v: 1, notes: [{ id: 'n1' }] });
  ck('een geldige blob zonder koop-sleutel geeft null (normaliseer(undefined))',
     koop.uitNotities(blobZonderKoop) === null, null);
}

console.log('\n— naarNotities: samenvoegen zonder te slopen —');
{
  const bestaand = JSON.stringify({
    _v: 1,
    notes: [{ id: 'n1', text: 'belde terug', ts: '2026-09-01T10:00:00.000Z' }],
    tasks: [{ id: 't1', text: 'contract opsturen' }],
    calls: [{ id: 'c1' }],
    property: { ref: 'P-123' },
    wens: { merk: 'audi', model: 'a4' },
  });

  const uit = koop.naarNotities(bestaand, { financiering: 'cash', budget: 25000 });
  ck('naarNotities levert een string op als er iets verandert', typeof uit === 'string', uit);
  const geparsed = JSON.parse(uit);

  ck('notes blijven intact', JSON.stringify(geparsed.notes) === JSON.stringify(JSON.parse(bestaand).notes), null);
  ck('tasks blijven intact', JSON.stringify(geparsed.tasks) === JSON.stringify(JSON.parse(bestaand).tasks), null);
  ck('property blijft intact', JSON.stringify(geparsed.property) === JSON.stringify({ ref: 'P-123' }), null);
  ck('wens blijft intact', JSON.stringify(geparsed.wens) === JSON.stringify({ merk: 'audi', model: 'a4' }), null);
  ck('koop staat er nu bij', geparsed.koop.financiering === 'cash' && geparsed.koop.budget === 25000, null);
  ck('koopAt is een ISO-tijdstip', typeof geparsed.koopAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(geparsed.koopAt), geparsed.koopAt);

  ck('geen wijziging (onbruikbare koop) -> null',
     koop.naarNotities(bestaand, {}) === null, null);

  const tweedeKeer = koop.naarNotities(uit, { financiering: 'cash', budget: 25000 });
  ck('dezelfde koopinfo nog een keer opslaan verandert niets -> null', tweedeKeer === null, tweedeKeer);

  const anders = koop.naarNotities(uit, { financiering: 'cash', budget: 26000 });
  ck('een echt andere koopinfo geeft wel weer een string', typeof anders === 'string', anders);
}

console.log('\n— omschrijf bevat nooit "undefined", "null" of "NaN" —');
{
  const gevallen = [
    koop.omschrijf({}),
    koop.omschrijf(null),
    koop.omschrijf(undefined),
    koop.omschrijf({ budget: 'abc', maandbudget: NaN }),
    koop.omschrijf({ financiering: 'onbekend-goedje', termijn: 'x' }),
    koop.omschrijf({ inruil: {} }),
    koop.omschrijf({ inruil: { staat: 'gedeukt' } }),
    koop.omschrijf({ financiering: 'cash', termijn: 'kort', intentie: 'sterk', budget: 15000, maandbudget: 400, inruil: { merk: 'bmw' } }),
  ];
  for (const [i, s] of gevallen.entries()) {
    ck(`geval ${i + 1}: "${s}" bevat geen undefined/null/NaN`,
       !/undefined|null|NaN/.test(s), s);
  }
  ck('omschrijf geeft altijd een string terug, nooit iets anders',
     gevallen.every((s) => typeof s === 'string'), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
