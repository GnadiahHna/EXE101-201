const { DoctorShift, User, Specialty } = require('../models');

/**
 * Retrieve diverse upcoming available slots for a given specialty:
 * - Distributed across different doctors and different shift times (Sáng, Chiều, Tối).
 * - Avoids taking all slots from just one shift of a single doctor.
 *
 * @param {number|string} specialtyId
 * @param {number} [limit=4]
 * @returns {Promise<Array<{ shiftId: number, slotId: number, slotNumber: number, date: string, startTime: string, endTime: string, shiftType?: string, doctorId: number, doctorName: string, specialtyName?: string }>>}
 */
async function getSuggestedSlotsForSpecialty(specialtyId, limit = 4) {
  if (!specialtyId) return [];

  try {
    const specNum = Number(specialtyId);
    const specialty = await Specialty.findOne({ id: specNum, isEnable: true }).select('name').lean();
    const specialtyName = specialty?.name || '';

    // Find active doctors in this specialty (hỗ trợ cả userType và role, isDeleted !== true)
    const doctors = await User.find({
      $or: [{ role: 'Doctor' }, { userType: 'Doctor' }],
      specialtyId: specNum,
      isEnable: true,
      isDeleted: { $ne: true },
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
      .lean();

    if (!shifts.length) return [];

    // Group available slots by unique (doctorId, shift) to provide diverse options (sáng, chiều, tối, các bác sĩ khác nhau)
    const shiftGroups = [];
    for (const shift of shifts) {
      const avail = (shift.slots || []).filter((s) => s.status === 'AVAILABLE');
      if (avail.length > 0) {
        shiftGroups.push({
          shift,
          slots: avail,
        });
      }
    }

    if (!shiftGroups.length) return [];

    const suggestedSlots = [];
    const seenDoctorAndShift = new Set();

    // Round 1: Pick the first available slot from each distinct (doctor, shiftType) to ensure variety
    for (const group of shiftGroups) {
      if (suggestedSlots.length >= limit) break;
      const key = `${group.shift.doctorId}-${group.shift.shift || group.shift.shiftType}`;
      if (!seenDoctorAndShift.has(key)) {
        seenDoctorAndShift.add(key);
        const slot = group.slots[0];
        suggestedSlots.push({
          shiftId: group.shift.id,
          slotId: slot.id,
          slotNumber: slot.slotNumber,
          date: group.shift.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          shiftType: group.shift.shift || group.shift.shiftType,
          doctorId: group.shift.doctorId,
          doctorName: doctorMap.get(group.shift.doctorId) || 'Bác sĩ chuyên khoa',
          specialtyName,
        });
      }
    }

    // Round 2: If still under limit, fill with remaining available slots
    if (suggestedSlots.length < limit) {
      for (const group of shiftGroups) {
        if (suggestedSlots.length >= limit) break;
        for (const slot of group.slots) {
          if (suggestedSlots.length >= limit) break;
          const alreadyPicked = suggestedSlots.some(
            (s) => s.shiftId === group.shift.id && s.slotId === slot.id,
          );
          if (!alreadyPicked) {
            suggestedSlots.push({
              shiftId: group.shift.id,
              slotId: slot.id,
              slotNumber: slot.slotNumber,
              date: group.shift.date,
              startTime: slot.startTime,
              endTime: slot.endTime,
              shiftType: group.shift.shift || group.shift.shiftType,
              doctorId: group.shift.doctorId,
              doctorName: doctorMap.get(group.shift.doctorId) || 'Bác sĩ chuyên khoa',
              specialtyName,
            });
          }
        }
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
