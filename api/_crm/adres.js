'use strict';
/*
 * CRM -- is dit adres veilig om zelf aan te roepen?
 *
 * -- Waarom dit een eigen bestand is -----------------------------------------
 * Drie adapters laten de KLANT een adres opgeven dat onze server vervolgens
 * aanroept: de eigen webhook, het API-adres van Omnicasa, en het My Domain van
 * Salesforce. Deze controle stond alleen in de webhook-adapter, en api/leads.js
 * beweerde in een opmerking dat het interne netwerk daarmee "al dicht" was.
 * Dat was het niet: voor Omnicasa en Salesforce stond er geen enkele controle.
 *
 * Gevonden bij een onafhankelijke beveiligingsronde. De les is niet "er stond
 * een gat" maar "een controle die in een van de drie aanroepers woont, is geen
 * controle" -- daarom staat hij nu op één plek en importeren alle drie hem.
 *
 * -- Wat het afdekt en wat niet -----------------------------------------------
 * Alleen https, geen inloggegevens in de URL, en de hostnaam wordt OPGEZOCHT
 * waarna elk opgeleverd IP-adres tegen de privé-bereiken wordt gehouden --
 * "intern.klant.be" dat naar 10.0.0.5 wijst ziet er als tekst onschuldig uit.
 *
 * NIET afgedekt: DNS-rebinding. Tussen onze controle en de aanroep van fetch()
 * kan een antwoord veranderen. Dat volledig dichtzetten vraagt een eigen
 * socket-laag; wat er langs deze weg naar buiten gaat is een LEAD -- geen
 * sleutels, geen gegevens van andere klanten -- en het antwoord wordt op één
 * plek na genegeerd.
 *
 * Omleidingen zijn WEL afgedekt, maar niet hier: zie api/_crm/http.js, dat
 * redirect:'manual' zet. Dat is dezelfde keuze die api/_lib/fetch-website.js al
 * maakte ("Don't follow redirects to internal IPs"). Zonder dat is deze hele
 * controle waardeloos -- een publiek adres dat 307 naar 169.254.169.254 stuurt
 * komt er anders gewoon langs. Dat is echt zo gebeurd en is nagespeeld.
 */

const dns = require('dns').promises;
const net = require('net');
const { CrmError } = require('./http');


/** Een IPv4 in een bereik dat nooit van een klant kan zijn. */
function priveV4(ip) {
  const d = ip.split('.').map(Number);
  if (d.length !== 4 || d.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // onleesbaar = weigeren
  const [a, b] = d;
  return a === 0                                  // 0.0.0.0/8   "dit netwerk"
      || a === 10                                 // 10/8        privé
      || a === 127                                // 127/8       loopback
      || (a === 100 && b >= 64 && b <= 127)       // 100.64/10   carrier-grade NAT
      || (a === 169 && b === 254)                 // 169.254/16  link-local EN cloud-metadata
      || (a === 172 && b >= 16 && b <= 31)        // 172.16/12   privé
      || (a === 192 && b === 168)                 // 192.168/16  privé
      || (a === 192 && b === 0)                   // 192.0.0/24  IETF-protocol
      || (a === 198 && (b === 18 || b === 19))    // 198.18/15   benchmark
      || a >= 224;                                // 224/4 multicast, 240/4 gereserveerd
}

function priveV6(ip) {
  const s = String(ip).toLowerCase();
  if (s === '::1' || s === '::') return true;               // loopback / onbepaald
  /* Een IPv4 in IPv6-jas (::ffff:10.0.0.1) omzeilt anders de hele v4-controle. */
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return priveV4(mapped[1]);
  const eerste = s.split(':')[0];
  if (!eerste) return false;
  const n = parseInt(eerste, 16);
  if (!Number.isFinite(n)) return true;
  if ((n & 0xfe00) === 0xfc00) return true;                 // fc00::/7  unique local
  if ((n & 0xffc0) === 0xfe80) return true;                 // fe80::/10 link-local
  return false;
}

function priveAdres(ip, familie) {
  return familie === 6 ? priveV6(ip) : priveV4(ip);
}

/**
 * Controleer het adres, en geef terug wat er echt gebruikt gaat worden.
 * Gooit een CrmError met een zin die de makelaar begrijpt.
 */
async function keurUrl(ruw) {
  let u;
  try { u = new URL(String(ruw || '').trim()); }
  catch (_) { throw new CrmError('Dat is geen geldig webadres.', { code: 'geen_url' }); }

  if (u.protocol !== 'https:') {
    throw new CrmError('Het webhook-adres moet met https:// beginnen.', { code: 'geen_https' });
  }
  /* Inloggegevens in de URL (https://gebruiker:wachtwoord@...) belanden in elke
     log en in elke foutmelding. Nooit doen. */
  if (u.username || u.password) {
    throw new CrmError('Zet geen gebruikersnaam of wachtwoord in het adres.', { code: 'url_met_login' });
  }

  /* URL.hostname geeft een IPv6-adres MET blokhaken terug ("[::1]"), en daar
     struikelt zowel dns.lookup als elke IP-controle over. Zonder deze regel gaf
     https://[::1]/ de melding "adres bestaat niet" in plaats van "intern
     adres": het werd nog steeds geweigerd, maar door de verkeerde controle --
     en een PUBLIEK IPv6-adres werd om diezelfde reden ten onrechte geweigerd.
     Gevonden door de test, niet door te kijken. */
  const host = u.hostname.replace(/^\[/, '').replace(/\]$/, '');

  /* Staat er al een IP-adres, dan is er niets op te zoeken. Meteen controleren:
     dns.lookup zou het teruggeven zoals het is, maar dan hangt de controle aan
     gedrag dat per platform kan verschillen. */
  const literal = net.isIP(host);
  if (literal) {
    if (priveAdres(host, literal)) {
      throw new CrmError(
        'Dat adres wijst naar een intern netwerk. Gebruik een adres dat vanaf het '
        + 'internet bereikbaar is.',
        { code: 'intern_adres' },
      );
    }
    return u.toString();
  }

  let adressen;
  try {
    adressen = await dns.lookup(host, { all: true });
  } catch (_) {
    throw new CrmError('Dat adres bestaat niet of is niet op te zoeken.', { code: 'geen_dns' });
  }
  if (!adressen.length) throw new CrmError('Dat adres bestaat niet.', { code: 'geen_dns' });

  /* ÉÉN privé-adres is genoeg om te weigeren. Een hostnaam die zowel een
     publiek als een intern adres teruggeeft, is precies de aanval. */
  for (const a of adressen) {
    if (priveAdres(a.address, a.family)) {
      throw new CrmError(
        'Dat adres wijst naar een intern netwerk. Gebruik een adres dat vanaf het '
        + 'internet bereikbaar is.',
        { code: 'intern_adres' },
      );
    }
  }
  return u.toString();
}


module.exports = { keurUrl, priveV4, priveV6, priveAdres };
