'use strict';
/*
 * Faro — OpenAI provider adapter.
 *
 * SCAFFOLD: not wired. Exists now, rather than "later", for one reason: an
 * abstraction with a single implementation is an unproven abstraction. Writing
 * the second adapter's mapping alongside the first is what keeps the contract
 * in ./index.js honest — if the two providers can't both express it, the
 * contract is wrong and we find out at design time instead of at swap time.
 *
 * Implements the adapter contract documented in ./index.js.
 *
 * ── Where OpenAI differs from Claude, and what the contract must absorb ──────
 * 1. System prompt is a MESSAGE (role:'system'), not a top-level field.
 * 2. Tool calls come back as `tool_calls` with a nested function{name,arguments}
 *    where arguments is a JSON string — same buffer-then-parse discipline as
 *    Claude's input_json_delta, different event names.
 * 3. Tool results are their own message (role:'tool', tool_call_id), not a
 *    content block inside a user message.
 * 4. Images are { type:'image_url', image_url:{ url:'data:<mime>;base64,...' } }.
 * These four differences are exactly why the orchestrator must never see a
 * vendor shape.
 */

const { ProviderError } = require('./index');

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOKENS = 4096;

function apiKey() {
  const k = process.env.OPENAI_API_KEY || '';
  if (!k) throw new ProviderError('Faro is niet beschikbaar.', { code: 'provider_unconfigured' });
  return k;
}

/**
 * Internal messages → OpenAI chat messages.
 * Note the flattening: one internal message carrying tool_result blocks
 * becomes N separate role:'tool' messages.
 */
function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }];

  for (const m of messages) {
    const toolResults = m.content.filter((b) => b.type === 'tool_result');
    const toolCalls   = m.content.filter((b) => b.type === 'tool_call');
    const plain       = m.content.filter((b) => b.type === 'text' || b.type === 'image');

    // Tool results are standalone messages in this dialect.
    for (const r of toolResults) {
      out.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
      });
    }

    if (plain.length || toolCalls.length) {
      const msg = { role: m.role };
      if (plain.length) {
        msg.content = plain.map((b) => (b.type === 'text'
          ? { type: 'text', text: b.text }
          : { type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.dataBase64}` } }));
      }
      if (toolCalls.length) {
        msg.tool_calls = toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        }));
      }
      out.push(msg);
    }
  }
  return out;
}

function toOpenAITools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// eslint-disable-next-line require-yield
async function* streamChat({ system, messages, tools, model, signal }) {
  void apiKey; void toOpenAIMessages; void toOpenAITools;
  void API_URL; void MAX_TOKENS;
  void system; void messages; void tools; void model; void signal;

  throw new ProviderError('Faro is nog niet geactiveerd.', {
    code: 'not_wired',
    retryable: false,
  });
}

module.exports = { streamChat, toOpenAIMessages, toOpenAITools };
