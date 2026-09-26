'use strict';
/*
 * Het privacybeleid zegt wat het product echt verzamelt (audit 26/09).
 *
 * Het beleid beloofde "wij verzamelen standaard geen e-mailadres van u als
 * lead", terwijl het formulier (api/form.js), het websitevenster
 * (api/_assistent.js) en de mailboxkoppeling (api/_email/mailbox.js) dat wel
 * doen. Deze test leest de gerenderde pagina in beide talen.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 200)}`); ok ? pass++ : fail++; };

const handler = require(BASE + 'api/privacy.js');
function render(url, headers) {
  return new Promise((klaar) => {
    let body = '';
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; },
      send(b) { body = String(b); klaar(body); }, end(b) { body = String(b || ''); klaar(body); } };
    Promise.resolve(handler({ url, query: {}, headers: headers || {}, method: 'GET' }, res)).catch((e) => klaar('ERR ' + e.message));
  });
}

(async () => {
  const nl = await render('/privacy?lang=nl');
  const en = await render('/privacy?lang=en');
  ck('de Nederlandse pagina rendert', /Privacybeleid/.test(nl), nl.slice(0, 120));
  ck('de Engelse pagina rendert', /Privacy Policy/.test(en), en.slice(0, 120));

  console.log('\n  geen belofte die niet klopt');
  ck('NL beweert niet meer dat er geen e-mailadres verzameld wordt', !/geen e-mailadres van u als lead/i.test(nl));
  ck('EN idem', !/do not collect an e-mail address/i.test(en));

  console.log('\n  de kanalen die het product echt heeft');
  for (const [taal, html, woorden] of [
    ['NL', nl, [/e-mailadres/, /chatvenster/, /bijlagen/, /Microsoft/, /Gmail/]],
    ['EN', en, [/e-mail address/, /chat window/, /attachments/, /Microsoft/, /Gmail/]],
  ]) {
    for (const w of woorden) ck(`${taal} noemt ${w.source}`, w.test(html));
  }
  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
