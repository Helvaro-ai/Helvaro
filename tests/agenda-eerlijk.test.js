/*
 * Een agenda die niet gelezen kon worden, mag niet doorgaan voor "vrij".
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * isSlotFree() gaf bij ELKE storing `true` terug. Dat is een bewuste
 * fail-open -- een boeking verliezen omdat Google traag is, is erger dan het
 * risico op een dubbele -- en die afweging blijft staan. Het probleem was dat
 * "vrij" en "we konden niet kijken" er als hetzelfde antwoord uitkwamen. De
 * aanroeper kon het verschil niet zien, dus kon hij het ook niet melden.
 *
 * Dat is geen randgeval: de Google-OAuth staat nog op Testing, dus tokens
 * verlopen elke 7 dagen (HELVARO-ARCHITECTUUR.md §9). Een agenda die al een
 * week niet gelezen kan worden bleef gewoon boekingen aannemen alsof alles
 * klopte, en de makelaar merkte dat pas als er twee mensen voor de deur
 * stonden.
 *
 * CLAUDE.md: "Nooit een slot tonen als vrij zonder dat de agenda dat
 * bevestigt." Met alleen een boolean was die regel niet te volgen.
 *
 * checkSlot() geeft nu { free, geverifieerd }. Boeken mag nog steeds; doen
 * alsof er gekeken is niet.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const _gcal = require(BASE + 'api/_gcal.js');

/* De echte functie draaien met een nagebootste fetch. Dat toetst gedrag en
   geen bewoording: freeBusy() zit ertussen, precies zoals in productie. */
const echteFetch = global.fetch;
function metAntwoord(antwoord) {
  global.fetch = async () => antwoord();
}
const herstel = () => { global.fetch = echteFetch; };

const OK_LEEG   = () => ({ ok: true,  json: async () => ({ calendars: { primary: { busy: [] } } }) });
const OK_BEZET  = (s, e) => () => ({ ok: true, json: async () => ({ calendars: { primary: { busy: [{ start: s, end: e }] } } }) });
const HTTP_FOUT = () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid Credentials' } }) });
const NETWERK   = () => { throw new Error('getaddrinfo ENOTFOUND'); };

/* De console stilzetten: _gcal logt bewust luid bij een storing, en dat is
   hier verwacht gedrag en geen testuitvoer. */
const stilleFout = console.error;

(async () => {
  const START = '2026-09-10T10:00:00.000Z';

  console.log('\nDe agenda zegt of hij gelezen is');

  console.log('\n  een gezonde agenda antwoordt gewoon');
  {
    metAntwoord(OK_LEEG);
    const vrij = await _gcal.checkSlot('tok', 'primary', START, 30);
    ck('leeg blok → vrij', vrij.free === true, vrij);
    ck('en geverifieerd', vrij.geverifieerd === true, vrij);

    metAntwoord(OK_BEZET('2026-09-10T10:15:00.000Z', '2026-09-10T11:00:00.000Z'));
    const bezet = await _gcal.checkSlot('tok', 'primary', START, 30);
    ck('overlappend blok → niet vrij', bezet.free === false, bezet);
    ck('en ook dat is geverifieerd', bezet.geverifieerd === true, bezet);

    /* Een blok dat ERNAAST ligt mag niet als overlap tellen. */
    metAntwoord(OK_BEZET('2026-09-10T10:30:00.000Z', '2026-09-10T11:00:00.000Z'));
    const naast = await _gcal.checkSlot('tok', 'primary', START, 30);
    ck('een aansluitend blok is geen overlap', naast.free === true, naast);
    herstel();
  }

  console.log('\n  een onleesbare agenda blokkeert niet, maar liegt ook niet');
  {
    console.error = () => {};
    metAntwoord(HTTP_FOUT);
    const dood = await _gcal.checkSlot('verlopen-token', 'primary', START, 30);
    ck('een 401 houdt de boeking NIET tegen (fail-open blijft)', dood.free === true, dood);
    ck('maar geverifieerd is false', dood.geverifieerd === false, dood);

    metAntwoord(NETWERK);
    const stuk = await _gcal.checkSlot('tok', 'primary', START, 30);
    ck('een netwerkfout ook niet', stuk.free === true, stuk);
    ck('en ook die is niet geverifieerd', stuk.geverifieerd === false, stuk);
    console.error = stilleFout;
    herstel();
  }

  console.log('\n  de oude vorm blijft precies doen wat hij deed');
  {
    /* isSlotFree() heeft twee aanroepers en twee tests die erop staan. Zijn
       contract mag niet verschuiven: true bij vrij én bij niet-kunnen-kijken. */
    metAntwoord(OK_LEEG);
    ck('vrij → true', (await _gcal.isSlotFree('tok', 'primary', START, 30)) === true);

    metAntwoord(OK_BEZET('2026-09-10T10:15:00.000Z', '2026-09-10T11:00:00.000Z'));
    ck('bezet → false', (await _gcal.isSlotFree('tok', 'primary', START, 30)) === false);

    console.error = () => {};
    metAntwoord(HTTP_FOUT);
    ck('storing → nog steeds true (fail-open)', (await _gcal.isSlotFree('tok', 'primary', START, 30)) === true);
    console.error = stilleFout;
    herstel();
  }

  console.log('\n  en de twee boekwegen melden het ook echt');
  {
    const wa    = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
    const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
    const dash  = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');

    ck('whatsapp.js vraagt checkSlot in plaats van isSlotFree',
      /_gcal\.checkSlot\(/.test(wa) && !/_gcal\.isSlotFree\(/.test(wa), null);
    ck('en zet een LET OP in de notitie van de afspraak',
      /\[LET OP\][\s\S]{0,160}niet gelezen worden/.test(wa), null);
    ck('en waarschuwt de makelaar zelf',
      /if \(!agendaGeverifieerd && ownerPhone\)/.test(wa), null);
    /* Het gevaarlijkste zou zijn: de boeking tegenhouden. Dat mag niet -- de
       fail-open is de hele afweging. slotTaken hangt aan `free`, niet aan
       `geverifieerd`. */
    ck('maar houdt de boeking NIET tegen',
      /slotTaken = !uitslag\.free;/.test(wa) && !/slotTaken = !uitslag\.geverifieerd/.test(wa), null);

    ck('leads.js gebruikt checkSlot',
      /_gcal\.checkSlot\(/.test(leads) && !/_gcal\.isSlotFree\(/.test(leads), null);
    ck('weigert nog steeds bij een BEVESTIGD conflict',
      /if \(!uitslag\.free\)[\s\S]{0,200}slot_conflict/.test(leads), null);
    ck('en geeft de vlag mee in het antwoord',
      /agendaGeverifieerd \}\);/.test(leads), null);

    ck('het dashboard zegt het tegen de gebruiker',
      /data\.agendaGeverifieerd === false/.test(dash)
      && /tst\.afspraakOngecontroleerd/.test(dash), null);

    const i18n = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');
    const regel = /'tst\.afspraakOngecontroleerd':\s*\{([\s\S]*?)\}/.exec(i18n);
    ck('de melding bestaat', !!regel, null);
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      ck(`  in het ${taal}`, !!regel && new RegExp(`\\b${taal}:\\s*'`).test(regel[1]), null);
    }
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST ZELF STUK:', e); process.exit(1); });
