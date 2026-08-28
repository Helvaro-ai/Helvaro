'use strict';
/*
 * Signup fraud-prevention guard for Helvaro's Vercel app (Airtable-backed).
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_pgapi.js, api/_gcal.js, api/_credits.js,
 * api/_plan.js) — the route count stays at 11.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Onboarding (api/admin.js, mode='onboard') sits behind a single shared
 * ONBOARD_CODE invite secret today — Sindi personally knows every signup.
 * Opening self-serve signup to the public (gated by the PUBLIC_SIGNUP_ENABLED
 * env var in admin.js — see that file's onboard-mode block) makes trial
 * farming, bot signups, and competitor snooping real risks for the first
 * time. This module is the protection layer that sits in front of that.
 *
 * ── THE TWO RULES SINDI SET THAT MUST NEVER BE VIOLATED ────────────────────
 *   (a) This module NEVER produces a 'reject' verdict. It can say 'accept'
 *       or 'flag' — a flagged signup still gets a working trial account,
 *       just marked for Sindi's manual review in Airtable. Only a human
 *       (Sindi, via the existing plan-set-status admin action) turns a flag
 *       into an actual rejection/cancellation. See evaluateSignup()'s return
 *       shape: `decision` is typed as 'accept' | 'flag', nothing else.
 *   (b) "No website found" is NEVER, by itself or in combination with normal
 *       signals, enough to cross the flag threshold on its own — it carries
 *       a deliberately small weight (WEIGHTS.NO_WEBSITE). Helvaro's ideal
 *       customer is a small Belgian practice with a weak or absent web
 *       presence; penalizing that would reject the best prospects. See
 *       checkWebsiteExists()'s doc comment.
 * All weights/thresholds below are named, exported constants specifically so
 * Sindi can retune them from one place without touching the scoring logic.
 *
 * ── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────────
 * - No paid IP-intelligence API (IPQualityScore/IPinfo/ipapi/etc.). The
 *   datacenter/VPN check below (checkDatacenterIp) is a best-effort reverse-
 *   DNS heuristic using only Node's built-in `dns` module — no external
 *   service, no API key, no CIDR database that could silently go stale. It
 *   will under-flag (miss many real datacenter IPs that have no PTR record
 *   or a generic one) but will not false-flag real customers based on guessed
 *   IP ranges. Swap in a real IP-intel API later at this function's call site
 *   if the false-negative rate becomes a real problem.
 * - No CAPTCHA/bot-detection JS challenge. Out of scope for this pass.
 *
 * ── GDPR: retention of raw signals (ip, fingerprint) ────────────────────────
 * evaluateSignup()'s `signals` object contains the raw IP and device-
 * fingerprint hash used to make the call — this IS personal data (see
 * api/privacy.js's fraud-prevention section). It is only useful at the
 * moment of signup, so it gets a SHORT retention: admin.js writes it into
 * the Client Config record's `Signup Fraud Signals` field (JSON, tagged with
 * `capturedAt`), and api/cron-followup.js's runSignupSignalsRetention() (run
 * daily, same job that already anonymizes cold leads — see that function's
 * own doc comment) clears that field once `capturedAt` is older than
 * SIGNALS_RETENTION_DAYS. The *derived*, non-identifying outputs (numeric
 * score + human-readable reason categories, in `Signup Trust Score` /
 * `Signup Fraud Reasons`) are NOT personal data on their own and are kept
 * indefinitely for Sindi's own review/audit trail — isSignupSignalsExpired()
 * below only ever targets the raw-signals field, never those two.
 *
 * ── AIRTABLE FIELDS THIS MODULE NEEDS (Sindi must create these — see
 * FIELD_NAME below for exact names) on the Client Config table
 * (tblPidTrwGRzRt4LZ), same "may not exist yet, fail soft" contract as
 * api/_credits.js's Credit fields and api/_plan.js's Plan fields:
 *   - Signup Trust Score   (Number)
 *   - Signup Review Status (Single select: accepted, flagged)
 *   - Signup Fraud Reasons (Long text)
 *   - Signup Fraud Signals (Long text — JSON, short retention, see above)
 * admin.js's PATCH after client creation is wrapped in try/catch exactly
 * like its existing credit/trial seeding blocks: if these fields don't exist
 * yet, the write fails, is logged, and onboarding is NEVER blocked by it.
 */

