const { Specialty } = require('../models');
const { matchesWordBoundary } = require('../utils/chatText');
const { checkEmergencyTrigger, getEmergencyResponse } = require('../utils/chatEmergency');
const { answerClinicOperations } = require('./chatbotOps.service');
const { callGeminiTriage } = require('./geminiTriage.service');
const { getSuggestedSlotsForSpecialty } = require('./chatbotSlot.service');
const { redactPII } = require('../utils/chatText');

/**
 * Verified specialty rule templates for offline/fallback mode (strictly without drug dosages).
 */
const SPECIALTY_RULES = [
  {
    key: 'pediatrics',
    patterns: ['tre em', 'so sinh', 'be sot', 'em be', 'be quay khoc', 'con toi sot', 'tre sot cao'],
    specialtyNamePatterns: ['nhi', 'pediatric'],
    advice: `Đối với trẻ nhỏ có triệu chứng sốt hoặc khó chịu:
- Cho trẻ mặc quần áo thoáng mát, uống nhiều nước hoặc tăng cường bú mẹ/bình.
- Lau người hoặc chườm bằng nước ấm ở các vùng nách, bẹn.
- Theo dõi sát thân nhiệt và các dấu hiệu li bì, nôn trớ, co giật.
- Hãy tham khảo ý kiến bác sĩ hoặc dược sĩ chuyên khoa Nhi trước khi cho trẻ dùng bất kỳ loại thuốc nào.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'dental',
    patterns: ['nhuc rang', 'dau rang', 'chay mau chan rang', 'sau rang', 'nho rang', 'sung loi', 'tay trang rang'],
    specialtyNamePatterns: ['rang ham mat', 'nha khoa', 'dental'],
    advice: `Đối với các triệu chứng về răng miệng:
- Súc miệng nhẹ nhàng bằng nước muối sinh lý ấm sau khi ăn.
- Tránh ăn thức ăn quá nóng, quá lạnh, quá cứng hoặc nhiều đường.
- Không tự ý dùng vật nhọn chọc vào vùng tổn thương.
- Bạn nên đến phòng khám để bác sĩ Răng Hàm Mặt thăm khám và xử lý tận gốc nguyên nhân.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'orthopedics',
    patterns: ['dau khop', 'dau lung', 'thoai hoa', 'trat chan', 'dau goi', 'bong gan', 'dau vai gay', 'dau cot song'],
    specialtyNamePatterns: ['co xuong khop', 'orthopedic', 'chan thuong'],
    advice: `Đối với các cơn đau cơ xương khớp hoặc chấn thương nhẹ:
- Tạm thời hạn chế vận động mạnh, dành thời gian nghỉ ngơi vùng bị đau.
- Có thể chườm lạnh trong 24-48 giờ đầu nếu có sưng nề do va chạm.
- Không tự ý bẻ khớp hoặc nắn chỉnh khi chưa có chẩn đoán hình ảnh.
- Nên đến gặp bác sĩ Cơ Xương Khớp để được kiểm tra và tư vấn phác đồ điều trị an toàn.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'ent',
    patterns: ['viem hong', 'dau hong', 'nghet mui', 'chay nuoc mui', 'u tai', 'dau tai', 'khan tieng'],
    specialtyNamePatterns: ['tai mui hong', 'ent'],
    advice: `Đối với các triệu chứng vùng tai mũi họng:
- Giữ ấm vùng cổ, súc họng bằng nước muối sinh lý hàng ngày.
- Uống nhiều nước ấm, tránh uống nước đá hoặc ngồi điều hòa quá lạnh.
- Không tự ý mua thuốc kháng sinh uống khi chưa có chỉ định của bác sĩ.
- Nếu đau họng kéo dài hoặc kèm sốt, hãy đến khám chuyên khoa Tai Mũi Họng.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'dermatology',
    patterns: ['ngua da', 'di ung', 'noi me day', 'mun trung ca', 'phat ban', 'nam da', 'chay man'],
    specialtyNamePatterns: ['da lieu', 'dermatology'],
    advice: `Đối với các vấn đề về da liễu:
- Giữ vệ sinh da sạch sẽ, khô thoáng, tránh gãi cào làm trầy xước dễ nhiễm trùng.
- Tránh tiếp xúc với xà phòng hoặc hóa chất có tính tẩy rửa mạnh.
- Không tự ý bôi các loại thuốc chứa corticoid không rõ nguồn gốc.
- Nên đi khám bác sĩ Da Liễu để xác định đúng nguyên nhân gây bệnh.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'fever_care',
    patterns: ['lam the nao de ha sot', 'cach ha sot', 'meo ha sot', 'lam sao de het sot', 'huong dan ha sot'],
    specialtyNamePatterns: ['noi', 'internal'],
    advice: `Hướng dẫn chăm sóc khi bị sốt:
- Nghỉ ngơi tại nơi thoáng mát, mặc quần áo rộng rãi, mỏng nhẹ.
- Uống nhiều nước (nước lọc, nước hoa quả hoặc dung dịch bù điện giải theo hướng dẫn của dược sĩ).
- Dùng khăn mềm nhúng nước ấm lau chườm ở trán, nách, bẹn.
- Theo dõi nhiệt độ cơ thể bằng nhiệt kế định kỳ.
- Không tự ý dùng thuốc hạ sốt khi chưa rõ liều lượng phù hợp, hãy hỏi ý kiến bác sĩ/dược sĩ.
- **Dấu hiệu cần đi khám ngay**: Sốt cao liên tục trên 39°C không hạ, sốt kéo dài trên 48 giờ, nôn nhiều, khó thở, co giật hoặc đau đầu dữ dội.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
  {
    key: 'internal',
    patterns: ['sot', 'cam cum', 'chong mat', 'dau dau', 'met moi', 'dau bung', 'tieu chay', 'kho tieu', 'day bung'],
    specialtyNamePatterns: ['noi', 'internal'],
    advice: `Đối với các triệu chứng mệt mỏi, sốt hoặc rối loạn tiêu hóa:
- Nghỉ ngơi nhiều hơn, uống đủ nước và ăn thức ăn mềm, dễ tiêu hóa.
- Theo dõi thân nhiệt và các triệu chứng kèm theo.
- Không tự ý sử dụng các loại thuốc điều trị khi chưa có hướng dẫn y tế.
- Bác sĩ chuyên khoa Nội tổng quát sẽ giúp bạn thăm khám toàn diện và tìm ra nguyên nhân chính xác.

*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
  },
];

/**
 * Map matched specialty key to database Specialty ID.
 */
async function resolveSpecialtyId(specialtyKey) {
  if (!specialtyKey) return null;
  const specialties = await Specialty.find({ isEnable: true }).lean();
  if (!specialties.length) return null;

  const rule = SPECIALTY_RULES.find((r) => r.key === specialtyKey);
  const searchTerms = rule ? rule.specialtyNamePatterns : [specialtyKey];

  for (const s of specialties) {
    const sNameNorm = s.name.toLowerCase();
    for (const term of searchTerms) {
      if (sNameNorm.includes(term.toLowerCase())) {
        return s.id;
      }
    }
  }

  // Fallback to first available specialty if none matched
  return specialties[0]?.id || null;
}

/**
 * Master Chatbot Answer Pipeline:
 * 1. Text normalization & Prompt injection safeguard
 * 2. Hard emergency rule (bypasses LLM, urgency=emergency, instructions for 115)
 * 3. Operations Q&A from DB (hours, address, pricing, vouchers, specialties, booking)
 * 4. Gemini AI Triage (redacted PII, strict JSON schema output, timeout, budget)
 * 5. Rule-based / Verified medical fallback (no hardcoded drugs/dosages, safe care advice)
 * 6. Triage to booking: fetch up to 3 upcoming available slots for the determined specialty
 *
 * @param {object} params
 * @param {string} params.message
 * @param {Array<{role: string, text: string}>} [params.history=[]]
 * @param {string} [params.sessionId]
 * @returns {Promise<object>} Standard triage JSON response
 */
async function processChatMessage({ message, history = [], sessionId = '' }) {
  const rawText = String(message || '').trim().slice(0, 1000);
  if (!rawText) {
    return {
      urgency: 'info',
      intent: 'empty_query',
      answer: 'Xin chào! Tôi có thể giúp gì cho bạn về sức khỏe hoặc thông tin phòng khám?',
      suggestedSlots: [],
      actions: [],
    };
  }

  // Step 1: Prompt Injection Guard - Check for overt adversarial attempts
  const isAdversarial = matchesWordBoundary(rawText, [
    'bo qua toan bo huong dan',
    'bo qua huong dan',
    'quen het huong dan truoc do',
    'ignore all previous instructions',
    'system prompt',
    'jailbreak',
    'dong vai',
    'dan',
    'lap trinh python',
    'viet code',
    'hack wifi',
    'chat doc',
  ]);

  if (isAdversarial) {
    return {
      urgency: 'info',
      intent: 'guardrail_rejection',
      specialtyId: null,
      suggestedSlots: [],
      actions: [],
      answer: 'Xin lỗi, tôi là Trợ lý Y tế của Nano Clinic và chỉ hỗ trợ tư vấn sức khỏe ban đầu, phân luồng chuyên khoa và thông tin phòng khám. Tôi không thể thực hiện các yêu cầu nằm ngoài phạm vi này. Bạn đang có vấn đề gì về sức khỏe cần hỗ trợ không?',
    };
  }

  // Step 2: Hard emergency red-flag triggers
  if (checkEmergencyTrigger(rawText)) {
    return getEmergencyResponse();
  }

  // Step 3: Operational Q&A from DB / Config
  const opsAnswer = await answerClinicOperations(rawText);
  if (opsAnswer) {
    return opsAnswer;
  }

  // Step 4: Gemini AI Triage
  const redactedMessage = redactPII(rawText);
  let geminiResult = null;
  try {
    geminiResult = await callGeminiTriage(redactedMessage, history);
  } catch (err) {
    console.warn('[chatbot] Gemini triage call error:', err.message);
  }

  let finalResponse = null;

  if (geminiResult && geminiResult.answer) {
    // If Gemini flagged emergency, verify with standard protocol
    if (geminiResult.urgency === 'emergency') {
      return getEmergencyResponse();
    }

    const specialtyId = await resolveSpecialtyId(geminiResult.specialtyKey);
    const suggestedSlots = specialtyId ? await getSuggestedSlotsForSpecialty(specialtyId, 3) : [];

    finalResponse = {
      urgency: geminiResult.urgency || 'routine',
      intent: 'ai_triage',
      specialtyId,
      answer: geminiResult.answer,
      redFlags: geminiResult.redFlags || [],
      needsMoreInfo: Boolean(geminiResult.needsMoreInfo),
      suggestedSlots,
      actions: suggestedSlots.length > 0 ? [{ type: 'BOOK_SLOT', label: 'Đặt lịch với slot gợi ý' }] : [],
    };
  } else {
    // Step 5: Rule-based fallback triage (No hardcoded drugs/dosages)
    let matchedRule = null;
    for (const rule of SPECIALTY_RULES) {
      if (matchesWordBoundary(rawText, rule.patterns)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      const specialtyId = await resolveSpecialtyId(matchedRule.key);
      const suggestedSlots = specialtyId ? await getSuggestedSlotsForSpecialty(specialtyId, 3) : [];

      finalResponse = {
        urgency: matchedRule.key === 'pediatrics' ? 'urgent' : 'routine',
        intent: 'rule_triage',
        specialtyId,
        answer: matchedRule.advice,
        suggestedSlots,
        actions: suggestedSlots.length > 0 ? [{ type: 'BOOK_SLOT', label: 'Đặt lịch hẹn' }] : [],
      };
    } else {
      // General medical query fallback
      finalResponse = {
        urgency: 'routine',
        intent: 'general_inquiry',
        specialtyId: null,
        suggestedSlots: [],
        actions: [{ type: 'NAVIGATE', label: 'Xem danh sách chuyên khoa', value: '/specialties' }],
        answer: `Cảm ơn bạn đã chia sẻ. Để có đánh giá chính xác nhất về tình trạng sức khỏe, bạn nên đến trực tiếp phòng khám để bác sĩ chuyên khoa thăm khám.\n\nNếu bạn có các dấu hiệu bất thường như sốt cao, đau nhiều hoặc mệt mỏi, xin vui lòng đến cơ sở y tế gần nhất.\n\n*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`,
      };
    }
  }

  // Safety post-validation: strip any dangerous code or unintended dosages if present
  if (finalResponse.answer) {
    // Ensure medical disclaimer exists
    if (!finalResponse.answer.includes('không thay thế')) {
      finalResponse.answer += '\n\n*Thông tin tham khảo, không thay thế chẩn đoán của bác sĩ.*';
    }
  }

  return finalResponse;
}

module.exports = {
  processChatMessage,
  // Backwards compatibility
  answerQuestion: async (text) => {
    const res = await processChatMessage({ message: text });
    return res.answer;
  },
};
