'use strict';
/*
 * Persoonsgegevens maskeren voor de logs (audit 26/09).
 *
 * Vercel-logs zijn geen plek voor volledige telefoonnummers en e-mailadressen:
 * ze worden bewaard, doorzocht en soms gedeeld om een storing uit te leggen.
 * De laatste vier cijfers en het domein volstaan om een melding terug te
 * vinden. tests/log-masker.test.js houdt ruwe waarden uit console-regels.
 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  return s[0] + '***' + s.slice(at);
}

module.exports = { maskPhone, maskEmail };
