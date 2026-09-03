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
 * Dit is een van de drie plekken waar een klant ons een adres geeft dat de
 * server zelf gaat aanroepen. De controle daarop staat in api/_crm/adres.js en
 * wordt door alle drie gebruikt; omleidingen worden geweigerd in
 * api/_crm/http.js. Lees die twee koppen -- daar staat wat er wel en niet mee
 * is afgedekt.
 */

const crypto = require('crypto');
const { vraag, CrmError } = require('../http');
const { keurUrl } = require('../adres');   // gedeeld: zie de kop van dat bestand

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
  keurUrl, tekenen, nieuweSleutel, TOLERANTIE_S,
};
