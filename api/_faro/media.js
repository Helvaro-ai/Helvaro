'use strict';
/*
 * Faro — image and video generation jobs.
 *
 * SCAFFOLD: job lifecycle laid out, providers not wired.
 *
 * ── Images: extend, do not rebuild ───────────────────────────────────────────
 * api/_images.js already does the hard parts of requirement 9: the OpenAI
 * image-EDIT call against the client's real property photo (not text-to-image,
 * which would ignore the uploaded room entirely), Vercel Blob storage under a
 * tenant-scoped `property/${projectCode}/` prefix, credit metering, the AI
 * disclaimer label, and an upload size cap. It also already ships a style list.
 *
 * This module does NOT reimplement any of that. It wraps it, so the AI
 * workspace and the existing "AI-beeld" CRM page stay one feature with one
 * storage layout and one bill — rather than two implementations that drift.
 *
 * The only change needed inside api/_images.js is the style list: requirement 9
 * asks for Luxury, Modern, Contemporary, Scandinavian, Minimal, Classic, Warm,
 * Architectural. Modern / Luxury / Scandinavian already exist there. The
 * missing ones get added to PROPERTY_STYLES in that file — one array, not a
 * second copy here. STYLE_KEYS below is the target set, for reference.
 *
 * ── Video: genuinely new ─────────────────────────────────────────────────────
 * There is no video pipeline anywhere in this repo. This is the largest net-new
 * surface in the whole workspace and the one with real unit cost, so it is
 * built as an async JOB from the start:
 *
 *   submit → { jobId, state:'queued' } → client polls → 'ready' + resultUrl
 *
 * Not a blocking call. Video generation runs tens of seconds to minutes;
 * vercel.json caps functions at 60s (120s for whatsapp/form, 300s for the
 * cron). A synchronous video call would time out and still be billed.
 */

const fixtures = require('./fixtures');

/* Read from api/_images.js rather than restated here. This used to be a
   hardcoded wish-list of eight keys, five of which the backend would reject
   with a 400 — dead data served by the styles endpoint, waiting for the first
   caller to trust it. The real list has one home. */
const STYLE_KEYS = Object.freeze(require('../_images').PROPERTY_STYLES.map((s) => s.key));

const IMAGE_ASPECTS = Object.freeze(['1:1', '4:3', '3:2', '16:9']);
const VIDEO_FORMATS = Object.freeze(['9:16', '16:9', '1:1']);
const VIDEO_DURATIONS = Object.freeze([10, 15, 30]);

const JOB_STATES = Object.freeze(['queued', 'running', 'ready', 'failed']);

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Generate a property visualisation.
 * WIRE TO: api/_images.js — call its existing generate path, do not duplicate.
 *
 * @param {object} args { propertyId, sourceImageId, prompt, style, aspectRatio }
 * @param {object} ctx  { projectCode, userId }
 * @returns {Promise<{ jobId:string, state:string }>}
 */
async function generateImage(_args, _ctx) {
  throw new Error('ai/media: image generation not wired — call api/_images.js');
}

/** Existing generated images for the gallery. WIRE TO: _images.js property-list. */
async function listImages(_ctx, _opts = {}) { return []; }

/*
 * ── Recent activity ─────────────────────────────────────────────────────────
 * Feeds the landing screen's activity strip. Came from the design rather than
 * the brief, and it earns its place: a landing screen with nothing on it gives
 * an agent no reason to come back, while a strip of what the AI has already
 * produced does.
 *
 * NOTE the third kind. The design showed an IMAGE, a VIDEO and a TEXT card,
 * which means listing copy is a stored, re-openable ARTIFACT — not just prose
 * that scrolled past in a chat. That is a store.js concern: it needs an
 * artifacts table, because text produced in a conversation currently has
 * nowhere to live except that conversation.
 *
 * Returns a merged, reverse-chronological list:
 *   { id, kind:'image'|'video'|'text', title, subtitle, thumbUrl?, excerpt?,
 *     duration?, propertyId?, createdAt }
 */
async function listActivity(_ctx, opts = {}) {
  // WIRE TO: images from _images.js, videos from this module, text artifacts
  // from store.js. Merge, sort by createdAt desc, cap at `limit`.
  if (fixtures.isEnabled()) return fixtures.ACTIVITY.slice(0, opts.limit || 12);
  return [];
}

// ── Video ────────────────────────────────────────────────────────────────────

/*
 * Provider choice is deliberately deferred — it is an open decision, and
 * hard-coding one here would bury it. Whatever is chosen must satisfy:
 *   - server-side API key only (never client-side; same rule as everything else)
 *   - image-to-video from the property's own photos, not text-to-video, for the
 *     same reason the image path uses edit rather than generation: the listing
 *     must show the actual property
 *   - a job/webhook model, since nothing useful finishes inside 60s
 *   - per-generation cost known up front, so it can be priced into credits
 */
async function generateVideo(_args, _ctx) {
  throw new Error('ai/media: video generation not wired — provider not chosen');
}

async function listVideos(_ctx, _opts = {}) { return []; }

// ── Job lifecycle (shared by both) ───────────────────────────────────────────

/**
 * Poll a job. The client calls this on an interval while a media_job component
 * is in 'queued' or 'running'.
 *
 * Ownership is checked against ctx.projectCode, not taken from the job record:
 * job ids appear in client-side polling URLs, so they must not be a lookup key
 * that works across tenants.
 */
async function getJob(_jobId, _ctx) {
  return { jobId: _jobId, state: 'failed', error: 'not_wired' };
}

/** Attach a finished asset to a property, and optionally to a Project. */
async function saveToProperty(_jobId, _propertyId, _ctx) {
  throw new Error('ai/media: saveToProperty not wired');
}

module.exports = {
  STYLE_KEYS, IMAGE_ASPECTS, VIDEO_FORMATS, VIDEO_DURATIONS, JOB_STATES,
  generateImage, listImages, listActivity,
  generateVideo, listVideos,
  getJob, saveToProperty,
};
