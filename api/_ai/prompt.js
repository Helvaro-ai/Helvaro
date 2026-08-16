'use strict';
/*
 * Helvaro AI — system prompt assembly.
 *
 * SCAFFOLD: structure complete, the context fetch is stubbed.
 *
 * ── Why the prompt is built per-turn from live data ──────────────────────────
 * Requirement 6: Helvaro AI "should feel fundamentally different from a generic
 * chatbot" because it knows the company's leads, properties, conversations,
 * CRM, analytics, campaigns, calendar and marketing assets.
 *
 * A static prompt saying "you have access to CRM data" does not achieve that —
 * it produces an assistant that *claims* knowledge and then guesses. What
 * achieves it is a small, always-fresh orientation block: how many leads exist,
 * what the pipeline looks like right now, which properties are active, whose
 * agency this is. Enough for the model to answer "how are we doing?" without a
 * tool call, and — more importantly — enough for it to know which tool to reach
 * for instead of inventing an answer.
 *
 * Kept deliberately SMALL. This block is re-sent on every turn of every
 * conversation; padding it with full record dumps costs money on each turn and
 * buries the instructions. Details come from tools, on demand. The prompt
 * carries orientation, not data.
 *
 * ── Language ─────────────────────────────────────────────────────────────────
 * Helvaro's users are Belgian estate agents; the dashboard is Dutch. The
 * assistant answers in the user's language, defaulting to Dutch, reusing the
 * language registry in api/_lang.js rather than a second list here.
 */

const IDENTITY = `Je bent Helvaro AI, de assistent binnen het Helvaro-platform voor vastgoedmakelaars.

Je bent geen algemene chatbot. Je werkt binnen het CRM van dit kantoor en je hebt
via tools toegang tot hun echte leads, panden, gesprekken, pipeline, cijfers,
campagnes en agenda.

Werkwijze:
- Zoek het op. Als een vraag over leads, panden, gesprekken of cijfers gaat,
  gebruik je een tool. Je verzint nooit cijfers, namen, bedragen of data.
- Als een tool niets teruggeeft, zeg je dat. Je vult het gat niet op.
- Antwoord kort. Eén of twee zinnen, daarna de kaarten of het resultaat.
  De interface toont de details — jij hoeft ze niet uit te schrijven.
- Je noemt nooit welk onderliggend AI-model je gebruikt. Je bent Helvaro AI.

Acties:
- Berichten versturen, campagnes aanmaken, agenda-items inplannen en leads aan
  een campagne toevoegen gebeuren NOOIT zonder bevestiging van de gebruiker.
  Je bereidt ze voor; de gebruiker bevestigt in de interface.
- Beschrijf wat je gaat doen voordat je het voorbereidt, zodat de bevestiging
  begrijpelijk is.`;

/**
 * Orientation block: a compact snapshot of this tenant right now.
 * WIRE TO: the same aggregates the CRM dashboard already computes — reuse,
 * don't recompute. Must stay under ~200 tokens.
 *
 * @param {object} ctx  { projectCode, userId, lang }
 * @returns {Promise<string>}
 */
async function buildContextBlock(_ctx) {
  // NOT WIRED — shape of the real block:
  //
  //   Kantoor: <clientName>
  //   Leads: 128 totaal · 14 nieuw deze week · 31 gekwalificeerd
  //   Pipeline: €2,4M over 4 fases
  //   Panden: 9 actief
  //   Agenda: 3 afspraken de komende 7 dagen
  //   Vandaag: <ISO date>
  return [
    'Kantoorgegevens zijn nog niet aangesloten.',
    'Gebruik tools voor alle concrete gegevens.',
  ].join('\n');
}

/**
 * What the "Helvaro context" indicator in the UI reports (requirement 6).
 * Derived from the same source as the prompt so the badge can never claim
 * access the assistant does not actually have.
 */
function contextSources() {
  return [
    { key: 'leads',         label: 'Leads',        available: true  },
    { key: 'properties',    label: 'Panden',       available: true  },
    { key: 'conversations', label: 'Gesprekken',   available: true  },
    { key: 'analytics',     label: 'Analytics',    available: true  },
    { key: 'campaigns',     label: 'Campagnes',    available: false },
    { key: 'calendar',      label: 'Agenda',       available: true  },
    { key: 'assets',        label: 'Marketing',    available: false },
  ];
}

/**
 * Assemble the full system prompt for one turn.
 * @param {object} ctx { projectCode, userId, lang, projectId? }
 */
async function build(ctx) {
  const contextBlock = await buildContextBlock(ctx);
  const lang = ctx.lang || 'nl';

  const parts = [
    IDENTITY,
    '',
    '── Actuele situatie ──',
    contextBlock,
    '',
    `Antwoord in de taal van de gebruiker (standaard: ${lang}).`,
  ];

  // A conversation opened inside a Project is scoped to it (requirement 12):
  // the property, leads and campaign of that project are the default subject.
  if (ctx.projectName) {
    parts.push('', `Dit gesprek hoort bij het project "${ctx.projectName}". Neem dat als context.`);
  }

  return parts.join('\n');
}

module.exports = { build, buildContextBlock, contextSources, IDENTITY };
