const crypto = require('crypto');
const { configService } = require('../config/config.service');
const { matchesWordBoundary, removeVietnameseTones, redactPII } = require('../utils/chatText');
const { checkEmergencyTrigger, getEmergencyResponse } = require('../utils/chatEmergency');
const { answerClinicOperations } = require('./chatbotOps.service');
const { callGeminiDynamicTriage, getCachedSpecialties } = require('./geminiTriage.service');
const { getSuggestedSlotsForSpecialty } = require('./chatbotSlot.service');
const logger = require('../utils/logger');

// Out-of-scope negative cache: normalizedHash -> timestamp (TTL 10 mins)
const negativeCache = new Map();
const NEGATIVE_CACHE_TTL = 10 * 60 * 1000;

// Escalation tracking: session/IP -> { count, windowStart }
const escalationMap = new Map();
const ESCALATION_WINDOW = 10 * 60 * 1000;
const MAX_OUT_OF_SCOPE_ALLOWED = 3;

function recordEscalation(sessionId) {
  if (!sessionId) return 1;
  const now = Date.now();
  const entry = escalationMap.get(sessionId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > ESCALATION_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }
  escalationMap.set(sessionId, entry);
  return entry.count;
}

function isEscalated(sessionId) {
  if (!sessionId) return false;
  const entry = escalationMap.get(sessionId);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > ESCALATION_WINDOW) {
    escalationMap.delete(sessionId);
    return false;
  }
  return entry.count >= MAX_OUT_OF_SCOPE_ALLOWED;
}

/**
 * Text normalization (Layer 1): lowercase, strip diacritics, zero-width, extra spaces
 */
