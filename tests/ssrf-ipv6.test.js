/*
 * F9 -- SSRF via IPv4-in-IPv6 (audit inventory F9).
 *
 * `new URL('http://[::ffff:127.0.0.1]/')` geeft hostname `[::ffff:7f00:1]`; de
 * oude controle zocht alleen de gepunte vorm en liet de hex-vorm door, zodat de
 * server zijn eigen loopback / de cloud-metadata kon ophalen. Nu eerst IPv6
 * volledig uitschrijven en de ingebedde IPv4 controleren.
 */
'use strict';
const fw = require('../api/_lib/fetch-website');
const feed = require('../api/_voorraad-providers/feed');
const adres = require('../api/_crm/adres');
const { teller } = require('./_nep-voorraad');
const t = teller();
const ck = t.ck;
const stil = console.warn; console.warn = () => {};

const intern = [
  '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a9fe:a9fe]', '[::ffff:169.254.169.254]', '[::ffff:10.0.0.1]', '[::ffff:c0a8:101]',
  '[::1]', '[::]', '[::127.0.0.1]', '[fd00::1]', '[fc00::1]', '[fe80::1]', '[64:ff9b::7f00:1]', '[2002:7f00:1::]',
  '127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.16.0.1', '100.64.0.1', '0.0.0.0',
];
const extern = ['[::ffff:8.8.8.8]', '[::ffff:808:808]', '[2606:4700:4700::1111]', '8.8.8.8', '93.184.216.34'];

(async () => {
  console.log('\nurlToegestaan / isInternIp / hostIsExtern');
  for (const h of intern) {
    ck(`http://${h}/ geweigerd (naam)`, fw.urlToegestaan('http://' + h + '/', 't') === null);
    ck(`${h} is intern`, fw.isInternIp(h.replace(/^\[|\]$/g, '')) === true);
    ck(`${h} niet extern`, (await fw.hostIsExtern(new URL('http://' + h + '/').hostname)) === false);
    ck(`voorraadfeed weigert ${h}`, feed.isInternIp(h.replace(/^\[|\]$/g, '')) === true);
  }
  for (const h of extern) {
    ck(`http://${h}/ toegestaan`, fw.urlToegestaan('http://' + h + '/', 't') !== null);
    ck(`${h} is extern`, (await fw.hostIsExtern(new URL('http://' + h + '/').hostname)) === true);
  }
  ck('fetchWebsite haalt [::ffff:7f00:1] niet op', (await fw.fetchWebsite('http://[::ffff:7f00:1]/', { tag: 't' })) === null);
  ck('fetchWebsite haalt [::ffff:a9fe:a9fe] niet op', (await fw.fetchWebsite('http://[::ffff:a9fe:a9fe]/latest/meta-data/', { tag: 't' })) === null);

  console.log('\nCRM-webhook (api/_crm/adres.js)');
  for (const h of ['[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a9fe:a9fe]', '[::1]', '[fd00::1]', '127.0.0.1']) {
    let code = null;
    try { await adres.keurUrl('https://' + h + '/hook'); } catch (e) { code = e.code || e.message; }
    ck(`https://${h}/ geweigerd`, code === 'intern_adres', code);
  }
  ck('priveV6 hex-vorm', adres.priveV6('::ffff:7f00:1') === true && adres.priveV6('::ffff:808:808') === false);
  console.warn = stil;
  t.klaar();
})();
