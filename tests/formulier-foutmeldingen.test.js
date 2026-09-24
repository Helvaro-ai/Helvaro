'use strict';
/*
 * De foutmeldingen op het LEAD-formulier, in de taal van de lead.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * api/form-page.js deed dit:
 *
 *     throw new Error(d.error || I18N.errGeneric);
 *
 * De pagina HAD dus een vertaalde terugval. Ze koos hem alleen nooit, want
 * d.error was er altijd -- en dat was een hardgecodeerde Nederlandse zin uit
 * api/form.js. Een Waalse lead op het formulier van een Waals kantoor las
 * "Systeem is even bezet. Probeer het in 30 seconden opnieuw."
 *
 * Dat is de duurste plek waar dit kon staan. Het lead-formulier is de route
 * waarlangs het geld binnenkomt: wie hier afhaakt, komt niet terug en belt
 * ook niet. En het is precies het moment waarop iemand al geïrriteerd is,
 * want hij ziet die zin alleen als er iets misging.
 *
 * De oplossing is een CODE naast de zin. De code is stabiel en machineleesbaar,
 * de pagina zoekt er zijn eigen zin bij, en de Nederlandse tekst blijft staan
 * als laatste terugval voor logboeken en curl.
 *
 * ── Wat hier NIET in staat ─────────────────────────────────────────────────
 * Duits. Het dashboard heeft vier talen, dit formulier drie (nl/fr/en) -- en
 * dat is geen slordigheid: api/_lang.js zegt dat Meta de WhatsApp-sjablonen
 * vandaag alleen in nl/fr/en heeft goedgekeurd. Een Duitse formulierpagina
 * zou een lead in het Duits begroeten en hem daarna een Nederlandstalig
 * WhatsApp-sjabloon sturen. Half werkend is hier erger dan niet aanwezig.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const form = fs.readFileSync(path.join(BASE, 'api/form.js'), 'utf8');
const page = fs.readFileSync(path.join(BASE, 'api/form-page.js'), 'utf8');

/* De codes uit de server halen in plaats van ze hier over te typen: een lijst
   die met de hand wordt bijgehouden loopt achter zodra iemand een tiende fout
   toevoegt, en dan bewaakt deze test precies die nieuwe niet. */
