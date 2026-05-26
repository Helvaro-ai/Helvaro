const crypto = require('crypto');

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
  return fetch(url, opts); // final attempt. caller handles non-200
}

// TTL cache. user records by email, 5 min TTL
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

// In-memory rate limiter. max 40 login attempts per IP per 15 minutes.
// (Was 10. too aggressive during setup/testing when users type wrong passwords
// a few times. 40 still blocks credential-stuffing while not annoying real users.)
const loginAttempts = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 15 * 60 * 1000;
  const max    = 40;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < window);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.every(t => now - t > window)) loginAttempts.delete(k);
    }
  }
  return attempts.length > max;
}

// Manual reset for support. wipes the in-memory attempts for a given IP.
// Triggered via mode='reset-rate-limit' with the admin key.
function clearRateLimit(ip) { loginAttempts.delete(ip); }

// Derive a stable admin session token from ADMIN_KEY so the raw secret
// never leaves the server. The token is deterministic (no DB needed) but
// cannot be reversed to obtain the original key.
function deriveAdminToken(adminKey) {
  return crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
}

// ── Signed session tokens ──────────────────────────────────────────────────────
// Embed client data in a signed token so downstream API handlers (leads, calendly)
// can verify identity locally. zero Airtable calls after login, for every client.
// Secret derived from ADMIN_KEY so no additional env var is required.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days. matches dashboard TTL
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function signSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig     = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `hvs1.${payload}.${sig}`;
}