function normalizeText(text = '') {
  return String(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width characters
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hashNormalizedText(normText) {
  return crypto.createHash('sha256').update(normText).digest('hex');
}

/**
 * Fast Regex injection / Jailbreak detector (Layer 1 heuristic)
 */
function detectInjectionSignals(text) {
  const norm = removeVietnameseTones(text);
  const adversarialPatterns = [
    'bo qua toan bo huong dan',
    'bo qua huong dan',
    'quen het huong dan truoc do',
    'ignore all previous instructions',
    'system prompt',
    'jailbreak',
    'dong vai',
    'dan mode',
    'lap trinh python',
    'viet code',
    'hack wifi',
    'chat doc',
    'tao virus',
  ];
  return matchesWordBoundary(norm, adversarialPatterns);
}

/**
 * Validates post-LLM answer content:
 * - Max 900 chars
 * - No code blocks / HTML / external URLs
 * - No drug dosage patterns (e.g. 500mg, 10ml, 2 vien, mg/kg)
 * - No affirmative diagnosis ("bạn bị...", "chắc chắn là...")
 */
function validateAnswerContent(answer, activeSpecialties) {
  if (!answer || typeof answer !== 'string') return false;
  if (answer.length > 900) return false;

  // No code fences, script tags, HTML tags
  if (/```|<script|<\/?[a-z][\s\S]*>/i.test(answer)) return false;

  // No external URLs (only clinic local paths or tel:)
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = answer.match(urlRegex) || [];
  for (const u of urls) {
    if (!u.includes('localhost') && !u.includes('nanoclinic.vn')) return false;
  }

  // No drug dosage patterns
  const dosageRegex = /\b(\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg|g|vien|viên|goi|gói|giot|giọt|mg\/kg))\b/i;
  if (dosageRegex.test(answer)) return false;

  // No affirmative diagnosis
  const affirmativeDiagRegex = /\b(bạn bị|chắc chắn là|chắc chắn bạn bị|bạn đang mắc bệnh)\b/i;
  const normAnswer = removeVietnameseTones(answer);
  if (affirmativeDiagRegex.test(normAnswer)) return false;

  return true;
}

/**
 * Builds safe rejection response with quick replies from active specialties
 */
function buildRejectionResponse(activeSpecialties, customMsg) {
  const defaultMsg = 'Mình là Trợ lý Điều hướng của Nano Clinic, chỉ hỗ trợ phân luồng triệu chứng theo các chuyên khoa của phòng khám và thông tin đặt lịch hẹn.';
  const quickReplies = activeSpecialties.slice(0, 3).map((s) => ({
    label: `Khám ${s.name}`,
    specialtyId: s.id,
  }));

  return {
    urgency: 'info',
    intent: 'guardrail_rejection',
    specialtyId: null,
    confidence: 0,
    answer: customMsg || defaultMsg,
    quickReplies,
    suggestedSlots: [],
    actions: [],
  };
}

/**
 * Builds safe response when symptoms belong to a specialty NOT available at clinic
 */
function buildSpecialtyNotAvailableResponse(activeSpecialties) {
  const names = activeSpecialties.map((s) => s.name).join(', ');
  const generalSpecialty = activeSpecialties.find((s) =>
    removeVietnameseTones(s.name).includes('noi tong quat') || removeVietnameseTones(s.name).includes('noi')
  );

  let answer = `Phòng khám Nano Clinic hiện chỉ phục vụ các chuyên khoa: ${names}. Đối với triệu chứng hoặc thuốc bạn vừa hỏi, bạn nên tham khảo ý kiến bác sĩ hoặc dược sĩ chuyên khoa phù hợp để thăm khám và tư vấn trực tiếp.\n\n*Thông tin tư vấn mang tính chất tham khảo, không thay thế việc khám chữa bệnh trực tiếp với bác sĩ.*`;
  if (generalSpecialty) {
    answer += `\n\nNếu bạn muốn đánh giá sức khỏe ban đầu, bạn có thể đặt lịch khám tại chuyên khoa **${generalSpecialty.name}** của phòng khám.`;
  }

  return {
    urgency: 'routine',
    intent: 'specialty_not_available',
    specialtyId: generalSpecialty ? generalSpecialty.id : null,
    confidence: 0.9,
    answer,
    suggestedSlots: [],
    actions: generalSpecialty
      ? [{ type: 'BOOK_SPECIALTY', specialtyId: generalSpecialty.id, label: `Đặt ${generalSpecialty.name}` }]
      : [],
  };
}

/**
 * Rule-based fallback triage built dynamically from database triageHints
 */
function ruleBasedDynamicFallback(normText, activeSpecialties) {
  const unaccented = removeVietnameseTones(normText);

  // Check against active specialties triageHints
  for (const s of activeSpecialties) {
    const hints = (s.triageHints || []).map((h) => removeVietnameseTones(h).trim()).filter(Boolean);
    if (matchesWordBoundary(unaccented, hints)) {
      return {
        specialtyId: s.id,
        specialtyName: s.name,
      };
    }
  }

  // Common external specialties not offered
  const outOfClinicSpecialties = [
    'nhi', 'em be', 'tre em', 'be sot', 'so sinh',
    'san phu khoa', 'mang thai', 'sinh con', 'sieu am thai',
    'ung buou', 'ung thu', 'hoa tri', 'xa tri',
  ];
  if (matchesWordBoundary(unaccented, outOfClinicSpecialties)) {
    return { isUnavailable: true };
  }

  return null;
}

/**
 * Master Chatbot Pipeline:
 * 1. Text normalization & Length limit (500 chars)
 * 2. Hard emergency rule
 * 3. Escalation check & Negative Cache
 * 4. Ops questions (hours, address, pricing, doctors)
 * 5. Gemini Structured Dynamic Triage
 * 6. Rule-based Dynamic Fallback
 * 7. Post-LLM safety checks & disclaimer
 *
 * @param {object} params
 * @param {string} params.message
 * @param {Array<{role: string, text: string}>} [params.history=[]]
 * @param {string} [params.sessionId='']
 * @returns {Promise<object>}
 */
async function processChatMessage({ message, history = [], sessionId = '' }) {
  const rawInput = String(message || '').trim().slice(0, 500);
  if (!rawInput) {
    return {
      urgency: 'info',
      intent: 'empty_query',
      answer: 'Xin chào! Tôi là Trợ lý Điều hướng của Nano Clinic. Tôi có thể hỗ trợ điều hướng chuyên khoa hoặc thông tin đặt lịch hẹn cho bạn.',
      suggestedSlots: [],
      actions: [],
    };
  }

  // Step 1: Normalization & Negative Cache Check
  const normText = normalizeText(rawInput);
  const textHash = hashNormalizedText(normText);
  const activeSpecialties = await getCachedSpecialties();

  const cachedNeg = negativeCache.get(textHash);
  if (cachedNeg && Date.now() - cachedNeg < NEGATIVE_CACHE_TTL) {
    return buildRejectionResponse(activeSpecialties, 'Câu hỏi của bạn nằm ngoài phạm vi tư vấn của phòng khám.');
  }

  // Step 2: Layer 1 Injection Heuristic
  if (detectInjectionSignals(rawInput)) {
    recordEscalation(sessionId);
    negativeCache.set(textHash, Date.now());
    return buildRejectionResponse(activeSpecialties, 'Yêu cầu không thuộc phạm vi điều hướng y tế của phòng khám.');
  }

  // Step 3: Hard Emergency check (Runs BEFORE LLM)
  if (checkEmergencyTrigger(rawInput)) {
    return getEmergencyResponse();
  }

  // Step 4: Escalation rate limit check (>= 3 out of scope in 10 mins)
  if (isEscalated(sessionId)) {
    return buildRejectionResponse(
      activeSpecialties,
      'Bạn đã gửi nhiều câu hỏi ngoài phạm vi hỗ trợ. Vui lòng liên hệ trực tiếp hotline 1900 6868 nếu cần hỗ trợ khẩn cấp.',
    );
  }

  // Step 5: Clinic Operations from DB
  const opsAnswer = await answerClinicOperations(rawInput);
  if (opsAnswer) {
    return opsAnswer;
  }

  // Step 6: Gemini AI Dynamic Triage
  const redacted = redactPII(rawInput);
  let llmResult = null;
  try {
    llmResult = await callGeminiDynamicTriage(redacted, history);
  } catch (err) {
    logger.warn({ err: err.message }, '[chatbot] Gemini dynamic triage exception');
  }

  let finalResponse = null;

  if (llmResult) {
    const minConfidence = configService.chatMinConfidence || 0.55;

    // Handle out-of-scope or unsafe
    if (llmResult.intent === 'out_of_scope' || llmResult.intent === 'unsafe_request') {
      recordEscalation(sessionId);
      negativeCache.set(textHash, Date.now());
      return buildRejectionResponse(activeSpecialties);
    }

    // Handle specialty not available
    if (llmResult.intent === 'specialty_not_available') {
      return buildSpecialtyNotAvailableResponse(activeSpecialties);
    }

    // Handle symptom triage
    if (llmResult.intent === 'symptom_triage') {
      // Check confidence threshold
      if ((llmResult.confidence || 0) < minConfidence && !llmResult.specialtyId) {
        return buildRejectionResponse(activeSpecialties, 'Triệu chứng chưa rõ ràng để định vị chuyên khoa. Bạn có thể chọn một trong các chuyên khoa bên dưới hoặc đến khám Nội tổng quát.');
      }

      // Check emergency
      if (llmResult.urgency === 'emergency') {
        return getEmergencyResponse();
      }

      // Post-validation of LLM answer text
      const isValid = validateAnswerContent(llmResult.answer, activeSpecialties);
      let safeAnswer = llmResult.answer;

      if (!isValid) {
        // Replace with server-written template
        const spec = activeSpecialties.find((s) => s.id === llmResult.specialtyId);
        safeAnswer = spec
          ? `Dựa trên triệu chứng bạn mô tả, chuyên khoa phù hợp để thăm khám là **${spec.name}**.\n\nVui lòng tham khảo ý kiến bác sĩ hoặc dược sĩ chuyên khoa trước khi sử dụng bất kỳ loại thuốc nào.`
          : 'Dựa trên triệu chứng bạn mô tả, bạn nên đặt lịch khám để được bác sĩ chuyên khoa kiểm tra trực tiếp và tư vấn phác đồ điều trị an toàn.';
      }

      const suggestedSlots = llmResult.specialtyId
        ? await getSuggestedSlotsForSpecialty(llmResult.specialtyId, 3)
        : [];

      finalResponse = {
        urgency: llmResult.urgency || 'routine',
        intent: 'symptom_triage',
        specialtyId: llmResult.specialtyId,
        confidence: llmResult.confidence,
        answer: safeAnswer,
        redFlags: llmResult.redFlags || [],
        needsMoreInfo: Boolean(llmResult.needsMoreInfo),
        followUpQuestion: llmResult.followUpQuestion || null,
        suggestedSlots,
        actions: suggestedSlots.length > 0 ? [{ type: 'BOOK_SLOT', label: 'Đặt lịch hẹn' }] : [],
      };
    } else {
      // Smalltalk / info / booking_help
      finalResponse = {
        urgency: llmResult.urgency || 'info',
        intent: llmResult.intent,
        specialtyId: llmResult.specialtyId,
        confidence: llmResult.confidence,
        answer: llmResult.answer || 'Tôi có thể hỗ trợ điều hướng chuyên khoa và đặt lịch khám cho bạn.',
        suggestedSlots: [],
        actions: [],
      };
    }
  }

  // Step 7: Fallback rule-based if Gemini was null or failed
  if (!finalResponse) {
    const fallbackMatch = ruleBasedDynamicFallback(normText, activeSpecialties);

    if (fallbackMatch?.isUnavailable) {
      return buildSpecialtyNotAvailableResponse(activeSpecialties);
    }

    if (fallbackMatch?.specialtyId) {
      const suggestedSlots = await getSuggestedSlotsForSpecialty(fallbackMatch.specialtyId, 3);
      finalResponse = {
        urgency: 'routine',
        intent: 'symptom_triage',
        specialtyId: fallbackMatch.specialtyId,
        confidence: 0.75,
        answer: `Dựa trên triệu chứng bạn chia sẻ, bạn nên đặt lịch khám tại chuyên khoa **${fallbackMatch.specialtyName}** để được bác sĩ kiểm tra và tư vấn kỹ càng.`,
        suggestedSlots,
        actions: suggestedSlots.length > 0 ? [{ type: 'BOOK_SLOT', label: 'Đặt lịch hẹn' }] : [],
      };
    } else {
      // General Inquiry Fallback
      finalResponse = {
        urgency: 'routine',
        intent: 'general_inquiry',
        specialtyId: null,
        confidence: 0.5,
        suggestedSlots: [],
        actions: [{ type: 'NAVIGATE', label: 'Xem danh sách chuyên khoa', value: '/specialties' }],
        answer: 'Cảm ơn bạn đã liên hệ. Để có đánh giá chuẩn xác nhất, bạn vui lòng cung cấp thêm thông tin triệu chứng hoặc đặt lịch khám để được bác sĩ tư vấn trực tiếp.',
      };
    }
  }

  // Ensure mandatory medical disclaimer
  if (finalResponse.answer && !finalResponse.answer.includes('không thay thế')) {
    finalResponse.answer += '\n\n*Thông tin mang tính tham khảo, không thay thế chẩn đoán bác sĩ.*';
  }

  return finalResponse;
}

module.exports = {
  processChatMessage,
  validateAnswerContent,
  ruleBasedDynamicFallback,
  buildSpecialtyNotAvailableResponse,
  buildRejectionResponse,
  normalizeText,
};
