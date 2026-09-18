/*
 * Het publieke leadformulier deelde zijn limiet niet.
 *
 * ── Wat er mis was ──────────────────────────────────────────────────────────
 * api/form.js hield zijn eigen `Map` bij voor "max 5 inzendingen per IP per
 * 10 minuten" — precies het patroon dat api/auth.js, api/leads.js en
 * api/_demo-chat.js al verlieten voor de gedeelde teller in api/_ratelimit.js.
 * De reden staat in de kop van dat bestand: op serverless is een in-memory
 * Map per instance, en Vercel draait er meerdere parallel en herstart ze
 * koud. "5 per 10 minuten" was in werkelijkheid "5 per instance, opnieuw bij
 * elke cold start" — een aanvaller die zijn verzoeken spreidt merkt de limiet
 * amper. form.js is bovendien het enige ONGEAUTHENTICEERDE endpoint dat naar
 * Airtable schrijft en mail/WhatsApp verstuurt, dus juist hier weegt dit zwaar.
 *
 * ── Wat deze test bewaakt ───────────────────────────────────────────────────
 * 1. Na de geconfigureerde limiet (5) binnen het venster antwoordt het
 *    formulier met 429, niet met de gebruikelijke 400 (validatiefout).
 * 2. De teller die het formulier gebruikt is DEZELFDE gedeelde teller als
 *    api/_ratelimit.js ('form'-bucket) — niet een eigen lokale Map. Dat
 *    bewijzen we door de bucket rechtstreeks te vullen via _ratelimit.hit()
 *    en te zien dat het formulier daarna al geblokkeerd is, zonder dat het
 *    formulier zelf al één keer aangeroepen is.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

function verseModule(pad) {
  delete require.cache[require.resolve(pad)];
  return require(pad);
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return res;
}

(async () => {
  // Geen Upstash-credentials in deze omgeving -> valt terug op de gedeelde
  // in-memory teller van _ratelimit.js zelf (nog steeds gedeeld tussen elke
  // require van dat module, wat hier is wat we willen aantonen: form.js praat
  // met DIE teller, niet met een eigen Map).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  console.log('\n— formulier valt terug op 429 na de limiet —');
  {
    const form = verseModule('../api/form.js');
    const ip = '203.0.113.' + Math.floor(Math.random() * 250 + 1);
    let laatsteStatus = null;
    for (let i = 0; i < 6; i++) {
      const req = {
        method: 'POST',
        url: '/api/form/HELVARO',
        headers: { 'x-vercel-forwarded-for': ip },
        body: {}, // ontbrekende naam/telefoon -> 400 als de limiet niet geraakt is
      };
      const res = mockRes();
      await form(req, res);
      laatsteStatus = res.statusCode;
      if (i < 5) {
        ck(`aanvraag ${i + 1}/5 komt door de limiet (kreeg ${res.statusCode})`,
           res.statusCode !== 429, res.body);
      }
    }
    ck('6e aanvraag binnen het venster krijgt 429', laatsteStatus === 429, laatsteStatus);
  }

  console.log('\n— formulier gebruikt de GEDEELDE teller, geen eigen Map —');
  {
    const _rl = verseModule('../api/_ratelimit.js');
    const form = verseModule('../api/form.js'); // form.js require't dezelfde module-cache-instantie van _ratelimit
    const ip = '198.51.100.' + Math.floor(Math.random() * 250 + 1);

    // Vul de 'form'-bucket rechtstreeks tot boven de limiet (5), zonder het
    // formulier ook maar één keer aan te roepen.
    for (let i = 0; i < 6; i++) {
      await _rl.hit('form', ip, 5, 10 * 60 * 1000);
    }

    const req = {
      method: 'POST',
      url: '/api/form/HELVARO',
      headers: { 'x-vercel-forwarded-for': ip },
      body: {},
    };
    const res = mockRes();
    await form(req, res);
    ck('formulier is al geblokkeerd nadat alleen _ratelimit.hit(\'form\', ...) is aangeroepen ' +
       '(bewijst dat form.js geen eigen teller bijhoudt)',
       res.statusCode === 429, res.body);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
