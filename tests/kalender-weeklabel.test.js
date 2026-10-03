/* Een week die twee maanden raakt stond als "Sept. October 2026" (live gevonden). */
'use strict';
const fs = require('fs'); const path = require('path');
/* Sinds 2026-10-03 staat de agenda in api/_dash/agenda.js. */
const dash = require('../api/_dash/agenda.js').js();
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 160)}`); ok ? pass++ : fail++; };
console.log('\nKalender: weeklabel');
ck('een week over twee maanden gebruikt Intl.formatRange', /new Intl\.DateTimeFormat\(LOCALE, \{ day: 'numeric', month: 'short', year: 'numeric' \}\)\.formatRange\(eerste, laatste\)/.test(dash));
ck('en heeft een terugval met een streepje voor oudere browsers', /(u2013|\u2013) ' \+ dagen\[dagen\.length - 1\]/.test(dash));
ck('het oude "sep. oktober" patroon is weg', !/startM \+ '\. ' \+ endM/.test(dash));
for (const [loc, verwacht] of [['en-GB', '28 Sept – 4 Oct 2026'], ['nl-BE', '28 sep – 4 okt 2026']]) {
  const uit = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(new Date(2026, 8, 28), new Date(2026, 9, 4));
  const norm = (t) => t.replace(/\s/g, ' ');   // Intl zet er een dun of vast spatietje omheen
  ck(loc + ': ' + uit, norm(uit) === norm(verwacht), uit);
}
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
