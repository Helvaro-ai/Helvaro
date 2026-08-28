/*
 * Het Redis-wachtwoord stond in de Vercel-logs.
 *
 * ── Wat er in productie gebeurde ────────────────────────────────────────────
 * UPSTASH_REDIS_REST_URL stond niet op de REST-URL maar op een heel
 * redis-cli-COMMANDO, inclusief het wachtwoord:
 *
 *     redis-cli --tls -u redis://default:<wachtwoord>@<host>:6379
 *
 * fetch() kan daar geen URL van maken en gooit "Failed to parse URL from
 * <de hele waarde>". Die melding ging rechtstreeks naar console.warn, bij élk
 * verzoek opnieuw. Zo stond het wachtwoord in de runtime-logs.
 *
 * ── En het was ook stil kapot ───────────────────────────────────────────────
 * configured() keek alleen of de variabele GEZET was. Een verkeerd geplakte
 * waarde is gezet, dus hij zei ja, elke aanroep viel om, en de limiter viel
 * terug op in-memory tellers. Op serverless is dat per instance en weg bij een
 * cold start -- volgens de kop van api/_ratelimit.js zelf "close to no limit at
 * all". Het zag eruit als een storing bij Upstash, niet als een instelfout.
 *
 * Dit bestand bewaakt allebei: geen geheimen in de logs, en een onbruikbare
 * waarde die zich meldt in plaats van stil terug te vallen.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

// Een wachtwoord dat we daarna in de logs terugzoeken.
const GEHEIM  = 'gQAAAAAAAsz1AAIgcDIxNjAxNWI2OTQyMzA0YTRh';
const KAPOTTE = `redis-cli --tls -u redis://default:${GEHEIM}@fine-humpback-183541.upstash.io:6379`;

function vangLogs(fn) {
  const regels = [];
  const w = console.warn, e = console.error, l = console.log;
  console.warn = (...a) => regels.push(a.join(' '));
  console.error = (...a) => regels.push(a.join(' '));
  console.log = (...a) => regels.push(a.join(' '));
  return Promise.resolve()
    .then(fn)
    .then((r) => { console.warn = w; console.error = e; console.log = l; return { regels, r }; })
    .catch((err) => { console.warn = w; console.error = e; console.log = l; throw err; });
}

function versRl() {
  delete require.cache[require.resolve('../api/_ratelimit.js')];
  return require('../api/_ratelimit.js');
}

(async () => {
  console.log('\n— een onbruikbare URL meldt zich, en lekt niets —');
  {
    process.env.UPSTASH_REDIS_REST_URL   = KAPOTTE;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'een-token';
    const rl = versRl();
    const { regels, r } = await vangLogs(() => rl.hit('login', '1.2.3.4', 5, 60000));

    const alles = regels.join('\n');
    ck('het wachtwoord staat NIET in de logs', alles.indexOf(GEHEIM) === -1, alles);
    /* Op "redis://" testen zou hier onterecht zakken: die tekst staat bewust in
       de uitleg ("niet een redis:// -adres"). Waar het om gaat is een adres MET
       inloggegevens erin, dus user:pass@host. */
    ck('en er staat nergens een adres met inloggegevens in',
       !/[a-z]+:\/\/[^\s/]*:[^\s/]*@/i.test(alles), alles);
    ck('ook de host uit de instelling niet',
       alles.indexOf('fine-humpback-183541') === -1, alles);
    ck('er is wél een melding dat de URL niet deugt',
       /geen http\(s\)-URL/.test(alles), alles);
    ck('configured() zegt nu nee', rl.configured() === false, rl.configured());
    ck('en de limiter blijft gewoon werken (in-memory)',
       r && typeof r.limited === 'boolean' && r.shared === false, JSON.stringify(r));
  }

  console.log('\n— een redis://-URL wordt ook geweigerd —');
  {
    process.env.UPSTASH_REDIS_REST_URL   = `redis://default:${GEHEIM}@host.upstash.io:6379`;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'een-token';
    const rl = versRl();
    const { regels } = await vangLogs(() => rl.hit('login', '1.2.3.4', 5, 60000));
    ck('configured() zegt nee', rl.configured() === false, rl.configured());
    ck('en het wachtwoord lekt niet', regels.join('\n').indexOf(GEHEIM) === -1, regels.join('\n'));
  }

  console.log('\n— een nette REST-URL wordt wél geaccepteerd —');
  {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://fine-humpback-183541.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'een-token';
    const rl = versRl();
    ck('configured() zegt ja', rl.configured() === true, rl.configured());
  }

  console.log('\n— en een echte storing lekt de URL evenmin —');
  {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://fine-humpback-183541.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = GEHEIM;
    const rl = versRl();
    const echteFetch = global.fetch;
    // Een fout die de URL MET inloggegevens in de melding zet, zoals node doet.
    global.fetch = async () => { throw new Error(`connect ECONNREFUSED https://default:${GEHEIM}@fine-humpback-183541.upstash.io/pipeline`); };
    const { regels, r } = await vangLogs(() => rl.hit('login', '9.9.9.9', 5, 60000));
    global.fetch = echteFetch;

    const alles = regels.join('\n');
    ck('het geheim staat niet in de logs', alles.indexOf(GEHEIM) === -1, alles);
    ck('de melding is er nog wel',  /Upstash onbereikbaar/.test(alles), alles);
    ck('en de login wordt niet geblokkeerd door de storing',
       r && r.limited === false, JSON.stringify(r));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
