'use strict';
/*
 * Faro — the orchestrator.
 *
 * SCAFFOLD: the turn loop is written out in full; it runs as far as the
 * provider adapter, which throws NOT_WIRED. Everything around that call —
 * the tool loop, the confirmation gate, streaming, persistence, metering —
 * is real structure, not pseudocode.
 *
 * ── What this file owns ──────────────────────────────────────────────────────
 * One turn, end to end:
 *   1. build the system prompt (./prompt.js)
 *   2. window the history (./store.js)
 *   3. stream from the active provider (./providers)
 *   4. when the model asks for a tool:
 *        read-tool → run it, feed the result back, continue the loop
 *        act-tool  → STOP. Emit a confirmation card. Do not execute.
 *   5. persist the assistant message, meter the credits, close the stream
 *
 * ── Why the tool loop is bounded ─────────────────────────────────────────────
 * LIMITS.maxToolIterations exists because a model that keeps calling tools
 * keeps costing money, and a loop with no ceiling is an unbounded bill
 * triggered by a single user message. At the ceiling we stop calling tools and
 * ask the model to answer with what it has.
 *
 * ── Why act-tools break the loop instead of pausing inside it ────────────────
 * A "pause and wait for the user" inside a streaming HTTP response would mean
 * holding a serverless function open across a human decision — minutes,
 * possibly abandoned. Instead the turn ENDS at the confirmation card. The
 * user's click starts a NEW request (./actions.js execute path) carrying the
 * staged actionId. Stateless, cheap, and it survives the user walking away.
 */

const config    = require('./config');
const prompt    = require('./prompt');
const tools     = require('./tools');
const actions   = require('./actions');
const schema    = require('./schema');
const store     = require('./store');
const stream    = require('./stream');
const { getProvider, ProviderError } = require('./providers');
const credits = require('../_credits');

/* waitUntil meldt een belofte aan bij het platform, zodat die nog mag
 * aflopen NADAT het antwoord is afgesloten. Zonder dat mag Vercel de
 * container bevriezen zodra res.end() valt, en dan verdwijnt alles wat er nog
 * liep -- zonder fout, zonder logregel.
 *
 * Dat raakt hier drie dingen die allemaal PAS na de laatste tekst vertrekken:
 * het afboeken van de credits en het bewaren van de vraag en het antwoord.
 * Fire-and-forget was een bewuste keuze (de gebruiker hoort niet te wachten op
 * een schrijfactie), maar "niet wachten" en "mag wegvallen" zijn niet
 * hetzelfde. Een beurt die niet werd afgeboekt is een beurt die gratis was, en
 * een antwoord dat niet werd bewaard is er niet meer als je morgen terugkomt.
 *
 * api/whatsapp.js en api/form.js lossen dit al zo op en leggen daar in hun kop
 * uit waarom; deze kant was de enige die het nog niet deed. Buiten Vercel is
 * het een no-op, dus lokaal en in de tests verandert er niets. */
const { waitUntil } = require('@vercel/functions');

/**
 * Run one conversational turn, streaming to `res`.
 *
 * @param {object} args
 * @param {object} args.res            Node response — already SSE-opened
 * @param {object} args.ctx            { projectCode, userId, lang, projectName? }
 * @param {string} args.conversationId
 * @param {Array}  args.history        prior messages, internal block shape
 * @param {Array}  args.userContent    this turn's content blocks
 * @param {string} args.tier           model tier key from the UI selector
 */
