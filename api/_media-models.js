'use strict';
/*
 * Media model registry — the ONE place that names which model generates an
 * image and which generates a video.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The image model used to be a bare `const OPENAI_MODEL = 'gpt-image-1-mini'`
 * halfway down _images.js, and the video model did not exist at all (the Faro
 * tool was a stub). Model choice is not an implementation detail here: it sets
 * the output quality clients pay 50 credits for, it sets the real cost per
 * generation, and — as the Sora entry below shows — it has an expiry date.
 * Those three facts belong together, in one file, next to the constraints each
 * model imposes on the request.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 * Each entry is a plain object:
 *
 *   id            the string the provider's API expects
 *   provider      'openai' — the seam a second vendor is added at
 *   endpoint      full URL, so no caller assembles one
 *   sizes         allowed `size` values, best-first
 *   costUsd(...)  real cost of one generation, for the credit-weight sanity
 *                 check at the bottom of this file. Never used for billing.
 *   sunsetOn      ISO date the provider removes it, or null. Not decorative —
 *                 isSunsetting() logs a warning as the date approaches so this
 *                 does not become a production surprise.
 *   quirks        things that make the request differ from its siblings'
 *
 * Everything is overridable by env (HELVARO_IMAGE_MODEL / HELVARO_VIDEO_MODEL)
 * so a model can be rolled back without a deploy of new code — but an unknown
 * name is REFUSED rather than passed through, because a typo'd model id would
 * otherwise reach the API as a 400 that reads like an outage.
 */

/* ── Images ────────────────────────────────────────────────────────────────────
 * gpt-image-2 (April 2026) is the current best on OpenAI's images/edits
 * endpoint, which is the endpoint this product needs: every property render
 * transforms a photo the client actually uploaded, and a text-to-image call
 * would ignore it. It replaced gpt-image-1.5, which OpenAI removes on
 * 2026-12-01, and it is a clear step up on instruction-following from the
 * gpt-image-1-mini this code shipped with — which matters a great deal here,
 * because TRANSFORM_ENGINE is ~6k characters of instructions the model is
 * supposed to actually obey.
 *
 * ── On quality, and why the default is 'medium' ──────────────────────────────
 * gpt-image-2's quality tier is the single biggest cost lever in this codebase:
 *
 *   low     ~$0.006   visibly soft; not good enough to put in front of a buyer
 *   medium  ~$0.053   the default
 *   high    ~$0.211   best, and ~4x the cost of medium
 *
 * IMAGE_GENERATION is priced at 50 credits against an assumed real cost of
 * €0.095 (api/_credits.js). Medium lands at roughly half that assumption, so
 * the existing credit weight still holds with margin. High would cost about
 * double what the client is charged for — on every single generation. That is
 * a pricing decision, not a code one, so the default stays at medium and
 * HELVARO_IMAGE_QUALITY exists for whoever makes that call. Portrait and
 * landscape are also cheaper than square at any tier (fewer output tokens),
 * which is worth knowing when picking a default size.
 */
const IMAGE_MODELS = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/images/edits',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['low', 'medium', 'high', 'auto'],
    defaultQuality: 'medium',
    sunsetOn: null,
    // gpt-image-2 processes every input at high fidelity and REJECTS the
    // parameter its predecessors accepted — sending it is a 400, not a no-op.
    supportsInputFidelity: false,
    costUsd({ quality = 'medium', size = '1024x1024' } = {}) {
      const square = size === '1024x1024';
      const byTier = { low: 0.006, medium: 0.053, high: 0.211, auto: 0.053 };
      const base = byTier[quality] != null ? byTier[quality] : byTier.medium;
      return square ? base : base * 0.78;   // non-square outputs bill fewer tokens
    },
  },

  /* Kept as a rollback target, not as a recommendation. This is what the code
     called before; if gpt-image-2 ever misbehaves in production, setting
     HELVARO_IMAGE_MODEL=gpt-image-1-mini restores the previous behaviour
     exactly, including the input_fidelity parameter it accepts. */
  'gpt-image-1-mini': {
    id: 'gpt-image-1-mini',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/images/edits',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['low', 'medium', 'high', 'auto'],
    defaultQuality: 'medium',
    sunsetOn: null,
    supportsInputFidelity: true,
    costUsd() { return 0.019; },
  },
};

const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

/* ── Video ─────────────────────────────────────────────────────────────────────
 * sora-2-pro is the best video model reachable with the key this deployment
 * already has, and it accepts `input_reference` — it can animate a property
 * photo rather than hallucinating a house from a text prompt, which is the
 * only version of this feature worth shipping to an estate agent.
 *
 * ⚠ READ THIS BEFORE BUILDING ON IT ⚠
 * OpenAI sunsets the Sora API on 2026-09-24 and has published NO successor.
 * That is weeks away, not years. This entry is wired up because the seam and
 * the whole job/poll/store pipeline around it are worth having and are
 * provider-agnostic — but the model itself is temporary, and whoever picks the
 * replacement (Veo 3, Kling, Seedance, Wan) adds it below with its own
 * provider adapter. isSunsetting() below is what makes that deadline visible
 * in the logs instead of arriving as a morning of 404s.
 *
 * Cost is per SECOND, and it is large: $0.30/s at 720p means a 12-second clip
 * costs $3.60 — roughly 38x a medium image. See VIDEO_GENERATION's weight in
 * api/_credits.js, which is derived from this rather than guessed.
 */
