const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

let commonPasswordsSet = null;

function getCommonPasswords() {
  if (!commonPasswordsSet) {
    try {
      const filePath = path.join(__dirname, '../config/common-passwords.txt');
      const content = fs.readFileSync(filePath, 'utf8');
      const list = content.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      commonPasswordsSet = new Set(list);
    } catch {
      commonPasswordsSet = new Set(['123456', '12345678', 'password', 'admin123', 'clinic123']);
    }
  }
  return commonPasswordsSet;
}

/**
 * Validates password strength:
 * - At least 8 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains digit
 * - Not in common passwords blacklist
 */
function validatePasswordStrength(password, fieldLabel = 'Mật khẩu') {
  if (typeof password !== 'string' || password.length < 8) {
    throw new ApiError(400, `${fieldLabel} phải có ít nhất 8 ký tự`);
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasDigit) {
    throw new ApiError(400, `${fieldLabel} phải chứa cả chữ hoa, chữ thường và chữ số`);
  }

  const commonSet = getCommonPasswords();
  if (commonSet.has(password.toLowerCase())) {
    throw new ApiError(400, `${fieldLabel} quá phổ biến và dễ đoán. Vui lòng chọn mật khẩu an toàn hơn`);
  }
}

/**
 * Checks if a bcrypt hash was computed with fewer rounds than the configured BCRYPT_ROUNDS.
 * Format of bcrypt hash: $2a$rounds$salt_and_hash or $2b$rounds$...
 */
function needsRehash(hash, targetRounds = env.bcryptRounds) {
  if (!hash || typeof hash !== 'string') return false;
  const match = hash.match(/^\$2[aby]?\$(\d+)\$/);
  if (!match) return false;
  const currentRounds = parseInt(match[1], 10);
  return currentRounds < targetRounds;
}

module.exports = {
  validatePasswordStrength,
  needsRehash,
};

