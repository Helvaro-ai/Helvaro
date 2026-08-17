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
  // ── Added for the Belgian/Flemish estate-agent market (see file-header
  // addendum above PROPERTY_STYLES for why these three specifically) ──────
  Object.freeze({
    key: 'landelijk',
    label: 'Landelijk',
    promptFragment:
      'a classic Flemish/Belgian "landelijke" (country cottage) renovation: warm off-white and ' +
      'earthy tones, painted or exposed wooden beams, natural stone or brick accents, farmhouse-' +
      'style fixtures, a timeless, homely countryside feel',
  }),
  Object.freeze({
    key: 'industrial',
    label: 'Industrieel / Loft',
    promptFragment:
      'an industrial loft-style renovation: exposed brick or concrete, black steel window frames ' +
      'and fixtures, dark metal accents, raw wood, statement pendant lighting, an open urban-loft feel',
  }),
  Object.freeze({
    key: 'staging',
    label: 'Lege ruimte inrichten',
    promptFragment:
      'a professionally staged, tastefully furnished version of this EMPTY room: add well-' +
      'proportioned furniture and soft furnishings in a warm, neutral, broadly appealing style that ' +
      'helps buyers picture living there, without altering the architecture, walls, floor or windows',
  }),
]);
const PROPERTY_STYLE_KEYS = PROPERTY_STYLES.map((s) => s.key);

// ── Room types (data-driven, same pattern as PROPERTY_STYLES above) ────────
// A style alone ("modern", "staging", ...) produces generic results — a
// kitchen and a bathroom need different furniture/finishing guidance even
// under the identical style. This is a SECOND, ORTHOGONAL, OPTIONAL axis
// layered on top of the chosen style by buildTransformPrompt() below; it is
// never required (empty string / omitted = let the AI infer the room from
// the photo itself, the pre-existing behaviour, fully backward compatible
// with any caller that doesn't send roomType at all).
const ROOM_TYPES = Object.freeze([
  Object.freeze({
    key: 'woonkamer',
    label: 'Woonkamer',
    promptFragment:
      'This is a living room — include appropriate seating (sofa/armchairs), a coffee table, and ' +
      'a rug where fitting',
  }),
  Object.freeze({
    key: 'slaapkamer',
    label: 'Slaapkamer',
    promptFragment:
      'This is a bedroom — include a bed with linens and nightstands, and keep the atmosphere ' +
      'calm and restful',
  }),
  Object.freeze({
    key: 'keuken',
    label: 'Keuken',
    promptFragment:
      'This is a kitchen — focus on cohesive cabinetry, worktops and appliances; do not add ' +
      'living-room or bedroom furniture',
  }),
  Object.freeze({
    key: 'badkamer',
    label: 'Badkamer',
    promptFragment:
      'This is a bathroom — focus on clean fixtures, tiling and finishing touches; do not add ' +
      'bedroom or living-room furniture',
  }),
  // ── Exterior — see the "sensible axes" list in the visual-controls task:
  // rather than a whole separate "indoor vs outdoor" axis (which would need
  // image classification we don't do server-side), the exterior cases fold
  // into this SAME room-type axis: it already answers "what kind of space is
  // this photo of", and facade/garden/terrace are just more answers to that
  // one question. Zero new UI surface, zero new mode. ─────────────────────
  Object.freeze({
    key: 'gevel',
    label: 'Gevel',
    promptFragment:
      'This is a building facade / exterior front — focus on the facade material, windows, ' +
      'front door and roofline; do not add interior furniture',
  }),
  Object.freeze({
    key: 'tuin',
    label: 'Tuin',
    promptFragment:
      'This is a garden — focus on landscaping, planting and garden features; do not add ' +
      'interior furniture or structural building changes',
  }),
  Object.freeze({
    key: 'terras',
    label: 'Terras',
    promptFragment:
      'This is a terrace/patio — focus on outdoor flooring, outdoor furniture and ambiance; do ' +
      'not add interior furniture',
  }),
]);
const ROOM_TYPE_KEYS = ROOM_TYPES.map((r) => r.key);

// ── Furniture amount (data-driven, same pattern as ROOM_TYPES) ─────────────
// Extends the pre-existing style axis rather than replacing it: a style like
// "modern" or "landelijk" already implies SOME furniture, but says nothing
// about HOW MUCH. This is a THIRD, orthogonal, optional axis. Empty key =
// "Automatisch" = let the style/room fragments speak for themselves, the
// pre-existing behaviour. See buildTransformPrompt()'s staging/empty
// contradiction guard below for the one combination this can't express.
const FURNITURE_LEVELS = Object.freeze([
  Object.freeze({
    key: 'empty',
    label: 'Leeg',
    promptFragment:
      'Furniture level: show the room completely EMPTY — remove any existing furniture and do ' +
      'not add new furniture, only the empty architectural space',
  }),
  Object.freeze({
    key: 'light',
    label: 'Licht ingericht',
    promptFragment:
      'Furniture level: LIGHTLY staged — a few key pieces only (e.g. a rug, one seating item, ' +
      'minimal styling), leaving the space feeling open and uncluttered',
  }),
  Object.freeze({
    key: 'full',
    label: 'Volledig ingericht',
    promptFragment:
      'Furniture level: FULLY furnished — a complete, tastefully furnished room with all the ' +
      'furniture pieces you would expect for this room type',
  }),
]);
const FURNITURE_LEVEL_KEYS = FURNITURE_LEVELS.map((f) => f.key);

// ── Wall finish + curated colour palette ────────────────────────────────
// Free-text colour was deliberately NOT offered (task constraint): an open
// field invites prompts that fight the model ("aggressive neon pink accent
// wall with gold veins" is a real thing a client would type). A small
// curated palette gives control without that risk; the optional short note
// is a NUANCE on the chosen swatch ("iets warmer", "met een accentwand"),
// not a replacement for it — see buildTransformPrompt() for how it's scoped
// into the prompt so it can't hijack the rest of the composition.
const WALL_FINISHES = Object.freeze([
  Object.freeze({ key: 'painted', label: 'Geschilderd', promptFragment: 'Walls: freshly painted' }),
  Object.freeze({
    key: 'wallpaper',
    label: 'Behang',
    promptFragment: 'Walls: tasteful, subtle wallpaper (small pattern or texture, not overwhelming)',
  }),
  Object.freeze({
    key: 'brick',
    label: 'Zichtbare baksteen',
    promptFragment: 'Walls: exposed brick, cleaned and in good condition',
  }),
  Object.freeze({
    key: 'plaster',
    label: 'Pleisterwerk',
    promptFragment: 'Walls: smooth plastered finish, natural unpainted plaster tone',
  }),
]);
const WALL_FINISH_KEYS = WALL_FINISHES.map((w) => w.key);

