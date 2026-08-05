// ── Shared rate limiting ─────────────────────────────────────────────────────
// The login and admin-key limiters used to be plain in-memory Maps. On a
// serverless platform that is close to no limit at all: every warm instance
// keeps its own counter, Vercel runs many of them in parallel, and each one
// resets to zero on cold start. "40 attempts per 15 minutes" was really
// "40 per instance, until it goes to sleep" — an attacker spreading requests
// over time or across regions barely notices it.
//
// This gives one counter shared by every instance, backed by Upstash Redis
// over its REST API (no TCP, no connection pooling — the only shape that
// actually suits serverless).
//
// It degrades safely. With no Upstash credentials configured it falls back to
// the previous in-memory behaviour rather than failing open completely or
// blocking logins: weaker, but never worse than what was there before, and it
// says so in the logs once. So this can ship before the account exists.
//
// Set in Vercel:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const _memory = new Map();
let _warned = false;

function configured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function memoryHit(key, limit, windowMs) {
  const now  = Date.now();
  const hits = (_memory.get(key) || []).filter(t => now - t < windowMs);
  hits.push(now);
  _memory.set(key, hits);
  // Opportunistic cleanup so this can't grow without bound.
  if (_memory.size > 5000) {
    for (const [k, v] of _memory) if (!v.some(t => now - t < windowMs)) _memory.delete(k);
  }
  return { limited: hits.length > limit, count: hits.length, shared: false };
}

// INCR + EXPIRE in one pipelined round trip. INCR returns the new count; we
// only set the TTL on the first hit so the window is fixed from the first
// attempt rather than sliding forward with every request (which would let a
// steady drip of attempts keep the key alive forever).
async function redisHit(key, limit, windowMs) {
  const base  = String(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ttl   = Math.ceil(windowMs / 1000);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);   // never hold up a login
  try {
    const r = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['TTL', key]]),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('upstash ' + r.status);
    const out   = await r.json();
    const count = Number(out?.[0]?.result);
    const ttlNow = Number(out?.[1]?.result);
    if (!Number.isFinite(count)) throw new Error('bad upstash reply');
    // TTL of -1 means the key exists with no expiry set yet (first hit).
    if (ttlNow === -1) {
      await fetch(`${base}/expire/${encodeURIComponent(key)}/${ttl}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    return { limited: count > limit, count, shared: true };
  } finally {
    clearTimeout(t);
  }
}

// Returns { limited, count, shared }. Never throws: a rate limiter that can
// take the login endpoint down with it is worse than the problem it solves.
async function hit(bucket, id, limit, windowMs) {
  const key = `hv:rl:${bucket}:${id}`;
  if (!configured()) {
    if (!_warned) {
      _warned = true;
      console.warn('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN niet gezet — terugval op in-memory tellers (per instance, reset bij cold start)');
    }
    return memoryHit(key, limit, windowMs);
  }
  try {
    return await redisHit(key, limit, windowMs);
  } catch (e) {
    console.warn('[ratelimit] Upstash onbereikbaar, terugval op in-memory:', e && e.message);
    return memoryHit(key, limit, windowMs);
  }
}

// Clears a counter — used by the admin "reset-rate-limit" support action so a
// locked-out admin can free themselves. Must clear the SHARED key too, not
// just this instance's memory, or the lockout survives the reset.
async function reset(bucket, id) {
  const key = `hv:rl:${bucket}:${id}`;
  _memory.delete(key);
  if (!configured()) return;
  const base  = String(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    await fetch(`${base}/del/${encodeURIComponent(key)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.warn('[ratelimit] reset kon de gedeelde teller niet wissen:', e && e.message);
  }
}

module.exports = { hit, reset, configured };
