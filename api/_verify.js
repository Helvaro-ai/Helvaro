'use strict';
/*
 * Email-ownership verification for Helvaro's self-serve signup.
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_signup-guard.js, api/_credits.js,
 * api/_plan.js) — the route count stays at 11.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Self-serve signup (api/admin.js, mode='onboard') lets anyone type ANY
 * string that merely looks like an email address — nothing proves they own
 * the inbox. This module sends a signed, expiring, single-use confirmation
 * link and flips a status field once the recipient clicks it.
 *
 * ── DESIGN: NEVER BLOCKS THE TRIAL ──────────────────────────────────────────
 * Onboarding research says every extra step before first value kills
 * activation. So the account is created and usable IMMEDIATELY, unverified.
 * This module only gates two things elsewhere in the codebase:
 *   - api/auth.js: password-reset requests (mode='request-reset') refuse to
 *     fire for an unverified address. Reasoning: a reset link, once
 *     delivered, hands over full control of the password — sending that
 *     capability to an address we've never confirmed the account holder
 *     actually controls is exactly the account-takeover pattern email
 *     verification exists to prevent. See auth.js for the full comment.
 *   - Nothing else. Ordinary product use (dashboard, WhatsApp AI, leads,
 *     config) is untouched — see TRIAL-DESIGN.md / this batch's summary for
 *     the full list of things deliberately NOT gated and why.
 *
 * ── TOKEN DESIGN (follows auth.js's existing hvs1/hvr1 pattern exactly) ─────
 * `hvv1.<base64url payload>.<base64url HMAC-SHA256 sig>`
 * payload = { e: email, rid: Client Config record id, iat: issued-at ms }
 *
 * Signing key = HMAC(SESSION_SECRET||ADMIN_KEY, 'helvaro-verify-v1:' + rid +
 * ':' + <status the record had AT ISSUANCE, always 'pending'>).
 *
 * SINGLE-USE without a separate used-token store: exactly like auth.js's
 * resetSecret() mixes in the CURRENT password hash (so a token verified
 * against a hash that has since changed no longer matches), this mixes in
 * the CURRENT `Email Verification Status` field. A token is only ever
 * signed while status='pending'. The moment verification succeeds and the
 * field flips to 'verified', recomputing the expected signature with the
 * new status produces a DIFFERENT signature — so the very same token (and
 * any other still-outstanding token for that record, e.g. from a resend)
 * stops verifying immediately. No replay list, no DB row per token needed.
 *
 * TTL = 72 hours (vs. the 1-hour password-reset TTL). Verification is much
 * lower-stakes than a reset token — it only flips a boolean, it never grants
 * account control — so we can afford to give people a few days to find the
 * email in a busy inbox and cut resend/support friction, while still
 * bounding how long a stale link sitting in an inbox or log stays live.
 *
 * ── STORAGE: Client Config (tblPidTrwGRzRt4LZ), NOT Users table ────────────
 * Verification is a property of the SIGNUP (the business/tenant), not of a
 * login credential, and Client Config is where every other onboarding/trial/
 * fraud-guard field already lives (see api/_signup-guard.js, api/_plan.js).
 *
 * ── AIRTABLE FIELD THIS MODULE NEEDS (Sindi must create — see FIELD_NAME) ──
 *   Name: "Email Verification Status"
 *   Type: Single select, options: "pending", "verified"
 *
 * Deliberately a Single Select, NOT a Checkbox. Airtable's REST API omits
 * any blank/unchecked field from a record's `fields` object entirely — for
 * a Checkbox that means "never verified" and "field just created, never
 * touched" are BOTH indistinguishable from "false". If this were a
 * Checkbox, the instant Sindi adds the field every EXISTING client (whose
 * value has obviously never been touched) would suddenly read as
 * unverified and lose password-reset access — exactly the lockout the
 * brief says must never happen. A Single Select sidesteps this: blank/
 * absent is read as "not participating in this flow" (fail-open, verified),
 * and only a record we ourselves explicitly wrote 'pending' to (i.e. a
 * signup created AFTER this feature shipped) is ever treated as
 * unverified. See isVerified() below.
 *
 * Until the field exists (Sindi hasn't created it yet), every Airtable
 * record simply lacks the key — isVerified() reads that the same as
 * "verified". Fail OPEN, never locks anyone out.
 */

const crypto = require('crypto');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

const FIELD_NAME = {
  STATUS: 'Email Verification Status', // Single select: 'pending' | 'verified' (blank/missing = verified, fail-open)
};

const VERIFY_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours — see file header for reasoning

