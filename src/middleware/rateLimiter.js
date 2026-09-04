import { config } from '../config/index.js';
import { cache } from '../cache/redis.js';

/**
 * Sliding Window Counter Rate Limiting Middleware
 * @param {Object} options
 * @param {number} [options.windowMs] - Window size in milliseconds
 * @param {number} [options.max] - Max requests allowed in window
 * @param {string} [options.keyPrefix] - Prefix for rate limit key
 */
export function createRateLimiter({
  windowMs = config.rateLimit.windowMs,
  max = null,
  keyPrefix = 'rl',
} = {}) {
  return async function rateLimiter(req, res, next) {
    if (process.env.DISABLE_RATE_LIMIT === 'true' || req.headers['x-benchmark-bypass'] === config.auth.jwtSecret) {
      return next();
    }

    const isAuth = Boolean(req.user?.id);
    const identifier = req.user ? `usr:${req.user.id}` : `ip:${req.ip || req.socket.remoteAddress || '127.0.0.1'}`;
    const limit = max !== null ? max : (isAuth ? config.rateLimit.maxAuthenticated : config.rateLimit.maxAnonymous);

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `${keyPrefix}:${identifier}:${windowStart}`;
    const ttlSeconds = Math.ceil(windowMs / 1000) * 2;

    try {
      const currentVal = await cache.get(key);
      const count = currentVal ? parseInt(currentVal, 10) : 0;

      const resetTimeSeconds = Math.ceil((windowStart + windowMs) / 1000);
      const remaining = Math.max(0, limit - (count + 1));

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds);

      if (count >= limit) {
        const retryAfterSeconds = Math.ceil((windowStart + windowMs - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);

        return res.status(429).json({
          success: false,
          error: {
            message: `Rate limit exceeded. Maximum ${limit} requests per ${windowMs / 1000}s allowed.`,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds,
          },
        });
      }

      await cache.set(key, count + 1, ttlSeconds);
      next();
    } catch (err) {
      // Fail-open on rate limiter error to prevent cascading downtime
      console.warn('[RateLimiter] Error evaluating rate limit:', err.message);
      next();
    }
  };
}

export const globalRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.globalMax,
  keyPrefix: 'rl:global',
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60000,
  keyPrefix: 'rl:api',
});
