const { Notification, User } = require('../models');
const outboxService = require('./outbox.service');

/**
 * Base Notification Channel Interface
 */
class NotificationChannel {
  async send({ recipient, title, message, link, metadata }) {
    throw new Error('send() must be implemented by concrete NotificationChannel');
  }
}

/**
 * Email Notification Channel (enqueueing via transactional outbox)
 */
class EmailNotificationChannel extends NotificationChannel {
  async send({ recipient, title, message, link, metadata = {} }) {
    const user = await User.findOne({ id: recipient.id || recipient.userId }).select('email fullName').lean();
    if (!user || !user.email) return;

    await outboxService.recordEvent({
      eventType: 'NOTIFICATION_EMAIL',
      channel: 'EMAIL',
      payload: {
        to: user.email,
        subject: `[Nano Clinic] ${title}`,
        html: `<h3>Xin chào ${user.fullName || 'Quý khách'},</h3>
<p>${message}</p>
${link ? `<p><a href="${link}" style="background-color: #0e82fd; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">Xem chi tiết</a></p>` : ''}
<hr/>
<small>Đây là thông báo tự động từ Phòng khám Đa khoa Quốc tế Nano Clinic.</small>`,
      },
    });
  }
}

/**
 * In-App Notification Service (Stores notifications in DB & dispatches to external channels)
 */
class NotificationService {
  constructor() {
    this.channels = {
      email: new EmailNotificationChannel(),
    };
  }

  async notifyUser({ userId, title, message, type = 'SYSTEM', link = null, metadata = {}, sendEmail = true }) {
    if (!userId) return null;

    // 1. Create In-App Notification in DB
    const notif = await Notification.create({
      userId: Number(userId),
      title,
      message,
      type,
      link,
      metadata,
    });

    // 2. Dispatch to external channel (e.g. Email outbox)
    if (sendEmail && this.channels.email) {
      await this.channels.email.send({
        recipient: { id: userId },
        title,
        message,
        link,
        metadata,
      }).catch((err) => console.warn('[NotificationService] Email delivery warning:', err.message));
    }

    return notif;
  }
}

const notificationService = new NotificationService();

module.exports = {
  NotificationChannel,
  EmailNotificationChannel,
  notificationService,
};
