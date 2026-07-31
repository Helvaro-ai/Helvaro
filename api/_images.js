'use strict';
/*
 * Phase 4 — AI property visualisation images. Airtable/Vercel port of the
 * VPS reference implementation (READ ONLY, never copied verbatim — Postgres
 * code cannot run here):
 *   vps-backend/server/lib/openai-images.js      (OpenAI image client)
 *   vps-backend/server/lib/property-styles.js    (style list + AI label)
 *   vps-backend/server/routes/leads.js           ('property-*' modes)
 *   vps-backend/server/routes/property-media.js  (tenant-scoped serving)
 *
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_gcal.js, api/_credits.js) — the route
 * count stays at 11. Dispatched from api/leads.js via body.mode ===
 * 'property-styles' / 'property-generate' / 'property-list' — the SAME
 * mode-based POST dispatch already used there for suggest-replies/
 * config-save/etc, not the __gcal-style query-param+rewrite pattern. That
 * pattern exists because Google's OAuth redirect URI must stay a fixed,
 * pre-registered path; this feature has no such external constraint — it's
 * purely dashboard-internal AJAX — so the simpler existing mode dispatch is
 * the right fit and needs zero vercel.json changes.
 *
 * WHAT DIFFERS FROM THE VPS REFERENCE:
 *   - Model: 'gpt-image-1-mini' (task-specified), not vps's 'gpt-image-1' —
 *     matches the model api/admin.js's generateOpenAIImage() already calls
 *     and pays for on this deployment. Still uses the images EDIT endpoint
 *     (not generations) because the whole point is transforming the
 *     client's actual uploaded property photo, exactly like the VPS
 *     reference — a text-to-image call would ignore the uploaded photo
 *     entirely.
 *   - Storage: Vercel Blob (uploadPropertyImageToBlob below), same
 *     @vercel/blob technique as api/admin.js's uploadToBlob() (Helvaro's
 *     own social-post images), but under a DISTINCT, tenant-scoped prefix
 *     (`property/${projectCode}/...` vs admin.js's `social/...`) so a
 *     client's property images can never collide with another client's, or
 *     with Helvaro's own social content. This file never imports, calls, or
 *     modifies anything in admin.js — that path is untouched.
 *   - Persistence: Airtable Client Config record (tblPidTrwGRzRt4LZ), a NEW
 *     Long Text JSON field 'Property Images' — addressed BY NAME, not by
 *     field ID, because the field doesn't exist in the schema yet (same
 *     reasoning api/_credits.js's header gives for its own new fields: you
 *     can't know an ID before the field is created). Fails soft exactly
 *     like _credits.js: if the field hasn't been added yet,
 *     listPropertyImages() returns [] and appendPropertyImage() silently
 *     no-ops (logged once, not per-call) — but generation ITSELF still
 *     works and the freshly generated image is still returned to the
 *     caller; only cross-session/cross-device history is lost until Sindi
 *     adds 'Property Images' (Long text) to the Klanten table.
 *
 * AI-LABEL ENFORCEMENT (EU AI Act Art. 50(4) — see
 * vps-backend/COMPLIANCE-AUDIT.md §2.2 and vps-backend/server/lib/
 * property-styles.js's identical AI_DISCLAIMER_LABEL constant, which this
 * mirrors verbatim): buildImageRecord() below is the ONLY function in this
 * codebase that constructs a persistable/returnable image record, and it
 * unconditionally stamps aiLabel = AI_DISCLAIMER_LABEL — never read from a
 * request body, never omittable, never overridable by a caller. Airtable
 * has no CHECK constraint (unlike vps's Postgres schema), so this function
 * IS the enforcement layer: every write path (appendPropertyImage) and
 * every read path (the property-generate response, listPropertyImages) only
 * ever handles records this function built. api/dashboard.js's "AI-beeld"
 * page renders this label as an always-visible caption directly under every
 * image — never buried in alt-text, never a dismissible/optional element —
 * matching Art. 50(4)'s "clear and visible" requirement.
 *
 * CREDITS: gated by api/leads.js's 'property-generate' handler via
 * api/_credits.js's checkCredits(projectCode, FEATURES.IMAGE_GENERATION)
 * BEFORE this file's generatePropertyImage() (i.e. before any OpenAI spend)
 * — this file has no credits awareness of its own, same separation of
 * concerns as openai-images.js/property-styles.js on the VPS side (the
 * route handler owns the credit gate, not the generation library).
 */

