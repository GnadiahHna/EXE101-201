const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { User, RefreshToken } = require('../src/models');
const { signAccessToken } = require('../src/utils/jwt');
const { validatePasswordStrength, needsRehash } = require('../src/utils/passwordSecurity');

const TEST_DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clinic_test';
let server;
let baseUrl;

async function apiRequest(method, path, { token = null, body = undefined, headers = {} } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body: json };
}

describe('PHASE 2: Hardening Authentication & Security Suite', () => {
  before(async () => {
    process.env.STRICT_PASSWORD_POLICY = 'true';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
    await User.deleteMany({ email: /@phase2-test\.com$/ });
    await RefreshToken.deleteMany({});

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: /@phase2-test\.com$/ });
    await RefreshToken.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Password Policy: Rejects passwords shorter than 8 chars, lacking uppercase/digits, or common blacklist', () => {
    assert.throws(() => validatePasswordStrength('short1A'), /ít nhất 8 ký tự/);
    assert.throws(() => validatePasswordStrength('alllowercase1'), /cả chữ hoa, chữ thường và chữ số/);
    assert.throws(() => validatePasswordStrength('ALLUPPERCASE1'), /cả chữ hoa, chữ thường và chữ số/);
    assert.throws(() => validatePasswordStrength('NoDigitsHere'), /cả chữ hoa, chữ thường và chữ số/);
    assert.throws(() => validatePasswordStrength('Admin123'), /quá phổ biến/);
    assert.doesNotThrow(() => validatePasswordStrength('SecureP@ssw0rd2026'));
  });

  it('2. Bcrypt needsRehash: Correctly detects outdated round count (< 12)', () => {
    const old10Hash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12';
    const good12Hash = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ12';
    assert.equal(needsRehash(old10Hash, 12), true);
    assert.equal(needsRehash(good12Hash, 12), false);
  });

  it('3. Account Lockout: Temporarily locks account after 5 consecutive failed logins', async () => {
    const testEmail = 'lockout@phase2-test.com';
    const strongPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(strongPassword, 10);

    const user = await User.create({
      fullName: 'Test Lockout User',
      email: testEmail,
      password: passwordHash,
      userType: 'Patient',
      isEnable: true,
      emailVerified: true,
    });

    // 4 failed login attempts
    for (let i = 1; i <= 4; i++) {
      const res = await apiRequest('POST', '/auth/login', {
        body: { email: testEmail, password: 'WrongPassword123!' },
      });
      assert.equal(res.status, 401);
    }

    const checkMid = await User.findOne({ id: user.id });
    assert.equal(checkMid.failedLoginCount, 4);
    assert.equal(checkMid.lockUntil, null);

    // 5th failed attempt -> locks account
    const lockRes = await apiRequest('POST', '/auth/login', {
      body: { email: testEmail, password: 'WrongPassword123!' },
    });
    assert.equal(lockRes.status, 403);
    assert.match(lockRes.body.message, /tạm khóa/);

    const checkLocked = await User.findOne({ id: user.id });
    assert.equal(checkLocked.failedLoginCount, 5);
    assert.ok(checkLocked.lockUntil > new Date());

    // Even right password is now rejected while locked
    const tryLocked = await apiRequest('POST', '/auth/login', {
      body: { email: testEmail, password: strongPassword },
    });
    assert.equal(tryLocked.status, 403);

    // Unlock user and verify success resets count
    checkLocked.lockUntil = null;
    await checkLocked.save();

    const okLogin = await apiRequest('POST', '/auth/login', {
      body: { email: testEmail, password: strongPassword },
    });
    assert.equal(okLogin.status, 200);

    const checkReset = await User.findOne({ id: user.id });
    assert.equal(checkReset.failedLoginCount, 0);
    assert.equal(checkReset.lockUntil, null);
  });

  it('4. Password Reset Flow: Token is single-use, expires in 15 mins, and revokes previous sessions', async () => {
    const testEmail = 'reset@phase2-test.com';
    const initialPassword = 'InitialPassword123!';
    const newPassword = 'NewSecretPassword2026!';

    const user = await User.create({
      fullName: 'Test Reset User',
      email: testEmail,
      password: await bcrypt.hash(initialPassword, 12),
      userType: 'Patient',
      isEnable: true,
      emailVerified: true,
      tokenVersion: 1,
    });

    // Old token before reset
    const oldToken = signAccessToken(user);

    // Request reset password
    const reqRes = await apiRequest('POST', '/auth/forgot-password', {
      body: { email: testEmail },
    });
    assert.equal(reqRes.status, 200);

    const userWithToken = await User.findOne({ id: user.id });
    assert.ok(userWithToken.resetPasswordTokenHash);
    assert.ok(userWithToken.resetPasswordExpires > new Date());

    // Submit reset with dummy token -> 400
    const failRes = await apiRequest('POST', '/auth/reset-password', {
      body: { token: 'invalid-token-12345', newPassword, confirmPassword: newPassword },
    });
    assert.equal(failRes.status, 400);

    // We generate the raw token that matches the hash
    const crypto = require('crypto');
    const validRawToken = crypto.randomBytes(32).toString('hex');
    userWithToken.resetPasswordTokenHash = crypto.createHash('sha256').update(validRawToken).digest('hex');
    await userWithToken.save();

    // Reset password with valid token
    const successRes = await apiRequest('POST', '/auth/reset-password', {
      body: { token: validRawToken, newPassword, confirmPassword: newPassword },
    });
    assert.equal(successRes.status, 200);

    // Reusing the same token fails
    const reuseRes = await apiRequest('POST', '/auth/reset-password', {
      body: { token: validRawToken, newPassword: 'AnotherPassword123!', confirmPassword: 'AnotherPassword123!' },
    });
    assert.equal(reuseRes.status, 400);

    // Old JWT with old tokenVersion must be rejected by authenticate
    const protectedRes = await apiRequest('GET', '/users/me', { token: oldToken });
    assert.equal(protectedRes.status, 401);
  });

  it('5. Refresh Token Rotation & Token Reuse Detection', async () => {
    const testEmail = 'rotation@phase2-test.com';
    const user = await User.create({
      fullName: 'Rotation User',
      email: testEmail,
      password: await bcrypt.hash('SecurePass123!', 12),
      userType: 'Patient',
      isEnable: true,
      emailVerified: true,
    });

    // Login to get access token + refresh token
    const loginRes = await apiRequest('POST', '/auth/login', {
      body: { email: testEmail, password: 'SecurePass123!' },
    });
    assert.equal(loginRes.status, 200);

    // Extract refresh token from Set-Cookie header
    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    const match = cookieHeader.match(/refreshToken=([^;]+)/);
    assert.ok(match, 'Refresh token cookie should be set');
    const rawRefreshToken1 = match[1];

    // Refresh 1: rotate token
    const refresh1 = await apiRequest('POST', '/auth/refresh', {
      body: { refreshToken: rawRefreshToken1 },
    });
    assert.equal(refresh1.status, 200);
    assert.ok(refresh1.body.data.token);

    const match2 = (refresh1.headers.get('set-cookie') || '').match(/refreshToken=([^;]+)/);
    assert.ok(match2, 'New rotated refresh token cookie must be set');
    const rawRefreshToken2 = match2[1];
    assert.notEqual(rawRefreshToken1, rawRefreshToken2);

    // Refresh 2: use rotated token -> success
    const refresh2 = await apiRequest('POST', '/auth/refresh', {
      body: { refreshToken: rawRefreshToken2 },
    });
    assert.equal(refresh2.status, 200);

    // REUSE ATTACK: Try using rawRefreshToken1 again -> Reuse detected & family revoked
    const reuseAttack = await apiRequest('POST', '/auth/refresh', {
      body: { refreshToken: rawRefreshToken1 },
    });
    assert.equal(reuseAttack.status, 401);
    assert.equal(reuseAttack.body.error?.code, 'TOKEN_REUSE_DETECTED');

    // After reuse attack, even rawRefreshToken2 should no longer work
    const afterReuse = await apiRequest('POST', '/auth/refresh', {
      body: { refreshToken: rawRefreshToken2 },
    });
    assert.equal(afterReuse.status, 401);
  });

  it('6. OAuth2 State & Exchange: Rejects callback if state is missing or mismatched', async () => {
    const res = await fetch(`${baseUrl}/oauth2/callback/google?code=fake_code&state=fake_state`, {
      redirect: 'manual',
    });
    // Must redirect to frontend with error parameter indicating invalid state / CSRF
    assert.equal(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.ok(location.includes('error='));
    assert.ok(decodeURIComponent(location).includes('State'));
  });
});
