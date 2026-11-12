const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * GET /api/health
 * Liveness Probe: Verifies process is alive and responsive.
 */
const getHealth = (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env: env.nodeEnv,
  });
};

/**
 * GET /api/ready
 * Readiness Probe: Verifies dependencies (MongoDB connectivity) with timeout.
 */
const getReadiness = async (_req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbOk = dbState === 1;

  // Execute quick ping command if readyState appears connected
  if (dbOk) {
    try {
      await mongoose.connection.db.admin().ping();
    } catch {
      dbOk = false;
    }
  }

  const isReady = dbOk;

  const checks = {
    database: {
      status: dbOk ? 'up' : 'down',
      readyState: dbState,
    },
    smtp: {
      status: env.smtpHost ? 'configured' : 'not_configured',
    },
  };

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
};

module.exports = {
  getHealth,
  getReadiness,
};
