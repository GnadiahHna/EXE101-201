const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');
const { ROLE_VALUES, GENDER_VALUES, AUTH_PROVIDERS, ROLES, GENDERS } = require('../constants/enums');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    // Password reset token hash (SHA-256)
    resetPasswordTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    // Email verification
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    // Token revocation and invalidation version
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Account lockout protection (brute-force defense)
    failedLoginCount: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
    },
    gender: {
      type: String,
      enum: GENDER_VALUES,
      default: GENDERS.OTHER,
    },
    userType: {
      type: String,
      enum: ROLE_VALUES,
      required: true,
      default: ROLES.PATIENT,
      index: true,
    },
    isEnable: {
      type: Boolean,
      default: true,
      index: true,
    },
    disabledAt: {
      type: Date,
      default: null,
    },
    disabledBy: {
      type: Number,
      default: null,
    },
    disabledReason: {
      type: String,
      default: null,
    },
    isBookingLocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    bookingLockedAt: {
      type: Date,
      default: null,
    },
    bookingLockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    bookingLockedReason: {
      type: String,
      default: null,
    },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      default: AUTH_PROVIDERS.LOCAL,
    },

    // --- Doctor-specific fields (unified from SQL `doctor` joined table so user.id === doctor.id) ---
    specialtyId: {
      type: Number,
      default: null,
      index: true,
    },
    degree: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    experience: {
      type: String,
      default: null,
    },
    consultationFee: {
      type: Number,
      default: null,
    },
    isVip: {
      type: Boolean,
      default: false,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ createdAt: 1, userType: 1 });

userSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'users',
  hiddenFields: [
    'password',
    'resetPasswordTokenHash',
    'resetPasswordExpires',
    'emailVerificationTokenHash',
    'emailVerificationExpires',
    'temporaryPassword',
    'temporaryPasswordExpiresAt',
  ],
  extraTransform: (_doc, ret) => {
    // Frontend reads both `isEnabled` and `isEnable` across admin.ts & RecepDashboard.tsx
    ret.isEnabled = Boolean(ret.isEnable);
    ret.role = ret.userType;
    return ret;
  },
});

const User = mongoose.model('User', userSchema, 'users');

module.exports = User;

