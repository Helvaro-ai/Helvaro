'use strict';
/*
 * De taal van het DASHBOARD.
 * (Module met underscore = geen route, zelfde afspraak als api/_lang.js.)
 *
 * ── Waarom dit los staat van api/_lang.js ───────────────────────────────────
 * _lang.js gaat over de taal waarin de AI met een LEAD praat: 40 talen, met
 * tonregels, aanspreekvormen en WhatsApp-sjablonen. Dat is een ander probleem
 * dan de taal van de knoppen die de makelaar zelf ziet. Een kantoor in Luik
 * kan prima Franstalige leads bedienen terwijl de eigenaar zijn dashboard in
 * het Nederlands wil -- of andersom.
 *
 * Daarom: één registry voor de gesprekstaal (_lang.js, blijft zoals hij is),
 * en dit bestand voor de schermtaal. De code-normalisatie lenen we wel, zodat
 * "fr-BE" en "FR" overal hetzelfde betekenen.
 *
 * ── Vier talen, niet veertig ────────────────────────────────────────────────
 * De AI praat 40 talen omdat een lead in elke taal kan binnenkomen. Een
 * SCHERM vertalen is iets anders: elke taal is ~1.800 zinnen die ook
 * onderhouden moeten worden. nl en fr omdat België tweetalig is, en omdat een
 * Waals kantoor anders geen optie heeft. en voor alles daarbuiten. de omdat
 * Faro die al heeft en Duitsland het dichtstbijzijnde volgende land is.
 *
 * Een taal erbij is hier verder alleen dáta: een sleutel toevoegen aan TEKST
 * hieronder. Geen code.
 */

const _lang = require('./_lang');

const TALEN = ['nl', 'fr', 'en', 'de'];
const STANDAARD = 'nl';

/**
 * Welke schermtaal hoort bij dit verzoek?
 *
 * Volgorde, van sterkst naar zwakst — de eerste die iets zegt wint:
 *   1. ?lang=fr        expliciet gevraagd, wint altijd (ook om te testen)
 *   2. hv_lang-cookie  wat de gebruiker eerder koos
 *   3. Accept-Language wat zijn browser zegt
 *   4. DASHBOARD_LANG  wat de eigenaar instelt voor iedereen
 *   5. nl              de standaard
 *
 * Bewust NIET: de Language-kolom van de klant in Airtable. Die staat voor de
 * taal waarin de AI met LEADS praat. Een Brussels kantoor met Franstalige
 * leads en een Nederlandstalige zaakvoerder zou daardoor een Frans dashboard
 * krijgen dat niemand gevraagd heeft.
 */
function resolveer(req) {
  const uit = (c) => (TALEN.indexOf(String(c || '').toLowerCase()) > -1 ? String(c).toLowerCase() : '');

  // 1. ?lang=
  try {
    const q = new URL(req.url, 'https://x').searchParams.get('lang');
    const g = uit(kort(q));
    if (g) return g;
  } catch (e) { /* kapotte URL: gewoon door naar de volgende bron */ }

  // 2. cookie
  const cookie = String((req.headers && req.headers.cookie) || '');
  const m = cookie.match(/(?:^|;\s*)hv_lang=([^;]+)/);
  if (m) { const g = uit(kort(decodeURIComponent(m[1]))); if (g) return g; }

  // 3. Accept-Language. "fr-BE,fr;q=0.9,nl;q=0.8" -> de eerste die we kennen.
  const al = String((req.headers && req.headers['accept-language']) || '');
  for (const stuk of al.split(',')) {
    const g = uit(kort(stuk.split(';')[0]));
    if (g) return g;
  }

  // 4. instelling van de eigenaar, 5. standaard
  return uit(kort(process.env.DASHBOARD_LANG)) || STANDAARD;
}

/* "fr-BE" -> "fr". _lang.normalizeLanguageCode doet dit NIET: die geeft bij
   een onbekende waarde de standaardtaal terug, dus "fr-BE" werd stilletjes
   "nl". Precies de reden dat Accept-Language hierboven anders nooit had
   gewerkt -- browsers sturen bijna altijd een regiocode mee. */
function kort(code) {
  return String(code || '').trim().toLowerCase().split(/[-_]/)[0];
}

/* De vertalingen. Ontbreekt een sleutel in een taal, dan valt hij terug op
   Nederlands -- een Nederlandse knop is vervelend, een lege knop is stuk. */
