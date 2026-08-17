'use strict';
/*
 * Helvaro AI — quick action definitions (requirement 5).
 *
 * ── Why these are data and not nine onclick handlers ─────────────────────────
 * Requirement 5: "clicking an action should start the appropriate AI workflow
 * immediately." The cheapest correct way is for each action to BE a prompt —
 * clicking one is identical to the user typing that sentence, so there is
 * exactly one code path into a conversation and no parallel "workflow launcher"
 * that can drift from the chat box.
 *
 * Two actions open a sub-workspace instead, because the work needs controls
 * (a property, a style, an aspect ratio) that a sentence cannot carry. Those
 * carry `panel` instead of `prompt`.
 *
 * ── Prompt language ──────────────────────────────────────────────────────────
 * `prompt` is what gets SENT to the model, not what the model answers in. The
 * reply language comes from the directive api/_lang.js builds and
 * api/_ai/prompt.js injects. Prompts are therefore kept in one language
 * (English) rather than translated forty ways — a Polish user clicking
 * "hottest leads" sends English and receives Polish. See ./i18n.js.
 *
 * Labels ARE translated, because the user reads those. `labelKey` resolves
 * against the i18n table at render time.
 *
 * ── Groups ───────────────────────────────────────────────────────────────────
 * Analyze / Create / Act is requirement 17's journey (Ask → Understand →
 * Analyze → Create → Act) collapsed to what fits a landing screen.
 *
 * ── `hue` ────────────────────────────────────────────────────────────────────
 * Each action carries its own icon hue, resolving to the --ic-* tokens in
 * ./tokens.js. Colour was requested; making it PER-ACTION rather than one
 * global accent is what makes it useful rather than decorative — the agent
 * learns "amber is my hot leads" and stops reading the label. The hues are
 * grouped into families so the three columns still read as three columns:
 * warm/analytic for Analyze, earthy for Create, go-signal for Act.
 */

const GROUPS = Object.freeze([
  Object.freeze({
    key: 'analyze',
    labelKey: 'qa.analyze',
    actions: Object.freeze([
      Object.freeze({
        id: 'hot-leads', icon: 'flame', hue: 'amber',
        labelKey: 'qa.hotLeads',
        prompt: 'Which of my leads are worth contacting right now? Rank them and show them as lead cards.',
      }),
      Object.freeze({
        id: 'pipeline', icon: 'chart', hue: 'slate',
        labelKey: 'qa.pipeline',
        prompt: 'Analyse my pipeline. Where is the value concentrated and where is it stalling?',
      }),
      Object.freeze({
        id: 'today-convos', icon: 'message', hue: 'teal',
        labelKey: 'qa.summarize',
        prompt: "Summarise today's conversations. What needs follow-up?",
      }),
    ]),
  }),
  Object.freeze({
    key: 'create',
    labelKey: 'qa.create',
    actions: Object.freeze([
      Object.freeze({ id: 'gen-image', icon: 'image', hue: 'terracotta', labelKey: 'qa.genImage', panel: 'images' }),
      Object.freeze({ id: 'gen-video', icon: 'video', hue: 'rose', labelKey: 'qa.genVideo', panel: 'videos' }),
      Object.freeze({
        id: 'write-listing', icon: 'doc', hue: 'gold',
        labelKey: 'qa.writeListing',
        prompt: 'Write a listing description for one of my properties. Ask me which property first.',
      }),
    ]),
  }),
  Object.freeze({
    key: 'act',
    labelKey: 'qa.act',
    actions: Object.freeze([
      Object.freeze({
        id: 'followup', icon: 'send', hue: 'green',
        labelKey: 'qa.followUp',
        prompt: 'Which leads deserve follow-up today? Propose a follow-up message for each one.',
      }),
      Object.freeze({
        id: 'campaign', icon: 'megaphone', hue: 'orange',
        labelKey: 'qa.campaign',
        prompt: 'I want to create a campaign for a property. Ask me which property, then propose a campaign.',
      }),
      Object.freeze({
        id: 'calls', icon: 'phone', hue: 'sky',
        labelKey: 'qa.calls',
        prompt: "Prepare today's calls: who do I call, why, and what is the context for each?",
      }),
    ]),
  }),
]);

/* Action labels live here rather than in i18n.js's main block so a new action
   ships as ONE edit — definition and its four translations together. Merged
   into the table by ./i18n.js consumers via LABELS. */
const LABELS = Object.freeze({
  nl: {
    'qa.hotLeads': 'Vind mijn beste leads',
    'qa.pipeline': 'Analyseer mijn pipeline',
    'qa.summarize': 'Vat gesprekken van vandaag samen',
    'qa.genImage': 'Genereer pandbeeld',
    'qa.genVideo': 'Genereer pandvideo',
    'qa.writeListing': 'Schrijf een pandtekst',
    'qa.followUp': 'Volg leads op',
    'qa.campaign': 'Maak een campagne',
    'qa.calls': 'Bereid gesprekken voor',
  },
  en: {
    'qa.hotLeads': 'Find my hottest leads',
    'qa.pipeline': 'Analyze my pipeline',
    'qa.summarize': "Summarize today's conversations",
    'qa.genImage': 'Generate property image',
    'qa.genVideo': 'Generate property video',
    'qa.writeListing': 'Write listing description',
    'qa.followUp': 'Follow up with leads',
    'qa.campaign': 'Create campaign',
    'qa.calls': "Prepare today's calls",
  },
  fr: {
    'qa.hotLeads': 'Mes meilleurs leads',
    'qa.pipeline': 'Analyser mon pipeline',
    'qa.summarize': "Résumer les conversations du jour",
    'qa.genImage': 'Générer une image de bien',
    'qa.genVideo': 'Générer une vidéo de bien',
    'qa.writeListing': 'Rédiger une description',
    'qa.followUp': 'Relancer les leads',
    'qa.campaign': 'Créer une campagne',
    'qa.calls': 'Préparer les appels du jour',
  },
  de: {
    'qa.hotLeads': 'Meine besten Leads',
    'qa.pipeline': 'Pipeline analysieren',
    'qa.summarize': 'Heutige Gespräche zusammenfassen',
    'qa.genImage': 'Objektbild erzeugen',
    'qa.genVideo': 'Objektvideo erzeugen',
    'qa.writeListing': 'Objekttext schreiben',
    'qa.followUp': 'Leads nachverfolgen',
    'qa.campaign': 'Kampagne erstellen',
    'qa.calls': 'Heutige Anrufe vorbereiten',
  },
});

/** Flat lookup for the client's click handler. */
const BY_ID = Object.freeze(
  GROUPS.reduce((acc, g) => {
    for (const a of g.actions) acc[a.id] = a;
    return acc;
  }, {}),
);

module.exports = { GROUPS, LABELS, BY_ID };
