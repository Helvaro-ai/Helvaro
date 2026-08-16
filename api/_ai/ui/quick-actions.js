'use strict';
/*
 * Helvaro AI — quick action definitions (requirement 5).
 *
 * SCAFFOLD: complete. Plain data.
 *
 * ── Why these are data and not nine onclick handlers ─────────────────────────
 * Requirement 5: "clicking an action should start the appropriate AI workflow
 * immediately." The cheapest correct way to do that is for each action to BE a
 * prompt — clicking one is identical to the user typing that sentence, so there
 * is exactly one code path into a conversation and no second, parallel
 * "workflow launcher" that can behave differently from the chat box.
 *
 * A few actions open a sub-workspace instead of starting a chat, because the
 * work genuinely needs controls (a property, a style, an aspect ratio) that a
 * sentence cannot carry. Those carry `panel` instead of `prompt`.
 *
 * The three groups are the user journey from requirement 17 —
 * Ask → Understand → Analyze → Create → Act — collapsed into what fits on a
 * landing screen: Analyseren / Maken / Doen.
 */

const GROUPS = Object.freeze([
  Object.freeze({
    key: 'analyze',
    label: 'Analyseren',
    actions: Object.freeze([
      { id: 'hot-leads',    label: 'Vind mijn beste leads',        prompt: 'Wie zijn op dit moment mijn beste leads om te contacteren? Toon ze als kaarten.' },
      { id: 'pipeline',     label: 'Analyseer mijn pipeline',      prompt: 'Analyseer mijn pipeline. Waar zit de waarde en waar loopt het vast?' },
      { id: 'today-convos', label: 'Vat gesprekken van vandaag samen', prompt: 'Vat de gesprekken van vandaag samen. Wat vraagt opvolging?' },
    ]),
  }),
  Object.freeze({
    key: 'create',
    label: 'Maken',
    actions: Object.freeze([
      { id: 'gen-image',   label: 'Genereer pandbeeld',  panel: 'images' },
      { id: 'gen-video',   label: 'Genereer pandvideo',  panel: 'videos' },
      { id: 'write-listing', label: 'Schrijf een pandtekst', prompt: 'Schrijf een verkooptekst voor een van mijn panden. Vraag me eerst welk pand.' },
    ]),
  }),
  Object.freeze({
    key: 'act',
    label: 'Doen',
    actions: Object.freeze([
      { id: 'followup',  label: 'Volg leads op',        prompt: 'Welke leads verdienen vandaag opvolging? Stel per lead een opvolgbericht voor.' },
      { id: 'campaign',  label: 'Maak een campagne',    prompt: 'Ik wil een campagne maken voor een pand. Vraag me welk pand en stel dan een campagne voor.' },
      { id: 'calls',     label: 'Bereid gesprekken voor', prompt: 'Bereid mijn gesprekken van vandaag voor: wie bel ik, waarom, en wat is de context?' },
    ]),
  }),
]);

/** Flat lookup for the click handler. */
const BY_ID = Object.freeze(
  GROUPS.reduce((acc, g) => {
    for (const a of g.actions) acc[a.id] = a;
    return acc;
  }, {}),
);

module.exports = { GROUPS, BY_ID };
