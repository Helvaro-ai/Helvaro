/*
 * Operations Center: de interne bediening.
 *
 * ── Wat hier bewezen wordt ──────────────────────────────────────────────────
 * Twee eigenschappen, en ze zijn allebei het soort dat stilletjes wegvalt.
 *
 * 1. EEN KLANT KOMT ER NIET IN. Niet met een lege sleutel, niet met zijn eigen
 *    geldige sessiesleutel, niet door de mode zelf in te tikken. De controle
 *    staat server-side per mode; alleen de UI verbergen is geen beveiliging --
 *    dat is precies de fout die tests/backoffice-leak.test.js al een keer
 *    heeft moeten afvangen.
 *
 * 2. ER LEKKEN GEEN GEHEIMEN. Het overzicht vertelt OF iets geconfigureerd is,
 *    nooit wat erin staat. Een operationeel scherm dat je tokens laat zien is
 *    een tweede plek waar ze kunnen weglopen.
 *
 * En één inhoudelijke: templates horen per TAAL geteld te worden, niet per
 * klant. Drie Nederlandstalige Belgen zijn één inzending. Telt dit scherm ze
 * als drie, dan dienen we drie keer hetzelfde in bij Meta.
 */
'use strict';

process.env.ADMIN_KEY = 'test-admin-sleutel-niet-echt';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';
/* Bewust NIET zetten: WHATSAPP_MANAGEMENT_TOKEN. De registry moet dan op de
   snapshot terugvallen en dat ook zeggen. */
delete process.env.WHATSAPP_MANAGEMENT_TOKEN;

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

/* Het echte admintoken zoals de app het afleidt (HMAC over de ADMIN_KEY). */
const ADMIN_TOKEN = crypto
  .createHmac('sha256', process.env.ADMIN_KEY)
  .update('helvaro-admin-v1')
  .digest('hex');

/* Vier klanten: drie Nederlandstalige Belgen (één taal, één inzending) en
   één Franstalige. Precies de situatie uit de opdracht. */
const KLANTEN = [
  { fields: { 'Project Code': 'AAA', 'Client Name': 'Kine Gent',       Country: 'BE', Language: 'nl' } },
  { fields: { 'Project Code': 'BBB', 'Client Name': 'Makelaar Brugge', Country: 'BE', Language: 'nl' } },
  { fields: { 'Project Code': 'CCC', 'Client Name': 'Tandarts Leuven', Country: 'BE', Language: 'nl' } },
  { fields: { 'Project Code': 'DDD', 'Client Name': 'Immo Liege',      Country: 'BE', Language: 'fr' } },
];

global.fetch = async (url) => {
  if (String(url).includes('graph.facebook.com')) {
    // Geen token gezet, dus hier hoort de registry niet eens te komen.
    return { ok: false, status: 401, json: async () => ({ error: { message: 'geen token' } }), text: async () => '' };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: KLANTEN }) };
};

const admin = require(BASE + 'api/admin.js');

function roep(body, token) {
  return new Promise((klaar) => {
    let code = 0, payload = null;
    const res = {
      setHeader() {}, getHeader() { return null; },
      status(c) { code = c; return this; },
      json(b) { payload = b; klaar({ code, body: payload }); return this; },
      send(b) { payload = b; klaar({ code, body: payload }); return this; },
      end() { klaar({ code, body: payload }); },
    };
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-api-key'] = token;
    admin({ method: 'POST', url: '/api/admin', headers, body }, res);
  });
}

