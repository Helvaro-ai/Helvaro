/*
 * Vastzitten en dan een e-mailadres krijgen.
 *
 * ── Wat er stond ────────────────────────────────────────────────────────────
 * Elke weg naar ons liep via een mailto. Op de privélaptop waar dit dashboard
 * vaak gelezen wordt opent dat het verkeerde account, of er staat helemaal geen
 * mailprogramma ingesteld en gebeurt er zichtbaar niets.
 *
 * Voor een losse vraag is dat vervelend. Voor twee gevallen is het erger, want
 * daar zit iemand vast en kan hij niet verder:
 *   • "Je account wordt nog ingericht" — hij kan niets in de app.
 *   • "WhatsApp koppelen" — zonder gekoppeld nummer doet het product niets.
 *
 * Een adres laten kopiëren lost dat niet op; het verplaatst het werk alleen.
 * Daarom verstuurt de app het bericht nu zelf (api/leads.js, mode:'support'),
 * met de klant als reply-to.
 *
 * ── Wat NIET verandert ──────────────────────────────────────────────────────
 * Mail aan een LEAD blijft een mailto. Dat is de eigen correspondentie van de
 * makelaar met zijn klant; die hoort niet via onze server te lopen, en de
 * voorgestelde tekst is daar het halve punt.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

// ── De pagina ───────────────────────────────────────────────────────────────
delete require.cache[require.resolve('../api/dashboard.js')];
const dash = require('../api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— het formulier bestaat en verstuurt echt —');
ck('toonSupportModal staat in de uitgestuurde pagina',
   /function toonSupportModal\(opties\)/.test(html), null);
ck('met een tekstvak',            /createElement\('textarea'\)/.test(html), null);
ck('en een verzendknop',          html.indexOf('Versturen') !== -1, null);
ck("het POST naar mode:'support'", /mode: 'support'/.test(html), null);
ck('naar /leads, waar de sessie al opgelost wordt',
   /fetch\(API_BASE \+ '\/leads'/.test(html), null);
ck('het is een echte dialoog voor schermlezers',
   /overlay\.setAttribute\('role', 'dialog'\)/.test(html), null);
ck('de status wordt hardop gemeld (aria-live)',
   /statusEl\.setAttribute\('aria-live', 'polite'\)/.test(html), null);
ck('bij een mislukking komt het adres alsnog in beeld',
   /function toonTerugval\(adres\)/.test(html), null);
ck('en de getypte tekst blijft dan staan',
   /je tekst staat hierboven/.test(html), null);
ck('Escape sluit niet terwijl er verstuurd wordt',
   /if \(e\.key === 'Escape' && !stuurBtn\.disabled\) sluit\(\)/.test(html), null);

console.log('\n— de twee gevallen waar iemand vastzit gaan NIET meer via mailto —');
{
  ck('"Account klaarzetten" is een knop die het formulier opent',
     /toonSupportModal\(\{[\s\S]{0,80}onderwerp: 'Account klaarzetten'/.test(html), null);
  ck('en geen mailto meer',
     html.indexOf("encodeURIComponent('Account klaarzetten')") === -1, null);

  ck('"WhatsApp koppelen" idem',
     /function vraagWhatsAppKoppeling\(\)/.test(html)
     && /onderwerp: 'WhatsApp koppelen'/.test(html), null);
  ck('en de oude voorgeschreven mailto is weg',
     html.indexOf('subject=WhatsApp%20koppelen&body=') === -1, null);
}

console.log('\n— geen enkele weg naar ONS support loopt nog via de mailclient —');
{
  const supportAnkers = (html.match(/<a\b[^>]*mailto:[^>]*>/g) || [])
    .filter(a => a.indexOf('hello@helvaro.pro') !== -1 || a.indexOf('SUPPORT_EMAIL') !== -1);
  const zonderFormulier = supportAnkers.filter(a => a.indexOf('toonSupportModal') === -1);
  ck('er zijn supportlinks gevonden om te controleren', supportAnkers.length >= 4, supportAnkers.length);
  ck('en ze openen allemaal het formulier',
     zonderFormulier.length === 0,
     zonderFormulier.map(a => a.slice(0, 120)).join('\n        '));
}

console.log('\n— maar mail aan een LEAD blijft van de makelaar zelf —');
{
  ck('de opvolg- en offertemail blijven een mailto',
     /mailtoOpvolging = 'mailto:\?subject=Opvolging/.test(html)
     && /mailtoOfferte = 'mailto:\?subject=Offerte/.test(html), null);
  ck('en lopen niet via onze server',
     !/mode: 'support'[\s\S]{0,400}Opvolging/.test(html), null);
}

// ── De server ───────────────────────────────────────────────────────────────
console.log('\n— de server accepteert geen afzender uit de body —');
{
  const leads = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/leads.js'), 'utf8');
  /* Grens op de 403-REGEL, niet op het woord: de uitleg boven het blok noemt
     TENANT_PENDING zelf ook, en daarmee liep de knip vóór het blok uit. */
  const blok = leads.slice(leads.indexOf("b.mode === 'support'"),
                           leads.indexOf("code: 'TENANT_PENDING'"));

  ck('de afzender komt uit de sessie',
     /const afzender =[\s\S]{0,200}clerkSession && clerkSession\.em/.test(blok), null);
  ck('en nergens uit b.email of b.afzender',
     !/b\.(email|afzender|from|van)\b/.test(blok), blok.match(/b\.\w+/g));
  ck('zonder sessie: 401',
     /if \(!clerkSession && !eigenSessie\)[\s\S]{0,120}401/.test(blok), null);
  ck('CSRF wordt gecontroleerd',        /_session\.csrfOk\(req\)/.test(blok), null);
  ck('er zit een snelheidsbegrenzer op', /_rl\.hit\('support'/.test(blok), null);
  ck('reply-to gaat naar de afzender',   /replyTo: afzender/.test(blok), null);
  ck('en de tekst wordt geëscaped voor de mail',
     /esc\(bericht\)/.test(blok), null);

  // Het belangrijkste: de wachtende gebruiker moet erdoor.
  const iSupport = leads.indexOf("b.mode === 'support'");
  const iPending = leads.indexOf("code: 'TENANT_PENDING'");
  ck('support staat VOOR de TENANT_PENDING-403, anders kan juist de wachtende het niet gebruiken',
     iSupport > -1 && iPending > -1 && iSupport < iPending, `support@${iSupport} pending@${iPending}`);
}


