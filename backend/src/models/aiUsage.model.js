const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema(
  {
    key: {
      type: String, // format: "purpose:YYYY-MM-DD", e.g. "triage:2026-11-13"
      required: true,
      unique: true,
      index: true,
    },
    purpose: {
      type: String, // 'triage' | 'intake_summary'
      required: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

const AiUsage = mongoose.model('AiUsage', aiUsageSchema, 'ai_usage');

module.exports = AiUsage;