(async () => {
  console.log('\nOperations Center');

  // ── 1. De deur ────────────────────────────────────────────────────────────
  console.log('\n  een klant komt er niet in');
  for (const mode of ['ops-overview', 'ops-templates']) {
    const zonder = await roep({ mode });
    ck(`${mode} zonder sleutel geeft 401`, zonder.code === 401, zonder);

    const fout = await roep({ mode }, 'niet-de-admin-sleutel');
    ck(`${mode} met een verkeerde sleutel geeft 401`, fout.code === 401, fout);

    /* De scherpste: een ECHTE klantsleutel. Die is geldig om leads mee op te
       halen en moet hier alsnog stuklopen. */
    const klant = await roep({ mode }, 'hvs1.klant.geldig.maar.geen.admin');
    ck(`${mode} met een klantsleutel geeft 401`, klant.code === 401, klant);

    ck(`${mode} lekt niets in het 401-antwoord`,
      !JSON.stringify(zonder.body || {}).includes(process.env.ADMIN_KEY), zonder.body);
  }

  // ── 2. Templates worden per taal geteld ───────────────────────────────────
  console.log('\n  templates zijn per taal, niet per klant');
  const t = await roep({ mode: 'ops-templates' }, ADMIN_TOKEN);
  ck('met de admin-sleutel geeft het 200', t.code === 200, t.code);
  ck('en er is data', t.body && t.body.beschikbaar === true, t.body);

  const rijen = (t.body && t.body.rijen) || [];
  const nl = rijen.find((r) => r.taal === 'nl_BE' || r.taal === 'nl');
  ck('de drie Nederlandstalige Belgen staan als ÉÉN rij',
    !!nl && nl.klanten === 3, rijen);
  ck('met hun namen erbij, zodat je weet wie er wacht',
    !!nl && nl.namen.length === 3, nl && nl.namen);
  ck('en het Nederlands is klaar', !!nl && nl.klaar === true, nl);

  const fr = rijen.find((r) => r.taal === 'fr');
  ck('de Franstalige klant staat apart', !!fr && fr.klanten === 1, rijen);
  ck('en het Frans is NIET klaar', !!fr && fr.klaar === false, fr);
  ck('met de ontbrekende templates bij naam',
    !!fr && fr.ontbreekt.length > 0, fr && fr.ontbreekt);
  ck('en een leesbare landnaam', !!nl && nl.landNaam === 'België', nl && nl.landNaam);

  /* Zonder management-token is dit een snapshot en geen meting. Dat verschil
     moet zichtbaar zijn, anders leest een oude stand als een verse. */
  ck('de bron staat erbij en is eerlijk "snapshot"',
    t.body.bron === 'snapshot', t.body.bron);

  // ── 3. Het overzicht ──────────────────────────────────────────────────────
  console.log('\n  het overzicht telt echte rijen');
  const o = await roep({ mode: 'ops-overview' }, ADMIN_TOKEN);
  ck('geeft 200', o.code === 200, o.code);
  ck('vier klanten geteld', o.body.klanten.totaal === 4, o.body.klanten);
  ck('en dat is echt gelezen, niet geraden', o.body.klanten.beschikbaar === true, o.body.klanten);
  ck('één klant zit vast op een ontbrekende taal',
    o.body.templates.klantenGeblokkeerd === 1, o.body.templates);
  ck('en dat staat als waarschuwing',
    o.body.waarschuwingen.some((w) => /fr/.test(w)), o.body.waarschuwingen);
  ck('het ontbrekende management-token wordt gemeld',
    o.body.waarschuwingen.some((w) => /WHATSAPP_MANAGEMENT_TOKEN/.test(w)), o.body.waarschuwingen);

  console.log('\n  eerlijk over wat we NIET gemeten hebben');
  ck('Airtable is wel echt gemeten', o.body.integraties.airtable.gemeten === true, o.body.integraties.airtable);
  ck('Clerk claimt géén "gezond" zonder meting',
    o.body.integraties.clerk.gemeten === false && o.body.integraties.clerk.staat !== 'gezond',
    o.body.integraties.clerk);
  ck('Stripe idem', o.body.integraties.stripe.staat !== 'gezond', o.body.integraties.stripe);

  // ── 4. Geen geheimen ──────────────────────────────────────────────────────
  console.log('\n  geen geheimen in het antwoord');
  const alles = JSON.stringify(o.body) + JSON.stringify(t.body);
  for (const [naam, waarde] of [
    ['ADMIN_KEY', process.env.ADMIN_KEY],
    ['Airtable-token', process.env.API_AIRTABLE],
    ['Airtable-base', process.env.BASE_AIRTABLE],
  ]) {
    ck(`${naam} staat niet in het antwoord`, !alles.includes(waarde), naam);
  }
  ck('geen veld dat "token", "secret" of "key" heet',
    !/"[^"]*(token|secret|_key|apikey)[^"]*"\s*:/i.test(alles), null);

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
