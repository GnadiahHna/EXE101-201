const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const oauthRoutes = require('./routes/oauth.routes');
const { notFound, errorHandler, getTraceId } = require('./middlewares/error.middleware');
const { defaultRateLimiter } = require('./middlewares/rateLimiter.middleware');

const app = express();

// Native mobile apps send no Origin header, so requests without one are allowed.
// `credentials: true` is required because Frontend OAuth2/logout uses `credentials: 'include'`.
const isAllowedDevOrigin = (origin) => {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));

// Trace ID correlation
app.use((req, res, next) => {
  const traceId = getTraceId(req);
  res.setHeader('X-Trace-Id', traceId);
  next();
});

// Reusable user/IP rate limiter
app.use(defaultRateLimiter);

// Static uploaded files (mounted at both `/uploads` and `/images/file/uploads` per `web/src/api/image.ts`)
app.use('/uploads', express.static(env.uploadsDir));
app.use('/images/file/uploads', express.static(env.uploadsDir));

app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to Clinic Booking API' });
});

// OAuth2 Social Login endpoints (Google & Facebook)
app.use('/oauth2', oauthRoutes);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
