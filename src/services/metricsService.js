import { getPoolStats } from '../db/connection.js';
import { cache } from '../cache/redis.js';

class MetricsCollector {
  constructor() {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.clientErrors = 0;
    this.serverErrors = 0;

    // Rolling latency samples (last 5,000 requests for accurate percentiles)
    this.maxSamples = 5000;
    this.latencies = [];

    // Rolling 1-minute window request timestamps
    this.requestTimestamps = [];

    // Per-endpoint metrics
    this.endpointCounts = new Map();
  }

  recordRequest(method, endpoint, statusCode, durationMs) {
    const now = Date.now();
    this.totalRequests++;

    if (statusCode >= 200 && statusCode < 400) {
      this.successfulRequests++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.clientErrors++;
    } else if (statusCode >= 500) {
      this.serverErrors++;
    }

    // Record latency
    if (this.latencies.length >= this.maxSamples) {
      this.latencies.shift();
    }
    this.latencies.push(durationMs);

    // Record timestamp for rolling RPM
    this.requestTimestamps.push(now);

    // Prune timestamps older than 60s
    const cutoff = now - 60000;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }

    // Endpoint counter
    const epKey = `${method} ${endpoint.split('?')[0]}`;
    this.endpointCounts.set(epKey, (this.endpointCounts.get(epKey) || 0) + 1);
  }

  getPercentiles() {
    if (this.latencies.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;
    const getP = (p) => sorted[Math.min(Math.floor((p / 100) * len), len - 1)];

    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = parseFloat((sum / len).toFixed(2));

    return {
      min: parseFloat(sorted[0].toFixed(2)),
      max: parseFloat(sorted[len - 1].toFixed(2)),
      avg,
      p50: parseFloat(getP(50).toFixed(2)),
      p90: parseFloat(getP(90).toFixed(2)),
      p95: parseFloat(getP(95).toFixed(2)),
      p99: parseFloat(getP(99).toFixed(2)),
    };
  }

  getSnapshot() {
    const now = Date.now();
    // Prune rolling timestamps older than 60 seconds
    const cutoff = now - 60000;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }

    const currentRPM = this.requestTimestamps.length;
    const currentRPS = parseFloat((currentRPM / 60).toFixed(2));
    const uptimeSeconds = Math.floor((now - this.startTime) / 1000);
    const percentiles = this.getPercentiles();
    const mem = process.memoryUsage();

    const topEndpoints = Array.from(this.endpointCounts.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      throughput: {
        currentRPM,
        currentRPS,
        targetRPM: 10000,
        targetRPS: 167,
        capacityUtilizationPercent: parseFloat(((currentRPM / 10000) * 100).toFixed(2)),
      },
      requests: {
        total: this.totalRequests,
        successful: this.successfulRequests,
        clientErrors: this.clientErrors,
        serverErrors: this.serverErrors,
        errorRatePercent: this.totalRequests > 0
          ? parseFloat((((this.clientErrors + this.serverErrors) / this.totalRequests) * 100).toFixed(2))
          : 0,
      },
      latencyMs: percentiles,
      database: getPoolStats(),
      cache: cache.getStats(),
      memory: {
        heapUsedMB: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMB: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
        rssMB: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
      },
      topEndpoints,
    };
  }
}

export const metricsService = new MetricsCollector();
