'use strict';
/*
 * Faro — route-agnostic request handler.
 *
 * SCAFFOLD: dispatch, guards and validation are real; the handlers that need a
 * model or a database resolve to not-wired responses.
 *
 * ── Why the handler is separate from the route file ──────────────────────────
 * Vercel counts every non-underscore file in api/ as a deployed function, and
 * this project deliberately keeps that count low — api/_images.js's header
 * calls it out explicitly ("the route count stays at 11"), which is why the
 * property-image feature is dispatched through api/leads.js by `body.mode`
 * rather than getting a route of its own.
 *
 * Faro has a real reason to want its own route (it streams, and it
 * has a different timeout profile than lead CRUD), but that is a deployment
 * decision, not an architectural one. So all the logic lives here, in an
 * underscore module that is not a route, and there are two ways to serve it:
 *
 *   A. api/faro.js — a four-line route that calls this. One extra function.
 *   B. add `if (body.mode?.startsWith('faro-')) return require('./_faro/handler')…`
 *      to api/leads.js, exactly like the property-* modes. Zero extra functions.
 *
 * Both work unchanged against this file. Pick at wiring time; nothing below
 * has to change either way.
 *
 * ── Modes ────────────────────────────────────────────────────────────────────
 *   faro-chat            stream a turn                        (SSE)
 *   faro-confirm         execute a confirmed action           (JSON)
 *   faro-conversations   list / rename / favorite / delete    (JSON)
 *   faro-messages        rehydrate a conversation             (JSON)
 *   faro-projects        list / create / read a project       (JSON)
 *   faro-media           submit or poll an image/video job    (JSON)
 *   faro-context         what Faro can see              (JSON)
 */

const config       = require('./config');
const prompt       = require('./prompt');
const store        = require('./store');
const stream       = require('./stream');
const actions      = require('./actions');
const media        = require('./media');
const orchestrator = require('./orchestrator');
const _rl          = require('../_ratelimit');

/**
 * @param {object} req
 * @param {object} res
 * @param {object} auth  resolved session from the CALLING route:
 *                       { projectCode, userId, lang, isAdmin }
 *                       Never derived here — the route owns authentication,
 *                       this module owns behaviour.
 */
