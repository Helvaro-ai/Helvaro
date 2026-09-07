'use strict';
/*
 * Het leadpaneel spreekt de taal van de klant -- maar de OPGESLAGEN waarden niet.
 *
 * ── Het onderscheid dat hier bewaakt wordt ─────────────────────────────────
 * De verliesredenen ("Prijs te hoog", "Geen timing", ...) zijn geen labels maar
 * WAARDEN. Ze gaan als keuzewaarde naar het Airtable-veld Reason op de
 * Leads-tabel, en api/_faro/writes.js controleert ze serverzijdig tegen een
 * vaste lijst (LOSS_REASONS).
 *
 * Vertaal je de waarde mee, dan gebeurt er dit: een Franse makelaar kiest
 * "Prix trop élevé", de server vergelijkt dat met zijn lijst van zes
 * Nederlandse zinnen, en weigert. Of -- als de controle ooit wegvalt -- komen
 * er vier talen door elkaar in een keuzeveld dat er zes kent, en is elk
 * rapport over verliesredenen stuk.
 *
 * Vandaar: het LABEL gaat door de vertaaltabel, de WAARDE nooit. Deze test
 * legt allebei de helften vast, want een test die alleen "het is vertaald"
 * controleert zou de gevaarlijke helft goedkeuren.
 */
process.env.FARO_WORKSPACE_ENABLED = '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path = require('path');
const BASE = path.join(__dirname, '..');
const writes = require(path.join(BASE, 'api/_faro/writes.js'));

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const dash = require(path.join(BASE, 'api/dashboard.js'));
function render(lang) {
  return new Promise((res) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + lang, headers: {}, query: { lang } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

(async () => {
  console.log('\n  de waarden blijven staan zoals de server ze kent');
  {
    const html = await render('fr');
    /* Dit is de regel die telt. Elke waarde uit LOSS_REASONS moet letterlijk
       als value= in de keuzelijst staan, in ELKE taal. */
    for (const reden of writes.LOSS_REASONS.filter(Boolean)) {
      ck('value="' + reden + '" staat in de Franse pagina',
        html.indexOf('value="' + reden + '"') !== -1, reden);
    }
  }

  console.log('\n  en de labels volgen de klant');
  {
    const proef = {
      fr: ['Prix trop', 'Raison de la perte', 'Absent'],
      en: ['Price too high', 'Loss reason', 'No-show'],
      de: ['Preis zu hoch', 'Verlustgrund', 'Nicht erschienen'],
    };
    for (const [taal, woorden] of Object.entries(proef)) {
      const html = await render(taal);
      const gemist = woorden.filter((w) => html.indexOf(w) === -1);
      ck(taal + ': de labels zijn vertaald', gemist.length === 0, gemist);
    }
  }

  console.log('\n  en het paneel valt nergens terug op Nederlands');
  {
    /* Alleen als zichtbare TEKST tussen tags, niet als value= -- die hoort er
       juist te staan. */
    const html = await render('en');
    const verboden = ['>Nog geen notities<', '>Geen taken<', '>Geen gesprekken gelogd<',
                      '>Niet gekomen<', '>Gekomen<', '>Afspraak resultaat<'];
    const gevonden = verboden.filter((v) => html.indexOf(v) !== -1);
    ck('geen Nederlandse labels meer in de Engelse pagina', gevonden.length === 0, gevonden);
  }

  console.log('\n  de pagina rendert nog (parseren is niet renderen)');
  {
    /* Deze regel staat er omdat het bij het schrijven van deze batch ECHT
       misging: ${escHtml(tr('...'))} zonder backslash in een client-sjabloon.
       De server evalueert die ${ dan zelf, escHtml bestaat daar niet, en elke
       klant kreeg het inlogscherm. node --check zag er niets van -- voor de
       parser is die hele pagina één string. */
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const html = await render(taal);
      ck(taal + ': de pagina komt er heel uit', html.length > 100000, html.length);
    }
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
