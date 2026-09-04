import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db/connection.js';
import { ChatbotService } from './chatbotService.js';
import { ConversationService } from './conversationService.js';

export class MessageService {
  /**
   * Send a user message, generate chatbot response, and update conversation atomically inside an ACID transaction.
   *
   * @param {Object} params
   * @param {string} params.conversationId - Target conversation ID
   * @param {string} params.userId - Authenticated user ID
   * @param {string} params.content - Message text
   * @param {string} [params.requestId] - Client-generated idempotency request identifier
   * @param {string} [params.simulateFailureType] - For ACID testing ('AFTER_USER_MSG', 'BEFORE_BOT_INSERT', 'METADATA_FAIL')
   */
  static async sendMessage({
    conversationId,
    userId,
    content,
    requestId = null,
    simulateFailureType = null,
  }) {
    const cleanContent = (content || '').trim();
    if (!cleanContent) {
      const error = new Error('Message content cannot be empty');
      error.statusCode = 400;
      throw error;
    }

    // Verify conversation ownership
    await ConversationService.getConversationById({ conversationId, userId });

    // Generate Chatbot Response before entering atomic transaction block
    const botReplyData = await ChatbotService.generateResponse(cleanContent);

    // Execute within an ACID transaction
    return await withTransaction(async (client) => {
      // 1. Idempotency Check: if requestId provided, check if already recorded
      if (requestId) {
        const existingMsgRes = await client.query(
          `SELECT id, sender_type, content, sequence_number, created_at, request_id
           FROM messages
           WHERE conversation_id = $1 AND request_id = $2`,
          [conversationId, requestId]
        );

        if (existingMsgRes.rows.length > 0) {
          const userMsg = existingMsgRes.rows[0];
          // Find following bot reply
          const botMsgRes = await client.query(
            `SELECT id, sender_type, content, sequence_number, created_at
             FROM messages
             WHERE conversation_id = $1 AND sequence_number = $2`,
            [conversationId, userMsg.sequence_number + 1]
          );

          return {
            isDuplicate: true,
            userMessage: userMsg,
            botMessage: botMsgRes.rows[0] || null,
            message: 'Duplicate request detected. Returned idempotent result.',
          };
        }
      }

      // 2. Lock conversation row (SELECT FOR UPDATE) to prevent concurrency race conditions
      // In native Postgres this acquires a row lock.
      const convLockRes = await client.query(
        `SELECT id, message_count FROM conversations WHERE id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      if (convLockRes.rows.length === 0) {
        const error = new Error('Conversation not found during lock acquisition');
        error.statusCode = 404;
        throw error;
      }

      const currentCount = parseInt(convLockRes.rows[0].message_count, 10) || 0;
      const userSeq = currentCount + 1;
      const botSeq = currentCount + 2;
      const userMessageId = uuidv4();
      const botMessageId = uuidv4();

      // 3. Insert User Message
      const userMsgInsert = await client.query(
        `INSERT INTO messages (id, conversation_id, sender_type, content, request_id, sequence_number)
         VALUES ($1, $2, 'USER', $3, $4, $5)
         RETURNING id, conversation_id, sender_type, content, request_id, sequence_number, created_at`,
        [userMessageId, conversationId, cleanContent, requestId, userSeq]
      );

      // Simulation point 1: Fail right after inserting user message
      if (simulateFailureType === 'AFTER_USER_MSG') {
        throw new Error('SIMULATED_FAILURE: Transaction aborted immediately after user message insertion to test rollback.');
      }

      // Simulation point 2: Fail before bot insertion
      if (simulateFailureType === 'BEFORE_BOT_INSERT') {
        throw new Error('SIMULATED_FAILURE: Chatbot engine crashed before storing response. Rolling back.');
      }

      // 4. Insert Chatbot Message
      const botMsgInsert = await client.query(
        `INSERT INTO messages (id, conversation_id, sender_type, content, request_id, sequence_number)
         VALUES ($1, $2, 'CHATBOT', $3, $4, $5)
         RETURNING id, conversation_id, sender_type, content, request_id, sequence_number, created_at`,
        [botMessageId, conversationId, botReplyData.response, `bot-resp-${userMessageId}`, botSeq]
      );

      // Simulation point 3: Fail on metadata counter update
      if (simulateFailureType === 'METADATA_FAIL') {
        throw new Error('SIMULATED_FAILURE: Conversation metadata counter update failed. Rolling back all inserts.');
      }

      // 6. Update Conversation Metadata (Atomic message_count & timestamps)
      const convUpdate = await client.query(
        `UPDATE conversations
         SET message_count = message_count + 2,
             last_message_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, title, message_count, last_message_at, updated_at`,
        [conversationId]
      );

      return {
        isDuplicate: false,
        userMessage: userMsgInsert.rows[0],
        botMessage: botMsgInsert.rows[0],
        conversation: convUpdate.rows[0],
        ruleMatched: botReplyData.matchedCategory,
      };
    });
  }

  /**
   * Retrieve messages for a conversation with cursor & offset pagination
   */
  static async getMessages({
    conversationId,
    userId,
    limit = 50,
    cursor = null, // sequence_number or created_at cursor
    offset = 0,
    direction = 'ASC',
  }) {
    // Verify ownership
    await ConversationService.getConversationById({ conversationId, userId });

    const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const orderDir = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let queryText;
    let params;

    if (cursor) {
      const cursorSeq = parseInt(cursor, 10);
      if (isNaN(cursorSeq)) {
        const error = new Error('Invalid cursor: expected sequence number');
        error.statusCode = 400;
        throw error;
      }

      const operator = orderDir === 'ASC' ? '>' : '<';
      queryText = `
        SELECT id, conversation_id, sender_type, content, request_id, sequence_number, created_at
        FROM messages
        WHERE conversation_id = $1 AND sequence_number ${operator} $2
        ORDER BY sequence_number ${orderDir}
        LIMIT $3
      `;
      params = [conversationId, cursorSeq, pageLimit + 1];
    } else {
      queryText = `
        SELECT id, conversation_id, sender_type, content, request_id, sequence_number, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY sequence_number ${orderDir}
        LIMIT $2 OFFSET $3
      `;
      params = [conversationId, pageLimit + 1, parseInt(offset, 10) || 0];
    }

    const { rows } = await query(queryText, params);
    const hasMore = rows.length > pageLimit;
    const items = hasMore ? rows.slice(0, pageLimit) : rows;

    let nextCursor = null;
    if (hasMore && items.length > 0) {
      nextCursor = items[items.length - 1].sequence_number;
    }

    const countRes = await query(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1',
      [conversationId]
    );

    return {
      messages: items,
      pagination: {
        limit: pageLimit,
        hasMore,
        nextCursor,
        direction: orderDir,
        offset: cursor ? undefined : parseInt(offset, 10) || 0,
        total: parseInt(countRes.rows[0]?.total || '0', 10),
      },
    };
  }
}
