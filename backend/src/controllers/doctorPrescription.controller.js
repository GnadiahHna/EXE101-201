const doctorPrescriptionService = require('../services/doctorPrescription.service');

const getByAppointment = async (req, res) => {
  const prescriptions = await doctorPrescriptionService.getByAppointment(req.user, req.params.appointmentId);
  res.json({ success: true, message: 'Appointment prescriptions', data: prescriptions });
};

const createBatch = async (req, res, next) => {
  try {
    const { items, medicines, prescriptions: reqPrescriptions, overrideAllergyConfirmation } = req.body;
    const data = items || medicines || reqPrescriptions || req.body;
    const prescriptions = await doctorPrescriptionService.create(req.user, req.params.appointmentId, data, {
      overrideAllergyConfirmation: Boolean(overrideAllergyConfirmation || req.body.overrideAllergyConfirmation),
    });
    res.status(201).json({ success: true, message: 'Prescriptions created', data: prescriptions });
  } catch (err) {
    next(err);
  }
};

const createSingle = async (req, res, next) => {
  try {
    const { overrideAllergyConfirmation } = req.body;
    const prescriptions = await doctorPrescriptionService.create(req.user, req.params.appointmentId, [req.body], {
      overrideAllergyConfirmation: Boolean(overrideAllergyConfirmation),
    });
    res.status(201).json({ success: true, message: 'Prescription created', data: prescriptions[0] });
  } catch (err) {
    next(err);
  }
};

const updateBatch = async (req, res, next) => {
  try {
    const { items, medicines, prescriptions: reqPrescriptions, overrideAllergyConfirmation } = req.body;
    const data = items || medicines || reqPrescriptions || req.body;
    const prescriptions = await doctorPrescriptionService.update(req.user, req.params.appointmentId, data, {
      overrideAllergyConfirmation: Boolean(overrideAllergyConfirmation || req.body.overrideAllergyConfirmation),
    });
    res.json({ success: true, message: 'Prescriptions updated', data: prescriptions });
  } catch (err) {
    next(err);
  }
};

module.exports = { createBatch, createSingle, getByAppointment, updateBatch };