const dns = require('dns');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

// ── Airtable field names this module owns (by NAME, not ID — these fields
// don't exist yet on the live base, so there is no ID to reference; same
// reasoning as _credits.js's FIELD map). ────────────────────────────────────
const FIELD_NAME = {
  SCORE:   'Signup Trust Score',
  STATUS:  'Signup Review Status',
  REASONS: 'Signup Fraud Reasons',
  SIGNALS: 'Signup Fraud Signals',
};

// ── Scoring. Starts at 100, each fired signal subtracts its weight, clamped
// to [0,100]. decision = 'accept' if score >= ACCEPT_AT_OR_ABOVE, else
// 'flag'. NEVER 'reject' — see file header rule (a). Tune freely; nothing
// else in this file needs to change. ────────────────────────────────────────
const WEIGHTS = {
  DISPOSABLE_EMAIL:   -40, // email domain is a known temp-mail provider
  MX_INVALID:         -25, // email domain has no mail server (or doesn't exist)
  DUPLICATE_EMAIL:    -35, // normalized email already used by an existing client
  DUPLICATE_DOMAIN:   -15, // email domain already used by an existing client
  DUPLICATE_COMPANY:  -15, // company name already used by an existing client
  DUPLICATE_PHONE:    -25, // phone number already used by an existing client
  DATACENTER_IP:      -15, // signup IP's PTR record matches a known hosting/cloud provider
  FINGERPRINT_REUSED: -20, // same device/browser fingerprint seen recently
  NO_WEBSITE:          -5, // deliberately small — see file header rule (b)
  /* Een consumentenadres (gmail/hotmail/telenet/skynet/...) is een SIGNAAL, geen
     grond om te weigeren. De opdracht vroeg om "alleen zakelijke e-mail", maar
     dat botst frontaal met regel (b) hierboven: de ideale klant van Helvaro is
     een klein Vlaams kantoor, en dat kantoor mailt vaak vanaf telenet.be of
     gmail. Een harde blokkade zou precies de beste prospects weigeren -- en de
     opdracht waarschuwde daar zelf voor ("geen te agressieve blacklist").
     Vandaar een klein gewicht: gmail alléén blijft ruim boven de drempel en
     krijgt gewoon een proefaccount, maar sámen met een ander signaal (dubbel
     domein, datacenter-IP, hergebruikte vingerafdruk) komt het wél in de
     handmatige controle terecht.
     De echte zakelijke verificatie zit inmiddels op de plek waar hij hoort:
     een btw-nummer bij het afsluiten van een abonnement (api/_vat.js). */
  FREEMAIL_EMAIL:     -10, // consumentendomein — signaal, nooit op zichzelf genoeg
};
const THRESHOLDS = {
  BASE_SCORE:         100,
  MIN_SCORE:           0,
  ACCEPT_AT_OR_ABOVE:  70, // >= this -> 'accept'; below -> 'flag' (never 'reject')
};

// ── Per-IP signup throttle. This is a structural rate limit (same category
// as this file's own admin.js's endpoint-wide isRateLimited()), NOT a
// fraud-score verdict — it returns a plain 429 upstream in admin.js and does
// not create a Client Config record at all, so it does not fall under rule
// (a) above (that rule is specifically about the accept/flag/reject
// *classification* of a signup that DOES get created). Kept generous on
// purpose to avoid blocking a shared office/CGNAT IP with a couple of real
// signups. ───────────────────────────────────────────────────────────────
const RATE_LIMIT = {
  MAX_SIGNUPS_PER_IP: 5,
  WINDOW_MS: 24 * 60 * 60 * 1000,
};

