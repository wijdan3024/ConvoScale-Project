import { ChatbotService } from '../services/chatbotService.js';

export class ChatbotController {
  static async listRules(req, res, next) {
    try {
      const { limit, offset } = req.query;
      const result = await ChatbotService.listRules({ limit, offset });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createRule(req, res, next) {
    try {
      const { trigger_type, pattern_or_keyword, response_template, category, priority } = req.body;
      const rule = await ChatbotService.addRule({
        trigger_type,
        pattern_or_keyword,
        response_template,
        category,
        priority,
      });

      res.status(201).json({
        success: true,
        data: { rule },
        message: 'Chatbot rule created successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteRule(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await ChatbotService.deleteRule(id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { message: 'Chatbot rule not found', code: 'NOT_FOUND' },
        });
      }

      res.status(200).json({
        success: true,
        message: 'Chatbot rule deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
