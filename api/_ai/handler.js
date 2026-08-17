'use strict';
/*
 * Helvaro AI — route-agnostic request handler.
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
 * The AI workspace has a real reason to want its own route (it streams, and it
 * has a different timeout profile than lead CRUD), but that is a deployment
 * decision, not an architectural one. So all the logic lives here, in an
 * underscore module that is not a route, and there are two ways to serve it:
 *
 *   A. api/ai.js — a four-line route that calls this. One extra function.
 *   B. add `if (body.mode?.startsWith('ai-')) return require('./_ai/handler')…`
 *      to api/leads.js, exactly like the property-* modes. Zero extra functions.
 *
 * Both work unchanged against this file. Pick at wiring time; nothing below
 * has to change either way.
 *
 * ── Modes ────────────────────────────────────────────────────────────────────
 *   ai-chat            stream a turn                        (SSE)
 *   ai-confirm         execute a confirmed action           (JSON)
 *   ai-conversations   list / rename / favorite / delete    (JSON)
 *   ai-messages        rehydrate a conversation             (JSON)
 *   ai-projects        list / create / read a project       (JSON)
 *   ai-media           submit or poll an image/video job    (JSON)
 *   ai-context         what Helvaro AI can see              (JSON)
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
  const { LIMITS } = config;
  if (_rl.configured && _rl.configured()) {
    const ok = await _rl.hit(`ai:${ctx.projectCode}:${ctx.userId}`, LIMITS.rateLimitMax, LIMITS.rateLimitWindowMs);
    if (!ok) return res.status(429).json({ error: 'Te veel verzoeken. Probeer het zo weer.' });
  }

  switch (body.mode) {
    case 'ai-chat':          return chat(req, res, ctx, body);
    case 'ai-confirm':       return confirm(res, ctx, body);
    case 'ai-conversations': return conversations(res, ctx, body);
    case 'ai-messages':      return messages(res, ctx, body);
    case 'ai-projects':      return projects(res, ctx, body);
    case 'ai-media':         return mediaMode(res, ctx, body);
    case 'ai-context':       return res.status(200).json({ sources: prompt.contextSources() });
    default:                 return res.status(400).json({ error: 'Onbekende mode' });
  }
}

// ── ai-chat ──────────────────────────────────────────────────────────────────

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

  // A conversation is created on the FIRST message, not when the user opens
  // the workspace — otherwise every idle visit leaves an empty row in the
  // sidebar's Recent list.
  let conversationId = body.conversationId || null;
  let history = [];
  if (conversationId) {
    const conv = await store.getConversation(ctx.projectCode, conversationId);
    if (!conv) return res.status(404).json({ error: 'Gesprek niet gevonden' });
    history = await store.listMessages(ctx.projectCode, conversationId);
    if (conv.projectName) ctx.projectName = conv.projectName;
  }

  const userContent = [
    ...(text ? [{ type: 'text', text }] : []),
    ...attachments.map((a) => ({ type: 'image', mediaType: a.mediaType, dataBase64: a.data })),
  ];

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

// ── ai-confirm ───────────────────────────────────────────────────────────────

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

// ── ai-conversations / ai-messages ───────────────────────────────────────────

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

// ── ai-projects ──────────────────────────────────────────────────────────────

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

// ── ai-media ─────────────────────────────────────────────────────────────────

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
