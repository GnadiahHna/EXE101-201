const { Appointment } = require('../models');
const { configService } = require('../config/config.service');
const { redactPII } = require('../utils/chatText');
const ApiError = require('../utils/ApiError');

/**
 * Summarize patient intake information into a concise 5-bullet summary for attending doctors.
 * Only accessible by the assigned doctor for that specific appointment.
 * Caches summary on appointment document to avoid duplicate LLM calls.
 *
 * @param {object} doctorUser - Authenticated doctor
 * @param {number|string} appointmentId
 * @returns {Promise<{ summary: string, cached: boolean }>}
 */
async function getIntakeSummary(doctorUser, appointmentId) {
  const doctorId = Number(doctorUser.id || doctorUser.userId);
  const apptId = Number(appointmentId);

  const appointment = await Appointment.findOne({ id: apptId });
  if (!appointment || appointment.doctorId !== doctorId) {
    throw new ApiError(404, 'Không tìm thấy lịch hẹn hoặc bạn không phải bác sĩ phụ trách');
  }

  // Check cache first
  if (appointment.intakeSummary) {
    return {
      summary: appointment.intakeSummary,
      cached: true,
      disclaimer: 'Bản nháp do AI, bác sĩ cần xác minh',
    };
  }

  const intake = appointment.intake || {};
  const rawText = `Triệu chứng: ${intake.symptoms || 'Chưa cung cấp'}
Thời gian bị: ${intake.duration || 'Chưa rõ'}
Thuốc đang dùng: ${intake.currentMedications || 'Không'}
Dị ứng: ${(intake.allergies || []).join(', ') || 'Chưa ghi nhận'}
Bệnh nền: ${(intake.medicalHistory || []).join(', ') || 'Không'}
Chiều cao/Cân nặng: ${intake.heightCm ? intake.heightCm + 'cm' : ''} ${intake.weightKg ? intake.weightKg + 'kg' : ''}
Ghi chú thêm: ${intake.notes || 'Không'}`;

  // Redact any incidental PII
  const sanitizedInput = redactPII(rawText);

  let summaryText = '';
  const apiKey = configService.geminiApiKey;

  if (apiKey) {
    try {
      const prompt = `Bạn là trợ lý y khoa. Hãy tóm tắt thông tin tiền khám của bệnh nhân thành đúng 5 dòng ngắn gọn, súc tích dành cho bác sĩ trước khi bắt đầu khám:
${sanitizedInput}

Định dạng:
- Dòng 1: Lý do khám chính & Thời gian
- Dòng 2: Diễn tiến triệu chứng
- Dòng 3: Tiền sử bệnh nền & Dị ứng đáng lưu ý
- Dòng 4: Thuốc đang sử dụng
- Dòng 5: Cảnh báo hoặc điểm cần lưu tâm đặc biệt

Bắt buộc bắt đầu phản hồi bằng nhãn: [Bản nháp do AI, bác sĩ cần xác minh]`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        summaryText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } catch (err) {
      console.warn('[intakeSummary] Gemini call error:', err.message);
    }
  }

  // Deterministic rule-based fallback if Gemini API is disabled/offline
  if (!summaryText) {
    summaryText = `[Bản nháp do AI, bác sĩ cần xác minh]
- Lý do khám: ${intake.symptoms || 'Khám sức khỏe tổng quát'} (Thời gian: ${intake.duration || 'Mới khởi phát'})
- Thể trạng: Chiều cao ${intake.heightCm || '--'} cm, Cân nặng ${intake.weightKg || '--'} kg
- Tiền sử bệnh nền: ${(intake.medicalHistory || []).join(', ') || 'Chưa ghi nhận'}
- Tiền sử dị ứng: ${(intake.allergies || []).join(', ') || 'Không có'}
- Thuốc đang sử dụng: ${intake.currentMedications || 'Không có'}`;
  }

  // Cache summary onto appointment
  appointment.intakeSummary = summaryText;
  await appointment.save();

  return {
    summary: summaryText,
    cached: false,
    disclaimer: 'Bản nháp do AI, bác sĩ cần xác minh',
  };
}

module.exports = {
  getIntakeSummary,
};
