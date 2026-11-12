const { ROLES } = require('../constants/enums');
const userService = require('../services/user.service');
const { Feedback } = require('../models');
const { sendSuccess } = require('../utils/response');
const { toPublicDoctor } = require('../utils/doctorDto');

async function attachDoctorRatings(doctors) {
  const list = Array.isArray(doctors) ? doctors : [doctors];
  if (!list.length) return [];
  const doctorIds = list.map((d) => d.id).filter(Boolean);

  let ratingMap = new Map();
  if (doctorIds.length > 0) {
    const aggregates = await Feedback.aggregate([
      { $match: { doctorId: { $in: doctorIds }, status: 'APPROVED', deletedAt: null } },
      { $group: { _id: '$doctorId', avgRating: { $avg: '$rating' } } },
    ]);
    ratingMap = new Map(aggregates.map((ag) => [ag._id, ag.avgRating]));
  }

  return list.map((d) => toPublicDoctor(d, { rating: ratingMap.get(d.id) }));
}

const getDoctorsBySpecialty = async (req, res) => {
  const doctors = await userService.listUsers({
    role: ROLES.DOCTOR,
    specialtyId: req.params.specialtyId,
    includeDisabled: false,
  });
  const publicDoctors = await attachDoctorRatings(doctors);
  return sendSuccess(res, { data: publicDoctors });
};

const getDoctorById = async (req, res) => {
  const doctor = await userService.getUserById(req.params.id, {
    expectedRole: ROLES.DOCTOR,
  });
  const [publicDoctor] = await attachDoctorRatings([doctor]);
  return sendSuccess(res, { data: publicDoctor });
};

const searchDoctors = async (req, res) => {
  const doctors = await userService.listUsers({
    role: ROLES.DOCTOR,
    keyword: req.query.keyword || '',
    includeDisabled: false,
  });
  const publicDoctors = await attachDoctorRatings(doctors);
  return sendSuccess(res, { data: publicDoctors });
};

const deleteDoctor = async (req, res) => {
  const result = await userService.deleteStaff(req.user, req.params.id, {
    expectedRole: ROLES.DOCTOR,
    req,
  });
  return sendSuccess(res, {
    message: result.message,
    data: result,
  });
};

module.exports = {
  getDoctorsBySpecialty,
  getDoctorById,
  searchDoctors,
  deleteDoctor,
};

