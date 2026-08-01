// Vercel cron. Runs daily at 09:00 UTC (10:00-11:00 CET).
// Social posting (IG/FB/LinkedIn) moved off Vercel to the VPS "Herald" service
// (PM2 + node-cron) — see fix/strip-vercel-posting. This file no longer
// generates content, backfills images, or posts anywhere.
// Sends a follow-up WhatsApp to leads that:
//   - Status is still 'new'
//   - Were created at least 24h ago, and no more than 7 days ago (catch-up
//     window — see the ago24h/ago7d comment below for why it's not a tight
//     24h-48h band anymore)
//   - Haven't received a follow-up yet (Conversation History has only 1 AI message)

// Marketing Posts + Outreach moved off Airtable to the VPS Postgres API
// (Airtable-shaped facade). Leads/Client Config etc. stay in Airtable.
const { pgFetch } = require('./_pgapi');
// SSRF-protected website fetcher, shared with api/whatsapp.js — see
// api/lib/fetch-website.js. runOutreach() below fetches Apify-scraped
// prospect websites (third-party, untrusted input), same SSRF exposure as
// whatsapp.js fetching a client's own website.
const { fetchWebsite } = require('./lib/fetch-website');
// Credit/usage accounting — see its file header for the fail-open contract.
const credits = require('./_credits');
// Trial/plan-status interpretation (pure, no I/O) — see its file header.
const { getPlanState, computeTrialStartMs, FIELD: PLAN_FIELD } = require('./_plan');
// Language registry — used here for template-language Meta-approval
// fallback + locale-aware appointment-date formatting. See its file header.
const _lang = require('./_lang');
// aggregateReportPeriod: the SAME honest-numbers aggregation the dashboard's
// Resultaten panel uses (api/leads.js's report-summary mode) — reused here
// for the trial day-7/day-11 emails per TRIAL-DESIGN.md §5 ("the ROI report
// IS the sales pitch"). Attached as a named export on top of the default
// route handler — see leads.js's own comment at the bottom of that file.
// getClientWaPhoneNumberId: per-client WhatsApp sender lookup (multitenancy
// prep). Blank on every client today (single shared number) — resolves to
// '' and every call site below falls back to the shared PHONE_NUMBER_ID env
// var exactly like before. Reused here (5-min TTL cache, keyed by
// projectCode, already built in leads.js) instead of writing a second
// Airtable-call-per-lead helper — see api/whatsapp.js's F_WA_PHONE_NUMBER_ID
// comment for the full multitenancy-prep contract this mirrors.
const { aggregateReportPeriod, getClientWaPhoneNumberId } = require('./leads');

// ── Compliance fix 5 (COMPLIANCE-AUDIT.md section 4.1) — fixed,
// code-controlled outreach footer ───────────────────────────────────────
// The opt-out line used to be INSTRUCTED to the LLM ("Sluit af met een
// opt-out...") as part of the generated body — with nothing enforcing it
// actually survived every generation (paraphrasing drift, max_tokens
// truncation, etc.). buildOutreachFooter() below is appended AFTER the
// LLM-generated body in runOutreach(), so the opt-out + legal-entity
// identification (Belgian e-Privacy / commercial-communication
// traceability requirements, see COMPLIANCE-AUDIT.md section 4.1) are
// ALWAYS present regardless of what the model emits.
//
// LEGAL_ENTITY_NAME defaults to 'Helvaro BV' — the real legal name already
// used throughout server/routes/privacy.js / api/privacy.js's Terms of
// Service copy. LEGAL_ADDRESS/VAT_NUMBER have NO safe default (only Sindi
// has the exact statutory address and enterprise/VAT number — same
// [TODO: Sindi] facts left open in docs/verwerkersovereenkomst-DPA.md) —
// left as an explicit, obviously-a-placeholder bracketed string rather
// than silently sending blank/`undefined` text to a real prospect. Set
// LEGAL_ADDRESS (and ideally VAT_NUMBER) via env var before this cron is
// allowed to send real outreach mail; see COMPLIANCE-FIX1-SUMMARY.md.
const LEGAL_ENTITY_NAME = process.env.LEGAL_ENTITY_NAME || 'Helvaro BV';
const LEGAL_ADDRESS = process.env.LEGAL_ADDRESS || '[LEGAL_ADDRESS niet ingesteld — zet env var LEGAL_ADDRESS]';
const VAT_NUMBER = process.env.VAT_NUMBER || '';

function buildOutreachFooter() {
  return `\n\n—\n${LEGAL_ENTITY_NAME}, ${LEGAL_ADDRESS}${VAT_NUMBER ? ' · ' + VAT_NUMBER : ''}\nNiet interessant? Antwoord met "stop" en je hoort niets meer van ons.`;
}

