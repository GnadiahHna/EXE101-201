const { OutboxEvent } = require('../models');
const { clock } = require('./clock.service');
const { sanitizePiiAndSecrets } = require('./audit.service');
const emailService = require('./email.service');

// Channel adapters registry
const adapters = {
  EMAIL: async (event) => {
    // If running in automated tests, avoid real network calls
    if (process.env.NODE_ENV === 'test') {
      return { success: true };
    }

    try {
      const payload = event.payload || {};
      const to = payload.to || payload.recipientEmail || payload.email;
      const subject = payload.subject || '[Nova Clinic] Thông báo';
      const html = payload.html;
      const text = payload.text || payload.message;

      if (!to) {
        console.warn(`[Outbox EmailAdapter] Skipped: no recipient in payload for event ${event.eventType}`);
        return { success: true };
      }

      await emailService.sendGenericEmail({ to, subject, html, text });
      return { success: true };
    } catch (err) {
      console.error(`[Outbox EmailAdapter] Failed to send real email:`, err.message);
      // In production/dev, we can return success: false to let outbox retry, or log it
      return { success: false, error: err.message };
    }
  },
  WEBSOCKET: async (event) => {
    // Default mock / dev logger for websocket notification
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Outbox WebSocketAdapter] Broadcast event: ${event.eventType}`, event.payload);
    }
    return { success: true };
  },
  PUSH: async (event) => {
    return { success: true };
  },
};

/**
 * Register a custom adapter handler for a given channel (e.g. for testing or production SMTP).
 * @param {'EMAIL'|'WEBSOCKET'|'PUSH'} channel
 * @param {(event: object) => Promise<{ success: boolean }>} handler
 */
function registerAdapter(channel, handler) {
  adapters[channel] = handler;
}

/**
 * Record an outbox event post-commit.
 * Strips any sensitive credentials before persisting.
 *
 * @param {object} params
 * @param {string} params.eventType - e.g. "APPOINTMENT_CONFIRMED"
 * @param {'EMAIL'|'WEBSOCKET'|'PUSH'|'ALL'} [params.channel='ALL']
 * @param {object} params.payload - Event payload data
 * @param {object} [params.session=null] - Optional Mongoose ClientSession
 * @returns {Promise<OutboxEvent>}
 */
async function recordEvent({ eventType, channel = 'ALL', payload, session = null }) {
  if (!eventType) {
    throw new Error('Outbox eventType is required');
  }

  const cleanPayload = sanitizePiiAndSecrets(payload || {});
  const now = clock.now();

  const [created] = await OutboxEvent.create(
    [
      {
        eventType: String(eventType).trim(),
        channel: channel || 'ALL',
        payload: cleanPayload,
        status: 'PENDING',
        retries: 0,
        maxRetries: 5,
        nextRetryAt: now,
      },
    ],
    { session },
  );

  return created;
}

/**
 * Process a single outbox event with its target adapter(s).
 * Idempotent: checks status before dispatching and updates atomically.
 *
 * @param {OutboxEvent} event
 * @returns {Promise<boolean>}
 */
async function processEvent(event) {
  const targetChannels = event.channel === 'ALL'
    ? ['EMAIL', 'WEBSOCKET']
    : [event.channel];

  try {
    for (const ch of targetChannels) {
      const adapter = adapters[ch];
      if (typeof adapter === 'function') {
        await adapter(event);
      }
    }

    event.status = 'SENT';
    event.processedAt = clock.now();
    event.lastError = null;
    await event.save();
    return true;
  } catch (err) {
    const nextRetryCount = event.retries + 1;
    event.retries = nextRetryCount;
    event.lastError = err?.message || 'Adapter execution failed';

    if (nextRetryCount >= event.maxRetries) {
      event.status = 'FAILED';
    } else {
      // Exponential backoff: 2s, 4s, 8s, 16s... up to 1 hour max
      const backoffMs = Math.min(3600000, 1000 * Math.pow(2, nextRetryCount));
      event.nextRetryAt = new Date(clock.now().getTime() + backoffMs);
      event.status = 'PENDING';
    }

    await event.save();
    return false;
  }
}

/**
 * Dispatch batch of pending outbox events.
 * Safe execution: errors in one event do not abort processing of others.
 *
 * @param {object} [options={}]
 * @param {number} [options.limit=20]
 * @returns {Promise<{ processedCount: number, successCount: number, failedCount: number }>}
 */
async function dispatchPendingEvents({ limit = 20 } = {}) {
  const now = clock.now();

  // Find and lock pending events
  const pendingEvents = await OutboxEvent.find({
    status: 'PENDING',
    nextRetryAt: { $lte: now },
  })
    .sort({ nextRetryAt: 1 })
    .limit(limit);

  let successCount = 0;
  let failedCount = 0;

  for (const event of pendingEvents) {
    // Atomic status claim to prevent concurrent worker duplicate sending
    const claimed = await OutboxEvent.findOneAndUpdate(
      { _id: event._id, status: 'PENDING' },
      { $set: { status: 'PROCESSING' } },
      { returnDocument: 'after' },
    );

    if (!claimed) continue; // Claimed by another worker tick

    const ok = await processEvent(claimed);
    if (ok) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    processedCount: pendingEvents.length,
    successCount,
    failedCount,
  };
}

let workerIntervalId = null;
let currentWorkerExecution = null;
const OUTBOX_LOCK_NAME = 'outbox_dispatcher_worker';
const OUTBOX_LOCK_TTL_MS = 30000; // 30s

function startOutboxWorker(intervalMs = 5000) {
  if (workerIntervalId) return;
  const { acquireLock, releaseLock } = require('../utils/jobLock');

  workerIntervalId = setInterval(async () => {
    const lockResult = await acquireLock(OUTBOX_LOCK_NAME, OUTBOX_LOCK_TTL_MS).catch((err) => {
      console.warn(`[Outbox Worker] Lock acquisition warning: ${err.message}`);
      return { acquired: false };
    });

    if (!lockResult || !lockResult.acquired) {
      return;
    }

    currentWorkerExecution = (async () => {
      try {
        await dispatchPendingEvents();
      } catch (err) {
        console.warn(`[Outbox Worker] Dispatch error: ${err.message}`);
      } finally {
        await releaseLock(OUTBOX_LOCK_NAME).catch(() => {});
      }
    })();

    await currentWorkerExecution;
  }, intervalMs);

  if (typeof workerIntervalId.unref === 'function') {
    workerIntervalId.unref();
  }
}

async function stopOutboxWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  if (currentWorkerExecution) {
    try {
      await currentWorkerExecution;
    } catch {
      // Ignore in graceful shutdown
    }
  }
}

module.exports = {
  recordEvent,
  processEvent,
  dispatchPendingEvents,
  registerAdapter,
  startOutboxWorker,
  stopOutboxWorker,
};
