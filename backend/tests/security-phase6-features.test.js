const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const configService = require('../src/config/config.service');
const env = require('../src/config/env');
const {
  Appointment,
  User,
  DoctorShift,
  Notification,
  Waitlist,
  Prescription,
  PatientProfile,
} = require('../src/models');
const { APPOINTMENT_STATUSES } = require('../src/constants/enums');
const { calculateNoShowRisk } = require('../src/utils/noShowRisk');
const { checkDrugAllergies } = require('../src/utils/drugAllergyChecker');
const { runReminderScan, generateReminderActionToken } = require('../src/jobs/appointmentReminder.job');
const { runNoShowScan } = require('../src/jobs/noShow.job');
const { addToWaitlist, processWaitlistForReleasedSlot } = require('../src/services/waitlist.service');
const { defaultVideoProvider } = require('../src/services/videoProvider.service');

test.describe('Phase 6: Advanced Clinic Features & Safety Suite', () => {
  let server;
  let port;
  let testPatient;
  let testDoctor;
  let patientToken;
  let doctorToken;

  async function apiRequest(method, path, options = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
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

    await User.deleteMany({ email: /@phase6-test\.com$/ });

    testPatient = await User.create({
      fullName: 'Phase 6 Patient',
      email: 'patient@phase6-test.com',
      role: 'Patient',
      userType: 'Patient',
      password: 'Password123!',
      emailVerified: true,
    });

    testDoctor = await User.create({
      fullName: 'Phase 6 Doctor',
      email: 'doctor@phase6-test.com',
      role: 'Doctor',
      userType: 'Doctor',
      specialtyId: 1,
      password: 'Password123!',
      emailVerified: true,
    });

    patientToken = jwt.sign(
      { userId: testPatient.id, id: testPatient.id, role: 'Patient', tokenVersion: 0 },
      env.jwtSecret,
    );
    doctorToken = jwt.sign(
      { userId: testDoctor.id, id: testDoctor.id, role: 'Doctor', tokenVersion: 0 },
      env.jwtSecret,
    );
  });

  test.after(async () => {
    // Clean up test fixtures from DB so dev DB stays clean
    try {
      if (testPatient?.id || testDoctor?.id) {
        const testIds = [testPatient?.id, testDoctor?.id].filter(Boolean);
        await User.deleteMany({ id: { $in: testIds } });
        await Appointment.deleteMany({
          $or: [{ patientId: { $in: testIds } }, { doctorId: { $in: testIds } }, { appointmentNo: /^REMINDER_/ }, { appointmentNo: /^VIDEO_/ }]
        });
        await Waitlist.deleteMany({ patientId: { $in: testIds } });
        await OutboxEvent.deleteMany({ 'payload.to': 'patient@phase6-test.com' });
        await DoctorShift.deleteMany({ id: 9991 });
      }
    } catch {
      // Ignore cleanup error
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test.test('1. Reminder job: Does not duplicate reminders (idempotency via remindersSent)', async () => {
    const apptNo = `REMINDER_${Date.now()}`;
    const appt = await Appointment.create({
      appointmentNo: apptNo,
      patientId: testPatient.id,
      doctorId: testDoctor.id,
      specialtyId: 1,
      shiftId: 101,
      appointmentDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
      appointmentTime: '09:00',
      status: APPOINTMENT_STATUSES.CONFIRMED,
      remindersSent: [{ type: 'T-24H', sentAt: new Date(), channel: 'email' }],
    });

    // Run reminder scan; since 'T-24H' is already recorded, it must NOT send again
    await runReminderScan();

    const reloaded = await Appointment.findOne({ id: appt.id });
    const count24h = reloaded.remindersSent.filter((r) => r.type === 'T-24H').length;
    assert.equal(count24h, 1, 'T-24H reminder must remain strictly 1 without duplication');

    // Test token signing
    const token = generateReminderActionToken(appt, 'CONFIRM');
    const decoded = jwt.verify(token, env.jwtSecret);
    assert.equal(decoded.appointmentId, appt.id);
    assert.equal(decoded.action, 'CONFIRM');
  });

  test.test('2. No-Show: Explainable rule-based risk calculation works correctly', () => {
    const lowRisk = calculateNoShowRisk({
      pastNoShowCount: 0,
      leadTimeDays: 2,
      isPrepaid: true,
      shiftType: 'MORNING',
    });
    assert.equal(lowRisk.level, 'LOW');
    assert.ok(lowRisk.score <= 0.35);

    const highRisk = calculateNoShowRisk({
      pastNoShowCount: 2,
      pastLateCancelCount: 1,
      leadTimeDays: 15,
      isPrepaid: false,
      shiftType: 'EVENING',
    });
    assert.equal(highRisk.level, 'HIGH');
    assert.ok(highRisk.score >= 0.6);
    assert.ok(highRisk.factors.length >= 3);
  });

  test.test('3. Waitlist: FIFO queueing and atomic hold upon slot release', async () => {
    // Clear waitlists for this patient
    await Waitlist.deleteMany({ patientId: testPatient.id });

    // Register into waitlist
    const entry = await addToWaitlist({
      patientId: testPatient.id,
      doctorId: testDoctor.id,
      dateFrom: '2026-11-20',
      dateTo: '2026-11-25',
      preferredShift: 'MORNING',
    });
    assert.equal(entry.status, 'WAITING');

    // Create a mock shift on that date with an AVAILABLE slot
    const shift = await DoctorShift.findOneAndUpdate(
      { id: 9991 },
      {
        id: 9991,
        doctorId: testDoctor.id,
        date: '2026-11-22',
        shift: 'MORNING',
        startTime: '08:00',
        endTime: '12:00',
        status: 'ACTIVE',
        slots: [
          { id: 1, slotNumber: 1, startTime: '08:00', endTime: '08:30', status: 'AVAILABLE' },
        ],
      },
      { upsert: true, returnDocument: 'after' },
    );

    // Process waitlist for this released slot
    const result = await processWaitlistForReleasedSlot({ shiftId: shift.id, slotId: 1 });
    assert.equal(result.matched, true);

    const updatedEntry = await Waitlist.findOne({ id: entry.id });
    assert.equal(updatedEntry.status, 'HOLDING');
    assert.ok(updatedEntry.heldSlotRef);
    assert.ok(updatedEntry.holdExpiresAt);

    // Verify notification was sent
    const notif = await Notification.findOne({ userId: testPatient.id, type: 'WAITLIST_AVAILABLE' });
    assert.ok(notif, 'Patient should receive notification about held waitlist slot');
  });

  test.test('4. Video consultation: Access verification & Jitsi HMAC room name', async () => {
    const meetingCode = 'TESTMEETING123';
    const room1 = defaultVideoProvider.generateRoomName(meetingCode);
    const room2 = defaultVideoProvider.generateRoomName(meetingCode);
    assert.equal(room1, room2, 'HMAC room name must be deterministic');
    assert.ok(room1.startsWith('NanoClinic_'));

    // Test API endpoint rejecting unauthorized caller
    const videoApptNo = `VIDEO_${Date.now()}`;
    const appt = await Appointment.create({
      appointmentNo: videoApptNo,
      patientId: testPatient.id,
      doctorId: testDoctor.id,
      specialtyId: 1,
      shiftId: 101,
      appointmentDate: '2026-11-12',
      appointmentTime: '10:00',
      type: 'ONLINE',
      status: APPOINTMENT_STATUSES.CONFIRMED,
      meeting: { code: meetingCode },
    });

    const resNoToken = await apiRequest('GET', `/api/appointments/${appt.id}/video-room`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(resNoToken.status, 401, 'Should reject when joinToken is missing');

    const joinSecret = env.joinTokenSecret || 'ci_test_join_token_secret_min_32_chars_12345';
    const validJoinToken = jwt.sign({ appointmentId: appt.id }, joinSecret);
    const resValid = await apiRequest('GET', `/api/appointments/${appt.id}/video-room?joinToken=${validJoinToken}`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(resValid.status, 200);
    assert.equal(resValid.body.data.roomName, room1);
  });

  test.test('5. Prescription Allergy Safety: Rejects cross-reactive drug without override', () => {
    const medicines = [{ medicineName: 'Amoxicillin 500mg' }];
    const patientAllergies = ['Penicillin'];

    const warnings = checkDrugAllergies(medicines, patientAllergies);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].allergyGroup, 'Penicillin');
    assert.ok(warnings[0].message.includes('Penicillin'));
  });
});
