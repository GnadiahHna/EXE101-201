const { Router } = require('express');
const {
  completeAppointment,
  getByMyShift,
  getMyDetail,
  getMyByStatus,
  startAppointment,
} = require('../controllers/doctorAppointment.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../constants/enums');

const router = Router();
router.use(authenticate, authorize(ROLES.DOCTOR));
router.get('/status/:status', getMyByStatus);
router.get('/by-shift/:shiftId', getByMyShift);
router.get('/:appointmentId', getMyDetail);
router.put('/start/:appointmentId', startAppointment);
router.put('/complete/:appointmentId', completeAppointment);

// AI Intake Summary endpoint (Phase 6 / v2)
router.post('/:appointmentId/intake-summary', async (req, res, next) => {
  try {
    const { getIntakeSummary } = require('../services/intakeSummary.service');
    const forceRegenerate = req.query.regenerate === 'true' || req.body?.regenerate === true;
    const result = await getIntakeSummary(req.user, req.params.appointmentId, forceRegenerate);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
