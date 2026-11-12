const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { RefreshToken } = require('../models');

/**
 * Access token: 15-minute lifetime.
 * Strictly includes userId, role, and tokenVersion.
 */
function signAccessToken(user) {
  const payload = {
    userId: user.id,
    role: user.userType,
    tokenVersion: user.tokenVersion || 0,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn || '15m' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/**
 * Generate a cryptographically secure random refresh token (64 hex chars = 32 bytes).
 */
function generateRefreshTokenString() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash refresh token with SHA-256 before storing in DB.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue new RefreshToken record and return raw token string.
 */
async function issueRefreshToken(user, { ip = null, userAgent = null, familyId = null } = {}) {
  const rawToken = generateRefreshTokenString();
  const tokenHash = hashToken(rawToken);
  const famId = familyId || crypto.randomUUID();
  const expiresInDays = env.refreshTokenExpiresInDays || 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId: user.id,
    tokenHash,
    familyId: famId,
    expiresAt,
    ip,
    userAgent,
  });

  return {
    refreshToken: rawToken,
    familyId: famId,
    expiresAt,
  };
}

/**
 * Cookie options for Refresh Token.
 */
function getRefreshTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'Lax',
    path: '/api/auth',
    maxAge: (env.refreshTokenExpiresInDays || 7) * 24 * 60 * 60 * 1000,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenString,
  hashToken,
  issueRefreshToken,
  getRefreshTokenCookieOptions,
};
