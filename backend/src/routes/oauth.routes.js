const { Router } = require('express');
const oauthController = require('../controllers/oauth.controller');

const router = Router();

// /oauth2/authorization/google & /oauth2/authorization/facebook
router.get('/authorization/google', oauthController.authorize('google'));
router.get('/authorization/facebook', oauthController.authorize('facebook'));

// /oauth2/callback/google & /oauth2/callback/facebook
router.get('/callback/google', oauthController.callback('google'));
router.get('/callback/facebook', oauthController.callback('facebook'));

module.exports = router;
