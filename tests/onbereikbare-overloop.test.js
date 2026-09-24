'use strict';
/*
 * Niets mag boven de scroll-oorsprong uitsteken.
 *
 * ── De fout, en waarom hij zo makkelijk over het hoofd wordt gezien ─────────
 * Een flex-container die centreert EN scrollt is een val. Is de inhoud hoger
 * dan de container, dan verdeelt centreren de overloop over BEIDE kanten -- en
 * de helft die boven de bovenrand uitsteekt is onbereikbaar. Er is geen
 * negatieve scrollpositie: scrollTop staat al op 0 terwijl er nog inhoud boven
 * zit. Er is geen scrollbalk die het verraadt en geen foutmelding.
 *
 * Op een ruim scherm ziet het er perfect uit. Dat is precies waarom het blijft
 * staan.
 *
 * ── Twee plekken waar het stond, allebei nagemeten in de browser ───────────
 * 1. Het INLOGSCHERM. .login-form-side scrollt (overflow-y: auto) en had
 *    justify-content: center. Gemeten op 1280x720, een doodgewoon
 *    laptopscherm: paneel 720 hoog, 801 aan inhoud, logo op top -21. Na
 *    scrollTop = 0 nog steeds op -21. Lager venster, erger:
 *
 *        720px ->  21px onbereikbaar
 *        600px ->  81px
 *        480px -> 141px
 *        360px -> 201px   (logo en kop allebei weg)
 *
 *    Op het scherm waar iemand moet inloggen, dus zonder manier om verder te
 *    komen.
 *
 * 2. De AFSPRAAKKAART (.cal-modal). Die had als enige modaal geen kap op 90vh
 *    en geen scrollende body -- #koop-modal, #pd-modal en #cal-book-modal
 *    hebben dat alle drie wel. Met een lange kaart (notities, lang adres, het
 *    annuleerpaneel opengeklapt) op een venster van 620px: 737px boven de rand,
 *    en geen scrollbak om erbij te komen.
 *
 * ── Wat hier bewaakt wordt ─────────────────────────────────────────────────
 * De VORM van de oplossing, want de meting zelf heeft een browser nodig en die
 * is er in deze suite niet. Twee regels:
 *
 *   a. Een scrollende flex-container centreert niet met justify-content;
 *      hij gebruikt auto-marges op het kind. Die doen hetzelfde als er ruimte
 *      is, en worden nul als die er niet is.
 *   b. Elke modaalkaart heeft een kap in vh en een scrollend deel.
 *
 * De metingen hierboven zijn het bewijs dat die vorm werkt; deze test zorgt dat
 * de vorm blijft staan.
 */
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

/* Commentaar eruit: de uitleg hierboven noemt zelf 'justify-content: center'
   en zou deze test anders op zijn eigen tekst laten afgaan. */
const css = require(path.join(BASE, 'api/_dash/styles.js')).css().replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Regels als (selector, body)-paren, zodat er per regel geoordeeld kan worden
   in plaats van op het bestand als geheel. */
const REGELS = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }))
  .filter((r) => r.sel.indexOf('@') !== 0);

console.log('\n  geen enkele scrollende flexbox centreert met justify-content');
{
  /* DE algemene regel. Niet ".login-form-side mag geen center" -- dan vindt
     deze test de volgende plek niet. */
  const fout = REGELS.filter((r) =>
    /display\s*:\s*(inline-)?flex/.test(r.body)
    && /overflow(-y)?\s*:\s*(auto|scroll)/.test(r.body)
    && (/justify-content\s*:\s*center/.test(r.body) || /align-items\s*:\s*center/.test(r.body)))
    /* align-items op een KOLOM-flexbox centreert horizontaal, en horizontaal
       scrollt hier niets. Alleen de as die scrollt telt. */
    .filter((r) => /flex-direction\s*:\s*column/.test(r.body)
      ? /justify-content\s*:\s*center/.test(r.body)
      : /align-items\s*:\s*center/.test(r.body))
    .map((r) => r.sel.slice(-70));
  ck('nul scrollende gecentreerde containers', fout.length === 0, fout);
}

console.log('\n  het inlogpaneel centreert met auto-marges');
{
  const paneel = REGELS.find((r) => /(^|,\s*)\.login-form-side\s*$/.test(r.sel) && /display\s*:\s*flex/.test(r.body));
  ck('de basisregel is gevonden', !!paneel, paneel && paneel.sel);
  if (paneel) {
    ck('en staat op flex-start', /justify-content\s*:\s*flex-start/.test(paneel.body), paneel.body.slice(0, 120));
    ck('en scrollt nog steeds', /overflow-y\s*:\s*auto/.test(paneel.body));
  }
  /* De auto-marge hoort erbij: flex-start ALLEEN zou betekenen dat de inhoud
     altijd bovenaan plakt, ook op een ruim scherm. De marge houdt het
     gecentreerde uiterlijk dat er was, zonder de bovenkant onbereikbaar te
     maken. */
  const inner = REGELS.find((r) => /\.login-form-inner\s*$/.test(r.sel) && /max-width/.test(r.body));
  ck('het kind heeft een auto-marge', !!inner && /margin\s*:\s*auto\s+0/.test(inner.body), inner && inner.body.slice(0, 120));
}

console.log('\n  elke modaalkaart heeft een kap en een scrollend deel');
{
  /* De kaart met de bijbehorende scrollbak erbij. Die namen volgen GEEN
     patroon (.koop-body, .pd-modal-body, #cal-book-body, .cal-modal-body), dus
     ze staan hier met de hand. Een eerdere versie leidde de naam af uit de
     kaart en meldde daardoor twee modalen fout die het gewoon goed deden --
     een test die iets goeds afkeurt wordt weggeklikt, en dan vindt hij het
     echte geval ook niet meer. */
  const KAARTEN = [
    ['#koop-modal',     '.koop-body'],
    ['#pd-modal',       '.pd-modal-body'],
    ['#cal-book-modal', '#cal-book-body'],
    ['.cal-modal',      '.cal-modal-body'],
  ];
  for (const [k, bak] of KAARTEN) {
    const regel = REGELS.find((r) => r.sel === k);
    ck(k + ' bestaat', !!regel, k);
    if (!regel) continue;
    ck(k + ' heeft een kap in vh',
      /max-height\s*:\s*[^;]*vh/.test(regel.body), (/max-height\s*:\s*([^;]*);/.exec(regel.body) || [])[1]);
    /* Zonder scrollbak knipt de kap de inhoud gewoon af. */
    const bakRegel = REGELS.find((r) => r.sel === bak);
    ck(k + ' scrollt via ' + bak,
      !!bakRegel && /overflow-y\s*:\s*auto/.test(bakRegel.body), bak);
  }
}

console.log('\n  de kop van de afspraakkaart blijft staan');
{
  /* Anders scrollt de titel weg en weet je halverwege niet meer welke afspraak
     je openhebt. De andere modalen doen dit met flex-shrink: 0 op hun kop. */
  const kop = REGELS.find((r) => r.sel === '.cal-modal-header');
  ck('.cal-modal-header krimpt niet', !!kop && /flex-shrink\s*:\s*0/.test(kop.body), kop && kop.body.slice(0, 100));
  const body = REGELS.find((r) => r.sel === '.cal-modal-body');
  ck('.cal-modal-body neemt de rest en scrollt',
    !!body && /overflow-y\s*:\s*auto/.test(body.body) && /flex\s*:\s*1/.test(body.body), body && body.body.slice(0, 100));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
