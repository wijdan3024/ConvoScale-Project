import Redis from 'ioredis';
import { config } from '../config/index.js';

let redisClient = null;
const isRedisConfigured = Boolean(config.redis.url);

// High-speed In-Memory Cache Store (Fallback & Local Execution)
class MemoryCacheStore {
  constructor() {
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      keysCount: 0,
      mode: 'In-Memory High-Speed Cache (LRU/TTL)',
    };
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.keysCount = this.store.size;
      return null;
    }
    this.stats.hits++;
    return item.value;
  }

  async set(key, value, ttlSeconds = config.redis.ttlSeconds) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    this.stats.keysCount = this.store.size;
    return 'OK';
  }

  async del(key) {
    const deleted = this.store.delete(key);
    this.stats.keysCount = this.store.size;
    return deleted ? 1 : 0;
  }

  async delPattern(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.keysCount = this.store.size;
    return count;
  }

  async flushAll() {
    this.store.clear();
    this.stats.keysCount = 0;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0.00%';
    return {
      mode: this.stats.mode,
      keysCount: this.store.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
    };
  }
}

const memoryCache = new MemoryCacheStore();

/**
 * Initialize Redis connection if configured, else use memory store
 */
export async function initCache() {
  if (isRedisConfigured) {
    try {
      redisClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 3000,
      });

      redisClient.on('error', (err) => {
        console.warn(`[Redis] Connection warning: ${err.message}. Relying on fallback cache.`);
      });

      await redisClient.ping();
      console.log(`[Cache] Connected to Redis cluster at ${config.redis.url}`);
      return;
    } catch (err) {
      console.warn(`[Cache] Redis initialization failed (${err.message}). Using In-Memory Cache.`);
      redisClient = null;
    }
  } else {
    console.log('[Cache] Using High-Performance In-Memory Cache Store (Zero-Latency Mode)');
  }
}

/**
 * Cache Interface Wrapper
 */
export const cache = {
  async get(key) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const val = await redisClient.get(key);
        if (val !== null) {
          memoryCache.stats.hits++;
          return val;
        }
        memoryCache.stats.misses++;
        return null;
      } catch (err) {
        return await memoryCache.get(key);
      }
    }
    return await memoryCache.get(key);
  },

  async getJSON(key) {
    const data = await this.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async set(key, value, ttlSeconds = config.redis.ttlSeconds) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (redisClient && redisClient.status === 'ready') {
      try {
        if (ttlSeconds) {
          await redisClient.setex(key, ttlSeconds, stringValue);
        } else {
          await redisClient.set(key, stringValue);
        }
      } catch (err) {
        // fallback to memory
      }
    }
    return await memoryCache.set(key, stringValue, ttlSeconds);
  },

  async del(key) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.del(key);
      } catch (err) {}
    }
    return await memoryCache.del(key);
  },

  async delPattern(prefix) {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const keys = await redisClient.keys(`${prefix}*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (err) {}
    }
    return await memoryCache.delPattern(prefix);
  },

  getStats() {
    const stats = memoryCache.getStats();
    if (redisClient && redisClient.status === 'ready') {
      stats.mode = 'Redis Server (Distributed)';
    }
    return stats;
  },
};
