import { ConversationService } from '../services/conversationService.js';

export class ConversationController {
  static async create(req, res, next) {
    try {
      const { title } = req.body;
      const conversation = await ConversationService.createConversation({
        userId: req.user.id,
        title,
      });

      res.status(201).json({
        success: true,
        data: { conversation },
        message: 'Conversation created successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req, res, next) {
    try {
      const { limit, cursor, offset, isArchived } = req.query;
      const result = await ConversationService.listConversations({
        userId: req.user.id,
        limit,
        cursor,
        offset,
        isArchived,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const conversation = await ConversationService.getConversationById({
        conversationId: id,
        userId: req.user.id,
      });

      res.status(200).json({
        success: true,
        data: { conversation },
      });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const { title, isArchived } = req.body;

      const conversation = await ConversationService.updateConversation({
        conversationId: id,
        userId: req.user.id,
        title,
        isArchived,
      });

      res.status(200).json({
        success: true,
        data: { conversation },
        message: 'Conversation updated successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      await ConversationService.deleteConversation({
        conversationId: id,
        userId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: 'Conversation deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
