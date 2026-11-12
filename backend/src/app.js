const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const oauthRoutes = require('./routes/oauth.routes');
const { notFound, errorHandler, getTraceId } = require('./middlewares/error.middleware');
const { defaultRateLimiter } = require('./middlewares/rateLimiter.middleware');
const { httpLogger } = require('./middlewares/logger.middleware');

const app = express();

// Trust proxy configured from env (loopback, linklocal, etc.), do NOT parse X-Forwarded-For manually
app.set('trust proxy', env.trustProxy || true);

// Helmet security headers (CSP, Referrer-Policy, nosniff, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // Allows cross-origin image loads for avatars
  }),
);

// Permissions-Policy header
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(self)',
  );
  next();
});

// Structured JSON logging
if (env.nodeEnv !== 'test') {
  app.use(httpLogger);
}

// Native mobile apps send no Origin header, so requests without one are allowed.
// `credentials: true` is required because Frontend OAuth2/logout uses `credentials: 'include'`.
const isAllowedDevOrigin = (origin) => {
  if (!origin) return true;
  if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return true;
  if (!env.isProduction) {
    try {
      const { hostname } = new URL(origin);
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedDevOrigin(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);

// Restrict JSON payload size to 100kb, avoid global express.text
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser(env.jwtSecret));

// Trace ID correlation
app.use((req, res, next) => {
  const traceId = getTraceId(req);
  res.setHeader('X-Trace-Id', traceId);
  next();
});

// Reusable user/IP rate limiter
app.use(defaultRateLimiter);

// Static uploaded files (mounted at both `/uploads` and `/images/file/uploads` per `web/src/api/image.ts`)
// Hardened with nosniff and restrictive CSP to prevent executing uploaded files
const staticSecurityHeaders = (res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
};

app.use(
  '/uploads',
  express.static(env.uploadsDir, {
    setHeaders: staticSecurityHeaders,
  })
);
app.use(
  '/images/file/uploads',
  express.static(env.uploadsDir, {
    setHeaders: staticSecurityHeaders,
  })
);

app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to Clinic Booking API' });
});

// OAuth2 Social Login endpoints (Google & Facebook)
app.use('/oauth2', oauthRoutes);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