// ── Plan-status gate for automated nurture/reminder WhatsApp TEMPLATE sends ──
// TRIAL-DESIGN.md §7 + this task's own instruction: "skip all automated
// nurture/reminder sends for expired clients — don't burn paid WhatsApp
// templates for someone who isn't paying." Used by the main follow-up loop
// and runAppointmentReminders() below (both send Meta-billed templates to
// LEADS, not to the business owner). Deliberately NOT used by
// runTrialLifecycle()'s own emails (those exist specifically BECAUSE a
// client is on trial/expired) or by api/whatsapp.js's inbound-message
// handling (that has its own date-derived getPlanState() check per message,
// see its own comment — this cache would be stale across the whole
// container lifetime, wrong tradeoff for a hot path; it's the right
// tradeoff here because a single cron run is short-lived and many leads
// share the same handful of clients).
// Per-cron-run cache keyed by projectCode (pass a `new Map()` from the
// caller, shared across one loop's iterations — never across cron runs).
// Fails OPEN: a lookup failure (network hiccup, Airtable down) resolves to
// "not stopped" so a real client's legitimate reminder is never silently
// swallowed by an accounting/lookup problem, same fail-open contract as
// api/_plan.js itself.
async function isServiceStoppedForProject(airtableToken, baseId, projectCode, cache) {
  if (!projectCode) return false;
  if (cache.has(projectCode)) return cache.get(projectCode);
  let stopped = false;
  try {
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${projectCode.replace(/"/g, '\\"')}"`);
    const r = await fetch(
      `https://api.airtable.com/v0/${baseId}/tblPidTrwGRzRt4LZ?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (r.ok) {
      const d = await r.json();
      const rec = (d.records || [])[0];
      if (rec) stopped = getPlanState(rec.fields || {}).isServiceStopped;
    }
  } catch (err) {
    console.warn(`[cron-followup] plan-status lookup failed for ${projectCode}, failing OPEN (send proceeds):`, err.message);
  }
  cache.set(projectCode, stopped);
  return stopped;
}

module.exports = async function handler(req, res) {
  // Vercel calls cron endpoints with GET; block other methods
  if (req.method !== 'GET') return res.status(405).end();

  // Protect with CRON_SECRET so only Vercel can trigger this
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  // Shared-number FALLBACK ONLY. Never send with this directly for a
  // per-lead/per-appointment message — resolve the client's own
  // WhatsApp Phone Number ID first (getClientWaPhoneNumberId /
  // runAppointmentReminders' own client-record lookup below) and fall back
  // to this only when that field is blank, exactly like api/whatsapp.js and
  // api/leads.js already do. Still used directly for the quality-rating
  // check below — that call monitors the shared platform number's own
  // Meta rating for ops alerting, not a per-client send, so it has nothing
  // to resolve per-client.
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;

  const now    = new Date();
  const ago24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  // Upper bound widened from 48h to 7 days. The original tight 24h-48h band
  // meant a single missed or rate-limited cron run (see the 429 early-return
  // right below) shifted every lead that was sitting in that window past 48h
  // old before the *next* run — so they aged out of the query and silently
  // never got a follow-up ("permanent skip window"). Safe to widen: a lead's
  // Conversation State flips 'new' -> 'in_progress' the moment a follow-up
  // actually sends (below), so it drops out of this "new" query on its own —
  // widening the catch-up window can't cause a duplicate send, it just gives
  // a missed run up to a week to be caught by the next one before the lead
  // ages out of consideration entirely.
  const ago7d  = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Fetch leads created 24h-7d ago that are still 'new'
    // Use field IDs in formula. Immune to field renames in Airtable
    const formula = encodeURIComponent(
      `AND({fld8mkrEWcyq7mUip}="new",{fldR0r13EU4RwrtvH}<"${ago24h}",{fldR0r13EU4RwrtvH}>"${ago7d}")`
    );
    const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&pageSize=50`;
    const lRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });

    if (lRes.status === 429) {
      console.warn('[cron-followup] Airtable 429. follow-ups uitgesteld tot morgen');
      return res.status(200).json({ checked: 0, sent: 0, skipped: 'rate_limited' });
    }
    const lData = await lRes.json();
    if (!lRes.ok) throw new Error('Airtable ' + lRes.status);

    const leads = lData.records || [];
    let sent = 0;
    const followedUp = [];
    // Per-run cache — see isServiceStoppedForProject()'s own header.
    const planCache = new Map();

    for (const lead of leads) {
      const phone = lead.fields['fld6YaitW0lMqHUrd'] || lead.fields['Phone'] || '';
      const name  = lead.fields['fldbk0LVNckOU0bqA']  || lead.fields['Name']  || '';
      if (!phone) continue;

      // Only send if conversation has ≤1 AI message (lead never replied)
      let history = [];
      try { history = JSON.parse(lead.fields['Conversation History'] || '[]'); } catch { history = []; }
      const userReplies = history.filter(m => m.role === 'user').length;
      if (userReplies > 0) continue; // They replied. No follow-up needed

      // AI-PAUSE GUARD (human takeover). A staff member can pause the AI for a
      // lead from the dashboard; whatsapp.js honours that on inbound messages,
      // but this cron would otherwise still fire an automated nudge ON TOP of
      // the human who deliberately took the conversation over — exactly the
      // collision the takeover feature exists to prevent. Same Notities JSON
      // envelope + same read semantics as whatsapp.js's getAiPauseInfo().
      if (isAiPaused(lead.fields['fldoLRI5W12ThTls7'] || lead.fields['Notities'])) {
        console.log(`[cron-followup] lead ${phone} is AI-paused (mens aan het roer) — automatische nudge overgeslagen`);
        continue;
      }

      // PLAN-STATUS GUARD — don't burn a paid WhatsApp template nudging a
      // lead on behalf of a client whose service has stopped. See
      // isServiceStoppedForProject()'s header for the fail-open contract.
      const projectCodeForPlan = lead.fields['fldSmczuyUJd26HLe'] || lead.fields['Project Code'] || '';
      if (await isServiceStoppedForProject(AIRTABLE_TOKEN, BASE_ID, projectCodeForPlan, planCache)) {
        console.log(`[cron-followup] lead ${phone} — klant ${projectCodeForPlan} plan gestopt, automatische follow-up overgeslagen`);
        continue;
      }

      const firstName = name.split(' ')[0] || name;
      const msg = `Hé ${firstName}, we hebben je bericht gekregen maar nog niks teruggehoord. Is er iets waarmee ik je kan helpen?`;

      // ── 24-uurs venster: na 24u STIL mag je geen freeform meer sturen ─────
      // (Meta-policy: account-bans bij overtreding). Stuur een goedgekeurde
      // template als die geconfigureerd is. Anders: skip de follow-up. Beter
      // geen follow-up dan een account-ban.
      // Template moet vooraf in WhatsApp Manager → Message Templates worden
      // aangemaakt en goedgekeurd. Variabele {{1}} = de voornaam.
      const TEMPLATE_NAME = process.env.FOLLOWUP_TEMPLATE_NAME;
      // This loop doesn't fetch the client record (lead-only query, kept
      // that way to avoid an extra Airtable call per lead — see the 429
      // sensitivity notes elsewhere in this file), so it can't read the
      // client's own Language field the way the appointment-reminder loop
      // below does. resolveTemplateLanguage() still guards the env var
      // itself: if FOLLOWUP_TEMPLATE_LANG is ever set to a language with no
      // approved Meta template, this falls back to 'nl' (logged) instead of
      // sending a template call that Meta will reject.
      const TEMPLATE_LANG = _lang.resolveTemplateLanguage(process.env.FOLLOWUP_TEMPLATE_LANG || 'nl', 'nl').code;
      if (TEMPLATE_NAME) {
        // Per-client sender number (multitenancy prep). Resolved INSIDE the
        // loop, per lead, from THIS lead's own projectCodeForPlan — never
        // hoisted out. Hoisting this above the loop would send every
        // client's follow-up from whichever client happened to resolve
        // first, which is exactly the cross-client leak this task exists to
        // prevent. getClientWaPhoneNumberId() has its own 5-min TTL cache
        // keyed by projectCode (see api/leads.js), so this doesn't add an
        // Airtable call per lead beyond the first lead for each distinct
        // client in a run. Blank field (every client today) resolves to ''
        // and falls back to the shared PHONE_NUMBER_ID — unchanged behaviour.
        const leadSenderPnid = await getClientWaPhoneNumberId(projectCodeForPlan, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
        const leadPhoneNumberId = leadSenderPnid || PHONE_NUMBER_ID;
        await sendWATemplate(phone, TEMPLATE_NAME, TEMPLATE_LANG, [firstName], leadPhoneNumberId, WHATSAPP_TOKEN);
      } else {
        console.warn(`[cron-followup] FOLLOWUP_TEMPLATE_NAME niet geconfigureerd. Skip ${phone} (freeform >24u zou ban riskeren)`);
        continue;  // skip. Don't risk a Meta ban
      }

      // Mark follow-up sent. Prevents duplicate follow-ups on next cron run
      const pRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${lead.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { fld8mkrEWcyq7mUip: 'in_progress' } })
        }
      );
      if (!pRes.ok) {
        console.error(`[cron-followup] PATCH mislukt voor ${lead.id} (${pRes.status}). lead wordt morgen opnieuw geprobeerd`);
      }

      sent++;
      followedUp.push(name || phone);
      // Slight delay to avoid WhatsApp rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[cron-followup] Checked ${leads.length} leads, sent ${sent} follow-ups`);

    // ── Safety-net sweep: leads stuck at 'new' with an EMPTY history ────────
    // Defense-in-depth for the delayed-send bug in api/form.js and
    // api/whatsapp.js (see their waitUntil comments): if the container
    // running a delayed WhatsApp send got frozen/recycled before it
    // completed, Airtable never learns the send failed — the lead just sits
    // silently invisible. This runs every cron regardless of the 24h/48h
    // window above, so it catches it fast rather than waiting a full day.
    const stuckNewResult = await sweepStuckNewLeads(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
      console.error('[cron-followup] stuck-new sweep failed:', e.message);
      return null;
    });

    // ── 24h appointment reminders ────────────────────────────────────────────
    // Appointments table already has "Reminder Sent" (fldadjeKPJ2TLiQSA) —
    // the field existed but nothing ever wrote to it. See
    // runAppointmentReminders()'s own doc comment below for the reminder
    // window logic and the idempotency guard.
    const reminderResult = await runAppointmentReminders(AIRTABLE_TOKEN, BASE_ID, PHONE_NUMBER_ID, WHATSAPP_TOKEN, now).catch(e => {
      console.error('[cron-followup] appointment reminders failed:', e.message);
      return null;
    });

    // ── Data retention: anonymize disqualified/cold leads 6 months after
    // their last activity (compliance fix, ported from the VPS backend's
    // server/jobs/daily.js — see COMPLIANCE-AUDIT.md section 1.3 / Decision
    // 2). See runRetentionAnonymization()'s own doc comment below for the
    // exact eligibility rule and the two documented Airtable-vs-Postgres
    // differences from the VPS original.
    const retentionResult = await runRetentionAnonymization(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE, now).catch(e => {
      console.error('[cron-followup] retention anonymization failed:', e.message);
      return null;
    });

    // ── GDPR: short-retention cleanup of raw signup-fraud signals (IP,
    // device-fingerprint hash) captured by the public-signup fraud guard
    // (api/_signup-guard.js, only active when PUBLIC_SIGNUP_ENABLED is set —
    // see api/admin.js's onboard-mode block). Same "reuse the existing
    // retention job, don't invent a parallel scheme" instruction as the lead
    // anonymization above — this just clears a different field, on Client
    // Config instead of Leads. See runSignupSignalsRetention()'s own doc
    // comment below.
    const signupSignalsResult = await runSignupSignalsRetention(AIRTABLE_TOKEN, BASE_ID, now).catch(e => {
      console.error('[cron-followup] signup-signals retention failed:', e.message);
      return null;
    });

    // ── Daily summary email ──────────────────────────────────────────────────
    if (sent > 0) {
      const escE = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rows = followedUp.map(n =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escE(n)}</td></tr>`
      ).join('');
      sendResendEmail({
        subject: `Helvaro. ${sent} follow-up${sent > 1 ? 's' : ''} verstuurd vandaag`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1e6fd9">Dagelijkse follow-up update</h2>
            <p style="color:#444">${sent} van ${leads.length} onderzochte leads ontvingen vandaag een WhatsApp follow-up:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:8px">
              <thead><tr><th style="text-align:left;padding:6px 10px;background:#f5f5f5;color:#666;font-size:12px">Lead naam</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
          </div>`
      }).catch(() => {});
    }

    // ── Quality rating check (daily) ──────────────────────────────────────────
    // Pulls the current WhatsApp quality rating for our phone number. If it's
    // YELLOW or RED, fire an email alert so Helvaro support can act before Meta
    // throttles or bans the number.
    const qualityResult = await checkQualityRating(PHONE_NUMBER_ID, WHATSAPP_TOKEN).catch(e => {
      console.error('[cron-followup] quality check failed:', e.message);
      return null;
    });

    // ── Weekly client report (Mondays) ───────────────────────────────────────
    // Stuurt elke maandag (UTC) een overzichts-email naar elke klant met hun
    // Rapport Email ingesteld. Per-klant: leads/week, qualified, conversie, top 5.
    let weeklyResult = null;
    let learningResult = null;
    if (now.getUTCDay() === 1) {   // 0=Sun, 1=Mon
      weeklyResult = await sendWeeklyClientReports(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
        console.error('[cron-followup] weekly report failed:', e.message);
        return null;
      });
      // Wekelijkse AI learning loop — analyseert per klant de afgelopen 7 dagen
      // en update 'AI Learned Patterns' veld. AI wordt elke maandag iets
      // slimmer per klant op basis van wat in praktijk werkte.
      learningResult = await runWeeklyLearning(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
        console.error('[cron-followup] learning loop failed:', e.message);
        return null;
      });
    }

    // ── Trial lifecycle (daily, every client with Plan Status='trial') ──────
    // TRIAL-DESIGN.md §4/§7: day-11 "3 dagen resterend" nudge + Sindi alert,
    // day-7 "wat Helvaro deze week deed" report, and the trial->expired flip
    // once Trial Ends At has passed. Runs every day (not gated to Mondays —
    // unlike the weekly report above, this has its own once-only markers per
    // client, see runTrialLifecycle()'s own header). Entirely independent of
    // api/whatsapp.js's OWN date-derived expiry check (getPlanState()) — this
    // cron is what performs the one-time Plan Status write + sends the
    // touchpoint emails, it isn't what makes expiry take effect.
    const trialResult = await runTrialLifecycle(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
      console.error('[cron-followup] trial lifecycle failed:', e.message);
      return null;
    });

    // ── Envoy: gepersonaliseerde outreach naar verse Apify-leads (server-side) ──
    const outreachResult = await runOutreach(AIRTABLE_TOKEN, BASE_ID).catch(e => {
      console.error('[cron-followup] outreach failed:', e.message);
      return null;
    });

    return res.status(200).json({ checked: leads.length, sent, stuckNew: stuckNewResult, reminders: reminderResult, retention: retentionResult, signupSignals: signupSignalsResult, quality: qualityResult, weekly: weeklyResult, learning: learningResult, trial: trialResult, outreach: outreachResult });

  } catch (err) {
    console.error('[cron-followup] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Safety-net sweep for leads stuck at 'new' with an empty history ─────────
// api/form.js sends the first WhatsApp message from inside a 45s setTimeout,
// and api/whatsapp.js persists each AI turn only after a 25-55s delayed send.
// Both are now registered with waitUntil() (see comments in those files), but
// that's a best-effort platform guarantee, not a certainty — Promises passed
// to waitUntil() still share the function's own maxDuration, and a future
// regression could reintroduce the original bug anyway. This sweep is the
// backstop: it doesn't trust that the delayed send happened, it checks.
//
// Threshold: 15 minutes. The delay itself is at most 45s (form.js) or 55s
// (whatsapp.js), and even a stalled Airtable 429 retry adds at most ~30s on
// top (see atFetch in both files) — so a healthy send completes within about
// 90s worst case. 15 minutes gives a wide, deliberately generous margin for
// cold starts and transient retries so this sweep only ever fires on leads
// that are genuinely stuck, never on ones still legitimately in flight.
// There's no upper bound on age: once a lead is flagged (waFailed:true in
// Notities) the FIND(...)=0 clause below excludes it from future runs, so
// older unresolved leads simply get caught (and stop reappearing) on
// whichever day's cron run first sees them, at up to 50/run.
async function sweepStuckNewLeads(airtableToken, baseId, leadsTable) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const formula = encodeURIComponent(
    `AND({fld8mkrEWcyq7mUip}="new", {Conversation History}="", {fldR0r13EU4RwrtvH}<"${cutoff}", FIND("waFailed", {fldoLRI5W12ThTls7})=0)`
  );
  const url = `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${formula}&pageSize=50`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
  if (r.status === 429) {
    console.warn('[cron-followup] stuck-new sweep: Airtable 429, uitgesteld tot volgende run');
    return { checked: 0, flagged: 0, skipped: 'rate_limited' };
  }
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const data  = await r.json();
  const stuck = data.records || [];

  let flagged = 0;
  for (const lead of stuck) {
    try {
      const merged = mergeWaFailedFlag(lead.fields['fldoLRI5W12ThTls7'] || lead.fields['Notities']);
      const pr = await fetch(
        `https://api.airtable.com/v0/${baseId}/${leadsTable}/${lead.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { fldoLRI5W12ThTls7: merged } })
        }
      );
      if (pr.ok) flagged++;
      else console.error(`[cron-followup] stuck-new flag PATCH mislukt voor ${lead.id} (${pr.status})`);
    } catch (err) {
      console.error(`[cron-followup] stuck-new flag exception voor ${lead.id}:`, err.message);
    }
    // Slight delay to avoid Airtable rate limits, same pattern as the main loop above
    await new Promise(res => setTimeout(res, 300));
  }
  console.log(`[cron-followup] stuck-new sweep: checked ${stuck.length}, flagged ${flagged}`);
  return { checked: stuck.length, flagged };
}

// ── Compliance fix: data retention — anonymize disqualified/cold leads 6
// months after their last activity (GDPR Art. 5(1)(e), COMPLIANCE-AUDIT.md
// section 1.3 / Decision 2 — "keep qualified leads indefinitely, anonymize
// disqualified/cold leads 6 months after last activity"). Ported from the
// VPS backend's server/jobs/daily.js runRetentionAnonymization() +
// server/db/index.js's listRetentionEligibleLeads(), reimplemented against
// Airtable's filterByFormula instead of a parameterized SQL WHERE clause —
// see the two documented differences below.
//
// Eligibility (all four ANDed in the formula below):
//   1. NOT qualified. Airtable checkbox fields have no NULL state reachable
//      via the API (never-checked reads back exactly like explicitly
//      unchecked — both are simply falsy/absent) — unlike the VPS's
//      Postgres `qualified` column, which can be NULL (still undecided) vs
//      false (explicitly disqualified), and which the VPS deliberately only
//      matches on the latter. This Airtable port can't make that
//      distinction on Qualified alone, so clause 2 below is what actually
//      keeps a still-open, undecided lead safe.
//   2. Cold/terminal: Conversation State is completed/verloren, OR
//      Conversation History is empty (mirrors sweepStuckNewLeads()'s own
//      `{Conversation History}=""` convention above — a created-but-never-
//      really-started lead). A lead still 'new'/'in_progress' WITH real
//      conversation content never matches this clause no matter how old it
//      is — it's still being actively pursued. Combined with clause 1, this
//      is the actual safety gate against catching an undecided-but-live
//      lead, standing in for the NULL-vs-false distinction Airtable can't
//      express.
//   3. Last activity older than 6 months. Airtable's Leads table has no
//      last-modified timestamp field — the VPS's Postgres `updated_at`
//      (trigger-bumped on every write) has no Airtable equivalent — so
//      Created At (fldR0r13EU4RwrtvH) is used as the best available proxy,
//      same "pick the best available signal in the schema and document it"
//      instruction the VPS's own listRetentionEligibleLeads() comment
//      follows. KNOWN GAP: a lead with real activity (e.g. a manually-added
//      note) after creation but before the cutoff would still be caught by
//      Created At alone, since this schema has nothing to distinguish that
//      from a lead that's been silent since it was created. Follow-up:
//      Airtable's built-in "Last Modified Time" field type could close this
//      gap, but adding any field is a schema change to the live base —
//      that's the owner's call, not this batch's (see
//      VERCEL-DEPLOY-CHECKLIST.md's known-gaps section).
//   4. Not already anonymized — Name != '[verwijderd]' (the same placeholder
//      api/leads.js's lead-delete mode writes). Without this, an
//      already-anonymized lead would be re-selected and re-logged by this
//      sweep every single day forever.
//
// Fail-soft per lead, same pattern as sweepStuckNewLeads() above: one
// lead's anonymize failure never aborts the rest of the batch, and a lead
// not reached this run (pageSize cap, same as sweepStuckNewLeads) is simply
// picked up by tomorrow's run — idempotent, since clause 4 excludes it the
// moment it's anonymized.
const RETENTION_MONTHS = 6;
function retentionCutoffIso(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  return cutoff.toISOString();
}

async function runRetentionAnonymization(airtableToken, baseId, leadsTable, now = new Date()) {
  const cutoff = retentionCutoffIso(now);
  const formula = encodeURIComponent(
    `AND(NOT({fld0hAZJ5wgaXrNTn}), OR({fld8mkrEWcyq7mUip}="completed", {fld8mkrEWcyq7mUip}="verloren", {Conversation History}=""), {fldR0r13EU4RwrtvH}<"${cutoff}", {fldbk0LVNckOU0bqA}!="[verwijderd]")`
  );
  const url = `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${formula}&pageSize=50`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
  if (r.status === 429) {
    console.warn('[cron-followup] retention: Airtable 429, uitgesteld tot volgende run');
    return { checked: 0, anonymized: 0, skipped: 'rate_limited' };
  }
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const data = await r.json();
  const eligible = data.records || [];

  // Same scrubbed-field set as api/leads.js's lead-delete (anonymize) mode:
  // overwrite only Name/Phone/Conversation History/Last Message/AI Summary/
  // Notities, leaving every aggregate/analytics field (Qualified, Lead
  // Score, Ability/Urgency/Fit, Conversation State, Booking Link Sent,
  // Appointment Booked, Bron, Verwachte Waarde, Response Time, Reason,
  // Opgepikt, Created At) untouched so dashboard stats survive.
  let anonymized = 0;
  for (const lead of eligible) {
    try {
      const anonFields = {
        fldbk0LVNckOU0bqA: '[verwijderd]',      // Name
        fld6YaitW0lMqHUrd: null,                 // Phone
        'Conversation History': JSON.stringify([]),
        'Last Message': '',
        fldqerIiw5qyQjXHr: '',                   // AI Summary
        fldoLRI5W12ThTls7: '',                   // Notities
      };
      const pr = await fetch(
        `https://api.airtable.com/v0/${baseId}/${leadsTable}/${lead.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: anonFields })
        }
      );
      if (pr.ok) {
        anonymized++;
        const projectCode = lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code'] || '';
        console.log(`[erasure] action=retention-anonymize id=${lead.id} projectCode=${projectCode} actor=system ts=${new Date().toISOString()}`);
      } else {
        console.error(`[cron-followup] retention-anonymize PATCH mislukt voor ${lead.id} (${pr.status})`);
      }
    } catch (err) {
      console.error(`[cron-followup] retention-anonymize exception voor ${lead.id}:`, err.message);
    }
    // Slight delay to avoid Airtable rate limits, same pattern as sweepStuckNewLeads above
    await new Promise(res => setTimeout(res, 200));
  }
  console.log(`[cron-followup] retention: checked ${eligible.length}, anonymized ${anonymized}`);
  return { checked: eligible.length, anonymized };
}

