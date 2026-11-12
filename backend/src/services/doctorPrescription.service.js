const { Appointment, Prescription, PatientProfile } = require('../models');
const { ROLES } = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { checkDrugAllergies } = require('../utils/drugAllergyChecker');

const numericId = (value) => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid numeric ID'); return id; };
const getAppointment = async (user, appointmentId, requiredStatus) => {
  const id = numericId(appointmentId);
  const query = { id };
  if (user.userType === ROLES.DOCTOR || user.role === ROLES.DOCTOR) query.doctorId = user.id;
  else if (user.userType === ROLES.PATIENT || user.role === ROLES.PATIENT) query.patientId = user.id;
  else if (![ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.userType || user.role)) throw new ApiError(403, 'You cannot view this appointment');
  const appointment = await Appointment.findOne(query).lean();
  if (!appointment) throw new ApiError(404, 'Appointment not found');
  if (requiredStatus && appointment.status !== requiredStatus) throw new ApiError(409, 'Prescriptions can only be managed while the appointment is IN_PROGRESS');
  return appointment;
};
const validateItems = (input) => {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) throw new ApiError(400, 'Provide between 1 and 50 prescription items');
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(400, `Prescription item ${index + 1} must be an object`);
    const medicineName = typeof item.medicineName === 'string' ? item.medicineName.trim() : '';
    if (!medicineName || medicineName.length > 255) throw new ApiError(400, `Prescription item ${index + 1} requires a medicineName of at most 255 characters`);
    const text = (key, required = false) => {
      const value = item[key];
      if (value == null || value === '') { if (required) throw new ApiError(400, `Prescription item ${index + 1} requires ${key}`); return null; }
      if (typeof value !== 'string' || value.trim().length > 255) throw new ApiError(400, `${key} must be a string of at most 255 characters`);
      return value.trim() || null;
    };
    return {
      medicineName,
      dosage: text('dosage', true),
      duration: text('duration', true),
      instructions: text('instructions'),
      strength: text('strength'),
      dosageForm: text('dosageForm'),
      dose: text('dose'),
      frequency: text('frequency'),
      durationDays: typeof item.durationDays === 'number' ? item.durationDays : null,
      route: text('route') || 'Uống',
      activeIngredient: text('activeIngredient'),
      allergyWarningAcknowledged: Boolean(item.allergyWarningAcknowledged),
    };
  });
};

/**
 * Verify drug allergies against appointment intake & patient profile allergies.
 */
const verifyAllergies = async (appointment, items, overrideConfirmation) => {
  const patientProfile = await PatientProfile.findOne({ ownerId: appointment.patientId, isArchived: false }).lean();
  const patientAllergies = [
    ...(appointment.intake?.allergies || []),
    ...(patientProfile?.allergies || []),
  ];

  const warnings = checkDrugAllergies(items, patientAllergies);
  if (warnings.length > 0 && !overrideConfirmation) {
    const message = warnings.map((w) => w.message).join(' | ');
    throw new ApiError(
      409,
      `CẢNH BÁO DỊ ỨNG THUỐC: ${message}. Vui lòng xác nhận bỏ qua (overrideAllergyConfirmation: true) nếu đây là chủ đích điều trị.`,
      'ALLERGY_WARNING',
      warnings,
    );
  }
};

const serialize = (rows) => rows.map((item) => ({
  id: item.id,
  medicineName: item.medicineName,
  dosage: item.dosage,
  duration: item.duration,
  instructions: item.instructions,
  strength: item.strength,
  dosageForm: item.dosageForm,
  dose: item.dose,
  frequency: item.frequency,
  durationDays: item.durationDays,
  route: item.route,
  activeIngredient: item.activeIngredient,
  allergyWarningAcknowledged: item.allergyWarningAcknowledged,
  createdAt: item.createdAt?.toISOString(),
  appointmentId: item.appointmentId,
}));

const same = (left, right) => left.length === right.length && left.every((item, i) => ['medicineName', 'dosage', 'duration', 'instructions'].every((key) => (item[key] || null) === (right[i][key] || null)));
const getByAppointment = async (user, appointmentId) => { const a = await getAppointment(user, appointmentId); return serialize(await Prescription.find({ appointmentId: a.id }).sort({ id: 1 }).lean()); };

const create = async (doctor, appointmentId, input, options = {}) => {
  const items = validateItems(input);
  const appointment = await getAppointment(doctor, appointmentId, 'IN_PROGRESS');

  await verifyAllergies(appointment, items, options.overrideAllergyConfirmation);

  const existing = await Prescription.find({ appointmentId: appointment.id }).sort({ id: 1 }).lean();
  if (existing.length) { if (same(existing, items)) return serialize(existing); throw new ApiError(409, 'A prescription already exists; use the update endpoint'); }
  try {
    const created = await Prescription.insertMany(items.map((item) => ({ ...item, appointmentId: appointment.id })), { ordered: true });
    return serialize(created);
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'Could not create prescriptions; refresh and retry');
    throw error;
  }
};

const update = async (doctor, appointmentId, input, options = {}) => {
  const items = validateItems(input);
  const appointment = await getAppointment(doctor, appointmentId, 'IN_PROGRESS');

  await verifyAllergies(appointment, items, options.overrideAllergyConfirmation);

  const existing = await Prescription.find({ appointmentId: appointment.id }).sort({ id: 1 }).lean();
  if (!existing.length) throw new ApiError(404, 'Prescription not found for this appointment');
  // Preserve IDs and createdAt for existing rows where possible, replacing values in order.
  const common = Math.min(existing.length, items.length);
  for (let i = 0; i < common; i += 1) await Prescription.updateOne({ id: existing[i].id, appointmentId: appointment.id }, { $set: items[i] }, { runValidators: true });
  if (items.length < existing.length) await Prescription.deleteMany({ appointmentId: appointment.id, id: { $in: existing.slice(items.length).map((row) => row.id) } });
  if (items.length > existing.length) await Prescription.insertMany(items.slice(existing.length).map((item) => ({ ...item, appointmentId: appointment.id })));
  return serialize(await Prescription.find({ appointmentId: appointment.id }).sort({ id: 1 }).lean());
};
module.exports = { create, getByAppointment, update };