// Same fail-closed contract as auth.js's signingBase(): never sign/verify
// with a default secret. Duplicated here (not required from auth.js) so
// this module has no dependency on the route file — keep in sync with
// auth.js's signingBase() if that ever changes.
function signingBase() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new Error('SESSION_SECRET (or ADMIN_KEY) is not configured — refusing to sign tokens with a default secret');
  return base;
}

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

// Mixes the record id + a status snapshot into the signing key — see file
// header for why this gives single-use enforcement "for free".
function verifySecret(recordId, status) {
  return crypto.createHmac('sha256', signingBase())
    .update('helvaro-verify-v1:' + (recordId || '') + ':' + (status || ''))
    .digest('hex');
}

// Always signs against status='pending' — a verification token is only ever
// minted at the moment we've just written (or confirmed) that status.
function signVerifyToken(email, recordId) {
  const iat = Date.now();
  const payload = Buffer.from(JSON.stringify({ e: email, rid: recordId, iat })).toString('base64url');
  const sig = crypto.createHmac('sha256', verifySecret(recordId, 'pending')).update(payload).digest('base64url');
  return `hvv1.${payload}.${sig}`;
}

// Decode WITHOUT verifying the signature — mirrors auth.js's reset-password
// flow (decode first to learn who to look up, verify after fetching their
// current record state). Never trust the decoded contents on their own.
function decodeVerifyToken(token) {
  if (typeof token !== 'string' || !token.startsWith('hvv1.')) return null;
  const [, payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data.e || !data.rid || typeof data.iat !== 'number') return null;
  return { data, payload, sig };
}

// Full verification: caller must supply the record's CURRENT status (fetched
// fresh from Airtable — never trust a cached/client-supplied value here).
function verifyToken(token, recordId, currentStatus) {
  const decoded = decodeVerifyToken(token);
  if (!decoded) return null;
  if (decoded.data.rid !== recordId) return null; // defense-in-depth; caller already looked up by this id
  const expected = crypto.createHmac('sha256', verifySecret(recordId, currentStatus))
    .update(decoded.payload).digest('base64url');
  if (!safeEqual(decoded.sig, expected)) return null;
  if (Date.now() - decoded.data.iat > VERIFY_TTL_MS) return null; // expired
  return decoded.data;
}

// See file header: blank/missing field (not yet created, or a pre-existing
// client that predates this feature) reads as verified. Only an EXPLICIT
// 'pending' blocks — never anything else.
function isVerified(fields) {
  const v = fields && fields[FIELD_NAME.STATUS];
  return v !== 'pending';
}

async function fetchClientRecordById(baseId, airtableToken, recordId) {
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${airtableToken}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function markVerified(baseId, airtableToken, recordId) {
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [FIELD_NAME.STATUS]: 'verified' }, typecast: true }),
  });
  return r.ok;
}

// Sends the confirmation link. Plain, short, Dutch, informal (je/jij),
// clearly from Helvaro — matches auth.js's password-reset email tone, not
// admin.js's fancier dark-branded invite email (which is deliberately more
// formal). Never throws: sendMail() itself never throws (see _mailer.js);
// this returns its { ok, error? } shape straight through.
async function sendVerificationEmail(email, recordId) {
  const token = signVerifyToken(String(email).toLowerCase(), recordId);
  const link = `https://app.helvaro.pro/verify-email?token=${encodeURIComponent(token)}`;
  const { sendMail } = require('./_mailer');
  const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
            <h2 style="color:#1e6fd9;margin:0 0 16px">Bevestig je e-mailadres</h2>
            <p>Welkom bij Helvaro! Klik op de knop hieronder om te bevestigen dat dit jouw e-mailadres is. Je account werkt nu al gewoon, dit duurt maar 10 seconden. De link is <strong>72 uur geldig</strong>.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${link}" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">E-mailadres bevestigen</a>
            </p>
            <p style="font-size:13px;color:#666">Werkt de knop niet? Kopieer deze link in je browser:<br><span style="color:#1e6fd9;word-break:break-all">${link}</span></p>
            <p style="font-size:13px;color:#999;margin-top:24px">Heb je net geen account aangemaakt bij Helvaro? Dan mag je deze mail gewoon negeren.</p>
            <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px">Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp</p>
          </div>`;
  return sendMail({ to: email, subject: 'Bevestig je e-mailadres — Helvaro', html });
}

module.exports = {
  CLIENTS_TABLE,
  FIELD_NAME,
  VERIFY_TTL_MS,
  signVerifyToken,
  decodeVerifyToken,
  verifyToken,
  isVerified,
  fetchClientRecordById,
  markVerified,
  sendVerificationEmail,
};
