import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

const { Pool } = pg;

let pool = null;
let pgliteInstance = null;
let isEmbedded = false;

// Pool metrics tracker
const poolStats = {
  totalQueries: 0,
  activeQueries: 0,
  errors: 0,
  peakActiveQueries: 0,
  mode: 'unknown',
};

/**
 * Initialize database connection (PG Pool or embedded PGlite WASM engine)
 */
export async function initDatabase() {
  if (config.db.url) {
    try {
      pool = new Pool({
        connectionString: config.db.url,
        max: config.db.maxConnections,
        idleTimeoutMillis: config.db.idleTimeoutMs,
        connectionTimeoutMillis: config.db.connectionTimeoutMs,
      });

      // Test connection
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      isEmbedded = false;
      poolStats.mode = 'PostgreSQL Pool (Native)';
      console.log(`[Database] Connected to external PostgreSQL via connection pool (Max: ${config.db.maxConnections})`);
      return;
    } catch (err) {
      console.warn(`[Database] External PostgreSQL connection failed: ${err.message}. Falling back to embedded PostgreSQL engine.`);
    }
  }

  // Embedded PostgreSQL (PGlite) fallback
  const dataDir = path.resolve(config.db.dataDir);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  pgliteInstance = new PGlite(dataDir);
  await pgliteInstance.waitReady;
  isEmbedded = true;
  poolStats.mode = 'Embedded PostgreSQL (PGlite WASM)';
  console.log(`[Database] Initialized Embedded PostgreSQL engine (Data Directory: ${dataDir})`);
}

/**
 * Execute a query with parameterized values
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {Array} params - Parameter array
 */
export async function query(text, params = []) {
  poolStats.totalQueries++;
  poolStats.activeQueries++;
  if (poolStats.activeQueries > poolStats.peakActiveQueries) {
    poolStats.peakActiveQueries = poolStats.activeQueries;
  }

  const start = Date.now();
  try {
    if (!isEmbedded && pool) {
      const res = await pool.query(text, params);
      return { rows: res.rows || [], rowCount: res.rowCount || 0, duration: Date.now() - start };
    } else if (pgliteInstance) {
      if (params.length === 0 && text.includes(';')) {
        // Multi-statement DDL / SQL script
        const res = await pgliteInstance.exec(text);
        return { rows: [], rowCount: 0, duration: Date.now() - start };
      } else {
        const res = await pgliteInstance.query(text, params);
        return { rows: res.rows || [], rowCount: res.affectedRows || res.rows?.length || 0, duration: Date.now() - start };
      }
    } else {
      throw new Error('Database is not initialized');
    }
  } catch (error) {
    poolStats.errors++;
    throw error;
  } finally {
    poolStats.activeQueries--;
  }
}

/**
 * Get a dedicated client connection for manual transactions
 */
export async function getClient() {
  if (!isEmbedded && pool) {
    const client = await pool.connect();
    return {
      query: async (text, params = []) => {
        poolStats.totalQueries++;
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount };
      },
      release: () => client.release(),
    };
  } else if (pgliteInstance) {
    // PGlite supports manual SQL BEGIN, COMMIT, ROLLBACK directly
    return {
      query: async (text, params = []) => {
        poolStats.totalQueries++;
        const res = await pgliteInstance.query(text, params);
        return { rows: res.rows || [], rowCount: res.affectedRows || res.rows?.length || 0 };
      },
      release: () => {},
    };
  } else {
    throw new Error('Database is not initialized');
  }
}

/**
 * Execute an ACID transaction with automatic COMMIT and ROLLBACK
 * @param {Function} callback - Async function receiving (client)
 */
export async function withTransaction(callback) {
  if (!isEmbedded && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: (t, p) => client.query(t, p),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('[Database] Rollback error:', rbErr.message);
      }
      throw error;
    } finally {
      client.release();
    }
  } else if (pgliteInstance) {
    // PGlite transaction wrapper
    return await pgliteInstance.transaction(async (tx) => {
      return await callback({
        query: async (t, p) => {
          const res = await tx.query(t, p);
          return { rows: res.rows || [], rowCount: res.affectedRows || res.rows?.length || 0 };
        },
      });
    });
  } else {
    throw new Error('Database is not initialized');
  }
}

/**
 * Get current pool & query statistics
 */
export function getPoolStats() {
  let stats = {
    mode: poolStats.mode,
    isEmbedded,
    totalQueries: poolStats.totalQueries,
    activeQueries: poolStats.activeQueries,
    peakActiveQueries: poolStats.peakActiveQueries,
    errors: poolStats.errors,
  };

  if (!isEmbedded && pool) {
    stats.totalConnections = pool.totalCount;
    stats.idleConnections = pool.idleCount;
    stats.waitingQueries = pool.waitingCount;
    stats.maxConnections = config.db.maxConnections;
  } else {
    stats.totalConnections = 1;
    stats.idleConnections = 1;
    stats.waitingQueries = 0;
    stats.maxConnections = 'WASM In-Process';
  }

  return stats;
}

/**
 * Cleanly close database connections
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
  }
}
