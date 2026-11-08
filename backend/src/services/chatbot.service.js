const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { Specialty, User, Voucher } = require('../models');
const env = require('../config/env');

// Danh sách các từ khóa tục tĩu / thô tục cần chặn lập tức
const OBSCENE_KEYWORDS = [
  'đm', 'dcm', 'đcm', 'vcl', 'cl', 'vl', 'đmm', 'dmm', 'cặc', 'lồn', 'buồi',
  'chó đẻ', 'mẹ mày', 'bố mày', 'đĩ', 'đéo', 'đếch', 'đụt', 'fuck', 'bitch', 'asshole'
];

function isObsceneContent(text) {
  const lower = (text || '').toLowerCase();
  return OBSCENE_KEYWORDS.some((kw) => {
    const regex = new RegExp(`(^|\\s|[.,!?;])${kw}($|\\s|[.,!?;])`, 'i');
    return regex.test(lower);
  });
}

// Danh sách các chuyên khoa và bác sĩ phụ trách tương ứng tại Nano Clinic
const CLINIC_SPECIALTIES = {
  internal: {
    key: 'internal',
    name: 'Nội tổng quát',
    doctors: 'BS CKII Tôn Thất Việt Hùng, BS Trần Văn Đà',
    linkText: 'Đặt lịch khám Nội tổng quát tại Nano Clinic',
  },
  orthopedics: {
    key: 'orthopedics',
    name: 'Cơ Xương Khớp',
    doctors: 'BS Lâm Trọng Cơ, BS Nguyễn Thị Thu',
    linkText: 'Đặt lịch khám Cơ Xương Khớp tại Nano Clinic',
  },
  dental: {
    key: 'dental',
    name: 'Răng Hàm Mặt',
    doctors: 'BS Đoàn Thành Nhân, BS Hà Nguyễn Minh Quang',
    linkText: 'Đặt lịch khám Răng Hàm Mặt tại Nano Clinic',
  },
  ophthalmology: {
    key: 'ophthalmology',
    name: 'Mắt',
    doctors: 'BS Nguyễn Quang Hải, BS Huỳnh Thúc Bảo',
    linkText: 'Đặt lịch khám Mắt tại Nano Clinic',
  },
  cardiology: {
    key: 'cardiology',
    name: 'Tim mạch',
    doctors: 'BS Doãn Bá Bình, BS Lê Xuân Túy',
    linkText: 'Đặt lịch khám Tim mạch tại Nano Clinic',
  },
};

/**
 * Tự động nhận diện chuyên khoa phù hợp theo triệu chứng/bệnh lý
 */
function detectSpecialty(text) {
  const q = (text || '').toLowerCase();

  // 1. Răng Hàm Mặt
  if (
    q.includes('răng') || q.includes('nướu') || q.includes('lợi') ||
    q.includes('niềng') || q.includes('sâu răng') || q.includes('răng khôn') ||
    q.includes('nha') || q.includes('nhổ răng') || q.includes('trám răng') ||
    q.includes('chảy máu chân răng') || q.includes('tủy răng')
  ) {
    return CLINIC_SPECIALTIES.dental;
  }

  // 2. Cơ Xương Khớp
  if (
    q.includes('xương') || q.includes('khớp') || q.includes('lưng') ||
    q.includes('đau gối') || q.includes('vai gáy') || q.includes('cột sống') ||
    q.includes('thoái hóa') || q.includes('thoát vị') || q.includes('gút') ||
    q.includes('gout') || q.includes('tê bì') || q.includes('chân tay') ||
    q.includes('đĩa đệm') || q.includes('bong gân') || q.includes('căng cơ')
  ) {
    return CLINIC_SPECIALTIES.orthopedics;
  }

  // 3. Mắt
  if (
    q.includes('mắt') || q.includes('cận') || q.includes('mờ mắt') ||
    q.includes('nhìn mờ') || q.includes('kính') || q.includes('ngứa mắt') ||
    q.includes('đỏ mắt') || q.includes('viêm kết mạc') || q.includes('khô mắt') ||
    q.includes('cườm') || q.includes('chảy nước mắt') || q.includes('loạn thị') ||
    q.includes('viễn thị')
  ) {
    return CLINIC_SPECIALTIES.ophthalmology;
  }

  // 4. Tim mạch
  if (
    q.includes('tim') || q.includes('ngực') || q.includes('huyết áp') ||
    q.includes('cao huyết áp') || q.includes('tim đập') || q.includes('hồi hộp') ||
    q.includes('khó thở') || q.includes('đánh trống ngực') || q.includes('mạch') ||
    q.includes('suy tim') || q.includes('mạch vành')
  ) {
    return CLINIC_SPECIALTIES.cardiology;
  }

  // Mặc định: Chuyên khoa Nội tổng quát (sốt, cảm, ho, đau đầu, tiêu hóa, mệt mỏi...)
  return CLINIC_SPECIALTIES.internal;
}

