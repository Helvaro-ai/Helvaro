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
 *                               number id). Helvaro production: 1000493482531092
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

const GRAPH_VERSION = 'v19.0';          // matches the version used across api/
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
const TEMPLATES = [
  {
    name: 'helvaro_afspraak_bevestiging',
    language: 'nl_BE',
    category: 'UTILITY',
    body:
      'Hoi {{1}}, je afspraak bij {{2}} is bevestigd voor {{3}}.\n\n' +
      'Kan je er niet bij zijn? Antwoord op dit bericht, dan zoeken we een ander moment.',
    examples: ['Jan', 'KinePraktijk Gent', 'dinsdag 12 augustus om 14:30'],
    usedBy: 'BOOKING_TEMPLATE_NAME',
  },
  {
    name: 'helvaro_afspraak_herinnering',
    language: 'nl_BE',
    category: 'UTILITY',
    body:
      'Hoi {{1}}, kleine herinnering: je afspraak bij {{2}} staat gepland voor {{3}}.\n\n' +
      'Tot dan! Antwoord gerust op dit bericht als er iets gewijzigd is.',
    examples: ['Jan', 'KinePraktijk Gent', 'morgen om 14:30'],
    usedBy: 'REMINDER_TEMPLATE_NAME',
  },
];

// ── Graph API helpers ──────────────────────────────────────────────────────

function graphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

async function listTemplates() {
  const res = await fetch(
    graphUrl(`${WABA_ID}/message_templates?fields=name,status,category,language&limit=200`),
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw new Error(
      `list failed (HTTP ${res.status}): ${err.message || 'unknown error'}` +
        (err.code === 200 || /permission/i.test(err.message || '')
          ? '\n  -> This usually means the token lacks the `whatsapp_business_management` scope.'
          : '')
    );
  }
  return Array.isArray(data.data) ? data.data : [];
}

async function createTemplate(tpl) {
  const payload = {
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    components: [
      {
        type: 'BODY',
        text: tpl.body,
        example: { body_text: [tpl.examples] },
      },
    ],
  };
  const res = await fetch(graphUrl(`${WABA_ID}/message_templates`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw new Error(`HTTP ${res.status}: ${err.error_user_msg || err.message || 'unknown error'}`);
  }
  return data;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const listOnly = args.includes('--list');

  if (!WABA_ID) {
    console.error('ERROR: WABA_ID is not set.');
    console.error('  Helvaro production WABA: 1000493482531092');
    console.error('  Run: WABA_ID=... WHATSAPP_MANAGEMENT_TOKEN=... node scripts/create-wa-templates.js');
    process.exit(1);
  }
  if (!TOKEN) {
    console.error('ERROR: no token. Set WHATSAPP_MANAGEMENT_TOKEN (needs the');
    console.error('  `whatsapp_business_management` scope — create a System User token in');
    console.error('  Meta Business Settings -> System Users).');
    process.exit(1);
  }
  if (USING_FALLBACK_TOKEN) {
    console.warn(
      'WARNING: falling back to WHATSAPP_TOKEN. That token is usually messaging-only;\n' +
        '         if you get a permissions error, generate a management-scoped token.\n'
    );
  }

  console.log(`WABA ${WABA_ID} — fetching existing templates...\n`);
  const existing = await listTemplates();
  const byName = new Map(existing.map((t) => [`${t.name}::${t.language}`, t]));

  if (existing.length) {
    console.log('Already on this account:');
    for (const t of existing) {
      console.log(`  - ${t.name} (${t.language}) [${t.category}] -> ${t.status}`);
    }
    console.log('');
  } else {
    console.log('(no templates on this account yet)\n');
  }

  if (listOnly) return;

  const results = [];
  for (const tpl of TEMPLATES) {
    const key = `${tpl.name}::${tpl.language}`;
    if (byName.has(key)) {
      const cur = byName.get(key);
      console.log(`SKIP   ${tpl.name} — already exists (status: ${cur.status})`);
      results.push({ name: tpl.name, action: 'skipped', status: cur.status });
      continue;
    }

    if (!commit) {
      console.log(`WOULD SUBMIT  ${tpl.name} (${tpl.language}) [${tpl.category}]`);
      console.log('   ' + tpl.body.replace(/\n/g, '\n   '));
      console.log(`   examples: ${JSON.stringify(tpl.examples)}\n`);
      results.push({ name: tpl.name, action: 'dry-run' });
      continue;
    }

    try {
      const created = await createTemplate(tpl);
      console.log(
        `SUBMITTED  ${tpl.name} — id ${created.id || '?'}, status ${created.status || 'PENDING'}`
      );
      results.push({ name: tpl.name, action: 'submitted', status: created.status || 'PENDING' });
    } catch (err) {
      console.error(`FAILED     ${tpl.name}: ${err.message}`);
      results.push({ name: tpl.name, action: 'failed', error: err.message });
    }
  }

  console.log('\n--- summary ---');
  for (const r of results) {
    console.log(`  ${r.name}: ${r.action}${r.status ? ' (' + r.status + ')' : ''}`);
  }

  if (!commit && results.some((r) => r.action === 'dry-run')) {
    console.log('\nDry run — nothing was submitted. Re-run with --commit to submit for review.');
  }
  if (commit) {
    console.log('\nMeta review usually takes minutes to a few hours. Once APPROVED, set:');
    for (const tpl of TEMPLATES) console.log(`  ${tpl.usedBy}=${tpl.name}`);
    console.log('in the Vercel project env, or confirmations/reminders will keep no-opping.');
  }
}

main().catch((err) => {
  console.error('\nUnexpected failure:', err.message);
  process.exit(1);
});
