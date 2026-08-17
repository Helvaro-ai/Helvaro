'use strict';
/*
 * Helvaro AI — UI strings.
 *
 * ── Why four languages and not forty ─────────────────────────────────────────
 * api/_lang.js supports 40 languages, because the WhatsApp AI has to talk to
 * whoever fills in a lead form. That is a different problem from UI chrome:
 * the assistant's REPLIES are generated per-lead, but these strings are
 * hand-written product copy, and forty machine-translated navigation labels
 * would be forty places to get a luxury brand's tone wrong.
 *
 * So: the four languages that matter for a Belgian estate agency (nl, fr, en,
 * de) are translated by hand, and anything else falls back to English. That is
 * the same pragmatism api/_lang.js itself applies — it distinguishes what must
 * be exhaustive from what must be good.
 *
 * ── The answer language is a separate mechanism ───────────────────────────────
 * Quick-action prompts here are the text SENT to the model, not what it answers
 * in. The reply language is governed by the directive api/_lang.js already
 * builds and api/_ai/prompt.js injects. That is why a Polish user clicking
 * "Find my hottest leads" gets an English prompt and a Polish answer — and why
 * this table does not need a Polish column to work correctly.
 */

const _lang = require('../../_lang');

const FALLBACK = 'en';
const TRANSLATED = ['nl', 'fr', 'en', 'de'];

