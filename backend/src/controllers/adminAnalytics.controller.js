const adminAnalyticsService = require('../services/adminAnalytics.service');
const { sendSuccess } = require('../utils/response');

async function getAnalyticsOverview(req, res) {
  const data = await adminAnalyticsService.getAdminAnalyticsOverview(req.query);
  return sendSuccess(res, {
    message: 'Tổng hợp số liệu phân tích quản trị thành công',
    data,
  });
}

async function getUserGrowthAnalytics(req, res) {
  const data = await adminAnalyticsService.getUserGrowthAnalytics(req.query);
  return sendSuccess(res, {
    message: 'Tổng hợp số liệu tăng trưởng người dùng thành công',
    data,
  });
}

async function getTopDoctorsAnalytics(req, res) {
  const data = await adminAnalyticsService.getTopDoctorsAnalytics(req.query);
  return sendSuccess(res, {
    message: 'Tổng hợp bảng xếp hạng bác sĩ thành công',
    data,
  });
}

async function getMetricDefinitions(_req, res) {
  const data = adminAnalyticsService.getMetricCatalog();
  return sendSuccess(res, {
    message: 'Lấy danh mục định nghĩa chỉ số analytics thành công',
    data,
  });
}

async function getOperationalKpis(_req, res) {
  const data = await adminAnalyticsService.getOperationalKpiAnalytics();
  return sendSuccess(res, {
    message: 'Tổng hợp chỉ số vận hành nâng cao thành công',
    data,
  });
}

module.exports = {
  getAnalyticsOverview,
  getUserGrowthAnalytics,
  getTopDoctorsAnalytics,
  getOperationalKpis,
  getMetricDefinitions,
};