// Fingerprint-reuse dedup window.
const FINGERPRINT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

// How long the raw `Signup Fraud Signals` (ip, fingerprint hash) survive
// before api/cron-followup.js's runSignupSignalsRetention() clears them.
// Signals are only useful at the moment of signup — see file header.
const SIGNALS_RETENTION_DAYS = 30;

// ── Small static timeout helper. Used for every network/DNS call in this
// file so a slow/unreachable third party can never hang a signup request. ──
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Email normalization — collapse aliases to one identity
// ═══════════════════════════════════════════════════════════════════════════

// Providers that are genuinely the same mailbox under two domains.
// Deliberately NOT merging outlook.com/live.com/hotmail.com — those are
// distinct domains Microsoft has never treated as interchangeable aliases,
// unlike gmail.com/googlemail.com which Google explicitly documents as one
// mailbox reachable via either domain.
const EMAIL_DOMAIN_ALIASES = new Map([
  ['googlemail.com', 'gmail.com'],
]);

function emailDomain(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

// s.indi+trial3@gmail.com  ->  sindi@gmail.com
// jan+work@googlemail.com  ->  jan@gmail.com
// jan.peeters@gmail.com    ->  janpeeters@gmail.com
// anything@outlook.com stays as-is apart from +tag stripping (RFC 5233
// sub-addressing is honored broadly enough across providers to strip
// universally; dot-folding is Gmail-specific and only applied there).
function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return email; // not a plausible email shape — caller validates shape separately
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (EMAIL_DOMAIN_ALIASES.has(domain)) domain = EMAIL_DOMAIN_ALIASES.get(domain);
  const plusIdx = local.indexOf('+');
  if (plusIdx !== -1) local = local.slice(0, plusIdx);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

function extractDomainFromUrl(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  try {
    const withProto = /^https?:\/\//.test(s) ? s : `https://${s}`;
    return new URL(withProto).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Disposable-email blocklist — static, bundled in-repo, no network call
// ═══════════════════════════════════════════════════════════════════════════
// Not exhaustive — new temp-mail services appear constantly. This covers the
// well-known, long-lived ones that show up in most public disposable-domain
// lists. Refresh periodically; low cost to extend (just add a domain string).
/* Gratis consumentenproviders. Bewust NIET samengevoegd met DISPOSABLE_DOMAINS:
   een wegwerpadres is bijna altijd misbruik, een gmail-adres bijna nooit. Ze
   verdienen dus een ander gewicht en een andere uitleg in de controle. */
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.be', 'hotmail.nl',
  'outlook.com', 'outlook.be', 'live.com', 'live.be', 'live.nl', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'gmx.com', 'gmx.net', 'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'mail.com', 'yandex.com', 'yandex.ru',
  // Belgische en Nederlandse consumentenproviders — juist hier zit de
  // makelaar die dit product koopt.
  'telenet.be', 'skynet.be', 'proximus.be', 'scarlet.be', 'voo.be', 'edpnet.be',
  'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'home.nl', 'casema.nl', 'xs4all.nl',
]);

function isFreemailDomain(domain) {
  return FREEMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org', 'grr.la',
  'sharklasers.com', 'pokemail.net', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '20minutemail.com',
  'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempail.com', 'tempinbox.com',
  'tempmailaddress.com', 'tempmail.de', 'mytemp.email', 'tmpmail.org', 'tmpmail.net',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.me', 'trash-mail.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'dispostable.com', 'fakeinbox.com', 'fakemailgenerator.com', 'maildrop.cc',
  'mailnesia.com', 'mailcatch.com', 'mailsac.com', 'inboxbear.com', 'burnermail.io',
  'getnada.com', 'nada.email', 'mohmal.com', 'moakt.com', 'moakt.cc', 'moakt.ws',
  'emailondeck.com', 'spamgourmet.com', 'discard.email', 'discardmail.com',
  'mintemail.com', 'anonbox.net', 'incognitomail.org', 'mailexpire.com',
  'mailimate.com', 'meltmail.com', 'mytrashmail.com', 'no-spam.ws',
  'notsharingmy.info', 'objectmail.com', 'proxymail.eu', 'rcpt.at',
  'sneakemail.com', 'spambog.com', 'spambox.us', 'spamfree24.org',
  'spamherelots.com', 'spamhole.com', 'spamify.com', 'spaml.com',
  'tempemail.co', 'tempemail.com', 'tempemail.net', 'temporarymail.com',
  'temporaryinbox.com', 'thankyou2010.com', 'trbvm.com', 'wegwerfmail.de',
  'wegwerfmail.net', 'wegwerfmail.org', 'wh4f.org', 'willselfdestruct.com',
  'zippymail.info', 'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com',
  'rhyta.com', 'teleworm.us', 'superrito.com', 'armyspy.com', 'cuvox.de',
  'dayrep.com', 'lyricalphase.com', 'mailmoat.com', 'crazymailing.com',
  'emkei.cz', 'harakirimail.com', 'kasmail.com', 'letthemeatspam.com',
  'mt2015.com', 'mt2014.com', 'shieldedmail.com', 'spamavert.com',
  'anonymbox.com', 'byom.de', 'chammy.info', 'deadaddress.com',
  'despam.it', 'devnullmail.com', 'e4ward.com', 'explodemail.com',
  'fastacura.com', 'filzmail.com', 'front14.org', 'garliclife.com',
  'gishpuppy.com', 'great-host.in', 'ieatspam.eu', 'ieatspam.info',
  'imails.info', 'irish2me.com', 'jetable.org', 'kaspop.com',
  'lifebyfood.com', 'link2mail.net', 'litedrop.com', 'lookugly.com',
  'lopl.co.cc', 'lortemail.dk', 'lroid.com', 'm4ilweb.info',
  'mailbidon.com', 'mailblocks.com', 'mailde.de', 'maileater.com',
  'mailguard.me', 'mailmetrash.com', 'mailscrap.com', 'mailseal.de',
  'mailshell.com', 'mailtemporaire.fr', 'mailzilla.com', 'mbx.cc',
  'mega.zik.dj', 'mierdamail.com', 'mytrashmail.net', 'netmails.net',
  'netzidiot.de', 'nurfuerspam.de', 'onewaymail.com', 'pjjkp.com',
  'quickinbox.com', 'rejectmail.com', 'safe-mail.net', 'sofimail.com',
  'spamcannon.com', 'spamcorptastic.com', 'spamday.com', 'spamex.com',
  'spamgoes.in', 'spammotel.com', 'spamobox.com', 'spamslicer.com',
  'trashdevil.com', 'trashemail.de', 'trashymail.com', 'veryrealemail.com',
  'walala.org', 'zoemail.net', 'zomg.info',
]);

