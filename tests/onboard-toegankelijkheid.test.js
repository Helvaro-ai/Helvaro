/*
 * Wat er op de LIVE productie-app misging, vastgezet zodat het niet terugkomt.
 *
 * Deze drie bevindingen komen uit een doorloop van app.helvaro.pro zelf, niet
 * uit het lezen van de code. Ze zaten alle drie op public/onboard.html en
 * api/privacy.js -- twee bestanden die buiten de bestaande schermaudit vielen
 * (die dekt de 16 schermen die api/dashboard.js tekent, en onboard.html is
 * statische HTML die daar niet doorheen komt). Vandaar dat "geen bediening
 * zonder toegankelijke naam" groen stond terwijl het aanmeldscherm -- het
 * eerste dat elke nieuwe klant ziet -- 29 labels had die aan niets hingen.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* ────────────────────────────────────────────────────────────────────────────
   1. Elk invoerveld in de onboarding heeft een toegankelijke naam.

   Er stonden 29 <label>-elementen op de pagina en NUL daarvan had een
   for-attribuut. Visueel klopte alles -- het label stond netjes boven het
   veld -- maar een schermlezer kreeg bij "Sector / branche" alleen "keuzelijst"
   te horen. Dat is precies het veld waar Autohandel in staat.
   ──────────────────────────────────────────────────────────────────────────── */
console.log('\n— de onboarding: elk veld zegt wat het is —');
{
  const html = lees('public/onboard.html');

  const velden = [...html.matchAll(/<(?:input|select|textarea)[^>]*id="(w-[^"]+)"[^>]*>/g)]
    .map((m) => ({ id: m[1], tag: m[0] }));
  const gekoppeld = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));

  ck('de onboarding heeft invoervelden om te controleren', velden.length >= 20, velden.length);

  /* Een veld is in orde als een label ernaar wijst OF het zelf een aria-label
     draagt. De kleurkiezer heeft geen eigen zichtbaar label -- hij hoort bij
     "Brand-kleur" -- en heeft daarom het tweede. */
  const naamloos = velden.filter(
    (v) => !gekoppeld.has(v.id) && !/\baria-label="[^"]+"/.test(v.tag)
  );
  ck('geen enkel veld zonder toegankelijke naam',
     naamloos.length === 0, naamloos.map((v) => v.id).join(', '));

  /* En andersom: een for= dat naar niets wijst is erger dan geen for=, want
     dan lijkt het gekoppeld terwijl de schermlezer alsnog niets voorleest. */
  const alleIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const wees = [...gekoppeld].filter((f) => !alleIds.has(f));
  ck('elk for= wijst naar een bestaand element', wees.length === 0, wees.join(', '));
}

/* ────────────────────────────────────────────────────────────────────────────
   2. De voorbeeldknopjes bij "Werkuren" waren 23 pixels hoog.

   Eén pixel onder de 24 uit WCAG 2.2 (2.5.8, Target Size Minimum). Gemeten op
   een echte 390px-viewport: 81x23, 84x23 en 82x23. Ze zitten niet in een label
   verpakt, dus er is geen groter raakvlak dat dit goedmaakt -- anders dan bij
   de radio's en de akkoordvinkjes, die wel omwikkeld zijn en daardoor 40px
   halen.
   ──────────────────────────────────────────────────────────────────────────── */