// ── GDPR: clear short-retention signup-fraud signals (IP, device-fingerprint
// hash) on Client Config records, once past their retention window.
//
// Only the public-signup fraud guard (api/_signup-guard.js, wired into
// api/admin.js's onboard-mode block, active only when PUBLIC_SIGNUP_ENABLED
// is set) ever writes the `Signup Fraud Signals` field — a JSON blob tagged
// with its own `capturedAt`. This job does NOT touch `Signup Trust Score` /
// `Signup Review Status` / `Signup Fraud Reasons`: those are Sindi's ongoing
// audit trail (a number and human-written reason categories, not personal
// data on their own — see _signup-guard.js's file header) and are kept
// indefinitely. Only the raw IP + fingerprint hash inside `Signup Fraud
// Signals` are "only useful at signup" and get cleared.
//
// Scans EVERY Client Config record (same "Helvaro-scale: low dozens of
// clients, fetch-all is fine" assumption as _credits.js's
// getAllUsageSummaries() and _signup-guard.js's findDuplicateSignals()) —
// there's no Airtable filterByFormula that can parse JSON and compare a
// nested capturedAt date, so eligibility is decided in JS via
// signupGuard.isSignupSignalsExpired() (the same helper that owns the
// envelope's shape), not in the fetch formula. Fail-soft per record, same
// pattern as runRetentionAnonymization() above: one record's PATCH failure
// never aborts the rest of the batch.
async function runSignupSignalsRetention(airtableToken, baseId, now = new Date()) {
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
  const signupGuard = require('./_signup-guard');
  const SIGNALS_FIELD = signupGuard.FIELD_NAME.SIGNALS; // 'Signup Fraud Signals'

  const url = `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?pageSize=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
  if (r.status === 429) {
    console.warn('[cron-followup] signup-signals retention: Airtable 429, uitgesteld tot volgende run');
    return { checked: 0, cleared: 0, skipped: 'rate_limited' };
  }
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const data = await r.json();
  const records = data.records || [];

  const eligible = records.filter(rec => {
    const raw = (rec.fields || {})[SIGNALS_FIELD];
    return raw && signupGuard.isSignupSignalsExpired(raw, now);
  });

  let cleared = 0;
  for (const rec of eligible) {
    try {
      const pr = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}/${rec.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { [SIGNALS_FIELD]: '' } })
        }
      );
      if (pr.ok) {
        cleared++;
        const projectCode = rec.fields?.['fldN4dL0bGgfBOXwM'] || rec.fields?.['Project Code'] || '';
        console.log(`[erasure] action=signup-signals-clear id=${rec.id} projectCode=${projectCode} actor=system ts=${new Date().toISOString()}`);
      } else {
        console.error(`[cron-followup] signup-signals-clear PATCH mislukt voor ${rec.id} (${pr.status})`);
      }
    } catch (err) {
      console.error(`[cron-followup] signup-signals-clear exception voor ${rec.id}:`, err.message);
    }
    await new Promise(res => setTimeout(res, 200));
  }
  console.log(`[cron-followup] signup-signals retention: checked ${records.length}, expired ${eligible.length}, cleared ${cleared}`);
  return { checked: records.length, expired: eligible.length, cleared };
}

// Merge a waFailed:true marker into a lead's existing Notities JSON without
// clobbering notes/tasks/calls a client may already have added manually.
// Same helper as api/whatsapp.js's mergeWaFailedFlag (duplicated here — each
// api/*.js file in this codebase is a standalone Vercel function with no
// shared module, matching the existing pattern of small per-file helpers
// like escEmail/sanitize appearing independently across these files).
//
// Notities isn't always JSON: dashboard.js's parseNotities() also accepts
// bare legacy text (pre-JSON-envelope manual notes) and wraps it as a
// {id:'legacy', text, ts} note on read. Preserve that instead of discarding
// it when we merge in the flag.
// Is the AI paused for this lead (a human took the conversation over from the
// dashboard)? Reads the same `aiPaused` key inside the Notities JSON envelope
// that api/leads.js's ai-pause/ai-resume modes write and api/whatsapp.js's
// getAiPauseInfo() reads — kept byte-compatible with that reader on purpose.
// Non-JSON / legacy plain-text Notities simply means "not paused".
// Every automated LEAD-facing send in this cron must consult this first: an
// automated message landing on top of a human mid-conversation is precisely
// what the takeover feature exists to prevent.
function isAiPaused(raw) {
  const trimmed = raw ? String(raw).trim() : '';
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return !!(parsed && parsed.aiPaused && typeof parsed.aiPaused === 'object');
  } catch {
    return false;
  }
}

function mergeWaFailedFlag(raw) {
  const trimmed = raw ? String(raw).trim() : '';
  let data    = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch { /* malformed JSON: fall through, preserve as legacy text below */ }
  }
  if (!handled && trimmed) {
    data.notes = [{ id: 'legacy', text: trimmed, ts: new Date().toISOString() }];
  }
  data.waFailed = true;
  return JSON.stringify(data);
}

// ── Quality rating check ─────────────────────────────────────────────────────
// Calls the Meta Graph API to fetch this phone number's current quality rating.
// Meta returns "GREEN" / "YELLOW" / "RED" / "UNKNOWN". RED = throttling imminent
// or already happening; YELLOW = warning. Fires an email so support can act.
async function checkQualityRating(phoneNumberId, token) {
  if (!phoneNumberId || !token) return null;
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=quality_rating,name_status,verified_name`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('[quality] Meta fout', r.status, txt.slice(0, 200));
    return null;
  }
  const d = await r.json();
  const quality = d.quality_rating || 'UNKNOWN';
  console.log('[quality] rating =', quality, '| name_status =', d.name_status);

  if (quality === 'RED' || quality === 'YELLOW') {
    const severity = quality === 'RED' ? '[KRITIEK]' : '[Waarschuwing]';
    sendResendEmail({
      subject: `${severity} WhatsApp quality rating ${quality}. actie nodig`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
          <h2 style="color:${quality === 'RED' ? '#dc2626' : '#d97706'}">WhatsApp Quality: ${quality}</h2>
          <p>De WhatsApp Business phone number quality is gezakt naar <strong>${quality}</strong>.</p>
          ${quality === 'RED'
            ? '<p style="background:#fef2f2;padding:12px;border-radius:8px;color:#b91c1c"><strong>RED = throttling actief.</strong> Meta beperkt het aantal berichten dat je per dag mag sturen. Bij meerdere RED-dagen riskeer je een permanente ban.</p>'
            : '<p style="background:#fffbeb;padding:12px;border-radius:8px;color:#92400e"><strong>YELLOW = waarschuwing.</strong> Te veel blocks of spam-reports. Quality zakt verder als je niks doet.</p>'}
          <h3 style="margin-top:24px">Wat nu doen</h3>
          <ul style="line-height:1.7">
            <li>Check welke klanten templates gebruiken die spammy zijn</li>
            <li>Verifieer dat alle leads echt opt-in zijn (formulier gecheckt)</li>
            <li>Pauzeer eventueel outbound campagnes voor 48u tot quality herstelt</li>
            <li>Open <a href="https://business.facebook.com/wa/manage/phone-numbers" style="color:#1e6fd9">WhatsApp Manager → Phone Numbers</a> voor details</li>
          </ul>
          <p style="font-size:12px;color:#999;margin-top:24px">Phone Number ID: ${phoneNumberId}<br>Verified name: ${d.verified_name || '—'} (status: ${d.name_status || '—'})</p>
        </div>`
    }).catch(() => {});
  }
  return { quality, name_status: d.name_status };
}

// ── Email helper (SMTP primary, Resend fallback via _mailer) ─────────────────
async function sendResendEmail({ subject, html, to }) {
  const addr = to || process.env.NOTIFY_EMAIL;
  if (!addr) { console.warn('[cron mail] geen ontvanger'); return; }
  const { sendMail } = require('./_mailer');
  await sendMail({ to: addr, subject, html })
    .catch(err => console.error('[cron mail]', err && err.message));
}

// Server-side mirror of dashboard.js's parseDealValue / api/leads.js's
// parseDealValueServer (that copy is client-side JS embedded in an HTML
// template string, so it can't be require()'d here — same per-file helper
// duplication convention this codebase already uses elsewhere). MUST stay
// behaviorally identical: batch C fixed a bug where Belgian/Dutch-formatted
// values like "€ 1.500,00" parsed as 1.5 instead of 1500. Do not change this
// logic here without changing it in the other two copies too (grep
// parseDealValue across the repo).
function parseDealValueServer(v) {
  if (!v) return 0;
  let s = String(v).replace(/[€\s]/g, '');
  s = s.includes(',') ? s.replace(/\.(?=.*,)/g, '').replace(',', '.') : s.replace(/\./g, '');
  return parseFloat(s) || 0;
}

// ── Weekly per-client report ─────────────────────────────────────────────────
// Op maandag (UTC) bouwt deze functie voor elke klant met een Rapport Email een
// samenvatting van de afgelopen 7 dagen en mailt die naar de klant zelf.
// Fail-soft: een mislukte klant blokkeert de andere niet.
async function sendWeeklyClientReports(airtableToken, baseId, leadsTable) {
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Haal alle actieve klanten met een Rapport Email op
  const cFormula = encodeURIComponent(`AND({Active}=1, NOT({Rapport Email}=""))`);
  const cRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${cFormula}&pageSize=100`,
    { headers: { Authorization: `Bearer ${airtableToken}` } }
  );
  if (!cRes.ok) { console.error('[weekly] clients fetch failed', cRes.status); return null; }
  const clients = (await cRes.json()).records || [];
  console.log(`[weekly] ${clients.length} clients with Rapport Email`);

  let sent = 0, skipped = 0;
  for (const client of clients) {
    const projectCode  = client.fields['fldN4dL0bGgfBOXwM']  || client.fields['Project Code']  || '';
    const clientName   = client.fields['fldAnB848Sr5jl6dq']  || client.fields['Client Name']   || '';
    const reportEmail  = client.fields['fldDBJCN6dVMA8jax']  || client.fields['Rapport Email'] || '';
    if (!projectCode || !reportEmail) { skipped++; continue; }

    // 2. Haal alle leads van deze klant uit de afgelopen 7 dagen
    const lFormula = encodeURIComponent(`AND({Project Code}="${projectCode.replace(/"/g, '\\"')}", {Created At}>"${weekAgoIso}")`);
    const lRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${lFormula}&pageSize=100`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!lRes.ok) { console.error('[weekly] leads fetch failed for', projectCode, lRes.status); skipped++; continue; }
    const leads = (await lRes.json()).records || [];

    // 3. Stats berekenen
    // ROI-headline toegevoegd (batch: value/ROI reporting) — leads, gekwalificeerd,
    // afspraken en verwachte pipeline waarde zijn de cijfers die de klant motiveren
    // om te blijven betalen. Zie REPORTING-SUMMARY.md voor de exacte definities;
    // dezelfde honest-numbers regels als api/leads.js's report-summary mode gelden
    // hier: nooit omzet verzinnen, "Verwachte Waarde" is een schatting van de klant,
    // ontbrekende velden worden nooit als 0 behandeld.
    const total = leads.length;
    const qualified  = leads.filter(l => l.fields['Qualified'] === true);
    const booked     = leads.filter(l => l.fields['Appointment Booked'] === true);
    const responseTimes = leads.map(l => l.fields['Response Time (sec)']).filter(t => typeof t === 'number' && t > 0);
    const avgResponse = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;
    const conversionPct = total > 0 ? Math.round((qualified.length / total) * 100) : 0;

    // Verwachte pipeline waarde: alleen leads waar de klant echt een schatting
    // invulde tellen mee (leeg/onparseerbaar wordt uitgesloten, nooit als €0
    // behandeld — dat zou het gemiddelde stilletjes verlagen). parseDealValueServer
    // is een server-side spiegel van dashboard.js's parseDealValue (batch C-fix
    // voor Belgisch/Nederlands getalformaat, bv. "€ 1.500,00" = 1500, niet 1.5).
    const dealValues = leads
      .map(l => parseDealValueServer(l.fields['Verwachte Waarde'] || ''))
      .filter(v => v > 0);
    const pipelineValueTotal = dealValues.length ? Math.round(dealValues.reduce((a, b) => a + b, 0)) : null;

    // Top 5 gekwalificeerde leads gesorteerd op score
    const top5 = [...qualified]
      .sort((a, b) => (b.fields['Lead Score'] || 0) - (a.fields['Lead Score'] || 0))
      .slice(0, 5);

    // 4. Email versturen
    const ok = await sendWeeklyReportEmail({
      to: reportEmail, clientName, projectCode,
      stats: {
        total, qualified: qualified.length, conversionPct, avgResponse,
        booked: booked.length, pipelineValueTotal, pipelineValueCount: dealValues.length
      },
      top5
    });
    if (ok) sent++; else skipped++;
    // Spread rate-limit pressure on Resend
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`[weekly] sent ${sent}, skipped ${skipped}`);
  return { sent, skipped, total: clients.length };
}

async function sendWeeklyReportEmail({ to, clientName, projectCode, stats, top5 }) {
  if (!to) return false;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const fmtTime = s => s == null ? '—' : (s < 60 ? `${s}s` : `${Math.round(s/60)}m`);
  // "Verwachte waarde" blijft expliciet een schatting in de UI-tekst hieronder
  // (nooit "omzet") — zie de honest-numbers regels bovenaan sendWeeklyClientReports.
  const fmtEuro = v => v == null ? '—' : '€' + Math.round(v).toLocaleString('nl-NL');
  const topRows = top5.length
    ? top5.map(l => {
        const f = l.fields || {};
        return `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;font-weight:600">${esc(f['Name'] || '—')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:13px">${esc(f['AI Summary'] || '—')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#1e6fd9">${f['Lead Score'] || 0}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="3" style="padding:18px;text-align:center;color:#999;font-style:italic">Nog geen gekwalificeerde leads deze week. Komt nog!</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;background:#fff">
      <h2 style="color:#1e6fd9;margin:0 0 4px">Weekrapport. ${esc(clientName)}</h2>
      <p style="color:#666;margin:0 0 28px;font-size:14px">Overzicht van de afgelopen 7 dagen op je Helvaro account.</p>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:8px">
        <tr>
          <td style="background:#f0f6ff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#1e6fd9">${stats.total}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Nieuwe leads</div>
          </td>
          <td style="background:#ecfdf5;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#059669">${stats.qualified}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Gekwalificeerd</div>
          </td>
          <td style="background:#ecfeff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#0891b2">${stats.booked}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Afspraken geboekt</div>
          </td>
          <td style="background:#fff7ed;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#ea580c">${fmtEuro(stats.pipelineValueTotal)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Verwachte pipeline waarde${stats.pipelineValueCount ? '' : ' (nog geen schattingen)'}</div>
          </td>
        </tr>
      </table>
      <p style="font-size:11px;color:#999;margin:0 0 24px;text-align:center">
        Verwachte pipeline waarde is een door jou ingeschatte waarde per lead — geen omzet die Helvaro gegenereerd heeft.
      </p>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px">
        <tr>
          <td style="background:#fef3c7;border-radius:12px;padding:14px;text-align:center;width:50%">
            <div style="font-size:22px;font-weight:700;color:#d97706">${stats.conversionPct}%</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Conversie</div>
          </td>
          <td style="background:#f3e8ff;border-radius:12px;padding:14px;text-align:center;width:50%">
            <div style="font-size:22px;font-weight:700;color:#7c3aed">${fmtTime(stats.avgResponse)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Gem. Responstijd</div>
          </td>
        </tr>
      </table>

      <h3 style="margin:0 0 12px;font-size:16px">Top 5 gekwalificeerde leads</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafbfc;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="text-align:left;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Naam</th>
            <th style="text-align:left;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Samenvatting</th>
            <th style="text-align:right;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Score</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>

      <p style="text-align:center;margin:28px 0 8px">
        <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
      </p>

      <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px;text-align:center">
        Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp · <a href="https://helvaro.pro" style="color:#999">helvaro.pro</a>
      </p>
    </div>`;

  const { sendMail } = require('./_mailer');
  const sent = await sendMail({ to, subject: `Helvaro weekrapport — ${clientName}`, html })
    .catch(err => { console.error('[weekly]', err && err.message); return { ok: false }; });
  return !!(sent && sent.ok);
}

// ── Weekly AI learning loop ─────────────────────────────────────────────────
// Elke maandag (UTC) analyseert de AI per klant de afgelopen 7 dagen aan
// gesprekken. Output: korte 'geleerde patronen' notitie die in het
// 'AI Learned Patterns' veld komt en automatisch wordt geïnjecteerd in de
// system prompt van de AI bij elk volgend gesprek.
//
// Werkt cumulatief: vorige learnings worden meegegeven aan de AI zodat ze
// geconsolideerd worden, niet vervangen. Verlies van inzicht over tijd
// (catastrophic forgetting) wordt zo vermeden.
//
// Drempel: klant moet ≥3 leads hebben gehad in afgelopen 7 dagen anders
// is er te weinig signaal en wordt de oude learning behouden.
async function runWeeklyLearning(airtableToken, baseId, leadsTable) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) { console.warn('[learning] ANTHROPIC_KEY missing'); return null; }
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Haal alle actieve klanten op
  const cFormula = encodeURIComponent('{Active}=1');
  const cRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${cFormula}&pageSize=100`,
    { headers: { Authorization: `Bearer ${airtableToken}` } }
  );
  if (!cRes.ok) { console.error('[learning] clients fetch failed', cRes.status); return null; }
  const clients = (await cRes.json()).records || [];
  console.log(`[learning] analyzing ${clients.length} clients`);

  let updated = 0, skipped = 0;
  for (const client of clients) {
    const projectCode    = client.fields['fldN4dL0bGgfBOXwM']  || client.fields['Project Code']  || '';
    const clientName     = client.fields['fldAnB848Sr5jl6dq']  || client.fields['Client Name']   || '';
    const oldPatterns    = (client.fields['fldnbM5YKh274ISAl'] || client.fields['AI Learned Patterns'] || '').toString().trim();
    if (!projectCode) { skipped++; continue; }

    // 2. Haal leads van afgelopen 7 dagen voor deze klant
    const lFormula = encodeURIComponent(`AND({Project Code}="${projectCode.replace(/"/g, '\\"')}", {Created At}>"${weekAgoIso}")`);
    const lRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${lFormula}&pageSize=100`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!lRes.ok) { skipped++; continue; }
    const leads = (await lRes.json()).records || [];

    // 3. Drempel: minstens 3 leads voor zinvolle analyse
    if (leads.length < 3) { skipped++; continue; }

    // 3b. Credit check. Discretionary per-client AI spend (unlike
    // whatsapp.js's lead conversations) — skip THIS client and continue the
    // loop for everyone else rather than abort the whole cron run. Fails
    // open on any credit-infra problem, per _credits.js's header.
    const learningCheck = await credits.checkCredits(projectCode, credits.FEATURES.WEEKLY_LEARNING);
    if (!learningCheck.allowed) {
      console.warn(`[learning] ${projectCode} over credit limit — skipping weekly learning this run.`);
      skipped++; continue;
    }

    // 4. Bouw compact context — alleen relevante velden om tokens te besparen
    const summary = leads.map(l => {
      const f = l.fields || {};
      let history = [];
      try { history = JSON.parse(f['Conversation History'] || '[]'); } catch {}
      return {
        qualified: f['Qualified'] === true,
        score:     f['Lead Score'] || null,
        reason:    f['Reason'] || '',
        aiSummary: f['AI Summary'] || '',
        ability:   f['Ability'] || '',
        urgency:   f['Urgency'] || '',
        fit:       f['Fit'] || '',
        bron:      f['Bron'] || '',
        turns:     history.length,
        firstUser: (history.find(m => m.role === 'user') || {}).content || ''
      };
    });
    const qualified = summary.filter(s => s.qualified).length;
    const rejected  = summary.filter(s => s.qualified === false).length;

    // 5. Vraag Claude om patronen te distilleren
    const prompt = `Je analyseert ${leads.length} WhatsApp lead-gesprekken van afgelopen week voor "${clientName}".

Stats: ${qualified} gekwalificeerd, ${rejected} afgewezen, gem. ${(summary.reduce((a,s)=>a+s.turns,0)/leads.length).toFixed(1)} berichten per gesprek.

DATA:
${JSON.stringify(summary, null, 2).slice(0, 6000)}

${oldPatterns ? `VORIGE GELEERDE PATRONEN (consolideer, niet vervangen):
${oldPatterns}

` : ''}TAAK: Schrijf maximum 6 bullet points met concrete, ACTIONABLE patronen die de AI volgende week beter doen kwalificeren. Focus op:
- Welke vragen werken om snel te kwalificeren
- Welke type lead converteert het beste (bron, profiel, signalen)
- Welke red flags er waren bij afgewezen leads
- Vaak voorkomende lead-vragen die de AI moet kunnen beantwoorden

Schrijf in het Nederlands. Geen inleiding, geen conclusie. Alleen bullets. Maximaal 600 tekens totaal.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        console.error(`[learning] ${projectCode} Anthropic err:`, JSON.stringify(data.error || data).slice(0, 200));
        skipped++; continue;
      }
      const newPatterns = (data.content?.[0]?.text || '').trim().slice(0, 1500);
      if (!newPatterns) { skipped++; continue; }

      // 6. Schrijf terug naar Airtable
      const up = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}/${client.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { fldnbM5YKh274ISAl: newPatterns } })
        }
      );
      if (up.ok) updated++; else skipped++;
      credits.recordUsage(projectCode, credits.FEATURES.WEEKLY_LEARNING, {
        credits: credits.WEIGHTS[credits.FEATURES.WEEKLY_LEARNING],
        tokens: (data.usage && (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)) || null,
      }).catch(() => {});
      // Spread token usage so we don't burst Anthropic rate limits
      await new Promise(res => setTimeout(res, 500));
    } catch (err) {
      console.error(`[learning] ${projectCode} exception:`, err.message);
      skipped++;
    }
  }
  console.log(`[learning] updated ${updated}, skipped ${skipped}`);
  return { analyzed: clients.length, updated, skipped };
}

