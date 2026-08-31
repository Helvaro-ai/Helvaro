/*
 * Inloggen, dashboard, er meteen weer uit -- en opnieuw.
 *
 * ── Wat de eigenaar zag ─────────────────────────────────────────────────────
 * Je logt in, het dashboard verschijnt, en een tel later sta je weer op het
 * inlogscherm. Opnieuw inloggen doet precies hetzelfde. Een lus.
 *
 * ── Waarom het gebeurde ─────────────────────────────────────────────────────
 * De echte sleutel is de httpOnly-cookie hv_session, en JavaScript mag die niet
 * lezen. tryAutoLogin() gokte daarom op twee markers in localStorage
 * (hv-client/hv-project) plus hv-exp. Die zeggen niets over de cookie. Was de
 * cookie weg -- privacy-instellingen, een webview, of gewoon verlopen terwijl
 * hv-exp nog een week meeging -- dan toonde de pagina toch het dashboard, kreeg
 * een 401 op de eerste API-call, en zette handleAuthExpired() je terug op het
 * inlogscherm. Opnieuw inloggen herschreef de markers, niet de cookie. Zelfde
 * lus.
 *
 * ── De oplossing ────────────────────────────────────────────────────────────
 * api/auth.js krijgt mode:'session': de server zegt of de cookie deugt. Dat is
 * alleen een HMAC-controle plus de intrekkingscheck, geen Airtable. De pagina
 * toont niets voordat dat antwoord binnen is.
 *
 * Dit bestand bewaakt twee dingen die los van elkaar stuk kunnen:
 *   1. het eindpunt accepteert precies wat api/leads.js accepteert, niet meer;
 *   2. de pagina vraagt het ook echt, en gokt niet meer.
 */
'use strict';

const crypto = require('crypto');
const path   = require('path');

process.env.SESSION_SECRET = 'sessie-lus-test-secret';
delete process.env.CLERK_ENABLED;      // klassieke pad, dat is waar de lus zat
delete process.env.ADMIN_KEY;

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 240));
  ok ? pass++ : fail++;
};

// ── Een sessietoken maken zoals api/auth.js dat doet ────────────────────────
function maakToken(velden, secretBase) {
  const base   = secretBase || process.env.SESSION_SECRET;
  const secret = crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
  const p      = Buffer.from(JSON.stringify(velden)).toString('base64url');
  const sig    = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  return `hvs1.${p}.${sig}`;
}

// ── Een nep-response die vastlegt wat de handler terugstuurt ────────────────
function maakRes() {
  const res = {
    _code: 200, _json: null, _headers: {},
    setHeader(k, v) { this._headers[k] = v; return this; },
    getHeader(k)    { return this._headers[k]; },
    status(c)       { this._code = c; return this; },
    json(o)         { this._json = o; return this; },
    send(b)         { this._json = b; return this; },
    end()           { return this; },
  };
  return res;
}

async function vraagSessie(cookieWaarde) {
  delete require.cache[require.resolve('../api/auth.js')];
  const auth = require('../api/auth.js');
  const req = {
    method:  'POST',
    url:     '/api/auth',
    headers: cookieWaarde ? { cookie: 'hv_session=' + cookieWaarde } : {},
    body:    { mode: 'session' },
    socket:  { remoteAddress: '127.0.0.1' },
  };
  const res = maakRes();
  await auth(req, res);
  return res;
}