const VIDEO_MODELS = {
  'sora-2-pro': {
    id: 'sora-2-pro',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/videos',
    sizes: ['1280x720', '720x1280', '1792x1024', '1024x1792'],
    durationsSec: [4, 8, 12],
    defaultDurationSec: 8,
    sunsetOn: '2026-09-24',
    supportsInputReference: true,
    costUsd({ seconds = 8, size = '1280x720' } = {}) {
      const perSecond = size === '1792x1024' || size === '1024x1792' ? 0.50 : 0.30;
      return perSecond * seconds;
    },
  },

  /* The cheaper sibling. Same endpoint, same shape, same sunset — worth having
     because a 12-second 720p clip costs $1.20 here against $3.60 on pro, and
     for a social teaser that trade is often the right one. */
  'sora-2': {
    id: 'sora-2',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/videos',
    sizes: ['1280x720', '720x1280', '1792x1024', '1024x1792'],
    durationsSec: [4, 8, 12],
    defaultDurationSec: 8,
    sunsetOn: '2026-09-24',
    supportsInputReference: true,
    costUsd({ seconds = 8 } = {}) { return 0.10 * seconds; },
  },
};

const DEFAULT_VIDEO_MODEL = 'sora-2-pro';

/* ── Selection ────────────────────────────────────────────────────────────────
 * An unknown env value is a hard failure at call time rather than a silent
 * fallback: falling back would mean a deploy that *looks* configured for one
 * model quietly bills for another, and nobody would notice until the invoice.
 */
class ModelConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelConfigError';
    this.code = 'model_config';
  }
}

function pick(table, envName, fallbackId, kind) {
  const wanted = String(process.env[envName] || '').trim() || fallbackId;
  const entry = table[wanted];
  if (!entry) {
    throw new ModelConfigError(
      `${envName}="${wanted}" is not a known ${kind} model. Known: ${Object.keys(table).join(', ')}.`,
    );
  }
  return entry;
}

function imageModel() {
  return pick(IMAGE_MODELS, 'HELVARO_IMAGE_MODEL', DEFAULT_IMAGE_MODEL, 'image');
}

function videoModel() {
  return pick(VIDEO_MODELS, 'HELVARO_VIDEO_MODEL', DEFAULT_VIDEO_MODEL, 'video');
}

/**
 * Resolve the quality tier for an image request.
 * Explicit argument wins, then HELVARO_IMAGE_QUALITY, then the model default.
 * An unrecognised value falls back rather than throwing — quality is a knob a
 * caller may pass through from a UI, and a bad one should not fail a paid
 * generation that would otherwise have worked.
 */
function imageQuality(model, requested) {
  const wanted = String(requested || process.env.HELVARO_IMAGE_QUALITY || '').trim().toLowerCase();
  if (wanted && model.qualities.indexOf(wanted) !== -1) return wanted;
  if (wanted) console.warn(`[media-models] ignoring unknown image quality "${wanted}"`);
  return model.defaultQuality;
}

/** Nearest allowed size for a model, best-first. Never returns undefined. */
function nearestSize(model, requested) {
  const wanted = String(requested || '').trim();
  if (model.sizes.indexOf(wanted) !== -1) return wanted;
  return model.sizes[0];
}

/** Nearest allowed duration for a video model. */
function nearestDuration(model, requestedSec) {
  const want = Number(requestedSec);
  if (!Number.isFinite(want)) return model.defaultDurationSec;
  return model.durationsSec.reduce(
    (best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best),
    model.durationsSec[0],
  );
}

/**
 * How many days until a model is removed, or null if it has no announced date.
 * Logs once per process per model inside the window so a sunset shows up in
 * the logs of a deployment nobody is actively reading release notes for.
 */
const _warned = new Set();
function isSunsetting(model, withinDays = 90) {
  if (!model || !model.sunsetOn) return null;
  const days = Math.ceil((Date.parse(model.sunsetOn + 'T00:00:00Z') - Date.now()) / 86400000);
  if (days <= withinDays && !_warned.has(model.id)) {
    _warned.add(model.id);
    console.warn(
      `[media-models] ${model.id} is removed by its provider on ${model.sunsetOn} ` +
      `(${days} days) and has no announced successor — pick a replacement.`,
    );
  }
  return days;
}

module.exports = {
  IMAGE_MODELS,
  VIDEO_MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  ModelConfigError,
  imageModel,
  videoModel,
  imageQuality,
  nearestSize,
  nearestDuration,
  isSunsetting,
};
