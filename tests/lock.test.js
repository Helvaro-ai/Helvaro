/*
 * Sloten over instanties heen (audit L-1): api/_lock.js.
 *
 * Een nep-Upstash in het geheugen die precies de drie commando's kent die het
 * slot gebruikt (SET NX PX, GET, EVAL vrijgeven). Getest wordt:
 *   - een WhatsApp-bericht-id wordt maar één keer opgepakt;
 *   - twee boekingen van VERSCHILLENDE leads op hetzelfde uur: één wint;
 *   - dezelfde lead die twee keer klikt, komt er wel door;
 *   - een mislukte boeking geeft het uur meteen weer vrij;
 *   - faalt open: zonder Upstash of bij een storing gaat alles door;
 *   - de drie boekingspaden gebruiken dezelfde sleutel.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const store = new Map();
let plat = false;
global.fetch = async (url, opts = {}) => {
  if (plat) throw new Error('verbinding geweigerd');
  const [cmd] = JSON.parse(opts.body || '[]');
  const [naam, ...a] = cmd;
  let result = null;
  if (naam === 'SET') {
    const [k, v, nx] = a;
    if (nx === 'NX' && store.has(k)) result = null;
    else { store.set(k, v); result = 'OK'; }
  } else if (naam === 'GET') {
    result = store.has(a[0]) ? store.get(a[0]) : null;
  } else if (naam === 'DEL') {
    result = store.delete(a[0]) ? 1 : 0;
  } else if (naam === 'EVAL') {
    const [, , k, v] = a;
    if (store.get(k) === v) { store.delete(k); result = 1; } else result = 0;
  }
  return { ok: true, status: 200, json: async () => [{ result }] };
};

function metUpstash() {
  process.env.UPSTASH_REDIS_REST_URL = 'https://nep.upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'nep-token';
}
function zonderUpstash() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

const lock = require('../api/_lock.js');

(async () => {
  console.log('\nSloten over instanties heen');

  metUpstash();
  console.log('\n  WhatsApp-bericht één keer');
  ck('eerste bezorging pakt hem op', await lock.eenmalig('wa-msg:wamid.1', 60000) === true);
  ck('tweede bezorging (andere instantie) niet', await lock.eenmalig('wa-msg:wamid.1', 60000) === false);
  ck('een ander bericht wel', await lock.eenmalig('wa-msg:wamid.2', 60000) === true);
  await lock.vergeet('wa-msg:wamid.2');
  ck('na een mislukte verwerking mag een herbezorging het opnieuw', await lock.eenmalig('wa-msg:wamid.2', 60000) === true);

  console.log('\n  twee boekingen op hetzelfde uur');
  const sleutel = lock.slotSleutel('TELJO', '2026-10-01T08:00:00.000Z');
  ck('de sleutel is per tenant en tijdstip', sleutel === 'slot:TELJO:2026-10-01T08:00:00.000Z', sleutel);
  ck('hetzelfde moment in een andere notatie geeft dezelfde sleutel',
    lock.slotSleutel('TELJO', '2026-10-01T10:00:00+02:00') === sleutel);
  const a = await lock.claim(sleutel, 60000, 'recLeadA0000000000');
  const b = await lock.claim(sleutel, 60000, 'recLeadB0000000000');
  ck('lead A krijgt het uur', a.genomen === true);
  ck('lead B niet', b.genomen === false);
  const a2 = await lock.claim(sleutel, 60000, 'recLeadA0000000000');
  ck('lead A die nog eens klikt, komt er wel door', a2.genomen === true);
  const anderUur = await lock.claim(lock.slotSleutel('TELJO', '2026-10-01T09:00:00.000Z'), 60000, 'recLeadB0000000000');
  ck('een ander uur is gewoon vrij', anderUur.genomen === true);
  const andereTenant = await lock.claim(lock.slotSleutel('ANDERE', '2026-10-01T08:00:00.000Z'), 60000, 'recLeadB0000000000');
  ck('hetzelfde uur bij een andere dealer ook', andereTenant.genomen === true);

  console.log('\n  mislukte boeking geeft het uur vrij');
  await a.los();
  const b2 = await lock.claim(sleutel, 60000, 'recLeadB0000000000');
  ck('na los() kan lead B boeken', b2.genomen === true);

  console.log('\n  metSlot: één tegelijk');
  const volgorde = [];
  const eerste = lock.metSlot('credits:TELJO', 10000, async () => { volgorde.push('a-start'); await new Promise((r) => setTimeout(r, 120)); volgorde.push('a-eind'); return 'a'; }, { pogingen: 10, pauzeMs: 40 });
  await new Promise((r) => setTimeout(r, 10));
  const tweede = lock.metSlot('credits:TELJO', 10000, async () => { volgorde.push('b-start'); return 'b'; }, { pogingen: 10, pauzeMs: 40 });
  const [ra, rb] = await Promise.all([eerste, tweede]);
  ck('de tweede wacht tot de eerste klaar is', volgorde.join(',') === 'a-start,a-eind,b-start', volgorde);
  ck('en beide geven hun resultaat terug', ra.resultaat === 'a' && rb.resultaat === 'b', [ra, rb]);
  ck('daarna is het slot weer vrij', !store.has('hv:lock:credits:TELJO'), [...store.keys()]);

  console.log('\n  faalt open');
  zonderUpstash();
  ck('zonder Upstash: bericht altijd opgepakt', await lock.eenmalig('wa-msg:wamid.1', 60000) === true);
  ck('zonder Upstash: boeking altijd door', (await lock.claim(sleutel, 60000, 'recLeadC0000000000')).genomen === true);
  metUpstash();
  plat = true;
  ck('Upstash plat: bericht toch opgepakt', await lock.eenmalig('wa-msg:wamid.9', 60000) === true);
  ck('Upstash plat: boeking toch door', (await lock.claim(lock.slotSleutel('TELJO', '2026-10-02T08:00:00.000Z'), 60000, 'x')).genomen === true);
  const doorgegaan = await lock.metSlot('credits:X', 1000, async () => 'gedaan');
  ck('Upstash plat: metSlot voert gewoon uit', doorgegaan.bezet === false && doorgegaan.resultaat === 'gedaan', doorgegaan);
  plat = false;

  console.log('\n  alle boekingspaden gebruiken dezelfde claim');
  const bron = (f) => fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
  ck('websiteboeking', /_lock\.claim\(_lock\.slotSleutel\(t, start\.toISOString\(\)\)/.test(bron('_webboeking.js')));
  ck('WhatsApp-boeking', /_lock\.claim\(_lock\.slotSleutel\(projectCode, startTime\)/.test(bron('whatsapp.js')));
  ck('dashboardboeking', /_lock\.claim\(_lock\.slotSleutel\(projectCode, body\.startTime\)/.test(bron('leads.js')));
  ck('WhatsApp-webhook claimt het bericht-id', /_lock\.eenmalig\('wa-msg:' \+ message\.id/.test(bron('whatsapp.js')));
  ck('credits lopen via het gedeelde slot', /_lock\.metSlot\('credits:' \+ code/.test(bron('_credits.js')));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
