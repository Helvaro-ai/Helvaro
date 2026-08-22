/*
 * Twee dingen die een lead stilletjes kwijtraken.
 *
 * ── 1. Twee berichten tegelijk ──────────────────────────────────────────────
 * Zo typen mensen op WhatsApp: "hey", en vijf seconden later "over dat huis in
 * de Lange Violettestraat". De verwerking van beurt 1 wacht 25 tot 55 seconden
 * (de menselijke vertraging) voordat er iets weggeschreven wordt. Beurt 2 las
 * in die tijd dezelfde lege geschiedenis, antwoordde apart, en schreef er
 * overheen. Gevolg: twee antwoorden op een gesprek dat geen van beide heel
 * gezien heeft, en één beurt voorgoed weg uit de geschiedenis.
 *
 * ── 2. Een spraakbericht ────────────────────────────────────────────────────
 * `if (message.type !== 'text') return;` -- geen antwoord, geen regel in de
 * geschiedenis, geen spoor op het dashboard. Voor de lead is het bedrijf
 * gewoon gestopt met antwoorden.
 *
 * Beide worden hier tegen de ECHTE bron getest, niet tegen een nabouw: de
 * wachtrij wordt uit api/whatsapp.js geknipt en gedraaid, en de handler-code
 * wordt op de vorm gecontroleerd. Een nabouw zou alleen bewijzen dat mijn kopie
 * werkt.
 */
const fs = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const bron = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// ── De wachtrij, uit de bron ────────────────────────────────────────────────
const START = 'const _gesprekRijen = new Map();';
const EIND  = '  return volgende;\n}';
const i = bron.indexOf(START);
const j = bron.indexOf(EIND, i);
ck('de wachtrij staat nog in api/whatsapp.js', i !== -1 && j > i, { i, j });

/* leadCacheKey en _leadCache zitten elders in het bestand; die worden hier
   nagemaakt omdat we alleen de VOLGORDE testen, niet de cache zelf. Wel wordt
   bijgehouden dát hij geleegd wordt -- want zonder dat leest beurt 2 alsnog de
   geschiedenis van vóór het antwoord van beurt 1, en is de wachtrij zinloos. */
const gewist = [];
const maak = new Function('_leadCache', 'leadCacheKey', `${bron.slice(i, j + EIND.length)}; return opDeRij;`);
const opDeRij = maak(
  { delete: (k) => gewist.push(k) },
  (tel, code) => `${tel}::${code || ''}`,
);

