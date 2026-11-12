const { DoctorShift, User, Specialty } = require('../models');

/**
 * Retrieve up to 3 upcoming available slots for a given specialty.
 *
 * @param {number|string} specialtyId
 * @param {number} [limit=3]
 * @returns {Promise<Array<{ shiftId: number, slotId: number, slotNumber: number, date: string, startTime: string, endTime: string, doctorId: number, doctorName: string, specialtyName?: string }>>}
 */
async function getSuggestedSlotsForSpecialty(specialtyId, limit = 3) {
  if (!specialtyId) return [];

  try {
    const specNum = Number(specialtyId);
    const specialty = await Specialty.findOne({ id: specNum, isEnable: true }).select('name').lean();
    const specialtyName = specialty?.name || '';

    // Find active doctors in this specialty (hỗ trợ cả userType và role)
    const doctors = await User.find({
      $or: [{ role: 'Doctor' }, { userType: 'Doctor' }],
      specialtyId: specNum,
      isEnable: true,
      isDeleted: false,
    })
      .select('id fullName degree')
      .lean();

    if (!doctors.length) return [];
    const doctorMap = new Map(doctors.map((d) => [d.id, `${d.degree ? d.degree + ' ' : ''}${d.fullName}`]));
    const doctorIds = doctors.map((d) => d.id);

    const todayStr = new Date().toISOString().slice(0, 10);

    // Find shifts from today onwards for these doctors
    const shifts = await DoctorShift.find({
      doctorId: { $in: doctorIds },
      date: { $gte: todayStr },
      status: 'ACTIVE',
    })
      .sort({ date: 1, startTime: 1 })
      .limit(10)
      .lean();

    const suggestedSlots = [];

    for (const shift of shifts) {
      if (suggestedSlots.length >= limit) break;
      const availableSlots = (shift.slots || []).filter((s) => s.status === 'AVAILABLE');

      for (const slot of availableSlots) {
        if (suggestedSlots.length >= limit) break;
        suggestedSlots.push({
          shiftId: shift.id,
          slotId: slot.id,
          slotNumber: slot.slotNumber,
          date: shift.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          doctorId: shift.doctorId,
          doctorName: doctorMap.get(shift.doctorId) || 'Bác sĩ chuyên khoa',
          specialtyName,
        });
      }
    }

    return suggestedSlots;
  } catch (err) {
    console.warn('[chatbot] Error getting suggested slots:', err.message);
    return [];
  }
}

module.exports = {
  getSuggestedSlotsForSpecialty,
};
