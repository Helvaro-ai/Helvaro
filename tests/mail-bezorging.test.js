/*
 * Preflight moet kunnen zeggen of onze e-mail überhaupt aankomt.
 *
 * ── Waarom dit erbij is gekomen ─────────────────────────────────────────────
 * Elke mail die Helvaro verstuurt is er een die de ontvanger nodig heeft: een
 * wachtwoordherstel, een e-mailbevestiging, een antwoord op een supportvraag,
 * de dagelijkse opvolgmail. Geen nieuwsbrief die gemist mag worden.
 *
 * Bij het nakijken bleek helvaro.pro GEEN SPF-record te hebben. DKIM stond er
 * wel (selectors default en google) en DMARC ook (p=none). Dat is precies de
 * soort fout die je nooit vindt door de app te gebruiken -- je merkt hem aan
 * klanten die zeggen dat ze niets gekregen hebben, en dan is het al gebeurd.
 *
 * ── Wat deze test bewaakt ───────────────────────────────────────────────────
 * Niet of het DNS-record er vandaag staat -- dat is geen eigenschap van de
 * code, en een test die het internet nodig heeft is rood zodra je in de trein
 * zit. Wél dat de CONTROLE blijft bestaan en zijn twee moeilijke gevallen goed
 * houdt:
 *
 *   1. "niet kunnen kijken" mag nooit lezen als "staat er niet". Onbereikbaar
 *      DNS is een aandachtspunt, geen fout -- dezelfde regel als bij de agenda
 *      in api/_gcal.js.
 *   2. DKIM is een steekproef over gangbare selectors. Niets vinden is geen
 *      bewijs van afwezigheid, en dat moet in de tekst staan, anders gaat
 *      iemand op zoek naar een record dat er gewoon is.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const pre = fs.readFileSync(BASE + 'scripts/preflight.js', 'utf8');
/* Commentaar eruit: de afwegingen hierboven noemen bijna elk woord waar deze
   test op zoekt, en groen worden op je eigen uitleg bewaakt niets. */
const code = pre.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

console.log('\nPreflight controleert of onze post aankomt');

console.log('\n  de drie records worden nagekeken');
{
  ck('er is een e-mailsectie', /head\('e-mail: komt hij aan'\)/.test(code), null);
  ck('SPF wordt gecontroleerd', /v=spf1/.test(code), null);
  ck('DKIM wordt gecontroleerd', /_domainkey\./.test(code), null);
  ck('DMARC wordt gecontroleerd', /_dmarc\./.test(code), null);
  /* Geen extra afhankelijkheid: dns zit in Node zelf. Deze codebase heeft
     bewust geen app-dependencies (zie HELVARO-ARCHITECTUUR.md §2). */
  ck('via de ingebouwde dns-module, zonder nieuwe dependency',
    /require\('dns'\)\.promises/.test(code), null);
}

console.log('\n  ontbrekende SPF is een FOUT en geen aandachtspunt');
{
  /* Dit is de enige van de drie die hard hoort te falen: zonder SPF kan
     iedereen namens dit domein mailen, en de eigen post komt in de spam. */
  ck('geen SPF laat preflight falen',
    /fail\(`\$\{domein\} heeft GEEN SPF-record`/.test(code), null);
  ck('en het advies noemt een werkend record',
    /include:_spf\.google\.com/.test(code), null);
}

console.log('\n  "niet kunnen kijken" is iets anders dan "staat er niet"');
{
  /* De kern. Bij ENOTFOUND/ENODATA bestaat het record echt niet; elke andere
     DNS-fout betekent dat we geen uitspraak kunnen doen. */
  ck('alleen ENOTFOUND/ENODATA gelden als "bestaat niet"',
    /e\.code === 'ENOTFOUND' \|\| e\.code === 'ENODATA'/.test(code), null);
  ck('en elke andere DNS-fout wordt als onbereikbaar gemarkeerd',
    /onbereikbaar: !ontbreekt/.test(code), null);
  /* Onbereikbaar mag NOOIT in de fail-tak belanden: dan wordt een lokale
     DNS-storing gemeld als een ontbrekend record, en dat stuurt iemand een
     halve dag het verkeerde bos in. */
  ck('onbereikbaar SPF geeft een aandachtspunt, geen fout',
    /if \(spf\.onbereikbaar\) \{\s*warn\(/.test(code), null);
  ck('en dat staat ook met zoveel woorden in de melding',
    /Niet hetzelfde als "ontbreekt"/.test(pre), null);
}

console.log('\n  DKIM blijft eerlijk over wat een steekproef wel en niet bewijst');
{
  ck('er wordt over meerdere selectors gezocht',
    /const selectors = \[[^\]]*'default'[^\]]*\]/.test(code), null);
  ck('niets vinden is een aandachtspunt, geen fout',
    /warn\(`geen DKIM gevonden op \$\{selectors\.length\}/.test(code), null);
  ck('en de melding zegt dat het geen bewijs van afwezigheid is',
    /steekproef, geen bewijs/.test(pre), null);
}

console.log('\n  en de val waar dit echt om begonnen is');
{
  /* Versturen via een andere SMTP-server dan de partij die je DKIM tekent:
     dan is die post door NIETS gedekt. Zonder SPF valt dat nergens op. */
  ck('preflight vergelijkt de verzendende SMTP-host met de DKIM-eigenaar',
    /SMTP_HOST/.test(code) && /viaGoogle/.test(code), null);
  ck('en waarschuwt als je tekent met de een en verstuurt via de ander',
    /DKIM-sleutels lijken van Google/.test(pre), null);
}

console.log('\n  het script blijft laadbaar');
{
  /* Een syntaxfout hier is een preflight die niets meer controleert, en dat
     merk je pas als je hem nodig hebt. */
  const { execFileSync } = require('child_process');
  let parseert = true;
  try { execFileSync(process.execPath, ['--check', BASE + 'scripts/preflight.js'], { stdio: 'pipe' }); }
  catch (e) { parseert = false; }
  ck('scripts/preflight.js parseert', parseert, null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
