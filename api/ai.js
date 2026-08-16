'use strict';
/*
 * Helvaro AI — HTTP route.
 *
 * SCAFFOLD: deployed but INERT. config.isEnabled() is false unless
 * AI_WORKSPACE_ENABLED=1, so every request 404s until the feature is switched
 * on deliberately. Same posture as api/_demo-chat.js: code shipping to the
 * server must not be the same event as a paid endpoint going live.
 *
 * ── This file is intentionally tiny ──────────────────────────────────────────
 * It does two things: resolve the session, and hand off to api/_ai/handler.js.
 * All behaviour lives in the underscore modules, which are not deployed as
 * functions. That keeps the option open to delete this file entirely and
 * dispatch the same handler from api/leads.js by `body.mode` — the pattern the
 * property-image feature already uses — if the function count ever becomes the
 * binding constraint.
 *
 * ── Function count ───────────────────────────────────────────────────────────
 * This is the 11th route in api/. vercel.json's `api/**\/*.js` catch-all
 * already covers it, so no config change is needed — but the count is worth
 * watching: api/_images.js's header notes the project deliberately holds this
 * number down, and the underscore-module convention exists for that reason.
 *
 * ── Timeouts ─────────────────────────────────────────────────────────────────
 * Inherits the 60s catch-all in vercel.json. That is enough for a chat turn
 * with a few tool calls. It is NOT enough for video generation — which is why
 * api/_ai/media.js models video as a polled job rather than a blocking call.
 */

const _session = require('./_session');
const aiHandler = require('./_ai/handler');

module.exports = async function handler(req, res) {
  // CSRF: state-changing POSTs must carry the double-submit token, same as the
  // rest of the dashboard's write paths.
  if (!_session.csrfOk(req)) {
    return res.status(403).json({ error: 'Ongeldig verzoek' });
  }

  const session = _session.verifySignedSession(_session.readToken(req));
  if (!session) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }

  const auth = {
    projectCode: session.projectCode,
    userId: session.userId || session.email || session.projectCode,
    lang: session.lang || 'nl',
    isAdmin: Boolean(session.isAdmin),
  };

  return aiHandler.handle(req, res, auth);
};
