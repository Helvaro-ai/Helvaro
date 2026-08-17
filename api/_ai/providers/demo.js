'use strict';
/*
 * Helvaro AI — demo provider.
 *
 * A scripted provider that streams canned responses and issues REAL tool calls.
 * Selected with AI_PROVIDER=demo. Costs nothing and calls nobody.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Two reasons, and the second is the better one.
 *
 * 1. Local development. Without it, seeing the workspace work requires an
 *    ANTHROPIC_API_KEY, live Airtable credentials, and a paid call per keystroke
 *    of iteration. With it, the entire pipeline — SSE framing, the tool loop,
 *    component rendering, the confirmation gate, mascot states, error paths —
 *    is exercisable offline. Every part of the turn is real except the model.
 *
 * 2. It is the third implementation of the adapter contract in ./index.js, and
 *    it was written last. An abstraction is only proven when something
 *    structurally unlike the original fits it: Claude and OpenAI are both
 *    HTTP+SSE and could have shared a hidden assumption. This one is a
 *    generator over a local array. It fits unchanged, which is the evidence
 *    that the contract describes a capability rather than a vendor's shape.
 *
 * ── What it does NOT do ──────────────────────────────────────────────────────
 * It does not fake tool RESULTS. It emits genuine tool_call events, the
 * orchestrator runs the real tool, and the real result comes back. So a demo
 * conversation exercises the true data path — with fixtures behind it when
 * AI_DEMO_MODE=1 (see ../fixtures.js), and with empty results otherwise.
 * Nothing here can make a mocked answer look like a real one.
 */

/*
 * Ordered MOST SPECIFIC FIRST, because pickScript() takes the first match and
 * these patterns overlap the way real phrasing does: "stuur een opvolgbericht"
 * contains both "stuur" (an action) and "opvolg" (a lead query). Intent to ACT
 * has to beat intent to LOOK UP, or the demo answers a question the user did
 * not ask — the same precedence a real model applies from the wording.
 */
const SCRIPTS = [
  {
    // Campaign — ends at a confirmation card.
    match: /campagne|campaign|adverteer|promoot/i,
    steps: [
      { type: 'text', text: 'Ik stel een campagne voor. Er wordt nog niets aangemaakt — bekijk het en bevestig hieronder.\n\n' },
      { type: 'tool', name: 'create_campaign', input: { propertyId: 'demo-prop-1', channels: ['whatsapp', 'social'], leadIds: ['demo-1', 'demo-3', 'demo-6'] } },
    ],
  },
  {
    // Calendar — also a confirmation card, different action.
    match: /\bplan\b|inplannen|agenda|schedule|afspraak|morgen/i,
    steps: [
      { type: 'text', text: 'Ik heb het opvolgmoment klaargezet.\n\n' },
      { type: 'tool', name: 'schedule_followup', input: { leadId: 'demo-2', when: 'tomorrow', note: 'Opvolging na eerste contact' } },
    ],
  },
  {
    // Sending messages — the highest-consequence gate.
    match: /stuur|verstuur|send|bericht/i,
    steps: [
      { type: 'text', text: 'Ik heb de berichten voorbereid. Niets is verstuurd — bekijk het en bevestig hieronder.\n\n' },
      { type: 'tool', name: 'create_followup', input: { leadIds: ['demo-1', 'demo-2', 'demo-3'], tone: 'warm' } },
    ],
  },
  {
    match: /pipeline|omzet|waarde|fase/i,
    steps: [
      { type: 'tool', name: 'get_pipeline', input: {} },
      { type: 'text', text: 'Je pipeline in één oogopslag. De grootste waarde staat stil in de kwalificatiefase — daar valt vandaag het meest te winnen.' },
    ],
  },
  {
    match: /cijfer|analytics|prestat|conversie|responstijd/i,
    steps: [
      { type: 'tool', name: 'get_analytics', input: { period: '30d' } },
      { type: 'text', text: 'Je prestaties over de laatste 30 dagen.' },
    ],
  },
  {
    match: /gesprek|samenvat|summar/i,
    steps: [
      { type: 'tool', name: 'search_conversations', input: { since: 'today', limit: 20 } },
      { type: 'text', text: 'Samenvatting van vandaag: drie gesprekken vragen opvolging, één lead wil een bezoek inplannen.' },
    ],
  },
  {
    // Lead lookup — the broadest pattern, so it goes last.
    match: /lead|contact|hottest|beste|opvolg|follow.?up|bel|budget/i,
    steps: [
      { type: 'text', text: 'Ik kijk naar je pipeline…\n\n' },
      { type: 'tool', name: 'search_leads', input: { minBudget: 300000, timeframe: '1-3m', limit: 8 } },
      { type: 'text', text: 'Dit zijn de leads die vandaag aandacht verdienen. Ze hebben allemaal een concreet budget en willen binnen drie maanden kopen.' },
    ],
  },
];

const FALLBACK = [
  { type: 'text', text: 'Ik ben Helvaro AI. Ik kan je leads doorzoeken, je pipeline analyseren, ' },
  { type: 'text', text: 'panden en teksten maken en opvolging voorbereiden.\n\n' },
  { type: 'text', text: 'Probeer bijvoorbeeld: "Wie zijn mijn beste leads?"' },
];

function pickScript(messages) {
  // Last user text block, which is what a real provider would also weigh most.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = (m.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ');
    if (!text) continue;
    const hit = SCRIPTS.find((s) => s.match.test(text));
    return hit ? hit.steps : FALLBACK;
  }
  return FALLBACK;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Implements the adapter contract in ./index.js. */
async function* streamChat({ messages, tools }) {
  // A turn that already contains tool results is the loop's SECOND pass. The
  // scripts above emit their tool call on the first pass only, so the second
  // pass must close the turn — otherwise the orchestrator would loop until it
  // hit maxToolIterations.
  const hasToolResults = messages.some((m) => (m.content || []).some((b) => b.type === 'tool_result'));

  const steps = hasToolResults
    ? [{ type: 'text', text: '' }]
    : pickScript(messages);

  let stopReason = 'end_turn';

  for (const step of steps) {
    if (step.type === 'text') {
      // Stream word by word so the client's SSE reader and the typing state get
      // exercised the way a real stream would drive them.
      for (const word of step.text.split(/(\s+)/)) {
        if (!word) continue;
        await sleep(18);
        yield { type: 'text', text: word };
      }
    } else if (step.type === 'tool') {
      // Respect the orchestrator withholding tools at the iteration ceiling.
      if (!tools || !tools.length) continue;
      if (!tools.some((t) => t.name === step.name)) continue;
      await sleep(120);
      yield {
        type: 'tool_call',
        id: `demo_${step.name}_${Date.now().toString(36)}`,
        name: step.name,
        input: step.input || {},
      };
      stopReason = 'tool_use';
    }
  }

  yield { type: 'usage', inputTokens: 0, outputTokens: 0 };
  yield { type: 'done', stopReason };
}

module.exports = { streamChat };
