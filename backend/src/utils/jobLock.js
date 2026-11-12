const os = require('os');
const { JobLock } = require('../models');

const INSTANCE_ID = `${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Acquire leader lock using atomic findOneAndUpdate.
 *
 * @param {string} jobName - Unique identifier for the job
 * @param {number} ttlMs - Lock lease duration in milliseconds (default 60,000ms)
 * @param {string} [holderId] - Optional identifier for instance holding the lock
 * @returns {Promise<{ acquired: boolean, reason?: string }>}
 */
async function acquireLock(jobName, ttlMs = 60000, holderId = INSTANCE_ID) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    const lock = await JobLock.findOneAndUpdate(
      {
        jobName,
        $or: [
          { expiresAt: { $lt: now } }, // Expired lock
          { lockedBy: holderId },      // Re-entrant lock by current instance
        ],
      },
      {
        $set: {
          lockedBy: holderId,
          lockedAt: now,
          expiresAt,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );

    const acquired = Boolean(lock && lock.lockedBy === holderId);
    return acquired ? { acquired: true } : { acquired: false, reason: 'locked_by_other_instance' };
  } catch (err) {
    // E11000 duplicate key error means another active instance holds the unexpired lock
    if (err.code === 11000) {
      return { acquired: false, reason: 'locked_by_other_instance' };
    }
    throw err;
  }
}

/**
 * Release leader lock gracefully.
 *
 * @param {string} jobName - Unique identifier for the job
 * @param {string} [holderId]
 */
async function releaseLock(jobName, holderId = INSTANCE_ID) {
  try {
    await JobLock.deleteOne({
      jobName,
      lockedBy: holderId,
    });
  } catch (err) {
    console.warn(`[JobLock] Warning releasing lock for ${jobName}:`, err.message);
  }
}

/**
 * Wrap a recurring task function with leader election lock.
 *
 * @param {string} jobName
 * @param {number} ttlMs
 * @param {Function} taskFn
 * @param {string} [holderId]
 * @returns {Promise<{ executed: boolean, skipped?: boolean, reason?: string, result?: any }>}
 */
async function withJobLock(jobName, ttlMs, taskFn, holderId = INSTANCE_ID) {
  const lockRes = await acquireLock(jobName, ttlMs, holderId);
  if (!lockRes.acquired) {
    return { executed: false, skipped: true, reason: lockRes.reason || 'LOCKED_BY_OTHER_INSTANCE' };
  }

  try {
    const result = await taskFn();
    return { executed: true, skipped: false, result };
  } finally {
    await releaseLock(jobName, holderId);
  }
}

module.exports = {
  INSTANCE_ID,
  acquireLock,
  releaseLock,
  withJobLock,
};
