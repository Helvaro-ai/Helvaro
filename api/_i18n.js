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

  // ── Inlogaanbieder (Clerk) ──────────────────────────────────────────────
  // Deze stonden als één Nederlands blok in api/dashboard.js. Daardoor bleef de
  // inlogkaart Nederlands terwijl de pagina eromheen al Frans was -- een half
  // vertaald scherm, en precies het scherm waar een nieuwe klant binnenkomt.
  'clerk.social':        { nl: 'Doorgaan met {{provider|titleize}}', fr: 'Continuer avec {{provider|titleize}}',
                           en: 'Continue with {{provider|titleize}}', de: 'Weiter mit {{provider|titleize}}' },
  'clerk.or':            { nl: 'of', fr: 'ou', en: 'or', de: 'oder' },
  'clerk.email':         { nl: 'E-mailadres', fr: 'Adresse e-mail', en: 'Email address', de: 'E-Mail-Adresse' },
  'clerk.password':      { nl: 'Wachtwoord', fr: 'Mot de passe', en: 'Password', de: 'Passwort' },
  'clerk.firstName':     { nl: 'Voornaam', fr: 'Prénom', en: 'First name', de: 'Vorname' },
  'clerk.lastName':      { nl: 'Achternaam', fr: 'Nom', en: 'Last name', de: 'Nachname' },
  'clerk.ph.email':      { nl: 'naam@bedrijf.be', fr: 'nom@entreprise.be', en: 'name@company.be', de: 'name@firma.be' },
  'clerk.ph.password':   { nl: 'Je wachtwoord', fr: 'Votre mot de passe', en: 'Your password', de: 'Ihr Passwort' },
  'clerk.optional':      { nl: 'Optioneel', fr: 'Facultatif', en: 'Optional', de: 'Optional' },
  'clerk.continue':      { nl: 'Doorgaan', fr: 'Continuer', en: 'Continue', de: 'Weiter' },
  'clerk.otherMethod':   { nl: 'Andere manier proberen', fr: 'Essayer autrement', en: 'Try another method', de: 'Andere Methode' },
  'clerk.back':          { nl: 'Terug', fr: 'Retour', en: 'Back', de: 'Zurück' },
  'clerk.forgot':        { nl: 'Wachtwoord vergeten?', fr: 'Mot de passe oublié ?', en: 'Forgot password?', de: 'Passwort vergessen?' },

  'clerk.signIn.title':  { nl: 'Inloggen bij Helvaro', fr: 'Connexion à Helvaro', en: 'Log in to Helvaro', de: 'Bei Helvaro anmelden' },
  'clerk.signIn.sub':    { nl: 'Welkom terug. Log in om verder te gaan.',
                           fr: 'Bon retour. Connectez-vous pour continuer.',
                           en: 'Welcome back. Log in to continue.',
                           de: 'Willkommen zurück. Melden Sie sich an, um fortzufahren.' },
  'clerk.pw.title':      { nl: 'Vul je wachtwoord in', fr: 'Saisissez votre mot de passe', en: 'Enter your password', de: 'Geben Sie Ihr Passwort ein' },
  'clerk.pw.sub':        { nl: 'Voer het wachtwoord van je account in', fr: 'Saisissez le mot de passe de votre compte',
                           en: 'Enter your account password', de: 'Geben Sie das Passwort Ihres Kontos ein' },
  'clerk.code.title':    { nl: 'Kijk in je mailbox', fr: 'Consultez votre boîte mail', en: 'Check your email', de: 'Sehen Sie in Ihr Postfach' },
  'clerk.code.sub':      { nl: 'om verder te gaan naar Helvaro', fr: 'pour continuer vers Helvaro',
                           en: 'to continue to Helvaro', de: 'um zu Helvaro fortzufahren' },
  'clerk.code.formTitle':{ nl: 'Verificatiecode', fr: 'Code de vérification', en: 'Verification code', de: 'Bestätigungscode' },
  'clerk.code.formSub':  { nl: 'Vul de code in die we naar je e-mailadres gestuurd hebben',
                           fr: 'Saisissez le code que nous avons envoyé à votre adresse e-mail',
                           en: 'Enter the code we sent to your email address',
                           de: 'Geben Sie den Code ein, den wir an Ihre E-Mail-Adresse gesendet haben' },
  'clerk.code.resend':   { nl: 'Geen code ontvangen? Opnieuw versturen', fr: 'Pas de code reçu ? Renvoyer',
                           en: "Didn't get a code? Resend", de: 'Keinen Code erhalten? Erneut senden' },
  'clerk.alt.title':     { nl: 'Op een andere manier inloggen', fr: 'Se connecter autrement',
                           en: 'Sign in another way', de: 'Anders anmelden' },
  'clerk.alt.sub':       { nl: 'Lukt het niet? Kies hieronder een andere manier.',
                           fr: 'Cela ne fonctionne pas ? Choisissez une autre méthode ci-dessous.',
                           en: 'Not working? Choose another method below.',
                           de: 'Klappt es nicht? Wählen Sie unten eine andere Methode.' },
  'clerk.alt.help':      { nl: 'Hulp nodig?', fr: 'Besoin d’aide ?', en: 'Need help?', de: 'Hilfe nötig?' },
  'clerk.alt.byCode':    { nl: 'Code per e-mail naar {{identifier}}', fr: 'Code par e-mail vers {{identifier}}',
                           en: 'Email code to {{identifier}}', de: 'Code per E-Mail an {{identifier}}' },
  'clerk.alt.byPw':      { nl: 'Inloggen met je wachtwoord', fr: 'Se connecter avec votre mot de passe',
                           en: 'Sign in with your password', de: 'Mit Passwort anmelden' },
  'clerk.alt.byLink':    { nl: 'Inloglink per e-mail naar {{identifier}}', fr: 'Lien de connexion vers {{identifier}}',
                           en: 'Email link to {{identifier}}', de: 'Anmeldelink an {{identifier}}' },
  'clerk.signUp.title':  { nl: 'Account aanmaken', fr: 'Créer un compte', en: 'Create account', de: 'Konto erstellen' },
  'clerk.signUp.sub':    { nl: 'Vul je gegevens in om te beginnen', fr: 'Saisissez vos données pour commencer',
                           en: 'Enter your details to get started', de: 'Geben Sie Ihre Daten ein' },
  'clerk.signUp.code':   { nl: 'Bevestig je e-mailadres', fr: 'Confirmez votre adresse e-mail',
                           en: 'Confirm your email address', de: 'Bestätigen Sie Ihre E-Mail-Adresse' },
  'clerk.signUp.codeSub':{ nl: 'Vul de code in die we je gestuurd hebben', fr: 'Saisissez le code que nous vous avons envoyé',
                           en: 'Enter the code we sent you', de: 'Geben Sie den gesendeten Code ein' },

  'clerk.err.password':  { nl: 'Verkeerd wachtwoord. Probeer het opnieuw.', fr: 'Mot de passe incorrect. Réessayez.',
                           en: 'Incorrect password. Try again.', de: 'Falsches Passwort. Versuchen Sie es erneut.' },
  'clerk.err.notFound':  { nl: 'We kennen dit e-mailadres niet.', fr: 'Nous ne connaissons pas cette adresse e-mail.',
                           en: "We don't recognise this email address.", de: 'Diese E-Mail-Adresse kennen wir nicht.' },
  'clerk.err.pwShort':   { nl: 'Je wachtwoord moet minstens {{length}} tekens lang zijn.',
                           fr: 'Votre mot de passe doit comporter au moins {{length}} caractères.',
                           en: 'Your password must be at least {{length}} characters.',
                           de: 'Ihr Passwort muss mindestens {{length}} Zeichen lang sein.' },
  'clerk.err.exists':    { nl: 'Er bestaat al een account met dit e-mailadres.',
                           fr: 'Un compte existe déjà avec cette adresse e-mail.',
                           en: 'An account with this email address already exists.',
                           de: 'Mit dieser E-Mail-Adresse besteht bereits ein Konto.' },
  'clerk.err.badEmail':  { nl: 'Dit lijkt geen geldig e-mailadres.', fr: 'Cette adresse e-mail semble invalide.',
                           en: "That doesn't look like a valid email address.", de: 'Das sieht nach keiner gültigen E-Mail-Adresse aus.' },
  'clerk.err.required':  { nl: 'Dit veld is verplicht.', fr: 'Ce champ est obligatoire.',
                           en: 'This field is required.', de: 'Dieses Feld ist erforderlich.' },

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

