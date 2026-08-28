/*
 * Het geheim mag niet naar een vreemde.
 *
 * ── De situatie ─────────────────────────────────────────────────────────────
 * PG_API_URL wees naar een kaal IP-adres van een DigitalOcean-machine
 * (167.172.164.4). Die machine is opgeheven. Providers delen zulke adressen
 * opnieuw uit, dus dat IP is inmiddels van iemand anders — of wordt dat morgen.
 *
 * Stond de variabele er nog, dan stuurde Helvaro PG_API_TOKEN als bearer naar
 * wie dat adres nu ook heeft. Met PG_API_INSECURE=1 stond certificaatcontrole
 * ook uit, dus er was niets dat kon merken dat het een andere machine was.
 *
 * De variabelen zijn inmiddels weg uit Vercel (gecontroleerd op production,
 * preview en development). Maar dat is een toestand, geen garantie: wie dit ooit
 * heropstart plakt de oude waarde terug. Daarom zit de weigering in de code.
 *
 * ── Wat hier bewaakt wordt ──────────────────────────────────────────────────
 * Niet alleen dát configured() nee zegt, maar vooral dat er GEEN VERZOEK
 * uitgaat. Dat is het enige wat telt: een geweigerde configuratie die tóch
 * verbinding maakt, lekt alsnog.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 240));
  ok ? pass++ : fail++;
};

const GEHEIM = 'PG-TOKEN-MAG-NERGENS-HEEN';

function metConfig({ url, insecure }, fn) {
  const oud = {
    u: process.env.PG_API_URL, t: process.env.PG_API_TOKEN, i: process.env.PG_API_INSECURE,
  };
  if (url === undefined) delete process.env.PG_API_URL; else process.env.PG_API_URL = url;
  process.env.PG_API_TOKEN = GEHEIM;
  if (insecure) process.env.PG_API_INSECURE = '1'; else delete process.env.PG_API_INSECURE;

  delete require.cache[require.resolve('../api/_pgapi.js')];
  const pg = require('../api/_pgapi.js');

  const uitgaand = [];
  const echteFetch = global.fetch;
  global.fetch = async (u) => { uitgaand.push(String(u)); return { ok: true, status: 200, json: async () => ({}) }; };

  return Promise.resolve(fn(pg, uitgaand)).finally(() => {
    global.fetch = echteFetch;
    process.env.PG_API_URL = oud.u; process.env.PG_API_TOKEN = oud.t; process.env.PG_API_INSECURE = oud.i;
    if (oud.u === undefined) delete process.env.PG_API_URL;
    if (oud.i === undefined) delete process.env.PG_API_INSECURE;
  });
}

// Elk geval: mag configured() ja zeggen, en mag er iets uitgaan?
const gevallen = [
  ['het oude adres (kaal IP + insecure)', { url: 'https://167.172.164.4', insecure: true  }, false],
  ['een kaal IP, wel https',              { url: 'https://167.172.164.4', insecure: false }, false],
  ['een kaal IP met poort',               { url: 'https://167.172.164.4:8443', insecure: false }, false],
  ['een IPv6-adres',                      { url: 'https://[2001:db8::1]', insecure: false }, false],
  ['http in plaats van https',            { url: 'http://db.helvaro.pro',  insecure: false }, false],
  ['een naam, maar certificaten uit',     { url: 'https://db.helvaro.pro', insecure: true  }, false],
  ['onzin die geen URL is',               { url: 'niet-eens-een-url',      insecure: false }, false],
  ['niet gezet',                          { url: undefined,                insecure: false }, false],
  ['een echte naam over https',           { url: 'https://db.helvaro.pro', insecure: false }, true  ],
];

(async () => {
  console.log('\n— welke doelen worden geaccepteerd —');
  for (const [naam, cfg, verwacht] of gevallen) {
    await metConfig(cfg, (pg) => {
      const got = pg.configured();
      ck(`${naam} → ${verwacht ? 'toegestaan' : 'geweigerd'}`, got === verwacht, `configured()=${got}`);
    });
  }

  console.log('\n— en bij een weigering gaat er NIETS de deur uit —');
  for (const [naam, cfg, verwacht] of gevallen) {
    if (verwacht) continue;
    await metConfig(cfg, async (pg, uitgaand) => {
      let foutmelding = '';
      try { await pg.pgFetch('tbl123?pageSize=1'); }
      catch (e) { foutmelding = e.message; }
      ck(`${naam}: geen verzoek verstuurd`, uitgaand.length === 0, uitgaand.join(', '));
      ck(`${naam}: en het token staat niet in de fout`,
         foutmelding.indexOf(GEHEIM) === -1, foutmelding);
    });
  }

  console.log('\n— een veilig doel werkt gewoon —');
  await metConfig({ url: 'https://db.helvaro.pro', insecure: false }, async (pg, uitgaand) => {
    await pg.pgFetch('tbl123?pageSize=1');
    ck('er gaat precies één verzoek uit', uitgaand.length === 1, uitgaand.length);
    ck('naar de opgegeven host', (uitgaand[0] || '').indexOf('https://db.helvaro.pro/v0/') === 0, uitgaand[0]);
  });

  console.log('\n— de Faro-store kiest Airtable zolang pg geweigerd wordt —');
  await metConfig({ url: 'https://167.172.164.4', insecure: true }, async () => {
    process.env.API_AIRTABLE = 'test-token';
    process.env.BASE_AIRTABLE = 'test-base';
    for (const k of Object.keys(require.cache)) if (k.indexOf('_faro') !== -1) delete require.cache[k];
    const store = require('../api/_faro/store.js');

    const bezocht = [];
    const echt = global.fetch;
    global.fetch = async (u) => { bezocht.push(String(u)); return { ok: true, status: 200, json: async () => ({ records: [] }) }; };
    await store.listConversations('TELJO', {});
    global.fetch = echt;

    ck('er is een verzoek gedaan', bezocht.length > 0, bezocht.length);
    ck('naar Airtable, niet naar het opgeheven IP',
       bezocht.every(u => u.indexOf('api.airtable.com') !== -1 && u.indexOf('167.172.164.4') === -1),
       bezocht[0]);
  });

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
