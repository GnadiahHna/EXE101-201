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
 * Validates password strength (Đã nới lỏng cho môi trường dev/test):
 * - Chỉ cần tối thiểu 6 ký tự
 */
function validatePasswordStrength(password, fieldLabel = 'Mật khẩu') {
  if (typeof password !== 'string' || password.length < 6) {
    throw new ApiError(400, `${fieldLabel} phải có ít nhất 6 ký tự`);
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

