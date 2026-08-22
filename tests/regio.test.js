/*
 * Land, tijdzone, munt en telefoon per klant.
 *
 * ── Waarom dit ertoe doet ───────────────────────────────────────────────────
 * Helvaro is voor Vlaanderen gebouwd en dat stond overal in de code: de klok op
 * Europe/Brussels, de opmaak op nl-BE, de munt op euro, en de landcode op 32.
 * Zolang elke klant in België zit klopt dat. Bij de eerste klant erbuiten wordt
 * het drie fouten die geen foutmelding geven:
 *
 *   WERKUREN op de verkeerde klok  -> de AI zegt "we zijn gesloten" om drie uur
 *                                     's middags, of stelt een bezichtiging voor
 *                                     om tien uur 's avonds.
 *   TELEFOON met de verkeerde code -> het bericht gaat naar een nummer dat niet
 *                                     bestaat. Geen fout, alleen stilte.
 *   GELD met de verkeerde opmaak   -> £395.000 leest als driehonderdvijfennegentig.
 *
 * Deze test legt vast dat de standaard België BLIJFT (anders breken bestaande
 * klanten) en dat elk ander land echt anders uitpakt.
 */
const BASE = require('path').join(__dirname, '..') + '/';
const R = require(BASE + 'api/_regio.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— de standaard verandert niet —');
/* Het belangrijkste van deze hele wijziging: een klantrij zonder de nieuwe
   velden moet zich exact gedragen als vroeger. Anders is dit geen
   internationalisering maar een storing voor iedereen die er al is. */
const leeg = R.lees({});
ck('geen velden -> België', leeg.land === 'BE', leeg);
ck('en Brusselse tijd', leeg.tz === 'Europe/Brussels', leeg);
ck('en euro', leeg.valuta === 'EUR', leeg);
ck('en nl-BE', leeg.locale === 'nl-BE', leeg);
ck('null-fields ook', R.lees(null).land === 'BE');
ck('een onbekend land valt terug op België', R.lees({ Country: 'XX' }).land === 'BE');
ck('een onleesbare tijdzone valt terug op die van het land',
   R.lees({ Country: 'GB', Timezone: 'Europe/Londen' }).tz === 'Europe/London',
   R.lees({ Country: 'GB', Timezone: 'Europe/Londen' }));

console.log('\n— elk veld apart overschrijfbaar —');
/* Een makelaar in Genève die in euro factureert bestaat echt. Land en munt en
   taal zijn niet één knop. */
const geneve = R.lees({ Country: 'CH', Currency: 'EUR', Locale: 'fr-CH' });
ck('land CH, munt EUR, taal fr-CH', geneve.land === 'CH' && geneve.valuta === 'EUR' && geneve.locale === 'fr-CH', geneve);
ck('en de tijdzone volgt het land', geneve.tz === 'Europe/Zurich', geneve);

console.log('\n— telefoon: de stilste fout —');
const be = R.lees({}), gb = R.lees({ Country: 'GB' }), ae = R.lees({ Country: 'AE' });
ck('BE 0470 12 34 56', R.naarE164('0470 12 34 56', be) === '32470123456', R.naarE164('0470 12 34 56', be));
ck('BE +32 470 123 456', R.naarE164('+32 470 123 456', be) === '32470123456');
ck('BE 0032470123456', R.naarE164('0032470123456', be) === '32470123456');
// Dit is het geval dat vroeger stilletjes misging.
ck('GB 07700 900123 wordt Brits, niet Belgisch',
   R.naarE164('07700 900123', gb) === '447700900123', R.naarE164('07700 900123', gb));
ck('GB +44 7700 900123', R.naarE164('+44 7700 900123', gb) === '447700900123');
ck('AE 050 123 4567', R.naarE164('050 123 4567', ae) === '971501234567', R.naarE164('050 123 4567', ae));
ck('een al internationaal nummer wordt niet dubbel voorzien',
   R.naarE164('32470123456', be) === '32470123456');
ck('rommel geeft leeg, niet iets willekeurigs', R.naarE164('bel me maar', be) === '');
ck('leeg geeft leeg', R.naarE164('', be) === '' && R.naarE164(null, be) === '');
ck('te kort geeft leeg', R.naarE164('12345', be) === '', R.naarE164('12345', be));

console.log('\n— werkuren staan op de klok van de KLANT —');
/* Donderdag 14:30 UTC. Dat is 16:30 in Brussel, 15:30 in Londen en 18:30 in
   Dubai. Met "ma-vr 9-17" hoort alleen Dubai gesloten te zijn. De oude code
   rekende voor alle drie met de Brusselse klok en zei drie keer "open". */
