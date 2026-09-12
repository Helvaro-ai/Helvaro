'use strict';
/*
 * De verkoper op de hoogte brengen zodra er een dealership-afspraak geboekt is.
 *
 * ── Waarom dit een eigen bestand is ──────────────────────────────────────────
 * api/whatsapp.js heeft al owner-meldingen (escalatie, gekwalificeerde lead,
 * afzegging), maar die zijn allemaal losse stukken tekst die rechtstreeks
 * sendWA() aanroepen. Een dealership-afspraak heeft twee dingen die de
 * bestaande meldingen niet hebben: een lijst met MEERDERE ontvangers (Notify
 * Phone + Notify Phones Extra) en een verzendpad dat buiten het 24u-venster kan
 * vallen (een dashboard-boeking wacht niet op een vers WhatsApp-bericht van de
 * lead). Dat verdient een eigen, herbruikbare plek in plaats van een derde kopie
 * van "stuur naar de eigenaar" met net iets andere aannames.
 *
 * ── Ontvangers: nooit een hard-gecodeerd nummer ──────────────────────────────
 * `ontvangers()` leest ALTIJD uit Client Config (Notify Phone + Notify Phones
 * Extra) en valt pas terug op process.env.NOTIFY_PHONE als die lijst leeg is --
 * exact het bestaande gedrag in api/whatsapp.js voor de eerste eigenaar. Een
 * nummer zonder landcode (begint met '0', of korter dan tien cijfers) wordt
 * geweigerd: dat is bijna altijd een lokaal nummer dat iemand vergat om te
 * zetten, en Meta zou het toch afwijzen -- liever hier stil overslaan met een
 * waarschuwing dan een verzending laten stuklopen op een nummer dat nooit had
 * kunnen werken.
 *
 * ── Twee verzendwegen, één functie ────────────────────────────────────────────
 * `stuurAfspraakMelding()` probeert eerst een vrij bericht (goedkoop, en werkt
 * zolang het 24u-venster van DEZE VERKOPER open staat -- niet dat van de lead).
 * Sluit dat venster, dan valt hij terug op de goedgekeurde 'notify'-template.
 * Beide gaan door api/_wa-send.js, de enige deur naar WhatsApp; dit bestand
 * beslist alleen WANNEER welke deur.
 *
 * ── Nooit de boeking laten mislukken ──────────────────────────────────────────
 * Een afspraak bestaat al tegen de tijd dat dit bestand aangeroepen wordt. Een
 * melding die niet aankomt is vervelend voor de verkoper, maar mag NOOIT de
 * afspraak zelf ongedaan maken of de aanroeper laten denken dat er iets mis is
 * met de boeking. Vandaar: nooit gooien, altijd een `{verstuurd, mislukt}`
 * terug.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const _waSend      = require('./_wa-send');
const _waTemplates = require('./_wa-templates');
const _lang        = require('./_lang');
const _i18n        = require('./_i18n');
const _activiteit  = require('./_activiteit');

const F_NOTIFY       = 'fldZEApe0gfse07AU';   // Client Config: Notify Phone
const F_NOTIFY_EXTRA = 'fldxSbRXga4yO1RXy';   // Client Config: Notify Phones Extra

/* Zelfde soorten typen als api/_dealer-boeking.js AFSPRAAK_TYPES. Hier los
   gehouden en niet geïmporteerd: dit bestand hoeft niets van de boekingslogica
   te weten, alleen welk woord bij welk type hoort. Twee bestanden die dezelfde
   vier woorden kennen is goedkoper dan een import voor een lijst van vier
   strings. */
const MELDING_TYPE_SLEUTELS = Object.freeze(['proefrit', 'bezichtiging', 'ophaling', 'gesprek']);

const TEMP_EMOJI = Object.freeze({ hot: '🔥', warm: '🟡', cold: '⚪' });

/**
 * Eén ruw nummer normaliseren tot cijfers-met-landcode, of null als het geweigerd
 * wordt.
 *
 * Zelfde grondregel als api/_wa-send.js normalizePhone (alleen cijfers, geen
 * plus, geen spaties) plus een EXTRA eis die specifiek is voor een lijst van
 * eigenaarsnummers: een landcode is verplicht. Een dealer die "0470123456"
 * intypt in Notify Phones Extra bedoelde vrijwel zeker een Belgisch nummer en
 * vergat de landcode -- dat sturen naar Meta levert een cryptische afwijzing
 * op, hier weigeren met een duidelijke log is eerlijker.
 */
