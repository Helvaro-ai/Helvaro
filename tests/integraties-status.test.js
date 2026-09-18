/*
 * De eenheidsvorm voor koppelingsstatus (api/_integraties.js) -- deliverable
 * "Integration status contract", platform-integriteit pass.
 *
 * ── Wat dit bewijst ────────────────────────────────────────────────────────
 * 1. Elke van...()-normalisator geeft precies de vorm uit de deliverable:
 *    {id, status, since, lastOk, lastError, action}, met status/action
 *    geklemd op de toegestane waarden.
 * 2. "Er staat een sleutel" is NIET hetzelfde als "connected" -- een
 *    koppeling met needsReauth/laatsteFout/mislukte probe geeft nooit
 *    status 'connected' terug (de bug die deze hele deliverable aanleiding
 *    gaf).
 * 3. api/_drive.js status() doet nu een echte probe zodra er iets gekoppeld
 *    staat, zelfde aanpak als api/leads.js gcal-status.
 */
'use strict';

process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'patTEST';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';
process.env.GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || 'client-test';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'secret-test';
process.env.GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || 'https://app.test/gcal';

const integraties = require('../api/_integraties');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

(async () => {

console.log('\n— normaliseer(): klemt op de toegestane statussen/acties —');
{
  const raar = integraties.normaliseer({ id: 'x', status: 'iets_verzonnens', action: 'iets_anders' });
  ck('onbekende status -> error', raar.status === 'error', raar);
  ck('onbekende status geeft actie reconnect/connect, nooit none', raar.action !== 'none', raar);
  const goed = integraties.normaliseer({ id: 'y', status: 'connected' });
  ck('connected zonder actie -> none', goed.action === 'none', goed);
}

console.log('\n— Google Agenda: een opgeslagen token dat niet werkt is NOOIT connected —');
{
  const nietGeconfigureerd = integraties.vanGcal({ configured: false });
  ck('niet geconfigureerd', nietGeconfigureerd.status === 'not_configured', nietGeconfigureerd);
  ck('actie none (er valt niets te koppelen door de klant)', nietGeconfigureerd.action === 'none', nietGeconfigureerd);

  const nooitGekoppeld = integraties.vanGcal({ configured: true, connected: false });
  ck('nooit gekoppeld -> disconnected', nooitGekoppeld.status === 'disconnected', nooitGekoppeld);
  ck('actie connect', nooitGekoppeld.action === 'connect', nooitGekoppeld);

  const verlopen = integraties.vanGcal({ configured: true, connected: true, needsReauth: true });
  ck('token staat er, maar de probe faalde -> expired (NIET connected)', verlopen.status === 'expired', verlopen);
  ck('actie reconnect', verlopen.action === 'reconnect', verlopen);
  ck('lastError zonder OAuth/token-jargon (i18n-sleutel, geen rauwe tekst)',
     verlopen.lastError && verlopen.lastError.safeMessage === 'int.gcal.expired', verlopen);
  ck('geen "oauth" of "token" in de safeMessage', !/oauth|token/i.test(verlopen.lastError.safeMessage), verlopen);

  const werkt = integraties.vanGcal({ configured: true, connected: true, needsReauth: false });
  ck('token staat er EN de probe lukte -> connected', werkt.status === 'connected', werkt);
  ck('lastOk gezet', Boolean(werkt.lastOk), werkt);
}

console.log('\n— CRM-adapters: dezelfde vorm als elk ander koppelingstype —');
{
  const status = {
    beschikbaar: [
      { naam: 'hubspot', label: 'HubSpot', beschikbaar: true },
      { naam: 'pipedrive', label: 'Pipedrive', beschikbaar: true },
      { naam: 'whise', label: 'Whise', beschikbaar: false }, // nog niet beschikbaar -- zie ./adapters/whise.js
    ],
    verbonden: [
      { naam: 'hubspot', account: 'kantoor', verbondenOp: '2026-09-01T10:00:00.000Z', laatsteFout: null },
      { naam: 'pipedrive', account: 'kantoor2', verbondenOp: '2026-09-02T10:00:00.000Z', laatsteFout: 'HubSpot accepteerde de sleutels niet.' },
    ],
  };
  const rijen = integraties.crmVoorTenant(status);
  ck('drie adapters -> whise (beschikbaar:false) telt niet mee', rijen.length === 2, rijen);
  const hub = rijen.find((r) => r.id === 'crm:hubspot');
  const pd  = rijen.find((r) => r.id === 'crm:pipedrive');
  ck('hubspot verbonden zonder fout -> connected', hub.status === 'connected', hub);
  ck('pipedrive verbonden MET laatsteFout -> error, NIET connected', pd.status === 'error', pd);
  ck('een kapotte koppeling krijgt actie reconnect', pd.action === 'reconnect', pd);
  ck('geen adapter-specifieke leveranciersfout in de safeMessage', !/hubspot/i.test(pd.lastError.safeMessage), pd);

  const nietGekoppeld = integraties.vanCrmAdapter('salesforce', 'Salesforce', null);
  ck('niet gekoppeld CRM -> disconnected, actie connect',
     nietGekoppeld.status === 'disconnected' && nietGekoppeld.action === 'connect', nietGekoppeld);
}

console.log('\n— Drive (admin-only): status() doet nu een echte probe —');
{
  const _gcal = require('../api/_gcal');
  const origDecrypt = _gcal.decryptToken;
  const origGetAccess = _gcal.getAccessToken;
  const _drive = require('../api/_drive');

  // We testen via de normalisator met handgemaakte input (geen live Drive-call
  // nodig): vanDrive() is puur, en de probe-toevoeging aan _drive.status()
  // zelf wordt hieronder los getest via de echte functie met een gemockte
  // _gcal.getAccessToken.
  const nietGeconfigureerd = integraties.vanDrive({ configured: false });
  ck('niet geconfigureerd', nietGeconfigureerd.status === 'not_configured', nietGeconfigureerd);

  const nietGekoppeld = integraties.vanDrive({ configured: true, gekoppeld: false });
  ck('niet gekoppeld -> disconnected', nietGekoppeld.status === 'disconnected', nietGekoppeld);

  const kapot = integraties.vanDrive({ configured: true, gekoppeld: true, verbonden: false, laatsteFoutCode: 'token_verlopen' });
  ck('gekoppeld maar de probe faalde -> expired, NIET connected', kapot.status === 'expired', kapot);
  ck('lastError draagt de eigen foutcode, geen leverancierstekst',
     kapot.lastError && kapot.lastError.safeMessage === 'token_verlopen', kapot);

  const werkt = integraties.vanDrive({ configured: true, gekoppeld: true, verbonden: true, laatsteSync: '2026-09-18T08:00:00.000Z' });
  ck('gekoppeld EN de probe lukte -> connected', werkt.status === 'connected', werkt);
  ck('lastOk = laatsteSync', werkt.lastOk === '2026-09-18T08:00:00.000Z', werkt);

  // Nu de ECHTE _drive.status() met een gemockte Google-laag, om te bewijzen
  // dat de probe er ook werkelijk IN zit (niet alleen de normalisator eromheen).
  process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';
  const atSettings = {};
  global.fetch = async (url, opts = {}) => {
    const m = (opts.method || 'GET').toUpperCase();
    if (/api\.airtable\.com/.test(String(url))) {
      const key = decodeURIComponent((String(url).match(/filterByFormula=([^&]+)/) || [])[1] || '').match(/\{key\}="([^"]+)"/);
      if (m === 'GET') {
        const s = key && atSettings[key[1]];
        return { ok: true, status: 200, json: async () => ({ records: s ? [{ id: s.id, fields: { key: key[1], value: s.value } }] : [] }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'recX', fields: {} }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  atSettings.drive_refresh_token = { id: 'r1', value: 'x' };
  atSettings.drive_email = { id: 'r2', value: 'sindi@example.test' };

  _gcal.decryptToken = () => 'refresh-plain';
  _gcal.getAccessToken = async () => { throw new Error('invalid_grant: token expired'); };
  const s1 = await _drive.status();
  ck('_drive.status(): gekoppeld true, maar verbonden false na een mislukte probe',
     s1.gekoppeld === true && s1.verbonden === false, s1);
  ck('_drive.status(): geen rauwe Google-foutmelding in laatsteFoutCode',
     !/invalid_grant/i.test(s1.laatsteFoutCode || ''), s1);

  _gcal.getAccessToken = async () => 'toegang-ok';
  const s2 = await _drive.status();
  ck('_drive.status(): een werkende probe geeft verbonden true', s2.verbonden === true, s2);

  _gcal.decryptToken = origDecrypt;
  _gcal.getAccessToken = origGetAccess;
}

console.log('\n— eigen WhatsApp-nummer: geen eigen nummer is GEEN storing —');
{
  const uit = integraties.vanWaEigenNummer({ beschikbaar: true, gekoppeld: false });
  ck('geen eigen nummer -> disconnected (een aanbod), niet error', uit.status === 'disconnected', uit);
  ck('actie connect, niet reconnect', uit.action === 'connect', uit);

  const storing = integraties.vanWaEigenNummer({ beschikbaar: true, gekoppeld: true, nummer: null });
  ck('gekoppeld maar getPhoneInfo mislukte -> error', storing.status === 'error', storing);

  const werkt = integraties.vanWaEigenNummer({ beschikbaar: true, gekoppeld: true, nummer: { number: '+32...', quality: 'GREEN' } });
  ck('gekoppeld en info opgehaald -> connected', werkt.status === 'connected', werkt);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);

})();
