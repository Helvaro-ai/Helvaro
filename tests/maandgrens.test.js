/*
 * "Deze maand" betekent overal hetzelfde.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * computeStats() draait op Vercel, en daar staat de klok op UTC. De makelaar
 * zit in Belgie, in de zomer twee uur verder. De telling deed:
 *
 *     d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
 *
 * Een lead die om 01:30 's nachts op 1 september binnenkwam is in UTC 31
 * augustus 23:30, en telde dus mee in AUGUSTUS. Elke maandgrens schoof zo een
 * paar uur aan leads naar de verkeerde maand -- onzichtbaar, want beide
 * getallen zien er plausibel uit.
 *
 * Het scherm rekende "deze maand" bovendien ZELF nog eens uit, in de tijdzone
 * van de laptop. Dezelfde vorm als de bedragenbug: twee plekken die denken
 * hetzelfde te berekenen en dat rond de grens niet doen.
 *
 * Deze test zet de proceszone expres op iets anders dan Brussel, zodat een
 * terugval op de systeemklok meteen rood wordt in plaats van toevallig goed.
 */
'use strict';

process.env.TZ = 'UTC';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const lr   = require(BASE + 'api/_leads-read.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const lead = (iso) => ({ datum: iso, qualified: false, afspraakGeboekt: false, reactietijd: 0, leadScore: 0 });

console.log('\nDe maandgrens ligt in Belgie, niet in UTC');

/* Het exacte geval uit de bug: 1 september 01:30 Brusselse tijd. */
const nachtelijk = '2026-09-01T01:30:00+02:00';
ck('een lead van 1 sept 01:30 Brusselse tijd hoort bij september',
  lr.maandSleutel(new Date(nachtelijk), 'Europe/Brussels') === '2026-09',
  lr.maandSleutel(new Date(nachtelijk), 'Europe/Brussels'));
ck('en dat is NIET wat UTC zou zeggen (anders bewijst de test niets)',
  new Date(nachtelijk).getUTCMonth() === 7, new Date(nachtelijk).getUTCMonth());

/* De andere kant: de laatste uren van augustus horen bij augustus. */
ck('31 augustus 23:30 Brusselse tijd hoort bij augustus',
  lr.maandSleutel(new Date('2026-08-31T23:30:00+02:00'), 'Europe/Brussels') === '2026-08', null);

/* Wintertijd is een uur, zomertijd twee. Een vaste offset zou hier omvallen. */
ck('1 januari 00:30 Brusselse tijd (wintertijd) hoort bij januari',
  lr.maandSleutel(new Date('2026-01-01T00:30:00+01:00'), 'Europe/Brussels') === '2026-01', null);
ck('31 december 23:30 Brusselse tijd hoort bij december',
  lr.maandSleutel(new Date('2025-12-31T23:30:00+01:00'), 'Europe/Brussels') === '2025-12', null);

console.log('\n  de telling zelf, op de grens');
{
  /* Precies het uur waarin het misging: het is 1 september 01:00 in Brussel,
     dus 31 augustus 23:00 in UTC -- de zone waarin deze code echt draait. */
  const nu = new Date('2026-09-01T01:00:00+02:00');

  const netNaMiddernacht = lead('2026-09-01T00:30:00+02:00'); // september
  const netDavoor        = lead('2026-08-31T23:30:00+02:00'); // augustus
  const middenAugustus   = lead('2026-08-15T12:00:00+02:00'); // augustus

  const st = lr.computeStats([netNaMiddernacht, netDavoor, middenAugustus], { nu });
  ck('alleen de lead van na middernacht telt als "deze maand"', st.thisMonth === 1, st);
  ck('en de totalen blijven ongemoeid', st.total === 3, st);

  /* Andersom, zodat een omgekeerde vergissing ook rood wordt: sta op 31
     augustus 23:00 Brussel en dan telt juist die ene lead NIET mee. */
  const stDavoor = lr.computeStats([netNaMiddernacht, netDavoor],
    { nu: new Date('2026-08-31T23:00:00+02:00') });
  ck('een uur eerder telt diezelfde lead nog niet mee', stDavoor.thisMonth === 1, stDavoor);
}

console.log('\n  het valt niet om');
ck('een onbekende zone valt terug op UTC in plaats van te gooien',
  lr.maandSleutel(new Date(nachtelijk), 'Mars/Olympus_Mons') === '2026-08', null);
ck('een onleesbare datum telt niet mee',
  lr.computeStats([lead('geen datum'), lead('')]).thisMonth === 0, null);
ck('de standaardzone is Belgie', lr.STANDAARD_ZONE === 'Europe/Brussels', lr.STANDAARD_ZONE);

/* ── En het scherm rekent hetzelfde ────────────────────────────────────────
   De client kan _leads-read.js niet require()n (die code staat binnen een
   HTML-template), dus staat er een kopie. Zoals bij de bedragen mag de kopie
   bestaan, maar niet afwijken: hij moet dezelfde zone gebruiken. */
console.log('\n  het scherm rekent in dezelfde zone');
{
  const bron = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const blok = bron.slice(bron.indexOf('function populateFormStats'),
    bron.indexOf('function populateFormStats') + 3000);
  ck('populateFormStats noemt Europe/Brussels', /Europe\/Brussels/.test(blok), null);
  ck('en telt per maandsleutel, niet per lokale datumgrens',
    /cntInMaand\(/.test(blok) && !/new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)/.test(blok), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