/**
 * Tạo footer chuẩn Nano Clinic kèm bác sĩ phụ trách và link đặt lịch
 */
function buildSpecialtyFooter(specialty) {
  const spec = specialty || CLINIC_SPECIALTIES.internal;
  return `<br/><br/>🧑‍⚕️ <b>Chuyên khoa ${spec.name}:</b> ${spec.doctors}.<br/>👉 <a href="/appointment" style="color: #0e82fd; font-weight: 600;">${spec.linkText}</a>`;
}

// Thứ tự ưu tiên các model Gemini tốc độ cao và ổn định
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
];

/**
 * Gọi Google Gemini API với cơ chế đa model & phản hồi tự nhiên như Gemini trên web
 */
async function callGeminiApi(prompt) {
  const apiKey = env.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemInstruction = `Bạn là Nano Clinic AI - Trợ lý y tế thông minh, ân cần, giàu chuyên môn của Phòng khám Đa khoa Nano Clinic (hoạt động tự nhiên, sâu sắc và sinh động như Google Gemini trên web).

Nhiệm vụ của bạn:
1. Khi người dùng hỏi về bệnh lý, triệu chứng sức khỏe (ví dụ: bị sốt, đau răng, đau khớp, đau mắt, ho, cảm cúm, đau bụng, mệt mỏi...):
   - Trả lời một cách tự nhiên, ân cần, đồng cảm, giải thích rõ ràng và khoa học (KHÔNG trả lời rập khuôn, máy móc).
   - Đưa ra các bước hướng dẫn cụ thể chăm sóc tại nhà: chế độ nghỉ ngơi, dinh dưỡng, bù nước/điện giải.
   - Nhắc nhở cách dùng các thuốc giảm đau / hạ sốt không kê đơn (OTC) thông dụng (như Paracetamol) nếu có chỉ định, kèm lưu ý về liều lượng an toàn theo cân nặng/độ tuổi và khoảng cách giữa các lần uống.
   - Luôn chỉ ra rõ ràng các dấu hiệu cảnh báo nguy hiểm (red flags / dấu hiệu báo động) mà người bệnh bắt buộc phải đến bệnh viện hoặc phòng khám ngay lập tức.
2. ĐỊNH DẠNG ĐẦU RA:
   - Dùng các thẻ HTML đơn giản, rõ ràng: <p>, <ul>, <li>, <b>, <i>, <br/>.
   - TUYỆT ĐỐI KHÔNG dùng khối markdown \`\`\`html ... \`\`\`. Trả về chuỗi HTML trực tiếp.
   - KHÔNG cần tự tạo phần bác sĩ hay link đặt lịch ở cuối câu trả lời (hệ thống sẽ tự động ghép thẻ thông tin bác sĩ chuyên khoa và link đặt lịch của Nano Clinic vào sau).
3. QUY TẮC BẢO VỆ (GUARDRAILS):
   - Nếu câu hỏi KHÔNG liên quan đến y tế, sức khỏe, bệnh lý hoặc dịch vụ phòng khám (ví dụ: hỏi về thời tiết, công nghệ, lập trình, thể thao, chính trị, giải trí...):
     Hãy trả về chính xác chuỗi: [NON_MEDICAL]`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemInstruction}\n\nCâu hỏi của người bệnh: ${prompt}` },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.7,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000), // 8 giây cho mỗi model
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && typeof candidateText === 'string') {
          return candidateText.trim().replace(/^```html\s*/i, '').replace(/```$/i, '').trim();
        }
      }
    } catch (err) {
      // Thử model tiếp theo trong danh sách nếu model hiện tại gặp sự cố
      continue;
    }
  }

  return null;
}

/**
 * Trả lời các câu hỏi vận hành phòng khám (Quy trình, Bác sĩ, Giờ mở cửa, Giá, Voucher)
 */
async function answerClinicOperations(query) {
  const q = (query || '').toLowerCase().trim();

  // 1. Quy trình đặt lịch khám
  if (
    q.includes('đặt lịch') ||
    q.includes('đăng ký') ||
    q.includes('lịch khám') ||
    q.includes('quy trình') ||
    q.includes('làm thế nào') ||
    q.includes('đặt khám') ||
    q.includes('hướng dẫn')
  ) {
    return `<b>Quy trình đặt lịch khám nhanh tại Nano Clinic:</b><br/>
<ul>
  <li><b>Bước 1:</b> Truy cập mục <a href="/appointment" style="color: #0e82fd; font-weight: 600;">Đặt lịch khám</a> và lựa chọn Bác sĩ hoặc Chuyên khoa mong muốn.</li>
  <li><b>Bước 2:</b> Chọn ngày khám và khung giờ cụ thể (hệ thống hiển thị rõ ràng số người đã đặt trước và giờ dự kiến vào khám).</li>
  <li><b>Bước 3:</b> Điền thông tin người khám hoặc chọn hồ sơ bệnh nhân đã lưu.</li>
  <li><b>Bước 4:</b> Kiểm tra thông tin, quét mã VietQR chuyển khoản cọc <b>5.000 VNĐ</b> (BIDV) để giữ chỗ.</li>
</ul>
Sau khi thanh toán thành công, hệ thống lập tức xác nhận lịch hẹn và gửi email chi tiết cho bạn!<br/><br/>
👉 <a href="/appointment" style="color: #0e82fd; font-weight: 600; text-decoration: underline;">Bấm vào đây để bắt đầu đặt lịch khám ngay</a>!`;
  }

  // 2. Bác sĩ & Chuyên khoa phòng khám
  if (
    q.includes('danh sách bác sĩ') ||
    q.includes('bác sĩ nổi bật') ||
    q.includes('các bác sĩ') ||
    q.includes('đội ngũ bác sĩ')
  ) {
    let doctorsHtml = `<ul>
  <li><b>BS CKII Tôn Thất Việt Hùng</b> - Chuyên khoa Nội tổng quát (15 năm kinh nghiệm)</li>
  <li><b>BS Lâm Trọng Cơ</b> - Chuyên khoa Cơ Xương Khớp (12 năm kinh nghiệm)</li>
  <li><b>BS Đoàn Thành Nhân</b> - Chuyên khoa Răng Hàm Mặt (10 năm kinh nghiệm)</li>
  <li><b>BS Nguyễn Quang Hải</b> - Chuyên khoa Mắt (8 năm kinh nghiệm)</li>
  <li><b>BS Doãn Bá Bình</b> - Chuyên khoa Tim mạch (14 năm kinh nghiệm)</li>
</ul>`;

    try {
      const activeDoctors = await User.find({ userType: 'Doctor', isEnable: true })
        .select('fullName degree experience specialtyId')
        .limit(5)
        .lean();
      const specialties = await Specialty.find({}).select('id name').lean();
      const specMap = new Map(specialties.map((s) => [s.id, s.name]));

      if (activeDoctors.length > 0) {
        doctorsHtml = '<ul>' + activeDoctors.map((d) => {
          const specName = specMap.get(d.specialtyId) || 'Chuyên khoa';
          const deg = d.degree ? ` (${d.degree})` : '';
          return `<li><b>${d.fullName}</b>${deg} - Chuyên khoa ${specName}</li>`;
        }).join('') + '</ul>';
      }
    } catch {}

    return `<b>Đội ngũ bác sĩ chuyên khoa nổi bật tại Nano Clinic:</b><br/>
${doctorsHtml}
Tất cả các bác sĩ đều có nhiều năm kinh nghiệm tại các bệnh viện hàng đầu.<br/>
👉 <a href="/doctors" style="color: #0e82fd; font-weight: 600; text-decoration: underline;">Xem danh sách chi tiết các bác sĩ</a> để xem lịch trực và đặt khám.`;
  }

  // 3. Giờ làm việc & Địa chỉ phòng khám
  if (
    q.includes('giờ làm việc') ||
    q.includes('thời gian') ||
    q.includes('mở cửa') ||
    q.includes('địa chỉ') ||
    q.includes('ở đâu') ||
    q.includes('hotline')
  ) {
    return `<b>Thời gian làm việc & Liên hệ Nano Clinic:</b><br/>
Phòng khám phục vụ xuyên suốt từ <b>Thứ Hai đến Chủ Nhật</b> (kể cả ngày nghỉ & ngày lễ):<br/>
<ul>
  <li><b>Ca Sáng:</b> 08:00 - 12:00</li>
  <li><b>Ca Chiều:</b> 13:00 - 17:00</li>
  <li><b>Ca Tối:</b> 18:00 - 21:00</li>
</ul>
📍 <b>Địa chỉ:</b> Số 123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh<br/>
📞 <b>Tổng đài hỗ trợ 24/7:</b> <a href="tel:19001234" style="color: #0e82fd; font-weight: 600;">1900 1234</a><br/>
📧 <b>Email:</b> contact@clinicbooking.com`;
  }

  // 4. Ưu đãi & Voucher
  if (
    q.includes('voucher') ||
    q.includes('ưu đãi') ||
    q.includes('khuyến mãi') ||
    q.includes('mã giảm') ||
    q.includes('giảm giá')
  ) {
    return `<b>Chương trình ưu đãi & Voucher hiện có:</b><br/>
<ul>
  <li>🎟️ <b>Mã: WOMANDAY2026</b> - Tri ân khách hàng: Giảm <b>20% phí khám</b> (tối đa 40.000 VNĐ).</li>
  <li>🎁 Miễn phí khám định kỳ cho các thành viên tham gia sự kiện sức khỏe cộng đồng.</li>
</ul>
👉 Mã ưu đãi có thể được áp dụng trực tiếp tại <b>Bước 4 (Xác nhận đặt lịch)</b> để được trừ tiền ngay!`;
  }

  // 5. Chi phí & Hình thức thanh toán
  if (
    q.includes('thanh toán') ||
    q.includes('giá khám') ||
    q.includes('phí khám') ||
    q.includes('bảng giá') ||
    q.includes('bảo hiểm') ||
    q.includes('bhyt') ||
    q.includes('chuyển khoản')
  ) {
    return `<b>Chính sách chi phí & Hình thức thanh toán:</b><br/>
<ul>
  <li><b>Khám trực tiếp:</b> Phí khám cơ bản là <b>200.000 VNĐ/lượt</b>. Bạn chỉ cần đặt cọc trước <b>5.000 VNĐ</b> qua chuyển khoản VietQR BIDV để giữ lịch, phần còn lại thanh toán tại quầy khi đến khám.</li>
  <li><b>Khám online:</b> Thanh toán toàn bộ phí khám qua chuyển khoản để nhận liên kết phòng khám video trực tuyến.</li>
  <li><b>Bảo hiểm:</b> Phòng khám hỗ trợ xuất hóa đơn điện tử VAT và sổ khám bệnh đầy đủ để bạn thanh toán với các đơn vị bảo hiểm y tế tư nhân.</li>
</ul>`;
  }

  return null;
}

/**
 * Trả lời tự động dự phòng khi mạng ngoại tuyến
 */
function generateFallbackMedicalAnswer(question, specialty) {
  const q = (question || '').toLowerCase();

  let body = '';
  if (specialty.key === 'dental') {
    body = `<p>Đau răng thường do các nguyên nhân phổ biến như sâu răng lan vào tủy, viêm lợi/nha chu hoặc mọc răng khôn. Trong lúc chưa thể đến khám ngay, bạn có thể thực hiện các bước sau để giảm bớt cảm giác khó chịu:</p>
<ul>
  <li><b>Súc miệng nước muối ấm:</b> Dùng nước muối ấm súc miệng nhẹ nhàng để làm sạch vi khuẩn và dịu vết viêm.</li>
  <li><b>Chườm lạnh:</b> Đặt túi chườm lạnh bên ngoài má tại vị trí đau khoảng 15-20 phút để giảm sưng và làm dịu cơn đau.</li>
  <li><b>Giảm đau tạm thời:</b> Có thể sử dụng Paracetamol theo đúng liều lượng chỉ dẫn để giảm bớt cơn đau. Tránh nhai thức ăn cứng hoặc uống nước quá nóng/quá lạnh.</li>
  <li><b>⚠️ Dấu hiệu cần đi khám ngay:</b> Sưng to một bên má, sốt cao, há miệng khó khăn hoặc chảy mủ chân răng.</li>
</ul>`;
  } else if (specialty.key === 'orthopedics') {
    body = `<p>Đau nhức cơ xương khớp có thể xuất phát từ căng cơ quá mức, sai tư thế làm việc hoặc các bệnh lý thoái hóa khớp, thoát vị đĩa đệm. Bạn nên áp dụng các biện pháp sau:</p>
<ul>
  <li><b>Nghỉ ngơi hợp lý:</b> Hạn chế các cử động mạnh hoặc mang vác vật nặng gây áp lực lên vùng đau.</li>
  <li><b>Chườm ấm/chườm lạnh:</b> Nếu chấn thương mới trong 48 giờ đầu nên chườm lạnh; nếu đau mỏi mạn tính thì chườm ấm giúp giãn cơ.</li>
  <li><b>Tập vận động nhẹ nhàng:</b> Thực hiện các động tác kéo giãn cơ nhẹ nhàng, tránh ngồi một tư thế quá lâu.</li>
  <li><b>⚠️ Dấu hiệu cần đi khám ngay:</b> Khớp sưng đỏ, nóng rát, biến dạng khớp, mất khả năng vận động hoặc đau kèm sốt.</li>
</ul>`;
  } else if (specialty.key === 'ophthalmology') {
    body = `<p>Khi gặp vấn đề về mắt như nhìn mờ, khô mắt, cộm rát hoặc mỏi mắt do làm việc liên tục với màn hình điện tử, bạn cần lưu ý:</p>
<ul>
  <li><b>Cho mắt nghỉ ngơi:</b> Áp dụng quy tắc 20-20-20 (cứ 20 phút nhìn xa 20 feet/6 mét trong 20 giây).</li>
  <li><b>Bôi trơn mắt:</b> Nhỏ nước mắt nhân tạo không chứa chất bảo quản để cải thiện tình trạng khô rát.</li>
  <li><b>Vệ sinh an toàn:</b> Tuyệt đối không dùng tay dụi mắt, không tự ý mua các loại thuốc nhỏ mắt chứa corticoid.</li>
  <li><b>⚠️ Dấu hiệu cần đi khám ngay:</b> Mắt đỏ rực, đau nhức dữ dội bên trong hốc mắt, giảm thị lực đột ngột hoặc nhìn thấy quầng sáng/chớp sáng.</li>
</ul>`;
  } else if (specialty.key === 'cardiology') {
    body = `<p>Các biểu hiện liên quan đến tim mạch như cảm giác hồi hộp, đánh trống ngực, tăng huyết áp hoặc tức ngực cần được theo dõi vô cùng cẩn trọng:</p>
<ul>
  <li><b>Nghỉ ngơi yên tĩnh:</b> Ngồi hoặc nằm nghỉ ở tư thế nửa nằm nửa ngồi, hít thở sâu và đều đặn.</li>
  <li><b>Kiểm tra huyết áp:</b> Nếu có máy đo huyết áp tại nhà, hãy kiểm tra và ghi lại chỉ số.</li>
  <li><b>Tránh chất kích thích:</b> Không uống trà đặc, cà phê, rượu bia hoặc hút thuốc lá.</li>
  <li><b>⚠️ Dấu hiệu cấp cứu khẩn cấp:</b> Cơn đau thắt ngực dữ dội kéo dài trên 15 phút, đau lan ra vai trái, cánh tay hoặc quai hàm, vã mồ hôi lạnh, khó thở – vui lòng gọi cấp cứu 115 hoặc đến bệnh viện ngay lập tức!</li>
</ul>`;
  } else {
    // Nội tổng quát (sốt, cảm cúm, đau đầu, tiêu hóa...)
    body = `<p>Khi cơ thể xuất hiện các triệu chứng như sốt, mệt mỏi, đau đầu hoặc khó chịu, bạn nên thực hiện các biện pháp chăm sóc sức khỏe khoa học sau:</p>
<ul>
  <li><b>Nghỉ ngơi đầy đủ:</b> Nằm nghỉ ở phòng thoáng khí, tránh gió lùa và hạn chế vận động gắng sức.</li>
  <li><b>Bù nước & Điện giải:</b> Uống nhiều nước ấm, nước oresol (pha đúng tỉ lệ), nước cam tươi hoặc súp/cháo loãng để bù lượng nước mất.</li>
  <li><b>Hạ sốt/giảm đau:</b> Nếu sốt từ 38.5°C trở lên, có thể dùng Paracetamol liều 10-15 mg/kg mỗi lần, cách nhau 4-6 tiếng (không quá 4g/ngày). Mặc đồ thoáng mát và chườm khăn ấm ở nách, bẹn.</li>
  <li><b>⚠️ Dấu hiệu cần đi khám ngay:</b> Sốt cao liên tục không hạ trên 48 giờ, co giật, lơ mơ, khó thở hoặc nôn mửa liên tục không ăn uống được.</li>
</ul>`;
  }

  return body;
}

/**
 * Xử lý câu hỏi người dùng
 */
async function answerQuestion(questionText) {
  const cleanQuestion = String(questionText || '').trim();
  if (!cleanQuestion) {
    return `Chào bạn! Tôi là Nano Clinic AI. Tôi luôn sẵn sàng hỗ trợ bạn tư vấn sức khỏe, thông tin bác sĩ, chuyên khoa và đặt lịch khám nhé!`;
  }

  // 1. Chặn lập tức từ ngữ thô tục / tục tĩu
  if (isObsceneContent(cleanQuestion)) {
    return `<b>Thông báo:</b><br/>Tôi không thể phản hồi những câu hỏi chứa nội dung không phù hợp hoặc thô tục. Vui lòng giữ lịch sự để tôi có thể hỗ trợ bạn tốt nhất về mặt y tế.`;
  }

  // 2. Kiểm tra các câu hỏi về quy trình vận hành phòng khám
  const opsAnswer = await answerClinicOperations(cleanQuestion);
  if (opsAnswer) {
    return opsAnswer;
  }

  // 3. Từ chối câu hỏi không liên quan đến y tế hoặc phòng khám (phát hiện nhanh qua từ khóa)
  const nonMedicalKeywords = [
    'thời tiết', 'dự báo thời tiết', 'code', 'lập trình', 'javascript', 'python',
    'viết code', 'toán học', 'vật lý', 'hóa học', 'chính trị', 'bầu cử', 'chiến tranh',
    'bóng đá', 'ca sĩ', 'bài hát', 'diễn viên', 'phim', 'game', 'chơi game',
    'chứng khoán', 'tiền ảo', 'bitcoin', 'crypto', 'cá cược', 'xổ số', 'lô đề'
  ];
  const lowerQ = cleanQuestion.toLowerCase();
  if (nonMedicalKeywords.some((kw) => lowerQ.includes(kw))) {
    return `<b>Xin lỗi bạn, tôi là Nano Clinic AI - Trợ lý chuyên về y tế và sức khỏe.</b><br/>Tôi chỉ có thể hỗ trợ giải đáp các thắc mắc về sức khỏe, bệnh lý, triệu chứng và dịch vụ khám chữa bệnh của phòng khám.<br/><br/>Bạn có vấn đề sức khỏe nào đang cần được tư vấn không?`;
  }

  // 4. Nhận diện chuyên khoa phù hợp để gắn footer Nano Clinic
  const matchedSpecialty = detectSpecialty(cleanQuestion);
  const footerHtml = buildSpecialtyFooter(matchedSpecialty);

  // 5. Ưu tiên gọi Gemini AI để tư vấn tự nhiên, sinh động như Gemini Web
  const geminiResponse = await callGeminiApi(cleanQuestion);
  if (geminiResponse) {
    // Nếu Gemini xác định là câu hỏi ngoài lề y tế
    if (geminiResponse.includes('[NON_MEDICAL]')) {
      return `<b>Xin lỗi bạn, tôi là Nano Clinic AI - Trợ lý chuyên về y tế và sức khỏe.</b><br/>Tôi chỉ có thể hỗ trợ giải đáp các thắc mắc về sức khỏe, bệnh lý, triệu chứng và dịch vụ khám chữa bệnh của phòng khám.<br/><br/>Bạn có vấn đề sức khỏe nào đang cần được tư vấn không?`;
    }

    // Ghép câu trả lời phong phú của Gemini kèm thẻ bác sĩ & link đặt lịch chuẩn của Nano Clinic
    return `${geminiResponse}${footerHtml}`;
  }

  // 6. Dự phòng thông minh khi không có kết nối Gemini
  const fallbackAnswer = generateFallbackMedicalAnswer(cleanQuestion, matchedSpecialty);
  return `${fallbackAnswer}${footerHtml}`;
}

module.exports = {
  answerQuestion,
  detectSpecialty,
  buildSpecialtyFooter,
};
