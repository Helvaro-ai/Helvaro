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
const GRAPH_VERSION = 'v23.0';
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
const LANGS = ['nl_BE', 'fr_BE', 'en_GB', 'de'];

// Meta does NOT translate templates: every language is a separate submission whose
// body you must write out in full. Same name + different language = one template
// each, and each counts against the WABA template limit.
//
// Variables are POSITIONAL and identical across languages, so the send-side code
// can stay language-agnostic:
//   {{1}} lead name   {{2}} client (business) name   {{3}} datetime / offer line
const TEKSTEN = {
  helvaro_afspraak_bevestiging: {
    category: 'UTILITY',
    usedBy: 'BOOKING_TEMPLATE_NAME',
    body: {
      nl_BE:
        'Hoi {{1}}, je afspraak bij {{2}} is bevestigd voor {{3}}.\n\n' +
        'Kan je er niet bij zijn? Antwoord op dit bericht, dan zoeken we een ander moment.',
      fr_BE:
        'Bonjour {{1}}, votre rendez-vous chez {{2}} est confirmé pour {{3}}.\n\n' +
        'Un empêchement ? Répondez à ce message et nous trouverons un autre moment.',
      en_GB:
        'Hi {{1}}, your appointment with {{2}} is confirmed for {{3}}.\n\n' +
        'Can\'t make it? Reply to this message and we\'ll find another time.',
      de:
        'Hallo {{1}}, Ihr Termin bei {{2}} ist bestätigt für {{3}}.\n\n' +
        'Sie können nicht? Antworten Sie auf diese Nachricht, dann finden wir einen anderen Termin.',
    },
  },

  helvaro_afspraak_herinnering: {
    category: 'UTILITY',
    usedBy: 'REMINDER_TEMPLATE_NAME',
    body: {
      nl_BE:
        'Hoi {{1}}, kleine herinnering: je afspraak bij {{2}} staat gepland voor {{3}}.\n\n' +
        'Tot dan! Antwoord gerust op dit bericht als er iets gewijzigd is.',
      fr_BE:
        'Bonjour {{1}}, petit rappel : votre rendez-vous chez {{2}} est prévu pour {{3}}.\n\n' +
        'À bientôt ! Répondez à ce message si quelque chose a changé.',
      en_GB:
        'Hi {{1}}, a quick reminder: your appointment with {{2}} is scheduled for {{3}}.\n\n' +
        'See you then! Reply to this message if anything has changed.',
      de:
        'Hallo {{1}}, kurze Erinnerung: Ihr Termin bei {{2}} ist für {{3}} geplant.\n\n' +
        'Bis dann! Antworten Sie auf diese Nachricht, falls sich etwas geändert hat.',
    },
  },

  // COST OPTIMISATION (optional). Meta bills per delivered template message and
  // Belgium sits in "Rest of Western Europe", where MARKETING (~EUR0.11/msg) costs
  // roughly 2x UTILITY (~EUR0.05/msg). The existing first-contact template
  // `helvaro_nieuwe_lead` is MARKETING, but it is a service reply to someone who
  // just filled in a form ASKING to be contacted — a defensible UTILITY case.
  // On 100 leads/month that is ~EUR7/client/month, and it scales with every client.
  //   Risk: Meta may re-categorise it back to MARKETING. That is a SAFE failure
  //   mode — you simply pay the old rate; nothing breaks.
  helvaro_nieuwe_lead_util: {
    category: 'UTILITY',
    usedBy: '(optioneel) goedkoper alternatief voor helvaro_nieuwe_lead',
    vars: 2,
    body: {
      nl_BE:
        'Hoi {{1}}, bedankt voor je aanvraag bij {{2}}.\n\n' +
        'Ik help je graag verder — mag ik je een paar korte vragen stellen zodat we je goed kunnen helpen?',
      fr_BE:
        'Bonjour {{1}}, merci pour votre demande chez {{2}}.\n\n' +
        'Je vous aide volontiers — puis-je vous poser quelques questions afin de bien vous orienter ?',
      en_GB:
        'Hi {{1}}, thanks for your enquiry with {{2}}.\n\n' +
        'I\'m happy to help — may I ask a few short questions so we can assist you properly?',
      de:
        'Hallo {{1}}, vielen Dank für Ihre Anfrage bei {{2}}.\n\n' +
        'Ich helfe Ihnen gerne weiter — darf ich Ihnen ein paar kurze Fragen stellen, damit wir Sie gut beraten können?',
    },
  },

  // CAMPAIGNS (api/_campagnes.js). A campaign targets leads whose 24h window is
  // long closed, so it can only go out as an approved MARKETING template.
  //   IMPORTANT: Faro writes a campaign `Message` freely, but a template body is
  //   FIXED text — Meta rejects templates that are mostly one open variable. So the
  //   campaign message is NOT sent verbatim: the send-side maps it into {{3}}, one
  //   short offer line. Keep {{3}} to a sentence or two.
  //   The STOP footer is required-in-spirit for marketing and is already understood
  //   by api/_optout.js, which recognises "stop" in every language below.
  helvaro_nieuw_aanbod: {
    category: 'MARKETING',
    usedBy: 'CAMPAIGN_TEMPLATE_NAME (api/_campagnes.js)',
    body: {
      nl_BE:
        'Hallo {{1}}, we hebben nieuws vanuit {{2}}.\n\n{{3}}\n\n' +
        'Interesse? Antwoord op dit bericht, dan plannen we snel iets in.',
      fr_BE:
        'Bonjour {{1}}, voici du nouveau de la part de {{2}}.\n\n{{3}}\n\n' +
        'Cela vous intéresse ? Répondez à ce message et nous fixons un rendez-vous.',
      en_GB:
        'Hello {{1}}, here\'s an update from {{2}}.\n\n{{3}}\n\n' +
        'Interested? Reply to this message and we\'ll arrange a time.',
      de:
        'Hallo {{1}}, hier ist eine Neuigkeit von {{2}}.\n\n{{3}}\n\n' +
        'Interesse? Antworten Sie auf diese Nachricht, dann vereinbaren wir einen Termin.',
    },
    footer: {
      nl_BE: 'Liever geen berichten meer? Antwoord STOP.',
      fr_BE: 'Vous ne souhaitez plus recevoir de messages ? Répondez STOP.',
      en_GB: 'Prefer not to receive these? Reply STOP.',
      de: 'Keine Nachrichten mehr? Antworten Sie mit STOP.',
    },
  },
};

