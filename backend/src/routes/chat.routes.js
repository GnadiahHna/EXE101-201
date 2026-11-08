const { Router } = require('express');
const chatbotController = require('../controllers/chatbot.controller');

const router = Router();

router.post('/ask', chatbotController.askQuestion);

module.exports = router;
