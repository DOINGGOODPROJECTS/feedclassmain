function createRateLimiter({ windowMs, maxAttempts }) {
  const buckets = new Map();

  return {
    check(key) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        buckets.set(key, fresh);
        return { allowed: true, remaining: maxAttempts - 1, resetAt: fresh.resetAt };
      }

      existing.count += 1;
      if (existing.count > maxAttempts) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
      }

      return { allowed: true, remaining: maxAttempts - existing.count, resetAt: existing.resetAt };
    },
  };
}

module.exports = { createRateLimiter };