// Sample values shown to Meta's reviewer. They must be in the template's own
// language, and there must be exactly one per variable.
const VOORBEELDEN = {
  nl_BE: ['Jan', 'KinePraktijk Gent', 'dinsdag 12 augustus om 14:30'],
  fr_BE: ['Marie', 'KinePraktijk Gent', 'mardi 12 août à 14h30'],
  en_GB: ['Emma', 'KinePraktijk Gent', 'Tuesday 12 August at 14:30'],
  de: ['Lukas', 'KinePraktijk Gent', 'Dienstag, 12. August um 14:30 Uhr'],
};

// {{3}} carries an offer line for campaigns, not a datetime.
const AANBOD_VOORBEELD = {
  nl_BE: 'Nieuw in de verkoop: ruime gezinswoning in Deinze, 3 slaapkamers en tuin — 349.000 euro.',
  fr_BE: 'Nouveau à la vente : maison familiale spacieuse à Deinze, 3 chambres et jardin — 349.000 euros.',
  en_GB: 'New on the market: spacious family home in Deinze, 3 bedrooms and a garden — 349,000 euro.',
  de: 'Neu im Angebot: geräumiges Familienhaus in Deinze, 3 Schlafzimmer und Garten — 349.000 Euro.',
};

const TEMPLATES = [];
for (const [name, def] of Object.entries(TEKSTEN)) {
  for (const language of LANGS) {
    const aantal = def.vars || 3;
    const voorbeelden = VOORBEELDEN[language].slice(0, aantal);
    if (def.category === 'MARKETING') voorbeelden[2] = AANBOD_VOORBEELD[language];
    TEMPLATES.push({
      name,
      language,
      category: def.category,
      body: def.body[language],
      footer: def.footer ? def.footer[language] : null,
      examples: voorbeelden,
      usedBy: def.usedBy,
    });
  }
}


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
  // Footers carry no variables, so no `example` block is needed.
  if (tpl.footer) payload.components.push({ type: 'FOOTER', text: tpl.footer });

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
