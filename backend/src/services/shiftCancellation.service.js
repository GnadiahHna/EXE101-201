const mongoose = require('mongoose');
const {
  Appointment,
  DoctorShift,
  ShiftCancellationRequest,
  User,
} = require('../models');
const {
  ROLES,
  APPOINTMENT_STATUSES,
  AUDIT_ACTIONS,
  SHIFT_STATUSES,
} = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const outboxService = require('./outbox.service');
const { clock } = require('./clock.service');
const { configService } = require('../config/config.service');
const { cancelAppointmentByStaff } = require('./receptionistAppointment.service');

const parseRequestId = (value) => {
  if (value === undefined || value === null) {
    throw new ApiError(400, 'Mã yêu cầu không được để trống', 'INVALID_REQUEST_ID');
  }
  const str = String(value).trim();
  if (mongoose.Types.ObjectId.isValid(str)) {
    return str;
  }
  const num = Number(str);
  if (Number.isSafeInteger(num) && num > 0) {
    return num;
  }
  throw new ApiError(400, 'Định danh yêu cầu không hợp lệ', 'INVALID_REQUEST_ID');
};

const buildRequestQuery = (idInput) => {
  if (typeof idInput === 'number') {
    return { id: idInput };
  }
  if (mongoose.Types.ObjectId.isValid(idInput)) {
    return {
      $or: [{ _id: new mongoose.Types.ObjectId(idInput) }, { id: idInput }],
    };
  }
  const num = Number(idInput);
  if (!Number.isNaN(num)) {
    return { id: num };
  }
  return { id: idInput };
};

const serializeRequest = (request, doctorName = null) => ({
  id: request.id || request._id?.toString(),
  shiftId: request.shiftId,
  doctorId: request.doctorId,
  doctorName: doctorName || request.doctorName || 'Bác sĩ',
  shiftDate: request.shiftDate,
  shift: request.shiftType,
  reason: request.reason,
  affectedAppointmentCount: request.affectedAppointmentCount ?? 0,
  status: request.status,
  decisionNote: request.decisionNote || '',
  decidedBy: request.decidedBy ?? request.approvedBy ?? request.rejectedBy ?? null,
  decidedAt: request.decidedAt?.toISOString() || request.approvedAt?.toISOString() || request.rejectedAt?.toISOString() || null,
  approvedBy: request.approvedBy ?? null,
  approvedAt: request.approvedAt?.toISOString() || null,
  rejectedBy: request.rejectedBy ?? null,
  rejectedAt: request.rejectedAt?.toISOString() || null,
  requestedAt: request.createdAt?.toISOString() || null,
});

/**
 * Doctor submits a shift cancellation request.
 * Enforces doctorId matching JWT, no duplicate PENDING request.
 */