// Only meaningful when wallFinish === 'painted' — see buildTransformPrompt().
const WALL_COLORS = Object.freeze([
  Object.freeze({ key: 'white', label: 'Wit', promptFragment: 'crisp white' }),
  Object.freeze({ key: 'offwhite', label: 'Gebroken wit', promptFragment: 'warm off-white / broken white' }),
  Object.freeze({ key: 'greige', label: 'Lichtgrijs', promptFragment: 'light warm grey' }),
  Object.freeze({ key: 'sand', label: 'Zandbeige', promptFragment: 'soft sand/beige' }),
  Object.freeze({ key: 'sage', label: 'Zachtgroen', promptFragment: 'muted soft sage green' }),
  Object.freeze({
    key: 'navy',
    label: 'Marineblauw (accentmuur)',
    promptFragment: 'navy blue on one accent wall, the other walls a neutral off-white',
  }),
]);
const WALL_COLOR_KEYS = WALL_COLORS.map((c) => c.key);
const MAX_WALL_COLOR_NOTE_LENGTH = 80; // short nuance, not a second custom-prompt field

// ── Floor (data-driven) ─────────────────────────────────────────────────
const FLOOR_TYPES = Object.freeze([
  Object.freeze({ key: 'wood', label: 'Hout', promptFragment: 'Floor: natural wood flooring (warm tone, visible grain)' }),
  Object.freeze({ key: 'laminate', label: 'Laminaat', promptFragment: 'Floor: laminate flooring, clean and even' }),
  Object.freeze({ key: 'tile', label: 'Tegels', promptFragment: 'Floor: tiled flooring, large-format and neutral-toned' }),
  Object.freeze({ key: 'concrete', label: 'Beton', promptFragment: 'Floor: polished concrete / microcement flooring, contemporary look' }),
  Object.freeze({ key: 'carpet', label: 'Tapijt', promptFragment: 'Floor: soft carpet flooring in a neutral tone' }),
]);
const FLOOR_TYPE_KEYS = FLOOR_TYPES.map((f) => f.key);

// ── Lighting / mood (data-driven) ───────────────────────────────────────
const LIGHTING_MOODS = Object.freeze([
  Object.freeze({ key: 'daylight', label: 'Daglicht', promptFragment: 'Lighting: bright natural daylight, as if photographed on a clear day' }),
  Object.freeze({
    key: 'warm-evening',
    label: 'Warm avondlicht',
    promptFragment: 'Lighting: warm evening ambiance, soft warm-toned lamps switched on, cozy mood',
  }),
  Object.freeze({
    key: 'bright-neutral',
    label: 'Helder neutraal',
    promptFragment: 'Lighting: bright, neutral, evenly-lit — a clean, true-to-colour real-estate-listing look',
  }),
]);
const LIGHTING_MOOD_KEYS = LIGHTING_MOODS.map((l) => l.key);

// ── Renovation depth — NOT optional/automatic like the axes above, and
// deliberately so. This is the one axis the task flags as legally and
// commercially loaded: a "light refresh" of a livable room is honest
// marketing, a "full renovation" of the same room is a much bigger leap
// from reality. Defaulting this to a hidden "let the AI decide" would mean
// nobody ever explicitly chose how far the visualisation should go — so
// instead it's a REQUIRED field with an honest default baked into
// api/leads.js's handler ('light' when the client sends nothing), and the
// dashboard pre-selects "Lichte opfrisbeurt" so a client still reaches a
// result in the same two clicks, but never silently ends up with a "full
// renovation" claim they didn't choose. See buildImageRecord()'s
// renovationDepthLabel (always persisted/shown — never a silent choice)
// and the dashboard's honesty note shown when "full" is selected.
const RENOVATION_DEPTHS = Object.freeze([
  Object.freeze({
    key: 'light',
    label: 'Lichte opfrisbeurt',
    promptFragment:
      'Renovation depth: LIGHT REFRESH ONLY — keep the existing layout, structure, windows, doors ' +
      'and major fixtures fully intact and recognizable; only cosmetic changes (paint, flooring ' +
      'finish, styling, small fixtures), nothing structural, nothing that implies construction work',
  }),
  Object.freeze({
    key: 'full',
    label: 'Volledige renovatie',
    promptFragment:
      'Renovation depth: FULL RENOVATION — you may show a comprehensively updated space (new ' +
      'kitchen units, new bathroom fixtures, modernized finishes throughout) as an aspirational ' +
      'visualisation, while still respecting the room\'s true layout, proportions and window/door ' +
      'positions — this must read as a possibility, not a literal construction promise',
  }),
]);
const RENOVATION_DEPTH_KEYS = RENOVATION_DEPTHS.map((r) => r.key);
const DEFAULT_RENOVATION_DEPTH = 'light';

// THE mandatory AI-content disclaimer. Single constant — see file header.
const AI_DISCLAIMER_LABEL = 'AI-visualisatie — werkelijke staat van de woning kan afwijken';