/**
 * De vertaaltabel die Clerk verwacht, in één taal.
 *
 * Clerk wil een genest object met zijn eigen sleutelnamen. Die namen staan
 * daarom HIER, één keer, in plaats van vier keer uitgeschreven in dashboard.js.
 */
function clerkLocalisatie(code) {
  const v = (k) => t(code, k);
  return {
    socialButtonsBlockButton: v('clerk.social'),
    dividerText: v('clerk.or'),
    formFieldLabel__emailAddress: v('clerk.email'),
    formFieldLabel__password: v('clerk.password'),
    formFieldLabel__firstName: v('clerk.firstName'),
    formFieldLabel__lastName: v('clerk.lastName'),
    formFieldInputPlaceholder__emailAddress: v('clerk.ph.email'),
    formFieldInputPlaceholder__password: v('clerk.ph.password'),
    formFieldInputPlaceholder__firstName: v('clerk.firstName'),
    formFieldInputPlaceholder__lastName: v('clerk.lastName'),
    formFieldHintText__optional: v('clerk.optional'),
    formButtonPrimary: v('clerk.continue'),
    footerActionLink__useAnotherMethod: v('clerk.otherMethod'),
    backButton: v('clerk.back'),
    formFieldAction__forgotPassword: v('clerk.forgot'),
    signIn: {
      start:    { title: v('clerk.signIn.title'), subtitle: v('clerk.signIn.sub') },
      password: { title: v('clerk.pw.title'),     subtitle: v('clerk.pw.sub') },
      emailCode: {
        title: v('clerk.code.title'), subtitle: v('clerk.code.sub'),
        formTitle: v('clerk.code.formTitle'), formSubtitle: v('clerk.code.formSub'),
        resendButton: v('clerk.code.resend'),
      },
      alternativeMethods: {
        title: v('clerk.alt.title'), subtitle: v('clerk.alt.sub'), actionLink: v('clerk.alt.help'),
        blockButton__emailCode: v('clerk.alt.byCode'),
        blockButton__password:  v('clerk.alt.byPw'),
        blockButton__emailLink: v('clerk.alt.byLink'),
        getHelp: { title: v('clerk.alt.help'), content: v('clerk.alt.sub'), blockButton__emailSupport: v('clerk.alt.help') },
      },
    },
    signUp: {
      start:     { title: v('clerk.signUp.title'), subtitle: v('clerk.signUp.sub') },
      emailCode: { title: v('clerk.signUp.code'),  subtitle: v('clerk.signUp.codeSub') },
    },
    unstable__errors: {
      form_password_incorrect: v('clerk.err.password'),
      form_identifier_not_found: v('clerk.err.notFound'),
      form_password_length_too_short: v('clerk.err.pwShort'),
      form_identifier_exists: v('clerk.err.exists'),
      form_param_format_invalid__email_address: v('clerk.err.badEmail'),
      form_param_nil: v('clerk.err.required'),
    },
  };
}

module.exports = { TALEN, STANDAARD, resolveer, t, woordenboek, locale, kort, clerkLocalisatie };
