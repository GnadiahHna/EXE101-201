const { matchesWordBoundary } = require('./chatText');

/**
 * Hard emergency red-flag triggers that bypass any LLM processing.
 * Medical emergency conditions strictly require calling 115 or going to the nearest ER.
 */
const EMERGENCY_PATTERNS = [
  // Đau ngực dữ dội / nhồi máu cơ tim
  'dau nguc du doi',
  'dau nguc',
  'tuc nguc du doi',
  'that nguc',
  'dau tim',
  'nhoi mau co tim',
  'ep tim',

  // Khó thở cấp
  'kho tho',
  'khong tho duoc',
  'ngat tho',
  'tho gap',
  'suy ho hap',

  // Ngất, hôn mê, co giật
  'ngat xiu',
  'bat tinh',
  'hon me',
  'co giat',
  'dong kinh',
  'mất ý thức',
  'mat y thuc',

  // Đột quỵ / Tai biến (yếu liệt, méo miệng, nói khó)
  'meo mieng',
  'yeu liet',
  'liet nua nguoi',
  'noi kho dot ngot',
  'noi nho',
  'dot quy',
  'tai bien',

  // Xuất huyết nghiêm trọng
  'chay mau khong cam',
  'chay mau o at',
  'non ra mau',
  'ho ra mau',
  'di ngoai ra mau tuoi nhieu',

  // Trẻ sơ sinh nguy kịch
  'tre so sinh sot cao',
  'be so sinh',
  'so sinh',
  'li bi',
  'so sinh bo bu',
  'tre co giat',
  'be co giat',

  // Ngộ độc, sốc phản vệ, tự hại
  'uong thuoc doc',
  'ngo doc thuoc',
  'soc phan ve',
  'tu tu',
  'tu hai',
  'muon chet',
  'cat co tay',
];

/**
 * Check if the input message indicates an emergency red-flag condition.
 * @param {string} text
 * @returns {boolean}
 */
function checkEmergencyTrigger(text) {
  if (!text || typeof text !== 'string') return false;
  return matchesWordBoundary(text, EMERGENCY_PATTERNS);
}

/**
 * Generate standard Emergency response payload.
 * @returns {object}
 */
function getEmergencyResponse() {
  return {
    urgency: 'emergency',
    intent: 'emergency_triage',
    specialtyId: null,
    suggestedSlots: [],
    actions: [
      { type: 'CALL_EMERGENCY', label: 'Gọi 115 ngay', value: 'tel:115' },
      { type: 'FIND_ER', label: 'Cấp cứu gần nhất', value: 'https://maps.google.com/?q=emergency+hospital' }
    ],
    answer: `⚠️ **CẢNH BÁO Y TẾ KHẨN CẤP**

Các triệu chứng bạn mô tả có dấu hiệu nguy kịch, đe dọa tính mạng!

🚨 **Vui lòng HÀNH ĐỘNG NGAY LẬP TỨC:**
1. **Gọi cấp cứu 115** hoặc nhờ người thân đưa ngay đến khoa Cấp cứu của bệnh viện gần nhất.
2. Không tự ý lái xe, giữ tư thế thoải mái và gọi người xung quanh hỗ trợ.
3. Không tự ý uống bất kỳ loại thuốc nào khi chưa có chỉ định của bác sĩ cấp cứu.

*Phòng khám không tiếp nhận cấp cứu đe dọa tính mạng tại chỗ. Tính mạng của bạn là ưu tiên hàng đầu!*`
  };
}

module.exports = {
  checkEmergencyTrigger,
  getEmergencyResponse,
};
