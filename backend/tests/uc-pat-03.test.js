const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'uc_pat_03_test_secret';
const TEST_DB_URI =
  process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/clinic_booking_test_uc_pat_03';

const app = require('../src/app');
const { User, DoctorShift } = require('../src/models');
const { ROLES } = require('../src/constants/enums');
const patientShiftService = require('../src/services/patientShift.service');

let server;
let baseUrl;
let doctorId;
let disabledDoctorId;
let patientUserId;
let doctorToken;

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

describe('UC-PUB-01 & UC-PAT-03: Lịch ca trực khả dụng của bác sĩ (/shifts/by-doctor)', () => {
  const today = patientShiftService.getTodayString();
  const futureDate = '2099-12-15';
  const pastDate = '2020-01-01';

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();

    const passwordHash = await bcrypt.hash('Doctor@123', 10);

    // Active Doctor
    const doctor = await User.create({
      email: 'dr.smith@clinicbooking.com',
      password: passwordHash,
      fullName: 'BS. John Smith',
      userType: ROLES.DOCTOR,
      gender: 'Male',
      isEnable: true,
      specialtyId: 1,
    });
    doctorId = doctor.id;

    // Disabled Doctor
    const disabledDoctor = await User.create({
      email: 'dr.disabled@clinicbooking.com',
      password: passwordHash,
      fullName: 'BS. Inactive',
      userType: ROLES.DOCTOR,
      gender: 'Female',
      isEnable: false,
      specialtyId: 1,
    });
    disabledDoctorId = disabledDoctor.id;

    // Patient user
    const patient = await User.create({
      email: 'patient1@clinicbooking.com',
      password: passwordHash,
      fullName: 'Bệnh Nhân Một',
      userType: ROLES.PATIENT,
      gender: 'Male',
      isEnable: true,
    });
    patientUserId = patient.id;

    // Create Future Shifts for Active Doctor
    // 1. ACTIVE shift on futureDate
    await DoctorShift.create({
      doctorId,
      date: futureDate,
      shift: 'MORNING',
      startTime: '08:00',
      endTime: '12:00',
      maxPatients: 4,
      status: 'ACTIVE',
      slots: [
        { id: 101, slotNumber: 1, startTime: '08:00', endTime: '08:45', status: 'AVAILABLE' },
        { id: 102, slotNumber: 2, startTime: '09:00', endTime: '09:45', status: 'BOOKED' },
        { id: 103, slotNumber: 3, startTime: '10:00', endTime: '10:45', status: 'AVAILABLE' },
        { id: 104, slotNumber: 4, startTime: '11:00', endTime: '11:45', status: 'CANCELLED' },
      ],
    });

    // 2. CANCELLED shift on futureDate (should be hidden)
    await DoctorShift.create({
      doctorId,
      date: futureDate,
      shift: 'AFTERNOON',
      startTime: '13:00',
      endTime: '17:00',
      maxPatients: 2,
      status: 'CANCELLED',
      slots: [
        { id: 105, slotNumber: 1, startTime: '13:00', endTime: '13:45', status: 'AVAILABLE' },
      ],
    });

    // 4. ACTIVE shift for TODAY (to test time cutoff)
    await DoctorShift.create({
      doctorId,
      date: today,
      shift: 'MORNING',
      startTime: '08:00',
      endTime: '12:00',
      maxPatients: 3,
      status: 'ACTIVE',
      slots: [
        { id: 201, slotNumber: 1, startTime: '00:00', endTime: '00:45', status: 'AVAILABLE' }, // definitely past
        { id: 202, slotNumber: 2, startTime: '23:58', endTime: '23:59', status: 'AVAILABLE' }, // far future tonight
      ],
    });

    // 5. ACTIVE shift in the past
    await DoctorShift.create({
      doctorId,
      date: pastDate,
      shift: 'MORNING',
      startTime: '08:00',
      endTime: '12:00',
      maxPatients: 2,
      status: 'ACTIVE',
      slots: [
        { id: 301, slotNumber: 1, startTime: '08:00', endTime: '08:45', status: 'AVAILABLE' },
      ],
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        resolve();
      });
    });

    const docLogin = await apiRequest('POST', '/auth/login', {
      body: { email: 'dr.smith@clinicbooking.com', password: 'Doctor@123' },
    });
    doctorToken = docLogin.body.data.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  it('1. Public access: Guest can query shifts without token', async () => {
    const res = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=${futureDate}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(Array.isArray(res.body.data), true);
  });

  it('2. Filter ACTIVE shifts only: excludes CANCELLED shifts', async () => {
    const res = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=${futureDate}`);
    assert.equal(res.status, 200);
    const shifts = res.body.data;

    // Only 1 ACTIVE shift should be returned, out of 2 seeded for futureDate
    assert.equal(shifts.length, 1);
    const shift = shifts[0];
    assert.equal(shift.shift, 'MORNING');
    assert.equal(shift.status, 'ACTIVE');
    assert.equal(shift.doctorName, 'BS. John Smith');
    assert.equal(shift.doctorId, doctorId);

    // Available slots calculation: only slots with status AVAILABLE count (slot 101, 103)
    assert.equal(shift.availableSlots, 2);
  });

  it('3. Slot privacy: slots include time and status only, without any patient PII', async () => {
    const res = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=${futureDate}`);
    assert.equal(res.status, 200);
    const slots = res.body.data[0].slots;
    assert.equal(slots.length, 4);

    for (const slot of slots) {
      assert.ok(Number.isInteger(slot.id));
      assert.ok(typeof slot.startTime === 'string');
      assert.ok(typeof slot.endTime === 'string');
      assert.ok(typeof slot.status === 'string');
      assert.ok(typeof slot.slotStatus === 'string');

      // Ensure NO patient / appointment PII fields exist
      assert.equal(slot.patientId, undefined);
      assert.equal(slot.patientName, undefined);
      assert.equal(slot.appointmentId, undefined);
      assert.equal(slot.patients, undefined);
    }
  });

  it('4. Time cutoff: slots that have already started today are marked UNAVAILABLE and not counted', async () => {
    const res = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=${today}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    const shift = res.body.data[0];

    // Slot 201 (00:00-00:45) is past -> UNAVAILABLE
    const pastSlot = shift.slots.find((s) => s.id === 201);
    assert.equal(pastSlot.status, 'UNAVAILABLE');

    // Slot 202 (23:58-23:59) is later tonight -> AVAILABLE (assuming test does not run at 23:59:59)
    const futureTonightSlot = shift.slots.find((s) => s.id === 202);
    assert.equal(futureTonightSlot.status, 'AVAILABLE');

    // availableSlots should only count slot 202
    assert.equal(shift.availableSlots, 1);
  });

  it('5. Past date: shifts in the past have all slots marked UNAVAILABLE and availableSlots = 0', async () => {
    const res = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=${pastDate}`);
    assert.equal(res.status, 200);
    const shift = res.body.data[0];
    assert.equal(shift.availableSlots, 0);
    assert.equal(shift.slots[0].status, 'UNAVAILABLE');
  });

  it('6. Validation: rejects invalid doctorId, inactive doctor, non-doctor user, and bad date (400 / 404)', async () => {
    // Non-existent doctor
    const notFound = await apiRequest('GET', `/shifts/by-doctor/99999?date=${futureDate}`);
    assert.equal(notFound.status, 404);

    // Inactive doctor
    const inactive = await apiRequest('GET', `/shifts/by-doctor/${disabledDoctorId}?date=${futureDate}`);
    assert.equal(inactive.status, 404);

    // User is Patient, not Doctor
    const notADoctor = await apiRequest('GET', `/shifts/by-doctor/${patientUserId}?date=${futureDate}`);
    assert.equal(notADoctor.status, 404);

    // Invalid doctor ID format
    const badId = await apiRequest('GET', `/shifts/by-doctor/xyz?date=${futureDate}`);
    assert.equal(badId.status, 400);

    // Missing date
    const noDate = await apiRequest('GET', `/shifts/by-doctor/${doctorId}`);
    assert.equal(noDate.status, 400);

    // Bad date format
    const badDate = await apiRequest('GET', `/shifts/by-doctor/${doctorId}?date=15-12-2099`);
    assert.equal(badDate.status, 400);
  });

  it('7. Router chaining: doctor routes such as GET /shifts/my continue to work without clash', async () => {
    const res = await apiRequest('GET', '/shifts/my', {
      token: doctorToken,
    });
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.data), true);
  });
});

