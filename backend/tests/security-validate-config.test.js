const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/config/validateConfig');

describe('Security Config Validation (Fail-Fast)', () => {
  it('Production boot fails if JWT_SECRET is missing', () => {
    const invalidEnv = {
      NODE_ENV: 'production',
      JOIN_TOKEN_SECRET: 'a'.repeat(35),
      VNP_TMN_CODE: 'TMNCODE',
      VNP_HASH_SECRET: 'HASHSECRET',
      VNP_RETURN_URL: 'https://example.com/return',
      VNP_IPN_URL: 'https://example.com/ipn',
      ADMIN_BOOTSTRAP_REQUIRE_SECRET: 'true',
      ADMIN_BOOTSTRAP_SECRET: 'admin_secret_123',
      CORS_ORIGINS: 'https://clinic.example.com',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'test@clinic.com',
      SMTP_PASS: 'password',
    };

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = (code) => {
      exitCalled = true;
      assert.equal(code, 1);
      throw new Error(`EXIT_${code}`);
    };

    try {
      assert.throws(() => validateConfig(invalidEnv), /EXIT_1/);
      assert.equal(exitCalled, true);
    } finally {
      process.exit = origExit;
    }
  });

  it('Production boot fails if VNP_HASH_SECRET is missing', () => {
    const invalidEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secret_jwt_key_that_is_long_enough_123',
      JOIN_TOKEN_SECRET: 'a'.repeat(35),
      VNP_TMN_CODE: 'TMNCODE',
      // VNP_HASH_SECRET missing
      VNP_RETURN_URL: 'https://example.com/return',
      VNP_IPN_URL: 'https://example.com/ipn',
      ADMIN_BOOTSTRAP_REQUIRE_SECRET: 'true',
      ADMIN_BOOTSTRAP_SECRET: 'admin_secret_123',
      CORS_ORIGINS: 'https://clinic.example.com',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'test@clinic.com',
      SMTP_PASS: 'password',
    };

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = (code) => {
      exitCalled = true;
      throw new Error(`EXIT_${code}`);
    };

    try {
      assert.throws(() => validateConfig(invalidEnv), /EXIT_1/);
      assert.equal(exitCalled, true);
    } finally {
      process.exit = origExit;
    }
  });

  it('Production boot fails if CORS_ORIGINS contains wildcard *', () => {
    const invalidEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secret_jwt_key_that_is_long_enough_123',
      JOIN_TOKEN_SECRET: 'different_super_secret_key_long_enough_456',
      VNP_TMN_CODE: 'TMNCODE',
      VNP_HASH_SECRET: 'HASHSECRET',
      VNP_RETURN_URL: 'https://example.com/return',
      VNP_IPN_URL: 'https://example.com/ipn',
      ADMIN_BOOTSTRAP_REQUIRE_SECRET: 'true',
      ADMIN_BOOTSTRAP_SECRET: 'admin_secret_123',
      CORS_ORIGINS: 'https://clinic.example.com,*',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'test@clinic.com',
      SMTP_PASS: 'password',
    };

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = (code) => {
      exitCalled = true;
      throw new Error(`EXIT_${code}`);
    };

    try {
      assert.throws(() => validateConfig(invalidEnv), /EXIT_1/);
      assert.equal(exitCalled, true);
    } finally {
      process.exit = origExit;
    }
  });

  it('Production boot passes when all required secrets are securely configured', () => {
    const validEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_production_jwt_secret_key_1234567890',
      JOIN_TOKEN_SECRET: 'completely_different_join_token_secret_0987654321',
      VNP_TMN_CODE: 'TMNCODE_PROD',
      VNP_HASH_SECRET: 'HASHSECRET_PROD_123456',
      VNP_RETURN_URL: 'https://clinic.example.com/payment/return',
      VNP_IPN_URL: 'https://api.clinic.example.com/api/payment/vnpay-ipn',
      ADMIN_BOOTSTRAP_REQUIRE_SECRET: 'true',
      ADMIN_BOOTSTRAP_SECRET: 'super_admin_secret_bootstrap',
      CORS_ORIGINS: 'https://clinic.example.com,https://admin.clinic.example.com',
      SMTP_HOST: 'smtp.sendgrid.net',
      SMTP_USER: 'apikey',
      SMTP_PASS: 'SG.123456',
    };

    const res = validateConfig(validEnv);
    assert.equal(res, true);
  });
});

