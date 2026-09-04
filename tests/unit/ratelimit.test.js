import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createRateLimiter } from '../../src/middleware/rateLimiter.js';

describe('Sliding Window Rate Limiter Unit Tests', () => {
  test('should allow requests within limit and increment counter', async () => {
    const limiter = createRateLimiter({ windowMs: 5000, max: 3, keyPrefix: 'rl:test:unit' });

    let headersSet = {};
    const mockRes = {
      setHeader(k, v) {
        headersSet[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    const mockReq = { ip: '10.0.0.1', headers: {} };

    let nextCalled = 0;
    const next = () => { nextCalled++; };

    // Request 1
    await limiter(mockReq, mockRes, next);
    assert.strictEqual(nextCalled, 1);
    assert.strictEqual(headersSet['X-RateLimit-Limit'], 3);
    assert.strictEqual(headersSet['X-RateLimit-Remaining'], 2);

    // Request 2
    await limiter(mockReq, mockRes, next);
    assert.strictEqual(nextCalled, 2);
    assert.strictEqual(headersSet['X-RateLimit-Remaining'], 1);

    // Request 3
    await limiter(mockReq, mockRes, next);
    assert.strictEqual(nextCalled, 3);
    assert.strictEqual(headersSet['X-RateLimit-Remaining'], 0);

    // Request 4 (Should be rate limited)
    await limiter(mockReq, mockRes, next);
    assert.strictEqual(nextCalled, 3); // next not called
    assert.strictEqual(mockRes.statusCode, 429);
    assert.strictEqual(mockRes.body.error.code, 'RATE_LIMIT_EXCEEDED');
  });
});
