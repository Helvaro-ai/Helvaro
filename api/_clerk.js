// ── Clerk session verification ───────────────────────────────────────────────
// Verifies a Clerk-issued session JWT and resolves it to the same shape the
// rest of the app already expects from its own tokens: { projectCode,
// clientName, calendlyLink, em }. Everything downstream stays unchanged.
//
// Runs BEHIND A FLAG. Clerk is only consulted when CLERK_ENABLED=1 and a secret
// key is present; otherwise this module reports "not my problem" and the
// existing HMAC path handles the request exactly as before. That means this can
// ship to production, be tested against a real Clerk instance, and be switched
// on — or off again — without a deploy.
//
// ── The part that actually matters ───────────────────────────────────────────
// projectCode is the tenant key. It decides which client's leads a request can
// see, and it is read in ~236 places across the API. Under the old system it
// was baked into a token this server signed itself, so it could not be wrong.
// Under Clerk it comes from user.publicMetadata, which is edited in Clerk's
// dashboard and could be missing, empty, or stale.
//
// So this fails CLOSED on the tenant key: no projectCode means no session, not
// a session with an empty projectCode. An empty projectCode elsewhere in this
// codebase reads as "admin, show everything" — returning one here would hand a
// misconfigured user the whole database. That is the single most dangerous
// failure mode in this migration and it is guarded at exactly one place: here.

const crypto = require('crypto');
const { verifyToken, createClerkClient } = require('@clerk/backend');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const USERS_TABLE   = 'tbl2hrPW7gIx5XF4S';

// Derived from the Clerk user id, never random. Two requests arriving at the
// same moment for the same new user therefore compute the SAME code, so the
// existence check below makes provisioning idempotent instead of racing to
// create two tenants for one person. It also means a retry after a half-failed
// run lands on the same records rather than orphaning the first attempt.
function deriveProjectCode(userId) {
  const h = crypto.createHash('sha256').update('helvaro-tenant|' + userId).digest('base64url');
  return ('C' + h.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).slice(0, 10);
}

async function at(path, opts) {
  const token  = process.env.API_AIRTABLE;
  const baseId = process.env.BASE_AIRTABLE;
  if (!token || !baseId) throw new Error('Airtable niet geconfigureerd');
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts && opts.headers) },
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return r.json();
}

// Gives a freshly signed-up user their own tenant, so signing up is enough to
// start using the product — no manual step in between.
//
// Everything here is written to be safe to run twice: the project code is
// derived, and both tables are checked before anything is created. The order
// matters — Clerk's metadata is written LAST, because that is what the rest of
// the app trusts. If an earlier step fails, the user simply has no tenant yet
// and the next request retries cleanly, rather than holding a projectCode that
// points at records which do not exist.
async function provisionTenant(user) {
  const uid   = user.id;
  const email = String(user.primaryEmailAddress?.emailAddress || '').trim().toLowerCase();
  if (!email) throw new Error('gebruiker zonder e-mailadres');

  const projectCode = deriveProjectCode(uid);
  const clientName  = String(user.firstName || '').trim()
                      ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
                      : email.split('@')[0];

  const cFormula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${projectCode}"`);
  const existing = await at(`${CLIENTS_TABLE}?filterByFormula=${cFormula}&maxRecords=1`);
  if (!(existing.records || []).length) {
    await at(CLIENTS_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          fldAnB848Sr5jl6dq: clientName,     // Client Name
          fldN4dL0bGgfBOXwM: projectCode,    // Project Code
          fld2GjRvjpsxI8XD0: email,          // Email
        },
        typecast: true,
      }),
    });
    console.log('[clerk] nieuwe tenant aangemaakt', projectCode);
  }

  const uFormula = encodeURIComponent(`{Email}="${email.replace(/["\\]/g, '\\$&')}"`);
  const uExisting = await at(`${USERS_TABLE}?filterByFormula=${uFormula}&maxRecords=1`);
  if (!(uExisting.records || []).length) {
    await at(USERS_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          fldsqiSy41CCDickr: email,        // Email
          fldmKwegSUj1joru3: clientName,   // Client Name
          fldbrCpBuQjJBfZsv: projectCode,  // Project Code
          fldb8sGE3Bslch8f8: true,         // Active
        },
        typecast: true,
      }),
    });
  }

  // Last, deliberately: this is the flag the whole app reads.
  await client().users.updateUserMetadata(uid, {
    publicMetadata: { projectCode, clientName },
  });

  return { projectCode, clientName, calendlyLink: '', em: email };
}

