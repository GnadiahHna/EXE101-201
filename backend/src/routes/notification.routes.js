const { Router } = require('express');
const { Notification } = require('../models');
const { authenticate } = require('../middlewares/auth.middleware');
const ApiError = require('../utils/ApiError');

const router = Router();

router.use(authenticate);

// GET /api/notifications - List user's notifications
router.get('/', async (req, res, next) => {
  try {
    const userId = Number(req.user.id || req.user.userId);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = Number(req.user.id || req.user.userId);
    const notifId = Number(req.params.id);

    const notif = await Notification.findOneAndUpdate(
      { id: notifId, userId },
      { $set: { read: true } },
      { returnDocument: 'after' },
    );

    if (!notif) {
      throw new ApiError(404, 'Thông báo không tồn tại');
    }

    return res.status(200).json({
      success: true,
      data: notif,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all - Mark all user's notifications as read
router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = Number(req.user.id || req.user.userId);
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });

    return res.status(200).json({
      success: true,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

