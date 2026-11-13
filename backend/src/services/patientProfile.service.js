const { PatientProfile, Appointment } = require('../models');
const ApiError = require('../utils/ApiError');
const { parsePositiveInt, normalizeGender } = require('../utils/normalizers');
const { ROLES } = require('../constants/enums');
const env = require('../config/env');

const MAX_PROFILES_PER_USER = 10;

const getTodayString = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.clinicTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const validateDob = (dobInput) => {
  if (dobInput == null || dobInput === '') return null;
  const dobStr = String(dobInput).trim();
  if (!dobStr) return null;

  const parsed = new Date(dobStr);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Ngày sinh không hợp lệ');
  }

  const isoDate = parsed.toISOString().slice(0, 10);
  const today = getTodayString();
  if (isoDate > today) {
    throw new ApiError(400, 'Ngày sinh không được lớn hơn ngày hiện tại');
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dobStr) ? dobStr : isoDate;
};

const validatePhoneNumber = (phoneInput) => {
  if (phoneInput == null || String(phoneInput).trim() === '') return null;
  const phone = String(phoneInput).trim();
  // Validates common Vietnamese phone format: 10 digits starting with 0, or international +84...
  const phoneRegex = /^(?:\+84|0)[1-9]\d{8}$/;
  if (!phoneRegex.test(phone)) {
    throw new ApiError(
      400,
      'Số điện thoại không hợp lệ (yêu cầu định dạng 10 chữ số, ví dụ 0901234567)',
    );
  }
  return phone;
};

/**
 * Fetch active dependent profiles belonging to the authenticated patient (`ownerId`).
 */
async function getMyProfiles(ownerId) {
  const numericOwnerId = parsePositiveInt(ownerId, 'ownerId');
  const profiles = await PatientProfile.find({
    ownerId: numericOwnerId,
    isArchived: false,
  }).sort({ id: 1 });

  return profiles.map((p) => p.toJSON());
}

/**
 * Fetch a single patient profile by numeric ID with ownership checks.
 */
async function getProfileById(user, profileId) {
  const id = parsePositiveInt(profileId, 'id');
  const profile = await PatientProfile.findOne({ id, isArchived: false });

  if (!profile) {
    throw new ApiError(404, 'Không tìm thấy hồ sơ bệnh nhân');
  }

  if (user.userType === ROLES.PATIENT && profile.ownerId !== user.id) {
    throw new ApiError(403, 'Bạn không có quyền truy cập hồ sơ bệnh nhân này');
  }

  return profile.toJSON();
}

/**
 * Helper for appointment booking: ensure profile exists, belongs to owner, and is NOT archived.
 */
async function getActiveProfileForOwner(ownerId, profileId) {
  const numericOwnerId = parsePositiveInt(ownerId, 'ownerId');
  const numericId = parsePositiveInt(profileId, 'id');
  const profile = await PatientProfile.findOne({
    id: numericId,
    ownerId: numericOwnerId,
    isArchived: false,
  });

  if (!profile) {
    throw new ApiError(
      400,
      `Hồ sơ bệnh nhân #${numericId} không tồn tại hoặc đã bị lưu trữ, không thể dùng để đặt lịch`,
    );
  }

  return profile.toJSON();
}

/**
 * Create a new patient profile for the current patient user.
 */
async function createProfile(user, payload = {}) {
  const ownerId = parsePositiveInt(user.id, 'userId');

  const activeCount = await PatientProfile.countDocuments({ ownerId, isArchived: false });
  if (activeCount >= MAX_PROFILES_PER_USER) {
    throw new ApiError(
      400,
      `Mỗi tài khoản chỉ được tạo tối đa ${MAX_PROFILES_PER_USER} hồ sơ người thân`,
    );
  }

  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  if (!fullName) {
    throw new ApiError(400, 'Họ và tên không được để trống');
  }
  if (fullName.length > 255) {
    throw new ApiError(400, 'Họ và tên không được vượt quá 255 ký tự');
  }

  const gender = normalizeGender(payload.gender);
  const phoneNumber = validatePhoneNumber(payload.phoneNumber);
  const dob = validateDob(payload.dob);

  let relationship = null;
  if (payload.relationship != null && String(payload.relationship).trim() !== '') {
    relationship = String(payload.relationship).trim();
    if (relationship.length > 100) {
      throw new ApiError(400, 'Mối quan hệ không được vượt quá 100 ký tự');
    }
  }

  const parseStringArray = (val) => {
    if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof val === 'string' && val.trim()) return val.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    return [];
  };

  const allergies = parseStringArray(payload.allergies);
  const medicalHistory = parseStringArray(payload.medicalHistory);
  const weightKg = Number.isFinite(Number(payload.weightKg)) && Number(payload.weightKg) > 0 ? Number(payload.weightKg) : null;
  const heightCm = Number.isFinite(Number(payload.heightCm)) && Number(payload.heightCm) > 0 ? Number(payload.heightCm) : null;

  const profile = await PatientProfile.create({
    ownerId,
    fullName,
    gender,
    phoneNumber,
    dob,
    relationship,
    allergies,
    medicalHistory,
    weightKg,
    heightCm,
    isArchived: false,
  });

  return profile.toJSON();
}

