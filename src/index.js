import http from 'http';
import { config } from './config/index.js';
import { createApp } from './app.js';
import { initDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrations.js';
import { seedDatabase } from './db/seed.js';
import { initCache } from './cache/redis.js';

async function bootstrap() {
  console.log('='.repeat(70));
  console.log('🚀 Starting ConvoScale — High-Performance Chat Backend');
  console.log(`⚡ Target Throughput: 10,000 Requests/Min (167+ RPS)`);
  console.log(`🌐 Environment: ${config.nodeEnv}`);
  console.log('='.repeat(70));

  // 1. Initialize Database
  await initDatabase();

  // 2. Run Database Migrations
  await runMigrations();

  // 3. Seed Database if empty
  await seedDatabase();

  // 4. Initialize Cache & Lock Subsystem
  await initCache();

  // 5. Create and Start HTTP Server
  const app = createApp();
  const server = http.createServer(app);

  // Configure Keep-Alive timeouts for maximum high-throughput load testing performance
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.listen(config.port, () => {
    console.log(`\n✅ ConvoScale Server running at http://localhost:${config.port}`);
    console.log(`📊 Live Dashboard & Interactive Testing: http://localhost:${config.port}`);
    console.log(`🏥 Health Check: http://localhost:${config.port}/health`);
    console.log(`📈 Metrics API: http://localhost:${config.port}/api/metrics\n`);
  });

  // Graceful Shutdown Handlers
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('[Server] HTTP connections closed.');
      try {
        await closeDatabase();
        console.log('[Database] Connection pool cleanly drained.');
      } catch (err) {
        console.error('[Database] Error closing connections:', err.message);
      }
      process.exit(0);
    });

    // Force close after 10s if active sockets stall
    setTimeout(() => {
      console.error('[Server] Forced shutdown timeout exceeded.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});
