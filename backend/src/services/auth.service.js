const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const { normalizeEmail, normalizePhoneNumber, normalizeGender } = require('../utils/normalizers');
const {
  signAccessToken,
  issueRefreshToken,
  hashToken,
  getRefreshTokenCookieOptions,
} = require('../utils/jwt');
const { ROLES, AUTH_PROVIDERS, AUDIT_ACTIONS } = require('../constants/enums');
const { User, RefreshToken } = require('../models');
const { recordAudit } = require('./audit.service');
const bootstrapAdminService = require('./bootstrapAdmin.service');
const { sendPasswordResetEmail, sendEmailVerificationEmail } = require('./email.service');
const { validatePasswordStrength, needsRehash } = require('../utils/passwordSecurity');
const env = require('../config/env');

const OAUTH_PASSWORD_SENTINEL = '{noop}GOOGLE_LOGIN';

/**
 * Account Lockout configuration
 */
const MAX_FAILED_ATTEMPTS = 5;
function getLockoutDurationMs(failedCount) {
  if (failedCount >= 10) return 60 * 60 * 1000; // 60 minutes
  return 15 * 60 * 1000; // 15 minutes
}

async function login({ email, password }, req = null) {
  const normalizedEmail = normalizeEmail(email);
  if (typeof password !== 'string' || !password) {
    throw new ApiError(400, 'Vui lòng nhập mật khẩu');
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    // Constant time dummy compare to mitigate user enumeration timing attacks
    await bcrypt.compare(password, '$2b$12$e80yq9wB8Y1E12YvH/71wO6c9J3M4kP3jN0T3V8A4R1R1V1X8Y1E1');
    throw new ApiError(401, 'Email hoặc mật khẩu không chính xác');
  }

  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    const minutesRemaining = Math.ceil((user.lockUntil.getTime() - now.getTime()) / (60 * 1000));
    throw new ApiError(403, `Tài khoản đã bị tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau ${minutesRemaining} phút`);
  }

  if (!user.isEnable) {
    throw new ApiError(403, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
  }

  if (env.requireEmailVerification && !user.emailVerified) {
    throw new ApiError(403, 'Vui lòng xác minh địa chỉ email trước khi đăng nhập', 'EMAIL_NOT_VERIFIED');
  }

  if (user.password === OAUTH_PASSWORD_SENTINEL) {
    throw new ApiError(400, 'Tài khoản này sử dụng đăng nhập mạng xã hội, vui lòng chọn đăng nhập Google/Facebook');
  }

  const passwordValid = await bcrypt.compare(password, user.password);

  if (!passwordValid) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    let locked = false;
    if (user.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + getLockoutDurationMs(user.failedLoginCount));
      locked = true;
    }
    await user.save();

    await recordAudit({
      actor: user,
      action: locked ? 'ACCOUNT_LOCKOUT' : 'LOGIN_FAILED',
      targetType: 'User',
      targetId: user.id,
      reason: locked
        ? `Tài khoản bị khóa tự động sau ${user.failedLoginCount} lần đăng nhập sai`
        : `Đăng nhập thất bại lần ${user.failedLoginCount}`,
      req,
    });

    if (locked) {
      const minutes = Math.ceil(getLockoutDurationMs(user.failedLoginCount) / 60000);
      throw new ApiError(403, `Tài khoản đã bị tạm khóa ${minutes} phút do nhập sai mật khẩu ${user.failedLoginCount}/${MAX_FAILED_ATTEMPTS} lần`);
    }

    const remaining = MAX_FAILED_ATTEMPTS - user.failedLoginCount;
    throw new ApiError(401, `Email hoặc mật khẩu không chính xác (Sai lần ${user.failedLoginCount}/${MAX_FAILED_ATTEMPTS}. Còn ${remaining} lần trước khi khóa)`);
  }

  // Login successful -> reset lockout counters
  if (user.failedLoginCount > 0 || user.lockUntil) {
    user.failedLoginCount = 0;
    user.lockUntil = null;
  }

  // Automatic bcrypt rehash if hash rounds are weaker than current env.bcryptRounds
  if (needsRehash(user.password, env.bcryptRounds)) {
    user.password = await bcrypt.hash(password, env.bcryptRounds);
  }

  await user.save();

  // Issue Access Token & Refresh Token
  const token = signAccessToken(user);
  const { refreshToken, expiresAt } = await issueRefreshToken(user, {
    ip: req?.ip,
    userAgent: req?.get('user-agent'),
  });

  return {
    message: 'Đăng nhập thành công',
    success: true,
    id: user.id,
    fullName: user.fullName,
    role: user.userType,
    token,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

async function registerPatient(payload, req = null) {
  const fullName = typeof payload?.fullName === 'string' ? payload.fullName.trim() : '';
  if (!fullName) {
    throw new ApiError(400, 'Họ và tên không được để trống');
  }

  const email = normalizeEmail(payload?.email);
  validatePasswordStrength(payload?.password);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'Email đã tồn tại trong hệ thống');
  }

  const hashedPassword = await bcrypt.hash(payload.password, env.bcryptRounds);
  const requireEmailVerif = env.requireEmailVerification;

  let verificationToken = null;
  let verificationTokenHash = null;
  let verificationExpires = null;

  if (requireEmailVerif) {
    verificationToken = crypto.randomBytes(32).toString('hex');
    verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }

  const created = await User.create({
    fullName,
    email,
    phoneNumber: normalizePhoneNumber(payload?.phoneNumber),
    password: hashedPassword,
    gender: normalizeGender(payload?.gender),
    userType: ROLES.PATIENT,
    isEnable: true,
    emailVerified: !requireEmailVerif,
    emailVerificationTokenHash: verificationTokenHash,
    emailVerificationExpires: verificationExpires,
    authProvider: AUTH_PROVIDERS.LOCAL,
  });

  if (requireEmailVerif && verificationToken) {
    const verifyUrl = `${env.frontendUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
    await sendEmailVerificationEmail({
      to: created.email,
      fullName: created.fullName,
      verifyUrl,
    });
  }

  return {
    id: created.id,
    email: created.email,
    emailVerified: created.emailVerified,
  };
}

async function verifyEmail({ token, email }) {
  if (!token) throw new ApiError(400, 'Mã xác minh không hợp lệ');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const query = { emailVerificationTokenHash: tokenHash };
  if (email) {
    query.email = normalizeEmail(email);
  }

  const user = await User.findOne(query);
  if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    throw new ApiError(400, 'Mã xác minh không hợp lệ hoặc đã hết hạn');
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpires = null;
  await user.save();

  return { message: 'Xác minh email thành công! Bạn có thể đăng nhập ngay bây giờ.' };
}

async function resendVerificationEmail({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.emailVerified) {
    return { message: 'Nếu email tồn tại và chưa xác minh, liên kết xác minh mới đã được gửi.' };
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const verifyUrl = `${env.frontendUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(user.email)}`;
  await sendEmailVerificationEmail({
    to: user.email,
    fullName: user.fullName,
    verifyUrl,
  });

  return { message: 'Nếu email tồn tại và chưa xác minh, liên kết xác minh mới đã được gửi.' };
}

async function registerAdmin(payload, req = null) {
  return bootstrapAdminService.bootstrapFirstAdmin(payload, req);
}

async function getBootstrapStatus() {
  return bootstrapAdminService.getBootstrapStatus();
}

async function changePassword(actor, payload, req) {
  const { oldPassword, newPassword, confirmPassword } = payload || {};
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới');
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    throw new ApiError(400, 'Mật khẩu xác nhận không khớp');
  }
  validatePasswordStrength(newPassword, 'Mật khẩu mới');

  const user = await User.findOne({ id: actor.id });
  if (!user) {
    throw new ApiError(404, 'Không tìm thấy tài khoản');
  }
  if (user.password === OAUTH_PASSWORD_SENTINEL) {
    throw new ApiError(400, 'Tài khoản đăng nhập qua mạng xã hội không hỗ trợ đổi mật khẩu trực tiếp');
  }

  const matches = await bcrypt.compare(oldPassword, user.password);
  if (!matches) {
    throw new ApiError(400, 'Mật khẩu hiện tại không chính xác');
  }

  user.password = await bcrypt.hash(newPassword, env.bcryptRounds);
  // Increment tokenVersion to revoke all active sessions
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // Revoke all refresh tokens for this user
  await RefreshToken.updateMany(
    { userId: user.id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGE,
    targetType: 'User',
    targetId: user.id,
    reason: 'Người dùng tự đổi mật khẩu (thu hồi mọi phiên cũ)',
    req,
  });

  return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
}

async function forgotPassword({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

  // Constant time mitigation against user enumeration
  if (!user || !user.isEnable || user.password === OAUTH_PASSWORD_SENTINEL) {
    // Artificial delay / dummy work
    await bcrypt.compare('dummy-check', '$2b$12$e80yq9wB8Y1E12YvH/71wO6c9J3M4kP3jN0T3V8A4R1R1V1X8Y1E1');
    return {
      message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
      success: true,
    };
  }

  // Generate 32-byte secure random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await user.save();

  const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({
    to: user.email,
    fullName: user.fullName,
    resetUrl,
  });

  return {
    message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
    success: true,
  };
}

async function resetPassword({ token, newPassword, confirmPassword }) {
  if (!token || typeof token !== 'string') {
    throw new ApiError(400, 'Mã đặt lại mật khẩu không hợp lệ');
  }
  if (!newPassword) {
    throw new ApiError(400, 'Vui lòng nhập mật khẩu mới');
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    throw new ApiError(400, 'Mật khẩu xác nhận không khớp');
  }
  validatePasswordStrength(newPassword, 'Mật khẩu mới');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!user) {
    throw new ApiError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
  }

  if (!user.isEnable) {
    throw new ApiError(403, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
  }

  user.password = await bcrypt.hash(newPassword, env.bcryptRounds);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpires = null;
  user.failedLoginCount = 0;
  user.lockUntil = null;
  // Invalidate all existing access tokens and refresh tokens
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  await RefreshToken.updateMany(
    { userId: user.id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await recordAudit({
    actor: user,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGE,
    targetType: 'User',
    targetId: user.id,
    reason: 'Người dùng đặt lại mật khẩu qua email token (thu hồi mọi phiên cũ)',
  });

  return {
    message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    success: true,
  };
}

/**
 * Refresh Token Rotation & Reuse Detection
 */
async function refreshAccessToken(rawRefreshToken, req = null) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw new ApiError(401, 'Không có refresh token hợp lệ', 'MISSING_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(rawRefreshToken);
  const tokenDoc = await RefreshToken.findOne({ tokenHash });

  if (!tokenDoc) {
    throw new ApiError(401, 'Refresh token không hợp lệ', 'INVALID_REFRESH_TOKEN');
  }

  // Token reuse detection! Token already revoked -> Compromise detected -> Revoke entire token family
  if (tokenDoc.revokedAt) {
    console.warn(`[Security Alert] Refresh token reuse detected for user ${tokenDoc.userId}, family ${tokenDoc.familyId}! Revoking family.`);
    await RefreshToken.updateMany(
      { familyId: tokenDoc.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw new ApiError(401, 'Phát hiện token bị dùng lại trái phép. Toàn bộ phiên đăng nhập đã bị hủy để đảm bảo an toàn.', 'TOKEN_REUSE_DETECTED');
  }

  // Check expiration
  if (new Date() > new Date(tokenDoc.expiresAt)) {
    throw new ApiError(401, 'Refresh token đã hết hạn, vui lòng đăng nhập lại', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await User.findOne({ id: tokenDoc.userId });
  if (!user || !user.isEnable) {
    throw new ApiError(403, 'Tài khoản không tồn tại hoặc đã bị khóa', 'ACCOUNT_LOCKED');
  }

  // Rotate: revoke current token and issue replacement token in the same family
  const newRawToken = crypto.randomBytes(32).toString('hex');
  const newHash = hashToken(newRawToken);
  const expiresInDays = env.refreshTokenExpiresInDays || 7;
  const newExpiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  tokenDoc.revokedAt = new Date();
  tokenDoc.replacedByTokenHash = newHash;
  await tokenDoc.save();

  await RefreshToken.create({
    userId: user.id,
    tokenHash: newHash,
    familyId: tokenDoc.familyId,
    expiresAt: newExpiresAt,
    ip: req?.ip,
    userAgent: req?.get('user-agent'),
  });

  const accessToken = signAccessToken(user);

  return {
    accessToken,
    refreshToken: newRawToken,
    expiresAt: newExpiresAt,
    user: {
      id: user.id,
      fullName: user.fullName,
      role: user.userType,
    },
  };
}

async function logout(rawRefreshToken) {
  if (rawRefreshToken && typeof rawRefreshToken === 'string') {
    const tokenHash = hashToken(rawRefreshToken);
    await RefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
  }
  return { message: 'Đăng xuất thành công' };
}

async function logoutAll(userId) {
  const numId = Number(userId);
  if (Number.isSafeInteger(numId) && numId > 0) {
    await RefreshToken.updateMany({ userId: numId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await User.updateOne({ id: numId }, { $inc: { tokenVersion: 1 } });
  }
  return { message: 'Đã đăng xuất khỏi tất cả thiết bị thành công' };
}

module.exports = {
  OAUTH_PASSWORD_SENTINEL,
  login,
  registerPatient,
  verifyEmail,
  resendVerificationEmail,
  registerAdmin,
  getBootstrapStatus,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logout,
  logoutAll,
};
