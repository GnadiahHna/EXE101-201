const { Waitlist, DoctorShift } = require('../models');
const { holdSlot, releaseSlot } = require('./appointmentSlot.service');
const { notificationService } = require('./notification.service');
const { clock } = require('./clock.service');
const ApiError = require('../utils/ApiError');

const HOLD_DURATION_MINUTES = 10;

/**
 * Register patient to the waitlist for a specific doctor or specialty within a date range.
 *
 * @param {object} params
 * @param {number} params.patientId
 * @param {number} [params.doctorId]
 * @param {number} [params.specialtyId]
 * @param {string} params.dateFrom - "YYYY-MM-DD"
 * @param {string} params.dateTo - "YYYY-MM-DD"
 * @param {string} [params.preferredShift='ANY']
 * @param {string} [params.notes]
 * @returns {Promise<object>} Created Waitlist entry
 */
async function addToWaitlist({
  patientId,
  doctorId = null,
  specialtyId = null,
  dateFrom,
  dateTo,
  preferredShift = 'ANY',
  notes = null,
}) {
  if (!patientId || !dateFrom || !dateTo) {
    throw new ApiError(400, 'Thiếu thông tin bắt buộc: patientId, dateFrom, dateTo');
  }

  // Prevent multiple active waiting entries for the same patient in overlapping criteria
  const existing = await Waitlist.findOne({
    patientId: Number(patientId),
    status: { $in: ['WAITING', 'HOLDING'] },
    dateFrom,
    dateTo,
    $or: [{ doctorId: doctorId ? Number(doctorId) : null }, { specialtyId: specialtyId ? Number(specialtyId) : null }],
  });

  if (existing) {
    throw new ApiError(409, 'Bạn đã có một yêu cầu trong danh sách chờ tương tự');
  }

  const entry = await Waitlist.create({
    patientId: Number(patientId),
    doctorId: doctorId ? Number(doctorId) : null,
    specialtyId: specialtyId ? Number(specialtyId) : null,
    dateFrom,
    dateTo,
    preferredShift,
    notes,
    status: 'WAITING',
  });

  return entry;
}

/**
 * Trigger waitlist fulfillment when a slot is released or an appointment is cancelled/expired.
 * Finds the earliest registered eligible patient (FIFO) and holds the slot for 10 minutes.
 *
 * @param {object} params
 * @param {number} params.shiftId
 * @param {number} params.slotId
 * @returns {Promise<{ matched: boolean, waitlistEntry?: object }>}
 */
async function processWaitlistForReleasedSlot({ shiftId, slotId }) {
  if (!shiftId || !slotId) return { matched: false };

  const shift = await DoctorShift.findOne({ id: Number(shiftId), status: 'ACTIVE' }).lean();
  if (!shift) return { matched: false };

  const slot = (shift.slots || []).find((s) => s.id === Number(slotId) && s.status === 'AVAILABLE');
  if (!slot) return { matched: false };

  const shiftDate = shift.date; // "YYYY-MM-DD"
  const shiftType = shift.shift; // "MORNING" | "AFTERNOON" | "EVENING"
  const doctorId = shift.doctorId;

  // Query earliest waiting entry matching date, doctor/specialty, and shift preference
  const filter = {
    status: 'WAITING',
    dateFrom: { $lte: shiftDate },
    dateTo: { $gte: shiftDate },
    $or: [
      { doctorId: Number(doctorId) },
      { doctorId: null },
    ],
    preferredShift: { $in: [shiftType, 'ANY'] },
  };

  const candidate = await Waitlist.findOne(filter).sort({ createdAt: 1 });
  if (!candidate) return { matched: false };

  const now = clock.now();
  const holdExpiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
  const heldSlotRef = `WAITLIST_HOLD_${candidate.id}_${slot.id}`;

  try {
    // 1. Hold slot atomically
    await holdSlot({
      shiftId: shift.id,
      slotId: slot.id,
      bookingRef: heldSlotRef,
    });

    // 2. Update candidate status to HOLDING
    candidate.status = 'HOLDING';
    candidate.heldSlotRef = heldSlotRef;
    candidate.heldShiftId = shift.id;
    candidate.heldSlotId = slot.id;
    candidate.holdExpiresAt = holdExpiresAt;
    await candidate.save();

    // 3. Notify patient
    await notificationService.notifyUser({
      userId: candidate.patientId,
      title: 'Có slot khám khả dụng từ Danh Sách Chờ!',
      message: `Đã có slot khám trống vào ngày ${shift.date} (${slot.startTime} - ${slot.endTime}). Slot được giữ độc quyền cho bạn trong 10 phút.`,
      type: 'WAITLIST_AVAILABLE',
      link: `/booking?waitlistId=${candidate.id}&shiftId=${shift.id}&slotId=${slot.id}`,
      metadata: {
        waitlistId: candidate.id,
        shiftId: shift.id,
        slotId: slot.id,
        holdExpiresAt,
      },
      sendEmail: true,
    });

    return { matched: true, waitlistEntry: candidate };
  } catch (err) {
    console.warn(`[Waitlist] Lỗi giữ slot cho waitlist #${candidate.id}:`, err.message);
    return { matched: false };
  }
}

/**
 * Routine scan: Release expired waitlist holds and offer the slot to the next patient in line.
 */
async function cleanExpiredWaitlistHolds() {
  const now = clock.now();
  const expiredHolds = await Waitlist.find({
    status: 'HOLDING',
    holdExpiresAt: { $lte: now },
  });

  for (const entry of expiredHolds) {
    if (entry.heldShiftId && entry.heldSlotId && entry.heldSlotRef) {
      // Release slot back to AVAILABLE
      await releaseSlot({
        shiftId: entry.heldShiftId,
        slotIds: [entry.heldSlotId],
        bookingRef: entry.heldSlotRef,
      }).catch(() => {});

      entry.status = 'EXPIRED';
      await entry.save();

      // Trigger fulfillment for the next waiting candidate
      await processWaitlistForReleasedSlot({
        shiftId: entry.heldShiftId,
        slotId: entry.heldSlotId,
      }).catch(() => {});
    }
  }
}

module.exports = {
  addToWaitlist,
  processWaitlistForReleasedSlot,
  cleanExpiredWaitlistHolds,
};