// ── Style list (data-driven — see vps's property-styles.js header for why:
// every consumer, here and in the dashboard, reads from this ONE array) ──
const PROPERTY_STYLES = Object.freeze([
  Object.freeze({
    key: 'modern',
    label: 'Modern',
    promptFragment:
      'a clean, modern interior renovation: neutral tones (white/grey/black), ' +
      'minimalist furniture, large windows feel, sleek fixtures, contemporary lighting',
  }),
  Object.freeze({
    key: 'luxury',
    label: 'Luxe',
    promptFragment:
      'a high-end luxury renovation: premium materials (marble, natural wood, brass ' +
      'accents), elegant furniture, designer lighting, an upscale, aspirational feel',
  }),
  Object.freeze({
    key: 'scandinavian',
    label: 'Scandinavisch',
    promptFragment:
      'a Scandinavian-style renovation: light wood tones, soft neutral palette, cozy ' +
      'textiles, simple functional furniture, abundant natural light, hygge atmosphere',
  }),
  Object.freeze({
    key: 'family-friendly',
    label: 'Gezinsvriendelijk',
    promptFragment:
      'a warm, family-friendly renovation: durable practical materials, soft rounded ' +
      'furniture edges, cheerful warm colors, ample storage, a welcoming lived-in feel',
  }),
]);
const PROPERTY_STYLE_KEYS = PROPERTY_STYLES.map((s) => s.key);

// THE mandatory AI-content disclaimer. Single constant — see file header.
const AI_DISCLAIMER_LABEL = 'AI-visualisatie — werkelijke staat van de woning kan afwijken';

// Matches vps's property-upload cap exactly (task requirement).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const OPENAI_MODEL = 'gpt-image-1-mini';
const OPENAI_IMAGES_EDIT_URL = 'https://api.openai.com/v1/images/edits';
// Stays comfortably under vercel.json's api/**/*.js maxDuration=60s.
const REQUEST_TIMEOUT_MS = 55_000;

class ImageFeatureError extends Error {
  constructor(message, { code = 'error', status = 500 } = {}) {
    super(message);
    this.name = 'ImageFeatureError';
    this.code = code;
    this.status = status;
  }
}

function getStyleByKey(key) {
  return PROPERTY_STYLES.find((s) => s.key === key) || null;
}
function isValidStyleKey(key) {
  return PROPERTY_STYLE_KEYS.includes(String(key || ''));
}

// Builds the OpenAI prompt. customPrompt is appended, never substituted —
// a client can add detail but never drop the base style guidance entirely.
// Caller is responsible for trimming/length-capping customPrompt already
// (see api/leads.js's 'property-generate' handler); this only assembles text.
function buildTransformPrompt(styleKey, customPrompt) {
  const style = getStyleByKey(styleKey);
  const base = style
    ? `Transform this real estate photo into a photorealistic visualisation showing ${style.promptFragment}. ` +
      'Keep the room layout, walls, windows, and camera angle recognizable — this is a renovation/staging ' +
      'visualisation of the SAME space, not a different building.'
    : 'Transform this real estate photo into a photorealistic renovated visualisation, keeping the room layout ' +
      'and camera angle recognizable.';
  const extra = customPrompt ? String(customPrompt).trim() : '';
  return extra ? `${base} Additional client instructions: ${extra}` : base;
}

// ── Config / fail-soft helpers ──────────────────────────────────────────
function openaiKey() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI || '';
}
function isConfigured() {
  return !!(openaiKey() && process.env.BLOB_READ_WRITE_TOKEN);
}
// Clear, specific message per missing piece — never a generic 500, never a
// crash. Returned to the client as-is (Dutch, matches the rest of this app).
function missingConfigMessage() {
  if (!openaiKey()) return 'AI-beeldgeneratie is nog niet geconfigureerd (ontbrekende OpenAI-sleutel). Neem contact op met Helvaro.';
  if (!process.env.BLOB_READ_WRITE_TOKEN) return 'AI-beeldgeneratie is nog niet geconfigureerd (ontbrekende opslag). Neem contact op met Helvaro.';
  return 'AI-beeldgeneratie is momenteel niet beschikbaar. Probeer later opnieuw.';
}

