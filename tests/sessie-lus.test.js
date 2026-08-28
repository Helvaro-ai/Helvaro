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

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
