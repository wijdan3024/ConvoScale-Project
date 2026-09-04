import { MessageService } from '../services/messageService.js';

export class MessageController {
  static async send(req, res, next) {
    try {
      const conversationId = req.params.id;
      const { content, requestId, simulateFailureType } = req.body;
      const effectiveRequestId = req.headers['x-idempotency-key'] || requestId;

      const result = await MessageService.sendMessage({
        conversationId,
        userId: req.user.id,
        content,
        requestId: effectiveRequestId,
        simulateFailureType,
      });

      const statusCode = result.isDuplicate ? 200 : 201;
      res.status(statusCode).json({
        success: true,
        data: result,
        message: result.isDuplicate ? 'Idempotent duplicate response' : 'Message sent and processed successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async list(req, res, next) {
    try {
      const conversationId = req.params.id;
      const { limit, cursor, offset, direction } = req.query;

      const result = await MessageService.getMessages({
        conversationId,
        userId: req.user.id,
        limit,
        cursor,
        offset,
        direction,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