console.log('\n— de voorbeeldknopjes zijn groot genoeg om te raken —');
{
  const html = lees('public/onboard.html');
  const regel = (html.match(/\.chip\s*\{[^}]*\}/) || [''])[0];

  ck('.chip bestaat nog', regel.length > 0, regel);
  ck('.chip heeft een expliciete minimumhoogte van 24px',
     /min-height:\s*24px/.test(regel), regel);

  /* De padding alleen is niet genoeg bewijs, maar wel de reden dat hij op 23
     uitkwam: 11px regelhoogte + 2x4px. Zakt die terug naar 4px zonder dat de
     min-height meegaat, dan is dit weer stuk. */
  ck('.chip heeft de opgehoogde verticale padding',
     /padding:\s*5px\s+10px/.test(regel), regel);
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Het privacybeleid noemt de verwerkers die er echt zijn.

   De lijst zei "Deze lijst komt overeen met Bijlage 3 van onze
   verwerkersovereenkomst" en noemde Resend -- die in api/_mailer.js bewust is
   weggehaald -- terwijl Stripe, Google en OneSignal er wel zijn en er niet in
   stonden. Een subverwerkerslijst die de echte verwerkers niet noemt is geen
   slordigheid maar een gat in de AVG-verantwoording.

   Deze test hangt de tekst aan de CODE vast: gaat een verwerker eruit, dan
   valt hij hier om.
   ──────────────────────────────────────────────────────────────────────────── */
console.log('\n— het privacybeleid klopt met wat de app echt gebruikt —');
{
  const privacy = lees('api/privacy.js');
  const mailer  = lees('api/_mailer.js');

  /* Alleen de subverwerkerslijst uit sectie 6, niet de hele pagina. "Stripe"
     staat ook in de algemene voorwaarden ("betalingen verlopen via Stripe"),
     en daardoor bleef een test op de hele tekst groen terwijl de verwerker uit
     de lijst verdwenen was -- precies het gat dat deze test moet dichten. */
  const sectie6 = (privacy.match(/Wie verwerkt uw gegevens\?[\s\S]*?<\/ul>/) || [''])[0];
  ck('de subverwerkerslijst is te vinden in api/privacy.js', sectie6.length > 200, sectie6.length);

  ck('Resend staat niet meer in de subverwerkerslijst',
     !/Resend/i.test(sectie6), 'Resend wordt genoemd maar zit niet meer in _mailer.js');

  /* Het anker: zolang _mailer.js geen Resend gebruikt, mag privacy.js hem niet
     noemen. Komt Resend ooit terug in de code, dan hoort deze test je te
     dwingen de tekst ook weer bij te werken. */
  ck('_mailer.js gebruikt inderdaad geen Resend meer',
     !/resend\.(com|dev)|RESEND_API_KEY/i.test(mailer), 'mailer noemt Resend nog');

  for (const [naam, patroon] of [
    ['Stripe',    /Stripe/],
    ['Google',    /Google/],
    ['OneSignal', /OneSignal/],
  ]) {
    ck(`${naam} staat als subverwerker in de lijst van sectie 6`,
       patroon.test(sectie6), null);
  }

  /* Alleen de MELDINGEN zelf, niet het commentaar eromheen: dat mag de oude
     tekst citeren om uit te leggen waarom hij weg is.

     En het gaat om één ding: geen enkele melding mag zeggen dat hij NU nog
     ergens op terugvalt. "Sinds Resend eruit is, is SMTP de enige weg" mag
     dus wel -- dat is precies de waarheid die de operator moet lezen. */
  const meldingen = [...mailer.matchAll(/console\.(?:error|warn|log)\(([\s\S]*?)\);/g)]
    .map((m) => m[1]);
  const belooftTerugval = meldingen.filter(
    (m) => /val\s+(door\s+)?(terug\s+)?op\s+Resend|terugval\s+op\s+Resend|fallback/i.test(m)
  );
  ck('geen enkele melding belooft nog een terugval die niet bestaat',
     belooftTerugval.length === 0, belooftTerugval.join(' | '));

  /* De keerzijde: als SMTP faalt MOET de melding zeggen dat de mail weg is.
     Een stille of vage regel is hoe dit de vorige keer onopgemerkt bleef. */
  ck('bij een mislukte SMTP-verzending zegt de melding dat er niets verstuurd is',
     meldingen.some((m) => /niet verstuurd|GEEN terugval/i.test(m)), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