const STRINGS = {
  nl: {
    'ws.crm': 'CRM',
    'ws.ai': 'AI',
    'ws.title': 'Helvaro AI',
    'ws.subtitle': 'Je AI-werkruimte',

    'sb.new': 'Nieuw gesprek',
    'sb.search': 'Zoeken',
    'sb.recent': 'Recent',
    'sb.favorites': 'Favorieten',
    'sb.projects': 'Projecten',
    'sb.tools': 'AI-tools',
    'sb.images': 'Beelden',
    'sb.videos': "Video's",
    'sb.conversations': 'Recente gesprekken',
    'sb.viewAllConvos': 'Alle gesprekken',
    'sb.settings': 'Instellingen',
    'sb.poweredBy': 'Werkt op je eigen bedrijfsdata',

    'land.title': 'Waar werken we aan?',
    'land.sub': 'Vraag Helvaro alles over je leads, panden, gesprekken of marketing.',

    'in.placeholder': 'Vraag Helvaro alles…',
    'in.attach': 'Bijlage',
    'in.property': 'Pand',
    'in.command': 'Commando',
    'in.send': 'Versturen',

    'ctx.label': 'Helvaro-context',
    'ctx.manage': 'Beheren',
    'ctx.leads': 'Leads',
    'ctx.properties': 'Panden',
    'ctx.conversations': 'Gesprekken',
    'ctx.calendar': 'Agenda',
    'ctx.analytics': 'Analytics',
    'ctx.campaigns': 'Campagnes',
    'ctx.assets': 'Marketing',
    'ctx.explain': 'Helvaro AI kan deze gegevens gebruiken om je vragen te beantwoorden.',

    'qa.title': 'Snelle acties',
    'qa.viewAll': 'Alle acties',
    'qa.analyze': 'Analyseren',
    'qa.create': 'Maken',
    'qa.act': 'Doen',

    'act.title': 'Recente AI-activiteit',
    'act.viewAll': 'Alles bekijken',
    'act.empty': 'Nog niets gemaakt. Genereer je eerste pandbeeld of pandtekst.',

    'st.thinking': 'Denkt na…',
    'st.searching': 'Zoekt in je CRM…',
    'st.working': 'Verwerkt…',
    'st.error': 'Er ging iets mis. Probeer het opnieuw.',
    'st.retry': 'Opnieuw',
    'st.cancel': 'Annuleren',
    'st.confirm': 'Bevestigen',
    'st.done': 'Uitgevoerd.',
    'st.busy': 'Bezig…',
    'st.failed': 'Generatie mislukt.',

    'pn.images': 'Beelden',
    'pn.videos': "Video's",
    'pn.projects': 'Projecten',
    'pn.soon': 'Binnenkort beschikbaar.',
    'im.property': 'Pand',
    'im.propertyNone': 'Kies een pand of upload een foto',
    'im.drop': 'Sleep pandfoto’s hierheen of klik om te kiezen',
    'im.describe': 'Beschrijving',
    'im.placeholder': 'Maak deze woonkamer modern en luxueus, met behoud van de echte architectuur.',
    'im.style': 'Stijl',
    'im.aspect': 'Verhouding',
    'im.generate': 'Genereren',
    'im.needPrompt': 'Beschrijf eerst wat je wilt zien.',
    'st.luxury':'Luxe',
     'st.modern':'Modern',
     'st.contemporary':'Contemporain',
     'st.scandinavian':'Scandinavisch',
     'st.minimal':'Minimalistisch',
     'st.classic':'Klassiek',
     'st.warm':'Warm',
     'st.architectural':'Architecturaal',
  },

  en: {
    'ws.crm': 'CRM',
    'ws.ai': 'AI',
    'ws.title': 'Helvaro AI',
    'ws.subtitle': 'Your AI workspace',

    'sb.new': 'New conversation',
    'sb.search': 'Search',
    'sb.recent': 'Recent',
    'sb.favorites': 'Favorites',
    'sb.projects': 'Projects',
    'sb.tools': 'AI tools',
    'sb.images': 'Images',
    'sb.videos': 'Videos',
    'sb.conversations': 'Recent conversations',
    'sb.viewAllConvos': 'View all conversations',
    'sb.settings': 'Settings',
    'sb.poweredBy': 'Powered by your business data',

    'land.title': 'What are we working on?',
    'land.sub': 'Ask Helvaro anything about your leads, properties, conversations or marketing.',

    'in.placeholder': 'Ask Helvaro anything…',
    'in.attach': 'Attach',
    'in.property': 'Property',
    'in.command': 'Command',
    'in.send': 'Send',

    'ctx.label': 'Helvaro context',
    'ctx.manage': 'Manage',
    'ctx.leads': 'Leads',
    'ctx.properties': 'Properties',
    'ctx.conversations': 'Conversations',
    'ctx.calendar': 'Calendar',
    'ctx.analytics': 'Analytics',
    'ctx.campaigns': 'Campaigns',
    'ctx.assets': 'Marketing',
    'ctx.explain': 'Helvaro AI can use this data to answer your questions.',

    'qa.title': 'Quick actions',
    'qa.viewAll': 'View all actions',
    'qa.analyze': 'Analyze',
    'qa.create': 'Create',
    'qa.act': 'Act',

    'act.title': 'Recent AI activity',
    'act.viewAll': 'View all',
    'act.empty': 'Nothing created yet. Generate your first property image or listing.',

    'st.thinking': 'Thinking…',
    'st.searching': 'Searching your CRM…',
    'st.working': 'Working…',
    'st.error': 'Something went wrong. Please try again.',
    'st.retry': 'Retry',
    'st.cancel': 'Cancel',
    'st.confirm': 'Confirm',
    'st.done': 'Done.',
    'st.busy': 'Working…',
    'st.failed': 'Generation failed.',

    'pn.images': 'Images',
    'pn.videos': 'Videos',
    'pn.projects': 'Projects',
    'pn.soon': 'Coming soon.',
    'im.property': 'Property',
    'im.propertyNone': 'Pick a property or upload a photo',
    'im.drop': 'Drag property photos here, or click to choose',
    'im.describe': 'Description',
    'im.placeholder': 'Make this living room modern and luxurious while keeping the architecture realistic.',
    'im.style': 'Style',
    'im.aspect': 'Aspect ratio',
    'im.generate': 'Generate',
    'im.needPrompt': 'Describe what you want to see first.',
    'st.luxury':'Luxury',
     'st.modern':'Modern',
     'st.contemporary':'Contemporary',
     'st.scandinavian':'Scandinavian',
     'st.minimal':'Minimal',
     'st.classic':'Classic',
     'st.warm':'Warm',
     'st.architectural':'Architectural',
  },

  fr: {
    'ws.crm': 'CRM',
    'ws.ai': 'IA',
    'ws.title': 'Helvaro AI',
    'ws.subtitle': 'Votre espace IA',

    'sb.new': 'Nouvelle conversation',
    'sb.search': 'Rechercher',
    'sb.recent': 'Récent',
    'sb.favorites': 'Favoris',
    'sb.projects': 'Projets',
    'sb.tools': 'Outils IA',
    'sb.images': 'Images',
    'sb.videos': 'Vidéos',
    'sb.conversations': 'Conversations récentes',
    'sb.viewAllConvos': 'Toutes les conversations',
    'sb.settings': 'Paramètres',
    'sb.poweredBy': 'Alimenté par vos données',

    'land.title': 'Sur quoi travaillons-nous ?',
    'land.sub': 'Demandez tout à Helvaro sur vos leads, biens, conversations ou marketing.',

    'in.placeholder': 'Demandez tout à Helvaro…',
    'in.attach': 'Pièce jointe',
    'in.property': 'Bien',
    'in.command': 'Commande',
    'in.send': 'Envoyer',

    'ctx.label': 'Contexte Helvaro',
    'ctx.manage': 'Gérer',
    'ctx.leads': 'Leads',
    'ctx.properties': 'Biens',
    'ctx.conversations': 'Conversations',
    'ctx.calendar': 'Agenda',
    'ctx.analytics': 'Analytique',
    'ctx.campaigns': 'Campagnes',
    'ctx.assets': 'Marketing',
    'ctx.explain': 'Helvaro AI peut utiliser ces données pour répondre à vos questions.',

    'qa.title': 'Actions rapides',
    'qa.viewAll': 'Toutes les actions',
    'qa.analyze': 'Analyser',
    'qa.create': 'Créer',
    'qa.act': 'Agir',

    'act.title': 'Activité IA récente',
    'act.viewAll': 'Tout voir',
    'act.empty': "Rien de créé pour l'instant. Générez votre première image de bien.",

    'st.thinking': 'Réflexion…',
    'st.searching': 'Recherche dans votre CRM…',
    'st.working': 'Traitement…',
    'st.error': "Une erreur s'est produite. Veuillez réessayer.",
    'st.retry': 'Réessayer',
    'st.cancel': 'Annuler',
    'st.confirm': 'Confirmer',
    'st.done': 'Terminé.',
    'st.busy': 'En cours…',
    'st.failed': 'Génération échouée.',

    'pn.images': 'Images',
    'pn.videos': 'Vidéos',
    'pn.projects': 'Projets',
    'pn.soon': 'Bientôt disponible.',
    'im.property': 'Bien',
    'im.propertyNone': 'Choisissez un bien ou importez une photo',
    'im.drop': 'Glissez des photos ici, ou cliquez pour choisir',
    'im.describe': 'Description',
    'im.placeholder': 'Rendez ce salon moderne et luxueux en gardant une architecture réaliste.',
    'im.style': 'Style',
    'im.aspect': 'Format',
    'im.generate': 'Générer',
    'im.needPrompt': 'Décrivez d’abord ce que vous voulez voir.',
    'st.luxury':'Luxe',
     'st.modern':'Moderne',
     'st.contemporary':'Contemporain',
     'st.scandinavian':'Scandinave',
     'st.minimal':'Minimaliste',
     'st.classic':'Classique',
     'st.warm':'Chaleureux',
     'st.architectural':'Architectural',
  },

  de: {
    'ws.crm': 'CRM',
    'ws.ai': 'KI',
    'ws.title': 'Helvaro AI',
    'ws.subtitle': 'Ihr KI-Arbeitsbereich',

    'sb.new': 'Neue Unterhaltung',
    'sb.search': 'Suchen',
    'sb.recent': 'Kürzlich',
    'sb.favorites': 'Favoriten',
    'sb.projects': 'Projekte',
    'sb.tools': 'KI-Werkzeuge',
    'sb.images': 'Bilder',
    'sb.videos': 'Videos',
    'sb.conversations': 'Letzte Unterhaltungen',
    'sb.viewAllConvos': 'Alle Unterhaltungen',
    'sb.settings': 'Einstellungen',
    'sb.poweredBy': 'Basiert auf Ihren Unternehmensdaten',

    'land.title': 'Woran arbeiten wir?',
    'land.sub': 'Fragen Sie Helvaro alles zu Ihren Leads, Objekten, Gesprächen oder Marketing.',

    'in.placeholder': 'Fragen Sie Helvaro alles…',
    'in.attach': 'Anhang',
    'in.property': 'Objekt',
    'in.command': 'Befehl',
    'in.send': 'Senden',

    'ctx.label': 'Helvaro-Kontext',
    'ctx.manage': 'Verwalten',
    'ctx.leads': 'Leads',
    'ctx.properties': 'Objekte',
    'ctx.conversations': 'Gespräche',
    'ctx.calendar': 'Kalender',
    'ctx.analytics': 'Analytik',
    'ctx.campaigns': 'Kampagnen',
    'ctx.assets': 'Marketing',
    'ctx.explain': 'Helvaro AI kann diese Daten zur Beantwortung Ihrer Fragen nutzen.',

    'qa.title': 'Schnellaktionen',
    'qa.viewAll': 'Alle Aktionen',
    'qa.analyze': 'Analysieren',
    'qa.create': 'Erstellen',
    'qa.act': 'Handeln',

    'act.title': 'Letzte KI-Aktivität',
    'act.viewAll': 'Alle ansehen',
    'act.empty': 'Noch nichts erstellt. Erzeugen Sie Ihr erstes Objektbild.',

    'st.thinking': 'Denkt nach…',
    'st.searching': 'Sucht in Ihrem CRM…',
    'st.working': 'Verarbeitet…',
    'st.error': 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    'st.retry': 'Erneut',
    'st.cancel': 'Abbrechen',
    'st.confirm': 'Bestätigen',
    'st.done': 'Erledigt.',
    'st.busy': 'Läuft…',
    'st.failed': 'Erzeugung fehlgeschlagen.',

    'pn.images': 'Bilder',
    'pn.videos': 'Videos',
    'pn.projects': 'Projekte',
    'pn.soon': 'Demnächst verfügbar.',
    'im.property': 'Objekt',
    'im.propertyNone': 'Objekt wählen oder Foto hochladen',
    'im.drop': 'Objektfotos hierher ziehen oder klicken',
    'im.describe': 'Beschreibung',
    'im.placeholder': 'Machen Sie dieses Wohnzimmer modern und luxuriös, mit realistischer Architektur.',
    'im.style': 'Stil',
    'im.aspect': 'Format',
    'im.generate': 'Erzeugen',
    'im.needPrompt': 'Beschreiben Sie zuerst, was Sie sehen möchten.',
    'st.luxury':'Luxus',
     'st.modern':'Modern',
     'st.contemporary':'Zeitgenössisch',
     'st.scandinavian':'Skandinavisch',
     'st.minimal':'Minimalistisch',
     'st.classic':'Klassisch',
     'st.warm':'Warm',
     'st.architectural':'Architektonisch',
  },
};

/** Resolve an arbitrary supported language code to a table we actually have. */
function resolve(code) {
  const norm = _lang.normalizeLanguageCode ? _lang.normalizeLanguageCode(code) : code;
  return TRANSLATED.indexOf(norm) > -1 ? norm : FALLBACK;
}

/** A bound translator: t('sb.new'). Missing keys return the key, never blank. */
function translator(code) {
  const table = STRINGS[resolve(code)] || STRINGS[FALLBACK];
  return function t(key) {
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
  };
}

/** The whole table for one language — injected into the client script. */
function table(code) {
  return STRINGS[resolve(code)] || STRINGS[FALLBACK];
}

module.exports = { translator, table, resolve, TRANSLATED, FALLBACK };
