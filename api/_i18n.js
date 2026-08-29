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

  // ── Dashboard en de losse schermen ──────────────────────────────────────
  'dash.verify.title': { nl: 'Bevestig je e-mailadres', fr: 'Confirmez votre adresse e-mail', en: 'Confirm your email address', de: 'Bestätigen Sie Ihre E-Mail-Adresse' },
  'dash.verify.resend': { nl: 'Stuur opnieuw', fr: 'Renvoyer', en: 'Resend', de: 'Erneut senden' },
  'dash.verify.hide': { nl: 'Verbergen voor deze sessie', fr: 'Masquer pour cette session', en: 'Hide for this session', de: 'Für diese Sitzung ausblenden' },
  'dash.start.title': { nl: 'Aan de slag met Helvaro', fr: 'Démarrer avec Helvaro', en: 'Get started with Helvaro', de: 'Loslegen mit Helvaro' },
  'dash.hide': { nl: 'Verbergen', fr: 'Masquer', en: 'Hide', de: 'Ausblenden' },
  'dash.wa.link': { nl: 'WhatsApp-nummer koppelen', fr: 'Associer un numéro WhatsApp', en: 'Connect WhatsApp number', de: 'WhatsApp-Nummer verbinden' },
  'dash.wa.tell': { nl: 'Laat het weten', fr: 'Faites-le savoir', en: 'Let us know', de: 'Sagen Sie Bescheid' },
  'dash.form.title': { nl: 'Jouw lead-formulier', fr: 'Votre formulaire de prospects', en: 'Your lead form', de: 'Ihr Lead-Formular' },
  'dash.form.copylink': { nl: 'Kopieer link', fr: 'Copier le lien', en: 'Copy link', de: 'Link kopieren' },
  'dash.form.copy': { nl: 'Kopieer', fr: 'Copier', en: 'Copy', de: 'Kopieren' },
  'dash.form.open': { nl: 'Open', fr: 'Ouvrir', en: 'Open', de: 'Öffnen' },
  'dash.form.moreTitle': { nl: 'QR-code, embed-code, deel-opties', fr: 'QR code, code intégré, options de partage', en: 'QR code, embed code, sharing options', de: 'QR-Code, Embed-Code, Teilen' },
  'dash.form.more': { nl: 'Meer opties', fr: 'Plus d’options', en: 'More options', de: 'Mehr Optionen' },
  'dash.loading': { nl: 'Laden...', fr: 'Chargement...', en: 'Loading...', de: 'Wird geladen...' },
  'dash.chart.week': { nl: 'Leads per week (laatste 8 weken)', fr: 'Prospects par semaine (8 dernières semaines)', en: 'Leads per week (last 8 weeks)', de: 'Leads pro Woche (letzte 8 Wochen)' },
  'dash.chart.source': { nl: 'Leads per bron', fr: 'Prospects par source', en: 'Leads per source', de: 'Leads pro Quelle' },
  'dash.today': { nl: 'Vandaag', fr: 'Aujourd’hui', en: 'Today', de: 'Heute' },
  'dash.today.none': { nl: 'Geen afspraken vandaag', fr: 'Aucun rendez-vous aujourd’hui', en: 'No appointments today', de: 'Heute keine Termine' },
  'dash.goal.title': { nl: 'Pipeline Doel', fr: 'Objectif de pipeline', en: 'Pipeline goal', de: 'Pipeline-Ziel' },
  'dash.goal.sub': { nl: 'verwachte waarde van je gekwalificeerde leads', fr: 'valeur attendue de vos prospects qualifiés', en: 'expected value of your qualified leads', de: 'erwarteter Wert Ihrer qualifizierten Leads' },
  'dash.goal.edit': { nl: 'Doel aanpassen', fr: 'Modifier l’objectif', en: 'Edit goal', de: 'Ziel anpassen' },
  'dash.goal.editTitle': { nl: 'Pipelinedoel aanpassen', fr: 'Modifier l’objectif de pipeline', en: 'Edit pipeline goal', de: 'Pipeline-Ziel anpassen' },
  'dash.followup': { nl: 'Opvolging Nodig', fr: 'Suivi nécessaire', en: 'Needs follow-up', de: 'Nachfassen nötig' },
  'dash.action': { nl: 'Actie nodig', fr: 'Action requise', en: 'Action needed', de: 'Aktion nötig' },
  'dash.tasks': { nl: 'Openstaande Taken', fr: 'Tâches en cours', en: 'Open tasks', de: 'Offene Aufgaben' },
  'dash.topleads': { nl: 'Top Leads', fr: 'Meilleurs prospects', en: 'Top leads', de: 'Top-Leads' },
  'dash.search.title': { nl: 'Zoek leads op naam of telefoonnummer', fr: 'Rechercher par nom ou téléphone', en: 'Search leads by name or phone', de: 'Leads nach Name oder Telefon suchen' },
  'dash.search.ph': { nl: 'Zoek op naam of telefoonnummer...', fr: 'Rechercher par nom ou téléphone...', en: 'Search by name or phone...', de: 'Nach Name oder Telefon suchen...' },
  'dash.f.status': { nl: 'Filter op status', fr: 'Filtrer par statut', en: 'Filter by status', de: 'Nach Status filtern' },
  'dash.f.allStatus': { nl: 'Alle statussen', fr: 'Tous les statuts', en: 'All statuses', de: 'Alle Status' },
  'dash.s.new': { nl: 'Nieuw', fr: 'Nouveau', en: 'New', de: 'Neu' },
  'dash.s.busy': { nl: 'Bezig', fr: 'En cours', en: 'In progress', de: 'Läuft' },
  'dash.s.done': { nl: 'Klaar', fr: 'Terminé', en: 'Done', de: 'Fertig' },
  'dash.f.qual': { nl: 'Filter op gekwalificeerd', fr: 'Filtrer par qualification', en: 'Filter by qualified', de: 'Nach Qualifikation filtern' },
  'dash.f.allLeads': { nl: 'Alle leads', fr: 'Tous les prospects', en: 'All leads', de: 'Alle Leads' },
  'dash.qualified': { nl: 'Gekwalificeerd', fr: 'Qualifié', en: 'Qualified', de: 'Qualifiziert' },
  'dash.notQualified': { nl: 'Niet gekwalificeerd', fr: 'Non qualifié', en: 'Not qualified', de: 'Nicht qualifiziert' },
  'dash.f.source': { nl: 'Filter op bron', fr: 'Filtrer par source', en: 'Filter by source', de: 'Nach Quelle filtern' },
  'dash.f.allSources': { nl: 'Alle bronnen', fr: 'Toutes les sources', en: 'All sources', de: 'Alle Quellen' },
  'dash.f.picked': { nl: 'Filter op opgepikt', fr: 'Filtrer par suivi', en: 'Filter by picked up', de: 'Nach aufgegriffen filtern' },
  'dash.f.pickedAll': { nl: 'Opgepikt: Alle', fr: 'Suivi : tous', en: 'Picked up: all', de: 'Aufgegriffen: alle' },
  'dash.picked': { nl: 'Opgepikt', fr: 'Suivi', en: 'Picked up', de: 'Aufgegriffen' },
  'dash.notPicked': { nl: 'Niet opgepikt', fr: 'Non suivi', en: 'Not picked up', de: 'Nicht aufgegriffen' },
  'dash.filters': { nl: 'Filters', fr: 'Filtres', en: 'Filters', de: 'Filter' },
  'dash.reset': { nl: 'Reset', fr: 'Réinitialiser', en: 'Reset', de: 'Zurücksetzen' },
  'dash.col.name': { nl: 'Naam', fr: 'Nom', en: 'Name', de: 'Name' },
  'dash.col.phone': { nl: 'Telefoon', fr: 'Téléphone', en: 'Phone', de: 'Telefon' },
  'dash.col.status': { nl: 'Status', fr: 'Statut', en: 'Status', de: 'Status' },
  'dash.col.qual': { nl: 'Gekw.', fr: 'Qual.', en: 'Qual.', de: 'Qual.' },
  'dash.col.source': { nl: 'Bron', fr: 'Source', en: 'Source', de: 'Quelle' },
  'dash.col.summary': { nl: 'Samenvatting', fr: 'Résumé', en: 'Summary', de: 'Zusammenfassung' },
  'dash.col.score': { nl: 'Score', fr: 'Score', en: 'Score', de: 'Score' },
  'dash.col.date': { nl: 'Datum', fr: 'Date', en: 'Date', de: 'Datum' },
  'dash.col.actions': { nl: 'Acties', fr: 'Actions', en: 'Actions', de: 'Aktionen' },
  'dash.upgrade': { nl: 'Upgrade', fr: 'Passer à l’offre supérieure', en: 'Upgrade', de: 'Upgrade' },
  'pipe.loading': { nl: 'Pipeline laden...', fr: 'Chargement du pipeline...', en: 'Loading pipeline...', de: 'Pipeline wird geladen...' },
  'conv.select': { nl: 'Selecteer een gesprek', fr: 'Sélectionnez une conversation', en: 'Select a conversation', de: 'Wählen Sie ein Gespräch' },
  'prop.offer': { nl: 'Je aanbod', fr: 'Votre offre', en: 'Your listings', de: 'Ihr Angebot' },
  'prop.add': { nl: 'Pand toevoegen', fr: 'Ajouter un bien', en: 'Add property', de: 'Objekt hinzufügen' },
  'prop.none': { nl: 'Nog geen panden', fr: 'Aucun bien pour l’instant', en: 'No properties yet', de: 'Noch keine Objekte' },
  'cal.prev': { nl: 'Vorige week', fr: 'Semaine précédente', en: 'Previous week', de: 'Vorherige Woche' },
  'cal.next': { nl: 'Volgende week', fr: 'Semaine suivante', en: 'Next week', de: 'Nächste Woche' },
  'cal.book': { nl: 'Boek afspraak', fr: 'Planifier un rendez-vous', en: 'Book appointment', de: 'Termin buchen' },
  'cal.noResult': { nl: 'Afspraken zonder resultaat', fr: 'Rendez-vous sans résultat', en: 'Appointments without outcome', de: 'Termine ohne Ergebnis' },
  'cal.toCall': { nl: 'Te Bellen', fr: 'À appeler', en: 'To call', de: 'Anzurufen' },
  'cal.toCall.sub': { nl: 'Gekwalificeerd · nog geen afspraak', fr: 'Qualifié · pas encore de rendez-vous', en: 'Qualified · no appointment yet', de: 'Qualifiziert · noch kein Termin' },
  'act.recent': { nl: 'Recente Activiteit', fr: 'Activité récente', en: 'Recent activity', de: 'Letzte Aktivität' },
  'res.period': { nl: 'Periode', fr: 'Période', en: 'Period', de: 'Zeitraum' },
  'res.periodTitle': { nl: 'Periode voor resultaten', fr: 'Période des résultats', en: 'Period for results', de: 'Zeitraum für Ergebnisse' },
  'res.thisMonth': { nl: 'Deze maand', fr: 'Ce mois-ci', en: 'This month', de: 'Diesen Monat' },
  'res.last30': { nl: 'Afgelopen 30 dagen', fr: '30 derniers jours', en: 'Last 30 days', de: 'Letzte 30 Tage' },
  'res.allTime': { nl: 'Alle tijd', fr: 'Tout', en: 'All time', de: 'Gesamt' },
  'fa.plan': { nl: 'Je plan', fr: 'Votre formule', en: 'Your plan', de: 'Ihr Tarif' },
  'fa.planChange': { nl: 'Plan wijzigen', fr: 'Changer de formule', en: 'Change plan', de: 'Tarif wechseln' },
  'fa.credits': { nl: 'Credits deze periode', fr: 'Crédits cette période', en: 'Credits this period', de: 'Guthaben in dieser Periode' },
  'fa.buy': { nl: 'Credits bijkopen', fr: 'Acheter des crédits', en: 'Buy credits', de: 'Guthaben kaufen' },
  'fa.plans': { nl: 'Plannen', fr: 'Formules', en: 'Plans', de: 'Tarife' },
  'fa.plans.sub': { nl: 'Maandelijks opzegbaar. Je credits gaan mee naar het nieuwe plan.', fr: 'Résiliable chaque mois. Vos crédits suivent la nouvelle formule.', en: 'Cancel monthly. Your credits move to the new plan.', de: 'Monatlich kündbar. Ihr Guthaben zieht mit um.' },
  'fa.where': { nl: 'Waar je credits heen gingen', fr: 'Où sont passés vos crédits', en: 'Where your credits went', de: 'Wohin Ihr Guthaben ging' },
  'fa.thisPeriod': { nl: 'Deze periode', fr: 'Cette période', en: 'This period', de: 'Diese Periode' },
  'fa.entries': { nl: 'Boekingen', fr: 'Écritures', en: 'Entries', de: 'Buchungen' },
  'fa.entries.sub': { nl: 'Elke beweging, nieuwste eerst', fr: 'Chaque mouvement, du plus récent au plus ancien', en: 'Every movement, newest first', de: 'Jede Bewegung, neueste zuerst' },

  // ── Instellingen, profiel, exports, analyse ────────────────────────────
  'set.ai': { nl: 'AI Instellingen', fr: 'Paramètres IA', en: 'AI settings', de: 'KI-Einstellungen' },
  'set.ai.name': { nl: 'AI Naam', fr: 'Nom de l’IA', en: 'AI name', de: 'KI-Name' },
  'set.ai.name.sub': { nl: 'De naam die je AI-assistent gebruikt', fr: 'Le nom utilisé par votre assistant IA', en: 'The name your AI assistant uses', de: 'Der Name Ihres KI-Assistenten' },
  'set.booking': { nl: 'Boekingsmodus', fr: 'Mode de réservation', en: 'Booking mode', de: 'Buchungsmodus' },
  'set.booking.sub': { nl: 'Hoe afspraken worden ingepland', fr: 'Comment les rendez-vous sont planifiés', en: 'How appointments are scheduled', de: 'Wie Termine geplant werden' },
  'set.booking.wa': { nl: 'AI boekt in WhatsApp', fr: 'L’IA réserve dans WhatsApp', en: 'AI books in WhatsApp', de: 'KI bucht in WhatsApp' },
  'set.weekly': { nl: 'Wekelijks rapport e-mail', fr: 'Rapport hebdomadaire par e-mail', en: 'Weekly report email', de: 'Wöchentlicher Bericht per E-Mail' },
  'set.weekly.sub': { nl: 'Elke maandag een samenvatting van leads + conversie naar je notificatie-mail', fr: 'Chaque lundi, un résumé des prospects et de la conversion par e-mail', en: 'Every Monday a summary of leads + conversion to your notification email', de: 'Jeden Montag eine Zusammenfassung per E-Mail' },
  'set.active': { nl: 'Actief', fr: 'Actif', en: 'Active', de: 'Aktiv' },
  'set.push': { nl: 'Meldingen op dit apparaat', fr: 'Notifications sur cet appareil', en: 'Notifications on this device', de: 'Benachrichtigungen auf diesem Gerät' },
  'set.push.sub': { nl: 'Krijg een melding zodra er een lead binnenkomt, ook als Helvaro dicht staat.', fr: 'Recevez une notification dès qu’un prospect arrive, même si Helvaro est fermé.', en: 'Get a notification as soon as a lead arrives, even when Helvaro is closed.', de: 'Erhalten Sie eine Benachrichtigung, sobald ein Lead eingeht — auch wenn Helvaro geschlossen ist.' },
  'set.push.on': { nl: 'Aanzetten', fr: 'Activer', en: 'Turn on', de: 'Aktivieren' },
  'set.account': { nl: 'Account', fr: 'Compte', en: 'Account', de: 'Konto' },
  'set.plan': { nl: 'Plan', fr: 'Formule', en: 'Plan', de: 'Tarif' },
  'set.apikey': { nl: 'API Sleutel', fr: 'Clé API', en: 'API key', de: 'API-Schlüssel' },
  'set.apikey.sub': { nl: 'Gebruik dit voor directe API-toegang', fr: 'À utiliser pour un accès API direct', en: 'Use this for direct API access', de: 'Für direkten API-Zugriff' },
  'set.show': { nl: 'Toon', fr: 'Afficher', en: 'Show', de: 'Anzeigen' },
  'set.support': { nl: 'Support', fr: 'Assistance', en: 'Support', de: 'Support' },
  'set.help': { nl: 'Hulp nodig?', fr: 'Besoin d’aide ?', en: 'Need help?', de: 'Hilfe nötig?' },
  'set.help.sub': { nl: 'Ons team helpt je graag verder', fr: 'Notre équipe vous aide volontiers', en: 'Our team is happy to help', de: 'Unser Team hilft Ihnen gerne' },
  'set.mail': { nl: 'Mail sturen', fr: 'Envoyer un e-mail', en: 'Send email', de: 'E-Mail senden' },
  'set.mail.addr': { nl: 'E-mailadres support', fr: 'Adresse e-mail de l’assistance', en: 'Support email address', de: 'Support-E-Mail-Adresse' },
  'set.mail.hours': { nl: 'Bereikbaar op werkdagen', fr: 'Joignable en semaine', en: 'Available on weekdays', de: 'Erreichbar an Werktagen' },
  'set.gcal': { nl: 'Google Agenda', fr: 'Google Agenda', en: 'Google Calendar', de: 'Google Kalender' },
  'set.gcal.title': { nl: 'Koppel je Google Agenda', fr: 'Connectez votre Google Agenda', en: 'Connect your Google Calendar', de: 'Google Kalender verbinden' },
  'set.gcal.sub': { nl: 'Zo checkt de AI je beschikbaarheid en zet geboekte afspraken automatisch in je agenda.', fr: 'L’IA vérifie ainsi vos disponibilités et ajoute les rendez-vous à votre agenda.', en: 'This lets the AI check your availability and add booked appointments to your calendar.', de: 'So prüft die KI Ihre Verfügbarkeit und trägt Termine automatisch ein.' },
  'set.gcal.connect': { nl: 'Koppel Google Agenda', fr: 'Connecter Google Agenda', en: 'Connect Google Calendar', de: 'Google Kalender verbinden' },
  'set.gcal.disc': { nl: 'Ontkoppel', fr: 'Déconnecter', en: 'Disconnect', de: 'Trennen' },
  'set.danger': { nl: 'Gevaar zone', fr: 'Zone sensible', en: 'Danger zone', de: 'Gefahrenbereich' },
  'set.delete': { nl: 'Account verwijderen', fr: 'Supprimer le compte', en: 'Delete account', de: 'Konto löschen' },
  'set.delete.sub': { nl: 'Je account en je gegevens definitief laten wissen', fr: 'Effacer définitivement votre compte et vos données', en: 'Permanently erase your account and data', de: 'Konto und Daten endgültig löschen' },
  'set.logout.sub': { nl: 'Beëindig je huidige sessie', fr: 'Terminez votre session actuelle', en: 'End your current session', de: 'Aktuelle Sitzung beenden' },
  'pro.account': { nl: 'Client Account', fr: 'Compte client', en: 'Client account', de: 'Kundenkonto' },
  'pro.type': { nl: 'Type', fr: 'Type', en: 'Type', de: 'Typ' },
  'pro.booking': { nl: 'Boekingssysteem', fr: 'Système de réservation', en: 'Booking system', de: 'Buchungssystem' },
  'pro.mode': { nl: 'Modus', fr: 'Mode', en: 'Mode', de: 'Modus' },
  'pro.mode.wa': { nl: 'AI boekt direct in WhatsApp gesprek', fr: 'L’IA réserve directement dans la conversation WhatsApp', en: 'AI books directly in the WhatsApp conversation', de: 'KI bucht direkt im WhatsApp-Gespräch' },
  'pro.openCal': { nl: 'Open agenda', fr: 'Ouvrir l’agenda', en: 'Open calendar', de: 'Kalender öffnen' },
  'pro.activity': { nl: 'Activiteit', fr: 'Activité', en: 'Activity', de: 'Aktivität' },
  'pro.appts': { nl: 'Afspraken', fr: 'Rendez-vous', en: 'Appointments', de: 'Termine' },
  'pro.conv': { nl: 'Conversie', fr: 'Conversion', en: 'Conversion', de: 'Konversion' },
  'pro.recent': { nl: 'Recente Leads', fr: 'Prospects récents', en: 'Recent leads', de: 'Aktuelle Leads' },
  'pro.quick': { nl: 'Snelle Acties', fr: 'Actions rapides', en: 'Quick actions', de: 'Schnellaktionen' },
  'pro.toDash': { nl: 'Naar Dashboard', fr: 'Vers le tableau de bord', en: 'To dashboard', de: 'Zur Übersicht' },
  'pro.viewCal': { nl: 'Kalender Bekijken', fr: 'Voir l’agenda', en: 'View calendar', de: 'Kalender ansehen' },
  'pro.export': { nl: 'Data Exporteren', fr: 'Exporter les données', en: 'Export data', de: 'Daten exportieren' },
  'exp.period': { nl: 'Periode voor export', fr: 'Période d’export', en: 'Period for export', de: 'Zeitraum für Export' },
  'exp.last7': { nl: 'Afgelopen 7 dagen', fr: '7 derniers jours', en: 'Last 7 days', de: 'Letzte 7 Tage' },
  'exp.last90': { nl: 'Afgelopen 90 dagen', fr: '90 derniers jours', en: 'Last 90 days', de: 'Letzte 90 Tage' },
  'exp.status': { nl: 'Status voor export', fr: 'Statut pour l’export', en: 'Status for export', de: 'Status für Export' },
  'exp.onlyQual': { nl: 'Alleen gekwalificeerd', fr: 'Qualifiés uniquement', en: 'Qualified only', de: 'Nur qualifizierte' },
  'exp.csv.sub': { nl: 'Download gefilterde leads als CSV voor Excel, Google Sheets of je CRM.', fr: 'Téléchargez les prospects filtrés en CSV pour Excel, Google Sheets ou votre CRM.', en: 'Download filtered leads as CSV for Excel, Google Sheets or your CRM.', de: 'Gefilterte Leads als CSV für Excel, Google Sheets oder Ihr CRM.' },
  'exp.scores': { nl: 'Kwalificatiescores', fr: 'Scores de qualification', en: 'Qualification scores', de: 'Qualifizierungs-Scores' },
  'exp.summaries': { nl: 'AI samenvattingen', fr: 'Résumés IA', en: 'AI summaries', de: 'KI-Zusammenfassungen' },
  'exp.csv': { nl: 'CSV downloaden', fr: 'Télécharger le CSV', en: 'Download CSV', de: 'CSV herunterladen' },
  'exp.week': { nl: 'Weekrapport', fr: 'Rapport hebdomadaire', en: 'Weekly report', de: 'Wochenbericht' },
  'exp.week.sub': { nl: 'Gedetailleerd overzicht met statistieken en gekwalificeerde leads van de afgelopen 7 dagen.', fr: 'Aperçu détaillé avec statistiques et prospects qualifiés des 7 derniers jours.', en: 'Detailed overview with statistics and qualified leads from the last 7 days.', de: 'Detaillierte Übersicht mit Statistiken und qualifizierten Leads der letzten 7 Tage.' },
  'exp.qualList': { nl: 'Gekwalificeerde leads lijst', fr: 'Liste des prospects qualifiés', en: 'Qualified leads list', de: 'Liste qualifizierter Leads' },
  'exp.loadReport': { nl: 'Rapport laden', fr: 'Charger le rapport', en: 'Load report', de: 'Bericht laden' },
  'exp.pdf': { nl: 'Downloaden als PDF', fr: 'Télécharger en PDF', en: 'Download as PDF', de: 'Als PDF herunterladen' },
  'exp.snapshot': { nl: 'Snapshot', fr: 'Instantané', en: 'Snapshot', de: 'Momentaufnahme' },
  'exp.snapshot.sub': { nl: 'Live overzicht van je geselecteerde periode.', fr: 'Aperçu en direct de la période sélectionnée.', en: 'Live overview of your selected period.', de: 'Live-Übersicht des gewählten Zeitraums.' },
  'exp.totalLeads': { nl: 'Totaal leads', fr: 'Total des prospects', en: 'Total leads', de: 'Leads gesamt' },
  'exp.convPct': { nl: 'Conversie %', fr: 'Conversion %', en: 'Conversion %', de: 'Konversion %' },
  'exp.avgScore': { nl: 'Gem. Score', fr: 'Score moyen', en: 'Avg. score', de: 'Ø Score' },
  'an.revenue': { nl: 'Gesloten Omzet', fr: 'Chiffre d’affaires conclu', en: 'Closed revenue', de: 'Abgeschlossener Umsatz' },
  'an.apptsCame': { nl: 'afspraken die kwamen', fr: 'rendez-vous honorés', en: 'appointments that showed', de: 'Termine, die kamen' },
  'an.avgDeal': { nl: 'Gem. Deal Waarde', fr: 'Valeur moyenne des affaires', en: 'Avg. deal value', de: 'Ø Auftragswert' },
  'an.showup': { nl: 'Show-up Rate', fr: 'Taux de présence', en: 'Show-up rate', de: 'Erscheinungsquote' },
  'an.ofBooked': { nl: 'van geboekte afspraken', fr: 'des rendez-vous planifiés', en: 'of booked appointments', de: 'der gebuchten Termine' },
  'an.winrate': { nl: 'Win Rate', fr: 'Taux de réussite', en: 'Win rate', de: 'Erfolgsquote' },
  'an.lostVsTotal': { nl: 'verloren vs totaal', fr: 'perdus vs total', en: 'lost vs total', de: 'verloren vs gesamt' },
  'an.funnel': { nl: 'Conversie Funnel', fr: 'Entonnoir de conversion', en: 'Conversion funnel', de: 'Konversionstrichter' },
  'an.perSource': { nl: 'Prestaties per Bron', fr: 'Performance par source', en: 'Performance per source', de: 'Leistung pro Quelle' },
  'an.perWeekday': { nl: 'Leads per Weekdag', fr: 'Prospects par jour de semaine', en: 'Leads per weekday', de: 'Leads pro Wochentag' },
  'an.scoreDist': { nl: 'Score Verdeling', fr: 'Répartition des scores', en: 'Score distribution', de: 'Score-Verteilung' },
  'an.avgResponse': { nl: 'Gemiddelde Reactietijd', fr: 'Temps de réponse moyen', en: 'Average response time', de: 'Durchschnittliche Antwortzeit' },
  'an.seconds': { nl: 'seconden gemiddeld', fr: 'secondes en moyenne', en: 'seconds on average', de: 'Sekunden im Schnitt' },
  'an.convSummary': { nl: 'Conversie samenvatting', fr: 'Résumé de conversion', en: 'Conversion summary', de: 'Konversions-Zusammenfassung' },
  'an.perHour': { nl: 'Leads per Uur van de Dag', fr: 'Prospects par heure de la journée', en: 'Leads per hour of day', de: 'Leads pro Tagesstunde' },

  // ── AI Persoonlijkheid en AI-beeld ─────────────────────────────────────
  "ap.title": { nl: "Jouw AI Persoonlijkheid", fr: "Votre personnalité IA", en: "Your AI personality", de: "Ihre KI-Persönlichkeit" },
  "ap.sub": { nl: "Hier bepaal je hoe jouw AI communiceert met leads op WhatsApp. Wijzigingen zijn meteen actief.", fr: "Définissez ici comment votre IA communique avec les prospects sur WhatsApp. Les modifications sont immédiates.", en: "Set how your AI talks to leads on WhatsApp. Changes take effect immediately.", de: "Legen Sie fest, wie Ihre KI mit Leads auf WhatsApp spricht. Änderungen wirken sofort." },
  "ap.name": { nl: "AI naam", fr: "Nom de l’IA", en: "AI name", de: "KI-Name" },
  "ap.name.hint": { nl: "de naam die leads zien in elk bericht", fr: "le nom que les prospects voient dans chaque message", en: "the name leads see in every message", de: "der Name, den Leads in jeder Nachricht sehen" },
  "ap.welcome": { nl: "Welkomstbericht", fr: "Message de bienvenue", en: "Welcome message", de: "Willkommensnachricht" },
  "ap.welcome.h": { nl: "eerste WhatsApp dat een lead ontvangt", fr: "premier WhatsApp reçu par un prospect", en: "first WhatsApp a lead receives", de: "erste WhatsApp, die ein Lead erhält" },
  "ap.inspiration": { nl: "Inspiratie", fr: "Inspiration", en: "Inspiration", de: "Inspiration" },
  "ap.template": { nl: "klik een sjabloon om in te vullen", fr: "cliquez sur un modèle pour le remplir", en: "click a template to fill in", de: "Vorlage anklicken zum Ausfüllen" },
  "ap.placeholders": { nl: "Beschikbare placeholders:", fr: "Variables disponibles :", en: "Available placeholders:", de: "Verfügbare Platzhalter:" },
  "ap.extra": { nl: "Extra instructies voor de AI", fr: "Instructions supplémentaires pour l’IA", en: "Extra instructions for the AI", de: "Zusätzliche Anweisungen für die KI" },
  "ap.extra.h": { nl: "tone of voice + do's & don'ts", fr: "ton et règles à suivre", en: "tone of voice + do’s & don’ts", de: "Tonfall + Do’s & Don’ts" },
  "ap.extra.add": { nl: "klik om aan je instructies toe te voegen", fr: "cliquez pour ajouter à vos instructions", en: "click to add to your instructions", de: "klicken, um zu Ihren Anweisungen hinzuzufügen" },
  "ap.extra.note": { nl: "De AI volgt deze regels in elk gesprek. Werkt het beste in korte zinnen.", fr: "L’IA suit ces règles dans chaque conversation. De courtes phrases fonctionnent le mieux.", en: "The AI follows these rules in every conversation. Short sentences work best.", de: "Die KI folgt diesen Regeln in jedem Gespräch. Kurze Sätze wirken am besten." },
  "ap.learned": { nl: "Geleerde patronen", fr: "Schémas appris", en: "Learned patterns", de: "Gelernte Muster" },
  "ap.learned.h": { nl: "automatisch ge-update elke maandag o.b.v. afgelopen 7 dagen", fr: "mis à jour chaque lundi sur base des 7 derniers jours", en: "updated every Monday based on the last 7 days", de: "jeden Montag auf Basis der letzten 7 Tage aktualisiert" },
  "ap.clear": { nl: "Wissen", fr: "Effacer", en: "Clear", de: "Löschen" },
  "ap.website": { nl: "Website", fr: "Site web", en: "Website", de: "Webseite" },
  "ap.website.h": { nl: "de AI gebruikt deze als context", fr: "l’IA l’utilise comme contexte", en: "the AI uses this as context", de: "die KI nutzt dies als Kontext" },
  "ap.website.n": { nl: "De AI leest je site bij elk gesprek om over jouw diensten te kunnen praten.", fr: "L’IA lit votre site à chaque conversation pour parler de vos services.", en: "The AI reads your site in every conversation so it can talk about your services.", de: "Die KI liest Ihre Website in jedem Gespräch, um über Ihre Leistungen zu sprechen." },
  "ap.address": { nl: "Adres", fr: "Adresse", en: "Address", de: "Adresse" },
  "ap.address.h": { nl: "wordt mee gestuurd bij afspraakbevestiging", fr: "envoyée avec la confirmation de rendez-vous", en: "sent with the appointment confirmation", de: "wird mit der Terminbestätigung gesendet" },
  "ap.notifWa": { nl: "Notificatie WhatsApp-nummer", fr: "Numéro WhatsApp de notification", en: "Notification WhatsApp number", de: "Benachrichtigungs-WhatsApp-Nummer" },
  "ap.notifWa.h": { nl: "krijgt een ping bij nieuwe + gekwalificeerde leads", fr: "reçoit une alerte pour les prospects nouveaux et qualifiés", en: "gets a ping for new + qualified leads", de: "erhält eine Meldung bei neuen und qualifizierten Leads" },
  "ap.notifMail": { nl: "Notificatie e-mail", fr: "E-mail de notification", en: "Notification email", de: "Benachrichtigungs-E-Mail" },
  "ap.notifMail.h": { nl: "e-mail bij elke gekwalificeerde lead + escalatie", fr: "e-mail à chaque prospect qualifié et escalade", en: "email for every qualified lead + escalation", de: "E-Mail bei jedem qualifizierten Lead + Eskalation" },
  "ap.handover": { nl: "Wat moet er gebeuren als een lead gekwalificeerd is?", fr: "Que faire lorsqu’un prospect est qualifié ?", en: "What should happen when a lead is qualified?", de: "Was soll passieren, wenn ein Lead qualifiziert ist?" },
  "ap.handover.h": { nl: "kies hoe je de overdracht doet", fr: "choisissez le mode de transfert", en: "choose how you hand over", de: "wählen Sie die Übergabe" },
  "ap.hand.wa": { nl: "AI boekt direct in WhatsApp", fr: "L’IA réserve directement dans WhatsApp", en: "AI books directly in WhatsApp", de: "KI bucht direkt in WhatsApp" },
  "ap.hand.call": { nl: "Een collega contacteert ze", fr: "Un collègue les contacte", en: "A colleague contacts them", de: "Ein Kollege kontaktiert sie" },
  "ap.callback": { nl: "Wanneer contacteer je terug?", fr: "Quand rappelez-vous ?", en: "When do you get back to them?", de: "Wann melden Sie sich zurück?" },
  "ap.callback.h": { nl: "deze tekst wordt naar de lead gestuurd", fr: "ce texte est envoyé au prospect", en: "this text is sent to the lead", de: "dieser Text wird an den Lead gesendet" },
  "ap.examples": { nl: "Voorbeelden:", fr: "Exemples :", en: "Examples:", de: "Beispiele:" },
  "ap.lang": { nl: "Taal van je leads", fr: "Langue de vos prospects", en: "Language of your leads", de: "Sprache Ihrer Leads" },
  "ap.lang.h": { nl: "bepaalt taal van lead-form + WhatsApp gesprek", fr: "détermine la langue du formulaire et de la conversation", en: "sets the language of the lead form + WhatsApp conversation", de: "bestimmt die Sprache von Formular und Gespräch" },
  "ap.lang.match": { nl: "Antwoord in de taal van de lead", fr: "Répondre dans la langue du prospect", en: "Reply in the lead’s language", de: "In der Sprache des Leads antworten" },
  "ap.hours": { nl: "Werkuren", fr: "Heures d’ouverture", en: "Working hours", de: "Arbeitszeiten" },
  "ap.hours.h": { nl: "context voor de AI. Gesprek loopt altijd door", fr: "contexte pour l’IA. La conversation continue toujours", en: "context for the AI. Conversations always continue", de: "Kontext für die KI. Gespräche laufen immer weiter" },
  "ap.badges": { nl: "Trust badges onderaan formulier", fr: "Badges de confiance en bas du formulaire", en: "Trust badges at the bottom of the form", de: "Vertrauens-Badges unten im Formular" },
  "ap.badges.h": { nl: "max 3, gescheiden met |", fr: "max. 3, séparés par |", en: "max 3, separated by |", de: "max. 3, getrennt durch |" },
  "ap.photo": { nl: "Foto van je AI-persoon", fr: "Photo de votre personnage IA", en: "Photo of your AI persona", de: "Foto Ihrer KI-Person" },
  "ap.photo.h": { nl: "PNG / JPG / WebP. Wordt automatisch bijgeknipt", fr: "PNG / JPG / WebP. Recadrée automatiquement", en: "PNG / JPG / WebP. Cropped automatically", de: "PNG / JPG / WebP. Wird automatisch zugeschnitten" },
  "ap.photo.pick": { nl: "Foto kiezen", fr: "Choisir une photo", en: "Choose photo", de: "Foto wählen" },
  "ap.remove": { nl: "Verwijderen", fr: "Supprimer", en: "Remove", de: "Entfernen" },
  "ap.photo.adv": { nl: "Geavanceerd: externe URL plakken", fr: "Avancé : coller une URL externe", en: "Advanced: paste an external URL", de: "Erweitert: externe URL einfügen" },
  "ap.color": { nl: "Brand-kleur", fr: "Couleur de marque", en: "Brand colour", de: "Markenfarbe" },
  "ap.color.h": { nl: "accenten op je lead-formulier", fr: "accents sur votre formulaire", en: "accents on your lead form", de: "Akzente auf Ihrem Formular" },
  "ap.formText": { nl: "Tekst op de lead-form (optioneel)", fr: "Texte du formulaire (facultatif)", en: "Text on the lead form (optional)", de: "Text im Formular (optional)" },
  "ap.formText.h": { nl: "eigen welkomstboodschap", fr: "message de bienvenue personnalisé", en: "your own welcome message", de: "eigene Willkommensnachricht" },
  "ap.save": { nl: "Opslaan", fr: "Enregistrer", en: "Save", de: "Speichern" },
  "ap.saved": { nl: "Opgeslagen", fr: "Enregistré", en: "Saved", de: "Gespeichert" },
  "ap.online": { nl: "online", fr: "en ligne", en: "online", de: "online" },
  "ap.test": { nl: "Stuur jezelf een test", fr: "Envoyez-vous un test", en: "Send yourself a test", de: "Senden Sie sich einen Test" },
  "ap.test.h": { nl: "Voer je telefoonnummer in. Je krijgt het welkomstbericht via WhatsApp.", fr: "Saisissez votre numéro. Vous recevrez le message de bienvenue via WhatsApp.", en: "Enter your phone number. You’ll get the welcome message via WhatsApp.", de: "Geben Sie Ihre Nummer ein. Sie erhalten die Willkommensnachricht per WhatsApp." },
  "ap.test.btn": { nl: "Test", fr: "Tester", en: "Test", de: "Test" },
  "ap.share": { nl: "Deel deze link via je website, advertenties of socials.", fr: "Partagez ce lien via votre site, vos annonces ou vos réseaux.", en: "Share this link via your website, ads or socials.", de: "Teilen Sie diesen Link über Website, Anzeigen oder Social Media." },
  "pi.title": { nl: "AI Vastgoedbeelden", fr: "Images immobilières IA", en: "AI property images", de: "KI-Immobilienbilder" },
  "pi.photo": { nl: "Foto van het pand", fr: "Photo du bien", en: "Photo of the property", de: "Foto des Objekts" },
  "pi.photo.h": { nl: "PNG, JPG of WebP — grote foto's worden automatisch verkleind", fr: "PNG, JPG ou WebP — les grandes photos sont réduites", en: "PNG, JPG or WebP — large photos are resized automatically", de: "PNG, JPG oder WebP — große Fotos werden verkleinert" },
  "pi.pick": { nl: "Klik om een foto te kiezen", fr: "Cliquez pour choisir une photo", en: "Click to choose a photo", de: "Klicken, um ein Foto zu wählen" },
  "pi.drag": { nl: "of sleep een bestand hierheen", fr: "ou déposez un fichier ici", en: "or drag a file here", de: "oder Datei hierher ziehen" },
  "pi.removePhoto": { nl: "Foto verwijderen", fr: "Supprimer la photo", en: "Remove photo", de: "Foto entfernen" },
  "pi.style": { nl: "Stijl", fr: "Style", en: "Style", de: "Stil" },
  "pi.styles.load": { nl: "Stijlen laden...", fr: "Chargement des styles...", en: "Loading styles...", de: "Stile werden geladen..." },
  "pi.room": { nl: "Type ruimte", fr: "Type de pièce", en: "Room type", de: "Raumtyp" },
  "pi.more": { nl: "Meer opties (meubels, muren, vloer, sfeer, renovatiediepte)", fr: "Plus d’options (mobilier, murs, sol, ambiance, rénovation)", en: "More options (furniture, walls, floor, mood, renovation depth)", de: "Mehr Optionen (Möbel, Wände, Boden, Stimmung, Renovierung)" },
  "pi.furniture": { nl: "Meubels", fr: "Mobilier", en: "Furniture", de: "Möbel" },
  "pi.furniture.h": { nl: "hoeveel inrichting mag de AI tonen", fr: "quel niveau d’aménagement l’IA peut montrer", en: "how much furnishing the AI may show", de: "wie viel Einrichtung die KI zeigen darf" },
  "pi.walls": { nl: "Muurafwerking", fr: "Finition des murs", en: "Wall finish", de: "Wandfinish" },
  "pi.optional": { nl: "optioneel", fr: "facultatif", en: "optional", de: "optional" },
  "pi.wallColor": { nl: "Muurkleur", fr: "Couleur des murs", en: "Wall colour", de: "Wandfarbe" },
  "pi.floor": { nl: "Vloer", fr: "Sol", en: "Floor", de: "Boden" },
  "pi.light": { nl: "Lichtsfeer", fr: "Ambiance lumineuse", en: "Lighting mood", de: "Lichtstimmung" },
  "pi.reno": { nl: "Renovatiediepte", fr: "Niveau de rénovation", en: "Renovation depth", de: "Renovierungstiefe" },
  "pi.reno.h": { nl: "hoe ver mag de visualisatie gaan", fr: "jusqu’où la visualisation peut aller", en: "how far the visualisation may go", de: "wie weit die Visualisierung gehen darf" },
  "pi.extra": { nl: "Extra instructies", fr: "Instructions supplémentaires", en: "Extra instructions", de: "Zusätzliche Anweisungen" },
  "pi.generate": { nl: "Genereer AI-beeld", fr: "Générer l’image IA", en: "Generate AI image", de: "KI-Bild erzeugen" },
  "pi.result": { nl: "Resultaat", fr: "Résultat", en: "Result", de: "Ergebnis" },
  "pi.slider": { nl: "sleep de schuifregelaar om voor/na te vergelijken", fr: "faites glisser pour comparer avant/après", en: "drag the slider to compare before/after", de: "Regler ziehen für Vorher/Nachher" },
  "pi.before": { nl: "Voor", fr: "Avant", en: "Before", de: "Vorher" },
  "pi.dragCompare": { nl: "Sleep om voor en na te vergelijken", fr: "Glissez pour comparer avant et après", en: "Drag to compare before and after", de: "Ziehen zum Vergleichen" },
  "pi.download": { nl: "Download afbeelding", fr: "Télécharger l’image", en: "Download image", de: "Bild herunterladen" },
  "pi.downloadPdf": { nl: "Download vergelijking (PDF)", fr: "Télécharger la comparaison (PDF)", en: "Download comparison (PDF)", de: "Vergleich herunterladen (PDF)" },
  "pi.earlier": { nl: "Eerder gegenereerd", fr: "Générés précédemment", en: "Previously generated", de: "Zuvor erzeugt" },

  // ── Formulier-pagina ───────────────────────────────────────────────────
  // De stap-voor-stap installatiegidsen (WordPress, Shopify, Wix, Squarespace)
  // staan hier BEWUST niet in. Die zinnen zijn opgeknipt in losse stukjes
  // tussen <code>- en <strong>-tags ("Ga naar", "Klik", "Open"). Die los
  // vertalen geeft in het Frans en Duits kromme zinnen, want de woordvolgorde
  // is daar anders. Dat vraagt om herschrijven per instructie -- een zin per
  // stap in plaats van zes fragmenten -- en dat is geen vertaalwerk.
  "fm.week": { nl: "Aanvragen deze week", fr: "Demandes cette semaine", en: "Requests this week", de: "Anfragen diese Woche" },
  "fm.month": { nl: "Aanvragen deze maand", fr: "Demandes ce mois-ci", en: "Requests this month", de: "Anfragen diesen Monat" },
  "fm.total": { nl: "Totaal aanvragen", fr: "Total des demandes", en: "Total requests", de: "Anfragen gesamt" },
  "fm.intro": { nl: "Iedereen die dit formulier invult krijgt automatisch een WhatsApp van je AI en verschijnt in je dashboard.", fr: "Toute personne qui remplit ce formulaire reçoit automatiquement un WhatsApp de votre IA et apparaît dans votre tableau de bord.", en: "Everyone who fills in this form automatically gets a WhatsApp from your AI and appears in your dashboard.", de: "Wer dieses Formular ausfüllt, erhält automatisch eine WhatsApp von Ihrer KI und erscheint in Ihrer Übersicht." },
  "fm.openTab": { nl: "Open in nieuw tabblad", fr: "Ouvrir dans un nouvel onglet", en: "Open in new tab", de: "In neuem Tab öffnen" },
  "fm.quickShare": { nl: "Snel delen:", fr: "Partage rapide :", en: "Quick share:", de: "Schnell teilen:" },
  "fm.viaWa": { nl: "Deel via WhatsApp", fr: "Partager via WhatsApp", en: "Share via WhatsApp", de: "Über WhatsApp teilen" },
  "fm.viaMail": { nl: "Deel via e-mail", fr: "Partager par e-mail", en: "Share via email", de: "Per E-Mail teilen" },
  "fm.email": { nl: "E-mail", fr: "E-mail", en: "Email", de: "E-Mail" },
  "fm.viaSms": { nl: "Deel via SMS", fr: "Partager par SMS", en: "Share via SMS", de: "Per SMS teilen" },
  "fm.viaLi": { nl: "Deel op LinkedIn", fr: "Partager sur LinkedIn", en: "Share on LinkedIn", de: "Auf LinkedIn teilen" },
  "fm.recommended": { nl: "Aanbevolen", fr: "Recommandé", en: "Recommended", de: "Empfohlen" },
  "fm.float": { nl: "Drijvende WhatsApp-knop op je site", fr: "Bouton WhatsApp flottant sur votre site", en: "Floating WhatsApp button on your site", de: "Schwebender WhatsApp-Button auf Ihrer Website" },
  "fm.embedCode": { nl: "Insluitcode voor de widget", fr: "Code d’intégration du widget", en: "Embed code for the widget", de: "Einbettungscode für das Widget" },
  "fm.copyCode": { nl: "Kopieer code", fr: "Copier le code", en: "Copy code", de: "Code kopieren" },
  "fm.toDev": { nl: "Stuur naar developer", fr: "Envoyer au développeur", en: "Send to developer", de: "An Entwickler senden" },
  "fm.howPaste": { nl: "Hoe te plakken:", fr: "Comment coller :", en: "How to paste:", de: "So fügen Sie ein:" },
  "fm.inline": { nl: "Inbouwen als pagina-onderdeel", fr: "Intégrer dans la page", en: "Embed as a page section", de: "Als Seitenelement einbauen" },
  "fm.iframe": { nl: "Insluitcode voor een iframe", fr: "Code d’intégration iframe", en: "Embed code for an iframe", de: "Einbettungscode für ein iframe" },
  "fm.linkOnly": { nl: "Alleen de link", fr: "Le lien seul", en: "The link only", de: "Nur der Link" },
  "fm.linkOnly.s": { nl: "Voor advertenties, e-mail handtekening, socials of WhatsApp-bio. Klant opent een eigen pagina.", fr: "Pour vos annonces, signature e-mail, réseaux sociaux ou bio WhatsApp. Le client ouvre une page dédiée.", en: "For ads, email signature, socials or WhatsApp bio. The customer opens a dedicated page.", de: "Für Anzeigen, E-Mail-Signatur, Social Media oder WhatsApp-Bio. Der Kunde öffnet eine eigene Seite." },
  "fm.directLink": { nl: "Directe link naar je formulier", fr: "Lien direct vers votre formulaire", en: "Direct link to your form", de: "Direkter Link zu Ihrem Formular" },
  "fm.useIn": { nl: "Gebruik in:", fr: "À utiliser dans :", en: "Use in:", de: "Verwenden in:" },
  "fm.guide": { nl: "Installatie-handleiding per platform", fr: "Guide d’installation par plateforme", en: "Installation guide per platform", de: "Installationsanleitung pro Plattform" },
  "fm.guide.sub": { nl: "Klik op het platform dat je gebruikt voor een stap-voor-stap uitleg. Werkt op ALLE moderne websites.", fr: "Cliquez sur votre plateforme pour un guide pas à pas. Fonctionne sur TOUS les sites modernes.", en: "Click the platform you use for a step-by-step guide. Works on ALL modern websites.", de: "Klicken Sie auf Ihre Plattform für eine Schritt-für-Schritt-Anleitung. Funktioniert auf ALLEN modernen Websites." },
  "fm.tip": { nl: "Tip:", fr: "Conseil :", en: "Tip:", de: "Tipp:" },

  // ── Paginakoppen en meldingen (door JS gezet) ──────────────────────────
  "page.dashboard.sub": { nl: "Overzicht van je gekwalificeerde leads", fr: "Aperçu de vos prospects qualifiés", en: "Overview of your qualified leads", de: "Übersicht Ihrer qualifizierten Leads" },
  "page.exports.sub": { nl: "Rapporten en data-export", fr: "Rapports et export de données", en: "Reports and data export", de: "Berichte und Datenexport" },
  "page.kalender.sub": { nl: "Je afspraken en beschikbaarheid", fr: "Vos rendez-vous et disponibilités", en: "Your appointments and availability", de: "Ihre Termine und Verfügbarkeit" },
  "page.profile": { nl: "Profiel", fr: "Profil", en: "Profile", de: "Profil" },
  "page.profile.sub": { nl: "Je accountgegevens en statistieken", fr: "Vos données de compte et statistiques", en: "Your account details and statistics", de: "Ihre Kontodaten und Statistiken" },
  "page.pipeline.sub": { nl: "Kanban overzicht van je leads", fr: "Vue kanban de vos prospects", en: "Kanban overview of your leads", de: "Kanban-Übersicht Ihrer Leads" },
  "page.gesprekken.sub": { nl: "AI-conversaties met je leads", fr: "Conversations IA avec vos prospects", en: "AI conversations with your leads", de: "KI-Gespräche mit Ihren Leads" },
  "page.resultaten.sub": { nl: "Wat Helvaro deze periode heeft opgeleverd", fr: "Ce que Helvaro a rapporté cette période", en: "What Helvaro delivered this period", de: "Was Helvaro in dieser Periode gebracht hat" },
  "page.analyse.sub": { nl: "Statistieken en prestatieanalyse", fr: "Statistiques et analyse des performances", en: "Statistics and performance analysis", de: "Statistiken und Leistungsanalyse" },
  "page.instellingen.sub": { nl: "Beheer je accountinstellingen", fr: "Gérez les paramètres de votre compte", en: "Manage your account settings", de: "Verwalten Sie Ihre Kontoeinstellungen" },
  "page.activiteit.sub": { nl: "Recente gebeurtenissen en updates", fr: "Événements et mises à jour récents", en: "Recent events and updates", de: "Aktuelle Ereignisse und Updates" },
  "page.aiBeeld": { nl: "AI-beeld", fr: "Image IA", en: "AI image", de: "KI-Bild" },
  "page.aiBeeld.sub": { nl: "Genereer AI-visualisaties van je panden", fr: "Générez des visualisations IA de vos biens", en: "Generate AI visualisations of your properties", de: "KI-Visualisierungen Ihrer Objekte erzeugen" },
  "page.formulier.sub": { nl: "Je lead-formulier en aanvraagstatistieken", fr: "Votre formulaire et les statistiques de demandes", en: "Your lead form and request statistics", de: "Ihr Lead-Formular und Anfragestatistiken" },
  "page.panden.sub": { nl: "Je aanbod, en de link die je onder een advertentie zet", fr: "Votre offre, et le lien à placer sous une annonce", en: "Your listings, and the link you put under an ad", de: "Ihr Angebot und der Link für Ihre Anzeige" },
  "page.facturatie.sub": { nl: "Je plan, je credits en waar ze heen gingen", fr: "Votre formule, vos crédits et leur utilisation", en: "Your plan, your credits and where they went", de: "Ihr Tarif, Ihr Guthaben und wohin es ging" },
  "page.faro.sub": { nl: "Je assistent binnen Helvaro", fr: "Votre assistant dans Helvaro", en: "Your assistant inside Helvaro", de: "Ihr Assistent in Helvaro" },
  "toast.success": { nl: "Gelukt", fr: "Réussi", en: "Success", de: "Erfolg" },
  "toast.error": { nl: "Fout", fr: "Erreur", en: "Error", de: "Fehler" },
  "toast.info": { nl: "Info", fr: "Info", en: "Info", de: "Info" },
  "a11y.close": { nl: "Sluiten", fr: "Fermer", en: "Close", de: "Schließen" },

  "page.aiPersona.sub": { nl: "Pas de stem en werkwijze van je AI aan", fr: "Ajustez la voix et la méthode de votre IA", en: "Adjust your AI’s voice and approach", de: "Stimme und Vorgehen Ihrer KI anpassen" },

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