(async () => {
  console.log('\n— het eindpunt bestaat en zegt nee tegen wie niets heeft —');
  {
    const res = await vraagSessie(null);
    ck('zonder cookie: 401', res._code === 401, res._code);
    ck('en geen tenant in het antwoord',
       !res._json || (!res._json.projectCode && res._json.ok !== true), JSON.stringify(res._json));
  }

  console.log('\n— een geldige sessie wordt herkend —');
  {
    const tok = maakToken({ clientName: 'Teljo', projectCode: 'TELJO', exp: Date.now() + 3600e3 });
    const res = await vraagSessie(tok);
    ck('200', res._code === 200, res._code);
    ck('ok:true', !!(res._json && res._json.ok === true), JSON.stringify(res._json));
    ck('met de projectcode UIT HET TOKEN, niet uit de body',
       res._json && res._json.projectCode === 'TELJO', JSON.stringify(res._json));
  }

  console.log('\n— en alles wat api/leads.js ook zou weigeren —');
  {
    const gevallen = [
      ['verlopen',            maakToken({ clientName: 'T', projectCode: 'TELJO', exp: Date.now() - 1000 })],
      ['zonder exp',          maakToken({ clientName: 'T', projectCode: 'TELJO' })],
      ['andere sleutel',      maakToken({ clientName: 'T', projectCode: 'TELJO', exp: Date.now() + 3600e3 }, 'een-ander-secret')],
      ['rommel',              'dit-is-geen-token'],
      ['leeg',                ''],
      ['verkeerd voorvoegsel', maakToken({ clientName: 'T', projectCode: 'TELJO', exp: Date.now() + 3600e3 }).replace('hvs1.', 'hvs2.')],
      ['afgeknot',            maakToken({ clientName: 'T', projectCode: 'TELJO', exp: Date.now() + 3600e3 }).slice(0, -6)],
    ];
    for (const [naam, tok] of gevallen) {
      const res = await vraagSessie(tok);
      ck(naam + ' → 401', res._code === 401, res._code + ' ' + JSON.stringify(res._json));
    }
  }

  console.log('\n— een geknoeide payload levert geen andermans tenant op —');
  {
    /* De aanval die telt: neem een geldig token, herschrijf projectCode naar een
       andere tenant, laat de handtekening staan. Slaagt dit, dan is elke tenant
       te bereiken met één bewerking in de adresbalk van de browser. */
    const echt   = maakToken({ clientName: 'Teljo', projectCode: 'TELJO', exp: Date.now() + 3600e3 });
    const sig    = echt.split('.')[2];
    const geknoeid = 'hvs1.' + Buffer.from(JSON.stringify(
      { clientName: 'Anders', projectCode: 'ANDERE-TENANT', exp: Date.now() + 3600e3 }
    )).toString('base64url') + '.' + sig;
    const res = await vraagSessie(geknoeid);
    ck('401, niet 200', res._code === 401, res._code);
    ck('en ANDERE-TENANT komt nergens in het antwoord voor',
       JSON.stringify(res._json || {}).indexOf('ANDERE-TENANT') === -1, JSON.stringify(res._json));
  }

  console.log('\n— een afgewezen cookie wordt ook opgeruimd —');
  {
    const res = await vraagSessie(maakToken({ clientName: 'T', projectCode: 'TELJO', exp: Date.now() - 1 }));
    const setCookie = JSON.stringify(res._headers['Set-Cookie'] || '');
    ck('de server stuurt hv_session leeg terug', /hv_session=;/.test(setCookie), setCookie);
    ck('met Max-Age=0', /Max-Age=0/.test(setCookie), setCookie);
  }
  {
    // Wie geen cookie meestuurde (Clerk, of gewoon uitgelogd) raakt niets kwijt.
    const res = await vraagSessie(null);
    ck('zonder cookie wordt er niets gewist', !res._headers['Set-Cookie'],
       JSON.stringify(res._headers['Set-Cookie'] || null));
  }

  console.log('\n— en de pagina gokt niet meer —');
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const mod = require('../api/dashboard.js');
    let html = '';
    await mod({ method: 'GET', url: '/dashboard', headers: {} },
              { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

    ck('tryAutoLogin is async geworden',
       /async function tryAutoLogin\(\)/.test(html), null);
    ck('en wordt ook awaited, anders is een Promise altijd waar',
       /if \(await tryAutoLogin\(\)\)/.test(html), null);
    ck('de helper die het de server vraagt staat er',
       /async function verifySessionServerside\(\)/.test(html), null);
    ck("en vraagt mode:'session'",
       /mode: 'session'/.test(html), null);
    ck('tryAutoLogin bevestigt vóór het iets toont',
       /const bevestigd = await verifySessionServerside\(\);[\s\S]{0,120}if \(!bevestigd\) \{ clearSession\(\); return false; \}/.test(html), null);

    /* De oude gok mag niet terugsluipen: state.apiKey op de sentinel zetten
       hoort NA de bevestiging te staan, niet ervoor. */
    const fn = (html.match(/async function tryAutoLogin\(\)[\s\S]*?\n\}/) || [''])[0];
    const iBevestig = fn.indexOf('await verifySessionServerside');
    const iSentinel = fn.indexOf("state.apiKey     = 'cookie-session'");
    ck('de sentinel wordt pas na de bevestiging gezet',
       iBevestig > -1 && iSentinel > -1 && iBevestig < iSentinel, `bevestig@${iBevestig} sentinel@${iSentinel}`);
  }


  /* ── De lus van 31 augustus: een token die er nog niet was ────────────────
     De vorige twee keer zat de oorzaak op de server. Deze keer in de browser.

     api/_clerk.js weigert bij een POST bewust de __session-cookie als bewijs
     (dat is de CSRF-grens) en accepteert alleen een Bearer-token. Dat token
     komt uit clerkToken(). Die functie keek SYNCHROON of window.Clerk bestond,
     terwijl de SDK asynchroon geladen wordt -- dus elke API-aanroep die voor
     het laden viel kreeg een lege string terug, ging zonder Authorization-
     header de deur uit, en kreeg 401.

     Wat de eigenaar zag: dashboard, er meteen weer uit, opnieuw ingelogd,
     eruit. In de productielogs 294x POST /api/leads met 401 en 152x POST
     /api/faro, in bursts van zes per seconde. GET's kwamen er wel door -- die
     mogen de cookie wel gebruiken -- en dat is waarom het "soms" leek te werken.

     Deze test VOERT clerkToken UIT met een Clerk die te laat komt, in plaats
     van naar de broncode te kijken. Een vormcontrole zou ook groen blijven bij
     een await op de verkeerde plek. */
  console.log('\n— clerkToken wacht op een Clerk die nog laadt —');
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const mod2 = require('../api/dashboard.js');
    let html = '';
    await mod2({ method: 'GET', url: '/dashboard', headers: {} },
               { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    const vm = require('vm');
    const bron = (html.match(/async function clerkToken\(\)[\s\S]*?\n\}/) || [''])[0];
    ck('clerkToken staat in de pagina', !!bron, null);

    const draai = async ({ vertraging, heeftUser }) => {
      const zand = {
        CLERK_READY: true,
        window: {},
        setTimeout,
        Promise,
        console: { warn() {}, error() {} },
        _initAangeroepen: 0,
      };
      /* clerkInit stelt de SDK pas na `vertraging` beschikbaar -- precies de
         race die live misging. */
      zand.clerkInit = function () {
        zand._initAangeroepen++;
        return new Promise((r) => setTimeout(() => {
          zand.window.Clerk = {
            user: heeftUser ? { id: 'u1' } : null,
            session: { getToken: async () => 'ECHT_TOKEN' },
          };
          r(zand.window.Clerk);
        }, vertraging));
      };
      vm.createContext(zand);
      vm.runInContext(bron + '; this.__f = clerkToken;', zand);
      return { token: await zand.__f(), zand };
    };

    const traag = await draai({ vertraging: 120, heeftUser: true });
    ck('een Clerk die 120ms later klaar is levert alsnog een token',
       traag.token === 'ECHT_TOKEN', traag.token);
    ck('en clerkInit is daarvoor echt afgewacht', traag.zand._initAangeroepen === 1, traag.zand._initAangeroepen);

    /* En het omgekeerde moet blijven kloppen: is er echt niemand ingelogd, dan
       hoort er een lege token uit te komen en mag er niet gewacht worden. */
    const zandUit = {
      CLERK_READY: true, window: { Clerk: { user: null, session: null } },
      setTimeout, Promise, console: { warn() {}, error() {} },
      clerkInit: async () => null,
    };
    vm.createContext(zandUit);
    vm.runInContext(bron + '; this.__f = clerkToken;', zandUit);
    const start = Date.now();
    const leeg = await zandUit.__f();
    ck('echt uitgelogd geeft een lege token', leeg === '', leeg);
    ck('en daar wordt niet op gewacht', Date.now() - start < 300, Date.now() - start);

    /* Het tweede gat: Clerk is geladen MET een gebruiker, maar de sessie is
       even null omdat hij ververst. Dat is een geldige sessie die nog niet
       klaar is, en daar hoort gewacht te worden. */
    const zandVerv = {
      CLERK_READY: true,
      window: { Clerk: { user: { id: 'u1' }, session: null } },
      setTimeout, Promise, console: { warn() {}, error() {} },
      clerkInit: async () => zandVerv.window.Clerk,
    };
    vm.createContext(zandVerv);
    vm.runInContext(bron + '; this.__f = clerkToken;', zandVerv);
    setTimeout(() => {
      zandVerv.window.Clerk.session = { getToken: async () => 'NA_VERVERSING' };
    }, 250);
    const naVerv = await zandVerv.__f();
    ck('een sessie die nog ververst wordt afgewacht', naVerv === 'NA_VERVERSING', naVerv);
  }

  /* De rem. Blijft er iets 401 geven, dan mag de app niet eeuwig knipperen
     tussen dashboard en inlogscherm. */
  console.log('\n— de lus heeft een rem —');
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const mod2 = require('../api/dashboard.js');
    let html = '';
    await mod2({ method: 'GET', url: '/dashboard', headers: {} },
               { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    ck('handleAuthExpired telt hoe vaak hij afgaat',
       /_authExpiredTijden/.test(html), null);
    ck('en geeft het na drie keer binnen 30 seconden op',
       /_authExpiredTijden\.length > 3/.test(html) && /_authOpgegeven = true/.test(html), null);
    ck('waarbij de pollers stilgezet worden',
       /_authOpgegeven[\s\S]{0,400}state\.apiKey = ''/.test(html), null);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
