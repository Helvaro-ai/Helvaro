'use strict';
/*
 * De WhatsApp-templates die Helvaro indient bij Meta: de teksten, de
 * voorbeeldwaarden, en het indienen zelf.
 *
 * ── Waarom dit uit scripts/create-wa-templates.js is gehaald ────────────────
 * Dat script draaide alleen lokaal, met een management-token in de shell. Op
 * 2026-09-13 bleek dat de eigenaar geen terminal met dat token had en dat
 * Meta's template-editor in de browser bevroor. De server HEEFT het token al
 * (WHATSAPP_MANAGEMENT_TOKEN of, als terugval, WHATSAPP_TOKEN, dat de
 * gereedheidscheck al gebruikt om de lijst te lezen). Dus kan het indienen ook
 * vanuit de back-office, met dezelfde definities -- één bron, geen twee
 * lijsten die uit elkaar lopen.
 *
 * Het script blijft bestaan en leest deze module; de admin-mode
 * 'ops-templates-submit' in api/admin.js doet hetzelfde over HTTP.
 *
 * ── Wat hier NIET gebeurt ────────────────────────────────────────────────────
 * Geen token in een antwoord of een log. Bestaande templates (welke status ook)
 * worden overgeslagen, nooit overschreven.
 *
 * ── Geen route ──────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const GRAPH_VERSION = 'v23.0';
const LANGS = ['nl_BE', 'fr_BE', 'en_GB', 'de'];

const TEKSTEN = {
  helvaro_afspraak_bevestiging: {
    category: 'UTILITY',
    usedBy: 'BOOKING_TEMPLATE_NAME',
    params: ['naam', 'bedrijf', 'wanneer'],
    body: {
      // Identical to the live APPROVED nl_BE template — do not reword without
      // resubmitting it for review.
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
    params: ['naam', 'bedrijf', 'wanneer'],
    body: {
      // Identical to the live APPROVED nl_BE template.
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
  // roughly 2x UTILITY (~EUR0.05/msg). The existing INTRO template
  // `helvaro_nieuwe_lead` is MARKETING, but it is a service reply to someone who
  // just filled in a form ASKING to be contacted — a defensible UTILITY case.
  // On 100 leads/month that is ~EUR7/client/month, and it scales with every client.
  //   Risk: Meta may re-categorise it back to MARKETING. That is a SAFE failure
  //   mode — you simply pay the old rate; nothing breaks.
  // Same 3 params as INTRO_TEMPLATE_NAME so it is a drop-in replacement.
  helvaro_nieuwe_lead_util: {
    category: 'UTILITY',
    usedBy: '(optioneel) goedkoper alternatief voor INTRO_TEMPLATE_NAME',
    params: ['naam', 'ai', 'bedrijf'],
    body: {
      nl_BE:
        'Hoi {{1}}, {{2}} hier van {{3}}. Bedankt voor je aanvraag.\n\n' +
        'Ik help je graag verder — mag ik je een paar korte vragen stellen zodat we je goed kunnen helpen?',
      fr_BE:
        'Bonjour {{1}}, ici {{2}} de {{3}}. Merci pour votre demande.\n\n' +
        'Je vous aide volontiers — puis-je vous poser quelques questions afin de bien vous orienter ?',
      en_GB:
        'Hi {{1}}, this is {{2}} from {{3}}. Thanks for your enquiry.\n\n' +
        'I\'m happy to help — may I ask a few short questions so we can assist you properly?',
      de:
        'Hallo {{1}}, hier ist {{2}} von {{3}}. Vielen Dank für Ihre Anfrage.\n\n' +
        'Ich helfe Ihnen gerne weiter — darf ich Ihnen ein paar kurze Fragen stellen, damit wir Sie gut beraten können?',
    },
  },

  // CAMPAIGNS (api/_campagnes.js). A campaign targets leads whose 24h window is
  // long closed, so it can only go out as an approved MARKETING template.
  //   No sender exists yet, so THIS declaration defines the contract: whoever
  //   implements verstuur() must pass [leadName, clientName, offerLine].
  //   IMPORTANT: a template body is FIXED text — Meta rejects templates that are
  //   mostly one open variable. Faro's free-written campaign `Message` is therefore
  //   NOT sent verbatim; it maps into {{3}} as one short offer line.
  //   The STOP footer is required-in-spirit for marketing and is already understood
  //   by api/_optout.js, which matches both "stop" and "stopp".
  // ── Dealership (autohandel) ──────────────────────────────────────────────
  // Two UTILITY templates that carry what the generic ones cannot: the car.
  // The code (api/_dealer-melding.js, api/cron-followup.js) only uses them once
  // Meta reports them APPROVED — until then it falls back to lead_alert and
  // afspraak_herinnering, so submitting these is safe at any time.
  helvaro_dealer_afspraak: {
    category: 'UTILITY',
    usedBy: 'DEALER_NOTIFY_TEMPLATE_NAME (api/_dealer-melding.js)',
    params: ['naam', 'wanneer', 'voertuig', 'prijs', 'type', 'score'],
    body: {
      nl_BE:
        'Nieuwe afspraak: {{1}} komt {{2}} voor de {{3}} ({{4}}).\n\n' +
        'Type: {{5}}. Leadscore: {{6}}.\n\n' +
        'Details staan in je Helvaro-dashboard.',
      fr_BE:
        'Nouveau rendez-vous : {{1}} vient {{2}} pour la {{3}} ({{4}}).\n\n' +
        'Type : {{5}}. Score du lead : {{6}}.\n\n' +
        'Les détails sont dans votre tableau de bord Helvaro.',
      en_GB:
        'New appointment: {{1}} is coming {{2}} for the {{3}} ({{4}}).\n\n' +
        'Type: {{5}}. Lead score: {{6}}.\n\n' +
        'Details are in your Helvaro dashboard.',
      de:
        'Neuer Termin: {{1}} kommt {{2}} für den {{3}} ({{4}}).\n\n' +
        'Art: {{5}}. Lead-Score: {{6}}.\n\n' +
        'Details finden Sie in Ihrem Helvaro-Dashboard.',
    },
  },
  helvaro_dealer_herinnering: {
    category: 'UTILITY',
    usedBy: 'DEALER_REMINDER_TEMPLATE_NAME (api/cron-followup.js)',
    params: ['naam', 'wanneer', 'voertuig'],
    body: {
      nl_BE:
        'Hoi {{1}}, kleine herinnering: je proefrit met de {{3}} staat gepland voor {{2}}.\n\n' +
        'Breng je rijbewijs mee. Antwoord gerust op dit bericht als er iets gewijzigd is.',
      fr_BE:
        'Bonjour {{1}}, petit rappel : votre essai de la {{3}} est prévu pour {{2}}.\n\n' +
        'Pensez à votre permis de conduire. Répondez à ce message si quelque chose a changé.',
      en_GB:
        'Hi {{1}}, a quick reminder: your test drive in the {{3}} is scheduled for {{2}}.\n\n' +
        'Please bring your driving licence. Reply to this message if anything has changed.',
      de:
        'Hallo {{1}}, kurze Erinnerung: Ihre Probefahrt mit dem {{3}} ist für {{2}} geplant.\n\n' +
        'Bitte bringen Sie Ihren Führerschein mit. Antworten Sie auf diese Nachricht, falls sich etwas geändert hat.',
    },
  },

  helvaro_nieuw_aanbod: {
    category: 'MARKETING',
    usedBy: 'CAMPAIGN_TEMPLATE_NAME (api/_campagnes.js)',
    params: ['naam', 'bedrijf', 'aanbod'],
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

// Sample values shown to Meta's reviewer, keyed by SEMANTIC name so they follow
// each template's own `params` order. They must be in the template's language.
const VOORBEELDEN = {
  nl_BE: {
    naam: 'Jan',
    ai: 'Sofie',
    bedrijf: 'KinePraktijk Gent',
    wanneer: 'dinsdag 12 augustus om 14:30',
    aanbod: 'Nieuw in de verkoop: ruime gezinswoning in Deinze, 3 slaapkamers en tuin — 349.000 euro.',
    voertuig: 'BMW 330e', prijs: '€ 29.500', type: 'proefrit', score: '91/100',
  },
  fr_BE: {
    naam: 'Marie',
    ai: 'Sofie',
    bedrijf: 'KinePraktijk Gent',
    wanneer: 'mardi 12 août à 14h30',
    aanbod: 'Nouveau à la vente : maison familiale spacieuse à Deinze, 3 chambres et jardin — 349.000 euros.',
    voertuig: 'BMW 330e', prijs: '29.500 €', type: 'essai', score: '91/100',
  },
  en_GB: {
    naam: 'Emma',
    ai: 'Sofie',
    bedrijf: 'KinePraktijk Gent',
    wanneer: 'Tuesday 12 August at 14:30',
    aanbod: 'New on the market: spacious family home in Deinze, 3 bedrooms and a garden — 349,000 euro.',
    voertuig: 'BMW 330e', prijs: '€29,500', type: 'test drive', score: '91/100',
  },
  de: {
    naam: 'Lukas',
    ai: 'Sofie',
    bedrijf: 'KinePraktijk Gent',
    wanneer: 'Dienstag, 12. August um 14:30 Uhr',
    aanbod: 'Neu im Angebot: geräumiges Familienhaus in Deinze, 3 Schlafzimmer und Garten — 349.000 Euro.',
    voertuig: 'BMW 330e', prijs: '29.500 €', type: 'Probefahrt', score: '91/100',
  },
};

const TEMPLATES = [];
for (const [name, def] of Object.entries(TEKSTEN)) {
  for (const language of LANGS) {
    const body = def.body[language];
    const examples = def.params.map((k) => VOORBEELDEN[language][k]);

    // Meta rejects a template whose example count does not match its variable
    // count, and a silent mismatch here is exactly the bug `params` exists to
    // prevent. Fail loudly at build time instead of at submit time.
    const hoogste = Math.max(0, ...[...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    if (hoogste !== def.params.length) {
      throw new Error(
        `${name} (${language}): body uses {{1}}..{{${hoogste}}} but params declares ` +
          `${def.params.length} (${def.params.join(', ')})`
      );
    }
    if (examples.some((v) => v === undefined)) {
      throw new Error(`${name} (${language}): missing example for one of ${def.params.join(', ')}`);
    }

    TEMPLATES.push({
      name,
      language,
      category: def.category,
      body,
      footer: def.footer ? def.footer[language] : null,
      examples,
      usedBy: def.usedBy,
    });
  }
}


function graphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

async function listTemplates(wabaId, token) {
  const res = await fetch(
    graphUrl(`${wabaId}/message_templates?fields=name,status,category,language&limit=200`),
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw new Error(
      `list failed (HTTP ${res.status}): ${err.message || 'unknown error'}` +
        (err.code === 200 || /permission/i.test(err.message || '')
          ? ' -> het token mist de scope whatsapp_business_management.'
          : '')
    );
  }
  return Array.isArray(data.data) ? data.data : [];
}

async function createTemplate(wabaId, token, tpl) {
  const payload = {
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    components: [{ type: 'BODY', text: tpl.body, example: { body_text: [tpl.examples] } }],
  };
  if (tpl.footer) payload.components.push({ type: 'FOOTER', text: tpl.footer });
  const res = await fetch(graphUrl(`${wabaId}/message_templates`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw new Error(`HTTP ${res.status}: ${err.error_user_msg || err.message || 'unknown error'}`);
  }
  return data;
}

/**
 * Indienen wat er nog niet is. Idempotent: wat al bestaat (in welke status
 * ook) wordt overgeslagen.
 * @param {object} o  { wabaId, token, alleen?: string[] (namen), commit: boolean }
 * @returns {Promise<{bestaand:number, resultaten:Array}>}
 */
