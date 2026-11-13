const jwt = require('jsonwebtoken');
const { Appointment, User, DoctorShift } = require('../models');
const { APPOINTMENT_STATUSES } = require('../constants/enums');
const env = require('../config/env');
const { clock } = require('../services/clock.service');
const { acquireLock, releaseLock } = require('../utils/jobLock');
const { notificationService } = require('../services/notification.service');
const { parseClinicDateTimeToUtc } = require('../utils/timezone');

const JOB_LOCK_NAME = 'appointment_reminder_job';
const LOCK_TTL_MS = 120000; // 2 minutes

let reminderInterval = null;
let currentExecution = null;

/**
 * Generate a signed one-time reminder token for quick confirmation/cancellation via email link.
 *
 * @param {object} appointment
 * @param {string} action - 'CONFIRM' | 'CANCEL'
 * @returns {string} Signed token
 */
function generateReminderActionToken(appointment, action) {
  const secret = env.jwtSecret || 'reminder_token_secret_fallback_min_32_characters';
  return jwt.sign(
    {
      appointmentId: appointment.id,
      appointmentNo: appointment.appointmentNo,
      patientId: appointment.patientId,
      action,
    },
    secret,
    { expiresIn: '48h' },
  );
}

/**
 * Run reminder scan once.
 */
async function runReminderScan() {
  const lock = await acquireLock(JOB_LOCK_NAME, LOCK_TTL_MS).catch(() => ({ acquired: false }));
  if (!lock || !lock.acquired) return;

  try {
    const now = clock.now();
    const tz = env.clinicTimeZone || 'Asia/Ho_Chi_Minh';

    // Find CONFIRMED appointments in the next 48 hours
    const todayStr = now.toISOString().slice(0, 10);
    const appointments = await Appointment.find({
      status: APPOINTMENT_STATUSES.CONFIRMED,
      appointmentDate: { $gte: todayStr },
    }).lean();

    for (const appt of appointments) {
      if (!appt.appointmentDate || !appt.appointmentTime) continue;

      const apptTimeUtc = parseClinicDateTimeToUtc(appt.appointmentDate, appt.appointmentTime, tz);
      const hoursUntil = (apptTimeUtc.getTime() - now.getTime()) / (3600 * 1000);

      // Check T-24h milestone (e.g. between 22h and 26h away)
      const sentReminders = Array.isArray(appt.remindersSent) ? appt.remindersSent : [];
      const hasSent24h = sentReminders.some((r) => r.type === 'T-24H');
      const hasSent2h = sentReminders.some((r) => r.type === 'T-2H');

      if (hoursUntil <= 26 && hoursUntil >= 20 && !hasSent24h) {
        // Send T-24H reminder
        await sendReminder(appt, 'T-24H');
      } else if (hoursUntil <= 3 && hoursUntil >= 1 && !hasSent2h) {
        // Send T-2H reminder
        await sendReminder(appt, 'T-2H');
      }
    }
  } catch (err) {
    console.warn('[appointmentReminder.job] Run error:', err.message);
  } finally {
    await releaseLock(JOB_LOCK_NAME).catch(() => {});
  }
}

/**
 * Send milestone reminder and atomically record in remindersSent[] to guarantee idempotency.
 */
async function sendReminder(appt, reminderType) {
  const patient = await User.findOne({ id: appt.patientId }).select('id email fullName').lean();
  if (!patient) return;

  const confirmToken = generateReminderActionToken(appt, 'CONFIRM');
  const cancelToken = generateReminderActionToken(appt, 'CANCEL');

  const frontendUrl = env.frontendUrl || 'http://localhost:5173';
  const confirmLink = `${frontendUrl}/appointments/${appt.id}?token=${confirmToken}&action=confirm`;
  const cancelLink = `${frontendUrl}/appointments/${appt.id}?token=${cancelToken}&action=cancel`;

  const timeLabel = reminderType === 'T-24H' ? '24 giờ' : '2 giờ';
  const title = `Nhắc lịch khám trước ${timeLabel}`;
  const message = `Lịch khám #${appt.appointmentNo} của bạn sẽ diễn ra vào lúc ${appt.appointmentTime} ngày ${appt.appointmentDate}.`;

  // Atomic update: only send if this reminderType hasn't been added yet
  const updated = await Appointment.findOneAndUpdate(
    {
      id: appt.id,
      'remindersSent.type': { $ne: reminderType },
    },
    {
      $push: {
        remindersSent: {
          type: reminderType,
          sentAt: clock.now(),
          channel: 'email',
        },
      },
    },
    { returnDocument: 'after' },
  );

  if (!updated) return; // Already sent by another concurrent pass

  await notificationService.notifyUser({
    userId: patient.id,
    title,
    message: `${message} Bạn có thể xác nhận lại lịch hoặc hủy nếu có việc đột xuất.`,
    type: 'REMINDER',
    link: confirmLink,
    metadata: {
      appointmentId: appt.id,
      reminderType,
      confirmLink,
      cancelLink,
    },
    sendEmail: false,
  });
}

function startReminderJob(intervalMs = 60000) {
  if (reminderInterval) return;
  reminderInterval = setInterval(async () => {
    currentExecution = runReminderScan();
    await currentExecution;
  }, intervalMs);

  if (typeof reminderInterval.unref === 'function') {
    reminderInterval.unref();
  }
}

async function stopReminderJob() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  if (currentExecution) {
    await currentExecution;
    currentExecution = null;
  }
}

module.exports = {
  startReminderJob,
  stopReminderJob,
  runReminderScan,
  generateReminderActionToken,
};

