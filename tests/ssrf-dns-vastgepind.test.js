'use strict';
/* DNS-rebinding (review 2026-10-09): de naam werd vóór het ophalen gecontroleerd
 * en daarna door fetch() opnieuw opgelost. Nu controleert de verbindingslaag zelf
 * het adres dat echt gebruikt wordt. Hier: een nep-DNS die eerst extern en dan
 * intern antwoordt, en de ontbrekende IPv4-translated vorm. */
const assert = require('assert');
const path = require('path');
const dns = require('dns').promises;
const antwoorden = [];
dns.lookup = async () => antwoorden.shift();
const { _test, veiligFetch } = require(path.join(__dirname, '..', 'api', '_lib', 'fetch-website.js'));
const { isInternIp } = require(path.join(__dirname, '..', 'api', '_lib', 'ip-intern.js'));
const roep = (opties) => new Promise((ok) => _test.veiligeLookup('rebind.test', opties, (err, adres, fam) => ok({ err, adres, fam })));
(async () => {
  antwoorden.push([{ address: '93.184.216.34', family: 4 }]);
  let r = await roep({});
  assert.ok(!r.err && r.adres === '93.184.216.34', 'extern adres mag');
  antwoorden.push([{ address: '169.254.169.254', family: 4 }]);
  r = await roep({});
  assert.ok(r.err && r.err.code === 'ERR_INTERN_ADRES', 'metadata-adres bij verbinden geweigerd');
  antwoorden.push([{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }]);
  r = await roep({ all: true });
  assert.ok(r.err, 'één intern adres in de lijst = weigeren');
  antwoorden.push([]);
  r = await roep({});
  assert.ok(r.err, 'geen adres = weigeren');
  assert.ok(isInternIp('::ffff:0:7f00:1') && isInternIp('::ffff:0:a9fe:a9fe') && !isInternIp('::ffff:0:808:808'), 'IPv4-translated vorm');
  assert.strictEqual(typeof veiligFetch, 'function');
  console.log('ssrf-dns-vastgepind: ok');
})().catch(e => { console.error(e); process.exit(1); });
