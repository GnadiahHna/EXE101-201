const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const { User } = require('../models');

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Build flexible query to find User by String ID, ObjectId, numeric ID, or email.
 * @param {string|number} rawId
 * @returns {Record<string, any>}
 */
function buildUserQuery(rawId) {
  const str = String(rawId).trim();
  const num = Number(str);
  const conditions = [];

  if (Number.isSafeInteger(num) && num > 0) {
    conditions.push({ id: num });
  }
  if (mongoose.Types.ObjectId.isValid(str)) {
    conditions.push({ _id: new mongoose.Types.ObjectId(str) });
  }
  if (str.includes('@')) {
    conditions.push({ email: str.toLowerCase() });
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

/**
 * Require a valid Bearer JWT and ensure the user exists and is active.
 * Guarantees String ID compliance and strict token validation.
 */
async function authenticate(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    throw new ApiError(401, 'Vui lòng đăng nhập để tiếp tục', 'MISSING_TOKEN');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'TOKEN_EXPIRED');
    }
    throw new ApiError(401, 'Token xác thực không hợp lệ', 'INVALID_TOKEN');
  }

  const rawUserId = decoded.userId;
  const numUserId = Number(rawUserId);
  if (!Number.isSafeInteger(numUserId) || numUserId <= 0) {
    throw new ApiError(401, 'Thông tin định danh trong token không hợp lệ', 'MALFORMED_TOKEN_PAYLOAD');
  }

  const user = await User.findOne({ id: numUserId });
  if (!user) {
    throw new ApiError(401, 'Tài khoản không tồn tại', 'USER_NOT_FOUND');
  }

  if (!user.isEnable) {
    throw new ApiError(403, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên', 'ACCOUNT_LOCKED');
  }

  // Token version verification: if user changed password, logged out from all devices, or was revoked
  const expectedVersion = user.tokenVersion || 0;
  const tokenVersion = decoded.tokenVersion || 0;
  if (tokenVersion !== expectedVersion) {
    throw new ApiError(401, 'Phiên đăng nhập đã bị vô hiệu hóa do thay đổi bảo mật', 'TOKEN_REVOKED');
  }

  req.user = user;
  req.authPrincipal = {
    userId: String(user.id || user._id),
    role: user.userType,
    email: user.email,
    fullName: user.fullName,
  };
  next();
}

/**
 * Attach `req.user` if a valid Bearer token is provided; otherwise proceed as Guest.
 */
async function optionalAuthenticate(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const numUserId = Number(decoded.userId);
    if (Number.isSafeInteger(numUserId) && numUserId > 0) {
      const user = await User.findOne({ id: numUserId });
      const expectedVersion = user?.tokenVersion || 0;
      const tokenVersion = decoded.tokenVersion || 0;
      if (user && user.isEnable && tokenVersion === expectedVersion) {
        req.user = user;
        req.authPrincipal = {
          userId: String(user.id || user._id),
          role: user.userType,
          email: user.email,
          fullName: user.fullName,
        };
      }
    }
  } catch {
    // Ignore invalid optional tokens on public endpoints
  }
  return next();
}

/**
 * Deny-by-default Role Guard:
 * Only allows requests where the authenticated user possesses one of the allowed roles.
 *
 * @param  {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireRoles(...allowedRoles) {
  const roles = allowedRoles.flat().filter(Boolean);

  return (req, _res, next) => {
    // Deny-by-default if no user attached
    if (!req.user) {
      throw new ApiError(401, 'Vui lòng đăng nhập để tiếp tục', 'UNAUTHENTICATED');
    }

    // Deny-by-default if route has no allowed roles configured
    if (roles.length === 0) {
      throw new ApiError(403, 'Endpoint bị khóa theo chính sách deny-by-default', 'DENY_BY_DEFAULT');
    }

    const userRole = req.user.userType;
    if (!roles.includes(userRole)) {
      throw new ApiError(403, 'Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN_ROLE');
    }
    next();
  };
}

/**
 * Decorator helper for Method Decorators or Route Handlers:
 * Usage:
 *   const handler = Roles('Admin', 'Doctor')(async (req, res) => { ... });
 */
function Roles(...allowedRoles) {
  const guard = requireRoles(...allowedRoles);

  return function (target, propertyKey, descriptor) {
    if (descriptor && typeof descriptor.value === 'function') {
      const originalMethod = descriptor.value;
      descriptor.value = function (req, res, next) {
        guard(req, res, () => originalMethod.apply(this, [req, res, next]));
      };
      return descriptor;
    }
    // Express handler wrapper pattern
    if (typeof target === 'function') {
      return (req, res, next) => guard(req, res, () => target(req, res, next));
    }
    return guard;
  };
}

/**
 * Extract authenticated Principal from request:
 * Guarantees userId is string and not forged from client body/query.
 *
 * @param {import('express').Request} req
 * @returns {{ userId: string, role: string, email: string, fullName: string, raw: object }}
 */
function getPrincipal(req) {
  if (!req?.user) {
    throw new ApiError(401, 'Vui lòng đăng nhập để tiếp tục', 'UNAUTHENTICATED');
  }

  const userId = String(req.user.id || req.user._id);
  const role = req.user.userType;
  const email = req.user.email;
  const fullName = req.user.fullName;

  return {
    userId,
    role,
    email,
    fullName,
    raw: req.user,
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRoles,
  authorize: requireRoles, // Backward-compatibility alias
  Roles,
  getPrincipal,
};
