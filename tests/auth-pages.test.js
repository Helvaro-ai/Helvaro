/*
 * Wachtwoordpagina's en inlogfouten (herontwerp 2026-10-02).
 *
 * - /forgot-password, /reset-password en /verify-email komen in de taal van
 *   de bezoeker, in de podiumstijl, zonder het oude blauw.
 * - Een token in de URL kan het script niet breken.
 * - Het inlogscherm toont geen rauwe Nederlandse serverfout in een andere taal
 *   en wist een oude foutmelding bij een nieuwe poging.
 */
'use strict';

const vm = require('vm');
const pages = require('../api/_auth-pages.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

function render(fn, url) {
  let html = '';
  const res = { setHeader() {}, status() { return this; }, send(b) { html = String(b); } };
  fn({ url, headers: {} }, res);
  return html;
}

console.log('\nWachtwoordpagina\'s');
const en = render(pages.renderForgotPage, '/forgot-password?lang=en');
ck('vergeten: Engels', /<html lang="en"/.test(en) && /Forgot your password\?/.test(en), en.slice(0, 200));
ck('vergeten: geen Nederlands in de Engelse versie', !/Wachtwoord vergeten|Terug naar inloggen/.test(en));
ck('geen oud blauw meer', !/#1e6fd9/i.test(en));
ck('podiumkleuren', /#17140F/.test(en) && /#E8D7B1/.test(en));

const nl = render(pages.renderForgotPage, '/forgot-password?lang=nl');
ck('vergeten: Nederlands', /Wachtwoord vergeten\?/.test(nl));

const kwaad = render(pages.renderResetPage, '/reset-password?lang=de&token=' + encodeURIComponent('abc</script><script>alert(1)</script>'));
ck('reset: Duits', /Wähle ein neues Passwort/.test(kwaad));
/* 2 = het themascriptje in <head> (licht standaard, hv-theme-v2) + het paginascript. Een ingespoten </script> maakt er 3 van: de test bewaakt nog steeds precies hetzelfde. */
ck('reset: token kan het script niet sluiten', (kwaad.match(/<\/script>/g) || []).length === 2, kwaad.match(/TOKEN = .*/));
const scripts = kwaad.match(/<script>([\s\S]*?)<\/script>/);
let parseert = true;
try { new vm.Script(scripts[1]); } catch (e) { parseert = e.message; }
ck('reset: het script parseert', parseert === true, parseert);

const ok = pages.verifyResultPage({ url: '/verify-email?lang=fr', headers: {} }, true, 'pw.verify.gedaan');
ck('verify: Frans, met vinkje', /Confirmé/.test(ok) && /<svg/.test(ok) && !/✓/.test(ok));

console.log('\nInlogfouten');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
const login = src.slice(src.indexOf('async function handleLogin()'), src.indexOf('PIPELINE (KANBAN)'));
ck('oude fout wordt gewist bij een nieuwe poging', /errEl\.textContent = '';/.test(login));
ck('leeg wachtwoord wordt niet verstuurd', /if \(!password\)/.test(login));
ck('geen rauwe Nederlandse fallback meer', !/Inloggen mislukt|Even geduld\. Opnieuw/.test(login));
ck('status 401 geeft de vertaalde melding', /status === 401 \? tr\('log\.fout'\)/.test(login));

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
