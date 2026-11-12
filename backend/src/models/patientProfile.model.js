const mongoose = require('mongoose');
const baseSchemaPlugin = require('./plugins/baseSchema.plugin');
const { GENDERS } = require('../constants/enums');

const patientProfileSchema = new mongoose.Schema(
  {
    ownerId: {
      type: Number,
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    gender: {
      type: String,
      enum: Object.values(GENDERS),
      default: GENDERS.OTHER,
    },
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50,
    },
    dob: {
      type: String, // "YYYY-MM-DD"
      default: null,
      trim: true,
      maxlength: 50,
    },
    relationship: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Medical intake extensions
    allergies: {
      type: [String],
      default: [],
    },
    medicalHistory: {
      type: [String],
      default: [],
    },
    weightKg: {
      type: Number,
      default: null,
    },
    heightCm: {
      type: Number,
      default: null,
    },
    consentStored: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

patientProfileSchema.index({ ownerId: 1, isArchived: 1 });

patientProfileSchema.plugin(baseSchemaPlugin, {
  sequenceName: 'patient_profiles',
});

const PatientProfile = mongoose.model(
  'PatientProfile',
  patientProfileSchema,
  'patient_profiles',
);

module.exports = PatientProfile;

