/*
 * De beheerder moet ergens naar binnen kunnen.
 *
 * ── Wat er mis was ──────────────────────────────────────────────────────────
 * HV_IS_ADMIN kijkt naar de ONDERTEKENDE eigen sessie: clientName 'Admin' en
 * geen projectcode. Die sessie krijg je op precies één manier -- api/auth.js
 * vergelijkt het opgegeven wachtwoord timing-safe met ADMIN_KEY en geeft dan
 * een afgeleide token terug.
 *
 * Clerk kent dat pad niet. En sinds Clerk het inlogscherm tekent, is dat scherm
 * e-mail-eerst: je typt een adres, en als het niet bekend is antwoordt hij "we
 * kennen dit e-mailadres niet" -- nog vóór er ooit naar een wachtwoord gevraagd
 * wordt. Er was dus geen enkele manier meer om als beheerder binnen te komen.
 * De back-officepagina's (Klanten, Founder, Kosten) waren daarmee onbereikbaar
 * voor de eigenaar van het product.
 *
 * ── De oplossing, en waarom het er geen achterdeur is ───────────────────────
 * ?admin=1 zet Clerk voor dat ene verzoek uit, zodat het eigen formulier
 * verschijnt -- hetzelfde formulier dat er toch al staat als vangnet voor een
 * Clerk-storing. De controle verschuift niet: ADMIN_KEY blijft de enige sleutel
 * en wordt nog steeds op de server vergeleken. Wie hem niet heeft, krijgt met
 * deze parameter precies hetzelfde inlogscherm als iedereen.
 *
 * Serverzijdig, niet in de browser: #login-page krijgt de klasse clerk-wacht
 * zolang Clerk verwacht wordt, en die verbergt het formulier via CSS. Zou
 * alleen de client dit weten, dan stond er een skelet te wachten op een Clerk
 * die nooit komt.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';
/* Clerk AAN zetten, want juist dat is de stand waarin de beheerder vastliep.
   De sleutel is een geldig gevormde testsleutel: base64 van een host plus '$',
   precies wat dashboard.js eruit decodeert. */
process.env.CLERK_ENABLED = '1';
process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('clerk.example.com$').toString('base64');

const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const dash = require(path.join(BASE, 'api/dashboard.js'));

function render(url, query) {
  return new Promise((res) => {
    let html = '';
    dash({ method: 'GET', url, headers: {}, query: query || {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

(async () => {
  console.log('\nDe beheerder kan bij de back-office');

  console.log('\n  normaal blijft Clerk gewoon het scherm tekenen');
  {
    const html = await render('/dashboard', {});
    ck('Clerk staat aan in de uitgestuurde JS', /const CLERK_READY = true/.test(html), null);
    /* clerk-wacht verbergt het eigen formulier: dat HOORT zo zolang Clerk komt. */
    ck('en het eigen formulier is verborgen',
      /id="login-page" class="clerk-wacht"/.test(html), null);
  }

  console.log('\n  met ?admin=1 verschijnt het eigen formulier');
  {
    const html = await render('/dashboard?admin=1', { admin: '1' });
    ck('Clerk wordt overgeslagen', /const CLERK_READY = false/.test(html), null);
    ck('en de wachtstand staat er niet',
      !/id="login-page" class="clerk-wacht"/.test(html), null);
    /* Het formulier moet er ook echt staan, niet alleen zichtbaar zijn. */
    ck('het wachtwoordveld staat in de pagina',
      /id="login-form-wrap"/.test(html) && /type="password"/.test(html), null);
  }

  console.log('\n  de parameter verandert NIETS aan wie er binnen mag');
  {
    /* Dit is de kern: ?admin=1 is een UI-schakelaar, geen toegangsverlening.
       Zou iemand hem ooit uitbreiden tot "en dan ben je admin", dan valt dit om. */
    const bron = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
    const rond = bron.slice(bron.indexOf('_adminBypass'), bron.indexOf('_adminBypass') + 600);
    ck('de bypass raakt alleen CLERK_READY',
      /CLERK_READY = CLERK_ON && !!CLERK_HOST && !_adminBypass/.test(rond), rond.slice(0, 160));
    ck('en zet nergens zelf HV_IS_ADMIN',
      !/_adminBypass[\s\S]{0,400}HV_IS_ADMIN\s*=\s*true/.test(bron), null);

    /* HV_IS_ADMIN blijft hangen aan de geverifieerde sessie van de SERVER. */
    ck('HV_IS_ADMIN komt uit de ondertekende sessie',
      /HV_IS_ADMIN = !!\(_sess && _sess\.clientName === 'Admin' && !_sess\.projectCode\)/.test(bron), null);

    /* En de sleutelvergelijking staat nog steeds in auth.js, timing-safe. */
    const auth = fs.readFileSync(path.join(BASE, 'api/auth.js'), 'utf8');
    ck('ADMIN_KEY wordt timing-safe vergeleken in api/auth.js',
      /safeEqual\(password, ADMIN_KEY\)/.test(auth), null);
    ck('en de ruwe sleutel verlaat de server niet',
      /deriveAdminToken\(ADMIN_KEY\)/.test(auth), null);
  }

  console.log('\n  de back-officepagina\'s blijven eruit geknipt zonder adminsessie');
  {
    const html = await render('/dashboard?admin=1', { admin: '1' });
    /* Zonder geldige adminsessie hoort stripBackoffice zijn werk te doen, ook
       mét de parameter. Anders zou de parameter zelf de back-office tonen. */
    for (const id of ['page-admin', 'page-founder', 'page-kosten']) {
      ck(`  ${id} is niet uitgestuurd`, html.indexOf('id="' + id + '"') === -1, null);
    }
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST ZELF STUK:', e && e.stack); process.exit(1); });
