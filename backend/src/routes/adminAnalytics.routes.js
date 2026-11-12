const { Router } = require('express');
const adminAnalyticsController = require('../controllers/adminAnalytics.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../constants/enums');

const router = Router();

// UC-ADM-08 Precondition: Requires authenticated Admin JWT
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', adminAnalyticsController.getAnalyticsOverview);
router.get('/overview', adminAnalyticsController.getAnalyticsOverview);
router.get('/user-growth', adminAnalyticsController.getUserGrowthAnalytics);
router.get('/top-doctors', adminAnalyticsController.getTopDoctorsAnalytics);
router.get('/operational-kpis', adminAnalyticsController.getOperationalKpis);
router.get('/metrics', adminAnalyticsController.getMetricDefinitions);

module.exports = router;

