'use strict';
/*
 * Afmelden. Een lead die "STOP" zegt, hoort niets meer te krijgen.
 *
 * ── Waarom dit bestond nog niet ──────────────────────────────────────────────
 * Er was geen enkele afmeldweg. Een lead die STOP stuurde kreeg een vriendelijk
 * AI-antwoord op zijn afmelding, en de opvolgcron stuurde de dag erna gewoon
 * weer een bericht. Dat is drie dingen tegelijk:
 *
 *   1. Vervelend. Iemand die STOP typt is klaar, en doorgaan maakt van een
 *      koele lead een boze.
 *   2. Tegen het beleid van Meta. WhatsApp verwacht dat een bedrijf een
 *      afmelding respecteert; genoeg blokkades en het nummer gaat eraan -- en
 *      dat nummer is bij Helvaro (nog) gedeeld, dus één klant die dit fout doet
 *      raakt iedereen.
 *   3. In strijd met de AVG. Een gerechtvaardigd belang houdt op zodra de
 *      betrokkene bezwaar maakt, en "STOP" IS bezwaar.
 *
 * ── Waar de rem zit ──────────────────────────────────────────────────────────
 * In api/_wa-send.js, de enige deur waar iets naar buiten gaat, plus de
 * opvolgcron die zijn eigen deur heeft. Niet in de AI-prompt: een prompt is een
 * verzoek, en dit moet een regel zijn.
 *
 * ── Wat er WEL nog doorgaat ──────────────────────────────────────────────────
 * Niets. Ook geen bevestiging van een afspraak, ook geen herinnering. Dat is een
 * bewuste keuze: wie zich afmeldt en daarna nog een herinnering krijgt, ziet
 * niet het verschil tussen "nuttig" en "ze luisteren niet". Wil de makelaar hem
 * toch bereiken, dan belt hij -- dat staat in de melding die hij krijgt.
 *
 * De ENIGE uitzondering is het antwoord op de afmelding zelf: één korte
 * bevestiging dat het genoteerd is. Zonder dat lijkt STOP niet aangekomen.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* Het veld op de lead. Mag ontbreken -- dan is er niemand afgemeld en werkt
   alles zoals vroeger. Zie de terugval in markeer(). */
const VELD = 'Opted Out';

/*
 * De woorden waarop we afmelden.
 *
 * Bewust KORT en bewust exact. Dit moet matchen op een bericht dat ALLEEN uit
 * zo'n woord bestaat, niet op een zin die het woord bevat: "stop me maar een
 * berichtje als er iets nieuws is" is geen afmelding, en "ik wil geen reclame
 * maar wel info over dit pand" ook niet. Een te ruime match kost een lead die
 * juist geïnteresseerd was, en dat is een duurdere fout dan een gemiste
 * afmelding -- die tweede kans krijg je nog, de eerste niet.
 *
 * De talen zijn die van _lang.js plus de Engelse woorden die iedereen kent,
 * omdat WhatsApp zelf STOP en UNSUBSCRIBE aanleert.
 */
const WOORDEN = Object.freeze([
  // universeel / Engels
  'stop', 'stopp', 'unsubscribe', 'unsub', 'opt out', 'optout', 'remove me',
  // Nederlands
  'afmelden', 'afmelding', 'uitschrijven', 'geen berichten meer',
  'geen interesse meer', 'stop maar', 'niet meer mailen', 'laat me met rust',
  // Frans
  'desabonner', 'se desabonner', 'arreter', 'arretez', 'plus de messages',
  // Duits
  'abmelden', 'abbestellen', 'keine nachrichten mehr',
  // Spaans
  'baja', 'darse de baja', 'no mas mensajes',
  // Italiaans
  'cancellami', 'disiscrivimi', 'basta messaggi',
]);

/* Accenten en leestekens eraf, zodat "arrêtez!" en "ARRETEZ" hetzelfde lezen.
   normalize('NFD') splitst een letter met accent in letter + accentteken; de
   regex haalt dat tweede weg. */
function normaliseer(tekst) {
  return String(tekst || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Is dit bericht een afmelding?
 *
 * Alleen als het bericht in zijn geheel zo'n woord IS, of ermee begint gevolgd
 * door niets zinnigs meer. "stop" ja; "stop met bellen" ja; "kan je stoppen met
 * dat pand aan te bieden maar wel het andere sturen" nee.
 *
 * @param {string} tekst  het ruwe bericht van de lead
 * @returns {boolean}
 */
function isAfmelding(tekst) {
  const t = normaliseer(tekst);
  if (!t) return false;
  /* Langer dan een korte zin is bijna nooit een afmelding maar een uitleg
     waarin het woord toevallig voorkomt. Vijf woorden is ruim: "stop met mij te
     berichten" past er nog in. */
  if (t.split(' ').length > 5) return false;
  return WOORDEN.some((w) => t === w || t.startsWith(w + ' '));
}

/** Staat deze lead afgemeld? Leest het veld defensief: ontbreekt het, dan nee. */
function isAfgemeld(leadFields) {
  const f = leadFields || {};
  const v = f[VELD];
  return v === true || v === 'true' || v === 1;
}

/**
 * De lead afmelden.
 *
 * Faalt zacht: bestaat het veld nog niet in Airtable, dan weigert Airtable de
 * hele PATCH. Dan gaat het luid het log in -- want dan werkt de afmelding NIET
 * en dat moet iemand weten -- maar het gooit niet, want de aanroeper zit
 * middenin een WhatsApp-beurt.
 *
 * @param {function} patchLead  de patch-functie van de aanroeper (die kent de
 *                              tabel en de tenantcontrole al)
 * @param {string} leadId
 * @returns {Promise<boolean>}  of het gelukt is
 */
async function markeer(patchLead, leadId) {
  if (typeof patchLead !== 'function' || !leadId) return false;
  try {
    await patchLead(leadId, { [VELD]: true });
    return true;
  } catch (err) {
    console.error(
      `[optout] AFMELDING NIET OPGESLAGEN voor ${leadId}: ${err && err.message}. `
      + `Maak het veld "${VELD}" (checkbox) aan op de Leads-tabel, anders blijft deze lead berichten krijgen.`
    );
    return false;
  }
}

/* De bevestiging die de lead terugkrijgt. Eén zin, geen verkoop, geen "weet je
   het zeker" -- dat laatste is precies wat iemand die STOP typt niet wil lezen.

   Zelfde nl/fr/en-eigen, Engels-terugval als de andere vaste teksten in
   api/_lang.js; die staat hier en niet daar omdat hij bij deze regel hoort en
   nergens anders gebruikt wordt. */
const BEVESTIGING = Object.freeze({
  nl: 'Genoteerd, je krijgt geen berichten meer van ons. Bedankt en nog een fijne dag.',
  fr: 'C’est noté, tu ne recevras plus de messages de notre part. Bonne journée.',
  en: 'Noted, you will not receive any more messages from us. Have a good day.',
});

function bevestiging(taal) {
  return BEVESTIGING[String(taal || '').slice(0, 2).toLowerCase()] || BEVESTIGING.en;
}

module.exports = { VELD, WOORDEN, isAfmelding, isAfgemeld, markeer, bevestiging, normaliseer };
