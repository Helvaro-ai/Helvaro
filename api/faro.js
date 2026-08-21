'use strict';
/*
 * Faro — HTTP route.
 *
 * SCAFFOLD: deployed but INERT. config.isEnabled() is false unless
 * FARO_WORKSPACE_ENABLED=1, so every request 404s until the feature is switched
 * on deliberately. Same posture as api/_demo-chat.js: code shipping to the
 * server must not be the same event as a paid endpoint going live.
 *
 * ── This file is intentionally tiny ──────────────────────────────────────────
 * It does two things: resolve the session, and hand off to api/_faro/handler.js.
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
 * api/_faro/media.js models video as a polled job rather than a blocking call.
 */

const _session = require('./_session');
const _revoke = require('./_revocation');
const _clerk = require('./_clerk');
const faroHandler = require('./_faro/handler');

module.exports = async function handler(req, res) {
  // CSRF: state-changing POSTs must carry the double-submit token, same as the
  // rest of the dashboard's write paths.
  if (!_session.csrfOk(req)) {
    return res.status(403).json({ error: 'Ongeldig verzoek' });
  }

  // ── Path 0: Clerk ──────────────────────────────────────────────────────────
  // Same shape as api/leads.js, and it has to be here rather than only there:
  // Faro is the page a user lands on after logging in, so a Clerk session that
  // this route does not recognise means the first screen of the product is a
  // 401 for every customer. It is consulted BEFORE the legacy token because a
  // Clerk request carries no hv_session at all.
  //
  // Returns null the moment CLERK_ENABLED is not 1, so with the flag off this
  // route behaves exactly as it did.
  const clerkSession = await _clerk.verifySession(req);
  if (clerkSession && clerkSession.pending) {
    return res.status(403).json({ error: 'Je account wordt nog ingericht.', code: 'TENANT_PENDING' });
  }
  if (clerkSession) {
    // Belt and braces, as in leads.js: an empty projectCode reads as "admin,
    // show everything" downstream, and Faro's read tools query on it directly.
    if (!clerkSession.projectCode) {
      return res.status(401).json({ error: 'Sessie mist een projectcode' });
    }
    // No revocation check: _revocation.js tracks tokens THIS server signed, and
    // a Clerk session is not one of them. Revoking it is Clerk's own job — the
    // session is invalidated there and verifyToken stops accepting it, which is
    // a stronger guarantee than the list below, not a weaker one.
    return faroHandler.handle(req, res, {
      projectCode: clerkSession.projectCode,
      userId: clerkSession.userId || clerkSession.em || clerkSession.projectCode,
      lang: 'nl',
      isAdmin: false,
    });
  }

  const session = _session.verifySignedSession(_session.readToken(req));
  if (!session) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }

  // api/leads.js does this and Faro did not, which meant "log me out
  // everywhere" left Faro reachable with a stolen cookie for the rest of the
  // token's 7 days — including every CRM read tool and image generation on the
  // victim's credits. A revocation check is only worth having if every route
  // that trusts a session performs it.
  try {
    if (await _revoke.isRevoked(session)) {
      return res.status(401).json({ error: 'Sessie verlopen' });
    }
  } catch (err) {
    // Fail CLOSED: an unavailable revocation check must not silently restore
    // access to a session someone deliberately invalidated.
    console.error('[faro] revocation check failed:', err.message);
    return res.status(503).json({ error: 'Even niet beschikbaar' });
  }

  const auth = {
    projectCode: session.projectCode,
    userId: session.userId || session.email || session.projectCode,
    lang: session.lang || 'nl',
    isAdmin: Boolean(session.isAdmin),
  };

  return faroHandler.handle(req, res, auth);
};