// DEVIATION FROM THE VPS REFERENCE, DELIBERATE: vps's property-upload mode
// caps at 10MB because it receives the file as a multipart stream straight
// into Express — no practical ceiling below Node's own limits. This route
// receives the same upload as a base64 data: URL inside a plain JSON POST
// body to a Vercel serverless function, which has a hard ~4.5MB REQUEST
// BODY limit at the platform level (Vercel closes the connection with a 413
// before this file's code ever runs — no error message of ours would even
// be seen). Base64 inflates size by ~4/3, so the decoded-buffer cap has to
// leave room for that inflation plus the small amount of JSON structure
// around it. 3MB decoded -> ~4.19MB base64, leaving ~300KB of headroom
// under the platform ceiling. A literal 10MB cap would silently break the
// feature for most real phone photos (routinely 3-8MB) — matching the
// number, not the intent, would ship something broken. The dashboard
// compensates with automatic client-side downscaling (see dashboard.js's
// handlePiFile()) so a user can still pick any photo; they never have to
// know this limit exists.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

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
function getRoomTypeByKey(key) {
  return ROOM_TYPES.find((r) => r.key === key) || null;
}
// Empty string is explicitly valid — it means "automatisch" (no room-type
// fragment added, AI infers the room from the photo), the pre-existing
// behaviour before room types were added. Only a non-empty, UNRECOGNIZED
// key is rejected.
function isValidRoomTypeKey(key) {
  const s = String(key || '');
  return s === '' || ROOM_TYPE_KEYS.includes(s);
}

// ── New axes' getters/validators — all follow the EXACT same "empty string
// = automatisch, only an unrecognized non-empty key is rejected" contract
// as ROOM_TYPES above, with the single exception of renovationDepth (see
// its own comment: it is required, not optional). ──────────────────────
function getFurnitureLevelByKey(key) {
  return FURNITURE_LEVELS.find((f) => f.key === key) || null;
}
function isValidFurnitureKey(key) {
  const s = String(key || '');
  return s === '' || FURNITURE_LEVEL_KEYS.includes(s);
}
function getWallFinishByKey(key) {
  return WALL_FINISHES.find((w) => w.key === key) || null;
}
function isValidWallFinishKey(key) {
  const s = String(key || '');
  return s === '' || WALL_FINISH_KEYS.includes(s);
}
function getWallColorByKey(key) {
  return WALL_COLORS.find((c) => c.key === key) || null;
}
function isValidWallColorKey(key) {
  const s = String(key || '');
  return s === '' || WALL_COLOR_KEYS.includes(s);
}
function getFloorTypeByKey(key) {
  return FLOOR_TYPES.find((f) => f.key === key) || null;
}
function isValidFloorKey(key) {
  const s = String(key || '');
  return s === '' || FLOOR_TYPE_KEYS.includes(s);
}
function getLightingMoodByKey(key) {
  return LIGHTING_MOODS.find((l) => l.key === key) || null;
}
function isValidLightingKey(key) {
  const s = String(key || '');
  return s === '' || LIGHTING_MOOD_KEYS.includes(s);
}
function getRenovationDepthByKey(key) {
  return RENOVATION_DEPTHS.find((r) => r.key === key) || null;
}
// NOT optional — see RENOVATION_DEPTHS's header comment. Empty string is
// REJECTED here (unlike every other axis above); api/leads.js's handler is
// what supplies the 'light' default before validation ever runs, so a
// caller that sends nothing still gets the honest default rather than a 400.
function isValidRenovationDepthKey(key) {
  return RENOVATION_DEPTH_KEYS.includes(String(key || ''));
}

// Builds the OpenAI prompt. customPrompt is appended, never substituted —
// a client can add detail but never drop the base style guidance entirely.
// Caller is responsible for trimming/length-capping customPrompt already
// (see api/leads.js's 'property-generate' handler); this only assembles text.
// roomType and every key inside `options` are optional (each follows the
// ROOM_TYPES "empty = automatisch" contract) except options.renovationDepth,
// which api/leads.js's handler always supplies (defaulted to 'light' if the
// caller sent nothing) — this function still falls back to the same default
// defensively, so it can never silently drop the renovation-depth guidance.
//
// Composition order matters for how an image model weighs instructions:
// style -> room -> furniture -> walls -> floor -> lighting -> renovation
// depth -> free-text custom instructions LAST. Free text stays last exactly
// as before this change (append, never substitute) so a client can add
// nuance but never override the structured, validated choices above it.
//
// CONTRADICTION HANDLING: the one combination that can't be expressed
// sensibly is style 'staging' (whose entire purpose is "furnish this empty
// room") together with furniture level 'empty' (whose entire purpose is
// "leave it empty") — those two directly cancel out. Rather than emit both
// contradictory instructions and hope the model picks one, the furniture
// selection is ignored in that one case (falls back to "automatisch", i.e.
// let the staging style's own furnishing guidance stand). This is defense
// in depth: the dashboard's UI also disables the "Leeg" furniture chip
// whenever the Staging style is active (see dashboard.js's
// renderPiFurnitureGrid()), so a normal user never reaches this branch —
// it only matters for a direct API call that bypasses the UI.
/* ── Client-customisable axes, added after the original eight ───────────────
 * The engine preamble is fixed law. THESE are the dials a client turns inside
 * it — §15 of the engine spec ("treat user-selected parameters as explicit
 * instructions") made real.
 *
 * ── Why this block is data and the original eight are not ──────────────────
 * The first eight axes (style, room, furniture, walls, wall colour, floor,
 * lighting, depth) each carry a special case: wall colour only applies to a
 * painted finish, staging overrides an empty-furniture request, renovation
 * depth has a non-empty default. They are hand-composed above and left alone,
 * because rewriting a working money path to save future typing is a bad trade.
 *
 * Everything from here on is uniform — a key, a list, one prompt clause — so
 * it lives in a registry instead. Adding "and more" later is one array entry:
 * validation, the composed prompt, and Faro's tool schema all read from this,
 * so nothing else has to be touched.
 */
const PALETTES = Object.freeze([
  Object.freeze({ key: 'warm-neutral', label: 'Warm neutraal', promptFragment: 'a warm neutral palette — creams, soft beiges, warm greys' }),
  Object.freeze({ key: 'cool-neutral', label: 'Koel neutraal', promptFragment: 'a cool neutral palette — crisp whites, cool greys, soft blacks' }),
  Object.freeze({ key: 'earth',        label: 'Aardetinten',   promptFragment: 'an earth-tone palette — terracotta, ochre, clay, olive, warm browns' }),
  Object.freeze({ key: 'monochrome',   label: 'Monochroom',    promptFragment: 'a monochrome palette — a single hue family from light to dark' }),
  Object.freeze({ key: 'natural',      label: 'Natuurlijk',    promptFragment: 'a natural palette drawn from raw materials — wood, stone, linen, unpainted textures' }),
  Object.freeze({ key: 'bold-accent',  label: 'Met accentkleur', promptFragment: 'a restrained neutral base with one confident accent colour used sparingly' }),
]);

