const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const verify = require('./_verify');
const _session = require('./_session');
const _rl      = require('./_ratelimit');
const _revoke  = require('./_revocation'); // password-hash fingerprint -> session revocation // shared, cold-start-proof counters // cookie transport + CSRF — see its header // email-ownership verification — see its file header

// ── Wachtwoord-hashing (bcrypt) ────────────────────────────────────────────────
// Wachtwoorden werden vroeger als plaintext in "Password Hash" bewaard. Nu hashen
// we met bcrypt. Backward-compatible: bestaande plaintext-wachtwoorden blijven
// werken (legacy-pad) en worden bij de eerstvolgende succesvolle login stil omgezet
// naar bcrypt. Niemand wordt buitengesloten.
const BCRYPT_ROUNDS = 10;
function isHashed(s) { return /^\$2[aby]\$/.test(String(s || '')); }
function hashPassword(pw) { return bcrypt.hashSync(String(pw), BCRYPT_ROUNDS); }

// bcrypt, with a self-healing legacy path.
//
// This briefly rejected non-bcrypt values outright, on the reasoning that a
// plaintext fallback is a standing liability. That was right about the risk and
// wrong about the remedy: it locked out every account still holding a plaintext
// password — including the owner's own — and refusing a login does not remove
// the plaintext from the database, it just makes it unreachable.
//
// So plaintext is accepted again, but only once: verifyPassword reports HOW the
// match was made, and the caller immediately rewrites the record as bcrypt (see
// the upgrade block at the login call site). The plaintext is gone after the
// next successful sign-in, which actually solves the problem instead of
// stranding people on it.
//
// Returns { ok, legacy }.
function verifyPassword(pw, stored) {
  stored = String(stored || '');
  if (!stored) return { ok: false, legacy: false };
  if (isHashed(stored)) {
    try { return { ok: bcrypt.compareSync(String(pw), stored), legacy: false }; }
    catch { return { ok: false, legacy: false }; }
  }
  return { ok: safeEqual(pw, stored), legacy: true };
}

// Exponential backoff + jitter for Airtable 429. auth path only.
// 4 attempts: ~1 s, ~2 s, ~4 s, final.  Max ~7 s server wait.
// Auth is the critical path so it retries more than polling endpoints,
// but we keep it short so the 429 error surfaces quickly to the client
// where a 30-second auto-retry countdown takes over (much less wasteful
// than holding a serverless function open for 60 s under rate pressure).
async function atFetch(url, opts) {
  let delay = 1000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, opts);
    if (r.status !== 429) return r;
    if (attempt < 3) {
      const jitter = delay * 0.25 * (Math.random() * 2 - 1); // ±25 %
      await new Promise(res => setTimeout(res, Math.max(300, delay + jitter)));
    }
    delay = Math.min(delay * 2, 8_000);
  }
  return fetch(url, opts); // final attempt. Caller handles non-200
}

// TTL cache. User records by email, 5 min TTL
// Avoids an Airtable call on every login attempt (hot path)
const _userCache = new Map();
const USER_TTL   = 5 * 60 * 1000;
function getCachedUser(email) {
  const entry = _userCache.get(email);
  if (!entry) return null;
  if (Date.now() - entry.ts > USER_TTL) { _userCache.delete(email); return null; }
  return entry.record;
}
function setCachedUser(email, record) {
  _userCache.set(email, { record, ts: Date.now() });
}

// Max 40 login attempts per IP per 15 minutes. 40 rather than 10 because a
// real user fumbling their password a few times during setup shouldn't get
// locked out; it still stops credential stuffing. Counter lives in the shared
// store (see api/_ratelimit.js) — as plain in-memory Maps these limits were
// per-instance and reset on every cold start, which on serverless is barely a
// limit at all.
async function isRateLimited(ip) {
  const r = await _rl.hit('login', ip, 40, 15 * 60 * 1000);
  return r.limited;
}

// Manual reset for support, triggered via mode='reset-rate-limit' with the
// admin key. Clears the shared counter, not just this instance's copy.
async function clearRateLimit(ip) { await _rl.reset('login', ip); }

// Separate, dedicated limiter for the reset-rate-limit action itself (i.e.
// for guesses of ADMIN_KEY made against THIS branch), deliberately NOT the
// same counter as isRateLimited() above (separate 'adminkey' bucket).
//
// Why not just reuse the login bucket: this endpoint exists so a legitimate
// admin who is already locked out (40 failed logins in 15 min) can clear
// their own lockout. If we gated this branch on the same login
// counter, a locked-out admin's own reset call would push their count even
// higher and still read as rate-limited — permanently locking them out with
// no self-service recovery, which defeats the endpoint's entire purpose.
// A separate counter throttles brute-forcing of ADMIN_KEY (the actual
// vulnerability) without coupling it to ordinary login failures.
async function isAdminKeyRateLimited(ip) {
  const r = await _rl.hit('adminkey', ip, 10, 15 * 60 * 1000);
  return r.limited;
}


