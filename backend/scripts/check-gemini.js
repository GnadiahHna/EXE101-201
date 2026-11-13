/**
 * scripts/check-gemini.js
 *
 * Checks Gemini API key using header x-goog-api-key, lists models supporting
 * generateContent, and runs a test call without logging or exposing the key.
 */

const env = require('../src/config/env');

async function checkGemini() {
  const apiKey = env.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    console.error('❌ Lỗi: GEMINI_API_KEY chưa được thiết lập trong biến môi trường hoặc file .env');
    console.error('Vui lòng thêm GEMINI_API_KEY=<your-key> vào backend/.env rồi chạy lại.');
    process.exit(1);
  }

  console.log('🔍 Đang kiểm tra danh sách model Gemini khả dụng với Google Generative Language API...');

  try {
    const listRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey.trim(),
      },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error(`❌ Gọi API thất bại (HTTP ${listRes.status}):`, errText);
      process.exit(1);
    }

    const data = await listRes.json();
    const allModels = data.models || [];
    const contentModels = allModels.filter((m) =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent')
    );

    console.log(`\n✅ Tìm thấy ${contentModels.length} model hỗ trợ generateContent:`);
    const modelNames = contentModels.map((m) => m.name.replace('models/', ''));
    for (const name of modelNames) {
      console.log(`  - ${name}`);
    }

    // Chọn model ưu tiên còn khả dụng thực tế để thử nghiệm generateContent
    const preferredCandidates = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
    ];

    const testModel = preferredCandidates.find((c) => modelNames.includes(c)) || modelNames[0];

    if (!testModel) {
      console.warn('⚠️ Không tìm thấy model nào để thử nghiệm.');
      process.exit(0);
    }

    console.log(`\n🧪 Đang chạy thử nghiệm gọi generateContent lần lượt qua danh sách ưu tiên...`);
    let testSuccess = false;
    for (const testModel of preferredCandidates) {
      if (!modelNames.includes(testModel)) continue;
      process.stdout.write(`  - Thử nghiệm model [${testModel}]... `);
      const testRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey.trim(),
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Trả lời đúng 1 từ duy nhất: READY' }],
              },
            ],
          }),
        }
      );

      if (testRes.ok) {
        const testJson = await testRes.json();
        const replyText = testJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        console.log(`✅ Thành công! Phản hồi: "${replyText}"`);
        testSuccess = true;
        break;
      } else {
        const status = testRes.status;
        console.log(`⚠️ Thất bại (HTTP ${status})`);
      }
    }

    if (!testSuccess) {
      console.warn('⚠️ Không có model nào trong danh sách ưu tiên phản hồi HTTP 200.');
    }

    console.log(`💡 Danh sách GEMINI_MODELS đề xuất: ${preferredCandidates.filter((c) => modelNames.includes(c)).join(',')}`);
  } catch (err) {
    console.error('❌ Lỗi kết nối mạng khi gọi Gemini API:', err.message);
    console.log('Nếu đang chạy trong sandbox không có mạng internet ra ngoài, bạn vui lòng chạy script này trực tiếp trên máy chủ / terminal cá nhân: node backend/scripts/check-gemini.js');
  }
}

checkGemini();
