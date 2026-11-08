const https = require('https');
const env = require('../config/env');
const { User } = require('../models');
const { signAccessToken } = require('../utils/jwt');
const { ROLES, AUTH_PROVIDERS, GENDERS } = require('../constants/enums');
const ApiError = require('../utils/ApiError');

const OAUTH_PASSWORD_SENTINEL = '{noop}GOOGLE_LOGIN';

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
        } catch (err) {
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
 * Handle Google & Facebook authorization redirects
 */
const authorize = (provider) => {
  return (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${env.port}`;
    const redirectUri = `${protocol}://${host}/oauth2/callback/${provider}`;

    if (provider === 'google') {
      if (!env.googleClientId) {
        // Return informative error redirect to FE login page
        return res.redirect(
          `${env.frontendUrl}/login?error=${encodeURIComponent(
            'Chức năng đăng nhập Google chưa được cấu hình GOOGLE_CLIENT_ID trên hệ thống.'
          )}`
        );
      }
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        env.googleClientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=select_account`;
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
      )}&scope=email,public_profile`;
      return res.redirect(fbAuthUrl);
    }

    return res.redirect(
      `${env.frontendUrl}/login?error=${encodeURIComponent('Nhà cung cấp OAuth không hợp lệ')}`
    );
  };
};

/**
 * Exchange Google authorization code for user info
 */
async function getGoogleUser(code, redirectUri) {
  const tokenPayload = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString();

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

  return {
    email: userInfo.email,
    fullName: userInfo.name || userInfo.email.split('@')[0],
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

  const email = profile.email || `${profile.id}@facebook.local`;
  return {
    email,
    fullName: profile.name || `Facebook User ${profile.id}`,
    provider: AUTH_PROVIDERS.FACEBOOK,
  };
}

/**
 * Handle OAuth2 callback from Google or Facebook
 */
const callback = (provider) => {
  return async (req, res) => {
    try {
      const { code, error, error_description } = req.query;

      if (error || !code) {
        const errorMsg = error_description || error || 'Xác thực tài khoản thất bại';
        return res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`);
      }

      const protocol = req.protocol || 'http';
      const host = req.get('host') || `localhost:${env.port}`;
      const redirectUri = `${protocol}://${host}/oauth2/callback/${provider}`;

      let oauthUser = null;
      if (provider === 'google') {
        oauthUser = await getGoogleUser(code, redirectUri);
      } else if (provider === 'facebook') {
        oauthUser = await getFacebookUser(code, redirectUri);
      } else {
        throw new Error('Unsupported OAuth provider');
      }

      if (!oauthUser || !oauthUser.email) {
        throw new Error('Không thể lấy thông tin email từ tài khoản mạng xã hội');
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
      } else {
        // Create new Patient account for the OAuth user
        user = await User.create({
          email: normalizedEmail,
          fullName: oauthUser.fullName,
          password: OAUTH_PASSWORD_SENTINEL,
          userType: ROLES.PATIENT,
          gender: GENDERS.OTHER,
          authProvider: oauthUser.provider,
          isEnable: true,
        });
      }

      const token = signAccessToken(user);

      // Redirect to Frontend OAuth2 callback page: /oauth2/callback?token=...
      return res.redirect(`${env.frontendUrl}/oauth2/callback?token=${encodeURIComponent(token)}`);
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

module.exports = {
  authorize,
  callback,
};