const create = async (actor, shiftId, input = {}) => {
  const actorId = actor?.userId ?? actor?.id;
  const actorRole = actor?.role ?? actor?.userType;

  if (!actor || actorRole !== ROLES.DOCTOR) {
    throw new ApiError(403, 'Chỉ bác sĩ mới có quyền tạo yêu cầu hủy ca trực', 'FORBIDDEN_ROLE');
  }

  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  if (!reason) {
    throw new ApiError(400, 'Lý do xin hủy ca không được để trống', 'REASON_REQUIRED');
  }
  if (reason.length > 500) {
    throw new ApiError(400, 'Lý do xin hủy ca tối đa 500 ký tự', 'REASON_TOO_LONG');
  }

  const numericShiftId = Number(shiftId);
  const shiftQuery = Number.isSafeInteger(numericShiftId) && numericShiftId > 0
    ? { id: numericShiftId }
    : (mongoose.Types.ObjectId.isValid(shiftId) ? { _id: shiftId } : { id: shiftId });

  const shift = await DoctorShift.findOne(shiftQuery).lean();
  if (!shift) {
    throw new ApiError(404, 'Không tìm thấy ca trực', 'SHIFT_NOT_FOUND');
  }

  // Verify ownership: shift must belong to this doctor
  const shiftDoctorId = String(shift.doctorId);
  const currentDoctorId = String(actorId);
  if (shiftDoctorId !== currentDoctorId) {
    throw new ApiError(403, 'Bác sĩ chỉ có quyền yêu cầu hủy ca trực của chính mình', 'DOCTOR_MISMATCH');
  }

  if (shift.status !== 'ACTIVE') {
    throw new ApiError(409, 'Chỉ ca trực đang hoạt động (ACTIVE) mới có thể gửi yêu cầu hủy', 'SHIFT_NOT_ACTIVE');
  }

  // Chặn yêu cầu hủy ca làm việc trong quá khứ hoặc ca đã kết thúc
  const todayDate = clock.today();
  const nowTime = clock.currentTime();
  const shiftEndTime = shift.endTime || (shift.shift === 'MORNING' ? '12:00' : shift.shift === 'AFTERNOON' ? '17:00' : '21:00');

  if (shift.date < todayDate || (shift.date === todayDate && shiftEndTime <= nowTime)) {
    throw new ApiError(400, 'Không thể yêu cầu hủy ca làm việc đã kết thúc hoặc trong quá khứ', 'PAST_SHIFT_CANNOT_BE_CANCELLED');
  }

  // Active bookings count
  const activeStatuses = [
    APPOINTMENT_STATUSES.PENDING_PAYMENT,
    APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
    APPOINTMENT_STATUSES.CONFIRMED,
    APPOINTMENT_STATUSES.CHECKED_IN,
    APPOINTMENT_STATUSES.IN_PROGRESS,
  ];

  const affectedCount = await Appointment.countDocuments({
    doctorId: shift.doctorId,
    shiftId: shift.id,
    status: { $in: activeStatuses },
  });

  // Check for existing pending request explicitly as well as relying on unique index
  const existingPending = await ShiftCancellationRequest.findOne({
    shiftId: shift.id,
    doctorId: shift.doctorId,
    status: 'PENDING',
  });
  if (existingPending) {
    throw new ApiError(409, 'Đã có yêu cầu hủy ca trực đang chờ duyệt cho ca trực này', 'DUPLICATE_PENDING_REQUEST');
  }

  try {
    const request = await ShiftCancellationRequest.create({
      shiftId: shift.id,
      doctorId: shift.doctorId,
      shiftDate: shift.date,
      shiftType: shift.shift,
      reason,
      affectedAppointmentCount: affectedCount,
      status: 'PENDING',
    });

    // Bắn chuông thông báo cho Lễ tân và Quản trị viên theo Phương án 1
    try {
      const { notificationService } = require('./notification.service');
      const shiftName = shift.shift === 'MORNING' ? 'Sáng' : shift.shift === 'AFTERNOON' ? 'Chiều' : 'Tối';
      const doctorDisplayName = actor.fullName || 'Bác sĩ';
      
      const notifPayload = {
        title: 'Yêu cầu hủy ca trực mới từ Bác sĩ',
        message: `${doctorDisplayName} vừa gửi yêu cầu hủy ca ${shiftName} ngày ${shift.date}. Lý do: ${reason}. (Ảnh hưởng ${affectedCount} lịch hẹn).`,
        type: 'SYSTEM',
        link: '/receptionist/shift',
        metadata: {
          requestId: request.id || request._id,
          shiftId: shift.id,
          doctorId: shift.doctorId,
          affectedCount,
        },
      };

      await Promise.all([
        notificationService.broadcastToRole({ role: 'RECEPTIONIST', ...notifPayload }),
        notificationService.broadcastToRole({ role: 'ADMIN', ...notifPayload }),
      ]);
    } catch (notifErr) {
      console.warn('[shiftCancellation] Failed to notify receptionists/admins:', notifErr.message);
    }

    return serializeRequest(request, actor.fullName);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Đã có yêu cầu hủy ca trực đang chờ duyệt cho ca trực này', 'DUPLICATE_PENDING_REQUEST');
    }
    throw error;
  }
};

