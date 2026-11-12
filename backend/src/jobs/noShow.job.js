const { Appointment, DoctorShift, User } = require('../models');
const { APPOINTMENT_STATUSES, AUDIT_ACTIONS } = require('../constants/enums');
const env = require('../config/env');
const { clock } = require('../services/clock.service');
const { acquireLock, releaseLock } = require('../utils/jobLock');
const appointmentStateService = require('../services/appointmentState.service');
const auditService = require('../services/audit.service');
const { parseClinicDateTimeToUtc } = require('../utils/timezone');
const { calculateNoShowRisk } = require('../utils/noShowRisk');

const JOB_LOCK_NAME = 'no_show_maintenance_job';
const LOCK_TTL_MS = 120000; // 2 minutes

let noShowInterval = null;
let currentExecution = null;

/**
 * Scan CONFIRMED appointments where shift has ended and patient has not checked in.
 * Automatically marks them as NO_SHOW and increments patient penalty count.
 */
async function runNoShowScan() {
  const lock = await acquireLock(JOB_LOCK_NAME, LOCK_TTL_MS).catch(() => ({ acquired: false }));
  if (!lock || !lock.acquired) return;

  try {
    const now = clock.now();
    const tz = env.clinicTimeZone || 'Asia/Ho_Chi_Minh';
    const todayStr = now.toISOString().slice(0, 10);

    // Find appointments that are CONFIRMED or CHECKED_IN but past scheduled date/shift
    const candidates = await Appointment.find({
      status: APPOINTMENT_STATUSES.CONFIRMED,
      appointmentDate: { $lte: todayStr },
      checkedIn: false,
    }).lean();

    for (const appt of candidates) {
      // Find shift end time
      const shift = await DoctorShift.findOne({ id: appt.shiftId }).lean();
      const endTime = shift?.endTime || '20:00';

      const shiftEndUtc = parseClinicDateTimeToUtc(appt.appointmentDate, endTime, tz);

      // Grace period after shift end before marking NO_SHOW (e.g. 30 minutes)
      const gracePeriodMs = 30 * 60 * 1000;
      if (now.getTime() > shiftEndUtc.getTime() + gracePeriodMs) {
        // Transition to NO_SHOW via State Machine
        try {
          await appointmentStateService.transitionTo({
            identifier: appt.id,
            targetStatus: APPOINTMENT_STATUSES.NO_SHOW,
            actor: { id: 0, role: 'SYSTEM' },
            note: 'Tự động đánh dấu No-show do bệnh nhân không đến khám trong ca trực',
          });

          // Increment patient penalty counter & apply booking lock if threshold reached
          const patientUser = await User.findOne({ id: appt.patientId });
          if (patientUser) {
            patientUser.noShowCount = (patientUser.noShowCount || 0) + 1;

            const lockThreshold = env.cancelLockThreshold || 3;
            if (patientUser.noShowCount >= lockThreshold) {
              const lockDurationHours = env.bookingLockDurationHours || 24;
              patientUser.isBookingLocked = true;
              patientUser.bookingLockedAt = now;
              patientUser.bookingLockedUntil = new Date(now.getTime() + lockDurationHours * 3600 * 1000);
              patientUser.bookingLockedReason = `Đạt ngưỡng ${lockThreshold} lần không đến khám (No-show)`;

              await auditService.log({
                actor: { id: 0, role: 'SYSTEM' },
                action: AUDIT_ACTIONS.PATIENT_LOCKED,
                target: { id: patientUser.id, role: 'Patient' },
                note: `Khóa tài khoản bệnh nhân do No-show ${patientUser.noShowCount} lần`,
              });
            }

            await patientUser.save();
          }
        } catch (transErr) {
          console.warn(`[noShowScan] Lỗi chuyển trạng thái NO_SHOW cho lịch #${appt.id}:`, transErr.message);
        }
      }
    }
  } catch (err) {
    console.warn('[noShow.job] Error:', err.message);
  } finally {
    await releaseLock(JOB_LOCK_NAME).catch(() => {});
  }
}

function startNoShowJob(intervalMs = 60000) {
  if (noShowInterval) return;
  noShowInterval = setInterval(async () => {
    currentExecution = runNoShowScan();
    await currentExecution;
  }, intervalMs);

  if (typeof noShowInterval.unref === 'function') {
    noShowInterval.unref();
  }
}

async function stopNoShowJob() {
  if (noShowInterval) {
    clearInterval(noShowInterval);
    noShowInterval = null;
  }
  if (currentExecution) {
    await currentExecution;
    currentExecution = null;
  }
}

module.exports = {
  startNoShowJob,
  stopNoShowJob,
  runNoShowScan,
};
