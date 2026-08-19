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
const images_ = require('../_images');   // the only artifact store this product has

/* Read from api/_images.js rather than restated here. This used to be a
   hardcoded wish-list of eight keys, five of which the backend would reject
   with a 400 — dead data served by the styles endpoint, waiting for the first
   caller to trust it. The real list has one home. */
const STYLE_KEYS = Object.freeze(require('../_images').PROPERTY_STYLES.map((s) => s.key));

const IMAGE_ASPECTS = Object.freeze(['1:1', '4:3', '3:2', '16:9']);
const VIDEO_FORMATS = Object.freeze(['9:16', '16:9', '1:1']);
/* From the registry, for the same reason as the tool schema in tools.js: this
   said [10, 15, 30] while every wired model accepts 4, 8 or 12. Two hardcoded
   copies of a provider constraint drift apart, and the copy that drifts is the
   one a caller trusts. */
const VIDEO_DURATIONS = Object.freeze(require('../_media-models').videoModel().durationsSec.slice());

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
/* ── Recent activity ─────────────────────────────────────────────────────────
   What Faro has actually made for this tenant, newest first.

   Today that is generated property images and nothing else: they are the only
   artifact this product persists. Videos have no provider, and listing copy is
   handed back into the chat rather than stored — so neither can appear here
   without inventing a record. When either gains a store, it merges into the
   same sorted list and the card renderer already handles both kinds.

   This returned [] in production while the fixtures returned four cards, which
   is the worst possible split: the section looked finished in every demo and
   was empty for every real customer. */
async function listActivity(ctx, opts = {}) {
  if (fixtures.isEnabled()) return fixtures.ACTIVITY.slice(0, opts.limit || 12);

  const limit = Math.max(1, Math.min(24, opts.limit || 12));
  let images = [];
  try {
    images = await images_.listPropertyImages(ctx && ctx.projectCode);
  } catch (err) {
    // An unreadable gallery is an empty section, never a broken page.
    console.error('[faro/media] listActivity failed:', err && err.message);
    return [];
  }

  return images
    .filter((r) => r && r.url)
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, limit)
    .map((r) => ({
      // The blob URL is stable and unique per generation, so it doubles as the
      // id — these records carry no id of their own.
      id: r.url,
      kind: 'image',
      // Room first, then style: "Woonkamer — Modern Luxe" reads as a thing that
      // was made, where "Modern Luxe — Woonkamer" reads as a setting.
      title: [r.roomTypeLabel, r.styleLabel].filter(Boolean).join(' — ') || 'Pandbeeld',
      subtitle: '',
      createdAt: Date.parse(r.createdAt || 0) || 0,
      thumbUrl: r.url,
      url: r.url,
      // Carried so the card can show it. Every generated image is AI-labelled
      // at the point of construction; the label travels with it.
      aiLabel: r.aiLabel || '',
    }));
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
/*
 * ── De jobtabel ─────────────────────────────────────────────────────────────
 * In het geheugen van deze instantie, bewust. Een videojob leeft minuten, niet
 * dagen, en Vercel-functies mogen koud starten: een verloren job is dan een
 * mislukte generatie, geen kapotte database. Zodra videos bewaard moeten
 * blijven hoort dit in store.js, en dan is dit de enige plek die verandert.
 *
 * De sleutel is de jobId die de client polt. De TENANT staat in het record en
 * wordt bij elke poll vergeleken met de sessie -- een jobId komt in een
 * client-side poll-URL terecht en is dus geen bewijs van eigendom.
 */
const _jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

function _sweepJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of _jobs) if (job.startedAt < cutoff) _jobs.delete(id);
}

function _newJobId() {
  return 'vid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Een videogeneratie starten.
 *
 * Wat hier GEEN leverancier voor nodig heeft, en dus echt getest is: de keuze
 * van het model, het afdwingen van zijn duur- en formaatgrenzen, de
 * beeld-naar-video-eis, de job, en de eigendomscontrole bij het pollen.
 */
async function generateVideo(args = {}, ctx = {}) {
  const models   = require('../_media-models');
  const adapters = require('../_video-adapters');

  const model = models.videoModel();
  models.isSunsetting(model);

  /* De eis die dit product stelt en die zwaarder weegt dan prijs: het moet een
     FOTO van het pand kunnen animeren. Tekst-naar-video verzint een huis, en
     een makelaar kan een huis dat niet bestaat niet verkopen. */
  if (!model.supportsInputReference) {
    throw new Error(`${model.id} kan geen beeld-naar-video, en dat is hier de hele bedoeling.`);
  }

  const seconds = models.nearestDuration(model, args.seconds);
  const size    = models.nearestSize(model, args.size);

  const jobId = _newJobId();
  const startedAt = Date.now();

  let submitted;
  try {
    submitted = await adapters.forModel(model).submit({
      model, seconds, size,
      prompt:   String(args.prompt || '').slice(0, 2000),
      imageUrl: args.imageUrl || '',
    });
  } catch (err) {
    // Een adapter die nog niet bestaat is geen mislukte job maar een
    // configuratiefout; die hoort omhoog, niet als 'failed' in een kaartje.
    throw err;
  }

  _sweepJobs();
  _jobs.set(jobId, {
    jobId,
    projectCode: String(ctx.projectCode || ''),
    userId: String(ctx.userId || ''),
    modelId: model.id,
    providerJobId: submitted && submitted.providerJobId,
    seconds, size,
    startedAt,
    state: 'queued',
  });

  return { jobId, state: 'queued', seconds, size, model: model.id };
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
async function getJob(jobId, ctx = {}) {
  const job = _jobs.get(String(jobId || ''));
  /* Onbekend en 'van iemand anders' geven hetzelfde antwoord. Dat een job
     bestaat is zelf al informatie, en jobIds staan in poll-URLs. */
  const mine = String(ctx.projectCode || '');
  if (!job || !mine || job.projectCode !== mine) {
    return { jobId, state: 'failed', error: 'not_found' };
  }
  if (job.state === 'ready' || job.state === 'failed') return { ...job };

  const models   = require('../_media-models');
  const adapters = require('../_video-adapters');
  const model = models.VIDEO_MODELS[job.modelId];
  if (!model) return { ...job, state: 'failed', error: 'unknown_model' };

  let out;
  try {
    out = await adapters.forModel(model).poll({
      model, providerJobId: job.providerJobId, startedAt: job.startedAt,
    });
  } catch (err) {
    console.error('[faro/media] poll failed:', err && err.message);
    return { ...job, state: 'failed', error: 'poll_failed' };
  }

  job.state = out && out.state ? out.state : 'failed';
  if (out && out.url) job.url = out.url;
  if (out && out.error) job.error = out.error;
  return { ...job };
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
  // Alleen voor tests: de jobtabel leegmaken tussen gevallen door.
  _resetJobs() { _jobs.clear(); },
};