const TEKST = {
  // ── Inloggen / registreren ──────────────────────────────────────────────
  'login.tab.in':        { nl: 'Inloggen',         fr: 'Se connecter',      en: 'Log in',          de: 'Anmelden' },
  'login.tab.up':        { nl: 'Account aanmaken', fr: 'Créer un compte',   en: 'Create account',  de: 'Konto erstellen' },
  'login.welcome':       { nl: 'Welkom terug!',    fr: 'Bon retour !',      en: 'Welcome back!',   de: 'Willkommen zurück!' },
  'login.welcome.sub':   { nl: 'Log in om te zien wat er sinds gisteren gebeurd is.',
                           fr: "Connectez-vous pour voir ce qui s'est passé depuis hier.",
                           en: 'Log in to see what happened since yesterday.',
                           de: 'Melden Sie sich an und sehen Sie, was seit gestern passiert ist.' },
  'login.start':         { nl: 'Begin vandaag',    fr: 'Commencez aujourd’hui', en: 'Start today', de: 'Heute starten' },
  'login.start.sub':     { nl: 'Veertien dagen gratis. Je eerste lead kan vanavond binnenkomen.',
                           fr: 'Quatorze jours gratuits. Votre premier prospect peut arriver ce soir.',
                           en: 'Fourteen days free. Your first lead could arrive tonight.',
                           de: 'Vierzehn Tage gratis. Ihr erster Lead kann heute Abend eintreffen.' },
  'login.pitch':         { nl: 'Helvaro beantwoordt je vastgoedleads op WhatsApp, vraagt budget en timing uit, en boekt de bezichtiging meteen in je agenda.',
                           fr: 'Helvaro répond à vos prospects immobiliers sur WhatsApp, cerne le budget et le calendrier, et planifie la visite directement dans votre agenda.',
                           en: 'Helvaro answers your property leads on WhatsApp, qualifies budget and timing, and books the viewing straight into your calendar.',
                           de: 'Helvaro beantwortet Ihre Immobilien-Leads auf WhatsApp, klärt Budget und Zeitpunkt und bucht die Besichtigung direkt in Ihren Kalender.' },
  'login.footer':        { nl: 'gemaakt voor Vlaamse makelaars',
                           fr: 'conçu pour les agents immobiliers',
                           en: 'built for estate agents',
                           de: 'für Immobilienmakler gemacht' },

  // ── Navigatie ───────────────────────────────────────────────────────────
  'nav.group.work':      { nl: 'WERK',      fr: 'TRAVAIL',   en: 'WORK',      de: 'ARBEIT' },
  'nav.group.insight':   { nl: 'INZICHT',   fr: 'ANALYSE',   en: 'INSIGHT',   de: 'EINBLICK' },
  'nav.group.settings':  { nl: 'INSTELLEN', fr: 'RÉGLAGES',  en: 'SET UP',    de: 'EINSTELLEN' },
  'nav.dashboard':       { nl: 'Dashboard', fr: 'Tableau de bord', en: 'Dashboard', de: 'Übersicht' },
  'nav.pipeline':        { nl: 'Pipeline',  fr: 'Pipeline',  en: 'Pipeline',  de: 'Pipeline' },
  'nav.conversations':   { nl: 'Gesprekken', fr: 'Conversations', en: 'Conversations', de: 'Gespräche' },
  'nav.properties':      { nl: 'Panden',    fr: 'Biens',     en: 'Properties', de: 'Objekte' },
  'nav.calendar':        { nl: 'Kalender',  fr: 'Agenda',    en: 'Calendar',  de: 'Kalender' },
  'nav.results':         { nl: 'Resultaten', fr: 'Résultats', en: 'Results',  de: 'Ergebnisse' },
  'nav.analysis':        { nl: 'Analyse',   fr: 'Analyse',   en: 'Analytics', de: 'Analyse' },
  'nav.activity':        { nl: 'Activiteit', fr: 'Activité', en: 'Activity',  de: 'Aktivität' },
  'nav.exports':         { nl: 'Exports',   fr: 'Exports',   en: 'Exports',   de: 'Exporte' },
  'nav.form':            { nl: 'Formulier', fr: 'Formulaire', en: 'Form',     de: 'Formular' },
  'nav.persona':         { nl: 'AI Persoonlijkheid', fr: 'Personnalité IA', en: 'AI Personality', de: 'KI-Persönlichkeit' },
  'nav.billing':         { nl: 'Facturatie', fr: 'Facturation', en: 'Billing', de: 'Abrechnung' },
  'nav.settings':        { nl: 'Instellingen', fr: 'Paramètres', en: 'Settings', de: 'Einstellungen' },
  'nav.collapse':        { nl: 'Inklappen', fr: 'Réduire',   en: 'Collapse',  de: 'Einklappen' },
  'nav.logout':          { nl: 'Uitloggen', fr: 'Déconnexion', en: 'Log out', de: 'Abmelden' },
  'nav.profile':         { nl: 'Mijn profiel', fr: 'Mon profil', en: 'My profile', de: 'Mein Profil' },

  // ── Meldingen (ook door de server gebruikt, zie api/_push.js) ───────────
  'push.lead.title':     { nl: 'Nieuwe lead', fr: 'Nouveau prospect', en: 'New lead', de: 'Neuer Lead' },
  'push.credit80.title': { nl: 'Nog 20% AI-credits over',
                           fr: 'Il reste 20 % de crédits IA',
                           en: '20% of AI credits left',
                           de: 'Noch 20 % KI-Guthaben' },
  'push.credit80.body':  { nl: '{used} van {total} gebruikt. Leadgesprekken lopen gewoon door.',
                           fr: '{used} sur {total} utilisés. Les conversations continuent normalement.',
                           en: '{used} of {total} used. Lead conversations continue as normal.',
                           de: '{used} von {total} verbraucht. Lead-Gespräche laufen normal weiter.' },
  'push.credit100.title':{ nl: 'Kredietlimiet bereikt', fr: 'Limite de crédits atteinte',
                           en: 'Credit limit reached',  de: 'Guthabenlimit erreicht' },
  'push.credit100.body': { nl: 'Je leadgesprekken lopen gewoon door. Alleen de extra AI pauzeert.',
                           fr: 'Vos conversations continuent. Seule l’IA optionnelle est en pause.',
                           en: 'Your lead conversations continue. Only the optional AI pauses.',
                           de: 'Ihre Lead-Gespräche laufen weiter. Nur die optionale KI pausiert.' },

  // ── Taalkiezer ──────────────────────────────────────────────────────────
  'lang.label':          { nl: 'Taal',      fr: 'Langue',    en: 'Language',  de: 'Sprache' },
  'lang.sub':            { nl: 'De taal van dit dashboard. Verandert niets aan de taal waarin je AI met leads praat.',
                           fr: 'La langue de ce tableau de bord. Ne change rien à la langue utilisée par votre IA avec les prospects.',
                           en: 'The language of this dashboard. Does not change the language your AI uses with leads.',
                           de: 'Die Sprache dieses Dashboards. Ändert nicht die Sprache, in der Ihre KI mit Leads spricht.' },
};