async function handle(req, res, auth) {
  if (!config.isEnabled()) {
    return res.status(404).json({ error: 'Niet beschikbaar' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!auth || !auth.projectCode) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const ctx = {
    projectCode: auth.projectCode,
    userId: auth.userId,
    lang: auth.lang || 'nl',
  };

  // Per-user rate limit. The credit system is the hard ceiling; this is the
  // cheap guard in front of it, same layering as api/_demo-chat.js.
  // Drie fouten stapelden hier op elkaar, met als netto effect dat de limiet
  // NOOIT afging:
  //   1. hit() is hit(bucket, id, limit, windowMs) — dit gaf drie argumenten,
  //      dus limit kreeg de venstergrootte en windowMs werd undefined. Met een
  //      ongedefinieerd venster is `now - t < undefined` altijd false, dus de
  //      teller kwam nooit boven 1.
  //   2. hit() geeft { limited, count } terug, geen boolean. `if (!ok)` op een
  //      object is per definitie false.
  //   3. het geheel zat achter configured(), dus zonder Upstash werd er sowieso
  //      niets geteld — terwijl hit() zelf al netjes terugvalt op een teller in
  //      het geheugen.
  // Dit is de enige rem vóór de modelaanroepen en de beeldgeneratie, en de laag
  // erachter (checkCredits) faalt open bij een Airtable-storing.
  const { LIMITS } = config;
  const rl = await _rl.hit('ai', `${ctx.projectCode}:${ctx.userId}`, LIMITS.rateLimitMax, LIMITS.rateLimitWindowMs);
  if (rl && rl.limited) {
    return res.status(429).json({ error: 'Te veel verzoeken. Probeer het zo weer.' });
  }

  switch (body.mode) {
    case 'faro-chat':          return chat(req, res, ctx, body);
    case 'faro-confirm':       return confirm(res, ctx, body);
    case 'faro-conversations': return conversations(res, ctx, body);
    case 'faro-messages':      return messages(res, ctx, body);
    case 'faro-projects':      return projects(res, ctx, body);
    case 'faro-media':         return mediaMode(res, ctx, body);
    case 'faro-context':       return res.status(200).json({ sources: prompt.contextSources() });
    default:                 return res.status(400).json({ error: 'Onbekende mode' });
  }
}

// ── faro-chat ──────────────────────────────────────────────────────────────────

async function chat(req, res, ctx, body) {
  const text = String(body.text || '').trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!text && !attachments.length) {
    return res.status(400).json({ error: 'Leeg bericht' });
  }
  if (text.length > config.LIMITS.maxMessageChars) {
    return res.status(400).json({ error: 'Bericht te lang' });
  }
  if (attachments.length > config.LIMITS.maxAttachments) {
    return res.status(400).json({ error: 'Te veel bijlagen' });
  }
  // LIMITS.maxAttachmentBytes existed and nothing read it, and mediaType went
  // straight through to the provider unvalidated. Both are checked here, before
  // anything is decoded, forwarded or paid for.
  const ALLOWED_MEDIA = ['image/png', 'image/jpeg', 'image/webp'];
  for (const a of attachments) {
    if (!a || typeof a.data !== 'string' || !ALLOWED_MEDIA.includes(a.mediaType)) {
      return res.status(400).json({ error: 'Alleen PNG-, JPG- of WebP-afbeeldingen' });
    }
    // base64 decodes to ~3/4 of its length; cheaper than actually decoding it.
    if (Math.floor(a.data.length * 0.75) > config.LIMITS.maxAttachmentBytes) {
      return res.status(400).json({ error: 'Afbeelding te groot' });
    }
  }

  // A conversation is created on the FIRST message, not when the user opens
  // the workspace — otherwise every idle visit leaves an empty row in the
  // sidebar's Recent list.
  let conversationId = body.conversationId || null;
  let history = [];
  if (conversationId) {
    const conv = await store.getConversation(ctx.projectCode, conversationId);
    if (conv) {
      history = await store.listMessages(ctx.projectCode, conversationId);
      if (conv.projectName) ctx.projectName = conv.projectName;
    } else if (await store.available()) {
      // De opslag doet het WEL en kent dit gesprek niet: dan is het van iemand
      // anders of het bestaat niet. Dat hoort een 404 te zijn.
      return res.status(404).json({ error: 'Gesprek niet gevonden' });
    } else {
      // De opslag is er (nog) niet. Vroeger viel dit samen met het geval
      // hierboven, en omdat getConversation() ALTIJD null teruggaf kreeg elk
      // tweede bericht een 404: je kon Faro precies één vraag stellen, en elk
      // item onder "recente gesprekken" was dood bij aanklikken.
      //
      // De browser houdt het gesprek zelf al bij — de zijbalk zegt dat ook
      // met zoveel woorden ("Bewaard in deze browser"). Dus nemen we die
      // geschiedenis aan in plaats van te weigeren. Zie clientHistory() voor
      // wat er wel en niet uit een verzoek overgenomen wordt.
      history = clientHistory(body.history);
    }
  }

  const userContent = [
    ...(text ? [{ type: 'text', text }] : []),
    ...attachments.map((a) => ({ type: 'image', mediaType: a.mediaType, dataBase64: a.data })),
  ];

  // Tools that transform an uploaded photo (generate_property_image) need the
  // bytes. They come from ctx, never from the model's arguments: the model
  // chooses the STYLE, the user supplies the picture. A model that could name
  // its own image source could reference someone else's upload.
  ctx.attachments = attachments;

  // Streaming starts here — from this point failures are SSE error frames,
  // not HTTP status codes, because the headers are already sent.
  stream.open(res);

  return orchestrator.runTurn({
    res,
    ctx,
    conversationId,
    history,
    userContent,
    tier: body.tier || config.DEFAULT_TIER,
  });
}

/* ── Geschiedenis uit de browser ─────────────────────────────────────────────
 * Alleen gebruikt zolang er geen serveropslag is. Wat hier binnenkomt is door
 * de gebruiker te beïnvloeden, dus de vraag is niet "vertrouwen we dit" maar
 * "wat kan iemand ermee".
 *
 * Wel toegestaan: platte tekstbeurten van user en assistant. Iemand kan daarmee
 * de context van zijn EIGEN model sturen — precies wat hij ook kan door het te
 * typen. Geen nieuwe mogelijkheid dus.
 *
 * Niet toegestaan: tool_use- en tool_result-blokken. Die zou je kunnen
 * vervalsen om het model te laten geloven dat een gereedschap al iets heeft
 * gedaan of iets heeft teruggegeven. Gereedschappen draaien altijd hier op de
 * server, en acties naar buiten hangen sowieso achter de HMAC-poort in
 * actions.js — een verzonnen geschiedenis kan dus niets autoriseren. Ze eruit
 * houden scheelt het model wel een hoop verwarring.
 *
 * En een dak: 40 beurten van elk 4 kB is ruim voor een gesprek en te weinig om
 * er een contextvenster mee vol te duwen op andermans rekening.
 */
const CLIENT_HISTORY_MAX_TURNS = 40;
const CLIENT_HISTORY_MAX_CHARS = 4000;

function clientHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-CLIENT_HISTORY_MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    let text = '';
    if (typeof m.text === 'string') text = m.text;
    else if (Array.isArray(m.content)) {
      text = m.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    }
    text = String(text).trim().slice(0, CLIENT_HISTORY_MAX_CHARS);
    if (!text) continue;
    out.push({ role: m.role, content: [{ type: 'text', text }] });
  }
  return out;
}