function isDisposableDomain(domain) {
  return DISPOSABLE_DOMAINS.has(String(domain || '').toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MX/DNS check — fail SOFT on timeout/resolver errors, only flags a
//    domain that genuinely doesn't exist or has no mail service.
// ═══════════════════════════════════════════════════════════════════════════
// checked:false always means "we couldn't tell, treat as fine" (ok:true).
// checked:true, ok:false means "the domain itself is the problem" — a real,
// useful signal per Sindi's brief ("catching typo'd domains Sindi could
// never reach anyway"). A DNS timeout or resolver hiccup must NEVER produce
// checked:true — that would turn a transient infra blip into a false flag.
async function checkMx(domain) {
  if (!domain) return { checked: false, ok: true };
  try {
    const records = await withTimeout(dns.promises.resolveMx(domain), 2500);
    return { checked: true, ok: Array.isArray(records) && records.length > 0 };
  } catch (err) {
    const code = err && err.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { checked: true, ok: false }; // domain doesn't exist / has no mail — real signal
    }
    return { checked: false, ok: true }; // timeout, ESERVFAIL, resolver unreachable, etc. — fail soft
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Duplicate-trial detection against Client Config
// ═══════════════════════════════════════════════════════════════════════════
// Helvaro-scale is "low dozens of clients" (same assumption _credits.js's
// getAllUsageSummaries() documents) — fetching all Client Config records
// once per signup and comparing in JS is cheap and simple, and avoids trying
// to express email-normalization inside an Airtable filterByFormula (which
// can't run arbitrary JS). Fails OPEN (empty match set) on any Airtable
// problem — a duplicate-detection outage must never block real signups.
async function findDuplicateSignals(airtableToken, baseId, { normalizedEmail, domain, companyName, phone }) {
  const result = { email: false, domain: false, company: false, phone: false };
  if (!airtableToken || !baseId) return result;
  try {
    const r = await fetch(`https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?pageSize=100`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
    });
    if (!r.ok) return result;
    const data = await r.json();
    const records = data.records || [];
    const normPhone = String(phone || '').replace(/\D/g, '');
    const companyNorm = String(companyName || '').trim().toLowerCase();

    for (const rec of records) {
      const f = rec.fields || {};
      const existingEmail = f['Email'] || f['fld2GjRvjpsxI8XD0'] || '';
      const existingName  = f['Client Name'] || f['fldAnB848Sr5jl6dq'] || '';
      const existingPhone = f['Phone'] || f['fldecVolseGXtQaAN'] || '';

      if (existingEmail) {
        const existingNorm = normalizeEmail(existingEmail);
        if (normalizedEmail && existingNorm === normalizedEmail) result.email = true;
        const existingDomain = emailDomain(existingEmail);
        if (domain && existingDomain && existingDomain === domain) result.domain = true;
      }
      if (companyNorm && existingName && String(existingName).trim().toLowerCase() === companyNorm) {
        result.company = true;
      }
      if (normPhone && normPhone.length >= 6 && existingPhone) {
        const existingPhoneNorm = String(existingPhone).replace(/\D/g, '');
        if (existingPhoneNorm && existingPhoneNorm === normPhone) result.phone = true;
      }
    }
  } catch (err) {
    console.warn('[signup-guard] duplicate-trial lookup failed, failing OPEN:', err.message);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. IP reputation — best-effort reverse-DNS heuristic (see file header for
//    why this isn't a paid IP-intel API or a hardcoded CIDR list)
// ═══════════════════════════════════════════════════════════════════════════
const HOSTING_PTR_PATTERNS = [
  /amazonaws\.com$/i, /googleusercontent\.com$/i, /\.google\.com$/i,
  /azure/i, /cloudapp\.net$/i, /microsoft\.com$/i,
  /digitalocean\.com$/i, /linode\.com$/i, /vultr\.com$/i,
  /ovh\.(net|com)$/i, /hetzner\.(de|com)$/i, /contabo\.(net|de)$/i,
  /scaleway\.com$/i, /oraclecloud\.com$/i, /leaseweb\.(net|com)$/i,
  /alibaba(cloud)?\.com$/i, /tencent(cloud)?\.com$/i, /colocrossing\.com$/i,
  /m247\.(com|ro)$/i, /choopa\.com$/i, /hostwinds\.com$/i,
];

async function checkDatacenterIp(ip) {
  if (!ip || ip === 'unknown' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return { checked: false, flagged: false }; // no IPv4 to check (IPv6/unknown) — skip, don't guess
  }
  try {
    const hosts = await withTimeout(dns.promises.reverse(ip), 1500);
    const flagged = (hosts || []).some(h => HOSTING_PTR_PATTERNS.some(re => re.test(h)));
    return { checked: true, flagged, hostname: (hosts && hosts[0]) || null };
  } catch {
    // No PTR record is extremely common for ordinary residential/mobile IPs
    // and is NOT itself a signal — fail soft, never flag on lookup failure.
    return { checked: false, flagged: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Per-IP signup rate limit + device-fingerprint reuse dedup
// ═══════════════════════════════════════════════════════════════════════════
// Module-scoped, cleared on cold start — same acknowledged limitation as
// admin.js's own _rl/_presence maps ("Cleared on cold start; that's OK").
// At Helvaro's current signup volume this is a reasonable, zero-dependency
// first line of defense; a serverless-wide store (Redis/Postgres) would be
// the fix if volume ever makes cold-start resets matter.
const _signupRl = new Map(); // ip -> [timestamps]
function checkSignupRateLimit(ip) {
  if (!ip || ip === 'unknown') return { limited: false, count: 0 };
  const now = Date.now();
  const hits = (_signupRl.get(ip) || []).filter(t => now - t < RATE_LIMIT.WINDOW_MS);
  hits.push(now);
  _signupRl.set(ip, hits);
  if (_signupRl.size > 1000) {
    for (const [k, v] of _signupRl) if (!v.some(t => now - t < RATE_LIMIT.WINDOW_MS)) _signupRl.delete(k);
  }
  return { limited: hits.length > RATE_LIMIT.MAX_SIGNUPS_PER_IP, count: hits.length };
}

const _fpSeen = new Map(); // fingerprintHash -> lastSeenTs
function checkFingerprintReuse(fp) {
  if (!fp) return false;
  const now = Date.now();
  const last = _fpSeen.get(fp);
  _fpSeen.set(fp, now);
  if (_fpSeen.size > 2000) {
    for (const [k, t] of _fpSeen) if (now - t > FINGERPRINT_REUSE_WINDOW_MS) _fpSeen.delete(k);
  }
  return !!(last && (now - last) < FINGERPRINT_REUSE_WINDOW_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Website-existence check — see file header rule (b): this NEVER, by
//    itself, produces enough weight to flag a signup. Its only job is to add
//    a small amount of signal alongside everything else.
// ═══════════════════════════════════════════════════════════════════════════
async function checkWebsiteExists(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return { exists: null, checked: false }; // no URL given at all — neutral, not a signal
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return { exists: true, checked: true, status: r.status };
  } catch (err) {
    return { exists: false, checked: true, error: err && err.name };
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Orchestration
// ═══════════════════════════════════════════════════════════════════════════
/*
 * evaluateSignup(input) -> Promise<{
 *   score: number (0-100),
 *   decision: 'accept' | 'flag',   // NEVER 'reject' — see file header rule (a)
 *   reasons: string[],             // human-readable, persisted indefinitely (no raw PII)
 *   signals: object,                // raw evidence incl. ip/fingerprint — SHORT retention, see file header
 * }>
 * Never throws — every sub-check is individually fail-soft/fail-open; a
 * genuinely unexpected error here should be caught by the CALLER (admin.js
 * wraps this in .catch and treats a hard failure as 'accept' — fail open,
 * same direction as every other risk-vs-availability tradeoff in this repo).
 */
async function evaluateSignup({ email, companyName, phone, website, ip, deviceFingerprint, airtableToken, baseId }) {
  const reasons = [];
  let score = THRESHOLDS.BASE_SCORE;

  const domain = emailDomain(email);
  const normalizedEmail = normalizeEmail(email);

  const disposable = isDisposableDomain(domain);
  if (disposable) {
    score += WEIGHTS.DISPOSABLE_EMAIL;
    reasons.push('E-maildomein staat op de lijst van wegwerp-emailproviders.');
  }

  /* Consumentenadres: een signaal, geen grond om te weigeren. Zie WEIGHTS.
     Niet optellen bij een wegwerpadres -- dat is al zwaarder bestraft en
     tweemaal tellen voor "geen eigen domein" is dubbelop. */
  const freemail = !disposable && isFreemailDomain(domain);
  if (freemail) {
    score += WEIGHTS.FREEMAIL_EMAIL;
    reasons.push('E-mailadres is van een gratis consumentenprovider, niet van een eigen bedrijfsdomein.');
  }

  const mx = await checkMx(domain);
  if (mx.checked && !mx.ok) {
    score += WEIGHTS.MX_INVALID;
    reasons.push('E-maildomein heeft geen geldige mailserver (MX-record) of bestaat niet.');
  }

  const dup = await findDuplicateSignals(airtableToken, baseId, { normalizedEmail, domain, companyName, phone });
  if (dup.email)   { score += WEIGHTS.DUPLICATE_EMAIL;   reasons.push('E-mailadres (na normalisatie) komt al voor bij een bestaande klant.'); }
  if (dup.domain)  { score += WEIGHTS.DUPLICATE_DOMAIN;  reasons.push('E-maildomein komt al voor bij een bestaande klant.'); }
  if (dup.company) { score += WEIGHTS.DUPLICATE_COMPANY; reasons.push('Bedrijfsnaam komt al voor bij een bestaande klant.'); }
  if (dup.phone)    { score += WEIGHTS.DUPLICATE_PHONE;   reasons.push('Telefoonnummer komt al voor bij een bestaande klant.'); }

  const dc = await checkDatacenterIp(ip);
  if (dc.checked && dc.flagged) {
    score += WEIGHTS.DATACENTER_IP;
    reasons.push('IP-adres wijst (via reverse-DNS) naar een bekende hosting-/cloudprovider — mogelijk geen gewone consument.');
  }

  const fpReused = deviceFingerprint ? checkFingerprintReuse(deviceFingerprint) : false;
  if (fpReused) {
    score += WEIGHTS.FINGERPRINT_REUSED;
    reasons.push('Hetzelfde apparaat/browser-fingerprint werd recent al gebruikt voor een andere aanmelding.');
  }

  const site = await checkWebsiteExists(website);
  const noWebsite = !website || site.exists === false;
  if (noWebsite) {
    score += WEIGHTS.NO_WEBSITE;
    reasons.push('Geen (bereikbare) website gevonden — informatief, dit alleen is nooit een reden tot afwijzing.');
  }

  score = Math.max(THRESHOLDS.MIN_SCORE, Math.min(THRESHOLDS.BASE_SCORE, score));
  const decision = score >= THRESHOLDS.ACCEPT_AT_OR_ABOVE ? 'accept' : 'flag';

  if (!reasons.length) reasons.push('Geen bijzonderheden gevonden.');

  return {
    score,
    decision,
    reasons,
    signals: {
      capturedAt: new Date().toISOString(),
      ip: ip || null,
      fingerprintHash: deviceFingerprint || null,
      disposableEmail: disposable,
      mx,
      duplicateMatches: dup,
      datacenter: dc,
      website: site,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Retention helper — used by api/cron-followup.js's daily job to clear
//    `Signup Fraud Signals` once it's past SIGNALS_RETENTION_DAYS. Kept here
//    (not duplicated in cron-followup.js) because this file already owns the
//    shape of that JSON envelope (the `capturedAt` key).
// ═══════════════════════════════════════════════════════════════════════════
function isSignupSignalsExpired(rawJson, now = new Date()) {
  if (!rawJson) return false; // already empty — nothing to clear
  try {
    const parsed = JSON.parse(rawJson);
    const capturedMs = parsed && parsed.capturedAt ? Date.parse(parsed.capturedAt) : NaN;
    if (!isFinite(capturedMs)) return false; // unparseable — leave it alone, don't guess-delete
    return (now.getTime() - capturedMs) >= SIGNALS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

module.exports = {
  FIELD_NAME,
  WEIGHTS,
  THRESHOLDS,
  RATE_LIMIT,
  SIGNALS_RETENTION_DAYS,
  normalizeEmail,
  emailDomain,
  extractDomainFromUrl,
  isDisposableDomain,
  checkMx,
  findDuplicateSignals,
  checkDatacenterIp,
  checkSignupRateLimit,
  checkFingerprintReuse,
  checkWebsiteExists,
  evaluateSignup,
  isSignupSignalsExpired,
  isFreemailDomain, FREEMAIL_DOMAINS,
};
