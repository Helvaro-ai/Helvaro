'use strict';
/* De dagmail van de opvolgcron leest followedUp/nietVerstuurd NA de catch van
   de opvolgstap. Stonden ze in de try, dan viel elke run om 09:00 om met
   "nietVerstuurd is not defined" (Vercel-runtime-fouten 17-19 sep 2026) en
   sloeg alles erna over. Deze test bewaakt dat de declaratie vóór de try
   staat en de dagmail ze dus kan zien. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'cron-followup.js'), 'utf8');

const decl = src.indexOf('const nietVerstuurd = [];');
const declFollowed = src.indexOf('const followedUp = [];');
const tryOpen = src.indexOf('let sent = 0;');
const use = src.indexOf('if (sent > 0 || nietVerstuurd.length > 0)');
assert.ok(decl > -1 && declFollowed > -1 && tryOpen > -1 && use > -1, 'ankers gevonden');
// de try die volgt op `let sent = 0;`
const tryAfterSent = src.indexOf('try {', tryOpen);
assert.ok(decl < tryAfterSent, 'nietVerstuurd wordt VOOR de try gedeclareerd');
assert.ok(declFollowed < tryAfterSent, 'followedUp wordt VOOR de try gedeclareerd');
assert.ok(use > tryAfterSent, 'de dagmail staat na de try (en dus buiten de oude scope)');
assert.strictEqual((src.match(/const nietVerstuurd = \[\];/g) || []).length, 1, 'precies een declaratie');
console.log('4 geslaagd, 0 gefaald');