const VIBES = Object.freeze([
  Object.freeze({ key: 'serene',    label: 'Sereen',        promptFragment: 'a calm, serene atmosphere — uncluttered, quiet, restful' }),
  Object.freeze({ key: 'cozy',      label: 'Knus',          promptFragment: 'a cozy, inviting atmosphere — soft textiles, warm light, a lived-in comfort' }),
  Object.freeze({ key: 'airy',      label: 'Licht en ruim', promptFragment: 'an airy, open atmosphere — light, space, minimal visual weight' }),
  Object.freeze({ key: 'dramatic',  label: 'Dramatisch',    promptFragment: 'a dramatic atmosphere — deep contrast, strong shadow, a sense of occasion' }),
  Object.freeze({ key: 'boutique',  label: 'Boutique hotel', promptFragment: 'a boutique-hotel atmosphere — considered, tailored, quietly expensive' }),
  Object.freeze({ key: 'timeless',  label: 'Tijdloos',      promptFragment: 'a timeless atmosphere — classic proportions and materials that will not date' }),
]);

const MATERIAL_ACCENTS = Object.freeze([
  Object.freeze({ key: 'oak',        label: 'Eik',          promptFragment: 'light oak as the dominant material accent' }),
  Object.freeze({ key: 'walnut',     label: 'Noten',        promptFragment: 'dark walnut as the dominant material accent' }),
  Object.freeze({ key: 'marble',     label: 'Marmer',       promptFragment: 'marble as the dominant material accent, with believable natural veining' }),
  Object.freeze({ key: 'stone',      label: 'Natuursteen',  promptFragment: 'natural stone as the dominant material accent, with genuine variation' }),
  Object.freeze({ key: 'concrete',   label: 'Beton',        promptFragment: 'polished concrete as the dominant material accent' }),
  Object.freeze({ key: 'brass',      label: 'Messing',      promptFragment: 'brass detailing as the dominant metal accent' }),
  Object.freeze({ key: 'matte-black',label: 'Mat zwart',    promptFragment: 'matte black metalwork as the dominant hardware accent' }),
  Object.freeze({ key: 'rattan',     label: 'Rotan',        promptFragment: 'rattan and woven natural fibre as a recurring material accent' }),
]);

/* Only meaningful for exterior shots — gevel, tuin, terras. Applied regardless
 * of room type, because the model can see whether it is outdoors and the engine
 * preamble already forbids inventing a garden that is not there. */
const LANDSCAPING_STYLES = Object.freeze([
  Object.freeze({ key: 'mediterranean', label: 'Mediterraan',  promptFragment: 'Mediterranean landscaping — olive, lavender, gravel, terracotta, sun-tolerant planting' }),
  Object.freeze({ key: 'modern-minimal',label: 'Modern strak', promptFragment: 'modern minimal landscaping — clean lines, architectural planting, large-format paving' }),
  Object.freeze({ key: 'japanese',      label: 'Japans',       promptFragment: 'Japanese-inspired landscaping — moss, acer, stone, water, deliberate restraint' }),
  Object.freeze({ key: 'cottage',       label: 'Landelijk',    promptFragment: 'cottage landscaping — layered borders, informal planting, natural materials' }),
  Object.freeze({ key: 'lush',          label: 'Weelderig',    promptFragment: 'lush green landscaping — dense foliage, generous planting, a mature garden feel' }),
]);

/*
 * The registry. Each entry composes exactly one clause. `optional` axes accept
 * an empty value meaning "the AI decides", which is the same contract the
 * original eight use.
 */
const EXTRA_AXES = Object.freeze([
  Object.freeze({ key: 'palette',     list: PALETTES,           label: 'Kleurenpalet',     clause: 'Colour palette' }),
  Object.freeze({ key: 'vibe',        list: VIBES,              label: 'Sfeer',            clause: 'Atmosphere' }),
  Object.freeze({ key: 'material',    list: MATERIAL_ACCENTS,   label: 'Materiaal',        clause: 'Materials' }),
  Object.freeze({ key: 'landscaping', list: LANDSCAPING_STYLES, label: 'Tuinstijl',        clause: 'Landscaping' }),
]);

/* Free text, not a list — "de open haard", "het behang in de gang". Capped for
 * the same reason wallColorNote is: this text reaches a paid API. */
const MAX_OBJECT_NOTE_LENGTH = 120;
const OBJECT_AXES = Object.freeze([
  Object.freeze({ key: 'preserve', label: 'Behouden',  clause: 'PRESERVE EXACTLY, do not alter' }),
  Object.freeze({ key: 'remove',   label: 'Verwijderen', clause: 'REMOVE from the scene, replacing it with what would plausibly be there instead' }),
  Object.freeze({ key: 'add',      label: 'Toevoegen', clause: 'ADD to the scene, placed where it could physically exist' }),
]);

function axisByKey(list, key) {
  return list.find((x) => x.key === key) || null;
}

/** True for '' (automatisch) or a known key. Mirrors the original axes' contract. */
function isValidExtraAxis(axisKey, value) {
  const axis = EXTRA_AXES.find((a) => a.key === axisKey);
  if (!axis) return false;
  const v = value === undefined || value === null ? '' : String(value).trim();
  return v === '' || Boolean(axisByKey(axis.list, v));
}

/** Compose the extra axes into prompt clauses. Empty axes contribute nothing. */
function buildExtraClauses(opts = {}) {
  const parts = [];
  for (const axis of EXTRA_AXES) {
    const hit = axisByKey(axis.list, String(opts[axis.key] || '').trim());
    if (hit) parts.push(` ${axis.clause}: ${hit.promptFragment}.`);
  }
  for (const axis of OBJECT_AXES) {
    const note = opts[axis.key] ? String(opts[axis.key]).trim().slice(0, MAX_OBJECT_NOTE_LENGTH) : '';
    if (note) parts.push(` ${axis.clause}: ${note}.`);
  }
  return parts.join('');
}


