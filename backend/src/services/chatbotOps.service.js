const { Specialty, User, Voucher } = require('../models');
const { configService } = require('../config/config.service');
const { matchesWordBoundary } = require('../utils/chatText');

/**
 * Handle operational questions about clinic location, hours, pricing, booking procedure, vouchers, and specialties.
 * Fetches dynamic data from MongoDB and environment configurations.
 *
 * @param {string} text - User message
 * @returns {Promise<object|null>} Response object or null if not an operations query
 */
async function answerClinicOperations(text) {
  if (!text) return null;

  // 1. Giờ làm việc / Giờ mở cửa
  if (matchesWordBoundary(text, ['gio lam viec', 'gio mo cua', 'mo cua luc may gio', 'may gio dong cua', 'kham chu nhat khong', 'lich lam viec phong kham'])) {
    return {
      urgency: 'info',
      intent: 'clinic_hours',
      specialtyId: null,
      suggestedSlots: [],
      actions: [{ type: 'NAVIGATE', label: 'Xem lịch khám', value: '/doctors' }],
      answer: `🕒 **Thời gian làm việc của ${configService.clinicName}:**\n\n- ${configService.clinicOpenHours}\n\nQuý khách có thể đặt hẹn trước qua website để được phục vụ chu đáo nhất và không phải chờ đợi.`
    };
  }

  // 2. Địa chỉ / Vị trí / Đường đi
  if (matchesWordBoundary(text, ['dia chi', 'o dau', 'cho nao', 'vi tri phong kham', 'dia diem', 'duong di'])) {
    return {
      urgency: 'info',
      intent: 'clinic_address',
      specialtyId: null,
      suggestedSlots: [],
      actions: [
        { type: 'CALL', label: `Hotline: ${configService.clinicHotline}`, value: `tel:${configService.clinicHotline}` }
      ],
      answer: `📍 **Địa chỉ phòng khám:**\n\n**${configService.clinicName}**\n- Địa chỉ: ${configService.clinicAddress}\n- Hotline hỗ trợ: ${configService.clinicHotline}\n\nPhòng khám có khu vực đỗ xe máy và ô tô thuận tiện cho người bệnh và thân nhân.`
    };
  }

  // 3. Bảng giá khám / Chi phí khám bệnh
  if (matchesWordBoundary(text, ['bang gia', 'gia kham', 'chi phi kham', 'phi kham', 'kham ton bao nhieu', 'gia tien'])) {
    // Lấy thông tin phí khám từ danh sách bác sĩ trong hệ thống
    const doctors = await User.find({ role: 'Doctor', isEnable: true, isDeleted: false })
      .select('consultationFee')
      .lean();

    const fees = doctors.map((d) => d.consultationFee).filter((f) => typeof f === 'number' && f > 0);
    const minFee = fees.length ? Math.min(...fees) : 150000;
    const maxFee = fees.length ? Math.max(...fees) : 500000;

    const formattedMin = minFee.toLocaleString('vi-VN');
    const formattedMax = maxFee.toLocaleString('vi-VN');

    return {
      urgency: 'info',
      intent: 'clinic_pricing',
      specialtyId: null,
      suggestedSlots: [],
      actions: [{ type: 'NAVIGATE', label: 'Xem danh sách bác sĩ & giá', value: '/doctors' }],
      answer: `💰 **Chi phí khám bệnh tại ${configService.clinicName}:**\n\n- Giá khám chuyên khoa dao động từ **${formattedMin} VNĐ** đến **${formattedMax} VNĐ** (tùy theo học vị bác sĩ và hình thức khám trực tiếp hoặc trực tuyến).\n- Chi phí các dịch vụ xét nghiệm, chẩn đoán hình ảnh sẽ được bác sĩ tư vấn cụ thể theo chỉ định y khoa.\n\n*Thông tin mang tính tham khảo. Quý khách có thể xem giá chi tiết từng bác sĩ khi chọn lịch khám.*`
    };
  }

  // 4. Mã giảm giá / Voucher ưu đãi
  if (matchesWordBoundary(text, ['voucher', 'ma giam gia', 'khuyen mai', 'uu dai', 'co giam gia khong'])) {
    const now = new Date();
    const activeVouchers = await Voucher.find({
      enable: true,
      $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }]
    })
      .select('code name discountValue discountType expiryDate')
      .limit(5)
      .lean();

    let voucherText = 'Hiện tại phòng khám chưa có mã giảm giá công khai mới.';
    if (activeVouchers.length > 0) {
      const list = activeVouchers.map((v) => {
        const valStr = v.discountType === 'PERCENT' ? `${v.discountValue}%` : `${(v.discountValue || 0).toLocaleString('vi-VN')} VNĐ`;
        const expStr = v.expiryDate ? ` (Hạn dùng: ${new Date(v.expiryDate).toLocaleDateString('vi-VN')})` : '';
        return `- **${v.code}**: ${v.name || 'Ưu đãi khám bệnh'} (Giảm ${valStr})${expStr}`;
      }).join('\n');
      voucherText = `Các mã ưu đãi đang áp dụng tại phòng khám:\n\n${list}\n\n*Nhập mã tại bước thanh toán khi đặt lịch hẹn.*`;
    }

    return {
      urgency: 'info',
      intent: 'clinic_voucher',
      specialtyId: null,
      suggestedSlots: [],
      actions: [{ type: 'NAVIGATE', label: 'Đặt lịch ngay', value: '/booking' }],
      answer: `🎁 **Thông tin ưu đãi:**\n\n${voucherText}`
    };
  }

  // 5. Danh sách chuyên khoa
  if (matchesWordBoundary(text, ['chuyen khoa', 'cac khoa', 'kham nhung khoa nao', 'co nhung chuyen khoa gi'])) {
    const specialties = await Specialty.find({ isEnable: true }).select('id name description').lean();
    let specList = 'Nội tổng quát, Ngoại khoa, Nhi khoa, Sản phụ khoa, Tai mũi họng, Răng hàm mặt, Da liễu, Mắt...';
    if (specialties.length > 0) {
      specList = specialties.map((s) => `- **${s.name}**: ${s.description || 'Khám và điều trị chuyên sâu'}`).join('\n');
    }

    return {
      urgency: 'info',
      intent: 'clinic_specialties',
      specialtyId: null,
      suggestedSlots: [],
      actions: [{ type: 'NAVIGATE', label: 'Xem chi tiết chuyên khoa', value: '/specialties' }],
      answer: `🏥 **Các chuyên khoa tại ${configService.clinicName}:**\n\n${specList}\n\nBạn có thể nhấn vào để xem thông tin bác sĩ phụ trách từng khoa.`
    };
  }

  // 6. Quy trình đặt lịch và thanh toán
  if (matchesWordBoundary(text, ['quy trinh dat lich', 'huong dan dat lich', 'cach dat lich', 'thanh toan nhu the nao', 'hinh thuc thanh toan'])) {
    return {
      urgency: 'info',
      intent: 'clinic_booking_guide',
      specialtyId: null,
      suggestedSlots: [],
      actions: [{ type: 'NAVIGATE', label: 'Bắt đầu đặt lịch', value: '/booking' }],
      answer: `📋 **Quy trình đặt lịch & thanh toán:**\n\n1. **Chọn chuyên khoa & bác sĩ**: Tìm kiếm theo triệu chứng hoặc bác sĩ mong muốn.\n2. **Chọn ngày & khung giờ**: Chọn slot khám còn trống phù hợp với thời gian của bạn.\n3. **Điền thông tin bệnh nhân**: Họ tên, ngày sinh, lý do khám và áp dụng mã giảm giá (nếu có).\n4. **Thanh toán linh hoạt**: Hỗ trợ thanh toán online qua cổng VNPay (QR Pay, thẻ ngân hàng, ví điện tử) hoặc thanh toán tại quầy lễ tân khi đến khám.`
    };
  }

  return null;
}

module.exports = {
  answerClinicOperations,
};
