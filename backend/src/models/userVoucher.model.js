const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');

const userVoucherSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: true,
      index: true,
    },
    voucherId: {
      type: Number,
      required: true,
      index: true,
    },
    voucherCode: {
      type: String,
      default: null,
    },
    voucherName: {
      type: String,
      default: null,
    },
    discountValue: {
      type: Number,
      default: null,
    },
    type: {
      type: String,
      default: null,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    appointmentId: {
      type: Number,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

userVoucherSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'user_vouchers',
  extraTransform: (_doc, ret) => {
    if (ret.issuedAt instanceof Date) {
      ret.issuedAt = ret.issuedAt.toISOString();
    }
    if (ret.usedAt instanceof Date) {
      ret.usedAt = ret.usedAt.toISOString();
    }
    return ret;
  },
});

const UserVoucher = mongoose.model('UserVoucher', userVoucherSchema, 'user_vouchers');

module.exports = UserVoucher;