/**
 * Vertaal één sleutel.
 * @param {string} code   taalcode (nl/fr/en/de)
 * @param {string} sleutel
 * @param {object} [vars] {used: 12} vervangt {used} in de tekst
 */
function t(code, sleutel, vars) {
  const taal = TALEN.indexOf(code) > -1 ? code : STANDAARD;
  const rij = TEKST[sleutel];
  /* Een ontbrekende sleutel is een programmeerfout, geen gebruikersprobleem.
     Luid in de log, en op het scherm de sleutel zelf -- dan zie je meteen
     WELKE het is, in plaats van een leeg vlak. */
  if (!rij) {
    console.warn('[i18n] onbekende sleutel:', sleutel);
    return sleutel;
  }
  let s = rij[taal] || rij[STANDAARD] || sleutel;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

/** Alle vertalingen voor één taal, om in de pagina te zetten voor de client. */
function woordenboek(code) {
  const taal = TALEN.indexOf(code) > -1 ? code : STANDAARD;
  const uit = {};
  for (const k of Object.keys(TEKST)) uit[k] = TEKST[k][taal] || TEKST[k][STANDAARD];
  return uit;
}

function locale(code) {
  try { return _lang.getLocale(code) || (code + '-BE'); } catch (e) { return 'nl-BE'; }
}

module.exports = { TALEN, STANDAARD, resolveer, t, woordenboek, locale, kort };
