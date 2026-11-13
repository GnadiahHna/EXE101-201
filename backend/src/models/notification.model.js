const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['REMINDER', 'WAITLIST_AVAILABLE', 'STATUS_CHANGE', 'INTAKE', 'SYSTEM'],
      default: 'SYSTEM',
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    link: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

notificationSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'notifications',
});

const Notification = mongoose.model('Notification', notificationSchema, 'notifications');

module.exports = Notification;

