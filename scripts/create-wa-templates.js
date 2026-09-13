#!/usr/bin/env node
'use strict';
/*
 * create-wa-templates.js — submit Helvaro's WhatsApp message templates to Meta
 * via the Graph API, instead of clicking through WhatsApp Manager.
 *
 * WHY THIS EXISTS
 *   Business-initiated WhatsApp messages outside Meta's 24h customer-service
 *   window MUST use a pre-approved template. Appointment confirmations and 24h
 *   reminders (api/cron-followup.js, api/leads.js) no-op with a clear log until
 *   the template names below are approved and set in env. This script submits
 *   them for review and reports their status.
 *
 * TEMPLATES ARE PER-WABA, NOT PER-CLIENT
 *   Helvaro's clients all share one WhatsApp sender identity, so one approved
 *   template serves every client — the business name is a variable ({{2}}),
 *   which is exactly why the bodies below are written generically.
 *
 * USAGE
 *   Dry run (default — shows exactly what WOULD be submitted, sends nothing):
 *     node scripts/create-wa-templates.js
 *   Really submit:
 *     node scripts/create-wa-templates.js --commit
 *   Just check what already exists:
 *     node scripts/create-wa-templates.js --list
 *
 * ENV
 *   WABA_ID                     WhatsApp Business Account id (NOT the phone
 *                               number id). Helvaro production: <JOUW_WABA_ID>
 *   WHATSAPP_MANAGEMENT_TOKEN   Token with the `whatsapp_business_management`
 *                               scope. The regular WHATSAPP_TOKEN is usually
 *                               messaging-only and will fail with a permissions
 *                               error — generate a System User token in
 *                               Meta Business Settings -> System Users.
 *                               Falls back to WHATSAPP_TOKEN with a warning.
 *
 * SAFETY
 *   - Dry-run is the default; nothing is submitted without --commit.
 *   - Idempotent: existing templates (any status) are skipped, never
 *     duplicated or overwritten.
 *   - The token is never printed, logged, or echoed.
 */

