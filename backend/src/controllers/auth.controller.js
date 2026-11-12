const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');
const { getRefreshTokenCookieOptions } = require('../utils/jwt');

const login = async (req, res) => {
  const result = await authService.login(req.body, req);

  // Set httpOnly Refresh Token cookie
  if (result.refreshToken) {
    res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());
  }

  return sendSuccess(res, {
    message: 'Đăng nhập thành công',
    data: {
      id: result.id,
      fullName: result.fullName,
      role: result.role,
      token: result.token,
    },
  });
};

const register = async (req, res) => {
  const result = await authService.registerPatient(req.body, req);
  return sendSuccess(res, {
    statusCode: 201,
    message: result.emailVerified
      ? 'Đăng ký tài khoản thành công'
      : 'Đăng ký tài khoản thành công! Vui lòng kiểm tra email để xác minh tài khoản.',
    data: result,
  });
};

const verifyEmail = async (req, res) => {
  const { token, email } = req.query;
  const result = await authService.verifyEmail({ token, email });
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const resendVerification = async (req, res) => {
  const result = await authService.resendVerificationEmail(req.body);
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const refresh = async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  const result = await authService.refreshAccessToken(rawRefreshToken, req);

  // Set rotated refresh token cookie
  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

  return sendSuccess(res, {
    message: 'Làm mới token thành công',
    data: {
      token: result.accessToken,
      user: result.user,
    },
  });
};

const logout = async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  await authService.logout(rawRefreshToken);

  res.clearCookie('refreshToken', {
    httpOnly: true,
    path: '/api/auth',
  });

  return sendSuccess(res, { message: 'Đăng xuất thành công' });
};

const logoutAll = async (req, res) => {
  await authService.logoutAll(req.user.id);

  res.clearCookie('refreshToken', {
    httpOnly: true,
    path: '/api/auth',
  });

  return sendSuccess(res, { message: 'Đã đăng xuất khỏi tất cả thiết bị' });
};

const registerAdmin = async (req, res) => {
  const result = await authService.registerAdmin(req.body, req);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Khởi tạo tài khoản Admin thành công',
    data: result,
  });
};

const getBootstrapStatus = async (_req, res) => {
  const result = await authService.getBootstrapStatus();
  return sendSuccess(res, {
    message: 'Trạng thái cơ chế khởi tạo Admin ban đầu',
    data: result,
  });
};

const changePassword = async (req, res) => {
  const result = await authService.changePassword(req.user, req.body, req);
  res.clearCookie('refreshToken', { httpOnly: true, path: '/api/auth' });
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const forgotPassword = async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const resetPassword = async (req, res) => {
  const result = await authService.resetPassword(req.body);
  res.clearCookie('refreshToken', { httpOnly: true, path: '/api/auth' });
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const oauth2Logout = async (req, res) => {
  return logout(req, res);
};

module.exports = {
  login,
  register,
  verifyEmail,
  resendVerification,
  refresh,
  logout,
  logoutAll,
  registerAdmin,
  getBootstrapStatus,
  changePassword,
  forgotPassword,
  resetPassword,
  oauth2Logout,
};
