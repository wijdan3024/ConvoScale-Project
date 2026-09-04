import { z } from 'zod';

/**
 * Validation middleware factory
 * @param {z.ZodSchema} schema
 * @param {'body' | 'query' | 'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source] || {});
      if (source === 'body') {
        req.body = parsed;
      } else {
        req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = parsed;
        if (req[source] && typeof req[source] === 'object') {
          Object.assign(req[source], parsed);
        }
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: err.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      }
      next(err);
    }
  };
}

// ==========================================
// Reusable Zod Schemas
// ==========================================

export const RegisterSchema = z.object({
  email: z.string().email('Valid email address is required').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters long').max(100),
  name: z.string().min(2, 'Name must be at least 2 characters long').max(100),
});

export const LoginSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateConversationSchema = z.object({
  title: z.string().max(255).optional().default('New Conversation'),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  isArchived: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(10000),
  requestId: z.string().max(100).optional(),
  simulateFailureType: z.enum(['AFTER_USER_MSG', 'BEFORE_BOT_INSERT', 'METADATA_FAIL']).optional(),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  offset: z.coerce.number().min(0).optional().default(0),
  direction: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional().default('ASC'),
  isArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional().default(false)),
});

export const CreateChatbotRuleSchema = z.object({
  trigger_type: z.enum(['EXACT', 'KEYWORD', 'REGEX', 'DEFAULT', 'COMMAND']),
  pattern_or_keyword: z.string().min(1).max(255),
  response_template: z.string().min(1).max(5000),
  category: z.string().max(100).optional().default('custom'),
  priority: z.coerce.number().min(0).max(1000).optional().default(10),
});
