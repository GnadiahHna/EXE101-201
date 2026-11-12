const pino = require('pino');
const pinoHttp = require('pino-http');
const env = require('../config/env');
const { getTraceId } = require('./error.middleware');

/**
 * Structured Logger using Pino.
 * Redacts sensitive fields (PII, tokens, secrets, cookies) from stdout/logs.
 */
const logger = pino({
  level: env.isProduction ? 'info' : (process.env.LOG_LEVEL || 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'newPassword',
      'currentPassword',
      'token',
      '*.token',
      'refreshToken',
      'accessToken',
      'email',
      'phoneNumber',
      'phone',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => getTraceId(req),
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = {
  logger,
  httpLogger,
};
