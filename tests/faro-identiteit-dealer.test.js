'use strict';
/* Faro stelde zich aan autodealers voor als "het CRM waarmee vastgoedmakelaars
 * hun panden beheren" (2026-10-09). Nu: elke markt haar eigen woorden; vastgoed
 * houdt de tekst byte voor byte. */
const assert = require('assert');
const path = require('path');
const { identityVoor, IDENTITY } = require(path.join(__dirname, '..', 'api', '_faro', 'prompt.js'));
const auto = identityVoor({ vertical: 'dealership', segment: 'auto' });
assert.ok(/autodealers/.test(auto), 'autodealer-woorden');
assert.ok(!/vastgoedmakelaar|\bpand|bezichtiging/i.test(auto), 'geen vastgoedwoorden voor een autodealer');
assert.strictEqual(identityVoor({ vertical: 'dealership' }), auto, 'leeg segment = auto');
assert.strictEqual(identityVoor({ vertical: 'vastgoed' }), IDENTITY, 'vastgoed ongewijzigd');
assert.strictEqual(identityVoor({}), IDENTITY, 'onbekend = ongewijzigd');
assert.ok(/motordealers/.test(identityVoor({ vertical: 'dealership', segment: 'motor' })), 'motor ongewijzigd motor');
console.log('faro-identiteit-dealer: ok');
