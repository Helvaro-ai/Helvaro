/*
 * De projectfiche: wat een aannemer moet weten voor hij in de auto stapt.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Bouw, keuken en renovatie hebben geen catalogus. Een lead wijst niet naar
 * een pand of een wagen die al bestaat -- het ding moet nog gemaakt worden, en
 * de prijs hangt volledig af van wat iemand precies wil.
 *
 * Het gevolg is een ander soort verspilling dan bij de andere markten. Niet
 * "de auto was net weg", maar: de aannemer rijdt drie kwartier naar een
 * plaatsbezoek en hoort daar pas dat het een huurwoning is, of dat het budget
 * de helft is van wat dit werk kost. Dat is een halve dag.
 *
 * Wat hier bewaakt wordt:
 *
 *  1. HET BUDGET KLOPT. Dit ging bijna mis op de meest Belgische manier die er
 *     is: de eerste versie las "15.000" als vijftien, omdat hij de punt als
 *     decimaalteken behandelde. Een budget dat duizend keer te laag binnenkomt
 *     is erger dan geen budget -- de aannemer schrijft de lead af zonder te
 *     weten waarom.
 *
 *  2. LEEG BLIJFT LEEG. Een tweede bericht met alleen een budget mag niet
 *     wissen wat er in het eerste al aan plaats en omvang stond. Een gesprek
 *     loopt over meerdere berichten.
 *
 *  3. "KLAAR" IS NIET "ALLES INGEVULD". Soort, plaats en beslisser zijn de
 *     drie waar een aannemer zijn dag op inricht. Omvang en budget scherpen de
 *     offerte aan maar houden een plaatsbezoek niet tegen -- die eisen zou
 *     betekenen dat een prima lead als onvolledig wordt weggezet.
 */
'use strict';
const project = require('../api/_project');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

console.log('\n  het budget komt binnen zoals het bedoeld was');
{
  const b = (v) => { const p = project.normaliseer({ soort: 'x', budget: v }); return p ? p.budget : null; };
  /* De punt is hier de DUIZENDTALSCHEIDER. Dit is de test die er het meest toe
     doet van dit hele bestand. */
  ck('15.000 is vijftienduizend, niet vijftien', b('15.000') === 15000, b('15.000'));
  ck('15 000 met een spatie ook',                b('15 000') === 15000, b('15 000'));
  ck('en met een euroteken ervoor',              b('€ 15.000') === 15000, b('€ 15.000'));
  ck('gewoon 15000 blijft 15000',                b('15000') === 15000, b('15000'));
  /* Centen bestaan niet in een verbouwingsbudget. De staart eraf, en vooral:
     niet als extra duizendtallen meetellen. */
  ck('15.000,50 wordt 15000 en niet 1500050',    b('15.000,50') === 15000, b('15.000,50'));
  /* En de Engelse schrijfwijze, want een model dat JSON schrijft levert een
     GETAL af en String(15000.5) is "15000.5". Zonder de punt in de
     staart-regex wordt dat 150005 -- tien keer te veel. Deze regel ontbrak, en
     een mutatie die de punt eruit haalde bleef daardoor groen. */
  ck('15000.5 is niet honderdvijftigduizend', b('15000.5') === 15000, b('15000.5'));
  ck('en 15000.50 ook niet',                  b('15000.50') === 15000, b('15000.50'));
  ck('een echt getal met decimalen ook niet', b(15000.5) === 15000, b(15000.5));
  ck('15k is ook vijftienduizend',               b('15k') === 15000, b('15k'));
  ck('12,5k is twaalfeneenhalf duizend',         b('12,5k') === 12500, b('12,5k'));
  ck('een zin eromheen mag',                     b('ongeveer 20.000 euro') === 20000, b('ongeveer 20.000 euro'));
  ck('1500 blijft 1500 -- geen duizendtal',      b('1500') === 1500, b('1500'));

  /* "Geen idee" is een geldig antwoord en hoort GEEN getal te worden. */
  ck('geen idee levert niets op', b('geen idee') === null, b('geen idee'));
  ck('leeg ook',                  b('') === null, b(''));
  /* Een minteken betekent onzin. Zonder de guard maakt het strippen van
     niet-cijfers er stilletjes 5 van, en dat ziet er in het dashboard uit als
     een echt (belachelijk laag) budget. */
  ck('een negatief bedrag is geen bedrag', b('-5') === null, b('-5'));
}

