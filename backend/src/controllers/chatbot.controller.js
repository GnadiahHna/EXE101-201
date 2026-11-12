const chatbotService = require('../services/chatbot.service');
const { logger } = require('../middlewares/logger.middleware');
const crypto = require('crypto');

/**
 * POST /api/chat/ask
 * Request JSON: { message: string, history?: [{ role: string, text: string }], sessionId?: string }
 * Response JSON: { answer: string, intent: string, urgency: "emergency"|"urgent"|"routine"|"info", specialtyId?: number, suggestedSlots?: [...], actions?: [...] }
 */
const askQuestion = async (req, res, next) => {
  try {
    const rawBody = req.body;
    let message = '';
    let history = [];
    let sessionId = '';

    if (typeof rawBody === 'string') {
      message = rawBody;
    } else if (rawBody && typeof rawBody === 'object') {
      message = rawBody.message || rawBody.question || rawBody.text || '';
      if (Array.isArray(rawBody.history)) {
        history = rawBody.history.slice(-6).map((h) => ({
          role: String(h.role || 'user'),
          text: String(h.text || '').slice(0, 1000),
        }));
      }
      sessionId = String(rawBody.sessionId || '');
    }

    // Limit message length to 1000 characters
    const trimmedMessage = String(message).trim().slice(0, 1000);

    const result = await chatbotService.processChatMessage({
      message: trimmedMessage,
      history,
      sessionId,
    });

    // Safe metadata-only logging (No raw message or health PII logged)
    const hashedSessionId = sessionId
      ? crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 8)
      : 'anonymous';

    logger.info({
      event: 'CHAT_TRIAGE_COMPLETED',
      sessionIdHash: hashedSessionId,
      messageLength: trimmedMessage.length,
      intent: result.intent,
      urgency: result.urgency,
      specialtyId: result.specialtyId || null,
      slotsCount: result.suggestedSlots ? result.suggestedSlots.length : 0,
      userId: req.user?.id || null,
    });

    // Content negotiation: return JSON by default; support text/plain if explicitly requested
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('text/plain') && !acceptHeader.includes('application/json')) {
      return res.type('text/plain').send(result.answer);
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  askQuestion,
};
