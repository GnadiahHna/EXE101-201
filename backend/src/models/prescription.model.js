const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');

const prescriptionSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: Number,
      required: true,
      index: true,
    },
    medicineName: {
      type: String,
      required: true,
      trim: true,
    },
    dosage: {
      type: String,
      default: null,
    },
    duration: {
      type: String,
      default: null,
    },
    instructions: {
      type: String,
      default: null,
    },
    // Structured medication details
    strength: {
      type: String,
      default: null,
      trim: true,
    },
    dosageForm: {
      type: String,
      default: null, // e.g., 'Viên nén', 'Siro', 'Gói'
      trim: true,
    },
    dose: {
      type: String,
      default: null, // e.g., '1 viên', '5ml'
      trim: true,
    },
    frequency: {
      type: String,
      default: null, // e.g., '2 lần/ngày (sáng, tối)'
      trim: true,
    },
    durationDays: {
      type: Number,
      default: null,
    },
    route: {
      type: String,
      default: 'Uống', // e.g., 'Uống', 'Bôi ngoài da', 'Tiêm'
      trim: true,
    },
    activeIngredient: {
      type: String,
      default: null,
      trim: true,
    },
    allergyWarningAcknowledged: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  },
);

prescriptionSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'prescriptions',
});

const Prescription = mongoose.model('Prescription', prescriptionSchema, 'prescriptions');

module.exports = Prescription;

