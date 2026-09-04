import { config } from '../config/index.js';

/**
 * 404 Handler for undefined routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
      status: 404,
    },
  });
}

/**
 * Centralized Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  if (res.locals) {
    res.locals.errorMessage = message;
  }

  // Only log unexpected internal errors (500s) to console
  if (statusCode >= 500) {
    console.error(`[Error] [${req.id || 'NO_REQ_ID'}] ${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      status: statusCode,
      requestId: req.id,
      ...(config.nodeEnv === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
}
