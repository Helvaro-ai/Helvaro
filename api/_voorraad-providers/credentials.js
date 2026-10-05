'use strict';
/*
 * Inloggegevens voor platformkoppelingen.
 *
 * Een dealer die een API-koppeling activeert, geeft ons een gebruikersnaam en
 * wachtwoord (of een sleutel) van zijn eigen platformaccount. Dat is zijn
 * sleutel tot zijn advertenties; het wordt dus behandeld als een geheim:
 *
 *   - versleuteld opgeslagen (AES-256-GCM, dezelfde helper en sleutel als de
 *     Google-tokens in api/_gcal.js), nooit in platte tekst in Airtable
 *   - NOOIT teruggegeven aan het scherm: de API zegt alleen "ingesteld: ja/nee"
 *   - zonder encryptiesleutel op de server weigeren we op te slaan, in plaats
 *     van terug te vallen op een standaardsleutel (zie _gcal.encKey)
 *
 * Geen route: onderstreepje voorop.
 */

const MAX = 400;

function tekst(x) { return String(x == null ? '' : x).trim().slice(0, MAX); }

/** De invoer van het formulier, gesaneerd per authtype. null = onbruikbaar. */
function saneer(invoer, auth) {
  const o = invoer && typeof invoer === 'object' ? invoer : {};
  if (auth === 'basic') {
    const username = tekst(o.username), password = String(o.password == null ? '' : o.password).slice(0, MAX);
    return username && password ? { username, password } : null;
  }
  if (auth === 'api_key') {
    const apiKey = tekst(o.apiKey);
    return apiKey ? { apiKey } : null;
  }
  return null;
}

/** @returns {string} 'v1:...' (of gooit als er geen sleutel is) */
function versleutel(obj) {
  return require('../_gcal').encryptToken(JSON.stringify(obj));
}

/** @returns {object|null} */
function ontsleutel(opgeslagen) {
  const s = String(opgeslagen || '');
  if (!s.startsWith('v1:')) return null;
  try {
    const plat = require('../_gcal').decryptToken(s);
    return plat ? JSON.parse(plat) : null;
  } catch (_) { return null; }
}

/** Is dit een geldige opgeslagen waarde? (alleen vorm; ontsleutelen kan falen) */
function isVersleuteld(x) { return typeof x === 'string' && /^v1:[A-Za-z0-9+/=]+$/.test(x); }

module.exports = { saneer, versleutel, ontsleutel, isVersleuteld };
