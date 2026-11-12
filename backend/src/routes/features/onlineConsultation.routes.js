const { Router } = require('express');
const onlineConsultationController = require('../../controllers/onlineConsultation.controller');
const { authenticate, requireRoles } = require('../../middlewares/auth.middleware');
const { ROLES } = require('../../constants/enums');

const router = Router();

// POST /appointments/:id/join-online - Bệnh nhân vào phòng khám trực tuyến
router.post(
  '/:id/join-online',
  authenticate,
  requireRoles(ROLES.PATIENT),
  onlineConsultationController.joinOnline,
);

// GET /appointments/:id/video-room - Lấy thông tin phòng gọi video (bác sĩ hoặc bệnh nhân của lịch đó)
router.get(
  '/:id/video-room',
  authenticate,
  async (req, res, next) => {
    try {
      const { Appointment, User } = require('../../models');
      const { defaultVideoProvider } = require('../../services/videoProvider.service');
      const ApiError = require('../../utils/ApiError');
      const jwt = require('jsonwebtoken');
      const env = require('../../config/env');

      const apptId = Number(req.params.id);
      const userId = Number(req.user.id || req.user.userId);
      const appointment = await Appointment.findOne({ id: apptId });

      if (!appointment) {
        throw new ApiError(404, 'Không tìm thấy lịch hẹn');
      }

      const isPatient = appointment.patientId === userId;
      const isDoctor = appointment.doctorId === userId;

      if (!isPatient && !isDoctor) {
        throw new ApiError(403, 'Bạn không có quyền truy cập vào phòng khám này');
      }

      // Check join token from query or header
      const token = req.query.joinToken || req.headers['x-join-token'];
      if (!token) {
        throw new ApiError(401, 'Cần có joinToken để vào phòng video');
      }

      try {
        const secret = env.joinTokenSecret || 'ci_test_join_token_secret_min_32_chars_12345';
        jwt.verify(token, secret);
      } catch {
        throw new ApiError(401, 'joinToken không hợp lệ hoặc đã hết hạn');
      }

      const user = await User.findOne({ id: userId }).select('fullName').lean();
      const meetingCode = appointment.meeting?.code || appointment.joinCode;
      const roomName = defaultVideoProvider.generateRoomName(meetingCode);

      return res.status(200).json({
        success: true,
        data: {
          roomName,
          domain: defaultVideoProvider.domain,
          displayName: user?.fullName || (isDoctor ? 'Bác sĩ' : 'Bệnh nhân'),
          isDoctor,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = {
  basePath: '/appointments',
  router,
};