/**
 * Doctor views their own shift cancellation requests.
 */
const getMine = async (actor) => {
  const actorId = actor?.userId ?? actor?.id;
  const numericId = Number(actorId);
  const docQuery = Number.isSafeInteger(numericId)
    ? { $or: [{ doctorId: numericId }, { doctorId: actorId }] }
    : { doctorId: actorId };

  const requests = await ShiftCancellationRequest.find(docQuery).sort({ createdAt: -1 }).lean();
  return requests.map((r) => serializeRequest(r));
};

/**
 * Receptionist / Admin gets pending cancellation requests with pagination and summary.
 */
const getPending = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = { status: 'PENDING' };

  const [total, requests] = await Promise.all([
    ShiftCancellationRequest.countDocuments(filter),
    ShiftCancellationRequest.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
  ]);

  const doctorIds = [...new Set(requests.map((r) => r.doctorId))];
  const doctors = await User.find({
    $or: [{ id: { $in: doctorIds } }, { _id: { $in: doctorIds.filter(mongoose.Types.ObjectId.isValid) } }],
  }).select('id fullName').lean();

  const nameMap = new Map();
  for (const doc of doctors) {
    nameMap.set(String(doc.id), doc.fullName);
    if (doc._id) nameMap.set(doc._id.toString(), doc.fullName);
  }

  // Recalculate real-time active bookings count for precision
  const enrichedItems = await Promise.all(
    requests.map(async (req) => {
      const activeCount = await Appointment.countDocuments({
        shiftId: req.shiftId,
        status: {
          $in: [
            APPOINTMENT_STATUSES.PENDING_PAYMENT,
            APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
            APPOINTMENT_STATUSES.CONFIRMED,
            APPOINTMENT_STATUSES.CHECKED_IN,
            APPOINTMENT_STATUSES.IN_PROGRESS,
          ],
        },
      });

      return {
        ...serializeRequest(req, nameMap.get(String(req.doctorId)) || 'Bác sĩ'),
        affectedAppointmentCount: activeCount,
      };
    }),
  );

  const totalAffectedAppointments = enrichedItems.reduce(
    (sum, item) => sum + (item.affectedAppointmentCount || 0),
    0,
  );

  return {
    items: enrichedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    summary: {
      pendingRequestsCount: total,
      totalAffectedAppointments,
    },
  };
};

/**
 * Receptionist / Admin approves doctor's shift cancellation request (UC-REC-06).
 */
