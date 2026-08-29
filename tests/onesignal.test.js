/*
 * OneSignal — webpush.
 *
 * ── Waarom hier zoveel over TOESTEMMING staat ───────────────────────────────
 * Een browser vraagt maar één keer. Klikt iemand "blokkeren", dan kan de site
 * dat zelf nooit meer terugdraaien -- de klant moet het in zijn instellingen
 * gaan opzoeken, en dat doet niemand. Een ongevraagde vraag bij het inloggen is
 * dus geen kleine irritatie maar een permanent verloren kanaal.
 *
 * Precies dat deed het dashboard: requestNotificationPermission() stond in
 * startDashboard(). Die is weg. De vraag hoort achter een klik, en nergens
 * anders. Deze test bewaakt dat.
 *
 * ── En waarom de CSP hier getest wordt ──────────────────────────────────────
 * De pagina draait onder een strakke Content-Security-Policy. Staat
 * cdn.onesignal.com daar niet in, dan wordt het script geblokkeerd en gebeurt
 * er niets -- geen foutmelding in beeld, alleen een lege console. Andersom moet
 * de policy weer dichtgaan zodra OneSignal uitstaat.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

/* De pagina opnieuw opbouwen met een gekozen ONESIGNAL_APP_ID. */
function render(appId) {
  const oud = process.env.ONESIGNAL_APP_ID;
  if (appId === null) delete process.env.ONESIGNAL_APP_ID;
  else process.env.ONESIGNAL_APP_ID = appId;
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  let html = '', headers = {};
  dash({ method: 'GET', url: '/dashboard', headers: {} }, {
    setHeader(k, v) { headers[k] = v; },
    status() { return this; }, send(b) { html = String(b); }, json() {}, end() {},
  });
  if (oud === undefined) delete process.env.ONESIGNAL_APP_ID; else process.env.ONESIGNAL_APP_ID = oud;
  return { html, csp: headers['Content-Security-Policy'] || '' };
}

console.log('\n— de service worker staat er, letterlijk zoals voorgeschreven —');
{
  const p = path.join(__dirname, '..', 'public', 'OneSignalSDKWorker.js');
  ck('het bestand bestaat', fs.existsSync(p), p);
  const inhoud = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
  /* De handleiding is hier expliciet: dit ene regeltje, niet zelf verzinnen. */
  ck('met exact de voorgeschreven regel',
     inhoud === 'importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");', inhoud);

  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const rw = vercel.rewrites.find((r) => r.source === '/OneSignalSDKWorker.js');
  /* Hij MOET vanaf de root van het domein te halen zijn, anders weigert de
     browser de worker te registreren voor de hele site. */
  ck('en is vanaf de root bereikbaar', !!rw, JSON.stringify(vercel.rewrites.slice(0, 3)));
  ck('wijzend naar het bestand in public/',
     !!rw && rw.destination === '/public/OneSignalSDKWorker.js', rw && rw.destination);
}

console.log('\n— aan: script geladen en de CSP laat precies genoeg toe —');
{
  const { html, csp } = render('8302e5a5-e792-4fb0-a258-44c672539aa8');
  ck('het paginascript van v16 wordt geladen',
     html.indexOf('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js') > -1, null);
  ck('het app-id staat in de pagina',
     html.indexOf('8302e5a5-e792-4fb0-a258-44c672539aa8') > -1, null);
  ck('script-src laat de CDN toe', /script-src[^;]*https:\/\/cdn\.onesignal\.com/.test(csp), csp.slice(0, 200));
  ck('connect-src laat de API toe',  /connect-src[^;]*https:\/\/api\.onesignal\.com/.test(csp), csp.slice(0, 240));
  /* De worker komt van onze eigen host; 'self' volstaat en er hoeft dus GEEN
     vreemde host bij worker-src. Losser dan nodig is ook fout. */
  ck('en worker-src blijft op self', /worker-src 'self'/.test(csp) && !/worker-src[^;]*onesignal/.test(csp), null);
}

console.log('\n— uit: dan ook echt uit, en de policy gaat weer dicht —');
{
  const { html, csp } = render('');
  ck('geen script', html.indexOf('cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js') === -1, null);
  ck('geen onesignal in script-src',  !/script-src[^;]*onesignal/.test(csp), csp.slice(0, 200));
  ck('geen onesignal in connect-src', !/connect-src[^;]*onesignal/.test(csp), csp.slice(0, 240));
}

