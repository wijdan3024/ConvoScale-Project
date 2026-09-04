import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';

export class ConversationService {
  /**
   * Create a new conversation for a user
   */
  static async createConversation({ userId, title = 'New Conversation' }) {
    const id = uuidv4();
    const cleanTitle = (title || 'New Conversation').trim().substring(0, 255);

    const { rows } = await query(
      `INSERT INTO conversations (id, user_id, title, message_count, last_message_at)
       VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
       RETURNING id, user_id, title, message_count, last_message_at, is_archived, created_at, updated_at`,
      [id, userId, cleanTitle]
    );

    return rows[0];
  }

  /**
   * List conversations for a user with Cursor & Offset Pagination
   */
  static async listConversations({
    userId,
    limit = 20,
    cursor = null, // cursor is base64 encoded { updated_at, id }
    offset = 0,
    isArchived = false,
  }) {
    const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    let queryText;
    let params;

    if (cursor) {
      // Decode cursor: base64 JSON { updatedAt, id }
      let cursorData;
      try {
        cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      } catch {
        const error = new Error('Invalid pagination cursor');
        error.statusCode = 400;
        throw error;
      }

      queryText = `
        SELECT id, user_id, title, message_count, last_message_at, is_archived, created_at, updated_at
        FROM conversations
        WHERE user_id = $1
          AND is_archived = $2
          AND (updated_at, id) < ($3, $4)
        ORDER BY updated_at DESC, id DESC
        LIMIT $5
      `;
      params = [userId, isArchived, new Date(cursorData.updatedAt), cursorData.id, pageLimit + 1];
    } else {
      queryText = `
        SELECT id, user_id, title, message_count, last_message_at, is_archived, created_at, updated_at
        FROM conversations
        WHERE user_id = $1
          AND is_archived = $2
        ORDER BY updated_at DESC, id DESC
        LIMIT $3 OFFSET $4
      `;
      params = [userId, isArchived, pageLimit + 1, parseInt(offset, 10) || 0];
    }

    const { rows } = await query(queryText, params);
    const hasMore = rows.length > pageLimit;
    const items = hasMore ? rows.slice(0, pageLimit) : rows;

    let nextCursor = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ updatedAt: lastItem.updated_at, id: lastItem.id })
      ).toString('base64');
    }

    const countRes = await query(
      'SELECT COUNT(*) as total FROM conversations WHERE user_id = $1 AND is_archived = $2',
      [userId, isArchived]
    );

    return {
      conversations: items,
      pagination: {
        limit: pageLimit,
        hasMore,
        nextCursor,
        offset: cursor ? undefined : parseInt(offset, 10) || 0,
        total: parseInt(countRes.rows[0]?.total || '0', 10),
      },
    };
  }

  /**
   * Retrieve a single conversation with ownership verification
   */
  static async getConversationById({ conversationId, userId }) {
    const { rows } = await query(
      `SELECT id, user_id, title, message_count, last_message_at, is_archived, created_at, updated_at
       FROM conversations
       WHERE id = $1`,
      [conversationId]
    );

    if (rows.length === 0) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      throw error;
    }

    const conversation = rows[0];
    if (conversation.user_id !== userId) {
      const error = new Error('Access denied: You do not have permission to view this conversation');
      error.statusCode = 403;
      throw error;
    }

    return conversation;
  }

  /**
   * Update conversation title or archive status with ownership check
   */
  static async updateConversation({ conversationId, userId, title, isArchived }) {
    await this.getConversationById({ conversationId, userId });

    const updates = [];
    const params = [conversationId, userId];
    let pIdx = 3;

    if (title !== undefined) {
      updates.push(`title = $${pIdx++}`);
      params.push(title.trim().substring(0, 255));
    }
    if (isArchived !== undefined) {
      updates.push(`is_archived = $${pIdx++}`);
      params.push(Boolean(isArchived));
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const { rows } = await query(
      `UPDATE conversations
       SET ${updates.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, title, message_count, last_message_at, is_archived, created_at, updated_at`,
      params
    );

    return rows[0];
  }

  /**
   * Delete a conversation with ownership check
   */
  static async deleteConversation({ conversationId, userId }) {
    await this.getConversationById({ conversationId, userId });

    const { rowCount } = await query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    return rowCount > 0;
  }
}