/* ── The transformation engine preamble ─────────────────────────────────────
 * Prepended to EVERY property-image prompt, unconditionally. It is not
 * configurable and no caller can opt out — that is the point. The axis-driven
 * text below it says *what* to change; this says what must never change, and
 * the failure mode it prevents is the expensive one: a beautiful image of a
 * house that is not the client's house. An agent cannot show that to a seller.
 *
 * Ordering is deliberate and matters more than it looks. The engine rules come
 * FIRST as standing law, the composed axes next, and the user's own sentence
 * LAST — image models weight the end of a prompt most heavily, so the specific
 * request stays dominant while the constraints remain in force.
 */
const TRANSFORM_ENGINE = [
  'UNIVERSAL PROPERTY TRANSFORMATION ENGINE.',
  'You are a visual transformation engine for real estate, architecture, interior and exterior design, landscaping and renovation. The uploaded image is the SOURCE OF TRUTH.',

  '1. UNDERSTAND FIRST. Identify property type, interior or exterior, room type, structure, walls, floors, ceilings, windows, doors, roof, facade, garden, driveway, terrace, pool, landscaping, furniture, fixtures, lighting, architectural details, materials, perspective, camera position, camera height, camera angle and visible proportions. Classify every element as STRUCTURAL (defines the property), RENOVATABLE (can realistically be replaced or remodeled) or DECORATIVE (furniture, plants, lighting, finishes, styling). Never treat the whole image as freely regenerable.',

  '2. PRESERVE THE PROPERTY. Unless structural change is explicitly requested, preserve architecture, building footprint, room dimensions, wall positions, ceiling height, window locations and proportions, door locations and openings, roof structure, major architectural features, garden and property boundaries, pool/driveway/terrace locations, overall composition, camera position, camera height, camera angle, perspective and framing. The result must be the SAME real property after transformation. Do not create a different house, room, garden or property.',

  "3. THE USER'S REQUEST HAS HIGHEST PRIORITY. Carry it out fully, within the physical logic of the existing property.",

  '4. DO NOT OVER-TRANSFORM. Change only what was asked. If one area is requested, keep unrelated areas as close to the original as possible. Never move windows, alter room dimensions, add rooms, change the exterior when only an interior was requested, change the camera, or invent architectural features.',

  '5. STYLE INTERPRETATION. Translate a requested style into coherent architecture, materials, colour palette, furniture, lighting and landscaping at the property\'s real scale. Never interpret a style so literally that the property becomes unrealistic.',

  '6. INTERIORS. Preserve room geometry, windows, doors, ceiling, perspective and natural light direction. Transform furniture, flooring, wall and ceiling finishes, lighting, curtains, rugs, cabinetry, fixtures, decoration, artwork, colours and materials when asked. Furniture must have realistic scale, weight, placement, floor contact, clearance and function, and walking paths must stay usable.',

  '7. EXTERIORS. Preserve the fundamental structure unless architectural change is requested. Facade materials, paint, cladding, windows, doors, exterior lighting, garage door, balconies, railings, landscaping, driveway, outdoor furniture and decorative elements may change. Keep construction, structural connections, material transitions, shadows, reflections, perspective and scale realistic. It must still clearly be the same house.',

  '8. GARDENS AND LANDSCAPE. Respect existing boundaries, terrain, trees, plants, paths, patios, terraces, pools, fences, walls and driveways, then transform as requested. All landscaping must obey realistic scale, terrain, shadows, plant growth, perspective and spatial limits. Never place an object where it could not physically exist.',

  '9. ADDING ELEMENTS. Choose the most logical physical location. Anything added must fit the available space, match the perspective, have realistic dimensions, cast correct shadows, interact correctly with its surroundings, sit properly on surfaces, match the requested style, and look constructed rather than pasted.',

  '10. VISUALIZATION STANDARD. Produce a photorealistic, professionally composed, architecturally believable, naturally lit result at realistic scale with realistic materials. Avoid a CGI look, plastic textures, excessive sharpness, artificial lighting, floating objects, distorted geometry, impossible architecture, repeated textures, unrealistic plants, wrong shadows or reflections, warped windows or doors, random objects and oversized furniture.',

  '11. CAMERA. Unless a different view is explicitly requested, KEEP THE ORIGINAL CAMERA: position, height, angle, lens perspective, field of view, framing, horizon and image proportions. It must look like the same photograph taken before and after the renovation.',

  '12. LIGHTING. Respect the original sun direction, window illumination, shadow direction, ambient light and the interior/exterior brightness relationship unless a different scenario is requested. Integrate any added artificial light naturally.',

  '13. MATERIALS. Every material needs believable texture, roughness, reflection, depth, scale, wear and contact shadows. Wood looks like wood, stone varies naturally, glass reflects and transmits correctly, metal reflects realistically, fabric has subtle texture. Avoid perfect computer-generated surfaces.',

  '14. BEFORE AND AFTER. A person must be able to say with confidence: this is the same property, renovated. Do not optimise for the most impressive image. Optimise for the most believable transformation of the actual property.',

  '15. EXPLICIT PARAMETERS. Any style, palette, material, renovation intensity, room type, landscaping style, furniture style, lighting style, or object to add, remove or preserve given below is an explicit instruction. Never override one unless it would be physically impossible.',

  '16. FINAL CHECK. Before producing the image verify: is it clearly the same property; is the perspective preserved; are proportions correct; are windows and doors correctly positioned; are new objects physically possible; are materials realistic; is lighting consistent; are shadows believable; is furniture correctly scaled; does it follow the request; did anything unrelated change unnecessarily; does it look like professional real-estate visualization. Correct anything that fails before producing the final result.',

  'CORE PRINCIPLE: TRANSFORM THE PROPERTY, DO NOT REINVENT THE PROPERTY. Preserve what makes it physically identifiable and transform only what was asked.',
].join('\n\n');


