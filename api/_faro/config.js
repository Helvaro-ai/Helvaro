'use strict';
/*
 * Faro — configuration and provider selection.
 *
 * SCAFFOLD: structure only. Nothing here calls a model yet.
 *
 * ── Why a config module instead of reading env inline ────────────────────────
 * Requirement: "Build the backend so Helvaro can use different models" and
 * "the provider should be replaceable". That only holds if exactly ONE file
 * knows which provider is active. Every other module asks this one. Swapping
 * Claude → OpenAI → anything else is then an env var, not a code change.
 *
 * ── The branding rule is enforced here, not by convention ────────────────────
 * Requirement 13: the UI says "Faro" and never exposes Claude/OpenAI.
 * That is easy to state and easy to leak: an error message, a model field in a
 * JSON response, a debug log. So the provider name and model id NEVER leave
 * this module toward the client — publicModelLabel() is the only thing the
 * front-end is ever handed, and it returns Helvaro-branded strings.
 *
 * ── Keys ─────────────────────────────────────────────────────────────────────
 * Server-side env only, same posture as api/_images.js's OPENAI_API_KEY.
 * Nothing in api/_faro/ may be imported from a client bundle, and no key value
 * is ever included in a response body or a thrown error's message.
 */

// ── Which provider answers ───────────────────────────────────────────────────
// Default 'claude'. Changing this env var is the entire swap procedure.
const PROVIDER = (process.env.FARO_PROVIDER || 'claude').trim().toLowerCase();

// The feature stays off until explicitly switched on, same reasoning as
// api/_demo-chat.js's isEnabled(): a paid, publicly reachable AI endpoint
// should not start running merely because its code shipped to the server.
const ENABLED = String(process.env.FARO_WORKSPACE_ENABLED || '') === '1';

// ── Model registry ───────────────────────────────────────────────────────────
// Internal ids only. `tier` is what the UI's model selector actually sends —
// the user picks "Standard" or "Precise", never a vendor model name.
const MODELS = Object.freeze({
  claude: Object.freeze({
    fast:     'claude-haiku-4-5-20251001',
    standard: 'claude-sonnet-5',
    precise:  'claude-opus-5',
  }),
  openai: Object.freeze({
    fast:     'gpt-4o-mini',
    standard: 'gpt-4o',
    precise:  'gpt-4o',
  }),
  // Scripted local provider — the ids are labels, nothing resolves them.
  demo: Object.freeze({ fast: 'demo', standard: 'demo', precise: 'demo' }),
});

// What the model selector in the UI offers. Labels are deliberately
// capability-flavoured, not vendor-flavoured.
const TIERS = Object.freeze([
  Object.freeze({ key: 'fast',     label: 'Snel',     hint: 'Korte vragen, snelle antwoorden' }),
  Object.freeze({ key: 'standard', label: 'Standaard', hint: 'Dagelijks werk',               }),
  Object.freeze({ key: 'precise',  label: 'Precies',  hint: 'Analyse en langere taken'       }),
]);

const DEFAULT_TIER = 'standard';

// ── Limits ───────────────────────────────────────────────────────────────────
// Mirrors the layered-cap thinking in api/_demo-chat.js: cheap limits first,
// the credit system as the hard ceiling.
const LIMITS = Object.freeze({
  maxMessageChars:    8000,   // one user turn
  maxHistoryTurns:    40,     // conversation window handed to the model
  maxToolIterations:  8,      // tool-call loop guard — prevents runaway spend
  maxAttachments:     6,
  maxAttachmentBytes: 12 * 1024 * 1024,
  rateLimitMax:       60,     // requests…
  rateLimitWindowMs:  10 * 60 * 1000, // …per 10 min, per user
});

function isEnabled() {
  return ENABLED;
}

function providerName() {
  return PROVIDER;
}

/**
 * Resolve a UI tier key to the concrete model id for the active provider.
 * Internal use only — the return value must never reach a response body.
 */
function modelFor(tier) {
  const table = MODELS[PROVIDER] || MODELS.claude;
  return table[tier] || table[DEFAULT_TIER];
}

/**
 * The ONLY model-identifying string the client may receive.
 * Requirement 13: no Claude/OpenAI branding in the primary experience — and,
 * since the rename, no "AI" in the product's own name either.
 */
function publicModelLabel(tier) {
  const t = TIERS.find((x) => x.key === tier) || TIERS.find((x) => x.key === DEFAULT_TIER);
  return `Faro · ${t.label}`;
}

/**
 * Whether the active provider has credentials configured. Used by the health
 * check so a misconfigured deploy fails loudly at the seam instead of
 * producing a confusing model error three layers down.
 */
function isConfigured() {
  if (PROVIDER === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (PROVIDER === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (PROVIDER === 'demo')   return true; // scripted, offline, needs no key
  return false;
}

module.exports = {
  TIERS,
  DEFAULT_TIER,
  LIMITS,
  isEnabled,
  isConfigured,
  providerName,
  modelFor,
  publicModelLabel,
};