(async () => {
  console.log('\n— twee berichten van dezelfde lead lopen niet door elkaar —');
  const volgorde = [];
  const traag = (naam, ms) => async () => {
    volgorde.push(`${naam}-start`);
    await new Promise((r) => setTimeout(r, ms));
    volgorde.push(`${naam}-klaar`);
    return naam;
  };

  // Beurt 1 duurt lang (de menselijke vertraging), beurt 2 is kort.
  const p1 = opDeRij('32470123456', 'TENANT_A', traag('beurt1', 60));
  const p2 = opDeRij('32470123456', 'TENANT_A', traag('beurt2', 5));
  await Promise.all([p1, p2]);

  ck('beurt 2 begint pas als beurt 1 klaar is',
     volgorde.join(' ') === 'beurt1-start beurt1-klaar beurt2-start beurt2-klaar', volgorde);
  ck('en de leadcache wordt tussendoor geleegd', gewist.length >= 2, gewist);

  console.log('\n— maar twee VERSCHILLENDE leads wachten niet op elkaar —');
  /* Zou dit ook serialiseren, dan zou één traag gesprek elke andere lead van
     dat kantoor ophouden. De sleutel moet dus per gesprek zijn, niet per klant. */
  const parallel = [];
  const t0 = Date.now();
  await Promise.all([
    opDeRij('32470111111', 'TENANT_A', async () => { await new Promise((r) => setTimeout(r, 40)); parallel.push('a'); }),
    opDeRij('32470222222', 'TENANT_A', async () => { await new Promise((r) => setTimeout(r, 40)); parallel.push('b'); }),
  ]);
  ck('ze lopen samen, niet na elkaar', Date.now() - t0 < 75, Date.now() - t0);

  console.log('\n— en twee kantoren met hetzelfde nummer ook niet —');
  /* Eén telefoonnummer kan bij twee makelaars als lead bekend staan. Dat zijn
     twee gesprekken, geen één. */
  const tA = [], tB = [];
  const t1 = Date.now();
  await Promise.all([
    opDeRij('32470333333', 'TENANT_A', async () => { await new Promise((r) => setTimeout(r, 40)); tA.push('a'); }),
    opDeRij('32470333333', 'TENANT_B', async () => { await new Promise((r) => setTimeout(r, 40)); tB.push('b'); }),
  ]);
  ck('aparte rijen per tenant', Date.now() - t1 < 75, Date.now() - t1);

  console.log('\n— een stukgelopen beurt blokkeert de volgende niet —');
  let daarna = false;
  const kapot = opDeRij('32470444444', 'TENANT_A', async () => { throw new Error('stuk'); });
  await kapot.catch(() => {});
  await opDeRij('32470444444', 'TENANT_A', async () => { daarna = true; });
  ck('het bericht erna wordt gewoon verwerkt', daarna === true);

  console.log('\n— de rij groeit niet mee met elke lead ooit —');
  for (let n = 0; n < 20; n++) {
    await opDeRij(`3247099${n}`, 'TENANT_A', async () => {});
  }
  const rijen = new Function('_leadCache', 'leadCacheKey',
    `${bron.slice(i, j + EIND.length)}; return _gesprekRijen;`)({ delete() {} }, () => '');
  ck('afgeronde gesprekken worden opgeruimd', rijen.size === 0, rijen.size);

  console.log('\n— een spraakbericht krijgt een antwoord —');
  ck('niet-tekstberichten worden niet meer weggegooid',
     bron.indexOf("if (!message || message.type !== 'text') { await eventWork; return; }") === -1, null);
  ck('een spraakbericht wordt herkend', /audio:\s*'een spraakbericht'/.test(bron));
  ck('een foto ook', /image:\s*'een foto'/.test(bron));
  ck('de AI krijgt te horen dat hij de inhoud NIET kan zien',
     /NIET zien of beluisteren/.test(bron));
  ck('en het gaat langs de gewone weg, dus de geschiedenis en de taal kloppen',
     /const text  = nietTekst \|\| sanitize/.test(bron));
  /* Een reactie-emoji of systeembericht is geen bericht van de lead. Daar hoort
     geen antwoord op, en dat moet een bewuste keuze blijven en geen gat. */
  ck('een onbekend berichttype wordt bewust overgeslagen',
     /berichttype "\$\{message\.type\}" overgeslagen/.test(bron));

  console.log('\n— en alles loopt nog door dezelfde wachtrij —');
  ck('de tekstweg gebruikt hem', /opDeRij\(phone, scopedProjectCode/.test(bron));
  ck('en er is geen tweede, ongereguleerde aanroep blijven staan',
     (bron.match(/= processMessage\(/g) || []).length === 0,
     (bron.match(/.{0,40}= processMessage\(.{0,20}/g) || []));

  console.log('\n— een gehallucineerd tijdstip boekt niets —');
  /* "morgen om 14u" is truthy, dus de enige poort (`appt.start`) liet het door.
     Daarna rekent de dubbelboekingscontrole met NaN -- elke vergelijking is
     false, dus die laat het OOK door -- en het afspraak-id wordt
     "TELJO-aNNaNNaN". De lead leest intussen keurig "bevestigd voor morgen om
     14u", want de datumopmaak valt netjes terug op de ruwe tekst. */
  ck('een onleesbare datum wordt geweigerd', /startGeldig/.test(bron), null);
  ck('en een datum in het verleden ook',
     /startMs > Date\.now\(\) - 60000/.test(bron), null);
  ck('de lead krijgt dan een correctie in plaats van een bevestiging',
     /onbruikbaar tijdstip[\s\S]{0,200}meldMislukteBoeking/.test(bron), null);
  ck('en de duur wordt begrensd', /Math\.min\(240, Math\.max\(5,/.test(bron), null);

  // Wat de oude poort deed met precies die invoer:
  const dt = new Date('morgen om 14u');
  ck('ter illustratie: die datum is echt onbruikbaar', isNaN(dt.getTime()));

  console.log('\n— het storingsbericht is niet meer altijd Nederlands —');
  const _lang = require(BASE + 'api/_lang.js');
  ck('nl krijgt Nederlands', /ik ben er even niet/.test(_lang.buildOutageMessage('nl')));
  ck('fr krijgt Frans', /Désolé/.test(_lang.buildOutageMessage('fr')), _lang.buildOutageMessage('fr'));
  ck('en een taal zonder eigen tekst valt terug op Engels, niet op Nederlands',
     /unavailable/.test(_lang.buildOutageMessage('de')), _lang.buildOutageMessage('de'));
  ck('en whatsapp.js gebruikt het', !/ik ben er even niet/.test(bron), null);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