// Derive a stable admin session token from ADMIN_KEY so the raw secret
// never leaves the server. The token is deterministic (no DB needed) but
// cannot be reversed to obtain the original key.
function deriveAdminToken(adminKey) {
  return crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
}

// ── Signed session tokens ──────────────────────────────────────────────────────
// Embed client data in a signed token so downstream API handlers (leads, calendly)
// can verify identity locally. Zero Airtable calls after login, for every client.
// Secret derived from SESSION_SECRET (preferred) or ADMIN_KEY.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days. Matches dashboard TTL

// Fail closed: never sign or verify tokens with a known constant. If neither
// SESSION_SECRET nor ADMIN_KEY is configured, every token would otherwise be
// forgeable by anyone who can read this source. Throwing here means a
// misconfigured environment breaks loudly (login returns 500) instead of
// silently accepting forged sessions for any tenant. leads.js mirrors this.
function signingBase() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new Error('SESSION_SECRET (or ADMIN_KEY) is not configured — refusing to sign tokens with a default secret');
  return base;
}
function sessionSecret() {
  return crypto.createHmac('sha256', signingBase()).update('helvaro-session-v1').digest('hex');
}
function signSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig     = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `hvs1.${payload}.${sig}`;
}

// Timing-safe string compare. Prevents timing-based brute force
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// ── Password reset tokens ─────────────────────────────────────────────────────
// HMAC-signed, time-limited tokens carry email + issuedAt; no DB needed.
// Token rotates whenever the user's password changes because the secret hashes
// the current Password Hash into the signing key. So a leaked token is dead
// the moment the password is updated.
const RESET_TTL_MS = 60 * 60 * 1000;  // 1 hour

// Monotonic per-instance sequence + best-effort tracker of the most recently
// issued reset token's seq per email. Mixed into resetSecret() below so
// requesting a SECOND reset token invalidates the first — same technique as
// the passwordHash mixing above, just keyed on issuance instead of on an
// actual password change. Once a newer token is signed for an email, the
// signing key used to verify an older token for that email no longer
// matches (the marker baked into the key changed), so the older token's
// signature stops verifying — even though its own HMAC and expiry would
// otherwise still be valid.
// NOTE: the marker is a monotonic counter (_resetSeq), not Date.now(). Two
// signResetToken() calls issued in the same millisecond would otherwise get
// the identical wall-clock marker and remain indistinguishable — the
// counter guarantees every issuance gets a strictly higher marker than the
// last, regardless of clock resolution.
// RESIDUAL GAP: _lastResetIssued is per-serverless-instance, in-memory state
// (same pattern as _userCache above) — NOT shared across concurrent Vercel
// instances or cold starts. If two reset requests for the same email land on
// two different warm instances, the instance that never observed the newer
// issuance still verifies the older token successfully. Fully closing this
// needs a persisted per-user field (e.g. a "Last Reset Issued At" column on
// the Users table, synced to Airtable) or external shared state (Redis) —
// not implemented here without confirming an Airtable schema change is
// safe. See BATCH-D-SUMMARY.md item 9 for the full write-up of this
// trade-off. In practice this still closes the common case (a user
// double-clicking "resend" or requesting a fresh link minutes later, which
// usually lands on the same warm instance).
let _resetSeq = 0;
const _lastResetIssued = new Map(); // email (lowercased) -> highest known seq