const CODES = [...form.matchAll(/\{ code: '([a-z_]+)'/g)].map((m) => m[1]);

console.log('\n  elke fout die een lead kan zien heeft een code');
{
  ck('er zijn codes gevonden', CODES.length >= 9, CODES);
  ck('geen dubbele', new Set(CODES).size === CODES.length, CODES);
  /* Elke res.status(4xx/5xx).json in form.js moet er een hebben. Eén vergeten
     return valt terug op de generieke zin, en dan is de lead net zo ver. */
  const zonder = [...form.matchAll(/res\.status\((?:4|5)\d\d\)\.json\(\{ (?!code)([^}]*)\}/g)]
    .map((m) => m[1].trim().slice(0, 60))
    /* 405 Method not allowed bereikt geen lead: dat is een verkeerd verzoek
       van een script, niet iemand die een formulier invult. */
    .filter((t) => t.indexOf('Method not allowed') === -1);
  ck('geen enkele foutretour zonder code', zonder.length === 0, zonder);
}

console.log('\n  de pagina kent ze allemaal, in drie talen');
{
  for (const taal of ['nl', 'fr', 'en']) {
    /* Het taalblok uitsnijden tot aan het volgende, zodat een code die alleen
       in het Nederlands staat niet meetelt voor het Frans. */
    const start = page.indexOf("    " + taal + ": {");
    ck(taal + ': het taalblok bestaat', start > -1);
    if (start < 0) continue;
    const blok = page.slice(start, page.indexOf('srvErr', start) + 2200);
    const mist = CODES.filter((c) => blok.indexOf(c + ':') === -1);
    ck(taal + ': alle ' + CODES.length + ' codes hebben een zin', mist.length === 0, mist);
  }
}

console.log('\n  en de pagina kiest de code boven de serverzin');
{
  /* DIT is de regressie. Draait iemand de volgorde terug naar
     `d.error || I18N.srvErr[...]`, dan wint de Nederlandse zin weer en is al
     het bovenstaande onzichtbaar -- zonder dat er iets stukgaat. */
  ck('srvErr wordt eerst geprobeerd',
    /I18N\.srvErr\[d\.code\]\) \|\| I18N\.errGeneric/.test(page), null);
  ck('en d.error wordt niet meer rechtstreeks getoond',
    !/throw new Error\(d\.error/.test(page), null);
  ck('de tabel wordt ook echt in de pagina gezet',
    /srvErr:\s+\$\{JSON\.stringify\(t\.srvErr/.test(page), null);
}

console.log('\n  de zinnen zijn echt vertaald');
{
  /* Drie blokken naast elkaar nodigen uit tot plakken-en-vergeten. */
  const pak = (taal) => {
    const i = page.indexOf('srvErr', page.indexOf("    " + taal + ": {"));
    return page.slice(i, i + 1300);
  };
  const nl = pak('nl'), fr = pak('fr'), en = pak('en');
  ck('het Franse blok is geen kopie van het Nederlandse', nl !== fr);
  ck('het Engelse blok is geen kopie van het Nederlandse', nl !== en);
  ck('geen Nederlandse zinnen in het Franse blok',
    !/\b(Probeer|opnieuw|telefoonnummer|gegevens)\b/.test(fr), null);
  ck('geen Nederlandse zinnen in het Engelse blok',
    !/\b(Probeer|opnieuw|telefoonnummer|gegevens)\b/.test(en), null);
}

console.log('\n  de Nederlandse zin blijft staan als terugval');
{
  /* Niet weghalen. Een oude formulierpagina in iemands cache kent srvErr niet
     en valt terug op d.error; logboeken en curl lezen hem ook. De code is de
     toevoeging, niet de vervanging. */
  ck('form.js stuurt nog steeds een leesbare zin mee',
    /\{ code: 'busy', error: '[^']+' \}/.test(form), null);
}

/* ── En dan de enige controle die echt telt ──────────────────────────────────
   Alles hierboven leest tekst uit een bestand. Dat vindt een verkeerde string,
   maar niet een pagina die om een heel andere reden geen srvErr meekrijgt.
   Hier draait de echte render, met een Franstalige klant, en wordt de tabel
   uit de opgebouwde HTML teruggelezen.

   Dit is niet theoretisch: bij de eerste poging leek dezelfde wijziging klaar
   tot bleek dat de taal helemaal niet uit de URL komt maar uit het klantrecord
   in Airtable. Zonder deze render was dat pas bij een klant opgevallen. */
async function rendersMetKlant(klantNaam, taal) {
  const echt = global.fetch;
  global.fetch = async (url) => (String(url).indexOf('api.airtable.com') > -1
    ? { ok: true, status: 200, json: async () => ({ records: [{ id: 'rec1', fields: {
        'AI Name': 'Camille', 'Client Name': klantNaam, Language: taal, Niche: 'real_estate' } }] }) }
    : { ok: false, status: 500, json: async () => ({}) });
  const oudTok = process.env.API_AIRTABLE, oudBase = process.env.BASE_AIRTABLE;
  process.env.API_AIRTABLE = 'stub'; process.env.BASE_AIRTABLE = 'stub';
  try {
    /* Verse module: de taal wordt bij het bouwen van de pagina bepaald, en een
       gecachte require zou de vorige klant kunnen vasthouden. */
    delete require.cache[require.resolve(path.join(BASE, 'api/form-page.js'))];
    const mod = require(path.join(BASE, 'api/form-page.js'));
    const req = { method: 'GET', url: '/f/TEST', headers: { host: 'app.helvaro.pro' }, query: { code: 'TEST' } };
    return await new Promise((res) => {
      const resp = { setHeader() {}, status() { return this; }, send: res, end: (b) => res(b || ''), json: (o) => res(JSON.stringify(o)) };
      Promise.resolve(mod(req, resp)).catch((e) => res('FOUT: ' + e.message));
    });
  } finally {
    global.fetch = echt;
    process.env.API_AIRTABLE = oudTok; process.env.BASE_AIRTABLE = oudBase;
  }
}

async function rendersFrans() {
  const echt = global.fetch;
  global.fetch = async (url) => (String(url).indexOf('api.airtable.com') > -1
    ? { ok: true, status: 200, json: async () => ({ records: [{ id: 'rec1', fields: {
        'AI Name': 'Camille', 'Client Name': 'Immo Liege', Language: 'fr' } }] }) }
    : { ok: false, status: 500, json: async () => ({}) });
  const oudTok = process.env.API_AIRTABLE, oudBase = process.env.BASE_AIRTABLE;
  process.env.API_AIRTABLE = 'stub'; process.env.BASE_AIRTABLE = 'stub';
  try {
    const mod = require(path.join(BASE, 'api/form-page.js'));
    const req = { method: 'GET', url: '/f/TEST', headers: { host: 'app.helvaro.pro' }, query: { code: 'TEST' } };
    const html = await new Promise((res) => {
      const resp = { setHeader() {}, status() { return this; }, send: res, end: (b) => res(b || ''), json: (o) => res(JSON.stringify(o)) };
      Promise.resolve(mod(req, resp)).catch((e) => res('FOUT: ' + e.message));
    });
    return html;
  } finally {
    global.fetch = echt;
    process.env.API_AIRTABLE = oudTok; process.env.BASE_AIRTABLE = oudBase;
  }
}

(async () => {
  console.log('\n  de echte pagina, gerenderd voor een Franstalige klant');
  const html = await rendersFrans();
  ck('de pagina komt eruit', html.length > 5000, html.length);
  ck('en staat op lang="fr"', /<html lang="fr"/.test(html));
  const m = /srvErr:\s+(\{.*?\}),\n/s.exec(html);
  ck('de foutentabel zit in de pagina', !!m);
  if (m) {
    let tabel = null;
    try { tabel = JSON.parse(m[1]); } catch (e) { /* hieronder gemeld */ }
    ck('en is geldige JSON', !!tabel, m[1].slice(0, 120));
    if (tabel) {
      ck('met alle ' + CODES.length + ' codes', CODES.every((c) => tabel[c]), Object.keys(tabel));
      ck('en de zinnen zijn Frans, niet Nederlands',
        /Réessayez/.test(tabel.busy) && !/Probeer/.test(JSON.stringify(tabel)), tabel.busy);
    }
  }

  console.log('\n  Franse elisie: d\u2019Immo, niet de Immo');
  {
    /* Dit is de EERSTE zin die een Waalse lead van het bedrijf leest. Een
       ontbrekende elisie leest voor een Franstalige meteen als buitenlands --
       precies het tegenovergestelde van wat dit scherm moet doen.

       De h staat er BEWUST niet in: Frans kent een h muet (d\u2019Hôtel) en een
       h aspiré (de Hasselt), en welke het is valt niet uit de spelling af te
       leiden. Een regel die de helft van de tijd fout zit is erger dan geen
       regel. Vandaar dat Hasselt hieronder NIET geëlideerd hoort te worden. */
    const gevallen = [
      ['Immo Liege',      'fr', "d\u2019",  'klinker'],
      ['\u00c9toile Immo', 'fr', "d\u2019", 'klinker met accent'],
      ['Bureau Martin',   'fr', 'de ',  'medeklinker'],
      ['Hasselt Vastgoed','fr', 'de ',  'h blijft de'],
      ['Immo Liege',      'nl', 'van ', 'Nederlands elideert niet'],
      ['Immo Liege',      'en', 'from ','Engels elideert niet'],
    ];
    for (const [klant, taal, verwacht, waarom] of gevallen) {
      const html = await rendersMetKlant(klant, taal);
      const m = /<strong>[^<]*<\/strong>\s*([^<]*)<strong>/.exec(html);
      const gevonden = m ? m[1] : '(niet gevonden)';
      ck(taal + ' / ' + klant + ' -> ' + JSON.stringify(verwacht) + ' (' + waarom + ')',
        gevonden === verwacht, gevonden);
    }
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})();
