const chatbotService = require('../services/chatbot.service');

/**
 * POST /api/chat/ask
 * Responds with text/plain HTML answer matching Frontend contract
 */
const askQuestion = async (req, res) => {
  const rawBody = req.body;
  const question =
    typeof rawBody === 'string'
      ? rawBody
      : (rawBody?.question || rawBody?.message || rawBody?.text || '');

  const answer = await chatbotService.answerQuestion(question);
  return res.type('text/plain').send(answer);
};

module.exports = {
  askQuestion,
};
