import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';

/**
 * Idempotency Protection Middleware
 * Ensures duplicate HTTP mutation requests are not processed multiple times.
 */
export function idempotencyMiddleware() {
  return async function (req, res, next) {
    // Only apply idempotency to mutation methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey =
      req.headers['x-idempotency-key'] ||
      req.headers['idempotency-key'] ||
      req.body?.requestId ||
      req.body?.request_id;

    if (!idempotencyKey) {
      return next();
    }

    const userId = req.user?.id || 'anonymous';
    const endpoint = `${req.method} ${req.baseUrl || ''}${req.path}`;

    try {
      // 1. Check if idempotency key already exists in DB
      const existingRes = await query(
        `SELECT id, status, response_status_code, response_body
         FROM idempotency_keys
         WHERE key = $1 AND (user_id = $2 OR (user_id IS NULL AND $2 = 'anonymous'))`,
        [idempotencyKey, userId === 'anonymous' ? null : userId]
      );

      if (existingRes.rows.length > 0) {
        const record = existingRes.rows[0];

        if (record.status === 'COMPLETED') {
          res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
          res.setHeader('X-Idempotency-Key', idempotencyKey);

          const statusCode = record.response_status_code || 200;
          let body;
          try {
            body = JSON.parse(record.response_body);
          } catch {
            body = record.response_body;
          }

          return res.status(statusCode).json(body);
        }

        if (record.status === 'PROCESSING') {
          return res.status(409).json({
            success: false,
            error: {
              message: 'A request with this idempotency key is currently being processed.',
              code: 'IDEMPOTENT_REQUEST_IN_FLIGHT',
            },
          });
        }
      }

      // 2. Reserve the key in PROCESSING state
      const keyId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      try {
        await query(
          `INSERT INTO idempotency_keys (id, key, user_id, endpoint, status, expires_at)
           VALUES ($1, $2, $3, $4, 'PROCESSING', $5)`,
          [keyId, idempotencyKey, userId === 'anonymous' ? null : userId, endpoint, expiresAt]
        );
      } catch (insertErr) {
        // If unique constraint triggers because of simultaneous concurrent insert
        if (insertErr.message.includes('unique') || insertErr.message.includes('uq_idempotency_key_user')) {
          return res.status(409).json({
            success: false,
            error: {
              message: 'Concurrent request with identical idempotency key detected.',
              code: 'CONCURRENT_IDEMPOTENT_REQUEST',
            },
          });
        }
        throw insertErr;
      }

      // 3. Intercept response to store result upon successful completion
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // Asynchronously update idempotency key record
        const responseBodyStr = JSON.stringify(body);
        const statusCode = res.statusCode;
        const finalStatus = statusCode < 400 ? 'COMPLETED' : 'FAILED';

        query(
          `UPDATE idempotency_keys
           SET status = $1, response_status_code = $2, response_body = $3
           WHERE id = $4`,
          [finalStatus, statusCode, responseBodyStr, keyId]
        ).catch((err) => {
          console.warn('[Idempotency] Failed to finalize idempotency record:', err.message);
        });

        res.setHeader('X-Idempotency-Key', idempotencyKey);
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.warn('[Idempotency] Middleware error:', err.message);
      next();
    }
  };
}
