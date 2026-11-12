/**
 * Validate configuration fail-fast module.
 * Runs before server startup to ensure production environments do not boot with insecure or missing configs.
 */

function validateConfig(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  const errors = [];

  // Check common validation
  const jwtSecret = env.JWT_SECRET ? String(env.JWT_SECRET).trim() : '';
  const joinTokenSecret = env.JOIN_TOKEN_SECRET ? String(env.JOIN_TOKEN_SECRET).trim() : '';

  if (nodeEnv === 'production') {
    // 1. JWT_SECRET >= 32 chars and no default placeholders
    if (!jwtSecret) {
      errors.push('JWT_SECRET is required in production.');
    } else if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production.');
    } else if (
      jwtSecret.toLowerCase().includes('dev_secret') ||
      jwtSecret.toLowerCase().includes('change_me') ||
      jwtSecret.toLowerCase().includes('default')
    ) {
      errors.push('JWT_SECRET must not contain default development phrases in production.');
    }

    // 2. JOIN_TOKEN_SECRET distinct from JWT_SECRET and >= 32 chars
    if (!joinTokenSecret) {
      errors.push('JOIN_TOKEN_SECRET is required in production.');
    } else if (joinTokenSecret.length < 32) {
      errors.push('JOIN_TOKEN_SECRET must be at least 32 characters in production.');
    } else if (joinTokenSecret === jwtSecret) {
      errors.push('JOIN_TOKEN_SECRET must be distinct from JWT_SECRET in production.');
    }

    // 3. VNPay configuration: VNP_TMN_CODE, VNP_HASH_SECRET, VNP_RETURN_URL, VNP_IPN_URL
    const vnpTmnCode = (env.VNP_TMN_CODE || '').trim();
    const vnpHashSecret = (env.VNP_HASH_SECRET || '').trim();
    const vnpReturnUrl = (env.VNP_RETURN_URL || '').trim();
    const vnpIpnUrl = (env.VNP_IPN_URL || '').trim();

    if (!vnpTmnCode) errors.push('VNP_TMN_CODE is required in production.');
    if (!vnpHashSecret) errors.push('VNP_HASH_SECRET is required in production.');

    if (!vnpReturnUrl) {
      errors.push('VNP_RETURN_URL is required in production.');
    } else if (!vnpReturnUrl.startsWith('https://')) {
      errors.push(`VNP_RETURN_URL must start with https:// in production (current: ${vnpReturnUrl}).`);
    }

    if (!vnpIpnUrl) {
      errors.push('VNP_IPN_URL is required in production.');
    } else if (!vnpIpnUrl.startsWith('https://')) {
      errors.push(`VNP_IPN_URL must start with https:// in production (current: ${vnpIpnUrl}).`);
    }

    // 4. Admin Bootstrap Secret
    const adminBootstrapRequireSecret = String(env.ADMIN_BOOTSTRAP_REQUIRE_SECRET).trim().toLowerCase() === 'true';
    const adminBootstrapSecret = (env.ADMIN_BOOTSTRAP_SECRET || '').trim();
    if (!adminBootstrapRequireSecret) {
      errors.push('ADMIN_BOOTSTRAP_REQUIRE_SECRET must be set to "true" in production.');
    }
    if (!adminBootstrapSecret) {
      errors.push('ADMIN_BOOTSTRAP_SECRET is required when ADMIN_BOOTSTRAP_REQUIRE_SECRET is true.');
    }

    // 5. CORS Origins must not contain wildcard '*'
    const corsOriginsStr = (env.CORS_ORIGINS || '').trim();
    if (!corsOriginsStr) {
      errors.push('CORS_ORIGINS is required in production.');
    } else {
      const origins = corsOriginsStr.split(',').map((o) => o.trim());
      if (origins.includes('*') || origins.some((o) => o.includes('*'))) {
        errors.push('CORS_ORIGINS must not contain wildcard "*" in production.');
      }
    }

    // 6. SMTP configuration
    const smtpHost = (env.SMTP_HOST || env.MAIL_HOST || '').trim();
    const smtpUser = (env.SMTP_USER || env.MAIL_USER || env.SMTP_USERNAME || '').trim();
    const smtpPass = (env.SMTP_PASS || env.MAIL_PASS || env.SMTP_PASSWORD || '').trim();
    if (!smtpHost) errors.push('SMTP_HOST is required in production.');
    if (!smtpUser) errors.push('SMTP_USER is required in production.');
    if (!smtpPass) errors.push('SMTP_PASS is required in production.');
  }

  if (errors.length > 0) {
    console.error('\n======================================================');
    console.error('[CONFIG VALIDATION ERROR] Server startup aborted due to configuration errors:');
    for (const err of errors) {
      console.error(` - ❌ ${err}`);
    }
    console.error('======================================================\n');
    process.exit(1);
  }

  return true;
}

module.exports = {
  validateConfig,
};

