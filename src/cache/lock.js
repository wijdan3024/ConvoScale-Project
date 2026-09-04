import { cache } from './redis.js';

const activeLocalLocks = new Set();

/**
 * Acquire a non-blocking lock with a TTL
 * @param {string} lockKey - Identifier for the resource
 * @param {number} ttlSeconds - Expiration time in seconds
 * @returns {Promise<boolean>} True if lock acquired, false otherwise
 */
export async function acquireLock(lockKey, ttlSeconds = 10) {
  const fullKey = `lock:${lockKey}`;
  const existing = await cache.get(fullKey);
  if (existing) {
    return false;
  }
  await cache.set(fullKey, 'LOCKED', ttlSeconds);
  activeLocalLocks.add(fullKey);
  return true;
}

/**
 * Release a previously acquired lock
 * @param {string} lockKey
 */
export async function releaseLock(lockKey) {
  const fullKey = `lock:${lockKey}`;
  activeLocalLocks.delete(fullKey);
  await cache.del(fullKey);
}

/**
 * Execute an operation guarded by a distributed lock
 * @param {string} lockKey
 * @param {number} ttlSeconds
 * @param {Function} callback
 */
export async function withLock(lockKey, ttlSeconds, callback) {
  const acquired = await acquireLock(lockKey, ttlSeconds);
  if (!acquired) {
    const error = new Error(`Resource is currently locked by another concurrent request [Key: ${lockKey}]`);
    error.statusCode = 409;
    throw error;
  }

  try {
    return await callback();
  } finally {
    await releaseLock(lockKey);
  }
}