// Stuur een goedgekeurde Meta-template (verplicht buiten het 24u customer-service venster).
// `params` = de body-variabelen die in de template als {{1}}, {{2}}, ... staan.
function sendWATemplate(to, templateName, lang, params, phoneNumberId, token) {
  const components = (params && params.length)
    ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }]
    : [];
  return fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: lang }, components }
      })
    }
  ).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`[cron-followup] template "${templateName}" naar ${to} mislukt:`, JSON.stringify(d.error || d));
  }).catch(err => console.error(`[cron-followup] template netwerk fout naar ${to}:`, err.message));
}

function sendWA(to, message, phoneNumberId, token) {
  return fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      })
    }
  ).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`[cron-followup] WA fout naar ${to}:`, JSON.stringify(d.error || d));
  }).catch(err => console.error(`[cron-followup] WA netwerk fout naar ${to}:`, err.message));
}

// ── Envoy: server-side gepersonaliseerde outreach (Vercel, geen laptop) ───────
// Pakt de laatste Apify-leads, haalt per lead de website op, laat Claude een
// concreet pijnpunt + korte gepersonaliseerde koude mail schrijven, en verstuurt
// via SMTP (jouw usehelvaro.pro-mailbox). Laag volume, dedup via de Outreach-tabel.
async function runOutreach(airtableToken, baseId) {
  const APIFY = process.env.APIFY_TOKEN;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!APIFY || !ANTHROPIC || !process.env.SMTP_HOST) return { skipped: 'missing APIFY_TOKEN / ANTHROPIC / SMTP' };
  const OUTREACH_TABLE = 'tbl2LpuY9bj3I4pqS';
  const APIFY_TASK = 'zg6tVjgqm9qfcdwvL';
  const MAX_PER_RUN = 2;

  // 1) laatste Apify-leads ophalen
  let leads = [];
  try {
    const lr = await fetch(`https://api.apify.com/v2/actor-tasks/${APIFY_TASK}/runs/last?token=${APIFY}&status=SUCCEEDED`);
    const ds = (await lr.json())?.data?.defaultDatasetId;
    if (ds) {
      const dr = await fetch(`https://api.apify.com/v2/datasets/${ds}/items?token=${APIFY}&clean=true&fields=title,city,address,phone,website,emails,categoryName`);
      leads = await dr.json();
    }
  } catch (e) { return { error: 'apify: ' + e.message }; }
  if (!Array.isArray(leads) || !leads.length) return { checked: 0, sent: 0 };

  // 2) dedup: bestaande e-mails uit de Outreach-tabel. Fails CLOSED, not
  // soft, unlike most of this file: a bare `catch {}` here used to leave
  // `seen` silently empty on any transient DB error, so step 3 below would
  // treat every fresh Apify lead as "new" — including businesses we already
  // cold-emailed. Re-emailing a prospect that already got (or already
  // declined) our outreach is a worse outcome than skipping one run, so this
  // aborts the whole run instead of the file's usual fail-soft/best-effort
  // pattern. Cheap to skip: this cron runs daily and MAX_PER_RUN is 2, so a
  // skipped run just means these same leads get picked up (correctly
  // deduped) on the next run.
  const seen = new Set();
  try {
    const er = await pgFetch(`${OUTREACH_TABLE}?pageSize=100&fields%5B%5D=Email`);
    if (!er.ok) throw new Error('HTTP ' + er.status);
    for (const rec of ((await er.json()).records || [])) {
      const e = String(rec.fields?.Email || '').toLowerCase().trim(); if (e) seen.add(e);
    }
  } catch (e) {
    console.error('[outreach] dedup-fetch mislukt, outreach deze run overgeslagen (fail-safe tegen dubbele mails):', e.message);
    return { skipped: 'dedup_fetch_failed' };
  }

  // 3) kies nieuwe leads met bruikbaar zakelijk e-mailadres
  const fresh = [];
  for (const l of leads) {
    const email = String((l.emails || [])[0] || '').toLowerCase().trim();
    if (!email || seen.has(email) || /noreply|no-reply/.test(email)) continue;
    seen.add(email); fresh.push({ ...l, email });
    if (fresh.length >= MAX_PER_RUN) break;
  }
  if (!fresh.length) return { checked: leads.length, sent: 0, note: 'geen nieuwe leads' };

  const transport = require('nodemailer').createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE) !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  const createRow = (fields) => pgFetch(`${OUTREACH_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true })
  });

  let sent = 0, failed = 0;
  for (const l of fresh) {
    try {
      // l.website is third-party Apify-scraped data — same untrusted-URL SSRF
      // surface as api/whatsapp.js fetching a client's website, so it goes
      // through the same SSRF-protected fetchWebsite() (protocol whitelist,
      // private-IP/metadata blocklist, no redirect-follow, 5s timeout)
      // instead of a raw unprotected fetch().
      let site = '';
      if (l.website) site = await fetchWebsite(l.website, { tag: '[outreach]', maxChars: 3500 }) || '';
      const prompt = `Je schrijft namens Sindi (founder van Helvaro) een korte KOUDE B2B-outreachmail in het NEDERLANDS aan een Belgische KMO.

BEDRIJF: ${l.title} (${l.categoryName || ''}, ${l.city || ''})
WEBSITE-FRAGMENT: ${site || '(geen website)'}

Helvaro = een AI die binnenkomende WhatsApp/website-leads binnen 30 seconden opvolgt en kwalificeert, zodat een KMO geen klanten verliest door trage of gemiste opvolging. EUR 1.000/maand.

1. Vind 1 CONCREET pijnpunt rond leadopvolging bij dit bedrijf (bv. enkel een contactformulier, geen chat, beperkte uren, hoog-ticket offertes die snelheid vragen). Baseer op de website, anders op de sector.
2. Schrijf een mail: 60-100 woorden, persoonlijk, verwijst naar dat pijnpunt, 1 zachte vraag (kort gesprek van 15 min). Geen hype, geen emoji, geen em-dashes. Sluit af met "Sindi, Helvaro" als ondertekening — GEEN opt-out-zin nodig, die wordt automatisch en apart toegevoegd na je tekst.

OUTPUT (strikt):
PAINPOINT: <1 zin>
SUBJECT: <korte concrete onderwerpregel>
BODY: <de mailtekst>`;
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
      });
      const raw = (await cr.json())?.content?.[0]?.text || '';
      const pain = (raw.match(/PAINPOINT:\s*(.+)/i) || [])[1]?.trim() || '';
      const subject = ((raw.match(/SUBJECT:\s*(.+)/i) || [])[1] || `Snellere leadopvolging voor ${l.title}`).trim().slice(0, 150);
      const body = (raw.match(/BODY:\s*([\s\S]+)$/i) || [])[1]?.trim();
      if (!body) { failed++; continue; }
      // Compliance fix 5: the fixed footer is appended HERE, in code, after
      // the LLM's output — never something the model can drop, truncate, or
      // paraphrase away. bodyWithFooter (not the raw LLM `body`) is both
      // what's actually mailed AND what's stored in Outreach.Message, so
      // the stored record matches exactly what the prospect received.
      const bodyWithFooter = body + buildOutreachFooter();
      await transport.sendMail({ from: process.env.SMTP_FROM, to: l.email, subject, text: bodyWithFooter, replyTo: process.env.REPLY_TO || undefined });
      await createRow({ Business: l.title, Email: l.email, City: l.city || '', Website: l.website || '', Category: l.categoryName || '', Painpoint: pain, Subject: subject, Message: bodyWithFooter, Status: 'sent', 'Sent At': new Date().toISOString() });
      sent++;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      await createRow({ Business: l.title, Email: l.email, Status: 'failed', Painpoint: ('err: ' + e.message).slice(0, 400) }).catch(() => {});
      failed++;
    }
  }
  console.log(`[outreach] sent=${sent} failed=${failed} checked=${leads.length}`);
  return { checked: leads.length, sent, failed };
}

// ── 24h appointment reminders ─────────────────────────────────────────────────
// Appointments table (tblD058vEITs1xYFc) already has "Reminder Sent"
// (fldadjeKPJ2TLiQSA, description: "Cron zet dit op true wanneer reminder is
// verstuurd 24u vooraf") — the field existed but nothing ever wrote to it.
// This finds booked appointments starting soon that haven't been reminded,
// sends a reminder, and flags Reminder Sent = true.
//
// WINDOW: Start Time between now and now+REMINDER_WINDOW_HOURS. This cron
// runs once per day, so an exact "24h before" reminder isn't achievable with
// a single daily pass — instead the window must be WIDER than the 24h
// interval between runs, or an appointment could fall through the gap
// between two consecutive runs entirely (same "don't let a single
// missed/late run create a permanent skip window" lesson as the ago7d
// widening in the main follow-up loop above). 33h = 24h interval + 9h safety
// margin for cron delay/drift, chosen so two consecutive runs' windows
// always overlap: run N covers [T, T+33h], run N+1 (24h later) covers
// [T+24h, T+57h] — the 9h overlap between T+24h and T+33h guarantees every
// appointment is caught by at least one run before it starts.
//
// The overlap this creates is harmless, not a double-send risk: an
// appointment ~30h out gets reminded THIS run instead of waiting for
// tomorrow (when it would only be ~6h out and the notice window pointless).
// Early is always safe here because Reminder Sent is the actual idempotency
// guard — once set, NOT({fldadjeKPJ2TLiQSA}) excludes the appointment from
// every future run's filterByFormula, regardless of how early it was first
// caught. A reminder can never be sent twice no matter how the window is
// tuned.
const REMINDER_WINDOW_HOURS = 33;

// Normalize a raw phone string to the digits-only format the Graph API
// expects (E.164 without the leading '+'). Appointments created via
// api/leads.js's dashboard form may not enforce a clean format the way the
// WhatsApp webhook's `message.from` always is, so this is defensive here
// even though the Leads table itself never needs it.
function normalizePhoneForWA(raw) {
  let phone = String(raw || '').replace(/[\s\-\(\)\.]/g, '');
  if      (phone.startsWith('00')) phone = phone.slice(2);
  else if (phone.startsWith('+'))  phone = phone.slice(1);
  else if (phone.startsWith('0'))  phone = '32' + phone.slice(1);
  return /^\d{8,15}$/.test(phone) ? phone : '';
}

// Human-readable appointment date/time in the given language, Brussels tz.
// api/leads.js and api/whatsapp.js each have their own copy — same per-file
// helper duplication convention already used for mergeWaFailedFlag above.
// calendar:'gregory' forced explicitly — some locales (e.g. fa-IR) default
// Intl.DateTimeFormat to a non-Gregorian calendar, which would show a
// different day/month than what's actually in Google Calendar/Airtable. See
// api/_lang.js's formatApptDateTime equivalent in api/whatsapp.js for the
// verified example (fa-IR without this flag showed a Jalali-calendar date).
function formatApptDateTime(iso, lang) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso || '');
  const opts = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels', calendar: 'gregory' };
  return dt.toLocaleString(_lang.getLocale(lang), opts);
}

async function runAppointmentReminders(airtableToken, baseId, phoneNumberId, whatsappToken, now = new Date()) {
  const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
  // Per-client WhatsApp sender number (multitenancy prep). fldbrhlSrsmlJwcYr
  // = WhatsApp Phone Number ID on Client Config — mirrors api/whatsapp.js's
  // F_WA_PHONE_NUMBER_ID and api/leads.js's own constant of the same name.
  // Resolved per-appointment below from the client record getClientForCode()
  // already fetches (and caches) for the plan-status/language checks — no
  // extra Airtable call added. `phoneNumberId` (the param above) is only
  // ever used as the fallback when a client's field is blank.
  const F_WA_PHONE_NUMBER_ID = 'fldbrhlSrsmlJwcYr';
  const windowStart = now.toISOString();
  const windowEnd   = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Field IDs used throughout (immune to renames): fldt3zlcrFKGAGw3E = Status,
  // fldadjeKPJ2TLiQSA = Reminder Sent, fldxfW4UTI1QBiUsa = Start Time.
  const formula = encodeURIComponent(
    `AND({fldt3zlcrFKGAGw3E}="booked", NOT({fldadjeKPJ2TLiQSA}), IS_AFTER({fldxfW4UTI1QBiUsa}, "${windowStart}"), IS_BEFORE({fldxfW4UTI1QBiUsa}, "${windowEnd}"))`
  );
  // PAGINATED. Airtable returns at most `pageSize` records per response plus an
  // `offset` cursor; a single unpaginated request silently truncates. For most
  // queries in this file a dropped record self-heals on the next daily run, but
  // NOT here: a missed reminder is a missed reminder — the appointment happens,
  // the moment passes, and there is no second chance. Hard page cap (20 x 50 =
  // 1000 appointments in one 33h window) so a pathological result set can never
  // spin the cron against its 300s ceiling.
  const appointments = [];
  let offset = '';
  for (let page = 0; page < 20; page++) {
    const url = `https://api.airtable.com/v0/${baseId}/${APPOINTMENTS_TABLE}?filterByFormula=${formula}&pageSize=50` +
      (offset ? `&offset=${encodeURIComponent(offset)}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
    if (r.status === 429) {
      // Keep whatever we already collected — those still get reminded this run;
      // the rest are picked up tomorrow (they stay in the window / unflagged).
      console.warn('[cron-followup] appointment reminders: Airtable 429, rest uitgesteld tot volgende run');
      break;
    }
    if (!r.ok) throw new Error('Airtable ' + r.status);
    const data = await r.json();
    appointments.push(...(data.records || []));
    offset = data.offset || '';
    if (!offset) break;
  }
  if (offset) {
    console.warn(`[cron-followup] appointment reminders: paginatie-cap bereikt (${appointments.length} afspraken), rest volgende run`);
  }

  // ── DELIBERATE: no AI-pause guard here (unlike the nurture loop above) ──
  // isAiPaused() means "a human took over the CONVERSATION" — it exists to stop
  // the AI talking over a person mid-dialogue. An appointment reminder is not a
  // conversation turn; it's a factual notification about a booking the lead
  // themselves made. Suppressing it for paused leads would be actively harmful:
  // the lead a human stepped in for is usually the most valuable one, and they'd
  // be the single lead who gets no reminder and no-shows. Reminders therefore
  // send regardless of pause state. Do not "fix" this by adding the guard.
  //
  // ── Meta 24h customer-service window gating ────────────────────────────
  // A reminder is, by definition, sent to a lead who almost certainly hasn't
  // messaged recently — so freeform is never safe here, unlike
  // api/whatsapp.js's in-chat booking confirmation. Always template-gated,
  // exactly like the main follow-up loop above: skip entirely (no partial
  // sends, no per-appointment fallback) if no template is configured. Better
  // no reminder than a Meta policy violation / account ban.
  const TEMPLATE_NAME = process.env.REMINDER_TEMPLATE_NAME;
  if (!TEMPLATE_NAME) {
    if (appointments.length) {
      console.warn(`[cron-followup] REMINDER_TEMPLATE_NAME niet geconfigureerd. ${appointments.length} afspraak/afspraken binnen ${REMINDER_WINDOW_HOURS}u overgeslagen (freeform zou ban riskeren)`);
    }
    return { checked: appointments.length, sent: 0, skipped: appointments.length ? 'no_template' : undefined };
  }
  if (!phoneNumberId || !whatsappToken) {
    console.warn('[cron-followup] appointment reminders: WhatsApp config (PHONE_NUMBER_ID/WHATSAPP_TOKEN) ontbreekt');
    return { checked: appointments.length, sent: 0, skipped: 'no_whatsapp_config' };
  }

  // Per-run client cache — multiple appointments often share a Project Code;
  // avoid refetching the same Klanten record repeatedly within one cron run.
  const clientCache = new Map();
  async function getClientForCode(projectCode) {
    if (clientCache.has(projectCode)) return clientCache.get(projectCode);
    let rec = null;
    try {
      const formula2 = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${projectCode.replace(/"/g, '\\"')}"`);
      const cRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${formula2}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${airtableToken}` } }
      );
      if (cRes.ok) rec = (await cRes.json()).records?.[0] || null;
    } catch (err) {
      console.error(`[cron-followup] client-lookup voor reminder mislukt (${projectCode}):`, err.message);
    }
    clientCache.set(projectCode, rec);
    return rec;
  }

  let sent = 0, skipped = 0;
  for (const appt of appointments) {
    try {
      const f = appt.fields || {};
      const phone       = f['fldO0Gk82OJ9m6lz7'] || f['Lead Phone']    || '';
      const leadName    = f['fldnCNWPxIX6sYzZP'] || f['Lead Name']     || '';
      const projectCode = f['fld60vlhoxZYef4U2'] || f['Project Code']  || '';
      const startTime   = f['fldxfW4UTI1QBiUsa'] || f['Start Time'];

      const normalizedPhone = normalizePhoneForWA(phone);
      if (!normalizedPhone || !startTime) {
        console.warn(`[cron-followup] reminder overgeslagen voor ${appt.id}: ontbrekend telefoonnummer of starttijd`);
        skipped++; continue;
      }

      const client       = projectCode ? await getClientForCode(projectCode) : null;

      // PLAN-STATUS GUARD — don't burn a paid WhatsApp template on an
      // appointment reminder for a client whose service has stopped. Reuses
      // the client record already fetched above (no extra Airtable call).
      // Deliberately does NOT mark Reminder Sent: this appointment stays
      // eligible for tomorrow's run so a reactivation mid-window still gets
      // the reminder, and it ages out on its own once IS_BEFORE(windowEnd)
      // stops matching it — same "skip, don't half-process" shape as the
      // no-template-configured skip above.
      if (client && getPlanState(client.fields || {}).isServiceStopped) {
        console.log(`[cron-followup] afspraakherinnering overgeslagen voor ${appt.id}: klant ${projectCode} plan gestopt`);
        skipped++; continue;
      }

      const clientNameV  = client?.fields?.['fldAnB848Sr5jl6dq'] || client?.fields?.['Client Name'] || '';
      const clientLang    = _lang.normalizeLanguageCode(client?.fields?.['fld1iiV9XwSbgAACZ'] || client?.fields?.['Language']);
      // Template language defaults to the client's own Language setting (same
      // "one template name, multiple approved locale variants" reasoning as
      // api/leads.js's sendAppointmentConfirmation). REMINDER_TEMPLATE_LANG,
      // if set, pins every client to one language regardless. Either way,
      // resolveTemplateLanguage() gates the result against Meta's actually-
      // approved template languages (today: nl/fr/en) — a client whose
      // Language is now one of the 37 new registry languages falls back to
      // 'nl' here (logged), NOT sent in an unapproved language. This is the
      // template-bound half of language support — contrast with the free-
      // form AI conversation in whatsapp.js, which has no such limit.
      const templateLang = _lang.resolveTemplateLanguage(process.env.REMINDER_TEMPLATE_LANG || clientLang, clientLang).code;

      // Per-client sender number (multitenancy prep). Resolved INSIDE the
      // loop, per appointment, from THIS appointment's own `client` record
      // (fetched/cached above by getClientForCode(projectCode)) — never
      // hoisted above the loop. Hoisting would send every client's reminder
      // from whichever client happened to resolve first, the exact
      // cross-client leak this task exists to prevent. Blank field (every
      // client today) resolves to '' and falls back to the shared
      // `phoneNumberId` param — unchanged behaviour.
      const clientPnidV = (client && client.fields && (client.fields[F_WA_PHONE_NUMBER_ID] || client.fields['WhatsApp Phone Number ID']) || '').toString().trim();
      const apptPhoneNumberId = clientPnidV || phoneNumberId;

      const firstName = String(leadName).trim().split(' ')[0] || '';
      const when = formatApptDateTime(startTime, templateLang);

      // ── Idempotency guard: flip Reminder Sent BEFORE attempting delivery ──
      // Deliberately the opposite order from the main follow-up loop above
      // (which marks Conversation State AFTER sending). Reminders have a
      // stricter requirement — "never sent twice" — so the flag is the lock,
      // acquired first: if the process crashes/times out between this PATCH
      // and the WhatsApp call below, the flag is already true and tomorrow's
      // query (NOT({fldadjeKPJ2TLiQSA})) permanently excludes this
      // appointment, guaranteeing it can never be reminded twice. If the
      // PATCH itself fails, we skip the send entirely rather than risk
      // sending without being able to record it (which WOULD risk a
      // duplicate tomorrow) — better a missed reminder, retried tomorrow via
      // this same all-or-nothing rule, than a double-send.
      const pRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${APPOINTMENTS_TABLE}/${appt.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { fldadjeKPJ2TLiQSA: true } })
        }
      );
      if (!pRes.ok) {
        console.error(`[cron-followup] Reminder Sent PATCH mislukt voor ${appt.id} (${pRes.status}). send overgeslagen (opnieuw geprobeerd volgende run)`);
        skipped++; continue;
      }

      await sendWATemplate(normalizedPhone, TEMPLATE_NAME, templateLang, [firstName, when, clientNameV], apptPhoneNumberId, whatsappToken);
      sent++;
    } catch (err) {
      console.error(`[cron-followup] appointment reminder mislukt voor ${appt.id}:`, err.message);
      skipped++;
    }
    // Slight delay to avoid WhatsApp/Airtable rate limits, same pattern as the other loops above
    await new Promise(res => setTimeout(res, 300));
  }
  console.log(`[cron-followup] appointment reminders: checked ${appointments.length}, sent ${sent}, skipped ${skipped}`);
  return { checked: appointments.length, sent, skipped };
}

// ── Trial lifecycle ──────────────────────────────────────────────────────
// TRIAL-DESIGN.md §4/§7. For every Client Config record whose RAW Plan
// Status is literally 'trial':
//   - past Trial Ends At        -> flip Plan Status to 'expired', alert
//                                   client + Sindi. Once.
//   - ~3 days remaining         -> "nog 3 dagen" email + Sindi alert
//                                   (the phone-call trigger). Once.
//   - ~7 days elapsed           -> "wat Helvaro deze week deed" email. Once.
//
// "Once" is tracked via credits.getTrialMarkers()/setTrialMarker(), which
// piggyback on the EXISTING Credit Period field (no new Airtable field —
// see that file's own header for the merge-safety contract with the credit
// system's own writes to the same field).
//
// Fail-soft throughout, per client AND per step: one client's Airtable/mail
// hiccup must never abort the run for every other trial client, and an
// email failure must NEVER change service state (the Plan Status write and
// the email send are independent try/catches — a mail failure never
// prevents the flip to 'expired', and a flip failure never prevents the
// attempt to alert).
async function runTrialLifecycle(airtableToken, baseId, leadsTable) {
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

  const formula = encodeURIComponent(`{${PLAN_FIELD.STATUS}}="trial"`);
  const url = `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${formula}&pageSize=100`;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
  } catch (err) {
    console.error('[trial] clients fetch threw:', err.message);
    return null;
  }
  if (!res.ok) { console.error('[trial] clients fetch failed', res.status); return null; }
  let data;
  try { data = await res.json(); } catch (err) { console.error('[trial] clients fetch parse failed:', err.message); return null; }
  const clientRecords = data.records || [];

  let day7Sent = 0, day11Sent = 0, expiredNow = 0, skipped = 0;

  for (const client of clientRecords) {
    try {
      const fields = client.fields || {};
      const projectCode = fields['fldN4dL0bGgfBOXwM'] || fields['Project Code'] || '';
      const clientName  = fields['fldAnB848Sr5jl6dq'] || fields['Client Name']  || '';
      const reportEmail = fields['fldDBJCN6dVMA8jax'] || fields['Rapport Email'] || '';
      if (!projectCode) { skipped++; continue; }

      const planState = getPlanState(fields);
      const markers = await credits.getTrialMarkers(projectCode).catch(err => {
        console.warn(`[trial] ${projectCode} getTrialMarkers failed, treating as "nothing sent yet":`, err.message);
        return {};
      });

      // 1. Past Trial Ends At (date-derived, same check whatsapp.js already
      // trusts on every message) -> flip Plan Status + alert. Once only.
      if (planState.status === 'expired') {
        if (!markers.expiredSent) {
          try {
            await patchClientFields(airtableToken, baseId, client.id, { [PLAN_FIELD.STATUS]: 'expired' });
          } catch (err) {
            console.error(`[trial] ${projectCode} kon Plan Status niet naar expired zetten:`, err.message);
          }
          await sendTrialExpiredEmails({ clientName, projectCode, reportEmail }).catch(err =>
            console.error(`[trial] ${projectCode} expired-alert mislukt:`, err.message));
          try {
            await credits.setTrialMarker(projectCode, { expiredSent: true });
          } catch (err) {
            console.error(`[trial] ${projectCode} kon expired-marker niet opslaan (alert is al verstuurd, mogelijk dubbele alert volgende run):`, err.message);
          }
          expiredNow++;
        } else {
          skipped++; // already flipped + alerted on a previous run
        }
        continue; // nothing else to check this run for a client that's expired
      }

      if (planState.status !== 'trial') { skipped++; continue; } // defensive — shouldn't happen given the fetch formula

      // 2. ~3 days remaining -> day-11 email + Sindi alert. Once only.
      //
      // Day-11 SUPERSEDES day-7: by definition, a client with <=3 days left
      // in a 14-day trial is already >=11 days elapsed, well past the day-7
      // threshold. If day-7 was never sent for them (e.g. this cron's very
      // first run against a client already deep in trial), sending it AFTER
      // day-11's "nog 3 dagen" urgency email would read out of order and
      // broken — a check-in email arriving after the "your trial is nearly
      // over, call us" email. So when day-11 fires, mark BOTH day11Sent and
      // day7Sent in the SAME write (belt): the day-7 email is simply skipped
      // for a client discovered this late, not sent late. Braces: the day-7
      // condition below ALSO checks !markers.day11Sent directly, so even if
      // this marker write fails (network hiccup — logged, never fatal) and
      // day7Sent doesn't persist, the next run still can't send day-7 after
      // day-11 because markers.day11Sent will already be true by then.
      if (planState.daysLeft <= 3 && !markers.day11Sent) {
        const stats = await computeTrialStats(airtableToken, baseId, leadsTable, projectCode, planState.trialEndsAt).catch(() => null);
        await sendTrialProgressEmail({ kind: 'day11', to: reportEmail, clientName, projectCode, daysLeft: planState.daysLeft, stats }).catch(err =>
          console.error(`[trial] ${projectCode} day11-email mislukt:`, err.message));
        await sendSindiTrialAlert({ kind: 'day11', clientName, projectCode, daysLeft: planState.daysLeft, stats }).catch(err =>
          console.error(`[trial] ${projectCode} day11 Sindi-alert mislukt:`, err.message));
        try {
          await credits.setTrialMarker(projectCode, { day11Sent: true, day7Sent: true });
        } catch (err) {
          console.error(`[trial] ${projectCode} kon day11-marker niet opslaan (mail is al verstuurd, mogelijk dubbele mail volgende run):`, err.message);
        }
        day11Sent++;
        continue; // day-7 and day-11 are mutually exclusive per run — no need to also check day-7 below
      }

      // 3. ~7 days elapsed -> mid-trial "wat Helvaro deze week deed". Once
      // only. Guarded by BOTH markers — see the day-11 comment above for why
      // !markers.day11Sent is required here too (belt-and-braces: the marker
      // write above can fail, this condition is the second, independent
      // safeguard against sending day-7 after day-11 has already gone out).
      if (!markers.day7Sent && !markers.day11Sent) {
        const startMs = computeTrialStartMs(planState.trialEndsAt);
        const elapsedDays = startMs ? Math.floor((Date.now() - startMs) / (24 * 60 * 60 * 1000)) : null;
        if (elapsedDays !== null && elapsedDays >= 7) {
          const stats = await computeTrialStats(airtableToken, baseId, leadsTable, projectCode, planState.trialEndsAt).catch(() => null);
          await sendTrialProgressEmail({ kind: 'day7', to: reportEmail, clientName, projectCode, daysLeft: planState.daysLeft, stats }).catch(err =>
            console.error(`[trial] ${projectCode} day7-email mislukt:`, err.message));
          try {
            await credits.setTrialMarker(projectCode, { day7Sent: true });
          } catch (err) {
            console.error(`[trial] ${projectCode} kon day7-marker niet opslaan (mail is al verstuurd, mogelijk dubbele mail volgende run):`, err.message);
          }
          day7Sent++;
        }
      }
    } catch (err) {
      // Fail-soft per client: never let one bad record abort the whole run.
      console.error('[trial] client-loop fout (overgeslagen):', err.message);
      skipped++;
    }
    // Slight delay, same rate-limit courtesy as the other loops in this file.
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[trial] checked ${clientRecords.length}, day7Sent ${day7Sent}, day11Sent ${day11Sent}, expiredNow ${expiredNow}, skipped ${skipped}`);
  return { checked: clientRecords.length, day7Sent, day11Sent, expiredNow, skipped };
}