// Timing-safe string compare. prevents timing-based brute force
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
// the current Password Hash into the signing key. so a leaked token is dead
// the moment the password is updated.
const RESET_TTL_MS = 60 * 60 * 1000;  // 1 hour
function resetSecret(passwordHash) {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  // Mixing in the current hash invalidates old tokens after each reset.
  return crypto.createHmac('sha256', base).update('helvaro-reset-v1:' + (passwordHash || '')).digest('hex');
}
function signResetToken(email, passwordHash) {
  const payload = Buffer.from(JSON.stringify({ e: email, iat: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', resetSecret(passwordHash)).update(payload).digest('base64url');
  return `hvr1.${payload}.${sig}`;
}
function verifyResetToken(token, passwordHash) {
  if (typeof token !== 'string' || !token.startsWith('hvr1.')) return null;
  const [, payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', resetSecret(passwordHash)).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.e || !data.iat) return null;
    if (Date.now() - data.iat > RESET_TTL_MS) return null;  // expired
    return data;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /forgot-password. render the request-reset HTML page ─────────────
  // ── GET /reset-password?token=.... render the new-password HTML page ─────
  if (req.method === 'GET') {
    const path = (req.url || '').split('?')[0];
    if (path.endsWith('/forgot-password')) return renderForgotPage(res);
    if (path.endsWith('/reset-password'))  return renderResetPage(req, res);
    return res.status(404).send('Not found');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  // ── Special unauthenticated mode: reset-rate-limit (requires admin key) ────
  // Useful when an admin locked themselves out by testing logins.
  if (req.body && (req.body.mode === 'reset-rate-limit' || req.body?.mode === 'reset-rate-limit')) {
    const provided = String((req.body || {}).adminKey || '').trim();
    if (!provided || provided !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Ongeldige admin key' });
    clearRateLimit(ip);
    return res.status(200).json({ ok: true, message: 'Rate limit gewist voor jouw IP.' });
  }

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel pogingen. wacht 15 minuten of probeer vanaf een ander IP. Tip: open een privé/incognito venster.' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const USERS_TABLE    = 'tbl2hrPW7gIx5XF4S';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const email    = String(body.email    || '').trim().slice(0, 254);
    const password = String(body.password || '').trim().slice(0, 200);

    // ── MODE: request-reset. email the user a reset link ────────────────────
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
      // 2. Try to send the email. surface real errors back
      const sendResult = await sendResetEmailToUser(email, user).catch(err => ({ ok: false, error: err.message }));
      if (!sendResult.ok) {
        console.error('[reset] send failed for', email, sendResult.error);
        return res.status(500).json({ error: 'Mail kon niet verstuurd worden. neem contact op met support.' });
      }
      return res.status(200).json({
        ok: true,
        message: 'Resetlink verstuurd naar ' + email + '. Check je inbox (en spam). de link werkt 1 uur.'
      });
    }

    // ── MODE: reset-password. verify token + set new password ───────────────
    if (body.mode === 'reset-password') {
      const token       = String(body.token       || '').slice(0, 1024);
      const newPassword = String(body.newPassword || '').trim().slice(0, 200);
      if (!token)              return res.status(400).json({ error: 'Token ontbreekt' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens zijn' });
      // Decode payload first (without verifying. need email to look up current hash)
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
          body:    JSON.stringify({ fields: { 'Password Hash': newPassword } })
        }
      );
      if (!updRes.ok) {
        const txt = await updRes.text().catch(() => '');
        console.error('[reset-password] update failed', updRes.status, txt.slice(0, 200));
        return res.status(500).json({ error: 'Wachtwoord updaten mislukt' });
      }
      // Invalidate the user cache so the next login uses the new hash
      _userCache.delete(emailFromToken);
      return res.status(200).json({ ok: true, message: 'Wachtwoord aangepast. je kan nu inloggen.' });
    }

    if (!email)    return res.status(400).json({ error: 'E-mailadres is verplicht' });
    if (!password) return res.status(400).json({ error: 'Wachtwoord is verplicht' });

    // ── Admin shortcut ────────────────────────────────────────────────────────
    // Use timing-safe compare so attackers can't learn the key length/prefix.
    // Return a DERIVED token. the raw ADMIN_KEY never leaves the server.
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (ADMIN_KEY && safeEqual(password, ADMIN_KEY)) {
      // Admin gets the derived HMAC token. NOT a session token.
      // leads.js recognises it via isAdminToken() before session verification.
      return res.status(200).json({
        success:     true,
        apiKey:      deriveAdminToken(ADMIN_KEY),
        clientName:  'Admin',
        projectCode: ''
      });
    }

    // Basic email shape check. reject obvious injections early
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }

    // ── Env-var user store (USERS_CONFIG) ────────────────────────────────────
    // Single JSON env var that eliminates ALL Airtable calls for listed users.
    // Format (set in Vercel → Settings → Environment Variables):
    //   USERS_CONFIG = {"email@example.com":{"password":"...","apiKey":"...","clientName":"...","projectCode":"..."}}
    // Use the EXACT same password that is stored in Airtable "Password Hash".
    // Supports multiple accounts. just add more keys to the JSON object.
    try {
      const raw = process.env.USERS_CONFIG;
      if (raw) {
        const store = JSON.parse(raw);
        // Find by email (case-insensitive)
        const key  = Object.keys(store).find(k => k.toLowerCase() === email.toLowerCase());
        const user = key ? store[key] : null;
        if (user && safeEqual(password, String(user.password || ''))) {
          const ud = {
            apiKey:       user.apiKey       || '',
            clientName:   user.clientName   || '',
            projectCode:  user.projectCode  || '',
            calendlyLink: user.calendlyLink || '',  // included in token so leads.js can serve it without Airtable
          };
          return res.status(200).json({ success: true, ...ud, apiKey: signSession(ud) });
        }
      }
    } catch { /* malformed JSON. fall through to Airtable */ }

    // ── Owner bypass (legacy. superseded by USERS_CONFIG) ───────────────────
    const OWNER_EMAIL = process.env.OWNER_EMAIL;
    const OWNER_PASS  = process.env.OWNER_PASSWORD_HASH;
    if (OWNER_EMAIL && OWNER_PASS &&
        safeEqual(email, OWNER_EMAIL) &&
        safeEqual(password, OWNER_PASS)) {
      const ownerData = {
        apiKey:       process.env.OWNER_API_KEY       || '',
        clientName:   process.env.OWNER_CLIENT_NAME   || 'Owner',
        projectCode:  process.env.OWNER_PROJECT_CODE  || '',
        calendlyLink: process.env.OWNER_CALENDLY_LINK || '',
      };
      return res.status(200).json({ success: true, ...ownerData, apiKey: signSession(ownerData) });
    }

    // ── Fetch user by email only. password compared server-side ─────────────
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

    // Timing-safe server-side compare. never query Airtable with the password
    if (!storedHash || !safeEqual(password, storedHash)) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const userData = {
      apiKey:       user['fldxZMgVXSy7EShDL'] || user['API Key']        || '',
      clientName:   user['fldmKwegSUj1joru3']  || user['Client Name']   || '',
      projectCode:  user['fldbrCpBuQjJBfZsv']  || user['Project Code']  || '',
      calendlyLink: user['fldCalendlyLink']     || user['Calendly Link'] || '',
    };
    return res.status(200).json({ success: true, ...userData, apiKey: signSession(userData) });

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

// Look up a user record by email. used by reset-password.
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

// Send the reset link to a user we already verified exists.
// Returns { ok: true } on success, or { ok: false, error: '...' } so the caller
// can surface a precise error message to the user (no info-leak. user is known).
async function sendResetEmailToUser(email, user) {
  const currentHash = String(user.fields['Password Hash'] || user.fields['fldPasswordHash'] || '');
  const token = signResetToken(email.toLowerCase(), currentHash);
  const link  = `https://app.helvaro.pro/reset-password?token=${encodeURIComponent(token)}`;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY env var ontbreekt op de server' };
  const FROM = process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from: FROM, to: [email], subject: 'Helvaro. Wachtwoord opnieuw instellen',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
            <h2 style="color:#1e6fd9;margin:0 0 16px">Wachtwoord opnieuw instellen</h2>
            <p>Iemand (hopelijk jij) heeft gevraagd om je Helvaro wachtwoord opnieuw in te stellen. Klik op de knop hieronder. de link is <strong>1 uur geldig</strong>.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${link}" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Wachtwoord resetten</a>
            </p>
            <p style="font-size:13px;color:#666">Werkt de knop niet? Kopieer deze link in je browser:<br><span style="color:#1e6fd9;word-break:break-all">${link}</span></p>
            <p style="font-size:13px;color:#999;margin-top:24px">Heb je dit niet aangevraagd? Negeer deze mail. er gebeurt niets met je account.</p>
            <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px">Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp</p>
          </div>`
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[reset] resend failed', r.status, txt.slice(0, 300));
      return { ok: false, error: `Resend API gaf ${r.status}: ${txt.slice(0, 150)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[reset] network error:', err && err.message);
    return { ok: false, error: 'Netwerkfout bij Resend: ' + (err && err.message) };
  }
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
  <title>Wachtwoord vergeten. Helvaro</title>
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
  <title>Nieuw wachtwoord. Helvaro</title>
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
