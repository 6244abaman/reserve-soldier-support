// Size limits and a simple rate limit per internet address, so one person (or a script)
// cannot run up the Claude bill or overload the proxy.
const LIMITS = {
  maxBodyBytes: 200 * 1024,       // the whole request, including the profile
  maxMessages: 40,                // conversation turns sent per request
  maxMessageChars: 4000,          // one message from the soldier
  requestsPerWindow: Number(process.env.RATE_LIMIT_REQUESTS || 30),
  windowMs: 10 * 60 * 1000        // 10 minutes
};

// Counts requests per key (the caller's address) in a sliding 10-minute window.
function createRateLimiter(options) {
  const opts = Object.assign({ limit: LIMITS.requestsPerWindow, windowMs: LIMITS.windowMs, now: Date.now }, options);
  const hits = new Map();

  return function allow(key) {
    const now = opts.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.ceil((opts.windowMs - (now - recent[0])) / 1000) };
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) hits.clear(); // keep memory bounded
    return { ok: true };
  };
}

module.exports = { LIMITS, createRateLimiter };