async function dienIn({ wabaId, token, alleen, commit }) {
  if (!wabaId || !token) throw new Error('WABA_ID of token ontbreekt.');
  const bestaand = await listTemplates(wabaId, token);
  const opNaam = new Map(bestaand.map((t) => [`${t.name}::${t.language}`, t]));
  const filter = Array.isArray(alleen) && alleen.length ? new Set(alleen) : null;
  const resultaten = [];
  for (const tpl of TEMPLATES) {
    if (filter && !filter.has(tpl.name)) continue;
    const key = `${tpl.name}::${tpl.language}`;
    if (opNaam.has(key)) {
      resultaten.push({ name: tpl.name, language: tpl.language, action: 'skipped', status: opNaam.get(key).status });
      continue;
    }
    if (!commit) { resultaten.push({ name: tpl.name, language: tpl.language, action: 'would_create' }); continue; }
    try {
      const d = await createTemplate(wabaId, token, tpl);
      resultaten.push({ name: tpl.name, language: tpl.language, action: 'created', status: d.status || 'PENDING', id: d.id });
    } catch (e) {
      resultaten.push({ name: tpl.name, language: tpl.language, action: 'failed', error: String(e && e.message || e).slice(0, 300) });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { bestaand: bestaand.length, resultaten };
}

module.exports = { GRAPH_VERSION, LANGS, TEKSTEN, VOORBEELDEN, TEMPLATES, listTemplates, createTemplate, dienIn };