console.log('\n  wat niet klopt valt weg, de rest blijft staan');
{
  const p = project.normaliseer({ soort: 'dak', wanneer: 'binnenkort', beslisser: 'de buurman' });
  ck('een onbekende termijn valt weg', p && p.wanneer === '', p && p.wanneer);
  ck('een onbekende beslisser ook',    p && p.beslisser === '', p && p.beslisser);
  /* Wegvallen en niet de hele fiche laten mislukken: een half ingevulde fiche
     is bruikbaar, een geweigerde niet. */
  ck('maar de rest blijft overeind',   p && p.soort === 'dak', p && p.soort);

  ck('een lege fiche is null', project.normaliseer({}) === null);
  ck('en onzin ook',           project.normaliseer('nee') === null);

  for (const t of project.TERMIJNEN) {
    const q = project.normaliseer({ wanneer: t });
    ck("de termijn '" + t + "' wordt aanvaard", q && q.wanneer === t, q && q.wanneer);
  }
}

console.log('\n  een tweede bericht vult aan, het wist niet');
{
  const eerst = project.naarNotities('{"property":"A12"}',
    project.normaliseer({ soort: 'badkamer', plaats: 'Gent' }));
  const daarna = project.naarNotities(eerst, project.normaliseer({ budget: 9000 }));
  const uit = project.uitNotities(daarna);
  ck('het budget is erbij gekomen', uit && uit.budget === 9000, uit && uit.budget);
  ck('en plaats staat er nog',      uit && uit.plaats === 'Gent', uit && uit.plaats);
  ck('en soort ook',                uit && uit.soort === 'badkamer', uit && uit.soort);
  /* De blob is gedeeld: de aanbodcode van een andere markt mag er niet door
     sneuvelen. */
  ck('en wat er al in de blob stond blijft', JSON.parse(daarna).property === 'A12', JSON.parse(daarna).property);

  /* Een fiche die niets nieuws zegt mag niets kapotmaken. */
  const leeg = project.naarNotities(daarna, null);
  ck('een lege fiche laat alles staan', project.uitNotities(leeg).plaats === 'Gent');
}

console.log('\n  "klaar" betekent: je kunt erheen');
{
  const vol = project.normaliseer({ soort: 'keuken', plaats: 'Gent', omvang: '12 m2',
                                    budget: 15000, wanneer: 'kwartaal', beslisser: 'eigenaar' });
  const v1 = project.volledigheid(vol);
  ck('alles ingevuld telt zes van zes', v1.ingevuld === 6 && v1.mist.length === 0, v1);
  ck('en is klaar', v1.klaar === true);

  /* De drie die een dag bepalen: wat, waar, en mag deze persoon beslissen.
     Zonder omvang en budget kun je nog steeds langsgaan. */
  const drie = project.normaliseer({ soort: 'keuken', plaats: 'Gent', beslisser: 'eigenaar' });
  const v2 = project.volledigheid(drie);
  ck('soort + plaats + beslisser is genoeg om te gaan', v2.klaar === true, v2);
  ck('maar de fiche heet niet compleet', v2.ingevuld === 3, v2.ingevuld);
  ck('en zegt wat er nog mist', v2.mist.join(',') === 'omvang,budget,wanneer', v2.mist);

  /* Wie niet mag beslissen is geen afspraak waard zonder de eigenaar erbij --
     dat is de vraag die niemand stelt en die de meeste ritten kost. */
  const zonder = project.normaliseer({ soort: 'keuken', plaats: 'Gent' });
  ck('zonder beslisser niet klaar', project.volledigheid(zonder).klaar === false);

  ck('geen fiche telt als nul', project.volledigheid(null).ingevuld === 0);
}

console.log('\n  de regel die een mens leest');
{
  const p = project.normaliseer({ soort: 'nieuwe keuken', plaats: 'Gent', omvang: '12 m2',
                                  budget: 15000, wanneer: 'kwartaal', beslisser: 'eigenaar' });
  const r = project.omschrijf(p);
  ck('het budget staat er leesbaar in', /15\.000 euro/.test(r), r);
  ck('en de termijn in woorden',        /binnen drie maanden/.test(r), r);

  /* Een huurder krijgt een waarschuwing en geen label. Dit is het ene ding
     waarvan je wil dat het opvalt voor iemand vertrekt. */
  const h = project.normaliseer({ soort: 'badkamer', beslisser: 'huurder' });
  ck('een huurder valt op', /LET OP/.test(project.omschrijf(h)), project.omschrijf(h));
  ck('een lege fiche geeft een lege regel', project.omschrijf(null) === '');
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