function buildTransformPrompt(styleKey, customPrompt, roomTypeKey, options) {
  const opts = options || {};
  const style = getStyleByKey(styleKey);
  const base = style
    ? `Transform this real estate photo into a photorealistic visualisation showing ${style.promptFragment}. ` +
      'Keep the room layout, walls, windows, and camera angle recognizable — this is a renovation/staging ' +
      'visualisation of the SAME space, not a different building.'
    : 'Transform this real estate photo into a photorealistic renovated visualisation, keeping the room layout ' +
      'and camera angle recognizable.';
  const room = getRoomTypeByKey(roomTypeKey);
  const roomPart = room ? ` ${room.promptFragment}.` : '';

  const furnitureKey = (styleKey === 'staging' && opts.furniture === 'empty') ? '' : (opts.furniture || '');
  const furniture = getFurnitureLevelByKey(furnitureKey);
  const furniturePart = furniture ? ` ${furniture.promptFragment}.` : '';

  const wallFinish = getWallFinishByKey(opts.wallFinish);
  let wallPart = '';
  if (wallFinish) {
    let wallText = wallFinish.promptFragment;
    if (wallFinish.key === 'painted') {
      const color = getWallColorByKey(opts.wallColor);
      const note = opts.wallColorNote ? String(opts.wallColorNote).trim().slice(0, MAX_WALL_COLOR_NOTE_LENGTH) : '';

      // Three cases, and the middle one used to be wrong in a way that quietly
      // ruined the request. WALL_COLORS holds six keys; anything outside them —
      // "terracotta", "RAL 7016", "dezelfde tint als de kastjes" — arrives only
      // as a note. The old text emitted "in a fitting neutral tone (client
      // nuance on the colour: terracotta)", which tells the image model
      // NEUTRAL first and treats the actual request as a footnote. Terracotta
      // is not neutral, and the output showed it.
      //
      // A note with no key colour IS the colour, so it is stated as one. The
      // fallback to neutral now only applies when the caller genuinely said
      // nothing about colour at all.
      if (color && note) {
        wallText += `, in ${color.promptFragment} (client nuance on the colour: ${note})`;
      } else if (color) {
        wallText += `, in ${color.promptFragment}`;
      } else if (note) {
        wallText += `, in exactly this colour as described by the client: ${note}`;
      } else {
        wallText += ', in a fitting neutral tone';
      }
    }
    wallPart = ` ${wallText}.`;
  }

  const floor = getFloorTypeByKey(opts.floor);
  const floorPart = floor ? ` ${floor.promptFragment}.` : '';

  const lighting = getLightingMoodByKey(opts.lighting);
  const lightingPart = lighting ? ` ${lighting.promptFragment}.` : '';

  const renovationDepth = getRenovationDepthByKey(opts.renovationDepth) || getRenovationDepthByKey(DEFAULT_RENOVATION_DEPTH);
  const renovationPart = ` ${renovationDepth.promptFragment}.`;

  const extraPart = buildExtraClauses(opts);
  const composed = `${base}${roomPart}${furniturePart}${wallPart}${floorPart}${lightingPart}${renovationPart}${extraPart}`;
  const extra = customPrompt ? String(customPrompt).trim() : '';
  const request = extra ? `${composed}\n\nEXPLICIT CLIENT REQUEST (highest priority): ${extra}` : composed;

  // Engine rules first as standing law, the request last so it stays dominant.
  return `${TRANSFORM_ENGINE}\n\n── THIS TRANSFORMATION ──\n${request}`;
}

