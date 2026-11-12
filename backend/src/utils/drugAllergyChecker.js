const drugDatabase = require('../data/drugIngredients.json');

/**
 * Check a list of prescribed medicines against a patient's documented allergies.
 * Deterministic offline lookup — strictly avoids LLMs for allergy/interaction checking.
 *
 * @param {Array<{ medicineName: string }>} medicines
 * @param {string[]} patientAllergies
 * @returns {Array<{ medicineName: string, matchedAllergy: string, allergyGroup: string, message: string }>}
 */
function checkDrugAllergies(medicines = [], patientAllergies = []) {
  if (!Array.isArray(medicines) || !Array.isArray(patientAllergies) || patientAllergies.length === 0) {
    return [];
  }

  const normalizedPatientAllergies = patientAllergies
    .map((a) => String(a).toLowerCase().trim())
    .filter(Boolean);

  if (normalizedPatientAllergies.length === 0) {
    return [];
  }

  const warnings = [];

  for (const item of medicines) {
    const medName = String(item.medicineName || '').toLowerCase().trim();
    if (!medName) continue;

    // Search in local reference database
    const match = drugDatabase.find((d) => {
      const dbName = d.name.toLowerCase();
      const dbIngr = d.activeIngredient.toLowerCase();
      return medName.includes(dbName) || dbIngr.includes(medName);
    });

    const candidateTerms = match
      ? [match.name.toLowerCase(), match.activeIngredient.toLowerCase(), match.drugClass.toLowerCase(), match.allergyGroup.toLowerCase()]
      : [medName];

    for (const allergy of normalizedPatientAllergies) {
      const isHit = candidateTerms.some((term) => term.includes(allergy) || allergy.includes(term));
      if (isHit) {
        warnings.push({
          medicineName: item.medicineName,
          matchedAllergy: allergy,
          allergyGroup: match?.allergyGroup || allergy,
          message: `Thuốc '${item.medicineName}' có nguy cơ gây dị ứng tương thích với tiền sử dị ứng '${allergy}' của bệnh nhân (${match?.allergyGroup || 'Nhóm hoạt chất'}).`,
        });
        break;
      }
    }
  }

  return warnings;
}

module.exports = {
  checkDrugAllergies,
};
