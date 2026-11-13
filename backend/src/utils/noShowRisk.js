/**
 * Calculate No-Show Risk Score (0.0 to 1.0) using an explainable, deterministic rule-based formula.
 * Strictly avoids LLMs for mathematical risk calculations.
 *
 * Factors evaluated:
 * 1. History: Previous no-shows (+0.30 per past no-show) & late cancellations (+0.15).
 * 2. Lead Time: Booked > 7 days in advance (+0.15) or > 14 days (+0.25).
 * 3. Payment: Pre-paid online appointment (-0.40).
 * 4. Timing: Late evening shift (+0.10).
 *
 * @param {object} params
 * @param {number} params.pastNoShowCount
 * @param {number} params.pastLateCancelCount
 * @param {number} params.leadTimeDays
 * @param {boolean} params.isPrepaid
 * @param {string} params.shiftType - 'MORNING' | 'AFTERNOON' | 'EVENING'
 * @returns {{ score: number, level: 'LOW'|'MEDIUM'|'HIGH', factors: string[] }}
 */
function calculateNoShowRisk({
  pastNoShowCount = 0,
  pastLateCancelCount = 0,
  leadTimeDays = 0,
  isPrepaid = false,
  shiftType = 'MORNING',
}) {
  let score = 0.1; // Baseline risk
  const factors = [];

  if (pastNoShowCount > 0) {
    const penalty = Math.min(pastNoShowCount * 0.3, 0.6);
    score += penalty;
    factors.push(`Từng có ${pastNoShowCount} lần không đến khám (No-show) (+${penalty.toFixed(2)})`);
  }

  if (pastLateCancelCount > 0) {
    const penalty = Math.min(pastLateCancelCount * 0.15, 0.3);
    score += penalty;
    factors.push(`Từng có ${pastLateCancelCount} lần hủy hẹn cận giờ (+${penalty.toFixed(2)})`);
  }

  if (leadTimeDays > 14) {
    score += 0.25;
    factors.push('Đặt lịch trước trên 14 ngày (+0.25)');
  } else if (leadTimeDays > 7) {
    score += 0.15;
    factors.push('Đặt lịch trước trên 7 ngày (+0.15)');
  }

  if (shiftType === 'EVENING') {
    score += 0.1;
    factors.push('Khung giờ khám buổi tối (+0.10)');
  }

  if (isPrepaid) {
    score -= 0.4;
    factors.push('Đã thanh toán trước trực tuyến (-0.40)');
  } else {
    score += 0.1;
    factors.push('Chưa thanh toán trước (+0.10)');
  }

  // Clamp score between 0.00 and 1.00
  const normalizedScore = Math.max(0, Math.min(1, Math.round(score * 100) / 100));

  let level = 'LOW';
  if (normalizedScore >= 0.6) {
    level = 'HIGH';
  } else if (normalizedScore >= 0.35) {
    level = 'MEDIUM';
  }

  return {
    score: normalizedScore,
    level,
    factors,
  };
}

module.exports = {
  calculateNoShowRisk,
};

