import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { cache } from '../cache/redis.js';

const RULES_CACHE_KEY = 'chatbot:active_rules';
const RULES_CACHE_TTL = 600; // 10 minutes

export class ChatbotService {
  /**
   * Fetch all active rules (cached for sub-millisecond retrieval under 10k RPM load)
   */
  static async getActiveRules() {
    const cached = await cache.getJSON(RULES_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const { rows } = await query(
      `SELECT id, trigger_type, pattern_or_keyword, response_template, category, priority
       FROM chatbot_responses
       WHERE is_active = TRUE
       ORDER BY priority DESC, created_at ASC`
    );

    await cache.set(RULES_CACHE_KEY, rows, RULES_CACHE_TTL);
    return rows;
  }

  /**
   * Invalidate cached rules
   */
  static async invalidateRulesCache() {
    await cache.del(RULES_CACHE_KEY);
  }

  /**
   * Determine the most appropriate response for a user message
   * @param {string} userMessage - Text sent by the user
   * @returns {Promise<{ response: string, ruleId: string, matchedCategory: string }>}
   */
  static async generateResponse(userMessage) {
    const trimmed = (userMessage || '').trim();
    const lower = trimmed.toLowerCase();
    const rules = await this.getActiveRules();

    let defaultRule = null;

    for (const rule of rules) {
      const type = rule.trigger_type;
      const pattern = rule.pattern_or_keyword;

      if (type === 'COMMAND') {
        if (lower === pattern.toLowerCase() || lower.startsWith(pattern.toLowerCase() + ' ')) {
          return {
            response: rule.response_template,
            ruleId: rule.id,
            matchedCategory: rule.category,
          };
        }
      } else if (type === 'EXACT') {
        if (lower === pattern.toLowerCase()) {
          return {
            response: rule.response_template,
            ruleId: rule.id,
            matchedCategory: rule.category,
          };
        }
      } else if (type === 'KEYWORD') {
        // Keyword regex pattern e.g. "pricing|cost|plans" or "hello"
        const keywords = pattern.split('|').map((k) => k.trim().toLowerCase());
        const hasMatch = keywords.some((kw) => lower.includes(kw));
        if (hasMatch) {
          return {
            response: rule.response_template,
            ruleId: rule.id,
            matchedCategory: rule.category,
          };
        }
      } else if (type === 'REGEX') {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(trimmed)) {
            return {
              response: rule.response_template,
              ruleId: rule.id,
              matchedCategory: rule.category,
            };
          }
        } catch {
          // Invalid regex fallback
        }
      } else if (type === 'DEFAULT') {
        defaultRule = rule;
      }
    }

    if (defaultRule) {
      return {
        response: defaultRule.response_template,
        ruleId: defaultRule.id,
        matchedCategory: defaultRule.category,
      };
    }

    return {
      response: 'Thank you for your message. ConvoScale has safely processed and stored your request.',
      ruleId: 'system-default',
      matchedCategory: 'general',
    };
  }

  /**
   * Add a new chatbot rule
   */
  static async addRule({ trigger_type, pattern_or_keyword, response_template, category = 'custom', priority = 10 }) {
    const id = uuidv4();
    const { rows } = await query(
      `INSERT INTO chatbot_responses (id, trigger_type, pattern_or_keyword, response_template, category, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING *`,
      [id, trigger_type, pattern_or_keyword, response_template, category, priority]
    );

    await this.invalidateRulesCache();
    return rows[0];
  }

  /**
   * Get all rules with pagination
   */
  static async listRules({ limit = 50, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT * FROM chatbot_responses ORDER BY priority DESC, created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countRes = await query('SELECT COUNT(*) as total FROM chatbot_responses');
    return {
      rules: rows,
      total: parseInt(countRes.rows[0]?.total || '0', 10),
      limit,
      offset,
    };
  }

  /**
   * Delete a rule by ID
   */
  static async deleteRule(ruleId) {
    const { rowCount } = await query('DELETE FROM chatbot_responses WHERE id = $1', [ruleId]);
    await this.invalidateRulesCache();
    return rowCount > 0;
  }
}
