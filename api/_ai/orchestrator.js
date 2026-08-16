'use strict';
/*
 * Helvaro AI — the orchestrator.
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

  stream.send(res, 'start', {
    conversationId,
    model: config.publicModelLabel(tier), // Helvaro-branded — never the model id
  });

  const system = await prompt.build(ctx);
  const messages = store.windowForModel(
    [...history, { role: 'user', content: userContent }],
    LIMITS.maxHistoryTurns,
  );

  const components = [];      // cards emitted this turn
  let assistantText = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  let iterations = 0;

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
        system,
        messages,
        // At the ceiling we withhold the tools entirely, which forces a prose
        // answer rather than another tool request we would have to refuse.
        tools: atCeiling ? [] : tools.definitions(),
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
    }

    // WIRE: persist the assistant message and meter credits before closing.
    // Metering goes through api/_credits.js — the AI workspace must share the
    // existing meter, not run a parallel one.
    //   await store.appendMessage(ctx.projectCode, conversationId, {...});
    //   await credits.consume(ctx.projectCode, 'ai_chat', usage);

    stream.close(res, { usage: { in: usage.inputTokens, out: usage.outputTokens } });
  } catch (err) {
    const safe = err instanceof ProviderError
      ? { message: err.message, retryable: err.retryable, code: err.code }
      // Anything unexpected is reported generically: a raw error here could
      // carry the model name or echo request contents (see providers/index.js).
      : { message: 'Er ging iets mis. Probeer het opnieuw.', retryable: true, code: 'internal' };

    stream.send(res, 'component', { component: schema.errorCard(safe) });
    stream.fail(res, safe);
  }
}

module.exports = { runTurn };
