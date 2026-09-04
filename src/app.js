import express from 'express';

import cors from 'cors';

import helmet from 'helmet';

import path from 'path';

import { fileURLToPath } from 'url';

import { apiRouter } from './routes/api.js';

import { globalRateLimiter } from './middleware/rateLimiter.js';

import { requestLogger } from './middleware/logging.js';

import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import { HealthController } from './controllers/healthController.js';


const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);


export function createApp() {

  const app = express();


  // 1. Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );


  // 2. CORS
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Idempotency-Key',
        'X-Request-Id',
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Idempotency-Key',
        'X-Request-Id',
        'X-Cache-Lookup',
      ],
    })
  );


  // 3. Body Parsing
  app.use(express.json({ limit: '1mb' }));

  app.use(
    express.urlencoded({
      extended: true,
      limit: '1mb',
    })
  );


  // 4. Structured Logging & Live Metrics
  app.use(requestLogger);


  // 5. Global Capacity Rate Limiter
  app.use(globalRateLimiter);


  // 6. Direct Root Health Check
  app.get('/health', HealthController.getHealth);


  // 7. Static Dashboard Frontend
  const publicDir = path.join(__dirname, '..', 'public');

  app.use(express.static(publicDir));


  // 8. REST API Routes
  app.use('/api', apiRouter);


  // 9. Fallback 404 & Error Handler
  app.use(notFoundHandler);

  app.use(errorHandler);


  return app;
}


// Vercel requires the Express application
// to be exported as the default export.
const app = createApp();

export default app;