/**
 * Update an existing patient profile belonging to the current user.
 */
async function updateProfile(user, profileId, payload = {}) {
  const id = parsePositiveInt(profileId, 'id');
  const profile = await PatientProfile.findOne({ id, isArchived: false });

  if (!profile) {
    throw new ApiError(404, 'Không tìm thấy hồ sơ bệnh nhân');
  }

  if (profile.ownerId !== user.id) {
    throw new ApiError(403, 'Bạn không có quyền cập nhật hồ sơ bệnh nhân này');
  }

  const parseStringArray = (val) => {
    if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof val === 'string' && val.trim()) return val.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    return [];
  };

  if (payload.allergies !== undefined) {
    profile.allergies = parseStringArray(payload.allergies);
  }

  if (payload.medicalHistory !== undefined) {
    profile.medicalHistory = parseStringArray(payload.medicalHistory);
  }

  if (payload.weightKg !== undefined) {
    profile.weightKg = Number.isFinite(Number(payload.weightKg)) && Number(payload.weightKg) > 0 ? Number(payload.weightKg) : null;
  }

  if (payload.heightCm !== undefined) {
    profile.heightCm = Number.isFinite(Number(payload.heightCm)) && Number(payload.heightCm) > 0 ? Number(payload.heightCm) : null;
  }

  if (payload.fullName !== undefined) {
    const trimmed = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
    if (!trimmed) {
      throw new ApiError(400, 'Họ và tên không được để trống');
    }
    if (trimmed.length > 255) {
      throw new ApiError(400, 'Họ và tên không được vượt quá 255 ký tự');
    }
    profile.fullName = trimmed;
  }

  if (payload.gender !== undefined) {
    profile.gender = normalizeGender(payload.gender);
  }

  if (payload.phoneNumber !== undefined) {
    profile.phoneNumber = validatePhoneNumber(payload.phoneNumber);
  }

  if (payload.dob !== undefined) {
    profile.dob = validateDob(payload.dob);
  }

  if (payload.relationship !== undefined) {
    if (payload.relationship == null || String(payload.relationship).trim() === '') {
      profile.relationship = null;
    } else {
      const rel = String(payload.relationship).trim();
      if (rel.length > 100) {
        throw new ApiError(400, 'Mối quan hệ không được vượt quá 100 ký tự');
      }
      profile.relationship = rel;
    }
  }

  await profile.save();
  return profile.toJSON();
}

/**
 * Delete or soft-archive a patient profile.
 * If the profile has historical appointment links, mark isArchived = true to preserve history.
 * Otherwise, permanently delete the record.
 */
async function deleteProfile(user, profileId) {
  const id = parsePositiveInt(profileId, 'id');
  const profile = await PatientProfile.findOne({ id, isArchived: false });

  if (!profile) {
    throw new ApiError(404, 'Không tìm thấy hồ sơ bệnh nhân');
  }

  if (profile.ownerId !== user.id) {
    throw new ApiError(403, 'Bạn không có quyền xóa hồ sơ bệnh nhân này');
  }

  const hasLinkedAppointment = await Appointment.exists({ 'patients.id': profile.id });

  if (hasLinkedAppointment) {
    profile.isArchived = true;
    await profile.save();
  } else {
    await PatientProfile.deleteOne({ id: profile.id });
  }

  return { message: 'Xóa hồ sơ bệnh nhân thành công' };
}

module.exports = {
  MAX_PROFILES_PER_USER,
  getMyProfiles,
  getProfileById,
  getActiveProfileForOwner,
  createProfile,
  updateProfile,
  deleteProfile,
};