// ── Upload validation — never trust a client-supplied filename or MIME
// type; the ONLY signal trusted is the actual base64 payload behind a
// strictly-matched data: URL prefix (same convention as vps's
// property-upload mode). ────────────────────────────────────────────────
function parseImageDataUrl(dataUrl) {
  const s = String(dataUrl || '').trim();
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!match) {
    throw new ImageFeatureError('Ongeldige afbeelding — verwacht een PNG/JPG/WebP data-URL', { code: 'invalid_image', status: 400 });
  }
  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw new ImageFeatureError('Ongeldige afbeelding — kon base64 niet decoderen', { code: 'invalid_image', status: 400 });
  }
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new ImageFeatureError(`Afbeelding moet tussen 1 byte en ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB zijn`, { code: 'invalid_size', status: 400 });
  }
  return { buffer, mimeType };
}

// ── Vercel Blob upload — tenant-scoped, distinct prefix from admin.js's
// `social/...` (see file header). Never reuses/imports admin.js's own
// uploadToBlob(). ───────────────────────────────────────────────────────
async function uploadPropertyImageToBlob(buffer, contentType, projectCode, kind) {
  let put;
  try {
    ({ put } = require('@vercel/blob'));
  } catch (e) {
    throw new ImageFeatureError('Opslag niet beschikbaar op de server.', { code: 'no_blob_module', status: 503 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ImageFeatureError(missingConfigMessage(), { code: 'no_blob_token', status: 503 });
  }
  const ext = (contentType || '').includes('png') ? 'png' : (contentType || '').includes('webp') ? 'webp' : 'jpg';
  const safeProject = String(projectCode || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'unknown';
  const safeKind = kind === 'source' ? 'source' : 'result';
  const filename = `property/${safeProject}/${safeKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: contentType || 'image/png',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return (blob.url || '').slice(0, 500);
}

// ── OpenAI images/edits call. Never throws a raw error to the caller —
// every failure path is a typed ImageFeatureError with a Dutch, user-safe
// message and an appropriate HTTP status, so api/leads.js's handler can
// relay it directly without leaking API internals. ──────────────────────
async function generatePropertyImage({ imageBuffer, imageMimeType, style, customPrompt }) {
  const key = openaiKey();
  if (!key) throw new ImageFeatureError(missingConfigMessage(), { code: 'no_api_key', status: 503 });
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new ImageFeatureError('Geen geldige afbeelding meegegeven.', { code: 'invalid_image', status: 400 });
  }

  const prompt = buildTransformPrompt(style, customPrompt);
  const ext = imageMimeType === 'image/webp' ? 'webp' : imageMimeType === 'image/jpeg' ? 'jpg' : 'png';
  const form = new FormData();
  form.append('model', OPENAI_MODEL);
  form.append('prompt', prompt.slice(0, 4000));
  form.append('size', '1024x1024');
  form.append('image', new Blob([imageBuffer], { type: imageMimeType || 'image/png' }), `source.${ext}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(OPENAI_IMAGES_EDIT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ImageFeatureError('AI-beeldgeneratie duurde te lang. Probeer opnieuw, eventueel met een kleinere foto.', { code: 'timeout', status: 504 });
    }
    throw new ImageFeatureError('AI-beeldgeneratie kon niet bereikt worden. Probeer later opnieuw.', { code: 'network_error', status: 502 });
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body) {
    const apiMessage = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    console.error('[images] OpenAI images/edits failed:', res.status, String(apiMessage).slice(0, 300));
    throw new ImageFeatureError('AI-beeldgeneratie is mislukt. Probeer een andere foto of stijl.', { code: 'api_error', status: 502 });
  }

  const entry = Array.isArray(body.data) ? body.data[0] : null;
  const b64 = entry && entry.b64_json;
  if (!b64) {
    throw new ImageFeatureError('AI gaf geen afbeelding terug. Probeer opnieuw.', { code: 'empty_response', status: 502 });
  }
  return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
}

// The ONLY place an image record is constructed — see file header's
// AI-LABEL ENFORCEMENT section. No caller can build a record without this
// function, and this function always stamps aiLabel.
function buildImageRecord({ url, style, customPrompt }) {
  const styleObj = getStyleByKey(style);
  return {
    url: String(url || '').slice(0, 500),
    style: styleObj ? styleObj.key : 'custom',
    styleLabel: styleObj ? styleObj.label : 'Aangepast',
    customPrompt: customPrompt ? String(customPrompt).slice(0, 500) : '',
    aiLabel: AI_DISCLAIMER_LABEL,
    createdAt: new Date().toISOString(),
  };
}

// ── Airtable persistence (Client Config 'Property Images' field) ─────────
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const FIELD_PROPERTY_IMAGES = 'Property Images'; // Long text (JSON array). NOT yet on the schema — see file header.
const MAX_HISTORY = 24; // bounds the JSON field's size; oldest entries drop off first

function envConfiguredAirtable() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Logged at most once per cold start per key — an unconfigured field must
// never spam production logs on every generate/list call.
const _loggedOnce = new Set();
function logOnce(key, ...args) {
  if (_loggedOnce.has(key)) return;
  _loggedOnce.add(key);
  console.warn(...args);
}

async function getClientRecordByProjectCode(projectCode) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN = process.env.API_AIRTABLE;
  const formula = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`getClientRecordByProjectCode(${projectCode}): HTTP ${r.status}`);
  const d = await r.json();
  return (d.records || [])[0] || null;
}