const moment = new Date('2026-06-11T14:30:00Z');
ck('BE om 16:30 lokaal: open', R.binnenWerkuren('ma-vr 9-17', be, moment) === true);
ck('GB om 15:30 lokaal: open', R.binnenWerkuren('ma-vr 9-17', gb, moment) === true);
ck('AE om 18:30 lokaal: GESLOTEN (oude code zei open)',
   R.binnenWerkuren('ma-vr 9-17', ae, moment) === false);

console.log('\n— en het faalt de goede kant op —');
/* Een kantoor per ongeluk dicht zetten kost een lead. Onbekend hoort dus
   "gewoon open" te betekenen. */
ck('geen werkuren ingevuld: open', R.binnenWerkuren('', be, moment) === true);
ck('onleesbare werkuren: open', R.binnenWerkuren('altijd bereikbaar', be, moment) === true);
ck('zaterdag valt buiten ma-vr', R.binnenWerkuren('ma-vr 9-17', be, new Date('2026-06-13T10:00:00Z')) === false);

console.log('\n— werkuren in vier talen —');
/* Een Duitse of Spaanse klant typt zijn openingsuren in zijn eigen taal. De
   oude parser kende alleen Nederlands en Engels en gaf bij de rest "open",
   ook om elf uur 's avonds. */
for (const [taal, spec] of [['nl', 'ma-vr 9-17'], ['en', 'mon-fri 9-17'],
                            ['fr', 'lun-ven 9-17'], ['de', 'mo-fr 9-17']]) {
  ck(`${taal}: "${spec}" wordt gelezen`, R.binnenWerkuren(spec, be, moment) === true, spec);
  ck(`${taal}: en sluit 's avonds ook echt`,
     R.binnenWerkuren(spec, be, new Date('2026-06-11T20:00:00Z')) === false, spec);
}
ck('halve uren ook: "mon-fri 9:30-17:30"',
   R.binnenWerkuren('mon-fri 9:30-17:30', be, moment) === true);

console.log('\n— geld is meer dan een ander teken —');
/* Intl zet een HARDE spatie (U+00A0) tussen teken en getal, geen gewone. Dat is
   goed -- je wil niet dat "€ 395.000" over twee regels breekt -- maar het maakt
   een letterlijke vergelijking hier misleidend: het ziet er identiek uit en is
   het niet. Vandaar deze normalisatie, en niet een aangepaste verwachting. */
const sp = (t) => String(t).replace(/\u00a0/g, ' ');
ck('BE 395000', sp(R.geld(395000, be)) === '€ 395.000', R.geld(395000, be));
ck('GB 395000 krijgt pond én komma-duizendtallen',
   sp(R.geld(395000, gb)) === '£395,000', R.geld(395000, gb));
ck('US 395000', sp(R.geld(395000, R.lees({ Country: 'US' }))) === '$395,000', R.geld(395000, R.lees({ Country: 'US' })));
ck('facturatie met centen', sp(R.geld(249.99, { ...be, decimalen: 2 })) === '€ 249,99', R.geld(249.99, { ...be, decimalen: 2 }));
/* Number(null) is 0. Zonder een expliciete controle wordt "prijs onbekend"
   op het scherm "€ 0" -- een pand dat gratis lijkt. */
ck('geen bedrag geeft leeg, geen nul',
   R.geld(null, be) === '' && R.geld(undefined, be) === '' && R.geld('', be) === '' && R.geld('abc', be) === '',
   { nul: R.geld(null, be), leeg: R.geld('', be) });
ck('een onbekende munt maakt geen onzin', /^ZZZ\s?100$/.test(sp(R.geld(100, { valuta: 'ZZZ', locale: 'nl-BE' }))), R.geld(100, { valuta: 'ZZZ', locale: 'nl-BE' }));

console.log('\n— dezelfde afspraak, vier kantoren —');
const afspraak = '2026-06-12T14:00:00Z';
const uren = ['BE', 'GB', 'AE', 'US'].map((c) => R.datumTijd(afspraak, R.lees({ Country: c })));
ck('vier verschillende weergaven', new Set(uren).size === 4, uren);
ck('Brussel toont 16:00', /16:00/.test(uren[0]), uren[0]);
ck('Londen toont 15:00', /15:00/.test(uren[1]), uren[1]);
ck('een onleesbare datum geeft de invoer terug, geen "Invalid Date"',
   R.datumTijd('geen datum', be) === 'geen datum', R.datumTijd('geen datum', be));

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
