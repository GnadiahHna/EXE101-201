const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = require('./app');
const env = require('./config/env');
const { validateConfig } = require('./config/validateConfig');
const { connectDB, disconnectDB } = require('./config/db');
const paymentMaintenanceJob = require('./jobs/paymentMaintenance.job');
const { startNoShowJob, stopNoShowJob, runNoShowScan } = require('./jobs/noShow.job');
const { startReminderJob, stopReminderJob } = require('./jobs/appointmentReminder.job');
const outboxService = require('./services/outbox.service');

const start = async () => {
  try {
    // Validate configuration before boot
    validateConfig();

    await connectDB();

    if (env.paymentJobEnabled && env.nodeEnv !== 'test') {
      paymentMaintenanceJob.start();
    }

    if (env.nodeEnv !== 'test') {
      startNoShowJob(60000);
      startReminderJob(60000);
      // Chạy quét ngay khi server khởi động để đồng bộ trạng thái quá hạn
      runNoShowScan().catch(e => console.warn('[server] Initial noShow scan warning:', e.message));
    }

    if (env.outboxEnableWorker && env.nodeEnv !== 'test') {
      outboxService.startOutboxWorker(env.outboxPollIntervalMs || 5000);
    }

    const server = app.listen(env.port, () => {
      console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received, shutting down gracefully...`);
      stopNoShowJob();
      stopReminderJob();
      await Promise.allSettled([
        paymentMaintenanceJob.stop(),
        outboxService.stopOutboxWorker(),
      ]);
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
