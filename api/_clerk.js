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
// Deliberately well under a paid plan's 2.000. Enough to genuinely try the
// product, not enough for an abandoned or abusive sign-up to cost real money.
const TRIAL_DAYS    = 14;
const TRIAL_CREDITS = 250;
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

  // FIRST, before deriving anything: does this e-mail already belong to a
  // tenant? An existing customer who signs in through Clerk for the first time
  // must land in the tenant he already has. Deriving a code from the Clerk user
  // id and creating a fresh Client Config row instead is not a cosmetic
  // mistake: he logs in successfully, sees zero leads and a 14-day trial, and
  // his real records are still in Airtable but no longer reachable from his
  // account. That is indistinguishable, from his side, from Helvaro having
  // deleted his customers.
  //
  // The row is matched on e-mail because that is the only identifier the two
  // systems share — Airtable predates Clerk and holds no Clerk user id.
  const uFormula  = encodeURIComponent(`{Email}="${email.replace(/["\\]/g, '\\$&')}"`);
  const uExisting = await at(`${USERS_TABLE}?filterByFormula=${uFormula}&maxRecords=1`);
  const uRow      = (uExisting.records || [])[0] || null;
  const uFields   = (uRow && uRow.fields) || {};
  const adopted   = String(uFields.fldbrCpBuQjJBfZsv || uFields['Project Code'] || '').trim();

  if (adopted) {
    // Adopt and stop. Deliberately no Client Config write: that row is the
    // customer's real one and predates this sign-in. Only Clerk's metadata is
    // missing, which is exactly what scripts/clerk-sync-users.js would have
    // filled in had it been run first.
    // Airtable's name wins — it is what the customer is called on his own
    // records — then whatever Clerk collected at sign-up, and only then the
    // e-mail prefix, which is a last resort and reads as a placeholder.
    const adoptedName = String(uFields.fldmKwegSUj1joru3 || uFields['Client Name'] || '').trim()
                        || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
                        || email.split('@')[0];
    await client().users.updateUserMetadata(uid, {
      publicMetadata: { projectCode: adopted, clientName: adoptedName },
    });
    console.log('[clerk] bestaande tenant overgenomen', adopted, 'voor', email);
    return { userId: uid, projectCode: adopted, clientName: adoptedName, calendlyLink: '', em: email };
  }

  const projectCode = deriveProjectCode(uid);
  const clientName  = String(user.firstName || '').trim()
                      ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
                      : email.split('@')[0];

  const cFormula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${projectCode}"`);
  const existing = await at(`${CLIENTS_TABLE}?filterByFormula=${cFormula}&maxRecords=1`);
  if (!(existing.records || []).length) {
    // Trial + a credit ceiling from the very first moment.
    //
    // This matters more than it looks. api/_credits.js FAILS OPEN for a client
    // with no allowance configured — sensible when every client was onboarded
    // by hand, dangerous the moment anyone on the internet can create one.
    // Without these fields a self-signed-up tenant would get a working lead
    // form and unmetered AI replies, billed to Helvaro. Setting the allowance
    // here is what makes public sign-up safe to leave on.
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString().slice(0, 10);
    await at(CLIENTS_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          fldAnB848Sr5jl6dq: clientName,      // Client Name
          fldN4dL0bGgfBOXwM: projectCode,     // Project Code
          fld2GjRvjpsxI8XD0: email,           // Email
          'Plan Status':      'trial',
          'Trial Ends At':    trialEnds,
          'Credit Allowance': TRIAL_CREDITS,
        },
        typecast: true,
      }),
    });
    console.log('[clerk] nieuwe tenant aangemaakt', projectCode, '- proef tot', trialEnds, 'met', TRIAL_CREDITS, 'credits');
  }

  // uRow was fetched above. Reaching here means it either does not exist or
  // carries no Project Code; in the latter case patch the row we already found
  // rather than creating a second one for the same e-mail.
  if (uRow && !adopted) {
    await at(`${USERS_TABLE}/${uRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { fldbrCpBuQjJBfZsv: projectCode }, typecast: true }),
    });
  } else if (!uRow) {
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

  return { userId: uid, projectCode, clientName, calendlyLink: '', em: email };
}

const USER_TTL = 60 * 1000;
const _userCache = new Map();   // clerk user id -> { data, ts }
let _client = null;

function enabled() {
  return process.env.CLERK_ENABLED === '1' && !!process.env.CLERK_SECRET_KEY;
}

// ── Which origins may present a token here ───────────────────────────────────
// A Clerk instance issues session tokens to every origin configured on it, and
// verifyToken() alone only proves "this instance signed it" — not "it was
// issued to this app". The `azp` claim carries the origin the token was minted
// for, and Clerk checks it only if you say what you expect.
//
// That is worth having now for the same reason the cookie changed: on a
// production instance the account portal (accounts.helvaro.pro) and any future
// satellite domain are separate origins on the same instance. Pinning the list
// means a token handed to one of those cannot be replayed against the API.
//
// Empty list = no check, which is what verifyToken did before. That is the
// right fallback rather than a hard failure: an unset variable must not lock
// every customer out of the product.
function authorizedParties() {
  // Not `|| default`: an explicitly EMPTY variable has to mean "turn the check
  // off", and that is the escape hatch if a legitimate origin ever ends up
  // locked out at a bad moment. `|| default` would quietly ignore it and put
  // the same list back.
  const set = Object.prototype.hasOwnProperty.call(process.env, 'CLERK_AUTHORIZED_PARTIES');
  const raw = String(set ? process.env.CLERK_AUTHORIZED_PARTIES : 'https://app.helvaro.pro').trim();
  if (!raw) return undefined;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function client() {
  if (!_client) _client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _client;
}

// ── How a Clerk session may arrive ───────────────────────────────────────────
// Two transports, and which one is acceptable depends on the HTTP method.
//
// The bearer header is always fine: no browser attaches it to a cross-origin
// request on its own, so possessing it is proof the caller is our own page.
//
// The __session COOKIE is a different matter, and it changed under us. While
// the Clerk instance was on test keys the cookie lived on Clerk's own domain
// and never reached this server, so every Clerk request here was a bearer one.
// Now that the DNS records are verified and the Frontend API answers on our own
// domain, __session is a FIRST-PARTY cookie on app.helvaro.pro — the browser
// sends it with requests this page did not make.
//
// api/_session.js's CSRF check does not cover it: csrfOk() looks for the
// hv_session cookie to decide whether a request is cookie-authenticated, and a
// Clerk user has no hv_session and no hv_csrf. So it waves the request through
// as "header auth, not forgeable", while the request is in fact authenticated
// by a cookie. That is precisely the shape of a CSRF hole, and DNS verification
// is what opened it.
//
// Clerk sets __session as SameSite=Lax, which already stops the classic
// cross-site form POST, but that is one third party's default standing between
// us and a forged write. So: the cookie authenticates reads, and writes must
// carry the bearer. Our own fetch wrapper in api/dashboard.js attaches it to
// every /api/ call, so nothing legitimate loses access.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function bearerToken(req) {
  const auth = String((req && req.headers && req.headers.authorization) || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function cookieToken(req) {
  const raw = (req && req.headers && req.headers.cookie) || '';
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    if (part.slice(0, i).trim() !== '__session') continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); }
    catch { return part.slice(i + 1).trim(); }
  }
  return '';
}

function readClerkToken(req) {
  const bearer = bearerToken(req);
  if (bearer) return bearer;
  const method = String((req && req.method) || 'GET').toUpperCase();
  if (!SAFE_METHODS.has(method)) return '';
  return cookieToken(req);
}

// Claims first (cheap), user lookup only as a fallback. Putting projectCode in
// a custom JWT claim via the Clerk dashboard avoids an API call per request;
// without that we look the user up and cache for a minute.
async function resolveTenant(claims) {
  const fromClaim = claims.projectCode || claims.public_metadata?.projectCode
                 || claims.publicMetadata?.projectCode || '';
  if (fromClaim) {
    return {
      userId:       String(claims.sub || ''),
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
      return { pending: true, userId: String(uid), em: String(user.primaryEmailAddress?.emailAddress || '') };
    }
  }
  const data = {
    userId:       String(uid),
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
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: authorizedParties(),
    });
    if (!claims || !claims.sub) return null;
    return await resolveTenant(claims);
  } catch (e) {
    // Expired or invalid Clerk token. Not noteworthy on its own.
    return null;
  }
}

function forget(userId) { _userCache.delete(String(userId || '')); }

module.exports = { enabled, verifySession, readClerkToken, forget, deriveProjectCode, provisionTenant, authorizedParties };
