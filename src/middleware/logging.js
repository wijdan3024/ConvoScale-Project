import { v4 as uuidv4 } from 'uuid';
import { metricsService } from '../services/metricsService.js';
import { query } from '../db/connection.js';

// Asynchronous in-memory audit log buffer for high-throughput batch insertion
let auditBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2000;

const auditInterval = setInterval(async () => {
  if (auditBuffer.length === 0) return;
  const batch = auditBuffer.splice(0, BATCH_SIZE);

  try {
    for (const log of batch) {
      await query(
        `INSERT INTO audit_logs (id, request_id, user_id, method, endpoint, status_code, duration_ms, ip_address, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          log.id,
          log.requestId,
          log.userId,
          log.method,
          log.endpoint,
          log.statusCode,
          log.durationMs,
          log.ipAddress,
          log.errorMessage,
        ]
      );
    }
  } catch (err) {
    // Non-fatal background error
  }
}, FLUSH_INTERVAL_MS);

auditInterval.unref();


/**
 * Structured request logging and metrics collector middleware
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Capture finish event
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const userId = req.user?.id || null;
    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    // 1. Update live metrics collector
    metricsService.recordRequest(req.method, req.path, statusCode, durationMs);

    // 2. Queue for asynchronous non-blocking DB persistence
    auditBuffer.push({
      id: uuidv4(),
      requestId,
      userId,
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ipAddress,
      errorMessage: res.locals?.errorMessage || null,
    });

    // 3. Keep buffer bounded to prevent memory growth under extreme load
    if (auditBuffer.length > 2000) {
      auditBuffer.splice(0, 500);
    }
  });

  next();
}