const USER_TTL = 60 * 1000;
const _userCache = new Map();   // clerk user id -> { data, ts }
let _client = null;

function enabled() {
  return process.env.CLERK_ENABLED === '1' && !!process.env.CLERK_SECRET_KEY;
}

function client() {
  if (!_client) _client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _client;
}

// Clerk's browser SDK stores the session JWT in a cookie called __session.
function readClerkToken(req) {
  const raw = (req && req.headers && req.headers.cookie) || '';
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    if (part.slice(0, i).trim() !== '__session') continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); }
    catch { return part.slice(i + 1).trim(); }
  }
  // Also accept it as a bearer token, for non-browser callers.
  const auth = String((req && req.headers && req.headers.authorization) || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

// Claims first (cheap), user lookup only as a fallback. Putting projectCode in
// a custom JWT claim via the Clerk dashboard avoids an API call per request;
// without that we look the user up and cache for a minute.
async function resolveTenant(claims) {
  const fromClaim = claims.projectCode || claims.public_metadata?.projectCode
                 || claims.publicMetadata?.projectCode || '';
  if (fromClaim) {
    return {
      projectCode:  String(fromClaim),
      clientName:   String(claims.clientName || claims.public_metadata?.clientName || claims.publicMetadata?.clientName || ''),
      calendlyLink: String(claims.calendlyLink || claims.public_metadata?.calendlyLink || claims.publicMetadata?.calendlyLink || ''),
      em:           String(claims.email || claims.public_metadata?.email || ''),
    };
  }

  const uid = claims.sub;
  if (!uid) return null;
  const hit = _userCache.get(uid);
  if (hit && Date.now() - hit.ts < USER_TTL) return hit.data;

  let user;
  try { user = await client().users.getUser(uid); }
  catch (e) { console.error('[clerk] user lookup failed:', e && e.message); return null; }

  const md = (user && user.publicMetadata) || {};
  if (!md.projectCode) {
    // Signing up is enough: give them their own tenant now rather than making
    // them wait for someone to do it by hand.
    try {
      const fresh = await provisionTenant(user);
      _userCache.set(uid, { data: fresh, ts: Date.now() });
      return fresh;
    } catch (e) {
      // Provisioning failed (Airtable down, bad config). Still fail CLOSED on
      // access — an empty projectCode reads as "admin, show everything"
      // further down — but say why, so the UI can explain the wait instead of
      // telling someone with valid credentials that their login was wrong.
      console.error('[clerk] tenant aanmaken mislukt:', e && e.message);
      return { pending: true, em: String(user.primaryEmailAddress?.emailAddress || '') };
    }
  }
  const data = {
    projectCode:  String(md.projectCode),
    clientName:   String(md.clientName || ''),
    calendlyLink: String(md.calendlyLink || ''),
    em:           String(user.primaryEmailAddress?.emailAddress || ''),
  };
  _userCache.set(uid, { data, ts: Date.now() });
  return data;
}

// Returns a session object on success, null when this is not a Clerk request or
// the token is not acceptable. Never throws — a failure here must fall through
// to the existing path, not 500 the endpoint.
async function verifySession(req) {
  if (!enabled()) return null;
  const token = readClerkToken(req);
  if (!token) return null;
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    if (!claims || !claims.sub) return null;
    return await resolveTenant(claims);
  } catch (e) {
    // Expired or invalid Clerk token. Not noteworthy on its own.
    return null;
  }
}

function forget(userId) { _userCache.delete(String(userId || '')); }

module.exports = { enabled, verifySession, readClerkToken, forget, deriveProjectCode, provisionTenant };
