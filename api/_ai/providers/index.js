'use strict';
/*
 * Helvaro AI — provider factory.
 *
 * SCAFFOLD: structure only. Adapters are stubs; nothing calls a model yet.
 *
 * ── The contract every adapter implements ────────────────────────────────────
 * This is the replaceability seam from requirement 13. An adapter is a plain
 * object with ONE method:
 *
 *   async *streamChat({ system, messages, tools, model, signal })
 *
 * It is an async GENERATOR yielding normalised events. The orchestrator knows
 * only these event shapes — never a vendor SDK's shape:
 *
 *   { type: 'text',       text }                 incremental assistant prose
 *   { type: 'tool_call',  id, name, input }      the model wants a tool run
 *   { type: 'usage',      inputTokens, outputTokens }
 *   { type: 'done',       stopReason }           'end_turn' | 'tool_use' | 'max_tokens'
 *
 * Errors are thrown as ProviderError (below), never as a raw vendor error —
 * vendor errors carry model names and sometimes echo request contents, and
 * requirement 13 says neither reaches the user.
 *
 * `messages` uses one internal shape, converted by each adapter:
 *   { role: 'user' | 'assistant', content: [ ...blocks ] }
 *   blocks: { type:'text', text }
 *         | { type:'image', mediaType, dataBase64 }
 *         | { type:'tool_call', id, name, input }
 *         | { type:'tool_result', toolCallId, result, isError }
 *
 * Adding a third provider = adding one file here and one entry in the switch.
 * No orchestrator, route, or UI change.
 */

const config = require('../config');

class ProviderError extends Error {
  /**
   * @param {string} message  Safe, Helvaro-branded text. Never a vendor string.
   * @param {object} [opts]
   * @param {boolean} [opts.retryable]  Whether the UI should offer Retry.
   * @param {string}  [opts.code]       Stable code for client-side branching.
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = Boolean(opts.retryable);
    this.code = opts.code || 'provider_error';
  }
}

/**
 * Returns the adapter for the configured provider.
 * Callers never name a provider themselves — that is config's job alone.
 */
function getProvider() {
  const name = config.providerName();
  switch (name) {
    case 'claude': return require('./claude');
    case 'openai': return require('./openai');
    default:
      // Deliberately generic: a misconfigured AI_PROVIDER is an operator
      // problem, and the user-facing string still must not name vendors.
      throw new ProviderError('Helvaro AI is niet beschikbaar.', { code: 'provider_unconfigured' });
  }
}

module.exports = { getProvider, ProviderError };
