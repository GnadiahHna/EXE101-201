const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'voucher_flow_test_secret_key';
const TEST_DB_URI =
  process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/clinic_booking_test_voucher_flow';

const app = require('../src/app');
const {
  User,
  Specialty,
  DoctorShift,
  Appointment,
  Voucher,
  UserVoucher,
  AuditLog,
} = require('../src/models');
const { ROLES, APPOINTMENT_STATUSES, VOUCHER_TYPES } = require('../src/constants/enums');
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
let doctor1;
let specialty1;

const formatISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

describe('Voucher End-to-End Flow: Admin Create -> Home Public Display -> Patient Claim & Use in Booking / Reception', () => {
  let createdDiscountVoucherId;
  let createdTicketVoucherId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();

    const passwordHash = await bcrypt.hash('Secret@123', 10);

    specialty1 = await Specialty.create({
      id: 1,
      name: 'Nội tổng quát',
      description: 'Chuyên khoa nội tổng quát',
    });

    adminUser = await User.create({
      id: 1,
      email: 'admin_voucher@clinicbooking.com',
      password: passwordHash,
      fullName: 'Quản Trị Viên',
      userType: ROLES.ADMIN,
      gender: 'Other',
      isEnable: true,
    });
    adminToken = signAccessToken(adminUser);

    receptionistUser = await User.create({
      id: 2,
      email: 'recep_voucher@clinicbooking.com',
      password: passwordHash,
      fullName: 'Lễ Tân Phòng Khám',
      userType: ROLES.RECEPTIONIST,
      gender: 'Female',
      isEnable: true,
    });
    receptionistToken = signAccessToken(receptionistUser);

    patient1 = await User.create({
      id: 3,
      email: 'pat1_voucher@clinicbooking.com',
      password: passwordHash,
      fullName: 'Nguyễn Văn Bệnh Nhân',
      userType: ROLES.PATIENT,
      gender: 'Male',
      phoneNumber: '0901234567',
      isEnable: true,
    });
    patient1Token = signAccessToken(patient1);

    patient2 = await User.create({
      id: 4,
      email: 'pat2_voucher@clinicbooking.com',
      password: passwordHash,
      fullName: 'Trần Thị Khách Hàng',
      userType: ROLES.PATIENT,
      gender: 'Female',
      phoneNumber: '0907654321',
      isEnable: true,
    });
    patient2Token = signAccessToken(patient2);

    doctor1 = await User.create({
      id: 5,
      email: 'doc1_voucher@clinicbooking.com',
      password: passwordHash,
      fullName: 'BS Nguyễn Quang Hải',
      userType: ROLES.DOCTOR,
      gender: 'Male',
      specialtyId: specialty1.id,
      isEnable: true,
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

  it('1. Phân quyền: Ngăn chặn Patient gọi POST /vouchers/create (403 Forbidden)', async () => {
    const res = await apiRequest('POST', '/vouchers/create', {
      token: patient1Token,
      body: {
        code: 'HACK2027',
        name: 'Voucher trái phép',
        discountValue: 50,
        type: VOUCHER_TYPES.DISCOUNT,
        enable: true,
        expiryDate: '31/12/2027 23:59',
      },
    });
    assert.strictEqual(res.status, 403);
  });

  it('2. Admin tạo Voucher DISCOUNT với định dạng ngày "dd/MM/yyyy HH:mm" và trả về ISO-8601 chuẩn', async () => {
    const res = await apiRequest('POST', '/vouchers/create', {
      token: adminToken,
      body: {
        code: 'summer2027',
        name: 'Ưu đãi mùa hè giảm 25%',
        discountValue: 25,
        type: VOUCHER_TYPES.DISCOUNT,
        enable: true,
        expiryDate: '31/12/2027 23:59',
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.code, 'SUMMER2027');
    assert.strictEqual(res.body.data.name, 'Ưu đãi mùa hè giảm 25%');
    assert.strictEqual(res.body.data.discountValue, 25);
    assert.strictEqual(res.body.data.type, VOUCHER_TYPES.DISCOUNT);
    assert.strictEqual(res.body.data.enable, true);
    // Phải parse được bằng new Date() ở Frontend
    assert.ok(!Number.isNaN(new Date(res.body.data.expiryDate).getTime()));

    createdDiscountVoucherId = res.body.data.id;
  });

  it('3. Admin tạo thêm Voucher SERVICE_TICKET và 1 Voucher đã vô hiệu hóa (enable: false)', async () => {
    const resTicket = await apiRequest('POST', '/vouchers/create', {
      token: adminToken,
      body: {
        code: 'TICKET50K',
        name: 'Phiếu dịch vụ giảm 50.000đ',
        discountValue: 50000,
        type: VOUCHER_TYPES.SERVICE_TICKET,
        enable: true,
        expiryDate: '31/12/2027 23:59',
      },
    });
    assert.strictEqual(resTicket.status, 201);
    createdTicketVoucherId = resTicket.body.data.id;

    const resDisabled = await apiRequest('POST', '/vouchers/create', {
      token: adminToken,
      body: {
        code: 'DISABLED2027',
        name: 'Voucher bị ẩn',
        discountValue: 10,
        type: VOUCHER_TYPES.DISCOUNT,
        enable: false,
        expiryDate: '31/12/2027 23:59',
      },
    });
    assert.strictEqual(resDisabled.status, 201);
  });

  it('4. Trang chủ (Guest/Patient) gọi GET /vouchers/public chỉ hiển thị các voucher đang enable và chưa hết hạn', async () => {
    const res = await apiRequest('GET', '/vouchers/public');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const codes = res.body.data.map((v) => v.code);
    assert.ok(codes.includes('SUMMER2027'));
    assert.ok(codes.includes('TICKET50K'));
    assert.ok(!codes.includes('DISABLED2027'), 'Voucher bị vô hiệu hóa không được hiển thị ở trang chủ');
  });

  it('5. Bệnh nhân nhấn lưu voucher trên trang chủ (POST /vouchers/:voucherId/claim) và kiểm tra GET /vouchers/my', async () => {
    const claimRes = await apiRequest('POST', `/vouchers/${createdDiscountVoucherId}/claim`, {
      token: patient1Token,
    });
    assert.strictEqual(claimRes.status, 200);
    assert.strictEqual(claimRes.body.data.voucherId, createdDiscountVoucherId);
    assert.strictEqual(claimRes.body.data.voucherCode, 'SUMMER2027');
    assert.strictEqual(claimRes.body.data.used, false);

    // Gọi lại lần 2 phải idempotent (không tạo bản ghi trùng lặp)
    const claimAgain = await apiRequest('POST', `/vouchers/${createdDiscountVoucherId}/claim`, {
      token: patient1Token,
    });
    assert.strictEqual(claimAgain.status, 200);
    assert.strictEqual(claimAgain.body.data.id, claimRes.body.data.id);

    // Kiểm tra danh sách voucher của bệnh nhân
    const myRes = await apiRequest('GET', '/vouchers/my', {
      token: patient1Token,
    });
    assert.strictEqual(myRes.status, 200);
    assert.strictEqual(myRes.body.data.length, 1);
    assert.strictEqual(myRes.body.data[0].voucherCode, 'SUMMER2027');
    assert.strictEqual(myRes.body.data[0].used, false);
  });

  it('6. Bệnh nhân áp dụng Voucher khi Đặt lịch khám (POST /appointments/create) -> tính đúng tiền giảm và đánh dấu used: true', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = formatISODate(futureDate);

    const shift = await DoctorShift.create({
      id: 501,
      doctorId: doctor1.id,
      date: dateStr,
      shift: 'MORNING',
      startTime: '08:00',
      endTime: '11:00',
      status: 'ACTIVE',
      slots: [
        { id: 1, slotNumber: 1, startTime: '08:00', endTime: '08:30', status: 'AVAILABLE' },
        { id: 2, slotNumber: 2, startTime: '08:30', endTime: '09:00', status: 'AVAILABLE' },
      ],
    });

    // Đặt lịch khám OFFLINE cho 1 bệnh nhân (phí gốc 200,000đ, giảm 25% = 50,000đ -> còn 150,000đ)
    const bookRes = await apiRequest(
      'POST',
      `/appointments/create?specialtyId=${specialty1.id}&doctorId=${doctor1.id}`,
      {
        token: patient1Token,
        body: {
          shiftId: shift.id,
          voucherId: createdDiscountVoucherId,
          appointment: {
            reason: 'Khám sức khỏe định kỳ có áp dụng voucher',
            type: 'OFFLINE',
          },
          patients: [
            {
              fullName: 'Nguyễn Văn Bệnh Nhân',
              gender: 'Male',
              phoneNumber: '0901234567',
              dob: '1995-05-15',
              relationship: 'Bản thân',
            },
          ],
        },
      },
    );

    assert.strictEqual(bookRes.status, 201);
    assert.strictEqual(bookRes.body.data.voucherId, createdDiscountVoucherId);
    assert.strictEqual(bookRes.body.data.voucherCode, 'SUMMER2027');
    assert.strictEqual(bookRes.body.data.originalAmount, 200000);
    assert.strictEqual(bookRes.body.data.discountAmount, 50000);
    assert.strictEqual(bookRes.body.data.finalAmount, 150000);

    // Kiểm tra UserVoucher đã chuyển sang used: true
    const myResAfter = await apiRequest('GET', '/vouchers/my', {
      token: patient1Token,
    });
    assert.strictEqual(myResAfter.body.data[0].used, true);

    // Thử dùng lại cùng voucher đó cho lần đặt lịch tiếp theo -> phải bị chặn 409 Conflict
    const reuseRes = await apiRequest(
      'POST',
      `/appointments/create?specialtyId=${specialty1.id}&doctorId=${doctor1.id}`,
      {
        token: patient1Token,
        body: {
          shiftId: shift.id,
          voucherId: createdDiscountVoucherId,
          appointment: { reason: 'Dùng lại voucher đã xài', type: 'OFFLINE' },
          patients: [{ fullName: 'Người thứ 2', gender: 'Female' }],
        },
      },
    );
    assert.strictEqual(reuseRes.status, 409);

    // Khi bệnh nhân hủy lịch hẹn hợp lệ (> 24h), voucher được hoàn lại (used: false)
    const cancelRes = await apiRequest('PUT', `/appointments/cancel/${bookRes.body.data.id}`, {
      token: patient1Token,
      body: { reason: 'Đổi ngày khám nên hủy để giữ lại voucher' },
    });
    assert.strictEqual(cancelRes.status, 200);

    const myResRestored = await apiRequest('GET', '/vouchers/my', {
      token: patient1Token,
    });
    assert.strictEqual(
      myResRestored.body.data[0].used,
      false,
      'Sau khi hủy lịch hẹn, voucher của bệnh nhân phải được hoàn trả về trạng thái chưa dùng',
    );
  });

  it('7. Luồng Lễ tân (Receptionist): Xem voucher của bệnh nhân và bấm xác nhận sử dụng tại quầy', async () => {
    // Patient 2 lưu voucher TICKET50K
    const claimRes = await apiRequest('POST', `/vouchers/${createdTicketVoucherId}/claim`, {
      token: patient2Token,
    });
    assert.strictEqual(claimRes.status, 200);
    const userVoucherId = claimRes.body.data.id;

    // Lễ tân tra cứu danh sách voucher của Patient 2
    const listForRecep = await apiRequest('GET', `/vouchers/user/${patient2.id}`, {
      token: receptionistToken,
    });
    assert.strictEqual(listForRecep.status, 200);
    assert.strictEqual(listForRecep.body.data.length, 1);
    assert.strictEqual(listForRecep.body.data[0].voucherCode, 'TICKET50K');
    assert.strictEqual(listForRecep.body.data[0].used, false);

    // Lễ tân nhấn "Đánh dấu dùng" (truyền userVoucher.id như RecepVouchers.tsx L115)
    const useRes = await apiRequest(
      'POST',
      `/vouchers/${userVoucherId}/use?userId=${patient2.id}`,
      {
        token: receptionistToken,
      },
    );
    assert.strictEqual(useRes.status, 200);
    assert.strictEqual(useRes.body.data.used, true);
    assert.strictEqual(useRes.body.data.userFullName, patient2.fullName);

    // Kiểm tra AuditLog
    const auditLogs = await AuditLog.find({ targetType: { $in: ['Voucher', 'UserVoucher'] } }).lean();
    assert.ok(auditLogs.length >= 3);
  });
});

