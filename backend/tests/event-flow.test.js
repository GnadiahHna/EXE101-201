const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'event_flow_test_secret_key';
const TEST_DB_URI =
  process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/clinic_booking_test_event_flow';

const app = require('../src/app');
const {
  User,
  Voucher,
  UserVoucher,
  Event,
  UserEvent,
  AuditLog,
} = require('../src/models');
const { ROLES, VOUCHER_TYPES, EVENT_REGISTRATION_STATUSES } = require('../src/constants/enums');
const { signAccessToken } = require('../src/utils/jwt');

let server;
let baseUrl;

let adminUser;
let adminToken;
let receptionistUser;
let receptionistToken;
let patient1;
let patient1Token;
let patient2;
let patient2Token;

async function apiRequest(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

describe('Event End-to-End Flow: Admin Create/Update/Delete -> Home Public Display -> Patient Register -> Reception Check-in & Auto-Issue Voucher', () => {
  let giftVoucher;
  let createdEventId;
  let hiddenEventId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();

    const passwordHash = await bcrypt.hash('Secret@123', 10);

    adminUser = await User.create({
      id: 1,
      email: 'admin_event@clinicbooking.com',
      password: passwordHash,
      fullName: 'Admin Sự Kiện',
      userType: ROLES.ADMIN,
      gender: 'Other',
      isEnable: true,
    });
    adminToken = signAccessToken(adminUser);

    receptionistUser = await User.create({
      id: 2,
      email: 'recep_event@clinicbooking.com',
      password: passwordHash,
      fullName: 'Lễ Tân Sự Kiện',
      userType: ROLES.RECEPTIONIST,
      gender: 'Female',
      isEnable: true,
    });
    receptionistToken = signAccessToken(receptionistUser);

    patient1 = await User.create({
      id: 3,
      email: 'pat1_event@clinicbooking.com',
      password: passwordHash,
      fullName: 'Bệnh Nhân Tham Gia 1',
      userType: ROLES.PATIENT,
      gender: 'Female',
      phoneNumber: '0901112222',
      isEnable: true,
    });
    patient1Token = signAccessToken(patient1);

    patient2 = await User.create({
      id: 4,
      email: 'pat2_event@clinicbooking.com',
      password: passwordHash,
      fullName: 'Bệnh Nhân Tham Gia 2',
      userType: ROLES.PATIENT,
      gender: 'Male',
      phoneNumber: '0903334444',
      isEnable: true,
    });
    patient2Token = signAccessToken(patient2);

    // Tạo sẵn 1 Voucher quà tặng sự kiện
    giftVoucher = await Voucher.create({
      id: 10,
      code: 'EVENTGIFT20',
      name: 'Quà tặng tham gia sự kiện giảm 20%',
      discountValue: 20,
      type: VOUCHER_TYPES.DISCOUNT,
      enable: true,
      expiryDate: new Date('2028-12-31T23:59:00.000Z'),
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
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

  it('1. Phân quyền: Ngăn chặn Patient gọi POST /events/create hoặc GET /events/all (403 Forbidden)', async () => {
    const createRes = await apiRequest('POST', '/events/create', {
      token: patient1Token,
      body: {
        title: 'Sự kiện trái phép',
        startDate: '01/12/2027 08:00',
        endDate: '15/12/2027 17:00',
        isEnabled: true,
      },
    });
    assert.strictEqual(createRes.status, 403);

    const listAllRes = await apiRequest('GET', '/events/all', {
      token: patient1Token,
    });
    assert.strictEqual(listAllRes.status, 403);
  });

  it('2. Validation: Từ chối tạo sự kiện khi endDate trước startDate (400 Bad Request)', async () => {
    const res = await apiRequest('POST', '/events/create', {
      token: adminToken,
      body: {
        title: 'Sự kiện sai ngày',
        startDate: '20/12/2027 10:00',
        endDate: '10/12/2027 08:00',
        isEnabled: true,
      },
    });
    assert.strictEqual(res.status, 400);
  });

  it('3. Admin tạo Sự kiện gắn Voucher với định dạng ngày "dd/MM/yyyy HH:mm" và trả về ISO-8601 kèm voucherCode/voucherName', async () => {
    const res = await apiRequest('POST', '/events/create', {
      token: adminToken,
      body: {
        title: 'Ngày hội Sức khỏe Tim mạch 2027',
        description: 'Tầm soát huyết áp miễn phí và nhận voucher giảm 20%',
        location: '123 Nguyễn Văn Linh, Đà Nẵng',
        startDate: '01/12/2027 08:00',
        endDate: '31/12/2027 17:30',
        isEnabled: true,
        voucherId: giftVoucher.id,
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.title, 'Ngày hội Sức khỏe Tim mạch 2027');
    assert.strictEqual(res.body.data.voucherId, giftVoucher.id);
    assert.strictEqual(res.body.data.voucherCode, 'EVENTGIFT20');
    assert.strictEqual(res.body.data.voucherName, 'Quà tặng tham gia sự kiện giảm 20%');
    assert.strictEqual(res.body.data.isEnabled, true);
    assert.ok(!Number.isNaN(new Date(res.body.data.startDate).getTime()));
    assert.ok(!Number.isNaN(new Date(res.body.data.endDate).getTime()));

    createdEventId = res.body.data.id;

    // Tạo thêm 1 sự kiện bị ẩn (isEnabled: false)
    const hiddenRes = await apiRequest('POST', '/events/create', {
      token: adminToken,
      body: {
        title: 'Sự kiện nội bộ đang ẩn',
        startDate: '01/12/2027 08:00',
        endDate: '31/12/2027 17:30',
        isEnabled: false,
      },
    });
    assert.strictEqual(hiddenRes.status, 201);
    hiddenEventId = hiddenRes.body.data.id;
  });

  it('4. Admin xem GET /events/all thấy toàn bộ sự kiện, trong khi Trang chủ GET /events chỉ thấy sự kiện đang hiển thị (isEnabled: true)', async () => {
    const allRes = await apiRequest('GET', '/events/all', { token: adminToken });
    assert.strictEqual(allRes.status, 200);
    assert.strictEqual(allRes.body.data.length, 2);

    const publicRes = await apiRequest('GET', '/events');
    assert.strictEqual(publicRes.status, 200);
    assert.strictEqual(publicRes.body.data.length, 1);
    assert.strictEqual(publicRes.body.data[0].id, createdEventId);
    assert.strictEqual(publicRes.body.data[0].voucherCode, 'EVENTGIFT20');
  });

  it('5. Bệnh nhân đăng ký tham gia sự kiện (POST /events/:eventId/register) -> tạo bản ghi PENDING và chặn đăng ký trùng (409 Conflict)', async () => {
    const regRes = await apiRequest('POST', `/events/${createdEventId}/register`, {
      token: patient1Token,
    });
    assert.ok([200, 201].includes(regRes.status));
    assert.strictEqual(regRes.body.data.eventId, createdEventId);
    assert.strictEqual(regRes.body.data.userId, patient1.id);
    assert.strictEqual(regRes.body.data.status, EVENT_REGISTRATION_STATUSES.PENDING);

    // Đăng ký lặp lại lần 2 bị chặn 409 Conflict
    const dupRes = await apiRequest('POST', `/events/${createdEventId}/register`, {
      token: patient1Token,
    });
    assert.strictEqual(dupRes.status, 409);

    // Kiểm tra GET /events/my của bệnh nhân (khớp contract patientEvents.ts)
    const myRes = await apiRequest('GET', '/events/my', {
      token: patient1Token,
    });
    assert.strictEqual(myRes.status, 200);
    assert.strictEqual(myRes.body.data.length, 1);
    assert.strictEqual(myRes.body.data[0].eventId, createdEventId);
    assert.strictEqual(myRes.body.data[0].eventName, 'Ngày hội Sức khỏe Tim mạch 2027');
    assert.strictEqual(myRes.body.data[0].eventLocation, '123 Nguyễn Văn Linh, Đà Nẵng');
    assert.strictEqual(myRes.body.data[0].status, EVENT_REGISTRATION_STATUSES.PENDING);
  });

  it('6. Lễ tân mở danh sách sự kiện (GET /reception/events) và bấm Check-in (POST /reception/events/:eventId/confirm/:userId) -> chuyển CONFIRMED và tự động cấp UserVoucher!', async () => {
    // Trước khi check-in, Patient 1 chưa có voucher nào
    const vouchersBefore = await apiRequest('GET', '/vouchers/my', { token: patient1Token });
    assert.strictEqual(vouchersBefore.body.data.length, 0);

    // Lễ tân lấy danh sách sự kiện kèm người đăng ký
    const recepListRes = await apiRequest('GET', '/reception/events', {
      token: receptionistToken,
    });
    assert.strictEqual(recepListRes.status, 200);
    const targetEvent = recepListRes.body.data.find((e) => e.id === createdEventId);
    assert.ok(targetEvent);
    assert.strictEqual(targetEvent.enabled, true);
    assert.strictEqual(targetEvent.registrations.length, 1);
    assert.strictEqual(targetEvent.registrations[0].userId, patient1.id);
    assert.strictEqual(targetEvent.registrations[0].userFullName, patient1.fullName);
    assert.strictEqual(targetEvent.registrations[0].status, EVENT_REGISTRATION_STATUSES.PENDING);

    // Lễ tân bấm Check-in xác nhận tham dự
    const confirmRes = await apiRequest(
      'POST',
      `/reception/events/${createdEventId}/confirm/${patient1.id}`,
      { token: receptionistToken },
    );
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.data.status, EVENT_REGISTRATION_STATUSES.CONFIRMED);
    assert.strictEqual(confirmRes.body.data.userFullName, patient1.fullName);

    // Kiểm tra Patient 1 đã tự động nhận được UserVoucher từ sự kiện!
    const vouchersAfter = await apiRequest('GET', '/vouchers/my', { token: patient1Token });
    assert.strictEqual(vouchersAfter.status, 200);
    assert.strictEqual(vouchersAfter.body.data.length, 1);
    assert.strictEqual(vouchersAfter.body.data[0].voucherCode, 'EVENTGIFT20');
    assert.strictEqual(vouchersAfter.body.data[0].used, false);
  });

  it('7. Admin cập nhật và xóa sự kiện thành công, ghi nhận AuditLog đầy đủ', async () => {
    const updateRes = await apiRequest('PUT', `/events/update/${createdEventId}`, {
      token: adminToken,
      body: {
        title: 'Ngày hội Sức khỏe Tim mạch 2027 (Đã cập nhật)',
        description: 'Mô tả mới',
        location: 'Cơ sở 2 - Hải Châu, Đà Nẵng',
        startDate: '05/12/2027 08:00',
        endDate: '31/12/2027 18:00',
        isEnabled: true,
        voucherId: giftVoucher.id,
      },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.data.title, 'Ngày hội Sức khỏe Tim mạch 2027 (Đã cập nhật)');
    assert.strictEqual(updateRes.body.data.location, 'Cơ sở 2 - Hải Châu, Đà Nẵng');

    // Xóa sự kiện ẩn
    const delRes = await apiRequest('DELETE', `/events/delete/${hiddenEventId}`, {
      token: adminToken,
    });
    assert.strictEqual(delRes.status, 200);

    const auditLogs = await AuditLog.find({ targetType: { $in: ['Event', 'UserEvent'] } }).lean();
    assert.ok(auditLogs.length >= 4);
  });
});