const approveRequest = async (actor, requestId, options = {}) => {
  const allowedRoles = [ROLES.RECEPTIONIST, ROLES.ADMIN];
  const actorRole = actor?.role ?? actor?.userType;
  if (!actor || !allowedRoles.includes(actorRole)) {
    throw new ApiError(403, 'Chỉ Lễ tân hoặc Quản trị viên mới có quyền duyệt yêu cầu hủy ca', 'FORBIDDEN_ROLE');
  }

  const parsedId = parseRequestId(requestId);
  const requestQuery = buildRequestQuery(parsedId);
  const request = await ShiftCancellationRequest.findOne(requestQuery);

  if (!request) {
    throw new ApiError(404, `Không tìm thấy yêu cầu hủy ca với ID: ${requestId}`, 'REQUEST_NOT_FOUND');
  }

  // Idempotency: if already APPROVED, return current state
  if (request.status === 'APPROVED') {
    const serialized = serializeRequest(request.toJSON ? request.toJSON() : request);
    serialized.idempotent = true;
    return {
      success: true,
      idempotent: true,
      message: 'Yêu cầu hủy ca đã được duyệt trước đó',
      request: serialized,
    };
  }

  if (request.status === 'REJECTED') {
    throw new ApiError(409, 'Không thể duyệt yêu cầu hủy ca đã bị từ chối', 'INVALID_REQUEST_STATUS');
  }

  const shift = await DoctorShift.findOne({ id: request.shiftId });
  if (!shift) {
    throw new ApiError(404, `Không tìm thấy ca trực của yêu cầu: ${request.shiftId}`, 'SHIFT_NOT_FOUND');
  }

  // Active bookings check
  const activeStatuses = [
    APPOINTMENT_STATUSES.PENDING_PAYMENT,
    APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
    APPOINTMENT_STATUSES.CONFIRMED,
    APPOINTMENT_STATUSES.CHECKED_IN,
  ];

  const activeAppointments = await Appointment.find({
    shiftId: shift.id,
    status: { $in: activeStatuses },
  });

  const effectivePolicy = (options.policy || configService.shiftCancelPolicy || 'BLOCK_UNTIL_RESOLVED').toUpperCase();

  if (activeAppointments.length > 0) {
    if (effectivePolicy === 'AUTO_CANCEL_AFFECTED') {
      // Auto cancel affected appointments using REC-05 cancellation logic
      const staffCancelReason = `Ca trực bác sĩ bị hủy (Duyệt yêu cầu: ${request.reason || 'Lý do bất khả kháng'})`;
      for (const appt of activeAppointments) {
        await cancelAppointmentByStaff(actor, appt.id, { reason: staffCancelReason });
      }
    } else {
      // BLOCK_UNTIL_RESOLVED: reject with 409
      throw new ApiError(
        409,
        `Ca trực còn ${activeAppointments.length} lịch hẹn đang hoạt động. Vui lòng dời hoặc hủy từng lịch trước khi duyệt hủy ca.`,
        'SHIFT_HAS_ACTIVE_BOOKINGS',
        [{
          activeBookingsCount: activeAppointments.length,
          activeAppointments: activeAppointments.map((a) => ({
            id: a.id,
            appointmentNo: a.appointmentNo,
            patientId: a.patientId,
            status: a.status,
            appointmentTime: a.appointmentTime,
          })),
        }],
      );
    }
  }

  // Conditional atomic update for PENDING -> APPROVED
  const decidedAt = clock.now();
  const actorUserId = actor.userId ?? actor.id;
  const note = typeof options.note === 'string' ? options.note.trim() : '';

  const updatedRequest = await ShiftCancellationRequest.findOneAndUpdate(
    {
      ...requestQuery,
      status: 'PENDING',
    },
    {
      $set: {
        status: 'APPROVED',
        approvedBy: actorUserId,
        approvedAt: decidedAt,
        decidedBy: actorUserId,
        decidedAt,
        decisionNote: note,
      },
    },
    { new: true },
  );

  // If another concurrent request approved or changed it
  if (!updatedRequest) {
    const reloaded = await ShiftCancellationRequest.findOne(requestQuery);
    if (reloaded?.status === 'APPROVED') {
      return {
        success: true,
        idempotent: true,
        message: 'Yêu cầu hủy ca đã được duyệt trước đó',
        request: serializeRequest(reloaded.toJSON ? reloaded.toJSON() : reloaded),
      };
    }
    throw new ApiError(409, 'Trạng thái yêu cầu hủy ca đã thay đổi hoặc không còn ở trạng thái PENDING', 'CONCURRENT_CONFLICT');
  }

  // Atomically delete the DoctorShift document so the slot becomes empty and can be registered again
  // Or if appointments exist (none active), removing or archiving it.
  await DoctorShift.deleteOne({ id: shift.id });

  // Outbox notification for doctor
  await outboxService.recordEvent({
    eventType: 'SHIFT_CANCELLATION_APPROVED',
    channel: 'WEBSOCKET',
    payload: {
      recipient: `doctor_${shift.doctorId}`,
      shiftId: shift.id,
      doctorId: shift.doctorId,
      shiftDate: shift.date,
      shift: shift.shift,
      approvedBy: actorUserId,
      approvedAt: decidedAt,
      decisionNote: note,
    },
  });

  // Bắn chuông thông báo cho Bác sĩ biết yêu cầu hủy ca đã được duyệt
  try {
    const { notificationService } = require('./notification.service');
    await notificationService.notifyUser({
      userId: shift.doctorId,
      title: 'Yêu cầu hủy ca làm việc đã được duyệt',
      message: `Yêu cầu hủy ca trực ngày ${shift.date} của bạn đã được phê duyệt thành công.${note ? ` Ghi chú: ${note}` : ''}`,
      type: 'SYSTEM',
      link: '/doctor/shifts',
      metadata: {
        shiftId: shift.id,
        shiftDate: shift.date,
      },
      sendEmail: false,
    });

    // Bắn chuông thông báo cho tất cả bệnh nhân có lịch bị ảnh hưởng
    if (activeAppointments.length > 0) {
      for (const appt of activeAppointments) {
        await notificationService.notifyUser({
          userId: appt.patientId,
          title: 'Ca trực bác sĩ có thay đổi đột xuất',
          message: `Lịch hẹn #${appt.appointmentNo} vào ngày ${shift.date} bị ảnh hưởng do bác sĩ hủy ca trực. Phòng khám sẽ liên hệ để hỗ trợ sắp xếp lại lịch khám sớm nhất cho bạn.`,
          type: 'STATUS_CHANGE',
          link: '/patient/appointments',
          metadata: {
            appointmentId: appt.id,
            appointmentNo: appt.appointmentNo,
            shiftDate: shift.date,
          },
          sendEmail: false,
        });
      }
    }
  } catch (notifErr) {
    console.warn('[shiftCancellation] Failed to notify doctor/patients:', notifErr.message);
  }

  // Outbox notification for affected patients if auto cancelled
  if (effectivePolicy === 'AUTO_CANCEL_AFFECTED' && activeAppointments.length > 0) {
    for (const appt of activeAppointments) {
      await outboxService.recordEvent({
        eventType: 'PATIENT_APPOINTMENT_CANCELLED_DUE_TO_SHIFT',
        channel: 'EMAIL',
        payload: {
          recipient: `patient_${appt.patientId}`,
          appointmentId: appt.id,
          appointmentNo: appt.appointmentNo,
          patientId: appt.patientId,
          shiftDate: shift.date,
          reason: `Ca khám bị hủy bởi phòng khám do bác sĩ hủy ca`,
        },
      });
    }
  }

  // Audit Log
  await auditService.log({
    actor: {
      userId: actorUserId,
      id: actorUserId,
      role: actorRole,
      fullName: actor.fullName,
    },
    action: AUDIT_ACTIONS.APPROVE_SHIFT_CANCEL || 'APPROVE_SHIFT_CANCEL',
    resource: {
      type: 'ShiftCancellationRequest',
      id: updatedRequest.id || updatedRequest._id,
    },
    reason: note || 'Duyệt yêu cầu hủy ca của bác sĩ',
    summary: `Nhân viên ${actor.fullName || actorUserId} duyệt yêu cầu hủy ca trực ID: ${shift.id}`,
    changes: {
      oldStatus: 'PENDING',
      newStatus: 'APPROVED',
      shiftId: shift.id,
      policy: effectivePolicy,
      decisionNote: note,
    },
  });

  const serialized = serializeRequest(updatedRequest.toJSON ? updatedRequest.toJSON() : updatedRequest);
  return {
    success: true,
    idempotent: false,
    message: 'Duyệt yêu cầu hủy ca trực thành công',
    request: serialized,
  };
};

