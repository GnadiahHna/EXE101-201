const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');

const app = require('../src/app');
const configService = require('../src/config/config.service');
const { acquireLock, releaseLock, withJobLock } = require('../src/utils/jobLock');
const { JobLock } = require('../src/models');
const { APPOINTMENT_STATUSES, SHIFT_STATUSES } = require('../src/constants/enums');

test.describe('Phase 4: Multi-instance reliability, Leader Locking & Health Checks', () => {
  let server;
  let port;

  async function apiRequest(method, path, options = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, body: data };
  }

  test.before(async () => {
    const mongoUri = configService.mongoUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clinic_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  test.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await JobLock.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test.test('1. Health check (Liveness) returns 200 with uptime and status ok', async () => {
    const res = await apiRequest('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(typeof res.body.uptime === 'number');
  });

  test.test('2. Readiness probe returns 200 and mongo connection up', async () => {
    const res = await apiRequest('GET', '/api/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.equal(res.body.checks.database.status, 'up');
  });

  test.test('3. Distributed Leader Lock prevents concurrent job executions', async () => {
    const jobName = 'test_multi_instance_job';
    await JobLock.deleteMany({ jobName });

    let executions = 0;
    const task = async () => {
      executions++;
      await new Promise((r) => setTimeout(r, 100)); // Simulate job run
      return 'done';
    };

    // Instance 1 & Instance 2 attempt to acquire lock concurrently
    const [res1, res2] = await Promise.all([
      withJobLock(jobName, 5000, task, 'instance-worker-1'),
      withJobLock(jobName, 5000, task, 'instance-worker-2')
    ]);

    // Exactly one should succeed, the other skipped
    const executedCount = [res1, res2].filter((r) => r.executed).length;
    const skippedCount = [res1, res2].filter((r) => r.skipped).length;

    assert.equal(executedCount, 1, 'Only one instance should execute');
    assert.equal(skippedCount, 1, 'The other instance should be skipped');
    assert.equal(executions, 1, 'Task function should be called exactly once');

    // After completion, lock is released so a subsequent run can succeed
    const res3 = await withJobLock(jobName, 5000, task);
    assert.equal(res3.executed, true, 'Subsequent execution should succeed after lock release');
    assert.equal(executions, 2);
  });

  test.test('4. Manual acquireLock and releaseLock lifecycle', async () => {
    const jobName = 'manual_lock_test';
    await JobLock.deleteMany({ jobName });

    const lock1 = await acquireLock(jobName, 10000, 'instance-worker-1');
    assert.equal(lock1.acquired, true);

    // Second acquire by different process fails
    const lock2 = await acquireLock(jobName, 10000, 'instance-worker-2');
    assert.equal(lock2.acquired, false);
    assert.equal(lock2.reason, 'locked_by_other_instance');

    await releaseLock(jobName, 'instance-worker-1');

    // Acquire again succeeds
    const lock3 = await acquireLock(jobName, 10000, 'instance-worker-2');
    assert.equal(lock3.acquired, true);
    await releaseLock(jobName, 'instance-worker-2');
  });
});
