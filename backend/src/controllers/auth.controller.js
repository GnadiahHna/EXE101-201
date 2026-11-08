const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');

const login = async (req, res) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, {
    message: 'Đăng nhập thành công',
    data: result,
  });
};

const register = async (req, res) => {
  const result = await authService.registerPatient(req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Đăng ký tài khoản thành công',
    data: result,
  });
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
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

const oauth2Logout = async (_req, res) => {
  return sendSuccess(res, { message: 'Đăng xuất thành công' });
};

module.exports = {
  login,
  register,
  registerAdmin,
  getBootstrapStatus,
  changePassword,
  forgotPassword,
  resetPassword,
  oauth2Logout,
};