// ── En nu de handler echt aanroepen ─────────────────────────────────────────
// Bovenstaande leest de bron; dit meet het gedrag. Zonder dit zou een geldige
// tekst met een kapotte implementatie er nog steeds doorkomen.
(async () => {
  console.log('\n— de handler in bedrijf —');

  process.env.SESSION_SECRET = 'support-test-secret';
  process.env.SUPPORT_EMAIL  = 'support@voorbeeld.test';
  delete process.env.CLERK_ENABLED;

  const crypto = require('crypto');
  function maakToken(velden) {
    const secret = crypto.createHmac('sha256', process.env.SESSION_SECRET)
                         .update('helvaro-session-v1').digest('hex');
    const pl = Buffer.from(JSON.stringify(velden)).toString('base64url');
    return 'hvs1.' + pl + '.' + crypto.createHmac('sha256', secret).update(pl).digest('base64url');
  }

  // Vang wat er verstuurd zou worden, in plaats van echt te mailen.
  const verstuurd = [];
  const mailerPad = require.resolve('../api/_mailer.js');
  require.cache[mailerPad] = { id: mailerPad, filename: mailerPad, loaded: true,
    exports: { sendMail: async (m) => { verstuurd.push(m); return { ok: true, via: 'test' }; } } };

  delete require.cache[require.resolve('../api/leads.js')];
  const leadsHandler = require('../api/leads.js');

  function maakRes() {
    return { _code: 200, _json: null, _h: {},
      setHeader(k,v){ this._h[k]=v; return this; }, getHeader(k){ return this._h[k]; },
      status(c){ this._code=c; return this; }, json(o){ this._json=o; return this; },
      send(b){ this._json=b; return this; }, end(){ return this; } };
  }
  async function stuur({ cookie, csrf, body }) {
    const headers = { 'content-type': 'application/json' };
    const cookies = [];
    if (cookie) cookies.push('hv_session=' + cookie);
    if (csrf)   cookies.push('hv_csrf=' + csrf);
    if (cookies.length) headers.cookie = cookies.join('; ');
    if (csrf) headers['x-csrf-token'] = csrf;
    const res = maakRes();
    await leadsHandler({ method:'POST', url:'/api/leads', headers, query:{}, body,
                         socket:{ remoteAddress:'10.0.0.1' } }, res);
    return res;
  }

  const tok = maakToken({ em:'makelaar@kantoor.be', clientName:'Kantoor Teljo',
                          projectCode:'TELJO', exp: Date.now()+3600e3 });

  {
    const res = await stuur({ body:{ mode:'support', bericht:'Mijn WhatsApp doet niets.' } });
    ck('zonder sessie: 401', res._code === 401, res._code);
    ck('en er wordt niets gemaild', verstuurd.length === 0, verstuurd.length);
  }
  {
    const res = await stuur({ cookie: tok, csrf: 'abc', body:{ mode:'support', bericht:'Te kort?' } });
    ck('met sessie en CSRF: verstuurd', res._code === 200 && res._json && res._json.ok === true,
       res._code + ' ' + JSON.stringify(res._json));
    ck('precies één mail', verstuurd.length === 1, verstuurd.length);
    ck('naar het supportadres', verstuurd[0] && verstuurd[0].to === 'support@voorbeeld.test', verstuurd[0] && verstuurd[0].to);
    ck('met de klant als reply-to', verstuurd[0] && verstuurd[0].replyTo === 'makelaar@kantoor.be', verstuurd[0] && verstuurd[0].replyTo);
    ck('en de tenant erin, zodat wij weten wie het is',
       verstuurd[0] && verstuurd[0].html.indexOf('TELJO') !== -1, null);
  }
  {
    verstuurd.length = 0;
    const res = await stuur({ cookie: tok, csrf: 'abc',
      body:{ mode:'support', bericht:'x', onderwerp:'kort' } });
    ck('een leeg bericht wordt geweigerd', res._code === 400, res._code);
    ck('en er gaat niets uit', verstuurd.length === 0, verstuurd.length);
  }
  {
    verstuurd.length = 0;
    // Een afzender uit de body mag NIETS veranderen: anders is dit een relay.
    const res = await stuur({ cookie: tok, csrf: 'abc', body:{ mode:'support',
      bericht:'Hallo', email:'slachtoffer@ander.be', afzender:'slachtoffer@ander.be',
      replyTo:'slachtoffer@ander.be' } });
    ck('reply-to blijft de ingelogde gebruiker',
       res._code === 200 && verstuurd[0] && verstuurd[0].replyTo === 'makelaar@kantoor.be',
       verstuurd[0] && verstuurd[0].replyTo);
    ck('het opgegeven adres komt nergens in de mail',
       verstuurd[0] && JSON.stringify(verstuurd[0]).indexOf('slachtoffer@ander.be') === -1, null);
  }
  {
    verstuurd.length = 0;
    const res = await stuur({ cookie: tok, body:{ mode:'support', bericht:'Zonder csrf-token' } });
    ck('cookie-sessie zonder CSRF: 403', res._code === 403, res._code);
    ck('en er gaat niets uit', verstuurd.length === 0, verstuurd.length);
  }
  {
    // HTML in het bericht mag de mail niet kunnen kapen.
    verstuurd.length = 0;
    await stuur({ cookie: tok, csrf: 'abc',
      body:{ mode:'support', bericht:'<img src=x onerror=alert(1)>' } });
    ck('HTML in het bericht wordt geëscaped',
       verstuurd[0] && verstuurd[0].html.indexOf('<img') === -1
                    && verstuurd[0].html.indexOf('&lt;img') !== -1, null);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