// ── faro-confirm ───────────────────────────────────────────────────────────────

async function confirm(res, ctx, body) {
  if (!body.actionId) return res.status(400).json({ error: 'Ontbrekende actie' });
  try {
    const out = await actions.execute({ actionId: body.actionId, ctx });
    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    const code = err.code || 'action_error';
    const status = code === 'not_found' || code === 'expired' ? 404 : 400;
    return res.status(status).json({ error: err.message, code });
  }
}

// ── faro-conversations / faro-messages ───────────────────────────────────────────

async function conversations(res, ctx, body) {
  switch (body.op) {
    case 'list':
      return res.status(200).json({
        conversations: await store.listConversations(ctx.projectCode, {
          limit: 20,
          favoritesOnly: Boolean(body.favoritesOnly),
          projectId: body.projectId || null,
        }),
      });
    case 'rename':
    case 'favorite':
    case 'delete':
      return res.status(501).json({ error: 'Nog niet beschikbaar', code: 'not_wired' });
    default:
      return res.status(400).json({ error: 'Onbekende bewerking' });
  }
}

async function messages(res, ctx, body) {
  if (!body.conversationId) return res.status(400).json({ error: 'Ontbrekend gesprek' });
  return res.status(200).json({
    messages: await store.listMessages(ctx.projectCode, body.conversationId),
  });
}

// ── faro-projects ──────────────────────────────────────────────────────────────

async function projects(res, ctx, body) {
  switch (body.op) {
    case 'list':
      return res.status(200).json({ projects: await store.listProjects(ctx.projectCode) });
    case 'get':
      return res.status(200).json({
        project: await store.getProject(ctx.projectCode, body.id),
        contents: await store.getProjectContents(ctx.projectCode, body.id),
      });
    case 'create':
      return res.status(501).json({ error: 'Nog niet beschikbaar', code: 'not_wired' });
    default:
      return res.status(400).json({ error: 'Onbekende bewerking' });
  }
}

// ── faro-media ─────────────────────────────────────────────────────────────────

async function mediaMode(res, ctx, body) {
  switch (body.op) {
    case 'styles':
      return res.status(200).json({
        styles: media.STYLE_KEYS,
        imageAspects: media.IMAGE_ASPECTS,
        videoFormats: media.VIDEO_FORMATS,
        videoDurations: media.VIDEO_DURATIONS,
      });
    case 'list-activity': return res.status(200).json({ activity: await media.listActivity(ctx, { limit: 12 }) });
    case 'list-images': return res.status(200).json({ images: await media.listImages(ctx) });
    case 'list-videos': return res.status(200).json({ videos: await media.listVideos(ctx) });
    case 'job':
      if (!body.jobId) return res.status(400).json({ error: 'Ontbrekende job' });
      return res.status(200).json({ job: await media.getJob(body.jobId, ctx) });
    case 'generate-image':
    case 'generate-video':
    case 'save-to-property':
      return res.status(501).json({ error: 'Nog niet beschikbaar', code: 'not_wired' });
    default:
      return res.status(400).json({ error: 'Onbekende bewerking' });
  }
}

module.exports = { handle };
