/**
 * Text normalization and PII redaction utilities for Chatbot triage.
 */

/**
 * Remove Vietnamese accents and convert to lowercase for accent-insensitive matching.
 * @param {string} str
 * @returns {string}
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str.toLowerCase();
  res = res.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  res = res.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  res = res.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  res = res.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  res = res.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  res = res.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  res = res.replace(/đ/g, 'd');
  // Combine diacritics
  res = res.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return res;
}

/**
 * Word-boundary matching using regex on normalized text.
 * Ensures "sot" doesn't match inside "so tay" and matches whole words/phrases.
 * @param {string} text - Raw or normalized text
 * @param {string|string[]} patterns - Word(s) or phrase(s) to match
 * @returns {boolean}
 */
function matchesWordBoundary(text, patterns) {
  if (!text) return false;
  const normalized = removeVietnameseTones(text);
  const list = Array.isArray(patterns) ? patterns : [patterns];

  return list.some((pattern) => {
    const normPattern = removeVietnameseTones(pattern).trim();
    if (!normPattern) return false;
    // Word boundary in regex (\b works on ASCII word characters, which normPattern is after removeVietnameseTones)
    const escaped = normPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|[.,!?;:()\\/\\-])${escaped}(?:$|\\s|[.,!?;:()\\/\\-])`, 'i');
    return regex.test(normalized);
  });
}

/**
 * Redact sensitive PII before forwarding user messages to external LLMs.
 * Covers: Vietnamese phone numbers, emails, Citizen IDs (CCCD 12 digits, CMND 9 digits), and specific home addresses.
 *
 * @param {string} text
 * @returns {string}
 */
function redactPII(text) {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text;

  // 1. Email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]');

  // 2. Phone numbers (VN standard: 09x, 03x, 07x, 08x, 05x or +84...)
  sanitized = sanitized.replace(/(?:\+84|0)(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)\d{7}\b/g, '[PHONE]');
  // General fallback for 10-11 continuous digits
  sanitized = sanitized.replace(/\b\d{10,11}\b/g, '[PHONE]');

  // 3. CCCD (12 digits) & CMND (9 digits)
  sanitized = sanitized.replace(/\b\d{12}\b/g, '[CCCD]');
  sanitized = sanitized.replace(/\b\d{9}\b/g, '[CMND]');

  // 4. Street address patterns (e.g. số 123 đường..., ngõ 45...)
  sanitized = sanitized.replace(/(?:số|so|nhà số|dia chi|địa chỉ)\s*\d+[\w\s,/.-]{5,30}(?:đường|phố|ngõ|hẻm|phường|quận|tp|thành phố|tỉnh)/gi, '[ADDRESS]');

  return sanitized;
}

module.exports = {
  removeVietnameseTones,
  matchesWordBoundary,
  redactPII,
};
