'use strict';
/*
 * Het register van voorraadproviders (api/_voorraad-providers/): elk platform
 * houdt zich aan hetzelfde contract, fouten worden genormaliseerd, de teksten
 * bestaan in vier talen, en het scherm en de routes houden zich aan de regels
 * (tenant uit de sessie, geen platformlogica buiten het register).
 *
 * Het gedrag van sync() met meerdere bronnen staat in tests/voorraad-multibron.test.js.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const lees = (p) => fs.readFileSync(BASE + p, 'utf8');

const reg = require(BASE + 'api/_voorraad-providers');
const fouten = require(BASE + 'api/_voorraad-providers/fouten.js');
const feedMod = require(BASE + 'api/_voorraad-providers/feed.js');
const as24Mod = require(BASE + 'api/_voorraad-providers/autoscout24.js');
const i18n = require(BASE + 'api/_i18n.js');

(async () => {
  console.log('\nHet contract: elke provider, dezelfde vorm');
  {
    const lijst = reg.lijst();
    ck('elf platformen in het register', lijst.length === 11, lijst.map((p) => p.id));
    ck('ids zijn uniek', new Set(lijst.map((p) => p.id)).size === lijst.length);
    for (const p of lijst) {
      const f = reg.controleerContract(p);
      ck(`${p.id}: voldoet aan het contract (id, label, status, auth, kentReservering, capabilities, haal, health, normaliseerFout)`, f.length === 0, f);
    }
    ck('statussen kloppen met wat het platform kan', JSON.stringify(Object.fromEntries(reg.lijst().map((p) => [p.id, p.status]))) === JSON.stringify({
      feed: 'ACTIVE', autoscout24: 'BETA', autoscout24_api: 'FEED_REQUIRED', mobile_de: 'BETA',
      tweedehands: 'COMING_SOON', marktplaats: 'COMING_SOON', vroom: 'COMING_SOON', gocar: 'MANUAL', meta: 'COMING_SOON', auto1: 'COMING_SOON', heycar: 'DISABLED',
    }), Object.fromEntries(reg.lijst().map((p) => [p.id, p.status])));
    ck('alleen bestaande statussen en authtypes', reg.lijst().every((p) => reg.STATUSSEN.includes(p.status) && reg.AUTHTYPES.includes(p.auth)));
    ck('een kapotte provider valt door de controle', reg.controleerContract({ id: 'x' }).length > 0 && reg.controleerContract(null).length > 0);
    ck('het register is bevroren: een platform er niet stiekem bij', Object.isFrozen(reg.PROVIDERS) && Object.isFrozen(reg.get('feed')));
    ck('get() kent alleen echte platformen (geen prototype-sleutels)', reg.get('constructor') === null && reg.get('__proto__') === null && reg.get('') === null && reg.get(undefined) === null);
    ck('wat Helvaro nu echt kan: alleen lezen, via feed, profiel, gocar-export en mobile.de (AutoScout24-API pas met de gegevens van Helvaro)', reg.lijst().filter((p) => p.capabilities.lezen).map((p) => p.id).sort().join() === 'autoscout24,feed,gocar,mobile_de');
    ck('nergens wordt gepubliceerd of op leads gereageerd (Fase 1)', reg.lijst().every((p) => !p.capabilities.publiceren && !p.capabilities.leads));
  }

  console.log('\nWie mag synchroniseren en wie mag inloggegevens bewaren');
  {
    const sync = reg.lijst().filter(reg.kanSyncen).map((p) => p.id).sort().join();
    ck('synchroniseren: feed, autoscout24, gocar en mobile.de', sync === 'autoscout24,feed,gocar,mobile_de', sync);
    const bewaar = reg.lijst().filter(reg.kanBewaren).map((p) => p.id).sort().join();
    ck('bewaren: die drie plus de twee API-koppelingen die op activatie wachten', bewaar === 'autoscout24,autoscout24_api,feed,gocar,mobile_de', bewaar);
    ck('inloggegevens: alleen mobile.de (AutoScout24-API gebruikt de gegevens van Helvaro)', reg.lijst().filter(reg.vraagtCredentials).map((p) => p.id).sort().join() === 'mobile_de');
    for (const id of ['tweedehands', 'marktplaats', 'vroom', 'meta', 'heycar']) {
      const p = reg.get(id);
      let fout;
      try { await p.haal({ url: 'https://x.example/f' }); } catch (e) { fout = e; }
      ck(`${id}: haal() gooit, er is niets om te lezen`, Boolean(fout) && fout.code === 'provider_niet_beschikbaar', fout && fout.code);
      ck(`${id}: zegt dat het niet beschikbaar is (health)`, (await p.health({})).ok === false && (await p.health({})).toestand === 'niet_beschikbaar');
    }
    const md = reg.get('mobile_de');
    ck('mobile_de zonder gegevens: niet geconfigureerd', (await md.health({})).toestand === 'niet_geconfigureerd');
    ck('autoscout24_api zonder gegevens van Helvaro: wacht op activatie, zonder netwerk', (await reg.get('autoscout24_api').health({ customerId: '42' })).toestand === 'wacht_op_activatie');
    ck('feed zonder adres: niet geconfigureerd, met adres: ok', (await reg.get('feed').health({})).ok === false && (await reg.get('feed').health({ url: 'https://x.example/f' })).ok === true);
  }

  console.log('\nFouten: een van negen woorden, uit elke provider');
  {
    const N = (o) => fouten.normaliseer(Object.assign(new Error('technisch'), o)).code;
    ck('negen codes', fouten.CODES.length === 9 && ['AUTH_ERROR', 'RATE_LIMIT', 'PROVIDER_DOWN', 'INVALID_DATA', 'MISSING_FIELD', 'DUPLICATE_VEHICLE', 'PERMISSION_DENIED', 'SYNC_TIMEOUT', 'UNKNOWN_ERROR'].every((c) => fouten.CODES.includes(c)));
    ck('feed_http -> PROVIDER_DOWN', N({ code: 'feed_http' }) === 'PROVIDER_DOWN' && N({ code: 'feed_http', http: 502 }) === 'PROVIDER_DOWN');
    ck('feed_http met 401 -> AUTH_ERROR, 403 -> PERMISSION_DENIED, 429 -> RATE_LIMIT', N({ code: 'feed_http', http: 401 }) === 'AUTH_ERROR' && N({ code: 'feed_http', http: 403 }) === 'PERMISSION_DENIED' && N({ code: 'feed_http', http: 429 }) === 'RATE_LIMIT');
    ck('bron_geblokkeerd -> RATE_LIMIT (429, 503) of PERMISSION_DENIED (403, captcha)', N({ code: 'bron_geblokkeerd', http: 429 }) === 'RATE_LIMIT' && N({ code: 'bron_geblokkeerd', http: 503 }) === 'RATE_LIMIT' && N({ code: 'bron_geblokkeerd', http: 403 }) === 'PERMISSION_DENIED' && N({ code: 'bron_geblokkeerd' }) === 'PERMISSION_DENIED');
    ck('bron_geweigerd (robots.txt) -> PERMISSION_DENIED', N({ code: 'bron_geweigerd' }) === 'PERMISSION_DENIED');
    ck('feed_leeg en bron_onleesbaar -> INVALID_DATA', N({ code: 'feed_leeg' }) === 'INVALID_DATA' && N({ code: 'bron_onleesbaar' }) === 'INVALID_DATA');
    ck('bron_onvolledig -> SYNC_TIMEOUT', N({ code: 'bron_onvolledig' }) === 'SYNC_TIMEOUT');
    ck('geen_url en geen_credentials -> MISSING_FIELD', N({ code: 'geen_url' }) === 'MISSING_FIELD' && N({ code: 'geen_credentials' }) === 'MISSING_FIELD');
    ck('url_geweigerd, feed_te_groot, feed_omleiding, bron_omleiding -> INVALID_DATA', ['url_geweigerd', 'feed_te_groot', 'feed_omleiding', 'bron_omleiding'].every((c) => N({ code: c }) === 'INVALID_DATA'));
    ck('dubbel_voertuig -> DUPLICATE_VEHICLE', N({ code: 'dubbel_voertuig' }) === 'DUPLICATE_VEHICLE');
    ck('een time-out (AbortSignal) -> SYNC_TIMEOUT', N({ name: 'TimeoutError' }) === 'SYNC_TIMEOUT' && N({ name: 'AbortError' }) === 'SYNC_TIMEOUT');
    ck('een netwerkfout -> PROVIDER_DOWN', N({ message: 'fetch failed' }) === 'PROVIDER_DOWN' && N({ cause: { code: 'ENOTFOUND' } }) === 'PROVIDER_DOWN');
    ck('al het andere -> UNKNOWN_ERROR', N({ code: 'iets_nieuws' }) === 'UNKNOWN_ERROR' && fouten.normaliseer(null).code === 'UNKNOWN_ERROR' && fouten.normaliseer(undefined).code === 'UNKNOWN_ERROR');
    ck('de technische tekst zit nooit in wat de dealer krijgt', !JSON.stringify(fouten.normaliseer(Object.assign(new Error('geheime stacktrace'), { code: 'feed_http' }))).includes('geheime'));
    ck('elke code heeft een zinssleutel, en de oorspronkelijke code blijft voor de log', fouten.normaliseer({ code: 'feed_http' }).sleutel === 'ig.fout.PROVIDER_DOWN' && fouten.normaliseer({ code: 'feed_http' }).legacy === 'feed_http');
    ck('elke provider heeft normaliseerFout en geeft hetzelfde antwoord', reg.lijst().every((p) => p.normaliseerFout({ code: 'feed_leeg' }).code === 'INVALID_DATA'));

    /* De echte providers, met een nagemaakte fetch. */
    const echt = global.fetch;
    try {
      global.fetch = async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '' });
      let e1; try { await reg.get('feed').haal({ url: 'https://dms.example/f.csv' }); } catch (e) { e1 = e; }
      ck('echte feed die 401 geeft -> AUTH_ERROR', e1 && reg.get('feed').normaliseerFout(e1).code === 'AUTH_ERROR', e1 && { c: e1.code, h: e1.http });
      global.fetch = async () => ({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' });
      let e2; try { await reg.get('feed').haal({ url: 'https://dms.example/f.csv' }); } catch (e) { e2 = e; }
      ck('echte feed die 429 geeft -> RATE_LIMIT', e2 && reg.get('feed').normaliseerFout(e2).code === 'RATE_LIMIT');
      global.fetch = async (u) => (/robots/.test(String(u)) ? { ok: false, status: 404 } : { ok: false, status: 429, headers: { get: () => null }, text: async () => '' });
      let e3; try { await reg.get('autoscout24').haal({ url: 'https://www.autoscout24.be/nl/verkopers/garage-a' }); } catch (e) { e3 = e; }
      ck('AutoScout24-profiel dat 429 geeft -> RATE_LIMIT, gestopt zonder omweg', e3 && e3.code === 'bron_geblokkeerd' && reg.get('autoscout24').normaliseerFout(e3).code === 'RATE_LIMIT', e3 && e3.code);
      let e4; try { await reg.get('feed').haal({}); } catch (e) { e4 = e; }
      ck('feed zonder adres -> MISSING_FIELD', e4 && reg.get('feed').normaliseerFout(e4).code === 'MISSING_FIELD');
    } finally { global.fetch = echt; }
  }

  console.log('\nHet chassisnummer en het AutoScout-nummer uit een feed');
  {
    const m = feedMod.mapRegel({ id: '1', make: 'BMW', vin: 'wba12345678901234' });
    ck('een geldig chassisnummer wordt hoofdletters', m.vin === 'WBA12345678901234', m.vin);
    ck('een stocknummer dat "vin" heet maar geen chassisnummer is, telt niet', feedMod.mapRegel({ id: '1', make: 'BMW', vin: 'ABC123' }).vin === undefined);
    ck('I, O en Q komen niet voor in een chassisnummer', feedMod.normVin('WBA1234567890123I') === undefined && feedMod.normVin('WBA1234567890123O') === undefined);
    ck('het AutoScout-nummer wordt gelezen', feedMod.mapRegel({ id: '1', make: 'BMW', autoscoutid: 'ABC-123' }).autoscout === 'abc-123');
    ck('en het bestaande gedrag blijft: id uit aliassen, status, link', feedMod.mapRegel({ stocknumber: 'S1', make: 'Audi', status: 'sold', url: 'https://x.example/a' }).status === 'verkocht');
    ck('AutoScout24-profielen: alleen op een autoscout24-domein', as24Mod.autoscoutDealerUrl('https://www.autoscout24.be/nl/verkopers/garage-a') !== null && as24Mod.autoscoutDealerUrl('https://evil.example/nl/verkopers/x') === null);
  }

  console.log('\nGeen platformlogica buiten het register');
  {
    const inventaris = lees('api/_inventaris.js');
    ck('api/_inventaris.js bevat geen platformnamen', !/'(autoscout24|autoscout24_api|mobile_de|gocar|marktplaats|tweedehands|vroom|heycar|meta)'/.test(inventaris), inventaris.match(/'(autoscout24|mobile_de|gocar|marktplaats)'/));
    ck('en leest geen pagina\'s of API\'s zelf (__NEXT_DATA__, robots.txt, listing-creation)', !/__NEXT_DATA__|robots\.txt|listing-creation|services\.mobile\.de/.test(inventaris));
    ck('het vraagt het register om de provider', /registry\.get\(/.test(inventaris) && /registry\.kanSyncen\(/.test(inventaris));
    ck('de platformen en hun leeslogica staan in api/_voorraad-providers/', fs.existsSync(BASE + 'api/_voorraad-providers/autoscout24.js') && /__NEXT_DATA__/.test(lees('api/_voorraad-providers/autoscout24.js')));
    ck('geen verzonnen API-adressen in de stubs', !/https?:\/\//.test(lees('api/_voorraad-providers/aanvragen.js').replace(/\/\*[\s\S]*?\*\//g, '')) && !/fetch\(/.test(lees('api/_voorraad-providers/aanvragen.js')));
    const index = lees('api/_voorraad-providers/index.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ck('en het register zelf roept niets aan op het net', !/fetch\(|https?:\/\//.test(index));
  }

  console.log('\nDe routes: tenant uit de sessie, een vaste lijst velden');
  {
    const leads = lees('api/leads.js');
    const i = leads.indexOf("body.mode === 'inventory-status'");
    const blok = leads.slice(i, i + 6000);
    ck('de twee nieuwe modes hangen aan hetzelfde blok als de oude', /body\.mode === 'inventory-providers'/.test(blok) && /body\.mode === 'inventory-provider-save'/.test(blok));
    ck('geen projectCode zonder sessie', /if \(!projectCode\) return res\.status\(403\)/.test(blok.slice(0, 1200)));
    ck('de tenant komt nooit uit de body', !/body\.(projectCode|project_code|tenant|projectcode)\b/.test(blok));
    ck('bewaarProvider krijgt een vaste lijst velden, geen hele body', /bewaarProvider\(projectCode, \{\s*provider: body\.provider/.test(blok));
    ck('een geweigerde koppeling geeft een kort woord (code), geen technische tekst', /code: uit\.reden/.test(blok));
  }

  console.log('\nHet schema');
  {
    const schema = require(BASE + 'api/_schema.js');
    const t = schema.TABELLEN.vehicle_listings;
    ck('vehicle_listings staat in de tabellen, met Listing Key als primair veld', t && t.fields[0].name === 'Listing Key', t && t.fields.map((f) => f.name));
    const nodig = ['Listing Key', 'Project Code', 'Vehicle Code', 'Provider', 'External ID', 'URL', 'Status', 'Last Seen At', 'Created At'];
    ck('met alle velden uit de specificatie', nodig.every((n) => t.fields.some((f) => f.name === n)), t.fields.map((f) => f.name));
    ck('leads krijgen Listing Provider en Listing ID', ['Listing Provider', 'Listing ID'].every((n) => schema.EXTRA_VELDEN.tbliukTnDAbEDcZmt.fields.some((f) => f.name === n)));
    ck('voertuigen krijgen een VIN-veld', schema.EXTRA_VELDEN.tblQAPdjEsh0l7lUe.fields.some((f) => f.name === 'VIN'));
    const p = schema.plan([{ id: 'tblX', name: 'vehicle_listings', fields: t.fields.slice(0, 3).map((f) => ({ name: f.name })) }]);
    ck('het plan vult een bestaande tabel aan (alleen toevoegen)', p.nieuweVelden.some((v) => v.label === 'vehicle_listings' && v.veld.name === 'Status') && !p.nieuweTabellen.some((x) => x.naam === 'vehicle_listings'));
  }

  console.log('\nDe lead onthoudt via welk platform hij kwam');
  {
    const autoscout = require(BASE + 'api/_autoscout.js');
    const l = autoscout.listingVan(autoscout.lees('Interesse: https://www.autoscout24.be/nl/aanbod/bmw-m4-a1b2c3d4-1111-2222-3333-444455556666'));
    ck('een AutoScout24-link geeft provider autoscout24 en het aanbodnummer', l && l.provider === 'autoscout24' && l.externalId === 'a1b2c3d4-1111-2222-3333-444455556666', l);
    ck('een gewoon bericht geeft niets (we gokken niet)', autoscout.listingVan(autoscout.lees('Is die BMW nog beschikbaar?')) === null);
    const vehicles = {
      available: async () => true, list: async () => [], getByCode: async () => null, normCode: (x) => x, geldigeCode: () => false, matchUitTekst: () => ({ voertuig: null, kandidaten: [], reden: 'geen' }),
      getByAutoscout: async (t, id) => (id === 'a1b2c3d4-1111-2222-3333-444455556666' ? { code: 'V3' } : null),
    };
    const u = await autoscout.herken(vehicles, 'DEALERA', 'https://www.autoscout24.be/nl/aanbod/bmw-m4-a1b2c3d4-1111-2222-3333-444455556666');
    ck('herken() geeft het platform mee bij een treffer op aanbodnummer', u.voertuig && u.via === 'aanbodnummer' && u.listing && u.listing.provider === 'autoscout24', u);
    const wa = lees('api/whatsapp.js');
    ck('WhatsApp bewaart het apart van de gewone leadupdate (best-effort)', /await bewaarAdvertentieOpLead\(lead, herkendeAdvertentie\)/.test(wa) && /Listing Provider/.test(wa) && /Listing ID/.test(wa));
    ck('en alleen als de wagen echt herkend is', /herkendeAdvertentie = uitkomst\.voertuig && uitkomst\.listing/.test(wa));
  }

  console.log('\nHet scherm');
  {
    const dash = lees('api/dashboard.js');
    const mod = lees('api/_dash/integraties.js');
    ck('een blok in Instellingen, standaard verborgen', /id="set-integraties" style="display:none"/.test(dash));
    ck('de module wordt ingevoegd en geladen bij het openen van Instellingen', /\$\{_integraties\.js\(\)\}/.test(dash) && /laadIntegraties\(\);\n\}/.test(dash));
    ck('alleen voor dealers', /!isDealer\(\)\) \{ sectie\.style\.display = 'none'/.test(mod));
    ck('praat via de bestaande voorraadVraag, met de twee nieuwe modes', /voorraadVraag\('inventory-providers'\)/.test(mod) && /voorraadVraag\('inventory-provider-save'/.test(mod));
    ck('geen onclick in de HTML (klikken via data-attributen)', !/onclick=/.test(mod));
    ck('geen backticks of ${ in de module (hij wordt in een template geplakt)', !/[`]|\$\{/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')));
    ck('wachtwoordvelden zijn type=password en nooit voorgevuld', /type="password"/.test(mod) && !/password[^']*value=/.test(mod.replace(/placeholder=[^>]*/g, '')));
    ck('een niet-beschikbaar platform krijgt geen knop (COMING_SOON / DISABLED)', /if \(p\.status === 'COMING_SOON'\) \{\n\s+sub = /.test(mod) && /else if \(p\.status === 'DISABLED'\)/.test(mod));
    /* Alle sleutels die de module gebruikt bestaan, in vier talen. */
    const sleutels = new Set();
    let m; const re = /\b(?:tr|igTekst)\(\s*'([a-zA-Z0-9_.\-]+)'/g;
    while ((m = re.exec(mod))) if (m[1].slice(-1) !== '.') sleutels.add(m[1]);
    const dashSleutels = new Set(); const re2 = /\bT\(\s*'(ig\.[a-zA-Z0-9_.\-]+)'/g;
    while ((m = re2.exec(dash))) dashSleutels.add(m[1]);
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const w = i18n.woordenboek(taal);
      const mist = [...sleutels, ...dashSleutels].filter((k) => !w[k]);
      ck(`${taal}: alle ${sleutels.size + dashSleutels.size} sleutels van het scherm bestaan`, mist.length === 0, mist);
    }
    /* De dynamische sleutels uit de server: elke status en elke foutcode, in alle talen, met gelijke {plaatshouders}. */
    const alle = Object.keys(i18n.woordenboek('nl')).filter((k) => k.startsWith('ig.'));
    ck('er zijn echt teksten (geen lege familie)', alle.length > 50, alle.length);
    const ph = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join();
    for (const taal of ['fr', 'en', 'de']) {
      const w = i18n.woordenboek(taal), nl = i18n.woordenboek('nl');
      ck(`${taal}: dezelfde {plaatshouders} als het Nederlands`, alle.every((k) => ph(w[k]) === ph(nl[k])), alle.filter((k) => ph(w[k]) !== ph(nl[k])));
      ck(`${taal}: geen tekst blijft kaal of leeg`, alle.every((k) => w[k] && w[k] !== k), alle.filter((k) => !w[k] || w[k] === k));
      ck(`${taal}: niets noemt het "AI"`, alle.every((k) => !/\b(AI|IA|KI)\b/.test(w[k])));
    }
    ck('elke foutcode die de normalisatie kan geven heeft een zin', fouten.CODES.every((c) => i18n.woordenboek('en')['ig.fout.' + c]) && i18n.woordenboek('en')['ig.fout.ACTIVATIE'] && i18n.woordenboek('en')['ig.fout.NIET_BESCHIKBAAR']);
    ck('en elke status heeft een label', reg.STATUSSEN.every((s) => i18n.woordenboek('en')['ig.status.' + s]));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('STUK:', e && e.stack); process.exit(1); });
