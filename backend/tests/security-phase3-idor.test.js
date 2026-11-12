const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const {
  User,
  PatientProfile,
  Appointment,
  Prescription,
  UserVoucher,
  Voucher,
  Feedback,
} = require('../src/models');
const { signAccessToken } = require('../src/utils/jwt');
const { ROLES } = require('../src/constants/enums');

const TEST_DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clinic_test';
let server;
let baseUrl;

async function apiRequest(method, path, { token = null, body = undefined, headers = {}, rawBody = null } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;

  let requestBody = undefined;
  if (rawBody !== null) {
    requestBody = rawBody;
  } else if (body !== undefined) {
    requestBody = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: reqHeaders,
    body: requestBody,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body: json };
}

describe('PHASE 3: Authorization (IDOR) & Public Data Leakage Security Suite', () => {
  let patientA;
  let patientB;
  let doctorA;
  let doctorB;
  let tokenPatientA;
  let tokenPatientB;
  let tokenDoctorA;
  let tokenDoctorB;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
    await User.deleteMany({ email: /@idor-test\.com$/ });

    patientA = await User.create({
      fullName: 'Bệnh Nhân A IDOR',
      email: 'patientA@idor-test.com',
      phoneNumber: '0901111111',
      password: 'Password123!',
      userType: 'Patient',
      emailVerified: true,
    });

    patientB = await User.create({
      fullName: 'Bệnh Nhân B IDOR',
      email: 'patientB@idor-test.com',
      phoneNumber: '0902222222',
      password: 'Password123!',
      userType: 'Patient',
      emailVerified: true,
    });

    doctorA = await User.create({
      fullName: 'Bác Sĩ A IDOR',
      email: 'doctorA@idor-test.com',
      phoneNumber: '0903333333',
      password: 'Password123!',
      userType: 'Doctor',
      specialtyId: 1,
      consultationFee: 200000,
      isVip: true,
      emailVerified: true,
    });

    doctorB = await User.create({
      fullName: 'Bác Sĩ B IDOR',
      email: 'doctorB@idor-test.com',
      phoneNumber: '0904444444',
      password: 'Password123!',
      userType: 'Doctor',
      specialtyId: 1,
      consultationFee: 250000,
      isVip: false,
      emailVerified: true,
    });

    tokenPatientA = signAccessToken({ id: patientA.id, role: ROLES.PATIENT, tokenVersion: 0 });
    tokenPatientB = signAccessToken({ id: patientB.id, role: ROLES.PATIENT, tokenVersion: 0 });
    tokenDoctorA = signAccessToken({ id: doctorA.id, role: ROLES.DOCTOR, tokenVersion: 0 });
    tokenDoctorB = signAccessToken({ id: doctorB.id, role: ROLES.DOCTOR, tokenVersion: 0 });

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: /@idor-test\.com$/ });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Patient Profile IDOR: Patient A cannot read or mutate Patient B dependent profile', async () => {
    const profileB = await PatientProfile.create({
      ownerId: patientB.id,
      fullName: 'Con Của Bệnh Nhân B',
      gender: 'Male',
      dob: '2020-01-01',
      relationship: 'Con',
    });

    // Patient A tries to read profile B -> 403 Forbidden
    const getRes = await apiRequest('GET', `/patients-info/${profileB.id}`, { token: tokenPatientA });
    assert.equal(getRes.status, 403, 'Patient A must be forbidden from reading Patient B profile');

    // Patient A tries to update profile B -> 403 Forbidden
    const putRes = await apiRequest('PUT', `/patients-info/update/${profileB.id}`, {
      token: tokenPatientA,
      body: { fullName: 'Hacker Tampered Name' },
    });
    assert.equal(putRes.status, 403, 'Patient A must be forbidden from updating Patient B profile');

    await PatientProfile.deleteOne({ id: profileB.id });
  });

  it('2. Appointment IDOR: Patient A cannot view detail or cancel appointment of Patient B', async () => {
    const apptB = await Appointment.create({
      appointmentNo: `APPT-IDOR-${Date.now()}`,
      patientId: patientB.id,
      doctorId: doctorA.id,
      specialtyId: 1,
      shiftId: 100,
      appointmentDate: '2026-12-01',
      appointmentTime: '09:00 - 09:30',
      status: 'CONFIRMED',
      type: 'OFFLINE',
    });

    // Patient A tries to view appointment B detail -> 404 Not Found (avoids user enumeration)
    const getRes = await apiRequest('GET', `/appointments/${apptB.id}`, { token: tokenPatientA });
    assert.equal(getRes.status, 404, 'Patient A viewing Patient B appointment must return 404');

    // Patient A tries to cancel appointment B -> 403 Forbidden
    const cancelRes = await apiRequest('PUT', `/appointments/cancel/${apptB.id}`, {
      token: tokenPatientA,
      body: { cancellationReason: 'Tamper cancel' },
    });
    assert.equal(cancelRes.status, 403, 'Patient A canceling Patient B appointment must return 403');

    await Appointment.deleteOne({ id: apptB.id });
  });

  it('3. Prescription IDOR: Patient A cannot view prescriptions for Patient B appointment', async () => {
    const apptB = await Appointment.create({
      appointmentNo: `APPT-RX-${Date.now()}`,
      patientId: patientB.id,
      doctorId: doctorA.id,
      specialtyId: 1,
      shiftId: 101,
      appointmentDate: '2026-12-01',
      appointmentTime: '10:00 - 10:30',
      status: 'COMPLETED',
      type: 'OFFLINE',
    });

    const rx = await Prescription.create({
      appointmentId: apptB.id,
      medicineName: 'Amoxicillin 500mg',
      dosage: '1 viên/lần',
      duration: '7 ngày',
    });

    const rxRes = await apiRequest('GET', `/prescriptions/by-appointment/${apptB.id}`, { token: tokenPatientA });
    assert.equal(rxRes.status, 404, 'Patient A must receive 404 when querying prescription of Patient B');

    await Prescription.deleteOne({ id: rx.id });
    await Appointment.deleteOne({ id: apptB.id });
  });

  it('4. Doctor Prescription & Shift IDOR: Doctor B cannot alter prescription of Doctor A appointment', async () => {
    const apptA = await Appointment.create({
      appointmentNo: `APPT-DOC-${Date.now()}`,
      patientId: patientA.id,
      doctorId: doctorA.id,
      specialtyId: 1,
      shiftId: 102,
      appointmentDate: '2026-12-01',
      appointmentTime: '14:00 - 14:30',
      status: 'IN_PROGRESS',
      type: 'OFFLINE',
    });

    const createRx = await apiRequest('POST', `/prescriptions/create/${apptA.id}`, {
      token: tokenDoctorB,
      body: { medicineName: 'Paracetamol 500mg', dosage: '1 viên', duration: '3 ngày' },
    });
    assert.equal(createRx.status, 404, 'Doctor B must receive 404 when modifying Doctor A appointment prescription');

    await Appointment.deleteOne({ id: apptA.id });
  });

  it('5. Telehealth IDOR: Patient A cannot join online consultation of Patient B', async () => {
    const apptB = await Appointment.create({
      appointmentNo: `APPT-TELE-${Date.now()}`,
      patientId: patientB.id,
      doctorId: doctorA.id,
      specialtyId: 1,
      shiftId: 103,
      appointmentDate: '2026-12-01',
      appointmentTime: '15:00 - 15:30',
      status: 'CONFIRMED',
      type: 'ONLINE',
    });

    const joinRes = await apiRequest('POST', `/appointments/${apptB.id}/join-online`, { token: tokenPatientA });
    assert.equal(joinRes.status, 404, 'Patient A joining Patient B online room must return 404');

    await Appointment.deleteOne({ id: apptB.id });
  });

  it('6. User Voucher IDOR: Patient A cannot redeem voucher owned by Patient B', async () => {
    const voucher = await Voucher.create({
      code: `VOUCHER-IDOR-${Date.now()}`,
      name: 'Voucher IDOR Test',
      discountValue: 50000,
      discountType: 'AMOUNT',
      type: 'DISCOUNT',
      enable: true,
    });

    const userVoucherB = await UserVoucher.create({
      userId: patientB.id,
      voucherId: voucher.id,
      used: false,
    });

    const redeemRes = await apiRequest('POST', `/vouchers/my/${userVoucherB.id}/redeem`, {
      token: tokenPatientA,
      body: { totalAmount: 100000 },
    });
    assert.equal(redeemRes.status, 404, 'Patient A redeeming Patient B voucher must return 404');

    await UserVoucher.deleteOne({ id: userVoucherB.id });
    await Voucher.deleteOne({ id: voucher.id });
  });

  it('7. Feedback IDOR: Patient A cannot update or delete feedback posted by Patient B', async () => {
    const fbB = await Feedback.create({
      userId: patientB.id,
      doctorId: doctorA.id,
      rating: 5,
      comment: 'Bác sĩ rất nhiệt tình và chu đáo',
      category: 'Dịch vụ',
      status: 'APPROVED',
    });

    const updateRes = await apiRequest('PUT', `/feedbacks/${fbB.id}`, {
      token: tokenPatientA,
      body: { comment: 'Hacker modified review' },
    });
    assert.equal(updateRes.status, 403, 'Patient A updating Patient B feedback must return 403');

    const delRes = await apiRequest('DELETE', `/feedbacks/${fbB.id}`, {
      token: tokenPatientA,
    });
    assert.equal(delRes.status, 404, 'Patient A deleting Patient B feedback must return 404 (or 403) to prevent enumeration');

    await Feedback.deleteOne({ id: fbB.id });
  });

  it('8. Doctor Public DTO: Does NOT leak email, phoneNumber or internal fields', async () => {
    // 8a. GET /api/doctors/:id
    const resDetail = await apiRequest('GET', `/doctors/${doctorA.id}`);
    assert.equal(resDetail.status, 200);
    const docData = resDetail.body.data;
    assert.equal(docData.id, doctorA.id);
    assert.equal(docData.fullName, 'Bác Sĩ A IDOR');
    assert.equal(docData.email, undefined, 'Public doctor DTO must not expose email');
    assert.equal(docData.phoneNumber, undefined, 'Public doctor DTO must not expose phoneNumber');
    assert.equal(docData.password, undefined, 'Public doctor DTO must not expose password');

    // 8b. GET /api/doctors/search
    const resSearch = await apiRequest('GET', `/doctors/search?keyword=IDOR`);
    assert.equal(resSearch.status, 200);
    const searchItems = resSearch.body.data;
    assert.ok(Array.isArray(searchItems) && searchItems.length > 0);
    for (const item of searchItems) {
      assert.equal(item.email, undefined, 'Search doctors must not expose email');
      assert.equal(item.phoneNumber, undefined, 'Search doctors must not expose phoneNumber');
    }

    // 8c. Query by phone number does NOT return results on public doctor search
    const resPhoneSearch = await apiRequest('GET', `/doctors/search?keyword=0903333333`);
    assert.equal(resPhoneSearch.status, 200);
    assert.equal(resPhoneSearch.body.data.length, 0, 'Public search must not filter by phone number');
  });

  it('9. Zod Input Validation & Payload Size Limit', async () => {
    // 9a. Oversized JSON payload (> 100kb) must be rejected with 413 Payload Too Large
    const oversizedBody = JSON.stringify({ largeText: 'x'.repeat(150 * 1024) });
    const sizeRes = await apiRequest('POST', '/auth/login', { rawBody: oversizedBody });
    assert.equal(sizeRes.status, 413, 'Payload exceeding 100kb must be rejected with HTTP 413');

    // 9b. Unexpected NoSQL object in string field is rejected with 400
    const nosqlRes = await apiRequest('POST', '/auth/login', {
      body: { email: { $ne: null }, password: 'Password123!' },
    });
    assert.equal(nosqlRes.status, 400, 'Object injected into email field must be rejected with 400');
  });
});