function resetSecret(passwordHash, issuedMarker) {
  // Mixing in the current hash invalidates old tokens after a real password
  // change; mixing in issuedMarker invalidates old tokens after a newer
  // reset request for the same (still-unchanged) password.
  return crypto.createHmac('sha256', signingBase())
    .update('helvaro-reset-v1:' + (passwordHash || '') + ':' + (issuedMarker || 0))
    .digest('hex');
}
function signResetToken(email, passwordHash) {
  const iat = Date.now();
  const seq = ++_resetSeq;
  const key = String(email).toLowerCase();
  _lastResetIssued.set(key, seq); // this token becomes "the latest" for this email
  const payload = Buffer.from(JSON.stringify({ e: email, iat, seq })).toString('base64url');
  const sig     = crypto.createHmac('sha256', resetSecret(passwordHash, seq)).update(payload).digest('base64url');
  return `hvr1.${payload}.${sig}`;
}
function verifyResetToken(token, passwordHash) {
  if (typeof token !== 'string' || !token.startsWith('hvr1.')) return null;
  const [, payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch { return null; }
  if (!data.e || !data.iat || typeof data.seq !== 'number') return null;
  // If this instance knows of a STRICTLY newer token for this email, use
  // that marker — it won't match what this (older) token was actually
  // signed with, so the signature check below fails and the token is
  // rejected. Otherwise fall back to the token's own seq, which reproduces
  // the exact marker it was signed with (see residual-gap note above).
  const key          = String(data.e).toLowerCase();
  const latestKnown  = _lastResetIssued.get(key);
  const marker       = (latestKnown !== undefined && latestKnown > data.seq) ? latestKnown : data.seq;
  const expected = crypto.createHmac('sha256', resetSecret(passwordHash, marker)).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  if (Date.now() - data.iat > RESET_TTL_MS) return null;  // expired
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /forgot-password. Render the request-reset HTML page ─────────────
  // ── GET /reset-password?token=.... render the new-password HTML page ─────
  // ── GET /verify-email?token=.... confirm email ownership, one click ──────
  if (req.method === 'GET') {
    const path = (req.url || '').split('?')[0];
    if (path.endsWith('/forgot-password')) return renderForgotPage(res);
    if (path.endsWith('/reset-password'))  return renderResetPage(req, res);
    if (path.endsWith('/verify-email'))    return handleVerifyEmail(req, res);
    return res.status(404).send('Not found');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel sets x-vercel-forwarded-for itself from the real edge connection and
  // strips/overwrites any client-supplied value, unlike x-forwarded-for, which
  // a client can set directly to spoof the rate-limit key. Fall back to
  // x-forwarded-for only when x-vercel-forwarded-for is absent (e.g. local dev
  // without the Vercel edge in front).
  const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
          || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || req.socket?.remoteAddress
          || 'unknown';

  // ── Special unauthenticated mode: reset-rate-limit (requires admin key) ────
  // Useful when an admin locked themselves out by testing logins.
  // Throttled by isAdminKeyRateLimited() (own counter, see its definition
  // above) rather than isRateLimited()'s bucket — see that function's
  // comment for why reusing the login counter here would self-defeat.
  // Comparison is timing-safe (safeEqual) so a caller can't learn ADMIN_KEY
  // byte-by-byte from response latency, same as the admin-shortcut login
  // path further down and admin.js's isValidAdminToken().
  // safeBody i.p.v. req.body: dat is op Vercel een lazy getter die bij kapotte
  // JSON gooit, en deze regel staat buiten de try/catch verderop. Eén verkeerd
  // gevormde POST gaf daardoor een kale 400 zonder body — waar de frontend
  // vervolgens zelf op crasht bij res.json().
  if (_session.safeBody(req).mode === 'reset-rate-limit') {
    if (await isAdminKeyRateLimited(ip)) {
      return res.status(429).json({ error: 'Te veel pogingen. Wacht 15 minuten.' });
    }
    const provided  = String(_session.safeBody(req).adminKey || '').trim();
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (!provided || !ADMIN_KEY || !safeEqual(provided, ADMIN_KEY)) {
      return res.status(401).json({ error: 'Ongeldige admin key' });
    }
    await clearRateLimit(ip);
    return res.status(200).json({ ok: true, message: 'Rate limit gewist voor jouw IP.' });
  }

  if (await isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel pogingen. Wacht 15 minuten of probeer vanaf een ander IP. Tip: open een privé/incognito venster.' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const USERS_TABLE    = 'tbl2hrPW7gIx5XF4S';

  try {
    // Ook hier safeBody. Deze regel zit wél in een try, dus kapotte JSON gaf
    // geen kale 400 meer maar een 500 met "Serverfout" — en dat is een leugen:
    // 500 zegt "wij hebben het verpest", terwijl de invoer fout was. Met
    // safeBody wordt een onleesbare body gewoon een leeg object, waarna de
    // validatie hieronder er zelf een nette 400 van maakt.
    const body = _session.safeBody(req);

    const email    = String(body.email    || '').trim().slice(0, 254);
    const password = String(body.password || '').trim().slice(0, 200);

    /* ── MODE: logout. End the session on the SERVER ────────────────────────
       Logging out used to be entirely client-side: it emptied localStorage and
       showed the login screen. But hv_session is httpOnly, so JavaScript could
       not clear it and never did -- the cookie stayed valid for its full 7
       days. On a shared machine that is the whole point of logging out:
       restore two localStorage markers by hand and tryAutoLogin() lets you
       straight back in, authenticated by the surviving cookie, with hv_csrf
       still present so writes pass too. No token theft required.

       Deliberately unauthenticated: clearing your OWN cookies needs no proof
       of who you are, and refusing to log out someone whose session already
       expired is the wrong failure. It only ever clears the cookies on THIS
       response, so it cannot touch anyone else's session. */
    if (body.mode === 'logout') {
      _session.clearSessionCookies(res);
      return res.status(200).json({ ok: true });
    }

    // ── MODE: request-reset. Email the user a reset link ────────────────────
    // We verify the user exists before sending so the form gives clear feedback
    // (B2B context: ~10-100 known clients, account enumeration risk is low and
    // the UX clarity wins).
    if (body.mode === 'request-reset') {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Ongeldig e-mailadres' });
      }
      // 1. Verify the user actually exists + is active
      const user = await fetchUserByEmail(email);
      if (!user) {
        console.warn('[reset] no user for', email);
        return res.status(404).json({ error: 'Dit e-mailadres is bij ons niet bekend. Controleer het adres of neem contact op.' });
      }
      // 2. Gate: require a verified email before handing out a reset link.
      // WHY: a reset token, once delivered, grants full control over the
      // password. We've never confirmed the recipient inbox is the one the
      // account holder actually controls until it's verified — sending that
      // capability to an unconfirmed address is exactly the account-takeover
      // pattern email verification exists to close off (e.g. self-serve
      // signup let someone type a mistyped or not-their-own address; if that
      // address is later controlled by someone else, "forgot password" would
      // otherwise hand them the account). Fails OPEN: any lookup problem, or
      // the "Email Verification Status" field/record not existing at all,
      // is treated as verified (see _verify.js's isVerified()) so this can
      // never lock out an existing client.
      try {
        const projectCode = user.fields['fldbrCpBuQjJBfZsv'] || user.fields['Project Code'] || '';
        const clientRec = projectCode ? await fetchClientRecordByProjectCode(projectCode) : null;
        if (clientRec && !verify.isVerified(clientRec.fields)) {
          return res.status(403).json({
            error: 'Bevestig eerst je e-mailadres voor je wachtwoord kan resetten. Check je inbox voor de bevestigingsmail, of vraag een nieuwe aan.',
            code: 'email_not_verified'
          });
        }
      } catch (err) {
        console.warn('[reset] verified-check failed, failing open:', err.message);
      }
      // 3. Try to send the email. Surface real errors back
      const sendResult = await sendResetEmailToUser(email, user).catch(err => ({ ok: false, error: err.message }));
      if (!sendResult.ok) {
        console.error('[reset] send failed for', email, sendResult.error);
        return res.status(500).json({ error: 'Mail kon niet verstuurd worden. Neem contact op met support.' });
      }
      return res.status(200).json({
        ok: true,
        message: 'Resetlink verstuurd naar ' + email + '. Check je inbox (en spam). de link werkt 1 uur.'
      });
    }

    // ── MODE: resend-verification. Re-send the email-ownership confirmation
    // link. Client-initiated (e.g. from a "confirm your email" dashboard
    // banner). Same existence-check pattern as request-reset above, and
    // covered by the same isRateLimited(ip) 40-per-15-min limiter applied
    // above before any mode branch runs. ─────────────────────────────────────
    if (body.mode === 'resend-verification') {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Ongeldig e-mailadres' });
      }
      const user = await fetchUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Dit e-mailadres is bij ons niet bekend.' });
      }
      try {
        const projectCode = user.fields['fldbrCpBuQjJBfZsv'] || user.fields['Project Code'] || '';
        const clientRec = projectCode ? await fetchClientRecordByProjectCode(projectCode) : null;
        if (!clientRec) {
          // No Client Config record to tie the token to — nothing we can do,
          // but don't leak internal state either. Same neutral-success shape
          // as an already-verified account (see below).
          return res.status(200).json({ ok: true, message: 'Als er iets te bevestigen valt is de mail onderweg.' });
        }
        const currentStatus = clientRec.fields[verify.FIELD_NAME.STATUS] || '';
        if (currentStatus !== 'pending') {
          // Blank/missing field or already 'verified' — nothing to resend.
          return res.status(200).json({ ok: true, alreadyVerified: true, message: 'Je e-mailadres is al bevestigd.' });
        }
        const sent = await verify.sendVerificationEmail(email, clientRec.id).catch(err => ({ ok: false, error: err.message }));
        if (!sent.ok) {
          console.error('[resend-verification] send failed for', email, sent.error);
          return res.status(500).json({ error: 'Mail kon niet verstuurd worden. Neem contact op met support.' });
        }
        return res.status(200).json({ ok: true, message: 'Verificatiemail verstuurd naar ' + email + '. Check je inbox (en spam).' });
      } catch (err) {
        console.error('[resend-verification] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── MODE: reset-password. Verify token + set new password ───────────────
    if (body.mode === 'reset-password') {
      const token       = String(body.token       || '').slice(0, 1024);
      const newPassword = String(body.newPassword || '').trim().slice(0, 200);
      if (!token)              return res.status(400).json({ error: 'Token ontbreekt' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens zijn' });
      // Decode payload first (without verifying. Need email to look up current hash)
      const [, payload] = token.split('.');
      let emailFromToken = '';
      try { emailFromToken = String(JSON.parse(Buffer.from(payload || '', 'base64url').toString('utf8')).e || '').toLowerCase(); }
      catch { return res.status(400).json({ error: 'Ongeldige token' }); }
      if (!emailFromToken) return res.status(400).json({ error: 'Ongeldige token' });
      // Fetch user + verify token against CURRENT password hash (rotates after reset)
      const userRec = await fetchUserByEmail(emailFromToken);
      if (!userRec) return res.status(400).json({ error: 'Token verlopen of ongeldig' });
      const currentHash = String(userRec.fields['Password Hash'] || userRec.fields['fldPasswordHash'] || '');
      const verified    = verifyResetToken(token, currentHash);
      if (!verified) return res.status(400).json({ error: 'Token verlopen of ongeldig' });
      // Update Password Hash in Airtable
      const updRes = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}/${userRec.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { 'Password Hash': hashPassword(newPassword) } })
        }
      );
      if (!updRes.ok) {
        const txt = await updRes.text().catch(() => '');
        console.error('[reset-password] update failed', updRes.status, txt.slice(0, 200));
        return res.status(500).json({ error: 'Wachtwoord updaten mislukt' });
      }
      // Invalidate the user cache so the next login uses the new hash
      _userCache.delete(emailFromToken);
      // And drop the cached password fingerprint, so every session issued under
      // the OLD password is rejected on its very next request instead of
      // lingering for up to the 60s revocation-cache window.
      _revoke.forget(emailFromToken);
      // Whoever is resetting is holding a session for the old password too;
      // clear their cookies so they land on a clean login rather than a
      // session that is about to start failing.
      _session.clearSessionCookies(res);
      return res.status(200).json({ ok: true, message: 'Wachtwoord aangepast. Je kan nu inloggen.' });
    }

    if (!email)    return res.status(400).json({ error: 'E-mailadres is verplicht' });
    if (!password) return res.status(400).json({ error: 'Wachtwoord is verplicht' });

    // ── Admin shortcut ────────────────────────────────────────────────────────
    // Use timing-safe compare so attackers can't learn the key length/prefix.
    // Return a DERIVED token. The raw ADMIN_KEY never leaves the server.
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (ADMIN_KEY && safeEqual(password, ADMIN_KEY)) {
      // Admin gets the derived HMAC token. NOT a session token.
      // leads.js recognises it via isAdminToken() before session verification.
      {
        const _tok  = deriveAdminToken(ADMIN_KEY);
        const _csrf = _session.setSessionCookies(res, _tok);
        return res.status(200).json({
          success:     true,
          apiKey:      _tok,
          csrfToken:   _csrf,
          clientName:  'Admin',
          projectCode: ''
        });
      }
    }

    // Basic email shape check. Reject obvious injections early
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }

    // ── USERS_CONFIG removed ─────────────────────────────────────────────────
    // There used to be an env-var user store here: a JSON blob mapping email ->
    // { password, apiKey, clientName, projectCode }, compared as PLAINTEXT, so
    // that listed users could log in without touching Airtable. It bought a few
    // hundred milliseconds in exchange for keeping real, working passwords in
    // clear text in an environment variable — readable by anyone with project
    // access, and copied into every build log and local .env that ever held it.
    // Its own documentation said to use the exact same password as Airtable, so
    // every one of those users authenticates fine through the normal path below.
    // Nothing to migrate; the variable can simply be deleted in Vercel.

    // ── Owner bypass ─────────────────────────────────────────────────────────
    // OWNER_PASSWORD_HASH is misnamed: historically it held PLAINTEXT, and the
    // previous comment here warned against "fixing" that to bcrypt because
    // doing so blindly locks the owner out of her own admin.
    //
    // So this now accepts BOTH, decided by the shape of the stored value:
    //   - starts with $2a/$2b/$2y  -> treated as a bcrypt hash, verified properly
    //   - anything else            -> legacy plaintext, timing-safe compare,
    //                                 plus a loud warning in the logs
    // Nothing breaks today, and the moment OWNER_PASSWORD_HASH is replaced with
    // a real bcrypt hash it starts being verified as one, with no code change.
    // Generate one with:
    //   node -e "console.log(require('bcryptjs').hashSync('JOUW-WACHTWOORD',10))"
    const OWNER_EMAIL         = process.env.OWNER_EMAIL;
    const OWNER_PASSWORD_REF  = process.env.OWNER_PASSWORD_HASH;
    let ownerPasswordOk = false;
    if (OWNER_EMAIL && OWNER_PASSWORD_REF && safeEqual(email, OWNER_EMAIL)) {
      if (isHashed(OWNER_PASSWORD_REF)) {
        try { ownerPasswordOk = bcrypt.compareSync(String(password), OWNER_PASSWORD_REF); }
        catch { ownerPasswordOk = false; }
      } else {
        ownerPasswordOk = safeEqual(password, OWNER_PASSWORD_REF);
        if (ownerPasswordOk) {
          console.warn('[auth] OWNER_PASSWORD_HASH bevat nog PLAINTEXT. Vervang hem door een bcrypt-hash.');
        }
      }
    }
    if (ownerPasswordOk) {
      const ownerData = {
        apiKey:       process.env.OWNER_API_KEY       || '',
        clientName:   process.env.OWNER_CLIENT_NAME   || 'Owner',
        projectCode:  process.env.OWNER_PROJECT_CODE  || '',
        calendlyLink: process.env.OWNER_CALENDLY_LINK || '',
      };
      {
      const _tok = signSession(ownerData);
      const _csrf = _session.setSessionCookies(res, _tok);
      // apiKey stays in the body for now so a client mid-upgrade keeps working;
      // the cookie is what new clients actually use.
      return res.status(200).json({ success: true, ...ownerData, apiKey: _tok, csrfToken: _csrf });
    }
    }

    // ── Fetch user by email only. Password compared server-side ─────────────
    // Cached 5 min so repeated login attempts don't hammer Airtable.
    let userRecord = getCachedUser(email);
    if (!userRecord) {
      const formula = encodeURIComponent(
        `AND({Email}="${escapeFormula(email)}",{Active}=1)`
      );
      const url   = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
      const atRes = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });

      if (!atRes.ok) {
        console.error('Airtable auth error:', atRes.status);
        if (atRes.status === 429) {
          res.setHeader('Retry-After', '30');
          return res.status(503).json({ error: 'Systeem is tijdelijk bezet. Even geduld...', retryAfter: 30 });
        }
        return res.status(500).json({ error: 'Database fout. Probeer opnieuw.' });
      }

      const data = await atRes.json();
      userRecord = data.records?.[0] || null;
      if (userRecord) setCachedUser(email, userRecord);
    }

    if (!userRecord) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const user       = userRecord.fields;
    const storedHash = String(user['Password Hash'] || user['fldPasswordHash'] || '');

    // Verifieer wachtwoord. bcrypt voor nieuwe hashes, timing-safe plaintext voor legacy.
    const pwCheck = storedHash ? verifyPassword(password, storedHash) : { ok: false, legacy: false };
    if (!pwCheck.ok) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }
    // This login matched a plaintext record. Rewrite it as bcrypt right now, so
    // the clear-text password stops existing in Airtable from here on. Runs at
    // most once per account. Best-effort: if the write fails the user is still
    // logged in and the next sign-in tries again — never block a valid login on
    // a housekeeping write.
    // effectiveHash is what the session fingerprint must be pinned to. Without
    // this the upgrade below would rewrite the stored hash while the token was
    // still pinned to the OLD (plaintext) value, so the very next request would
    // see a fingerprint mismatch and revoke the session the user just created.
    let effectiveHash = storedHash;
    if (pwCheck.legacy) {
      const upgraded = hashPassword(password);
      try {
        await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}/${userRecord.id}`,
          {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: { 'Password Hash': upgraded } })
          }
        );
        effectiveHash = upgraded;
        _userCache.delete(email);
        _revoke.forget(email);
        console.warn('[auth] plaintext-wachtwoord omgezet naar bcrypt voor een account');
      } catch (e) { /* nooit een geldige login blokkeren op een opruimactie */ }
    }

    const userData = {
      apiKey:       user['fldxZMgVXSy7EShDL'] || user['API Key']        || '',
      clientName:   user['fldmKwegSUj1joru3']  || user['Client Name']   || '',
      projectCode:  user['fldbrCpBuQjJBfZsv']  || user['Project Code']  || '',
      calendlyLink: user['fldCalendlyLink']     || user['Calendly Link'] || '',
      // Revocation claims — see api/_revocation.js. 'pv' pins the session to
      // the password it was issued under, so changing the password ends every
      // session that predates it, including ones on other devices.
      em:           email,
      pv:           _revoke.fingerprint(effectiveHash),
    };
    {
      const _tok = signSession(userData);
      const _csrf = _session.setSessionCookies(res, _tok);
      // apiKey stays in the body for now so a client mid-upgrade keeps working;
      // the cookie is what new clients actually use.
      return res.status(200).json({ success: true, ...userData, apiKey: _tok, csrfToken: _csrf });
    }

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── PASSWORD RESET HELPERS ──────────────────────────────────────────────────

// Look up a user record by email. Used by reset-password.
// Honors the same cache as the login flow so we don't double-hit Airtable.
async function fetchUserByEmail(email) {
  const cached = getCachedUser(email);
  if (cached) return cached;
  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const USERS_TABLE    = 'tbl2hrPW7gIx5XF4S';
  const formula = encodeURIComponent(`AND({Email}="${escapeFormula(email)}",{Active}=1)`);
  const url     = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const r = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  const rec = d.records?.[0] || null;
  if (rec) setCachedUser(email, rec);
  return rec;
}

// ─── EMAIL VERIFICATION HELPERS ───────────────────────────────────────────────
// See api/_verify.js's file header for the full token design. Verification
// state lives on the Client Config record (tblPidTrwGRzRt4LZ), NOT the Users
// table — it's a property of the signup/tenant, not of a login credential.
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

// Look up a Client Config record by Project Code. Used by request-reset's
// verification gate and resend-verification. Not cached (unlike
// fetchUserByEmail) — these two call sites are both low-frequency,
// already-rate-limited actions, not the hot login path.
async function fetchClientRecordByProjectCode(projectCode) {
  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const r = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.records?.[0] || null;
}

// ── GET /verify-email?token=.... One click, no form (unlike reset-password,
// there's no additional user input to collect — clicking the link IS the
// action). Renders a small result page instead of redirecting straight to
// /dashboard so a stale/reused/expired link gets a clear, honest message
// instead of a silent bounce.
async function handleVerifyEmail(req, res) {
  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const q = (req.url || '').split('?')[1] || '';
  const token = new URLSearchParams(q).get('token') || '';

  const decoded = verify.decodeVerifyToken(token);
  if (!decoded) {
    return res.status(400).send(verifyResultPage(false, 'Deze link is ongeldig.'));
  }

  let rec;
  try {
    rec = await verify.fetchClientRecordById(BASE_ID, AIRTABLE_TOKEN, decoded.data.rid);
  } catch (err) {
    console.error('[verify-email] lookup failed:', err.message);
    return res.status(500).send(verifyResultPage(false, 'Serverfout. Probeer het later opnieuw.'));
  }
  if (!rec) {
    return res.status(400).send(verifyResultPage(false, 'Deze link is ongeldig of het account bestaat niet meer.'));
  }

  const currentStatus = rec.fields[verify.FIELD_NAME.STATUS] || '';
  // Idempotent-friendly: a second click on the same (now-used) link, or a
  // click on an older resend, should read as "you're all set", not as an
  // error — the underlying signature check below would reject it anyway
  // (see _verify.js's single-use design), but this gives a nicer message.
  if (currentStatus === 'verified') {
    return res.status(200).send(verifyResultPage(true, 'Je e-mailadres is al bevestigd. Je kan dit venster sluiten.'));
  }

  const valid = verify.verifyToken(token, decoded.data.rid, currentStatus);
  if (!valid) {
    return res.status(400).send(verifyResultPage(false, 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan via je dashboard.'));
  }

  let ok = false;
  try {
    ok = await verify.markVerified(BASE_ID, AIRTABLE_TOKEN, decoded.data.rid);
  } catch (err) {
    console.error('[verify-email] mark-verified failed:', err.message);
  }
  if (!ok) {
    return res.status(500).send(verifyResultPage(false, 'Er ging iets mis bij het bevestigen. Probeer opnieuw of neem contact op.'));
  }
  return res.status(200).send(verifyResultPage(true, 'E-mailadres bevestigd! Je kan dit venster sluiten.'));
}

function verifyResultPage(success, message) {
  const title = success ? 'Bevestigd' : 'Kon niet bevestigen';
  const emoji = success ? '✓' : '✕';
  const color = success ? '#1e6fd9' : '#b91c1c';
  return `<!DOCTYPE html>
<html lang="nl"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${RESET_CSS}</style>
</head><body>
  <div class="card" style="text-align:center">
    <div style="font-size:40px;color:${color};margin-bottom:8px">${emoji}</div>
    <h1>${title}</h1>
    <p class="sub" style="margin-bottom:0">${escapeHtml(message)}</p>
    <a class="back" href="/dashboard">← Naar je dashboard</a>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Send the reset link to a user we already verified exists.
// Returns { ok: true } on success, or { ok: false, error: '...' } so the caller
// can surface a precise error message to the user (no info-leak. User is known).
async function sendResetEmailToUser(email, user) {
  const currentHash = String(user.fields['Password Hash'] || user.fields['fldPasswordHash'] || '');
  const token = signResetToken(email.toLowerCase(), currentHash);
  const link  = `https://app.helvaro.pro/reset-password?token=${encodeURIComponent(token)}`;

  const { sendMail } = require('./_mailer');
  const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
            <h2 style="color:#1e6fd9;margin:0 0 16px">Wachtwoord opnieuw instellen</h2>
            <p>Iemand (hopelijk jij) heeft gevraagd om je Helvaro wachtwoord opnieuw in te stellen. Klik op de knop hieronder. De link is <strong>1 uur geldig</strong>.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${link}" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Wachtwoord resetten</a>
            </p>
            <p style="font-size:13px;color:#666">Werkt de knop niet? Kopieer deze link in je browser:<br><span style="color:#1e6fd9;word-break:break-all">${link}</span></p>
            <p style="font-size:13px;color:#999;margin-top:24px">Heb je dit niet aangevraagd? Negeer deze mail. Er gebeurt niets met je account.</p>
            <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px">Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp</p>
          </div>`;
  const sent = await sendMail({ to: email, subject: 'Helvaro — Wachtwoord opnieuw instellen', html });
  if (!sent.ok) return { ok: false, error: 'Mail versturen mislukt: ' + (sent.error || 'onbekend') };
  return { ok: true };
}

// ─── PASSWORD RESET HTML PAGES ───────────────────────────────────────────────

const RESET_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f8fb; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; max-width: 420px; width: 100%; padding: 36px 32px; border-radius: 16px; box-shadow: 0 12px 40px rgba(20,40,80,.08); }
  h1 { margin: 0 0 8px; font-size: 1.5rem; color: #111; }
  p.sub { margin: 0 0 28px; color: #6a7890; font-size: 14px; line-height: 1.55; }
  label { display: block; font-size: 13px; font-weight: 600; color: #2a3a55; margin-bottom: 6px; }
  input { width: 100%; padding: 12px 14px; border: 1.5px solid #dde3ee; border-radius: 10px; font-size: 15px; box-sizing: border-box; transition: border-color .15s; }
  input:focus { outline: none; border-color: #1e6fd9; }
  button { width: 100%; padding: 13px; background: #1e6fd9; color: #fff; border: 0; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 18px; transition: opacity .15s; }
  button:hover { opacity: .92; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .msg { margin-top: 18px; padding: 12px 14px; border-radius: 10px; font-size: 14px; }
  .msg.ok { background: #ecfdf5; color: #065f46; }
  .msg.err { background: #fef2f2; color: #b91c1c; }
  .back { display: block; text-align: center; margin-top: 22px; font-size: 13px; color: #1e6fd9; text-decoration: none; }
  .back:hover { text-decoration: underline; }
`;

function renderForgotPage(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Wachtwoord vergeten · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${RESET_CSS}</style>
</head><body>
  <div class="card">
    <h1>Wachtwoord vergeten?</h1>
    <p class="sub">Geen probleem. Vul je e-mailadres in en we sturen je een link om een nieuw wachtwoord in te stellen. De link is 1 uur geldig.</p>
    <form id="f" onsubmit="return false">
      <label for="email">E-mailadres</label>
      <input id="email" type="email" autocomplete="email" required placeholder="jij@bedrijf.be">
      <button id="btn" type="submit">Reset-link versturen</button>
    </form>
    <div id="m" class="msg" style="display:none"></div>
    <a class="back" href="/dashboard">← Terug naar inloggen</a>
  </div>
<script>
const f = document.getElementById('f'), btn = document.getElementById('btn'), m = document.getElementById('m');
f.addEventListener('submit', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  btn.disabled = true; btn.textContent = 'Bezig...';
  m.style.display = 'none';
  try {
    const r = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode:'request-reset', email }) });
    const d = await r.json().catch(() => ({}));
    m.textContent = d.message || (r.ok ? 'Mail verstuurd.' : (d.error || 'Er ging iets mis.'));
    m.className = 'msg ' + (r.ok ? 'ok' : 'err');
    m.style.display = 'block';
    if (r.ok) { btn.textContent = 'Verstuurd'; }
    else      { btn.disabled = false; btn.textContent = 'Reset-link versturen'; }
  } catch (e) {
    m.textContent = 'Netwerkfout. Probeer opnieuw.'; m.className = 'msg err'; m.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Reset-link versturen';
  }
});
</script>
</body></html>`);
}

function renderResetPage(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const q = (req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(q);
  const token = params.get('token') || '';
  const safeToken = token.replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 1024);
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nieuw wachtwoord · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${RESET_CSS}</style>
</head><body>
  <div class="card">
    <h1>Kies een nieuw wachtwoord</h1>
    <p class="sub">Vul hieronder je nieuwe wachtwoord in (minstens 8 tekens). Daarna kan je inloggen.</p>
    <form id="f" onsubmit="return false">
      <label for="p1">Nieuw wachtwoord</label>
      <input id="p1" type="password" autocomplete="new-password" required minlength="8" placeholder="Minstens 8 tekens">
      <label for="p2" style="margin-top:12px">Bevestig wachtwoord</label>
      <input id="p2" type="password" autocomplete="new-password" required minlength="8" placeholder="Herhaal je wachtwoord">
      <button id="btn" type="submit">Wachtwoord opslaan</button>
    </form>
    <div id="m" class="msg" style="display:none"></div>
    <a class="back" href="/dashboard">← Terug naar inloggen</a>
  </div>
<script>
const TOKEN = ${JSON.stringify(safeToken)};
const f = document.getElementById('f'), btn = document.getElementById('btn'), m = document.getElementById('m');
if (!TOKEN) { m.textContent = 'Geen geldige reset-link. Vraag een nieuwe aan.'; m.className = 'msg err'; m.style.display = 'block'; btn.disabled = true; }
f.addEventListener('submit', async () => {
  const p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
  m.style.display = 'none';
  if (p1.length < 8) { m.textContent = 'Wachtwoord moet minstens 8 tekens zijn.'; m.className = 'msg err'; m.style.display = 'block'; return; }
  if (p1 !== p2)     { m.textContent = 'De twee wachtwoorden komen niet overeen.'; m.className = 'msg err'; m.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Bezig...';
  try {
    const r = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode:'reset-password', token: TOKEN, newPassword: p1 }) });
    const d = await r.json().catch(() => ({}));
    m.textContent = d.message || (r.ok ? 'Wachtwoord aangepast.' : (d.error || 'Er ging iets mis.'));
    m.className = 'msg ' + (r.ok ? 'ok' : 'err');
    m.style.display = 'block';
    if (r.ok) {
      btn.textContent = 'Klaar';
      setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
    } else {
      btn.disabled = false; btn.textContent = 'Wachtwoord opslaan';
    }
  } catch (e) {
    m.textContent = 'Netwerkfout. Probeer opnieuw.'; m.className = 'msg err'; m.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Wachtwoord opslaan';
  }
});
</script>
</body></html>`);
}
