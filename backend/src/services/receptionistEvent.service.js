const mongoose = require('mongoose');
const { Event, EventRegistration, User, Voucher, UserVoucher } = require('../models');
const { ROLES, AUDIT_ACTIONS } = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { clock } = require('./clock.service');

/**
 * Format participant object to match Frontend ReceptionEventParticipant:
 * { id, userId, userFullName, userEmail, userPhone, status, registeredAt }
 */
function formatParticipant(registration, user = null) {
  return {
    id: registration.id ?? registration._id,
    userEventId: registration.id ?? registration._id,
    userId: registration.userId,
    userFullName: user?.fullName || null,
    userEmail: user?.email || null,
    userPhone: user?.phoneNumber || null,
    status: registration.status,
    registeredAt: registration.registeredAt ? registration.registeredAt.toISOString() : null,
    confirmedAt: registration.confirmedAt ? registration.confirmedAt.toISOString() : null,
    confirmedBy: registration.confirmedBy ?? null,
  };
}

/**
 * UC-REC-07: Receptionist confirms attendee's event attendance.
 *
 * Requirements:
 * - Role: RECEPTIONIST, ADMIN
 * - Query registration by eventId + userId
 * - Registration not found -> 404 NOT_FOUND
 * - Event closed/disabled or expired -> 409 EVENT_CLOSED / EVENT_EXPIRED
 * - If already CONFIRMED -> Idempotent HTTP 200 with current state
 * - Conditional atomic update: PENDING -> CONFIRMED
 * - Set confirmedAt = clock.now(), confirmedBy = userId from JWT
 * - If event has voucherId and voucher active, automatically issue UserVoucher (idempotent, no duplicates)
 * - Audit log: CONFIRM_EVENT_ATTENDANCE
 */