// Generic Client Config field PATCH. Small helper so runTrialLifecycle()
// above doesn't need to duplicate the fetch boilerplate for the one write
// it needs (flipping Plan Status). Throws on failure — caller decides how
// to log/handle it (never lets a throw here change what emails get sent).
async function patchClientFields(airtableToken, baseId, recordId, fields) {
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/tblPidTrwGRzRt4LZ/${recordId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// Cumulative stats since trial start (not a rolling 7-day window — see
// TRIAL-DESIGN.md §5's example: "In 11 dagen: 23 leads, 14 gekwalificeerd,
// 6 afspraken, €12.400 verwachte pipeline" is cumulative since day 0).
// Reuses api/leads.js's aggregateReportPeriod(), the exact same honest-
// numbers aggregation the dashboard's Resultaten panel uses — never a
// second, potentially-drifting copy of that logic. Returns null on any
// fetch failure (email functions below degrade gracefully to "geen data
// beschikbaar" rather than showing fabricated/blank numbers as real zeros).
async function computeTrialStats(airtableToken, baseId, leadsTable, projectCode, trialEndsAtIso) {
  const startMs = computeTrialStartMs(trialEndsAtIso);
  if (!startMs) return null;
  try {
    const all = [];
    let offset = '';
    // Trial-stage clients are, by definition, at most 14 days in — a
    // handful of pages is generous headroom (500 leads in 2 weeks would be
    // an extreme outlier for this product), same pagination pattern as
    // leads.js's report-summary mode, just a smaller cap.
    for (let page = 0; page < 5; page++) {
      const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${projectCode.replace(/"/g, '\\"')}"`);
      const url = `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${formula}&pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
      if (!r.ok) break;
      const d = await r.json();
      all.push(...(d.records || []));
      if (!d.offset) break;
      offset = d.offset;
    }
    return aggregateReportPeriod(all, startMs, Date.now());
  } catch (err) {
    console.warn(`[trial] computeTrialStats(${projectCode}) failed:`, err.message);
    return null;
  }
}

// Day-7 / day-11 trial progress email TO THE CLIENT. Same visual shape as
// sendWeeklyReportEmail() above (design-system-consistent, not a
// duplicated palette) but framed as cumulative trial progress + an
// explicit upgrade nudge instead of a routine weekly digest. TRIAL-
// DESIGN.md §5's honesty rule applies identically: pipeline value is the
// client's OWN estimate, never described as revenue Helvaro generated.
async function sendTrialProgressEmail({ kind, to, clientName, projectCode, daysLeft, stats }) {
  if (!to) return false;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtEuro = v => v == null ? '—' : '€' + Math.round(v).toLocaleString('nl-NL');
  const s = stats || { leadsReceived: 0, qualifiedCount: 0, appointmentsBooked: 0, pipelineValueTotal: null, pipelineValueCount: 0 };

  const isDay11 = kind === 'day11';
  const heading = isDay11 ? `Nog ${daysLeft} dag${daysLeft === 1 ? '' : 'en'} proefperiode` : 'Wat Helvaro deze week voor je deed';
  const intro = isDay11
    ? `Je gratis proefperiode loopt bijna af. Hier zijn je échte cijfers tot nu toe:`
    : `Een week geleden startte je met Helvaro. Hier is wat er sindsdien gebeurde, automatisch, zonder dat je iets hoefde te doen:`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;background:#fff">
      <h2 style="color:#1e6fd9;margin:0 0 4px">${esc(heading)}</h2>
      <p style="color:#666;margin:0 0 28px;font-size:14px">${esc(intro)}</p>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:8px">
        <tr>
          <td style="background:#f0f6ff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#1e6fd9">${s.leadsReceived}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Leads</div>
          </td>
          <td style="background:#ecfdf5;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#059669">${s.qualifiedCount}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Gekwalificeerd</div>
          </td>
          <td style="background:#ecfeff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#0891b2">${s.appointmentsBooked}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Afspraken geboekt</div>
          </td>
          <td style="background:#fff7ed;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#ea580c">${fmtEuro(s.pipelineValueTotal)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Verwachte pipeline waarde${s.pipelineValueCount ? '' : ' (nog geen schattingen)'}</div>
          </td>
        </tr>
      </table>
      <p style="font-size:11px;color:#999;margin:0 0 24px;text-align:center">
        Verwachte pipeline waarde is een door jou ingeschatte waarde per lead — geen omzet die Helvaro gegenereerd heeft.
      </p>

      ${isDay11 ? `
      <div style="background:#fef3c7;border-radius:12px;padding:18px;margin-bottom:24px;text-align:center">
        <p style="margin:0 0 12px;font-weight:600;color:#92400e">Wil je Helvaro blijven gebruiken na je proefperiode?</p>
        <a href="mailto:hello@helvaro.pro?subject=Upgrade%20na%20proefperiode%20-%20${encodeURIComponent(projectCode)}" style="display:inline-block;padding:12px 24px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Upgrade nu</a>
      </div>` : ''}

      <p style="text-align:center;margin:28px 0 8px">
        <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
      </p>

      <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px;text-align:center">
        Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp · <a href="https://helvaro.pro" style="color:#999">helvaro.pro</a>
      </p>
    </div>`;

  const { sendMail } = require('./_mailer');
  const subject = isDay11
    ? `Nog ${daysLeft} dag${daysLeft === 1 ? '' : 'en'} — jouw Helvaro proefperiode`
    : `Wat Helvaro deze week voor je deed — ${clientName}`;
  const sent = await sendMail({ to, subject, html }).catch(err => { console.error('[trial email]', err && err.message); return { ok: false }; });
  return !!(sent && sent.ok);
}

// Sindi's own alert for the day-11 touchpoint — the phone-call trigger
// (TRIAL-DESIGN.md §4: "Day 11 is the conversion moment — it exists to
// trigger Sindi's phone call, not to automate the close") — reused for the
// expiry alert too (kind='expired', see sendTrialExpiredEmails below).
async function sendSindiTrialAlert({ kind, clientName, projectCode, daysLeft, stats }) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) { console.warn('[trial] NOTIFY_EMAIL niet ingesteld — geen Sindi-alert verstuurd voor', projectCode); return; }
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const s = stats || {};
  const subject = kind === 'expired'
    ? `[Helvaro] Trial verlopen: ${clientName}`
    : `[Helvaro] Bel ${clientName} — nog ${daysLeft} dag${daysLeft === 1 ? '' : 'en'} trial`;
  const { sendMail } = require('./_mailer');
  await sendMail({
    to, subject,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
      <h2 style="margin:0 0 12px">${kind === 'expired' ? 'Trial verlopen' : 'Trial loopt bijna af — bel deze klant'}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#666;width:140px">Klant</td><td style="padding:4px 0;font-weight:600">${esc(clientName)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Projectcode</td><td style="padding:4px 0;font-family:monospace">${esc(projectCode)}</td></tr>
        ${daysLeft != null ? `<tr><td style="padding:4px 0;color:#666">Dagen resterend</td><td style="padding:4px 0">${esc(daysLeft)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#666">Leads</td><td style="padding:4px 0">${esc(s.leadsReceived ?? '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Gekwalificeerd</td><td style="padding:4px 0">${esc(s.qualifiedCount ?? '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Afspraken</td><td style="padding:4px 0">${esc(s.appointmentsBooked ?? '—')}</td></tr>
      </table>
    </div>`,
  }).catch(err => console.warn('[trial] Sindi-alert mislukt:', err && err.message));
}

// Fires both alerts for a trial that just crossed Trial Ends At: the client
// (fail-soft, non-alarming per TRIAL-DESIGN.md §3 — capture continues,
// automation stops) and Sindi (reactivation trigger). Wrapped so a failure
// in either send never affects the caller's Plan Status write or marker
// persistence, which happen independently in runTrialLifecycle() above.
async function sendTrialExpiredEmails({ clientName, projectCode, reportEmail }) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const { sendMail } = require('./_mailer');
  if (reportEmail) {
    await sendMail({
      to: reportEmail,
      subject: `Je Helvaro proefperiode is afgelopen`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
        <h2 style="color:#1e6fd9;margin:0 0 12px">Je proefperiode is afgelopen</h2>
        <p style="color:#444;line-height:1.6">Nieuwe leads blijven gewoon binnenkomen en zichtbaar in je dashboard — daar verandert niets aan. De AI beantwoordt ze alleen niet langer automatisch op WhatsApp.</p>
        <p style="color:#444;line-height:1.6">Wil je de automatische opvolging weer aanzetten? Antwoord op deze mail of neem contact op, dan zetten we het meteen weer aan.</p>
        <a href="mailto:hello@helvaro.pro?subject=Reactivatie%20-%20${encodeURIComponent(projectCode)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Heractiveer mijn account</a>
        <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px">Helvaro · ${esc(clientName)}</p>
      </div>`,
    }).catch(err => console.warn(`[trial] expired-mail naar klant (${projectCode}) mislukt:`, err && err.message));
  }
  await sendSindiTrialAlert({ kind: 'expired', clientName, projectCode, daysLeft: 0, stats: null });
}

