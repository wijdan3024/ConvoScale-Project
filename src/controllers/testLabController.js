import { query } from '../db/connection.js';
import { seedDatabase } from '../db/seed.js';
import { MessageService } from '../services/messageService.js';
import { ConversationService } from '../services/conversationService.js';

export class TestLabController {
  /**
   * Run an explicit ACID Rollback Simulation
   * Tests what happens if message insertion succeeds but chatbot or counter update fails.
   */
  static async simulateFailure(req, res, next) {
    try {
      const { conversationId, failureType = 'BEFORE_BOT_INSERT' } = req.body;
      const userId = req.user.id;

      // 1. Get state before test
      const convBefore = await ConversationService.getConversationById({ conversationId, userId });
      const msgCountBeforeRes = await query(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1',
        [conversationId]
      );
      const messagesCountBefore = parseInt(msgCountBeforeRes.rows[0]?.count || '0', 10);

      // 2. Attempt transaction with simulated failure
      let failureError = null;
      try {
        await MessageService.sendMessage({
          conversationId,
          userId,
          content: 'This message should trigger a rollback simulation',
          simulateFailureType: failureType,
        });
      } catch (err) {
        failureError = err.message;
      }

      // 3. Inspect state after rollback
      const convAfter = await ConversationService.getConversationById({ conversationId, userId });
      const msgCountAfterRes = await query(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1',
        [conversationId]
      );
      const messagesCountAfter = parseInt(msgCountAfterRes.rows[0]?.count || '0', 10);

      const isAtomicityPreserved =
        convBefore.message_count === convAfter.message_count &&
        messagesCountBefore === messagesCountAfter;

      res.status(200).json({
        success: true,
        simulation: {
          failureType,
          errorTriggered: failureError,
          acidCompliance: {
            atomicityPreserved: isAtomicityPreserved,
            messageCountBefore: convBefore.message_count,
            messageCountAfter: convAfter.message_count,
            dbRowsBefore: messagesCountBefore,
            dbRowsAfter: messagesCountAfter,
            partialWritesOccurred: !isAtomicityPreserved,
            status: isAtomicityPreserved ? 'PASSED: Complete ROLLBACK verified' : 'FAILED: Inconsistent state',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Trigger database seeding
   */
  static async reseed(req, res, next) {
    try {
      await seedDatabase();
      res.status(200).json({
        success: true,
        message: 'Database reseeded successfully with fresh data, rules, and demo accounts.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Inspect current database counts and index metrics
   */
  static async inspectDatabase(req, res, next) {
    try {
      const tables = ['users', 'sessions', 'conversations', 'messages', 'chatbot_responses', 'idempotency_keys', 'audit_logs'];
      const counts = {};

      for (const table of tables) {
        try {
          const { rows } = await query(`SELECT COUNT(*) as count FROM ${table}`);
          counts[table] = parseInt(rows[0]?.count || '0', 10);
        } catch {
          counts[table] = 'N/A';
        }
      }

      res.status(200).json({
        success: true,
        data: {
          tableCounts: counts,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
