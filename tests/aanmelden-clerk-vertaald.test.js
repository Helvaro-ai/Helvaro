'use strict';
/* Het aanmeldscherm (2026-10-09, gemeld door de eigenaar met een screenshot):
 *   1. Clerk's wachtwoordmelding en e-mailhint stonden in het Engels op een
 *      Nederlandstalig scherm ("Your password meets all the necessary
 *      requirements", "Example format: name@example.com");
 *   2. groeide het Clerk-formulier, dan werd het tot 320px samengeperst en liep
 *      het over de vinkjes en de uitleg eronder (flexkolom die krimpt). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const i18n = require(path.join(__dirname, '..', 'api', '_i18n.js'));
const engels = 'Your password meets all the necessary requirements.';
for (const taal of ['nl', 'fr', 'de', 'en']) {
  const l = i18n.clerkLocalisatie(taal);
  const z = l.unstable__errors && l.unstable__errors.zxcvbn;
  assert.ok(z && z.goodPassword && z.notEnough && z.couldBeStronger, 'zxcvbn-teksten in ' + taal);
  if (taal !== 'en') assert.notStrictEqual(z.goodPassword, engels, 'niet Engels in ' + taal);
  assert.ok(l.formFieldInput__emailAddress_format && !/^Example format/.test(l.formFieldInput__emailAddress_format) || taal === 'en', 'e-mailhint in ' + taal);
  const pc = l.unstable__errors.passwordComplexity;
  assert.ok(pc && /\{\{length\}\}/.test(pc.minimumLength), 'passwordComplexity met {{length}} in ' + taal);
}
const css = fs.readFileSync(path.join(__dirname, '..', 'api', '_dash', 'styles.js'), 'utf8');
assert.ok(/#login-page \.login-form-inner > \* \{ flex-shrink: 0; \}/.test(css), 'blokken in de inlogkolom krimpen niet');
console.log('aanmelden-clerk-vertaald: ok');
