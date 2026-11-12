const crypto = require('crypto');
const https = require('https');
const env = require('../config/env');
const { User } = require('../models');
const { signAccessToken, issueRefreshToken, getRefreshTokenCookieOptions } = require('../utils/jwt');
const { ROLES, AUTH_PROVIDERS, GENDERS } = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');

const OAUTH_PASSWORD_SENTINEL = '{noop}GOOGLE_LOGIN';

// In-memory store for 60-second exchange codes: exchangeCode -> { user, expiresAt }
const exchangeCodes = new Map();

// Periodic sweep
setInterval(() => {
  const now = Date.now();
  for (const [code, val] of exchangeCodes.entries()) {
    if (now > val.expiresAt) {
      exchangeCodes.delete(code);
    }
  }
}, 30000).unref();

/**
 * Base64URL encode buffer
 */
function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Helper to make HTTPS requests with JSON response
 */
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error_description || parsed.error?.message || parsed.error || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch {
          reject(new Error(`Failed to parse JSON response: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Sign OAuth2 state using HMAC-SHA256 to prevent CSRF
 */
function signState(rawState) {
  const hmac = crypto.createHmac('sha256', env.jwtSecret).update(rawState).digest('hex');
  return `${rawState}.${hmac}`;
}

function verifyState(signedState) {
  if (!signedState || typeof signedState !== 'string') return null;
  const parts = signedState.split('.');
  if (parts.length !== 2) return null;
  const [rawState, expectedHmac] = parts;
  const actualHmac = crypto.createHmac('sha256', env.jwtSecret).update(rawState).digest('hex');
  if (crypto.timingSafeEqual(Buffer.from(actualHmac), Buffer.from(expectedHmac))) {
    return rawState;
  }
  return null;
}

/**
 * Handle Google & Facebook authorization redirects with State & PKCE
 */
const authorize = (provider) => {
  return (req, res) => {
    const rawState = crypto.randomBytes(16).toString('hex');
    const signedState = signState(rawState);

    // Save signed state in secure cookie
    res.cookie(`oauth_${provider}_state`, signedState, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'Lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const redirectUri = `${env.oauthRedirectBaseUrl}/oauth2/callback/${provider}`;

    if (provider === 'google') {
      if (!env.googleClientId) {
        return res.redirect(
          `${env.frontendUrl}/login?error=${encodeURIComponent(
            'Chức năng đăng nhập Google chưa được cấu hình GOOGLE_CLIENT_ID trên hệ thống.'
          )}`
        );
      }

      // Generate PKCE code_verifier and code_challenge
      const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
      const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());

      res.cookie('oauth_google_verifier', codeVerifier, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'Lax',
        maxAge: 10 * 60 * 1000,
      });

      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        env.googleClientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=select_account&state=${encodeURIComponent(
        signedState
      )}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;

      return res.redirect(googleAuthUrl);
    }

    if (provider === 'facebook') {
      if (!env.facebookClientId) {
        return res.redirect(
          `${env.frontendUrl}/login?error=${encodeURIComponent(
            'Chức năng đăng nhập Facebook chưa được cấu hình FACEBOOK_CLIENT_ID trên hệ thống.'
          )}`
        );
      }
      const fbAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
        env.facebookClientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&scope=email,public_profile&state=${encodeURIComponent(signedState)}`;

      return res.redirect(fbAuthUrl);
    }

    return res.redirect(
      `${env.frontendUrl}/login?error=${encodeURIComponent('Nhà cung cấp OAuth không hợp lệ')}`
    );
  };
};

/**
 * Exchange Google authorization code for verified user info
 */
async function getGoogleUser(code, redirectUri, codeVerifier) {
  const bodyParams = {
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  if (codeVerifier) {
    bodyParams.code_verifier = codeVerifier;
  }

  const tokenPayload = new URLSearchParams(bodyParams).toString();

  const tokenData = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(tokenPayload),
    },
    body: tokenPayload,
  });

  const accessToken = tokenData.access_token;
  const userInfo = await fetchJson('https://www.googleapis.com/oauth2/v2/userinfo', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Verify email verified status
  const isVerified = userInfo.verified_email === true || userInfo.email_verified === true;

  return {
    email: userInfo.email,
    fullName: userInfo.name || userInfo.email.split('@')[0],
    isVerified,
    provider: AUTH_PROVIDERS.GOOGLE,
  };
}

/**
 * Exchange Facebook authorization code for user info
 */
