'use strict';
/*
 * Pushmeldingen via OneSignal.
 * (Module met underscore = geen route, zelfde afspraak als api/_credits.js.)
 *
 * ── Wat dit wel en niet is ──────────────────────────────────────────────────
 * Dit stuurt een melding naar de APPARATEN VAN ÉÉN KANTOOR. De koppeling loopt
 * via de projectcode: de browser meldt zich bij OneSignal aan met
 * OneSignal.login(projectcode) (zie api/dashboard.js), en hier sturen we naar
 * dat externe id. Zonder die koppeling zou je alleen "iedereen" kunnen
 * bereiken, en dat is bij een product met meerdere klanten geen optie.
 *
 * ── Waarom alles hier fail-soft is ──────────────────────────────────────────
 * Een pushmelding is een EXTRAATJE bovenop de kanalen die er al zijn (WhatsApp
 * naar het eigen nummer, e-mail). Als OneSignal er even uit ligt, of de sleutel
 * ontbreekt, mag dat NOOIT de lead zelf raken -- de lead is het product, de
 * melding is een gemak. Elke functie hier geeft daarom een uitkomst terug in
 * plaats van te gooien, en de aanroeper hoeft er niets mee te doen.
 *
 * ── Zonder sleutel gebeurt er niets ─────────────────────────────────────────
 * ONESIGNAL_API_KEY is een SERVERgeheim (anders dan het app-id, dat gewoon in
 * de browser staat). Staat hij er niet, dan is dit stil uit: geen fout, geen
 * halve poging. Zo kan de code uitgerold worden voordat de sleutel gezet is.
 */

const API = 'https://api.onesignal.com/notifications';
const _i18n = require('./_i18n');

function appId() {
  return String(
    process.env.ONESIGNAL_APP_ID !== undefined
      ? process.env.ONESIGNAL_APP_ID
      : '8302e5a5-e792-4fb0-a258-44c672539aa8'
  ).trim();
}

function apiKey() {
  return String(process.env.ONESIGNAL_API_KEY || '').trim();
}

/** Staat pushen aan? App-id EN serversleutel moeten er allebei zijn. */
function configured() {
  return !!(appId() && apiKey());
}

/**
 * Stuur een melding naar alle apparaten van één kantoor.
 *
 * @param {object} o
 * @param {string} o.projectCode  de tenant; hetzelfde id als OneSignal.login()
 * @param {string} o.titel
 * @param {string} o.tekst
 * @param {string} [o.url]        waar de klik heen gaat
 * @returns {Promise<{ok:boolean, reden?:string, id?:string}>}  gooit nooit
 */
async function stuurNaarKantoor({ projectCode, titel, tekst, url } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return { ok: false, reden: 'geen projectcode' };
  if (!configured()) return { ok: false, reden: 'niet geconfigureerd' };

  /* include_aliases + target_channel is de manier om op een extern id te
     richten. include_external_user_ids was de oude vorm en is vervallen. */
  const body = {
    app_id: appId(),
    target_channel: 'push',
    include_aliases: { external_id: [code] },
    headings: { en: String(titel || 'Helvaro') },
    contents: { en: String(tekst || '') },
  };
  if (url) body.url = String(url);

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /* De huidige vorm is "Key <sleutel>". Oudere voorbeelden gebruiken
           "Basic <sleutel>"; die accepteert OneSignal ook nog. Bij een 401 is
           dít het eerste om te controleren. */
        Authorization: `Key ${apiKey()}`,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.warn('[push] OneSignal gaf', r.status, JSON.stringify(data).slice(0, 200));
      return { ok: false, reden: 'http_' + r.status };
    }
    /* Geen ontvangers is GEEN fout. Niemand van dit kantoor heeft meldingen
       aangezet -- dat is een keuze van de klant, geen storing. Wel apart
       teruggeven, zodat de aanroeper het verschil ziet met een echte fout. */
    if (data.errors && Array.isArray(data.errors)
        && data.errors.some((e) => /no subscribers|All included players are not subscribed/i.test(String(e)))) {
      return { ok: false, reden: 'geen ontvangers' };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.warn('[push] versturen mislukt:', err && err.message);
    return { ok: false, reden: 'netwerk' };
  }
}

/**
 * Zelfde als stuurNaarKantoor, maar met een SLEUTEL in plaats van kant-en-klare
 * tekst -- zodat de melding in de taal van het scherm binnenkomt.
 *
 * De taal komt uit DASHBOARD_LANG, want op dit moment (een cron, een webhook,
 * een formulierinzending) is er geen verzoek van de gebruiker om hem uit af te
 * leiden. Zodra er een taalvoorkeur per klant bewaard wordt, is dít de plek om
 * hem te lezen -- de rest van deze functie verandert dan niet.
 */
async function stuurVertaald({ projectCode, titelSleutel, tekstSleutel, vars, url, taal } = {}) {
  const code = _i18n.kort(taal || process.env.DASHBOARD_LANG || _i18n.STANDAARD);
  return stuurNaarKantoor({
    projectCode,
    titel: _i18n.t(code, titelSleutel),
    tekst: tekstSleutel ? _i18n.t(code, tekstSleutel, vars) : '',
    url,
  });
}

module.exports = { configured, stuurNaarKantoor, stuurVertaald, appId };