async function runTurn({ res, ctx, conversationId, history, userContent, tier }) {
  const provider = getProvider();
  const model = config.modelFor(tier);
  const { LIMITS } = config;

  // ── The spend ceiling, checked BEFORE the first model call ────────────────
  // One charge per USER TURN, not per model call: a turn that runs three tools
  // is still one question, and per-call billing would make Faro cost most
  // exactly when it is being most useful. Image generation inside the turn is
  // billed separately at its own much higher weight, where the real money is.
  //
  // Checked here rather than in the handler because this is the last point
  // before anything is spent, and it fails OPEN on credit-infrastructure
  // problems (see _credits.js's header) — an Airtable hiccup must not silently
  // disable the assistant.
  try {
    const check = await credits.checkCredits(ctx.projectCode, credits.FEATURES.FARO_CHAT);
    if (!check.allowed) {
      stream.send(res, 'component', { component: schema.errorCard({
        message: check.message || 'Je AI-credits voor deze periode zijn op.',
        retryable: false,
        code: 'credit_limit_reached',
      }) });
      return stream.close(res, { usage: { in: 0, out: 0 } });
    }
  } catch (err) {
    console.error('[faro] credit check failed, continuing:', err.message);
  }

  // ── Het gesprek vastleggen ────────────────────────────────────────────────
  // Pas bij het EERSTE bericht, niet bij het openen van de werkruimte: anders
  // laat elk bezoek zonder vraag een lege regel achter in de zijbalk.
  //
  // Vóór de 'start'-frame, want daar reist de conversationId in mee en de
  // client gebruikt hem om vervolgvragen aan hetzelfde gesprek te hangen.
  //
  // Faalt dit, dan gaat de beurt gewoon door met conversationId = null: niets
  // bewaren is vervelend, maar geen antwoord kunnen geven omdat de opslag hapert
  // is erger.
  if (!conversationId) {
    try {
      const firstText = (userContent.find((b) => b.type === 'text') || {}).text || '';
      const created = await store.createConversation(ctx.projectCode, ctx.userId, {
        title: store.deriveTitle(firstText),
      });
      if (created && created.id) conversationId = created.id;
    } catch (err) {
      console.warn('[faro] gesprek aanmaken mislukt, beurt gaat door zonder opslag:', err && err.message);
    }
  }

  stream.send(res, 'start', {
    conversationId,
    model: config.publicModelLabel(tier), // Helvaro-branded — never the model id
  });

  // De vraag van de gebruiker meteen wegschrijven, niet pas aan het eind: valt
  // de stream halverwege weg, dan hoort de vraag er nog te staan als je
  // terugkomt. Fire-and-forget — de gebruiker wacht hier niet op.
  if (conversationId) {
    waitUntil(store.appendMessage(ctx.projectCode, conversationId, {
      role: 'user',
      content: userContent.map((b) => (b.type === 'image'
        // Geen base64 van een foto in de database: dat is megabytes per beurt en
        // de bytes zijn na de beurt niet meer nodig. Een merkteken volstaat om
        // te tonen dat er een foto bij zat.
        ? { type: 'text', text: '[afbeelding]' }
        : b)),
    }).catch(() => {}));
  }

  const system = await prompt.build(ctx);
  const messages = store.windowForModel(
    [...history, { role: 'user', content: userContent }],
    LIMITS.maxHistoryTurns,
  );

  const components = [];      // cards emitted this turn
  let assistantText = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  let iterations = 0;

  /* ── Een deadline voor de hele beurt ──────────────────────────────────────
     api/_ai/providers/index.js zet al een klok op elke modelaanroep, met deze
     reden erbij: "zonder dit kan een provider die blijft hangen een
     Vercel-functie tot zijn maxDuration bezet houden". Voor Faro stond die
     klok er niet. De provider ACCEPTEERT een signal (zie de handtekening van
     streamChat), er gaf alleen nooit iemand er een mee.

     Gevolg, terug te vinden in de Vercel-logs: "Task timed out after 60
     seconds" op /api/faro. Vercel kapt de functie dan af zonder dat er een
     foutframe uitgaat -- de gebruiker ziet zijn antwoord halverwege
     doodbloeden, en het afboeken van credits en het grootboek komen er niet
     meer aan toe (ook dat staat in de logs, als "aborted due to timeout").

     Dit maakt Faro niet sneller. Het verandert stil doodgaan in een nette
     foutkaart, en laat de beurt zijn eigen rommel nog opruimen. De grens ligt
     onder de 60s van vercel.json, met ruimte om dat frame te versturen. */
  const beurtKlok = new AbortController();
  const beurtMs = Math.max(5000, Number(process.env.FARO_TIMEOUT_MS || 45000));
  let deadlineVerstreken = false;
  const beurtTimer = setTimeout(() => { deadlineVerstreken = true; beurtKlok.abort(); }, beurtMs);

  try {
    // The tool loop. Each pass is one provider call; a pass that ends in
    // tool_use appends the results and goes round again.
    for (;;) {
      iterations += 1;
      const atCeiling = iterations >= LIMITS.maxToolIterations;

      const pendingCalls = [];
      let turnText = '';

      stream.send(res, 'thinking', { state: 'thinking' });

      for await (const ev of provider.streamChat({
        signal: beurtKlok.signal,
        system,
        messages,
        // Tools stay DECLARED even at the ceiling. Withholding them was wrong:
        // by then `messages` already carries tool_use/tool_result blocks from
        // earlier passes, and both providers reject a request containing those
        // with no tools declared — so the ceiling would have 400'd into a
        // generic error on precisely the expensive turn it exists to contain.
        // The `break` below is what actually stops the loop.
        tools: tools.definitions(),
        model,
      })) {
        switch (ev.type) {
          case 'text':
            turnText += ev.text;
            assistantText += ev.text;
            stream.send(res, 'text', { delta: ev.text });
            break;

          case 'tool_call':
            pendingCalls.push(ev);
            break;

          case 'usage':
            usage.inputTokens  += ev.inputTokens  || 0;
            usage.outputTokens += ev.outputTokens || 0;
            break;

          default:
            break;
        }
      }

      /* De provider behandelt een AbortError als "de gebruiker is weggeklikt" en
         stopt dan stilletjes -- terecht, want dat is het normale geval. Onze
         eigen deadline moet daar juist WEL uit te onderscheiden zijn, anders
         eindigt een vastgelopen beurt als een half antwoord zonder melding.
         Vandaar de vlag, en niet alleen het signal. */
      if (deadlineVerstreken) {
        throw new ProviderError(
          'Dit duurde te lang. Probeer het nog eens, of stel je vraag korter.',
          { code: 'timeout', retryable: true },
        );
      }

      if (!pendingCalls.length) break; // model answered in prose — turn is done

      // Record what the model asked for, so the follow-up call has the pairing
      // both providers require.
      messages.push({
        role: 'assistant',
        content: [
          ...(turnText ? [{ type: 'text', text: turnText }] : []),
          ...pendingCalls.map((c) => ({ type: 'tool_call', id: c.id, name: c.name, input: c.input })),
        ],
      });

      const results = [];
      let awaitingConfirmation = false;

      for (const call of pendingCalls) {
        const tool = tools.get(call.name);

        if (!tool) {
          results.push({ type: 'tool_result', toolCallId: call.id, isError: true, result: 'Onbekende tool.' });
          continue;
        }

        stream.send(res, 'tool', { name: call.name, state: 'running' });

        try {
          // Identity comes from the session, never from the model's arguments.
          const out = await tool.run(call.input || {}, ctx);

          for (const c of out.components || []) {
            // An act-tool's confirmation card is staged server-side; the client
            // receives only the id, and ./actions.js re-validates on confirm.
            if (c.type === 'confirmation') {
              c.actionId = actions.stage({
                projectCode: ctx.projectCode,
                userId: ctx.userId,
                action: c.action,
                payload: c.payload,
              });
              delete c.payload; // the browser does not need it, so it does not get it
              awaitingConfirmation = true;
            }
            components.push(c);
            stream.send(res, 'component', { component: c });
          }

          results.push({ type: 'tool_result', toolCallId: call.id, result: out.summary ?? out.data ?? '' });
          stream.send(res, 'tool', { name: call.name, state: 'done' });
        } catch (err) {
          results.push({ type: 'tool_result', toolCallId: call.id, isError: true, result: 'Tool mislukt.' });
          stream.send(res, 'tool', { name: call.name, state: 'failed' });
        }
      }

      messages.push({ role: 'user', content: results });

      // An act-tool proposed something. The turn ends here; the user's
      // confirmation click starts a fresh request.
      if (awaitingConfirmation) break;

      // Stop AT the ceiling rather than relying on the provider to notice we
      // stopped offering tools. A provider that kept emitting tool calls would
      // otherwise loop forever, executing tools and streaming, with no bound —
      // the exact runaway the ceiling exists to prevent.
      if (atCeiling) break;
    }

    // Charge once, after the turn actually produced something. Fire-and-forget
    // and fail-soft: a metering hiccup must never break a turn the user has
    // already received.
    //
    // This was previously only a comment. The credit CHECK above ran, but
    // nothing ever decremented the balance, so the check could never fire and
    // an enabled Faro had no spend ceiling on the model key at all. A check
    // without a corresponding charge is worse than no check, because it reads
    // like a ceiling in review.
    // Naar echt verbruik, niet naar een vast tarief. De tokens werden hier al
    // geteld en gingen alleen als metadata mee; een beurt met acht
    // gereedschapsrondes kostte evenveel als een vraag van één regel, en dat
    // werd duurder naarmate Faro nuttiger was. creditsForChatTurn() valt terug
    // op het vaste tarief zolang de prijs van dit model niet gezet is, en
    // waarschuwt dan luid in plaats van stil te weinig te rekenen.
    const charge = credits.creditsForChatTurn({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      model,
    });
    waitUntil(credits.recordUsage(ctx.projectCode, credits.FEATURES.FARO_CHAT, {
      credits: charge.credits,
      meta: {
        tier, iterations,
        tokensIn: usage.inputTokens, tokensOut: usage.outputTokens,
        costEur: charge.costEur, priced: charge.priced,
      },
    }).catch(() => {}));

    // Het antwoord bewaren. Ook fire-and-forget: de gebruiker heeft het al
    // gelezen tegen de tijd dat dit draait, en een trage schrijfactie hoort de
    // stream niet op te houden.
    if (conversationId) {
      waitUntil(store.appendMessage(ctx.projectCode, conversationId, {
        role: 'assistant',
        content: assistantText ? [{ type: 'text', text: assistantText }] : [],
        components,
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
      }).catch(() => {}));
    }

    stream.close(res, { usage: { in: usage.inputTokens, out: usage.outputTokens } });
  } catch (err) {
    const safe = err instanceof ProviderError
      ? { message: err.message, retryable: err.retryable, code: err.code }
      // Anything unexpected is reported generically: a raw error here could
      // carry the model name or echo request contents (see providers/index.js).
      : { message: 'Er ging iets mis. Probeer het opnieuw.', retryable: true, code: 'internal' };

    // ONE terminal error signal. This used to send both a component frame and
    // an error frame carrying the same payload, and the client renders a card
    // for each — so every failure produced two identical error cards with two
    // Retry buttons, and on a retryable error a user could double-spend by
    // clicking each. stream.fail is the terminal signal; the client already
    // renders it as a card.
    stream.fail(res, safe);
  } finally {
    /* Zonder dit blijft de timer 45 seconden staan na een beurt die in twee
       seconden klaar was. Op Vercel houdt een openstaande timer de functie
       wakker: je betaalt de looptijd en het antwoord kan blijven hangen. Een
       time-out inbouwen zonder hem op te ruimen maakt het middel erger dan de
       kwaal. */
    clearTimeout(beurtTimer);
  }
}

module.exports = { runTurn };
