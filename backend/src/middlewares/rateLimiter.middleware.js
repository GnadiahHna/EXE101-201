const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { normalizeEmail } = require('../utils/normalizers');

/**
 * Standard error generator complying with ClinicBooking ApiError format.
 */
function createRateLimitHandler(message, code = 'RATE_LIMIT_EXCEEDED') {
  return (req, res, next, options) => {
    const retryAfter = Math.ceil((options.windowMs) / 1000);
    res.setHeader('Retry-After', retryAfter);
    const err = new ApiError(429, message, code);
    if (typeof next === 'function') {
      next(err);
    } else {
      throw err;
    }
  };
}

/**
 * Standard default limiter
 */
const defaultRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs || 60000,
  max: env.rateLimitMax || 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: createRateLimitHandler('Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau.'),
});

/**
 * Login Limiter: strictly keys by IP + normalized email.
 * Allows at most 10 attempts per 15 minutes per IP:Email pair.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : 'anonymous';
    return `${req.ip}:${email}`;
  },
  handler: createRateLimitHandler('Quá nhiều lần thử đăng nhập không thành công. Vui lòng thử lại sau 15 phút.', 'LOGIN_RATE_LIMITED'),
});

/**
 * Register Limiter: keys by IP, max 10 registrations per hour.
 */
const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: createRateLimitHandler('Bạn đã đăng ký quá số lần cho phép trong một khoảng thời gian. Vui lòng thử lại sau.', 'REGISTER_RATE_LIMITED'),
});

/**
 * Forgot / Reset Password Limiter: keys by IP + email, max 5 requests per 15 minutes.
 */
const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : 'anonymous';
    return `${req.ip}:${email}`;
  },
  handler: createRateLimitHandler('Quá nhiều yêu cầu khôi phục mật khẩu. Vui lòng thử lại sau 15 phút.', 'PASSWORD_RESET_RATE_LIMITED'),
});

/**
 * Chatbot Limiter: max 30 requests per minute per IP / User.
 */
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip}`;
  },
  handler: createRateLimitHandler('Bạn đang gửi câu hỏi quá nhanh. Vui lòng đợi trong giây lát.', 'CHAT_RATE_LIMITED'),
});

/**
 * Bootstrap / Admin registration limiter: strictly max 5 requests per 15 mins per IP.
 */
const adminBootstrapRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: createRateLimitHandler('Quá nhiều yêu cầu đăng ký quản trị viên. Vui lòng thử lại sau.', 'ADMIN_REGISTER_RATE_LIMITED'),
});

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 100;
  const message = options.message || 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau.';
  const hits = new Map();

  const middleware = (req, res, next) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip;
    const now = Date.now();
    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    if (record.count > max) {
      const err = new ApiError(429, message, 'RATE_LIMIT_EXCEEDED');
      throw err;
    }

    if (typeof next === 'function') {
      next();
    }
  };

  middleware.reset = () => hits.clear();
  return middleware;
}

module.exports = {
  createRateLimiter,
  defaultRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  chatRateLimiter,
  adminBootstrapRateLimiter,
  createRateLimitHandler,
};