async function getFacebookUser(code, redirectUri) {
  const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(
    env.facebookClientId
  )}&client_secret=${encodeURIComponent(
    env.facebookClientSecret
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;

  const tokenData = await fetchJson(tokenUrl, { method: 'GET' });
  const accessToken = tokenData.access_token;

  const profileUrl = `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(
    accessToken
  )}`;
  const profile = await fetchJson(profileUrl, { method: 'GET' });

  if (!profile.email) {
    throw new ApiError(400, 'Tài khoản Facebook chưa có email xác thực. Vui lòng cập nhật email trên Facebook hoặc sử dụng tài khoản khác.');
  }

  return {
    email: profile.email,
    fullName: profile.name || `Facebook User ${profile.id}`,
    isVerified: true,
    provider: AUTH_PROVIDERS.FACEBOOK,
  };
}

/**
 * Handle OAuth2 callback from Google or Facebook
 */
const callback = (provider) => {
  return async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error || !code) {
        const errorMsg = error_description || error || 'Xác thực tài khoản thất bại';
        return res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`);
      }

      // 1. Verify CSRF State
      const cookieState = req.cookies?.[`oauth_${provider}_state`];
      const validState = verifyState(state);
      if (!validState || state !== cookieState) {
        return res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent('Xác thực thất bại: State không hợp lệ hoặc đã hết hạn (CSRF detected)')}`);
      }
      res.clearCookie(`oauth_${provider}_state`);

      const redirectUri = `${env.oauthRedirectBaseUrl}/oauth2/callback/${provider}`;

      let oauthUser = null;
      if (provider === 'google') {
        const codeVerifier = req.cookies?.oauth_google_verifier;
        res.clearCookie('oauth_google_verifier');
        oauthUser = await getGoogleUser(code, redirectUri, codeVerifier);
      } else if (provider === 'facebook') {
        oauthUser = await getFacebookUser(code, redirectUri);
      } else {
        throw new Error('Unsupported OAuth provider');
      }

      if (!oauthUser || !oauthUser.email) {
        throw new Error('Không thể lấy thông tin email từ tài khoản mạng xã hội');
      }

      if (provider === 'google' && !oauthUser.isVerified) {
        throw new Error('Email Google của bạn chưa được xác thực (unverified email).');
      }

      const normalizedEmail = oauthUser.email.toLowerCase().trim();
      let user = await User.findOne({ email: normalizedEmail });

      if (user) {
        if (!user.isEnable) {
          return res.redirect(
            `${env.frontendUrl}/login?error=${encodeURIComponent(
              'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên'
            )}`
          );
        }

        // Security: Do NOT auto-link social login to staff accounts (Admin, Doctor, Receptionist)
        if (user.userType !== ROLES.PATIENT) {
          return res.redirect(
            `${env.frontendUrl}/login?error=${encodeURIComponent(
              'Không thể liên kết mạng xã hội với tài khoản nhân viên y tế / quản trị viên. Vui lòng đăng nhập bằng mật khẩu.'
            )}`
          );
        }
      } else {
        // Create new Patient account
        user = await User.create({
          email: normalizedEmail,
          fullName: oauthUser.fullName,
          password: OAUTH_PASSWORD_SENTINEL,
          userType: ROLES.PATIENT,
          gender: GENDERS.OTHER,
          authProvider: oauthUser.provider,
          emailVerified: true,
          isEnable: true,
        });
      }

      // Generate single-use exchange code (lifetime 60 seconds)
      const exchangeCode = crypto.randomBytes(24).toString('hex');
      exchangeCodes.set(exchangeCode, {
        userId: user.id,
        expiresAt: Date.now() + 60 * 1000,
      });

      // Redirect without exposing JWT token in URL query
      return res.redirect(`${env.frontendUrl}/oauth2/callback?code=${exchangeCode}`);
    } catch (err) {
      console.error(`OAuth2 ${provider} error:`, err);
      return res.redirect(
        `${env.frontendUrl}/login?error=${encodeURIComponent(
          err.message || 'Đăng nhập mạng xã hội thất bại'
        )}`
      );
    }
  };
};

/**
 * Exchange single-use code for access token & refresh token cookie
 */
const exchangeToken = async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    throw new ApiError(400, 'Mã xác thực không hợp lệ', 'INVALID_EXCHANGE_CODE');
  }

  const record = exchangeCodes.get(code);
  if (!record || Date.now() > record.expiresAt) {
    exchangeCodes.delete(code);
    throw new ApiError(400, 'Mã xác thực không hợp lệ hoặc đã hết hạn', 'EXPIRED_EXCHANGE_CODE');
  }

  exchangeCodes.delete(code); // Single-use consumption

  const user = await User.findOne({ id: record.userId });
  if (!user || !user.isEnable) {
    throw new ApiError(403, 'Tài khoản không tồn tại hoặc đã bị khóa', 'ACCOUNT_LOCKED');
  }

  const token = signAccessToken(user);
  const { refreshToken } = await issueRefreshToken(user, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

  return sendSuccess(res, {
    message: 'Xác thực thành công',
    data: {
      token,
      id: user.id,
      fullName: user.fullName,
      role: user.userType,
    },
  });
};

module.exports = {
  authorize,
  callback,
  exchangeToken,
};
