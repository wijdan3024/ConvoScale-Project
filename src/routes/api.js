import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { ConversationController } from '../controllers/conversationController.js';
import { MessageController } from '../controllers/messageController.js';
import { ChatbotController } from '../controllers/chatbotController.js';
import { HealthController } from '../controllers/healthController.js';
import { TestLabController } from '../controllers/testLabController.js';

import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { apiRateLimiter } from '../middleware/rateLimiter.js';
import {
  validate,
  RegisterSchema,
  LoginSchema,
  CreateConversationSchema,
  UpdateConversationSchema,
  SendMessageSchema,
  PaginationQuerySchema,
  CreateChatbotRuleSchema,
} from '../middleware/validation.js';

export const apiRouter = Router();

// Apply API-level rate limiter
apiRouter.use(apiRateLimiter);

// ==========================================
// 1. Authentication Routes
// ==========================================
apiRouter.post('/auth/register', idempotencyMiddleware(), validate(RegisterSchema), AuthController.register);
apiRouter.post('/auth/login', validate(LoginSchema), AuthController.login);
apiRouter.post('/auth/logout', authenticate, AuthController.logout);
apiRouter.get('/auth/me', authenticate, AuthController.me);

// ==========================================
// 2. Conversation Routes
// ==========================================
apiRouter.post(
  '/conversations',
  authenticate,
  idempotencyMiddleware(),
  validate(CreateConversationSchema),
  ConversationController.create
);

apiRouter.get(
  '/conversations',
  authenticate,
  validate(PaginationQuerySchema, 'query'),
  ConversationController.list
);

apiRouter.get('/conversations/:id', authenticate, ConversationController.getById);
apiRouter.patch(
  '/conversations/:id',
  authenticate,
  validate(UpdateConversationSchema),
  ConversationController.update
);
apiRouter.delete('/conversations/:id', authenticate, ConversationController.delete);

// ==========================================
// 3. Message Routes (with ACID transaction)
// ==========================================
apiRouter.post(
  '/conversations/:id/messages',
  authenticate,
  idempotencyMiddleware(),
  validate(SendMessageSchema),
  MessageController.send
);

apiRouter.get(
  '/conversations/:id/messages',
  authenticate,
  validate(PaginationQuerySchema, 'query'),
  MessageController.list
);

// ==========================================
// 4. Chatbot Response Rule Routes
// ==========================================
apiRouter.get('/chatbot/rules', ChatbotController.listRules);
apiRouter.post('/chatbot/rules', authenticate, validate(CreateChatbotRuleSchema), ChatbotController.createRule);
apiRouter.delete('/chatbot/rules/:id', authenticate, ChatbotController.deleteRule);

// ==========================================
// 5. System Health, Telemetry & Diagnostics
// ==========================================
apiRouter.get('/health', HealthController.getHealth);
apiRouter.get('/metrics', HealthController.getMetrics);
apiRouter.get('/stats', HealthController.getMetrics);

// ==========================================
// 6. Test Lab & Verification Endpoints
// ==========================================
apiRouter.post('/test/simulate-failure', authenticate, TestLabController.simulateFailure);
apiRouter.post('/test/seed', TestLabController.reseed);
apiRouter.get('/test/db-inspect', TestLabController.inspectDatabase);
