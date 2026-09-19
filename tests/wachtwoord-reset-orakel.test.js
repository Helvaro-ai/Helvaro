/*
 * Security-aanvalspas (Fase 10) — e-mailenumeratie via wachtwoordherstel.
 *
 * ── De vondst ────────────────────────────────────────────────────────────
 * api/auth.js's mode:'request-reset' gaf een 404 "Dit e-mailadres is bij ons
 * niet bekend" voor een onbekend adres, tegenover een 200 met "Resetlink
 * verstuurd naar X" voor een bestaand, actief account. mode:'resend-
 * verification' deed exact hetzelfde: 404 voor onbekend, 200 voor bekend.
 *
 * Dat is een orakel. Beide endpoints zitten achter dezelfde IP-teller als
 * gewoon inloggen (40 per 15 minuten, zie isRateLimited() in api/auth.js) —
 * ruim genoeg om een lijst adressen te toetsen en te weten welke daarvan een
 * Helvaro-account hebben. Dat is precies de informatie die de gewone
 * inlogfout ("Verkeerd e-mailadres of wachtwoord", altijd hetzelfde voor een
 * onbekend adres én een fout wachtwoord) elders in ditzelfde bestand BEWUST
 * verbergt — de twee reset-modi waren de enige plek die het contract nog
 * schond.
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────
 * Voor beide modi: een onbekend adres en een bekend, actief adres krijgen
 * hetzelfde statuscode EN dezelfde boodschap terug. Alleen aan de zijkant
 * (het testbestand vangt sendMail op) is te zien of er echt gemaild werd —
 * dat blijft correct: alleen het bestaande account krijgt een echte mail.
 *
 * Niet hier getest (buiten scope van deze aanvalspas): het 403
 * 'email_not_verified'-pad in request-reset lekt nog altijd "dit adres
 * bestaat, maar is niet geverifieerd" — dat is een bewuste productkeuze
 * (de verificatiegate zelf) en een kleiner/lager-waarde orakel dan het
 * bestaan-of-niet-onderscheid dat hier gerepareerd is. Zie het rapport van
 * deze aanvalspas voor de afweging.
 */
'use strict';

process.env.SESSION_SECRET = 'reset-orakel-test-secret';
process.env.BASE_AIRTABLE  = 'appZelftest';
process.env.API_AIRTABLE   = 'patZelftest';
delete process.env.CLERK_ENABLED;
delete process.env.ADMIN_KEY;
delete process.env.OWNER_EMAIL;
delete process.env.OWNER_PASSWORD_HASH;
// Geen Upstash: de teller valt terug op in-memory, en 8 verzoeken over
// verschillende testfaken-IP's blijft ruim onder de 40/15min-limiet.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const USERS_TABLE   = 'tbl2hrPW7gIx5XF4S';
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

const BEKEND_EMAIL = 'bekend@voorbeeld.be';
const USER_REC = {
  id: 'recUser1',
  fields: {
    Email: BEKEND_EMAIL,
    Active: 1,
    'Password Hash': '$2a$10$abcdefghijklmnopqrstuv', // vorm is genoeg, wordt niet geverifieerd hier
    'Project Code': 'TENANT_BEKEND',
  },
};

function formulaEmail(url) {
  const qs = url.split('?')[1] || '';
  const raw = decodeURIComponent(new URLSearchParams(qs).get('filterByFormula') || '');
  const m = /\{Email\}="([^"]*)"/.exec(raw);
  return m ? m[1] : '';
}

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes(USERS_TABLE)) {
    const email = formulaEmail(u);
    const records = email === BEKEND_EMAIL ? [USER_REC] : [];
    return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
  }
  if (u.includes(CLIENTS_TABLE)) {
    // Geen Client Config record: de verificatiegate faalt open (zie
    // auth.js's opmerking bij request-reset) en resend-verification neemt
    // zijn eigen "niets te bevestigen"-tak — allebei nog altijd 200/neutraal.
    return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};

// sendMail() opvangen i.p.v. echt te versturen (geen SMTP_* in de testomgeving).
const verstuurd = [];
const mailerPad = require.resolve('../api/_mailer.js');
require.cache[mailerPad] = {
  id: mailerPad, filename: mailerPad, loaded: true,
  exports: { sendMail: async (m) => { verstuurd.push(m); return { ok: true, via: 'test' }; } },
};

function maakRes() {
  return {
    _code: 200, _json: null, _h: {},
    setHeader(k, v) { this._h[k] = v; return this; },
    getHeader(k)    { return this._h[k]; },
    status(c)       { this._code = c; return this; },
    json(o)         { this._json = o; return this; },
    send(b)         { this._json = b; return this; },
    end()           { return this; },
  };
}

let ipTeller = 0;
async function roep(mode, email) {
  delete require.cache[require.resolve('../api/auth.js')];
  const auth = require('../api/auth.js');
  ipTeller += 1;
  const req = {
    method: 'POST',
    url: '/api/auth',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${ipTeller}.1` },
    body: { mode, email },
    socket: { remoteAddress: `10.9.${ipTeller}.1` },
  };
  const res = maakRes();
  await auth(req, res);
  return res;
}

(async () => {
  console.log('\n— request-reset: onbekend en bekend adres geven HETZELFDE antwoord —');
  {
    verstuurd.length = 0;
    const onbekend = await roep('request-reset', 'nooit-geregistreerd@voorbeeld.be');
    const bekend   = await roep('request-reset', BEKEND_EMAIL);

    ck('onbekend adres: geen 404 meer', onbekend._code !== 404, onbekend._code);
    ck('onbekend adres: 200', onbekend._code === 200, onbekend._code);
    ck('bekend adres: 200', bekend._code === 200, bekend._code);
    ck('zelfde statuscode voor beide', onbekend._code === bekend._code,
       { onbekend: onbekend._code, bekend: bekend._code });
    ck('zelfde boodschap voor beide (geen orakel in de body)',
       onbekend._json && bekend._json && onbekend._json.message === bekend._json.message,
       { onbekend: onbekend._json, bekend: bekend._json });
    ck('en toch: alleen het BESTAANDE account kreeg echt een mail',
       verstuurd.length === 1 && verstuurd[0].to === BEKEND_EMAIL, verstuurd);
  }

  console.log('\n— resend-verification: zelfde orakel, zelfde reparatie —');
  {
    verstuurd.length = 0;
    const onbekend = await roep('resend-verification', 'ook-nooit-geregistreerd@voorbeeld.be');
    const bekend   = await roep('resend-verification', BEKEND_EMAIL);

    ck('onbekend adres: geen 404 meer', onbekend._code !== 404, onbekend._code);
    ck('onbekend adres: 200', onbekend._code === 200, onbekend._code);
    ck('bekend adres: 200', bekend._code === 200, bekend._code);
    ck('zelfde statuscode voor beide', onbekend._code === bekend._code,
       { onbekend: onbekend._code, bekend: bekend._code });
    // Bekend adres heeft hier geen Client Config record (zie mock hierboven),
    // dus neemt ook DIE de "geen record te vinden"-tak — beide berichten
    // moeten dus letterlijk gelijk zijn.
    ck('zelfde boodschap voor beide (geen orakel in de body)',
       onbekend._json && bekend._json && onbekend._json.message === bekend._json.message,
       { onbekend: onbekend._json, bekend: bekend._json });
  }

  console.log('\n— ongeldig e-mailadres blijft gewoon 400, dat is geen orakel —');
  {
    const res = await roep('request-reset', 'geen-email');
    ck('400 voor onleesbaar adres', res._code === 400, res._code);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
