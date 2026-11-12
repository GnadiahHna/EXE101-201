const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Ephemeral dev/test secret generated per process runtime if not explicitly set
const ephemeralDevSecret = crypto.randomBytes(32).toString('hex');

class ConfigService {
  constructor(sourceEnv = process.env) {
    this.raw = sourceEnv;
  }

  getString(key, defaultValue = '') {
    const val = this.raw[key];
    if (val === undefined || val === null || val === '') return defaultValue;
    return String(val).trim();
  }

  getNumber(key, defaultValue = 0) {
    const val = this.raw[key];
    if (val === undefined || val === null || val === '') return defaultValue;
    const num = Number(val);
    return Number.isFinite(num) ? num : defaultValue;
  }

  getBoolean(key, defaultValue = false) {
    const val = this.raw[key];
    if (val === undefined || val === null || val === '') return defaultValue;
    const lower = String(val).trim().toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }

  getArray(key, defaultValue = [], delimiter = ',') {
    const val = this.raw[key];
    if (val === undefined || val === null || val === '') return defaultValue;
    return String(val)
      .split(delimiter)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // --- Core Environment & Server ---
  get nodeEnv() {
    return this.getString('NODE_ENV', 'development');
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get isTest() {
    return this.nodeEnv === 'test';
  }

  get port() {
    return this.getNumber('PORT', 3000);
  }

  get mongoUri() {
    return this.getString('MONGO_URI', 'mongodb://127.0.0.1:27017/clinic_booking');
  }

  get clinicTimeZone() {
    return this.getString('CLINIC_TIMEZONE', this.getString('CLINIC_TIME_ZONE', 'Asia/Ho_Chi_Minh'));
  }

  get enableMongoTransactions() {
    return this.getBoolean('ENABLE_MONGO_TRANSACTIONS', true);
  }

  // --- Security & JWT ---
  get jwtSecret() {
    const val = this.raw['JWT_SECRET'];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
    if (this.isProduction) {
      return '';
    }
    if (!this._warnedDevJwt) {
      console.warn('[ConfigService] JWT_SECRET not configured. Generated ephemeral random secret for this session.');
      this._warnedDevJwt = true;
    }
    return ephemeralDevSecret;
  }

  get jwtExpiresIn() {
    return this.getString('JWT_EXPIRES_IN', '15m');
  }

  get refreshTokenExpiresInDays() {
    return this.getNumber('REFRESH_TOKEN_EXPIRES_IN_DAYS', 7);
  }

  get bcryptRounds() {
    return this.getNumber('BCRYPT_ROUNDS', 12);
  }

  get trustProxy() {
    return this.getString('TRUST_PROXY', 'loopback, linklocal, uniquelocal');
  }

  get redisUrl() {
    return this.getString('REDIS_URL', '');
  }

  get requireEmailVerification() {
    return this.getBoolean('REQUIRE_EMAIL_VERIFICATION', this.isProduction);
  }

  get oauthRedirectBaseUrl() {
    return this.getString('OAUTH_REDIRECT_BASE_URL', this.getString('BACKEND_URL', 'http://localhost:3000'));
  }

  get corsOrigins() {
    return this.getArray('CORS_ORIGINS', ['http://localhost:5173']);
  }

  get frontendUrl() {
    return this.getString('FRONTEND_URL', 'http://localhost:5173').replace(/\/+$/, '');
  }

  // --- OAuth2 (Google & Facebook) ---
  get googleClientId() {
    return this.getString('GOOGLE_CLIENT_ID', '');
  }

  get googleClientSecret() {
    return this.getString('GOOGLE_CLIENT_SECRET', '');
  }

  get facebookClientId() {
    return this.getString('FACEBOOK_CLIENT_ID', this.getString('FACEBOOK_APP_ID', ''));
  }

  get facebookClientSecret() {
    return this.getString('FACEBOOK_CLIENT_SECRET', this.getString('FACEBOOK_APP_SECRET', ''));
  }

  // --- Rate Limiting ---
  get rateLimitWindowMs() {
    return this.getNumber('RATE_LIMIT_WINDOW_MS', 60000);
  }

  get rateLimitMax() {
    return this.getNumber('RATE_LIMIT_MAX', 100);
  }

  // --- Outbox & Background Processing ---
  get outboxEnableWorker() {
    return this.getBoolean('OUTBOX_ENABLE_WORKER', true);
  }

  get outboxPollIntervalMs() {
    return this.getNumber('OUTBOX_POLL_INTERVAL_MS', 5000);
  }

  get outboxMaxRetries() {
    return this.getNumber('OUTBOX_MAX_RETRIES', 5);
  }

  // --- Uploads & File Management ---
  get uploadsDir() {
    return this.getString('UPLOADS_DIR', path.join(__dirname, '../../uploads'));
  }

  // --- Clinic Booking Rules ---
  get maxPatientsPerAppointment() {
    return this.getNumber('MAX_PATIENTS_PER_APPOINTMENT', 4);
  }

  get maxPendingAppointmentsPerPatient() {
    return this.getNumber('MAX_PENDING_APPOINTMENTS_PER_PATIENT', 5);
  }

  get cancelMinHours() {
    return this.getNumber('CANCEL_MIN_HOURS', 24);
  }

  get cancelLockThreshold() {
    return this.getNumber('CANCEL_LOCK_THRESHOLD', 3);
  }

  get bookingLockDurationHours() {
    return this.getNumber('BOOKING_LOCK_DURATION_HOURS', 24);
  }

  get adminBootstrapSecret() {
    return this.getString('ADMIN_BOOTSTRAP_SECRET', '');
  }

  get adminBootstrapRequireSecret() {
    return this.getBoolean('ADMIN_BOOTSTRAP_REQUIRE_SECRET', false);
  }

  // --- Receptionist / Appointment Settings ---
  get checkinEarlyMinutes() {
    return this.getNumber('CHECKIN_EARLY_MINUTES', 60);
  }

  get shiftCancelPolicy() {
    return this.getString('SHIFT_CANCEL_POLICY', 'BLOCK_UNTIL_RESOLVED');
  }

  get receptionSearchRatePerMin() {
    return this.getNumber('RECEPTION_SEARCH_RATE_PER_MIN', 30);
  }

  // --- Online Consultation (UC-PAT-09 / UC-PAT-10) ---
  get joinEarlyMinutes() {
    return this.getNumber('JOIN_EARLY_MINUTES', 15);
  }

  get joinLateGraceMinutes() {
    return this.getNumber('JOIN_LATE_GRACE_MINUTES', 15);
  }

  get onlineRequirePaymentBeforeJoin() {
    return this.getBoolean('ONLINE_REQUIRE_PAYMENT_BEFORE_JOIN', true);
  }

  get joinTokenSecret() {
    return this.getString('JOIN_TOKEN_SECRET', '');
  }

  // --- Payment & VNPay (UC-PAT-07 / UC-PAT-08) ---
  get paymentPendingTtlMinutes() {
    return this.getNumber('PAYMENT_PENDING_TTL_MINUTES', 15);
  }

  get paymentSuccessTargetStateOnline() {
    return this.getString('PAYMENT_SUCCESS_TARGET_STATE_ONLINE', 'CONFIRMED');
  }

  get paymentSuccessTargetStateOffline() {
    return this.getString('PAYMENT_SUCCESS_TARGET_STATE_OFFLINE', 'PENDING_CONFIRMATION');
  }

  get vnpTmnCode() {
    return this.getString('VNP_TMN_CODE', '');
  }

  get vnpHashSecret() {
    return this.getString('VNP_HASH_SECRET', '');
  }

  get vnpUrl() {
    return this.getString('VNP_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
  }

  get vnpReturnUrl() {
    return this.getString('VNP_RETURN_URL', 'http://localhost:5173/payment/vnpay-return');
  }

  get vnpIpnUrl() {
    return this.getString('VNP_IPN_URL', 'http://localhost:3000/api/payments/vnpay-ipn');
  }

  get paymentAppointmentHoldMinutes() {
    const hold = this.getNumber('PAYMENT_APPOINTMENT_HOLD_MINUTES', 30);
    const ttl = this.paymentPendingTtlMinutes;
    if (hold < ttl) {
      console.warn(`[Config] PAYMENT_APPOINTMENT_HOLD_MINUTES (${hold}) nhỏ hơn PAYMENT_PENDING_TTL_MINUTES (${ttl}). Tự động nâng lên ${ttl} phút.`);
      return ttl;
    }
    return hold;
  }

  get paymentJobEnabled() {
    return this.getBoolean('PAYMENT_JOB_ENABLED', true);
  }

  get paymentJobIntervalMs() {
    return this.getNumber('PAYMENT_JOB_INTERVAL_MS', 60000);
  }

  // --- Patient Feedback (UC-PAT-11 / UC-PAT-12) ---
  get feedbackEditDays() {
    return this.getNumber('FEEDBACK_EDIT_DAYS', 7);
  }

  get feedbackRatePerHour() {
    return this.getNumber('FEEDBACK_RATE_PER_HOUR', 10);
  }

  get geminiApiKey() {
    return this.getString('GEMINI_API_KEY', '');
  }

  /**
   * Export config snapshot object for backwards compatibility.
   */
  toObject() {
    return {
      nodeEnv: this.nodeEnv,
      isProduction: this.isProduction,
      isTest: this.isTest,
      port: this.port,
      mongoUri: this.mongoUri,
      clinicTimeZone: this.clinicTimeZone,
      enableMongoTransactions: this.enableMongoTransactions,
      jwtSecret: this.jwtSecret,
      jwtExpiresIn: this.jwtExpiresIn,
      corsOrigins: this.corsOrigins,
      frontendUrl: this.frontendUrl,
      rateLimitWindowMs: this.rateLimitWindowMs,
      rateLimitMax: this.rateLimitMax,
      outboxEnableWorker: this.outboxEnableWorker,
      outboxPollIntervalMs: this.outboxPollIntervalMs,
      outboxMaxRetries: this.outboxMaxRetries,
      uploadsDir: this.uploadsDir,
      maxPatientsPerAppointment: this.maxPatientsPerAppointment,
      maxPendingAppointmentsPerPatient: this.maxPendingAppointmentsPerPatient,
      cancelMinHours: this.cancelMinHours,
      cancelLockThreshold: this.cancelLockThreshold,
      bookingLockDurationHours: this.bookingLockDurationHours,
      adminBootstrapSecret: this.adminBootstrapSecret,
      adminBootstrapRequireSecret: this.adminBootstrapRequireSecret,
      checkinEarlyMinutes: this.checkinEarlyMinutes,
      shiftCancelPolicy: this.shiftCancelPolicy,
      receptionSearchRatePerMin: this.receptionSearchRatePerMin,
      joinEarlyMinutes: this.joinEarlyMinutes,
      joinLateGraceMinutes: this.joinLateGraceMinutes,
      onlineRequirePaymentBeforeJoin: this.onlineRequirePaymentBeforeJoin,
      joinTokenSecret: this.joinTokenSecret,
      paymentPendingTtlMinutes: this.paymentPendingTtlMinutes,
      paymentSuccessTargetStateOnline: this.paymentSuccessTargetStateOnline,
      paymentSuccessTargetStateOffline: this.paymentSuccessTargetStateOffline,
      vnpTmnCode: this.vnpTmnCode,
      vnpHashSecret: this.vnpHashSecret,
      vnpUrl: this.vnpUrl,
      vnpReturnUrl: this.vnpReturnUrl,
      vnpIpnUrl: this.vnpIpnUrl,
      paymentAppointmentHoldMinutes: this.paymentAppointmentHoldMinutes,
      paymentJobEnabled: this.paymentJobEnabled,
      paymentJobIntervalMs: this.paymentJobIntervalMs,
      feedbackEditDays: this.feedbackEditDays,
      feedbackRatePerHour: this.feedbackRatePerHour,
      geminiApiKey: this.geminiApiKey,
    };
  }
}

const configService = new ConfigService();

module.exports = {
  ConfigService,
  configService,
};