console.log('\n— er wordt NOOIT uit zichzelf om toestemming gevraagd —');
{
  const { html } = render('8302e5a5-e792-4fb0-a258-44c672539aa8');
  const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
    .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

  /* Commentaar eruit voordat er iets beweerd wordt. De uitleg BOVEN de
     verwijderde aanroep noemt "requestNotificationPermission()" letterlijk, en
     een test die op die tekst zoekt zou dus blijven klagen over code die er
     niet meer staat -- of erger, groen blijven als iemand de aanroep terugzet
     en het commentaar weghaalt. Zelfde valkuil als eerder bij min-width:0. */
  const kaal = js.replace(/\/\*[\s\S]*?\*\//g, '');

  /* De oude boosdoener: dit stond in startDashboard() en vroeg het meteen na
     het inloggen. */
  ck('requestNotificationPermission bestaat niet meer',
     kaal.indexOf('function requestNotificationPermission') === -1, null);
  ck('en wordt nergens meer aangeroepen',
     kaal.indexOf('requestNotificationPermission()') === -1, null);
  ck('Notification.requestPermission staat nergens los in de pagina',
     kaal.indexOf('Notification.requestPermission()') === -1, null);

  /* De enige plek waar het nog mag: in de klikafhandelaar van de knop. */
  const knopBlok = (js.match(/knop\.addEventListener\('click'[\s\S]{0,500}?\}\);/) || [''])[0];
  ck('OneSignal vraagt het alleen vanuit een klik',
     /requestPermission\(\)/.test(knopBlok), knopBlok.slice(0, 200));
}

console.log('\n— starten gebeurt na het inloggen, niet op het inlogscherm —');
{
  const { html } = render('8302e5a5-e792-4fb0-a258-44c672539aa8');
  const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
    .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';
  ck('startDashboard start OneSignal',
     /async function startDashboard\([\s\S]{0,1200}oneSignalStart\(\)/.test(js), null);
  ck('en init draait maar één keer', /if \(_osGestart \|\| !ONESIGNAL_APP_ID\) return;/.test(js), null);
  /* Zonder externalId is elk abonnement anoniem en later niet te richten op
     één kantoor -- bij een product met meerdere klanten is dat het hele punt. */
  ck('het abonnement wordt aan de tenant gekoppeld',
     /OneSignal\.login\(project\)/.test(js), null);
  ck('en losgekoppeld bij het ECHTE uitloggen (niet bij annuleren)',
     /function performLogout\(\)[\s\S]{0,700}oneSignalLoskoppelen\(\)/.test(js)
     && !/function logout\(\)[\s\S]{0,200}oneSignalLoskoppelen\(\)/.test(js), null);
}

console.log('\n— het bevestigingsvenster is er, maar niet voor klanten —');
{
  const { html } = render('8302e5a5-e792-4fb0-a258-44c672539aa8');
  const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
    .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';
  ck('het venster bestaat', /function oneSignalToonBevestiging\(\)/.test(js), null);
  ck('met de voorgeschreven tekst',
     js.indexOf('Your OneSignal SDK integration is complete!') > -1, null);
  /* Engelse ontwikkelaarstekst hoort niet bij een Vlaamse makelaar op het
     scherm. Wel gebouwd, alleen op verzoek. */
  ck('de vlag wordt uit de URL gelezen',
     /function osVerificatieGevraagd\(\)[\s\S]{0,220}onesignal'\) === 'verify'/.test(js), null);
  /* En dat de vlag het venster ECHT tegenhoudt. Alleen controleren dat de
     functie bestaat is niet genoeg: haal je de if weg, dan blijft die functie
     staan en kreeg elke klant alsnog Engelse ontwikkelaarstekst te zien. */
  ck('en houdt het venster daadwerkelijk tegen',
     /if \(osVerificatieGevraagd\(\)\) oneSignalToonBevestiging\(\);/.test(js), null);
  ck('en hooguit één keer', /_osDialoogGetoond = true;/.test(js), null);
  /* "local-..." is het tijdelijke id dat de SDK meteen zet; daarop reageren
     geeft een venster voordat het apparaat echt geregistreerd is. */
  ck('een tijdelijk local-id telt niet als geabonneerd',
     /indexOf\('local-'\) !== 0/.test(js), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
