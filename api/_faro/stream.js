'use strict';
/*
 * Faro — SSE streaming helpers.
 *
 * SCAFFOLD: complete and usable. Pure transport, no model involvement, so
 * this file is finished rather than stubbed.
 *
 * ── Why Server-Sent Events and not WebSockets or JSON polling ────────────────
 * The dashboard is a framework-free inline script (api/dashboard.js) served by
 * a Vercel function. WebSockets need a persistent connection Vercel functions
 * do not hold. Polling makes streaming text look like stuttering. SSE over a
 * chunked HTTP response is what the platform actually supports, and the client
 * side is a fetch() + ReadableStream reader — about forty lines, no dependency.
 *
 * ── Event names the client listens for ───────────────────────────────────────
 *   start      { conversationId, messageId, model }   model = Helvaro-branded label
 *   text       { delta }                              append to the bubble
 *   thinking   { state }                              drives the mascot state
 *   component  { component }                          a card (see ./schema.js)
 *   tool       { name, state }                        'running' | 'done' — status line
 *   error      { message, retryable, code }
 *   done       { messageId, usage }
 *
 * Every frame is one JSON object on one line. Newlines inside content are
 * escaped by JSON.stringify, which is what keeps a multi-line model answer
 * from being read as multiple SSE frames.
 */

/**
 * Prepare the response for streaming.
 * `X-Accel-Buffering: no` matters: without it an upstream proxy may buffer the
 * whole response and deliver it at once, which looks exactly like a hang.
 */
function open(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Initial padding flushes headers through intermediaries immediately.
  res.write(': helvaro-ai\n\n');
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Terminal frame. Always send one — the client's reader waits for it. */
function close(res, data = {}) {
  send(res, 'done', data);
  res.end();
}

/**
 * Terminal error frame.
 * Takes an already-sanitised message: raw provider errors must be converted to
 * ProviderError upstream, since vendor error text can name the model and
 * sometimes echoes request content (see api/_faro/providers/index.js).
 */
function fail(res, { message, retryable = true, code = 'error' }) {
  send(res, 'error', { message, retryable, code });
  res.end();
}

/**
 * Keep-alive comment frame. Long tool chains can exceed a proxy's idle
 * timeout while the model is still working; a periodic ping keeps the
 * connection from being closed under us mid-turn.
 */
function ping(res) {
  res.write(': ping\n\n');
}

module.exports = { open, send, close, fail, ping };