function normaliseerNummer(ruw) {
  const cijfers = String(ruw == null ? '' : ruw).replace(/[^0-9]/g, '');
  if (!cijfers) return null;
  if (cijfers.length < 10 || cijfers.charAt(0) === '0') {
    console.warn('[dealer-melding] nummer geweigerd (geen landcode of te kort): ...' + cijfers.slice(-4));
    return null;
  }
  return cijfers;
}

/**
 * De gededuplideerde lijst ontvangers voor een dealership-melding.
 *
 * @param {object} clientFields  Client Config `fields`, gelezen met
 *                               returnFieldsByFieldId=true (zie de kop van
 *                               api/whatsapp.js voor waarom)
 * @returns {string[]}
 */
function ontvangers(clientFields) {
  const f = clientFields || {};
  const ruw = [];

  const hoofd = f[F_NOTIFY];
  if (hoofd) ruw.push(hoofd);

  const extra = String(f[F_NOTIFY_EXTRA] || '');
  for (const regel of extra.split('\n')) {
    const t = regel.trim();
    if (t) ruw.push(t);
  }

  const uit = [];
  const gezien = new Set();
  for (const kandidaat of ruw) {
    const genormaliseerd = normaliseerNummer(kandidaat);
    if (!genormaliseerd || gezien.has(genormaliseerd)) continue;
    gezien.add(genormaliseerd);
    uit.push(genormaliseerd);
  }

  /* Terugval op het gedeelde nummer, en alleen als de lijst leeg is -- exact
     het bestaande gedrag in api/whatsapp.js voor de eigenaarsmeldingen. Nooit
     hard gecodeerd: process.env.NOTIFY_PHONE is de enige plek waar dit nummer
     vandaan komt. */
  if (!uit.length) {
    const terugval = normaliseerNummer(process.env.NOTIFY_PHONE);
    if (terugval) uit.push(terugval);
  }

  return uit;
}

/**
 * Het berichtje voor de verkoper. Elke regel is optioneel en verdwijnt zonder
 * spoor als de bijbehorende data ontbreekt -- nooit "undefined", "null" of
 * "NaN" op een scherm, en nooit een halve zin.
 *
 * @param {object} o
 * @param {string} [o.lang]           taal van de VERKOPER, niet van de lead
 * @param {string} [o.leadNaam]
 * @param {string} [o.wanneer]        al geformatteerd (zie formatApptDateTime)
 * @param {string} [o.voertuigNaam]
 * @param {string} [o.prijsTekst]     al geformatteerd (zie _vehicles.prijsTekst)
 * @param {string} [o.type]           proefrit | bezichtiging | ophaling | gesprek
 * @param {number} [o.score]          0-100
 * @param {string} [o.temperatuur]    hot | warm | cold
 * @returns {string}
 */
function bouwAfspraakBericht(o = {}) {
  const taal        = String(o.lang || 'nl');
  const naam        = String(o.leadNaam || '').trim();
  const wanneer     = String(o.wanneer || '').trim();
  const voertuig    = String(o.voertuigNaam || '').trim();
  const prijs       = String(o.prijsTekst || '').trim();
  const type        = o.type;
  const score       = o.score;
  const temperatuur = o.temperatuur;

  const regels = [_i18n.t(taal, 'melding.afspraak.kop'), ''];

  /* De kernregel: alleen zinvol als naam, moment EN voertuig er alle drie zijn.
     Ontbreekt er één, dan levert de zin een gat op ("heeft een afspraak om
     voor een.") en is weglaten eerlijker dan een kapotte zin tonen. */
  if (naam && wanneer && voertuig) {
    const prijsSuffix = prijs ? ` — ${prijs}` : '';
    regels.push(_i18n.t(taal, 'melding.afspraak.regel', { naam, wanneer, voertuig, prijsSuffix }));
  }

  if (type && MELDING_TYPE_SLEUTELS.indexOf(type) !== -1) {
    regels.push(_i18n.t(taal, 'melding.afspraak.type', { type: _i18n.t(taal, 'melding.type.' + type) }));
  }

  /* Een score van 0 is een geldige score ("erg koud"), dus expliciet op
     undefined/null testen -- niet op falsy, anders verdwijnt precies de
     interessantste lead uit de melding. */
  if (score !== undefined && score !== null && temperatuur && TEMP_EMOJI[temperatuur]) {
    const scoreGetal = Math.max(0, Math.min(100, Math.round(Number(score)) || 0));
    regels.push(_i18n.t(taal, 'melding.afspraak.score', {
      emoji: TEMP_EMOJI[temperatuur],
      temp:  _i18n.t(taal, 'melding.temp.' + temperatuur),
      score: scoreGetal,
    }));
  }

  return regels.join('\n').trim();
}

