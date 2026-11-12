const { Router } = require('express');
const { Waitlist } = require('../models');
const { authenticate, requireRoles } = require('../middlewares/auth.middleware');
const { ROLES } = require('../constants/enums');
const { addToWaitlist } = require('../services/waitlist.service');
const ApiError = require('../utils/ApiError');

const router = Router();

router.use(authenticate);

// POST /api/waitlist - Đăng ký danh sách chờ
router.post('/', requireRoles(ROLES.PATIENT), async (req, res, next) => {
  try {
    const patientId = Number(req.user.id || req.user.userId);
    const { doctorId, specialtyId, dateFrom, dateTo, preferredShift, notes } = req.body;

    const entry = await addToWaitlist({
      patientId,
      doctorId,
      specialtyId,
      dateFrom,
      dateTo,
      preferredShift,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký danh sách chờ thành công',
      data: entry,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/waitlist/my-requests - Xem các yêu cầu chờ của bệnh nhân
router.get('/my-requests', requireRoles(ROLES.PATIENT), async (req, res, next) => {
  try {
    const patientId = Number(req.user.id || req.user.userId);
    const requests = await Waitlist.find({ patientId }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/waitlist/:id - Hủy yêu cầu chờ
router.delete('/:id', requireRoles(ROLES.PATIENT), async (req, res, next) => {
  try {
    const patientId = Number(req.user.id || req.user.userId);
    const id = Number(req.params.id);

    const entry = await Waitlist.findOneAndUpdate(
      { id, patientId, status: { $in: ['WAITING', 'HOLDING'] } },
      { $set: { status: 'CANCELLED' } },
      { returnDocument: 'after' },
    );

    if (!entry) {
      throw new ApiError(404, 'Yêu cầu không tồn tại hoặc đã kết thúc');
    }

    return res.status(200).json({
      success: true,
      message: 'Đã hủy yêu cầu chờ',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
