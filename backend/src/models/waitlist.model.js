const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');

const waitlistSchema = new mongoose.Schema(
  {
    patientId: {
      type: Number,
      required: true,
      index: true,
    },
    doctorId: {
      type: Number,
      default: null,
      index: true,
    },
    specialtyId: {
      type: Number,
      default: null,
      index: true,
    },
    dateFrom: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    dateTo: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    preferredShift: {
      type: String,
      enum: ['MORNING', 'AFTERNOON', 'EVENING', 'ANY'],
      default: 'ANY',
    },
    status: {
      type: String,
      enum: ['WAITING', 'HOLDING', 'BOOKED', 'EXPIRED', 'CANCELLED'],
      default: 'WAITING',
      index: true,
    },
    heldSlotRef: {
      type: String, // e.g. "WAITLIST_HOLD_..."
      default: null,
    },
    heldShiftId: {
      type: Number,
      default: null,
    },
    heldSlotId: {
      type: Number,
      default: null,
    },
    holdExpiresAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

waitlistSchema.index({ specialtyId: 1, doctorId: 1, status: 1, createdAt: 1 });

waitlistSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'waitlists',
});

const Waitlist = mongoose.model('Waitlist', waitlistSchema, 'waitlists');

module.exports = Waitlist;