/* Loggen mag de melding zelf nooit ophouden -- fire-and-forget, genegeerde
   catch, zoals overal waar _activiteit.log() wordt aangeroepen. */
function loggen(projectCode, soort, opts) {
  _activiteit.log(projectCode, soort, opts).catch(() => {});
}

/**
 * De melding versturen naar elke ontvanger, met terugval van vrij bericht naar
 * template. Werpt NOOIT.
 *
 * @param {object} o
 * @param {string} o.projectCode
 * @param {object} o.clientFields    Client Config `fields`, zie ontvangers()
 * @param {string} [o.phoneNumberId]
 * @param {string} [o.token]
 * @param {string} [o.lang]          taal van de VERKOPER, voor de templatekeuze
 * @param {string} o.tekst           uit bouwAfspraakBericht()
 * @param {object} [o.terugval]      { naam, telefoon } -- templateparameters
 * @returns {Promise<{verstuurd:number, mislukt:number}>}
 */
async function stuurAfspraakMelding({ projectCode, clientFields, phoneNumberId, token, lang, tekst, terugval } = {}) {
  const code = String(projectCode || '').trim();
  let verstuurd = 0;
  let mislukt = 0;

  try {
    const lijst = ontvangers(clientFields);
    if (!lijst.length) return { verstuurd, mislukt };

    /* Dezelfde herleiding als elke andere goedgekeurde-template-send in deze
       codebase (booking/reminder/followup): _TEMPLATE_LANG-env wint, anders de
       taal van de klant, en resolveTemplateLanguage() garandeert dat het
       resultaat ook echt bij Meta bestaat. Zie api/_lang.js's eigen kop. */
    const templateLang = _lang.resolveTemplateLanguage(process.env.NOTIFY_TEMPLATE_LANG || lang, lang).code;
    const naam     = (terugval && terugval.naam) || '';
    const telefoon = (terugval && terugval.telefoon) || '';

    for (const to of lijst) {
      const laatste4 = String(to).slice(-4);
      try {
        let via = 'vrij';
        let r = await _waSend.sendFreeformSafe({ to, text: tekst, windowOpen: true, phoneNumberId, token });

        if (!r.ok && (r.code === 'window_closed' || r.metaCode === 131047)) {
          via = 'template';
          r = await _waSend.sendTemplateSafe({
            to, template: _waTemplates.naamVoor('notify'), lang: templateLang,
            params: [naam, telefoon, code], phoneNumberId, token,
          });
        }

        /* Eén herkansing bij een snelheidslimiet, niet bij een structurele
           weigering (verkeerd nummer, geen sjabloon) -- die lost een tweede
           poging na anderhalve seconde toch niet op. */
        if (!r.ok && (r.code === 'rate_limit' || r.code === 'pair_rate_limit')) {
          await new Promise((res) => setTimeout(res, 1500));
          r = via === 'template'
            ? await _waSend.sendTemplateSafe({
                to, template: _waTemplates.naamVoor('notify'), lang: templateLang,
                params: [naam, telefoon, code], phoneNumberId, token,
              })
            : await _waSend.sendFreeformSafe({ to, text: tekst, windowOpen: true, phoneNumberId, token });
        }

        if (r.ok) {
          verstuurd++;
          loggen(code, 'employee_notification_sent', { details: { ontvanger: laatste4, via } });
        } else {
          mislukt++;
          loggen(code, 'employee_notification_failed', {
            details: { ontvanger: laatste4, code: r.code, metaCode: r.metaCode, ownerAction: r.ownerAction },
          });
        }
      } catch (err) {
        mislukt++;
        console.warn('[dealer-melding] versturen naar ...' + laatste4 + ' mislukt (genegeerd):', err && err.message);
      }
    }
  } catch (err) {
    console.warn('[dealer-melding] stuurAfspraakMelding exception (genegeerd):', err && err.message);
  }

  return { verstuurd, mislukt };
}

module.exports = {
  ontvangers,
  bouwAfspraakBericht,
  stuurAfspraakMelding,
};
