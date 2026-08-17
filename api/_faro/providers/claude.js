'use strict';
/*
 * Faro — Claude (Anthropic) provider adapter.
 *
 * SCAFFOLD: the request/response mapping is laid out and documented, but the
 * network call is NOT wired. streamChat() throws NOT_WIRED until the
 * implementation phase. Nothing here runs in production yet.
 *
 * Implements the adapter contract documented in ./index.js.
 *
 * ── Why raw fetch and not the SDK ────────────────────────────────────────────
 * package.json currently ships no AI SDK, and this repo's existing model call
 * (runAI in api/whatsapp.js) uses plain fetch against the provider's HTTP API.
 * Matching that keeps the dependency surface and the cold-start cost where
 * they already are. Revisit only if streaming tool-use parsing gets unwieldy.
 *
 * ── Message conversion ───────────────────────────────────────────────────────
 * Internal shape (see ./index.js) → Anthropic Messages API:
 *   text        → { type:'text', text }
 *   image       → { type:'image', source:{ type:'base64', media_type, data } }
 *   tool_call   → { type:'tool_use', id, name, input }
 *   tool_result → { type:'tool_result', tool_use_id, content, is_error }
 * System prompt goes in the top-level `system` field, not as a message.
 *
 * ── Streaming ────────────────────────────────────────────────────────────────
 * SSE. The events that matter, mapped to our normalised events:
 *   content_block_delta / text_delta        → { type:'text' }
 *   content_block_start  (type tool_use)    → begin buffering a tool call
 *   content_block_delta / input_json_delta  → accumulate the tool input JSON
 *   content_block_stop                      → { type:'tool_call' } once parsed
 *   message_delta  (usage, stop_reason)     → { type:'usage' } / { type:'done' }
 * Tool input arrives as a JSON *string* across many deltas — it must be
 * buffered whole and parsed at content_block_stop, never parsed incrementally.
 */

const { ProviderError } = require('./index');

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

function apiKey() {
  const k = process.env.ANTHROPIC_API_KEY || '';
  if (!k) throw new ProviderError('Faro is niet beschikbaar.', { code: 'provider_unconfigured' });
  return k;
}

/**
 * Internal message blocks → Anthropic content blocks.
 * Pure and side-effect free so it can be unit-tested without a network call.
 */
function toAnthropicMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b) => {
      switch (b.type) {
        case 'text':
          return { type: 'text', text: b.text };
        case 'image':
          return { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.dataBase64 } };
        case 'tool_call':
          return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: b.toolCallId,
            content: typeof b.result === 'string' ? b.result : JSON.stringify(b.result),
            is_error: Boolean(b.isError),
          };
        default:
          return { type: 'text', text: '' };
      }
    }),
  }));
}

/**
 * Tool registry entries → Anthropic tool definitions.
 * Our registry already stores JSON Schema, so this is a rename, not a rewrite.
 */
function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * @param {object} args
 * @param {string} args.system
 * @param {Array}  args.messages
 * @param {Array}  args.tools
 * @param {string} args.model
 * @param {AbortSignal} [args.signal]
 * @returns {AsyncGenerator} normalised provider events — see ./index.js
 */
// eslint-disable-next-line require-yield
async function* streamChat({ system, messages, tools, model, signal }) {
  void apiKey; void toAnthropicMessages; void toAnthropicTools;
  void API_URL; void API_VERSION; void MAX_TOKENS;
  void system; void messages; void tools; void model; void signal;

  // NOT WIRED — implementation phase. Shape of the real body:
  //   { model, max_tokens: MAX_TOKENS, system, messages, tools, stream: true }
  // Headers: x-api-key, anthropic-version, content-type, accept: text/event-stream
  throw new ProviderError('Faro is nog niet geactiveerd.', {
    code: 'not_wired',
    retryable: false,
  });
}

module.exports = { streamChat, toAnthropicMessages, toAnthropicTools };
