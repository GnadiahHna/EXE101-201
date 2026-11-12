const { Router } = require('express');
const chatbotController = require('../controllers/chatbot.controller');
const { chatRateLimiter } = require('../middlewares/rateLimiter.middleware');
const { optionalAuthenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/ask', optionalAuthenticate, chatRateLimiter, chatbotController.askQuestion);

module.exports = router;