async function confirmEventAttendance(actor, eventId, userId) {
  const allowedRoles = [ROLES.RECEPTIONIST, ROLES.ADMIN];
  const actorRole = actor?.role ?? actor?.userType;
  if (!actor || !allowedRoles.includes(actorRole)) {
    throw new ApiError(403, 'Chỉ lễ tân hoặc quản trị viên mới có quyền xác nhận tham gia sự kiện', 'FORBIDDEN_ROLE');
  }

  const numEventId = Number(eventId);
  const numUserId = Number(userId);

  const eventFilter = Number.isSafeInteger(numEventId) && numEventId > 0
    ? { id: numEventId }
    : (mongoose.Types.ObjectId.isValid(eventId) ? { _id: eventId } : { id: eventId });

  const event = await Event.findOne(eventFilter);
  if (!event) {
    throw new ApiError(404, `Không tìm thấy sự kiện với ID: ${eventId}`, 'EVENT_NOT_FOUND');
  }

  const regFilter = {
    eventId: event.id,
    userId: Number.isSafeInteger(numUserId) ? numUserId : (mongoose.Types.ObjectId.isValid(userId) ? userId : numUserId),
  };

  const registration = await EventRegistration.findOne(regFilter);
  if (!registration) {
    throw new ApiError(404, `Không tìm thấy đăng ký sự kiện của người dùng ID ${userId} cho sự kiện ID ${event.id}`, 'REGISTRATION_NOT_FOUND');
  }

  // Fetch participant user info for response presentation and audit
  const participantUser = await User.findOne({
    $or: [
      { id: registration.userId },
      ...(mongoose.Types.ObjectId.isValid(registration.userId) ? [{ _id: registration.userId }] : []),
    ],
  }).lean();

  // Idempotency: if already CONFIRMED, return current state with HTTP 200
  if (registration.status === 'CONFIRMED') {
    return {
      success: true,
      idempotent: true,
      message: 'Người tham dự đã được xác nhận trước đó',
      data: formatParticipant(registration, participantUser),
    };
  }

  // Check event status & validity policy
  const now = clock.now();
  if (event.isEnabled === false) {
    throw new ApiError(409, 'Sự kiện đã bị đóng, không thể xác nhận người tham dự', 'EVENT_CLOSED');
  }

  if (event.endDate && new Date(event.endDate).getTime() < now.getTime()) {
    throw new ApiError(409, 'Sự kiện đã kết thúc/hết hạn, không thể xác nhận người tham dự', 'EVENT_EXPIRED');
  }

  // Conditional atomic update PENDING -> CONFIRMED
  const confirmedAt = clock.now();
  const actorUserId = actor.userId ?? actor.id;

  const updatedRegistration = await EventRegistration.findOneAndUpdate(
    {
      _id: registration._id,
      status: 'PENDING',
    },
    {
      $set: {
        status: 'CONFIRMED',
        confirmedBy: actorUserId,
        confirmedAt,
      },
    },
    { returnDocument: 'after' },
  );

  // If conditional update missed because of concurrent update
  if (!updatedRegistration) {
    const freshReg = await EventRegistration.findById(registration._id);
    if (freshReg && freshReg.status === 'CONFIRMED') {
      return {
        success: true,
        idempotent: true,
        message: 'Người tham dự đã được xác nhận trước đó',
        data: formatParticipant(freshReg, participantUser),
      };
    }
    throw new ApiError(409, 'Trạng thái đăng ký đã thay đổi hoặc không còn ở trạng thái PENDING', 'CONCURRENT_CONFLICT');
  }

  // Automatic voucher granting if event has voucherId and active
  let grantedVoucher = null;
  if (event.voucherId) {
    try {
      const voucher = await Voucher.findOne({ id: event.voucherId, enable: true });
      if (voucher) {
        // Prevent duplicate voucher issuance
        const existingUserVoucher = await UserVoucher.findOne({
          voucherId: voucher.id,
          userId: registration.userId,
        });

        if (!existingUserVoucher) {
          grantedVoucher = await UserVoucher.create({
            voucherId: voucher.id,
            userId: registration.userId,
            voucherCode: voucher.code,
            voucherName: voucher.name,
            discountValue: voucher.discountValue,
            type: voucher.type,
            expiryDate: voucher.expiryDate,
            issuedAt: confirmedAt,
            used: false,
          });
        } else {
          grantedVoucher = existingUserVoucher;
        }
      }
    } catch (voucherErr) {
      console.warn(`[EventAttendance] Voucher grant warning: ${voucherErr.message}`);
    }
  }

  // Audit Log: CONFIRM_EVENT_ATTENDANCE
  await auditService.log({
    actor: {
      userId: actorUserId,
      id: actorUserId,
      role: actorRole,
      fullName: actor.fullName,
    },
    action: AUDIT_ACTIONS.CONFIRM_EVENT_ATTENDANCE || 'CONFIRM_EVENT_ATTENDANCE',
    resource: {
      type: 'EventRegistration',
      id: updatedRegistration.id ?? updatedRegistration._id,
    },
    reason: 'Lễ tân xác nhận người tham dự sự kiện',
    summary: `Nhân viên ${actor.fullName || actorUserId} xác nhận người tham dự (userId: ${registration.userId}) cho sự kiện ID: ${event.id}`,
    changes: {
      oldStatus: 'PENDING',
      newStatus: 'CONFIRMED',
      eventId: event.id,
      userId: registration.userId,
      voucherIssued: Boolean(grantedVoucher),
      voucherId: event.voucherId || null,
    },
  });

  const participantData = formatParticipant(updatedRegistration, participantUser);
  if (grantedVoucher) {
    participantData.grantedVoucherId = grantedVoucher.voucherId ?? grantedVoucher.id ?? event.voucherId;
  }

  return {
    success: true,
    idempotent: false,
    message: 'Xác nhận người tham dự sự kiện thành công',
    data: participantData,
  };
}

/**
 * Receptionist / Admin gets events list with registrations for reception UI
 * Endpoint: GET /reception/events
 */
async function getReceptionEvents() {
  const events = await Event.find().sort({ startDate: -1 });
  const eventIds = events.map((e) => e.id);

  const registrations = await EventRegistration.find({ eventId: { $in: eventIds } }).sort({ registeredAt: -1 });
  const userIds = [...new Set(registrations.map((r) => r.userId))];
  const users = await User.find({ id: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Voucher details map
  const voucherIds = [...new Set(events.map((e) => e.voucherId).filter(Boolean))];
  const vouchers = await Voucher.find({ id: { $in: voucherIds } }).lean();
  const voucherMap = new Map(vouchers.map((v) => [v.id, v]));

  return events.map((ev) => {
    const evRegs = registrations.filter((r) => r.eventId === ev.id);
    const voucher = ev.voucherId ? voucherMap.get(ev.voucherId) : null;

    return {
      id: ev.id,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      startDate: ev.startDate ? ev.startDate.toISOString() : null,
      endDate: ev.endDate ? ev.endDate.toISOString() : null,
      enabled: Boolean(ev.isEnabled),
      voucherId: ev.voucherId,
      voucherCode: voucher?.code || null,
      voucherName: voucher?.name || null,
      registrations: evRegs.map((r) => formatParticipant(r, userMap.get(r.userId))),
    };
  });
}

module.exports = {
  confirmEventAttendance,
  getReceptionEvents,
  formatParticipant,
};