// listPropertyImages(projectCode) -> Promise<Array>. Never throws; [] on
// any failure or if the field/schema doesn't exist yet.
async function listPropertyImages(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfiguredAirtable()) return [];
  try {
    const record = await getClientRecordByProjectCode(code);
    if (!record) return [];
    const raw = record.fields && record.fields[FIELD_PROPERTY_IMAGES];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logOnce('list', '[images] listPropertyImages failed, showing empty gallery:', err.message);
    return [];
  }
}

// appendPropertyImage(projectCode, record) -> Promise<boolean>. Best-effort:
// never throws. `record` must already come from buildImageRecord() —
// this function does not itself enforce the AI label, it only persists
// whatever it's given (single-responsibility; the enforcement lives in
// buildImageRecord() so there is exactly one place to audit).
async function appendPropertyImage(projectCode, record) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfiguredAirtable()) return false;
  try {
    const clientRecord = await getClientRecordByProjectCode(code);
    if (!clientRecord) return false;
    const raw = clientRecord.fields && clientRecord.fields[FIELD_PROPERTY_IMAGES];
    let existing = [];
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) existing = p;
      } catch { /* corrupt/foreign JSON — start fresh rather than throw */ }
    }
    const updated = [record, ...existing].slice(0, MAX_HISTORY);
    const BASE_ID = process.env.BASE_AIRTABLE;
    const TOKEN = process.env.API_AIRTABLE;
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${clientRecord.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [FIELD_PROPERTY_IMAGES]: JSON.stringify(updated) } }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // Expected shape when Sindi hasn't added 'Property Images' to Client
      // Config yet (Airtable rejects an unknown field name). Generation
      // already succeeded and was already returned to the caller — this is
      // a degraded-but-working state (no cross-session history), never
      // surfaced as an error to the client.
      logOnce('append', `[images] appendPropertyImage PATCH failed (HTTP ${r.status}) — history not persisted (add '${FIELD_PROPERTY_IMAGES}' Long-text field to Client Config to enable):`, t.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    logOnce('append-ex', '[images] appendPropertyImage threw — history not persisted:', err.message);
    return false;
  }
}

module.exports = {
  PROPERTY_STYLES,
  AI_DISCLAIMER_LABEL,
  MAX_UPLOAD_BYTES,
  ImageFeatureError,
  getStyleByKey,
  isValidStyleKey,
  buildTransformPrompt,
  isConfigured,
  missingConfigMessage,
  parseImageDataUrl,
  uploadPropertyImageToBlob,
  generatePropertyImage,
  buildImageRecord,
  listPropertyImages,
  appendPropertyImage,
};