// v23.0 = the version Meta's own Message Templates docs use (May 2026).
// NOTE: api/*.js deliberately still SENDS on v19.0 — don't "sync" them without
// testing; this script only creates templates and is safe to keep current.
const WABA_ID = (process.env.WABA_ID || '').trim();
const TOKEN =
  (process.env.WHATSAPP_MANAGEMENT_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
const USING_FALLBACK_TOKEN =
  !process.env.WHATSAPP_MANAGEMENT_TOKEN && !!process.env.WHATSAPP_TOKEN;

// ── The templates ──────────────────────────────────────────────────────────
// Category UTILITY (not MARKETING): these are service messages about a booking
// the person already made. Utility is cheaper, approves faster, and mislabelling
// a service message as marketing is a common rejection reason.
//
// Variable order is load-bearing — api/cron-followup.js and api/leads.js send
// components in exactly this order. Do NOT reorder without changing both.
//   {{1}} = lead first name
//   {{2}} = client business name
//   {{3}} = appointment date/time (already human-formatted by the caller)

// Meta does NOT translate templates: every language is a separate submission whose
// body you must write out in full. Same name + different language = one template
// each, and each counts against the WABA template limit.
//
// PARAMETER ORDER IS A CONTRACT WITH THE SENDING CODE.
// Template variables are positional, so {{2}} means whatever the caller passes
// second — get it wrong and the confirmation reads "your appointment with
// Tuesday 12 August is confirmed for KinePraktijk Gent". Each template below
// therefore declares `params` in SEMANTIC terms, and the example values are
// looked up by that name rather than by position. The order must match:
//
//   BOOKING_TEMPLATE_NAME   leads.js        [firstName, clientName, when]
//   REMINDER_TEMPLATE_NAME  cron-followup.js [firstName, clientName, when]
//   INTRO_TEMPLATE_NAME     form.js:326     [firstName, aiName, clientName]
//   NOTIFY_TEMPLATE_NAME    form.js:379     [leadName, phone, projectCode]
//   FOLLOWUP/MANUAL_REPLY   leads.js:2376   [firstName]
/* De teksten, voorbeelden en het indienen zelf staan sinds 2026-09-13 in
   api/_wa-template-teksten.js, zodat de back-office ('ops-templates-submit'
   in api/admin.js) exact dezelfde definities indient als dit script. */
const _teksten = require('../api/_wa-template-teksten');
const { TEMPLATES } = _teksten;
const GRAPH_VERSION = _teksten.GRAPH_VERSION;
const listTemplates = () => _teksten.listTemplates(WABA_ID, TOKEN);
const createTemplate = (tpl) => _teksten.createTemplate(WABA_ID, TOKEN, tpl);

// ── Main ───────────────────────────────────────────────────────────────────

async function fetchExisting() {
  console.log(`WABA ${WABA_ID} — fetching existing templates...\n`);
  return listTemplates();
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const listOnly = args.includes('--list');

  const online = commit || listOnly;

  if (!online && (!WABA_ID || !TOKEN)) {
    console.log(
      'No credentials set — rendering an OFFLINE dry run.\n' +
        'Existing templates cannot be checked, so everything below is shown as new.\n'
    );
  }

  if (online && !WABA_ID) {
    console.error('ERROR: WABA_ID is not set.');
    console.error('  Helvaro production WABA: <JOUW_WABA_ID>');
    console.error('  Run: WABA_ID=... WHATSAPP_MANAGEMENT_TOKEN=... node scripts/create-wa-templates.js');
    process.exit(1);
  }
  if (online && !TOKEN) {
    console.error('ERROR: no token. Set WHATSAPP_MANAGEMENT_TOKEN (needs the');
    console.error('  `whatsapp_business_management` scope — create a System User token in');
    console.error('  Meta Business Settings -> System Users).');
    process.exit(1);
  }
  if (online && USING_FALLBACK_TOKEN) {
    console.warn(
      'WARNING: falling back to WHATSAPP_TOKEN. That token is usually messaging-only;\n' +
        '         if you get a permissions error, generate a management-scoped token.\n'
    );
  }

  const existing = online ? await fetchExisting() : [];
  const byName = new Map(existing.map((t) => [`${t.name}::${t.language}`, t]));

  if (existing.length) {
    console.log('Already on this account:');
    for (const t of existing) {
      console.log(`  - ${t.name} (${t.language}) [${t.category}] -> ${t.status}`);
    }
    console.log('');
  } else if (online) {
    console.log('(no templates on this account yet)\n');
  }

  if (listOnly) return;

  const results = [];
  for (const tpl of TEMPLATES) {
    const key = `${tpl.name}::${tpl.language}`;
    if (byName.has(key)) {
      const cur = byName.get(key);
      console.log(`SKIP   ${tpl.name} — already exists (status: ${cur.status})`);
      results.push({ name: tpl.name, language: tpl.language, action: 'skipped', status: cur.status });
      continue;
    }

    if (!commit) {
      console.log(`WOULD SUBMIT  ${tpl.name} (${tpl.language}) [${tpl.category}]`);
      console.log('   ' + tpl.body.replace(/\n/g, '\n   '));
      if (tpl.footer) console.log(`   [footer] ${tpl.footer}`);
      console.log(`   examples: ${JSON.stringify(tpl.examples)}\n`);
      results.push({ name: tpl.name, language: tpl.language, action: 'dry-run' });
      continue;
    }

    try {
      const created = await createTemplate(tpl);
      console.log(
        `SUBMITTED  ${tpl.name} — id ${created.id || '?'}, status ${created.status || 'PENDING'}`
      );
      results.push({ name: tpl.name, language: tpl.language, action: 'submitted', status: created.status || 'PENDING' });
    } catch (err) {
      console.error(`FAILED     ${tpl.name}: ${err.message}`);
      results.push({ name: tpl.name, language: tpl.language, action: 'failed', error: err.message });
    }
  }

  console.log('\n--- summary ---');
  for (const r of results) {
    console.log(`  ${r.name} (${r.language}): ${r.action}${r.status ? ' (' + r.status + ')' : ''}`);
  }

  if (!commit && results.some((r) => r.action === 'dry-run')) {
    console.log('\nDry run — nothing was submitted. Re-run with --commit to submit for review.');
  }
  if (commit) {
    console.log('\nMeta review usually takes minutes to a few hours. Once APPROVED, set:');
    const gezien = new Set();
    for (const tpl of TEMPLATES) {
      if (gezien.has(tpl.name)) continue;
      gezien.add(tpl.name);
      console.log(`  ${tpl.usedBy}=${tpl.name}`);
    }
    console.log('in the Vercel project env, or confirmations/reminders will keep no-opping.');
  }
}

main().catch((err) => {
  console.error('\nUnexpected failure:', err.message);
  process.exit(1);
});
