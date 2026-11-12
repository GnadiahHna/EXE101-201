const mongoose = require('mongoose');

const jobLockSchema = new mongoose.Schema(
  {
    jobName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    lockedBy: {
      type: String,
      required: true,
      trim: true,
    },
    lockedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// TTL index to automatically prune abandoned locks
jobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const JobLock = mongoose.model('JobLock', jobLockSchema, 'job_locks');

module.exports = JobLock;
