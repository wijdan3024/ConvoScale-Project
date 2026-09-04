import { query, getPoolStats } from '../db/connection.js';
import { cache } from '../cache/redis.js';
import { metricsService } from '../services/metricsService.js';

export class HealthController {
  static async getHealth(req, res) {
    const start = Date.now();
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - dbStart;
    } catch (err) {
      dbStatus = 'unhealthy: ' + err.message;
    }

    const mem = process.memoryUsage();
    const isHealthy = dbStatus === 'healthy';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'ConvoScale High-Performance Chat Backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      healthChecks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          pool: getPoolStats(),
        },
        cache: {
          status: 'healthy',
          stats: cache.getStats(),
        },
        system: {
          nodeVersion: process.version,
          heapUsedMB: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
          rssMB: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
        },
      },
      durationMs: Date.now() - start,
    });
  }

  static async getMetrics(req, res) {
    const snapshot = metricsService.getSnapshot();
    res.status(200).json({
      success: true,
      data: snapshot,
    });
  }
}
