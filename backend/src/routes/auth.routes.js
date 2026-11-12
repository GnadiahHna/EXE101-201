const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const {
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  adminBootstrapRateLimiter,
} = require('../middlewares/rateLimiter.middleware');

const router = Router();

router.post('/login', loginRateLimiter, authController.login);
router.post('/register', registerRateLimiter, authController.register);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', registerRateLimiter, authController.resendVerification);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);

router.get('/bootstrap-status', authController.getBootstrapStatus);
router.post('/register-admin', adminBootstrapRateLimiter, authController.registerAdmin);
router.post('/bootstrap-admin', adminBootstrapRateLimiter, authController.registerAdmin);

router.post('/change-password', authenticate, authController.changePassword);
router.post('/forgot-password', passwordResetRateLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetRateLimiter, authController.resetPassword);
router.post('/oauth2/exchange', require('../controllers/oauth.controller').exchangeToken);
router.post('/oauth2/logout', authController.oauth2Logout);

module.exports = router;
