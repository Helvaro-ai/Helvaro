'use strict';
/*
 * Faro — Claude (Anthropic) provider adapter.
 *
 * Implements the adapter contract documented in ./index.js.
 *
 * ── Why raw fetch and not the SDK ────────────────────────────────────────────
 * package.json ships no AI SDK, and this repo's existing model call (runAI in
 * api/whatsapp.js:1270) uses plain fetch against the same HTTP API with the
 * same headers. Matching that keeps the dependency surface and the cold-start
 * cost where they already are. Node 22 has global fetch, so there is nothing
 * to install.
 *
 * ── Message conversion ───────────────────────────────────────────────────────
 * Internal shape (see ./index.js) → Anthropic Messages API:
 *   text        → { type:'text', text }
 *   image       → { type:'image', source:{ type:'base64', media_type, data } }
 *   tool_call   → { type:'tool_use', id, name, input }
 *   tool_result → { type:'tool_result', tool_use_id, content, is_error }
 * The system prompt is a top-level field, not a message.
 *
 * ── The one genuinely fiddly part ────────────────────────────────────────────
 * A tool call's arguments do NOT arrive as an object. They arrive as a JSON
 * *string*, split across an arbitrary number of input_json_delta events, and
 * the split can land anywhere — mid-key, mid-escape, mid-multibyte-character.
 * So the fragments are buffered untouched and parsed exactly once, at
 * content_block_stop. Parsing incrementally, or on each delta, produces
 * intermittent failures that look like the model "sometimes" ignoring a tool.
 *
 * The same applies one level up: an SSE frame can be split across TCP chunks,
 * so the decoder is streaming (`{ stream: true }`, which holds partial UTF-8
 * sequences) and the buffer is only consumed up to the last complete frame.
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
 * Pure and side-effect free, so it is unit-testable without a network call.
 */
function toAnthropicMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: (m.content || []).map((b) => {
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

/** Tool registry entries → Anthropic tool definitions. A rename, not a rewrite. */
function toAnthropicTools(tools) {
  return (tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Map a non-2xx response onto a ProviderError.
 * Deliberately generic user-facing text: the upstream body names the model and
 * can echo request content, and requirement 13 says neither reaches the user.
 * The status is what decides whether the UI offers Retry.
 */
async function httpError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = (body && body.error && body.error.type) || '';
  } catch (_) { /* body may be empty or not JSON */ }

  if (res.status === 401 || res.status === 403) {
    console.error('[faro/claude] auth rejected:', res.status, detail);
    return new ProviderError('Faro is niet beschikbaar.', { code: 'provider_unconfigured' });
  }
  if (res.status === 429) {
    return new ProviderError('Faro is even overbelast. Probeer het zo opnieuw.', { code: 'rate_limited', retryable: true });
  }
  if (res.status === 529 || res.status >= 500) {
    return new ProviderError('Faro is tijdelijk niet bereikbaar. Probeer het opnieuw.', { code: 'upstream', retryable: true });
  }
  // 400s that are our fault (a malformed tool schema, an oversized image) must
  // be loud in the logs even though the user gets a generic line.
  console.error('[faro/claude] request rejected:', res.status, detail);
  return new ProviderError('Er ging iets mis. Probeer het opnieuw.', { code: 'bad_request', retryable: true });
}

/**
 * Parse one SSE `data:` payload into zero or more normalised events.
 * Split out from the transport so the whole event machine can be tested
 * against synthetic streams — see scripts/faro-check.js.
 *
 * `state` carries the in-progress tool block between calls.
 */
function handleEvent(evt, state) {
  const out = [];
  if (!evt || !evt.type) return out;

  switch (evt.type) {
    case 'message_start':
      if (evt.message && evt.message.usage) {
        out.push({ type: 'usage', inputTokens: evt.message.usage.input_tokens || 0, outputTokens: 0 });
      }
      break;

    case 'content_block_start':
      if (evt.content_block && evt.content_block.type === 'tool_use') {
        // Begin buffering. Nothing is emitted until content_block_stop.
        state.tool = { id: evt.content_block.id, name: evt.content_block.name, json: '' };
      }
      break;

    case 'content_block_delta': {
      const d = evt.delta || {};
      if (d.type === 'text_delta' && d.text) {
        out.push({ type: 'text', text: d.text });
      } else if (d.type === 'input_json_delta' && state.tool) {
        // Append untouched. See this file's header for why this is not parsed
        // until the block closes.
        state.tool.json += d.partial_json || '';
      }
      break;
    }

    case 'content_block_stop':
      if (state.tool) {
        const { id, name, json } = state.tool;
        state.tool = null;
        let input = {};
        if (json.trim()) {
          try {
            input = JSON.parse(json);
          } catch (err) {
            // A tool call we cannot parse is dropped rather than sent with
            // garbage arguments — the orchestrator would otherwise run a tool
            // against {} and present the result as if it answered the question.
            console.error('[faro/claude] unparseable tool input for', name, '—', err.message);
            break;
          }
        }
        out.push({ type: 'tool_call', id, name, input });
      }
      break;

    case 'message_delta':
      if (evt.usage) out.push({ type: 'usage', inputTokens: 0, outputTokens: evt.usage.output_tokens || 0 });
      if (evt.delta && evt.delta.stop_reason) state.stopReason = evt.delta.stop_reason;
      break;

    case 'message_stop':
      out.push({ type: 'done', stopReason: state.stopReason || 'end_turn' });
      break;

    case 'error':
      // An error mid-stream: the HTTP status was already 200, so this is the
      // only signal that the turn failed.
      console.error('[faro/claude] stream error:', (evt.error && evt.error.type) || 'unknown');
      throw new ProviderError('Faro werd onderbroken. Probeer het opnieuw.', { code: 'stream_error', retryable: true });

    default:
      break; // ping, and anything added upstream later
  }
  return out;
}

/**
 * Split an incoming text buffer into complete SSE frames.
 * Returns { events, rest } — `rest` is the trailing partial frame, carried to
 * the next chunk.
 */
function parseFrames(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop();
  for (const frame of parts) {
    for (const line of frame.split('\n')) {
      if (line.indexOf('data:') !== 0) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try { events.push(JSON.parse(raw)); } catch (_) { /* keep-alive noise */ }
    }
  }
  return { events, rest };
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
async function* streamChat({ system, messages, tools, model, signal }) {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: toAnthropicMessages(messages),
    stream: true,
  };
  const defs = toAnthropicTools(tools);
  if (defs.length) body.tools = defs;

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey(),
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return;      // the user navigated away
    if (err instanceof ProviderError) throw err;        // missing key
    console.error('[faro/claude] network error:', err.message);
    throw new ProviderError('Faro is tijdelijk niet bereikbaar. Probeer het opnieuw.', { code: 'network', retryable: true });
  }

  if (!res.ok) throw await httpError(res);
  if (!res.body) throw new ProviderError('Er ging iets mis. Probeer het opnieuw.', { code: 'no_body', retryable: true });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state = { tool: null, stopReason: null };
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream:true keeps partial multibyte sequences intact across chunks.
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseFrames(buffer);
      buffer = rest;
      for (const evt of events) {
        for (const normalised of handleEvent(evt, state)) yield normalised;
      }
    }
  } finally {
    // Releasing matters on the abort path: without it the socket stays held
    // until GC, and a serverless instance can accumulate them across turns.
    try { reader.cancel(); } catch (_) { /* already closed */ }
  }
}

module.exports = { streamChat, toAnthropicMessages, toAnthropicTools, handleEvent, parseFrames };