// ── Config / fail-soft helpers ──────────────────────────────────────────
function openaiKey() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI || '';
}
// Blob storage is reachable either way: the legacy long-lived
// BLOB_READ_WRITE_TOKEN, or Vercel's OIDC flow (BLOB_STORE_ID plus the
// VERCEL_OIDC_TOKEN the runtime injects), which is the direction Vercel
// has moved to and needs no stored secret at all. Accept both so removing
// the long-lived token never silently kills image generation.
function blobStorageConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL_OIDC_TOKEN);
}
function isConfigured() {
  return !!(openaiKey() && blobStorageConfigured());
}
// Clear, specific message per missing piece — never a generic 500, never a
// crash. Returned to the client as-is (Dutch, matches the rest of this app).
function missingConfigMessage() {
  if (!openaiKey()) return 'AI-beeldgeneratie is nog niet geconfigureerd (ontbrekende OpenAI-sleutel). Neem contact op met Helvaro.';
  if (!blobStorageConfigured()) return 'AI-beeldgeneratie is nog niet geconfigureerd (ontbrekende opslag). Neem contact op met Helvaro.';
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
  if (!blobStorageConfigured()) {
    throw new ImageFeatureError(missingConfigMessage(), { code: 'no_blob_token', status: 503 });
  }
  const ext = (contentType || '').includes('png') ? 'png' : (contentType || '').includes('webp') ? 'webp' : 'jpg';
  const safeProject = String(projectCode || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'unknown';
  const safeKind = kind === 'source' ? 'source' : 'result';
  const filename = `property/${safeProject}/${safeKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // Only pass an explicit token when the legacy one is actually set. With
  // it omitted the SDK resolves credentials through OIDC, so this same code
  // keeps working after BLOB_READ_WRITE_TOKEN is deleted from the project.
  const putOpts = {
    access: 'public',
    contentType: contentType || 'image/png',
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) putOpts.token = process.env.BLOB_READ_WRITE_TOKEN;
  const blob = await put(filename, buffer, putOpts);
  return (blob.url || '').slice(0, 500);
}

// ── OpenAI images/edits call. Never throws a raw error to the caller —
// every failure path is a typed ImageFeatureError with a Dutch, user-safe
// message and an appropriate HTTP status, so api/leads.js's handler can
// relay it directly without leaking API internals. ──────────────────────
async function generatePropertyImage({
  imageBuffer, imageMimeType, style, customPrompt, roomType,
  furniture, wallFinish, wallColor, wallColorNote, floor, lighting, renovationDepth,
}) {
  const key = openaiKey();
  if (!key) throw new ImageFeatureError(missingConfigMessage(), { code: 'no_api_key', status: 503 });
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new ImageFeatureError('Geen geldige afbeelding meegegeven.', { code: 'invalid_image', status: 400 });
  }

  const prompt = buildTransformPrompt(style, customPrompt, roomType, {
    furniture, wallFinish, wallColor, wallColorNote, floor, lighting, renovationDepth,
  });
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
// sourceUrl is OPTIONAL and purely additive (the original uploaded photo,
// also blob-stored — see api/leads.js's 'property-generate' handler): it
// enables the dashboard's before/after comparison slider, download, and PDF
// export to keep working from history, not just the just-generated result.
// Never required — a record with no sourceUrl (e.g. one persisted before
// this addition) still renders fine, just without a comparison view.
function buildImageRecord({
  url, style, customPrompt, roomType, sourceUrl,
  furniture, wallFinish, wallColor, wallColorNote, floor, lighting, renovationDepth,
}) {
  const styleObj = getStyleByKey(style);
  const roomObj = getRoomTypeByKey(roomType);
  const furnitureObj = getFurnitureLevelByKey(furniture);
  const wallFinishObj = getWallFinishByKey(wallFinish);
  // Colour is only meaningful when the finish is 'painted' — see
  // buildTransformPrompt(); a stray wallColor sent alongside a different
  // finish is simply not resolved here (getWallColorByKey still validates
  // it against the real palette, but it's never shown/used unless finish
  // is 'painted', matching how the prompt itself ignores it in that case).
  const wallColorObj = wallFinishObj && wallFinishObj.key === 'painted' ? getWallColorByKey(wallColor) : null;
  const floorObj = getFloorTypeByKey(floor);
  const lightingObj = getLightingMoodByKey(lighting);
  const renovationObj = getRenovationDepthByKey(renovationDepth) || getRenovationDepthByKey(DEFAULT_RENOVATION_DEPTH);
  return {
    url: String(url || '').slice(0, 500),
    sourceUrl: sourceUrl ? String(sourceUrl).slice(0, 500) : '',
    style: styleObj ? styleObj.key : 'custom',
    styleLabel: styleObj ? styleObj.label : 'Aangepast',
    roomType: roomObj ? roomObj.key : '',
    roomTypeLabel: roomObj ? roomObj.label : '',
    furniture: furnitureObj ? furnitureObj.key : '',
    furnitureLabel: furnitureObj ? furnitureObj.label : '',
    wallFinish: wallFinishObj ? wallFinishObj.key : '',
    wallFinishLabel: wallFinishObj ? wallFinishObj.label : '',
    wallColor: wallColorObj ? wallColorObj.key : '',
    wallColorLabel: wallColorObj ? wallColorObj.label : '',
    wallColorNote: wallColorObj && wallColorNote ? String(wallColorNote).slice(0, MAX_WALL_COLOR_NOTE_LENGTH) : '',
    floor: floorObj ? floorObj.key : '',
    floorLabel: floorObj ? floorObj.label : '',
    lighting: lightingObj ? lightingObj.key : '',
    lightingLabel: lightingObj ? lightingObj.label : '',
    renovationDepth: renovationObj.key,
    renovationDepthLabel: renovationObj.label,
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

/* ── The one place a property image is generated ────────────────────────────
 * Extracted verbatim from api/leads.js's 'property-generate' block so that the
 * CRM page and Faro's chat share ONE implementation of it.
 *
 * That mattered as soon as generation moved into the chat. There are now two
 * callers, and every one of the steps below is either a validation that keeps
 * a bad request from reaching a paid API, or a guard on money:
 *   - eight option-axis validations
 *   - upload parsing, capped at 3MB DECODED (Vercel's ~4.5MB request limit)
 *   - isConfigured() fail-soft, BEFORE any credit check or paid call
 *   - a credit check that BLOCKS when over the limit, before OpenAI is called
 *   - flat-weight usage recording after success
 * Two copies of that will drift, and the copy that drifts is the one that
 * spends the client's money.
 *
 * Throws ImageFeatureError with a `status` for every failure case, so an HTTP
 * caller can map straight onto it and a non-HTTP caller (the chat tool) can
 * read `.message` without knowing about responses.
 *
 * @param {string} projectCode  tenant — from the session, never the caller's body
 * @param {object} input        the same field names api/leads.js accepted
 * @param {object} deps         { credits } — injected so this module does not
 *                              take a hard dependency on the credit system and
 *                              stays unit-testable without it
 * @returns {Promise<object>}   the persisted image record
 */
async function generateForClient(projectCode, input = {}, deps = {}) {
  const credits = deps.credits;
  if (!projectCode) throw new ImageFeatureError('Geen client context', { status: 403 });

  const style = String(input.style || '').trim();
  if (!isValidStyleKey(style)) {
    throw new ImageFeatureError(`Ongeldige stijl. Kies uit: ${PROPERTY_STYLES.map((s) => s.key).join(', ')}`, { status: 400 });
  }

  const roomType = input.roomType !== undefined ? String(input.roomType).trim() : '';
  if (!isValidRoomTypeKey(roomType)) {
    throw new ImageFeatureError(`Ongeldig kamertype. Kies uit: ${ROOM_TYPES.map((r) => r.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  const furniture = input.furniture !== undefined ? String(input.furniture).trim() : '';
  if (!isValidFurnitureKey(furniture)) {
    throw new ImageFeatureError(`Ongeldig meubelniveau. Kies uit: ${FURNITURE_LEVELS.map((f) => f.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  const wallFinish = input.wallFinish !== undefined ? String(input.wallFinish).trim() : '';
  if (!isValidWallFinishKey(wallFinish)) {
    throw new ImageFeatureError(`Ongeldige muurafwerking. Kies uit: ${WALL_FINISHES.map((w) => w.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  let wallColor = input.wallColor !== undefined ? String(input.wallColor).trim() : '';
  if (!isValidWallColorKey(wallColor)) {
    throw new ImageFeatureError(`Ongeldige muurkleur. Kies uit: ${WALL_COLORS.map((c) => c.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  let wallColorNote = input.wallColorNote !== undefined ? String(input.wallColorNote).trim().slice(0, 80) : '';
  // wallColor/wallColorNote only mean anything when wallFinish is 'painted' —
  // nulled otherwise so a stray value from a stale UI never persists a colour
  // that was never applied.
  if (wallFinish !== 'painted') { wallColor = ''; wallColorNote = ''; }

  const floor = input.floor !== undefined ? String(input.floor).trim() : '';
  if (!isValidFloorKey(floor)) {
    throw new ImageFeatureError(`Ongeldige vloer. Kies uit: ${FLOOR_TYPES.map((f) => f.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  const lighting = input.lighting !== undefined ? String(input.lighting).trim() : '';
  if (!isValidLightingKey(lighting)) {
    throw new ImageFeatureError(`Ongeldige lichtsfeer. Kies uit: ${LIGHTING_MOODS.map((l) => l.key).join(', ')} (of laat leeg voor automatisch)`, { status: 400 });
  }
  // NOT optional — a caller that sends nothing gets the honest default here,
  // BEFORE validation, so this never 400s for an omitted field.
  const renovationDepth = input.renovationDepth ? String(input.renovationDepth).trim() : DEFAULT_RENOVATION_DEPTH;
  if (!isValidRenovationDepthKey(renovationDepth)) {
    throw new ImageFeatureError(`Ongeldige renovatiediepte. Kies uit: ${RENOVATION_DEPTHS.map((r) => r.key).join(', ')}`, { status: 400 });
  }

  const customPrompt = input.customPrompt !== undefined ? String(input.customPrompt).trim().slice(0, 500) : '';

  // The client-customisable axes. Validated from the registry, so a new axis is
  // covered here the moment it is added to EXTRA_AXES — no edit at this call
  // site, which is what keeps "and more" from meaning "and more places to
  // forget a validator".
  const extra = {};
  for (const axis of EXTRA_AXES) {
    const v = input[axis.key] !== undefined ? String(input[axis.key]).trim() : '';
    if (!isValidExtraAxis(axis.key, v)) {
      throw new ImageFeatureError(
        `Ongeldige ${axis.label.toLowerCase()}. Kies uit: ${axis.list.map((x) => x.key).join(', ')} (of laat leeg voor automatisch)`,
        { status: 400 },
      );
    }
    extra[axis.key] = v;
  }
  for (const axis of OBJECT_AXES) {
    extra[axis.key] = input[axis.key] !== undefined
      ? String(input[axis.key]).trim().slice(0, MAX_OBJECT_NOTE_LENGTH) : '';
  }

  // Validate the upload BEFORE touching credits or OpenAI — never trust a
  // client-supplied filename/MIME, only the actual base64 payload.
  const uploaded = parseImageDataUrl(input.dataUrl);

  // Fail soft, clearly, BEFORE any credit check or paid call — a missing
  // OPENAI_API_KEY/BLOB_READ_WRITE_TOKEN must never surface as a 500.
  if (!isConfigured()) throw new ImageFeatureError(missingConfigMessage(), { status: 503 });

  // Discretionary AI (a marketing tool, not the lead-conversation promise
  // whatsapp.js protects) — BLOCK when over the limit, before the paid call.
  if (credits) {
    const check = await credits.checkCredits(projectCode, credits.FEATURES.IMAGE_GENERATION);
    if (!check.allowed) {
      throw new ImageFeatureError(check.message || 'Je AI-credits voor deze periode zijn op', {
        status: 402, code: 'credit_limit_reached',
      });
    }
  }

  // The paid edit and the (cheap, best-effort) upload of the ORIGINAL photo run
  // concurrently. The source upload NEVER fails the request: it only powers the
  // before/after comparison, and a Blob hiccup must not cost a generation the
  // client already paid credits for.
  const [generated, sourceUrl] = await Promise.all([
    generatePropertyImage({
      imageBuffer: uploaded.buffer,
      imageMimeType: uploaded.mimeType,
      style, customPrompt, roomType, furniture, wallFinish, wallColor,
      wallColorNote, floor, lighting, renovationDepth,
      ...extra,
    }),
    uploadPropertyImageToBlob(uploaded.buffer, uploaded.mimeType, projectCode, 'source').catch((err) => {
      console.error('[property-generate] source upload failed (non-fatal, no before/after history for this one):', err.message);
      return '';
    }),
  ]);

  const blobUrl = await uploadPropertyImageToBlob(generated.buffer, generated.mimeType, projectCode, 'result');
  if (!blobUrl) throw new ImageFeatureError('AI-beeld gegenereerd maar opslaan mislukt. Probeer opnieuw.', { status: 502 });

  const record = buildImageRecord({
    url: blobUrl, style, customPrompt, roomType, sourceUrl,
    furniture, wallFinish, wallColor, wallColorNote, floor, lighting, renovationDepth,
    ...extra,
  });
  appendPropertyImage(projectCode, record).catch(() => {});

  // Flat weight regardless of how many axes were touched — one generation, one
  // charge. Only `meta` grows, for reporting.
  if (credits) {
    credits.recordUsage(projectCode, credits.FEATURES.IMAGE_GENERATION, {
      credits: credits.WEIGHTS[credits.FEATURES.IMAGE_GENERATION],
      meta: { style, roomType, furniture, wallFinish, floor, lighting, renovationDepth, ...extra },
    }).catch(() => {});
  }

  return record;
}

module.exports = {
  PROPERTY_STYLES,
  ROOM_TYPES,
  PALETTES,
  VIBES,
  MATERIAL_ACCENTS,
  LANDSCAPING_STYLES,
  EXTRA_AXES,
  OBJECT_AXES,
  MAX_OBJECT_NOTE_LENGTH,
  isValidExtraAxis,
  buildExtraClauses,
  FURNITURE_LEVELS,
  WALL_FINISHES,
  WALL_COLORS,
  FLOOR_TYPES,
  LIGHTING_MOODS,
  RENOVATION_DEPTHS,
  DEFAULT_RENOVATION_DEPTH,
  AI_DISCLAIMER_LABEL,
  MAX_UPLOAD_BYTES,
  ImageFeatureError,
  getStyleByKey,
  isValidStyleKey,
  getRoomTypeByKey,
  isValidRoomTypeKey,
  getFurnitureLevelByKey,
  isValidFurnitureKey,
  getWallFinishByKey,
  isValidWallFinishKey,
  getWallColorByKey,
  isValidWallColorKey,
  getFloorTypeByKey,
  isValidFloorKey,
  getLightingMoodByKey,
  isValidLightingKey,
  getRenovationDepthByKey,
  isValidRenovationDepthKey,
  buildTransformPrompt,
  isConfigured,
  missingConfigMessage,
  parseImageDataUrl,
  uploadPropertyImageToBlob,
  generatePropertyImage,
  buildImageRecord,
  listPropertyImages,
  appendPropertyImage,
  generateForClient,
};
