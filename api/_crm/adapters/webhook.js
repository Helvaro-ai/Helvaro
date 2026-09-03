'use strict';
/*
 * Eigen webhook -- de adapter voor elk CRM waar wij er geen van hebben.
 *
 * -- Waarom dit bestaat -------------------------------------------------------
 * Van Whise is geen enkele API-vorm openbaar, en Omnicasa heeft er twee waarvan
 * wij er één kennen. Wachten tot elke leverancier ons documentatie geeft, maakt
 * de lijst met ondersteunde CRM's een lijst die IK moet bijhouden. Een
 * ondertekende webhook draait dat om: de makelaar (of zijn IT'er, of zijn
 * Make/n8n-scenario) vangt de lead op en zet hem waar hij hem hebben wil.
 *
 * Het is dus geen tweede CRM-systeem maar een zesde adapter, met exact dezelfde
 * vorm als de andere vijf: dezelfde neutrale lead, dezelfde ontdubbeling,
 * dezelfde faal-zacht-regel, dezelfde opslag van sleutels.
 *
 * -- De handtekening is die van Stripe ---------------------------------------
 * Kop:     X-Helvaro-Signature: t=<unix>,v1=<hex>
 * Getekend: `${t}.${ruwe body}` met HMAC-SHA256
 *
 * Letterlijk dezelfde vorm als api/_stripe.js verifieert. Dat is geen
 * toevalligheid en geen luiheid: elke ontwikkelaar die ooit een Stripe-webhook
 * heeft aangesloten kan deze verifiëren zonder onze documentatie te lezen, en
 * bibliotheken die het al doen werken meteen. Een eigen schema verzinnen levert
 * alleen een nieuwe manier op om het fout te doen.
 *
 * De ontvanger hoort te controleren:
 *   1. dat v1 klopt   -- met een timingveilige vergelijking
 *   2. dat t vers is  -- wij raden 300 seconden aan; dat is de herhaalbeveiliging
 * Zonder die tweede controle kan iemand die één geldig bericht heeft
 * opgevangen het eindeloos opnieuw aanbieden.
 *
 * -- SSRF: het adres komt van de KLANT ---------------------------------------
 * Dit is het enige punt in Helvaro waar een klant ons een adres geeft dat de
 * server zelf gaat aanroepen. Zonder controle is dat een sleutel tot het
 * interne netwerk van de hostingomgeving -- 169.254.169.254 geeft op de meeste
 * clouds metadata, en 10.x/127.x geven interne diensten.
 *
 * Daarom: alleen https, en de hostnaam wordt OPGEZOCHT en elk opgeleverd
 * IP-adres gecontroleerd, niet alleen de letterlijke tekst. "intern.klant.be"
 * dat naar 10.0.0.5 wijst ziet er als tekst onschuldig uit.
 *
 * Wat hiermee NIET is afgedekt, eerlijk benoemd: DNS-rebinding. Tussen onze
 * controle en de aanroep van fetch() kan een antwoord veranderen. Dat volledig
 * dichtzetten vraagt een eigen socket-laag; de kosten daarvan wegen hier niet
 * op tegen het risico, want er gaat alleen een LEAD naartoe -- geen sleutels,
 * geen gegevens van andere klanten -- en het antwoord wordt genegeerd.
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { vraag, CrmError } = require('../http');

const NAAM = 'Eigen webhook';
const TOLERANTIE_S = 300;

const velden = [
  {
    sleutel: 'url',
    label: 'Webhook-adres',
    type: 'tekst',
    hint: 'Het https-adres waar wij elke gekwalificeerde lead naartoe sturen.',
  },
  {
    sleutel: 'secret',
    label: 'Ondertekeningssleutel',
    type: 'geheim',
    optioneel: true,
    hint: 'Laat leeg en we maken er een voor je. Je ontvanger gebruikt dezelfde '
        + 'sleutel om de handtekening te controleren.',
  },
];

/* ── Is dit adres veilig om zelf aan te roepen? ─────────────────────────────── */

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

/* ── Ondertekenen ──────────────────────────────────────────────────────────── */

function tekenen(secret, body, nu = Date.now()) {
  const t = Math.floor(nu / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { t, v1, kop: `t=${t},v1=${v1}` };
}

function nieuweSleutel() {
  return 'whsec_' + crypto.randomBytes(24).toString('hex');
}

async function stuur(cred, gebeurtenis, inhoud) {
  const url = await keurUrl(cred.url);
  const body = JSON.stringify({
    gebeurtenis,
    verstuurdOp: new Date().toISOString(),
    ...inhoud,
  });
  const { kop } = tekenen(cred.secret, body);

  return vraag(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Helvaro-Signature': kop,
      'X-Helvaro-Event': gebeurtenis,
      'User-Agent': 'Helvaro/1.0 (+https://helvaro.pro)',
    },
    body,
    leverancier: 'Je webhook',
    /* Korter dan de standaard: dit is een adres van een klant, en een eigen
       endpoint dat traag is mag de synchronisatie van de ANDERE CRM's van
       diezelfde klant niet opeten. Zie het budget in ../index.js. */
    timeoutMs: 8000,
  });
}

/**
 * Testen door echt een ping te sturen.
 *
 * Een ping is de enige eerlijke test: hij bewijst dat het adres bestaat, dat de
 * ontvanger draait, en dat hij onze handtekening accepteert. En hij maakt niets
 * aan, dus hij mag zo vaak als de klant wil.
 */
async function test(cred) {
  const secret = String((cred && cred.secret) || '').trim() || nieuweSleutel();
  const url = await keurUrl(cred && cred.url);
  await stuur({ url, secret }, 'ping', {
    bericht: 'Helvaro heeft je webhook bereikt. Je koppeling werkt.',
  });
  return {
    ok: true,
    account: new URL(url).host,
    /* De sleutel gaat mee terug in de opgeslagen credentials. Hij wordt NOOIT
       door status() teruggegeven -- zie ../index.js. */
    extra: { secret, url },
    /* Eenmalig tonen: de klant heeft hem nodig om de handtekening te
       controleren, en hierna is hij nergens meer op te vragen. */
    toonEenmalig: (cred && cred.secret) ? '' : secret,
  };
}

/**
 * De lead naar de webhook.
 *
 * Er komt geen id terug van een ontvanger die wij niet kennen, dus de
 * ontdubbeling loopt hier via onze eigen sleutel: `vorm.sleutel` is stabiel per
 * lead, en de ontvanger hoort daarop te ontdubbelen. Wij bewaren hem ook, zodat
 * ../index.js weet dat deze lead al eens verstuurd is.
 */
async function duwLead(cred, vorm, vorige = {}) {
  await stuur(cred, vorige.contactId ? 'lead.bijgewerkt' : 'lead.nieuw', {
    lead: vorm,
    eerderVerstuurd: Boolean(vorige.contactId),
  });
  return { contactId: vorm.sleutel, dealId: vorm.sleutel };
}

/* De samenvatting zit al in `vorm.deal`; een tweede aanroep zou hetzelfde
   nog eens sturen. */
async function duwNotitie() { return { notitieId: '' }; }

module.exports = {
  naam: 'webhook',
  label: NAAM,
  velden,
  test, duwLead, duwNotitie,
  /* Geëxporteerd voor de tests en voor scripts/crm-check.js. */
  keurUrl, tekenen, nieuweSleutel, priveV4, priveV6, TOLERANTIE_S,
};
