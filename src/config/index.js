import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL || 'info',

  db: {
    url: process.env.DATABASE_URL || null,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '50', 10),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '10000', 10),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '3000', 10),
    dataDir: process.env.DB_DATA_DIR || './data/pgdata',
  },

  redis: {
    url: process.env.REDIS_URL || null,
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'convoscale_super_secure_production_secret_key_2026_jwt',
    jwtExpiration: process.env.JWT_EXPIRATION || '7d',
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxAnonymous: parseInt(process.env.RATE_LIMIT_MAX_ANONYMOUS || '120', 10),
    maxAuthenticated: parseInt(process.env.RATE_LIMIT_MAX_AUTHENTICATED || '600', 10),
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '25000', 10),
  },
};