/**
 * Receptionist / Admin rejects doctor's shift cancellation request (UC-REC-06).
 */
const rejectRequest = async (actor, requestId, { note } = {}) => {
  const allowedRoles = [ROLES.RECEPTIONIST, ROLES.ADMIN];
  const actorRole = actor?.role ?? actor?.userType;
  if (!actor || !allowedRoles.includes(actorRole)) {
    throw new ApiError(403, 'Chỉ Lễ tân hoặc Quản trị viên mới có quyền từ chối yêu cầu hủy ca', 'FORBIDDEN_ROLE');
  }

  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (!cleanNote) {
    throw new ApiError(400, 'Ghi chú lý do từ chối (note) là bắt buộc', 'REJECTION_NOTE_REQUIRED');
  }

  const parsedId = parseRequestId(requestId);
  const requestQuery = buildRequestQuery(parsedId);
  const request = await ShiftCancellationRequest.findOne(requestQuery);

  if (!request) {
    throw new ApiError(404, `Không tìm thấy yêu cầu hủy ca với ID: ${requestId}`, 'REQUEST_NOT_FOUND');
  }

  // Idempotency: if already REJECTED, return current state
  if (request.status === 'REJECTED') {
    const serialized = serializeRequest(request.toJSON ? request.toJSON() : request);
    serialized.idempotent = true;
    return {
      success: true,
      idempotent: true,
      message: 'Yêu cầu hủy ca đã bị từ chối trước đó',
      request: serialized,
    };
  }

  if (request.status === 'APPROVED') {
    throw new ApiError(409, 'Không thể từ chối yêu cầu hủy ca đã được duyệt', 'INVALID_REQUEST_STATUS');
  }

  const decidedAt = clock.now();
  const actorUserId = actor.userId ?? actor.id;

  const updatedRequest = await ShiftCancellationRequest.findOneAndUpdate(
    {
      ...requestQuery,
      status: 'PENDING',
    },
    {
      $set: {
        status: 'REJECTED',
        rejectedBy: actorUserId,
        rejectedAt: decidedAt,
        decidedBy: actorUserId,
        decidedAt,
        decisionNote: cleanNote,
      },
    },
    { new: true },
  );

  if (!updatedRequest) {
    const reloaded = await ShiftCancellationRequest.findOne(requestQuery);
    if (reloaded?.status === 'REJECTED') {
      return {
        success: true,
        idempotent: true,
        message: 'Yêu cầu hủy ca đã bị từ chối trước đó',
        request: serializeRequest(reloaded.toJSON ? reloaded.toJSON() : reloaded),
      };
    }
    throw new ApiError(409, 'Trạng thái yêu cầu hủy ca đã thay đổi hoặc không còn ở trạng thái PENDING', 'CONCURRENT_CONFLICT');
  }

  // Outbox notification for doctor
  await outboxService.recordEvent({
    eventType: 'SHIFT_CANCELLATION_REJECTED',
    channel: 'EMAIL',
    payload: {
      recipient: `doctor_${updatedRequest.doctorId}`,
      shiftId: updatedRequest.shiftId,
      doctorId: updatedRequest.doctorId,
      shiftDate: updatedRequest.shiftDate,
      rejectedBy: actorUserId,
      rejectedAt: decidedAt,
      decisionNote: cleanNote,
    },
  });

  // Audit Log
  await auditService.log({
    actor: {
      userId: actorUserId,
      id: actorUserId,
      role: actorRole,
      fullName: actor.fullName,
    },
    action: AUDIT_ACTIONS.REJECT_SHIFT_CANCEL || 'REJECT_SHIFT_CANCEL',
    resource: {
      type: 'ShiftCancellationRequest',
      id: updatedRequest.id || updatedRequest._id,
    },
    reason: cleanNote,
    summary: `Nhân viên ${actor.fullName || actorUserId} từ chối yêu cầu hủy ca trực ID: ${updatedRequest.shiftId}`,
    changes: {
      oldStatus: 'PENDING',
      newStatus: 'REJECTED',
      decisionNote: cleanNote,
    },
  });

  const serialized = serializeRequest(updatedRequest.toJSON ? updatedRequest.toJSON() : updatedRequest);
  return {
    success: true,
    idempotent: false,
    message: 'Từ chối yêu cầu hủy ca trực thành công',
    request: serialized,
  };
};

module.exports = {
  create,
  getMine,
  getPending,
  approveRequest,
  rejectRequest,
};
