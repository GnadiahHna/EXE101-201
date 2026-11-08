const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'forgot_password_test_secret';
const TEST_DB_URI = process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/clinic_booking_test_forgot_password';

const app = require('../src/app');
const { User } = require('../src/models');
const { ROLES, GENDERS } = require('../src/constants/enums');

let server;
let baseUrl;

async function apiRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

describe('Forgot & Reset Password API Tests', () => {
  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();

    await User.create({
      id: 9991,
      email: 'user.forgot@example.com',
      fullName: 'Nguyen Van Test',
      password: await bcrypt.hash('oldPassword123', 10),
      userType: ROLES.PATIENT,
      gender: GENDERS.MALE,
      isEnable: true,
    });

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  it('1. Báo lỗi 404 khi email không tồn tại trong hệ thống', async () => {
    const res = await apiRequest('POST', '/api/auth/forgot-password', { email: 'notfound@example.com' });
    assert.strictEqual(res.status, 404);
  });

  it('2. Gửi yêu cầu quên mật khẩu thành công và tạo temporaryPassword', async () => {
    const res = await apiRequest('POST', '/api/auth/forgot-password', { email: 'user.forgot@example.com' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const user = await User.findOne({ email: 'user.forgot@example.com' });
    assert.ok(user.temporaryPassword);
    assert.ok(user.temporaryPasswordExpiresAt);
  });

  it('3. Đặt lại mật khẩu với temporaryPassword không hợp lệ -> 400', async () => {
    const res = await apiRequest('POST', '/api/auth/reset-password', {
      email: 'user.forgot@example.com',
      temporaryPassword: 'WRONG_PASSWORD',
      newPassword: 'newPassword123',
      confirmPassword: 'newPassword123',
    });
    assert.strictEqual(res.status, 400);
  });

  it('4. Đặt lại mật khẩu thành công với đúng temporaryPassword', async () => {
    // Generate known temporary password
    const user = await User.findOne({ email: 'user.forgot@example.com' });
    user.temporaryPassword = await bcrypt.hash('TEMP1234', 10);
    user.temporaryPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const res = await apiRequest('POST', '/api/auth/reset-password', {
      email: 'user.forgot@example.com',
      temporaryPassword: 'TEMP1234',
      newPassword: 'myBrandNewPassword123',
      confirmPassword: 'myBrandNewPassword123',
    });
    assert.strictEqual(res.status, 200);

    // Verify login with new password
    const loginRes = await apiRequest('POST', '/api/auth/login', {
      email: 'user.forgot@example.com',
      password: 'myBrandNewPassword123',
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.success, true);
  });
});

