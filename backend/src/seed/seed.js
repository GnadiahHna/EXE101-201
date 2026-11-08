const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../config/db');
const { User, Specialty, RssSource, News, Voucher, Event, syncSequenceFloor } = require('../models');
const { ROLES, GENDERS, AUTH_PROVIDERS, RSS_SOURCE_STATUSES, VOUCHER_TYPES } = require('../constants/enums');

const DEFAULT_DEV_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || '123456';

const SEED_SPECIALTIES = [
  {
    id: 1,
    name: 'Nội tổng quát',
    description:
      'Thăm khám và đánh giá sức khỏe toàn diện, hỗ trợ nhận biết các vấn đề thường gặp như mệt mỏi, sốt, đau đầu hoặc rối loạn tiêu hóa. Bác sĩ tư vấn chăm sóc sức khỏe, theo dõi bệnh lý và định hướng khám chuyên khoa phù hợp khi cần thiết.',
  },
  {
    id: 2,
    name: 'Cơ Xương Khớp',
    description:
      'Thăm khám các vấn đề liên quan đến cơ, xương, khớp và cột sống như đau lưng, đau vai gáy, đau khớp hoặc hạn chế vận động. Bác sĩ đánh giá tình trạng, tư vấn hướng điều trị và chế độ vận động phù hợp với từng người bệnh.',
  },
  {
    id: 3,
    name: 'Răng Hàm Mặt',
    description:
      'Thăm khám các vấn đề về răng, nướu và vùng hàm mặt như sâu răng, viêm nướu, ê buốt hoặc đau nhức răng. Bác sĩ tư vấn hướng xử lý phù hợp và hướng dẫn vệ sinh, chăm sóc răng miệng để duy trì sức khỏe lâu dài.',
  },
  {
    id: 4,
    name: 'Mắt',
    description:
      'Kiểm tra thị lực và thăm khám các vấn đề như nhìn mờ, khô mắt, mỏi mắt hoặc khó chịu ở mắt. Bác sĩ đánh giá tình trạng, tư vấn hướng xử lý và cách chăm sóc đôi mắt phù hợp với độ tuổi, công việc và thói quen sinh hoạt.',
  },
  {
    id: 5,
    name: 'Tim mạch',
    description:
      'Thăm khám và theo dõi sức khỏe tim mạch, đánh giá các vấn đề liên quan đến huyết áp, nhịp tim và tuần hoàn. Bác sĩ tư vấn kiểm soát các yếu tố nguy cơ, duy trì lối sống phù hợp và xây dựng kế hoạch theo dõi theo tình trạng sức khỏe của từng người.',
  },
];

// Clean seed users migrated from Dump20261029.sql (preserving exact IDs & Doctor profiles)
const SEED_USERS = [
  // Admins
  {
    id: 2,
    email: 'admin@clinicbooking.com',
    fullName: 'Admin System',
    gender: GENDERS.OTHER,
    phoneNumber: '0988888888',
    userType: ROLES.ADMIN,
  },
  {
    id: 3,
    email: 'testadmin@clinicbooking.com',
    fullName: 'Test Admin',
    gender: GENDERS.OTHER,
    phoneNumber: '0912345678',
    userType: ROLES.ADMIN,
  },

  // Receptionist
  {
    id: 120012,
    email: 'receptionist1@gmail.com',
    fullName: 'Võ Mai Phương',
    gender: GENDERS.FEMALE,
    phoneNumber: '0901234567',
    userType: ROLES.RECEPTIONIST,
  },

  // 10 Doctors from Dump20261029.sql
  {
    id: 120002,
    email: 'bacsi.demo01@example.com',
    fullName: 'Tôn Thất Việt Hùng',
    gender: GENDERS.MALE,
    phoneNumber: '0900000001',
    userType: ROLES.DOCTOR,
    specialtyId: 1,
    degree: 'BS CKII',
    description:
      'Bác sĩ có kinh nghiệm khám và điều trị bệnh nội khoa, tim mạch và hồi sức cấp cứu.',
    experience:
      '26 năm tại Bệnh Viện Thiện Nhân; từng làm việc trong hồi sức cấp cứu, nội tim mạch và giữ chức Trưởng khoa Nội tổng hợp tại Hoàn Mỹ Đà Nẵng',
  },
  {
    id: 120003,
    email: 'bacsi.demo02@example.com',
    fullName: 'Lâm Trọng Cơ',
    gender: GENDERS.MALE,
    phoneNumber: '0900000002',
    userType: ROLES.DOCTOR,
    specialtyId: 5,
    degree: 'Bác sĩ chuyên khoa II Nội tim mạch, Thạc sĩ; đào tạo tại Đại học Y Dược Huế.',
    description:
      'Bác sĩ chuyên khám nội khoa và bệnh lý tim mạch, có kinh nghiệm trong cấp cứu và hồi sức tích cực.',
    experience: 'Hơn 22 năm.',
  },
  {
    id: 120009,
    email: 'bacsi.demo03@example.com',
    fullName: 'Hà Nguyễn Minh Quang',
    gender: GENDERS.MALE,
    phoneNumber: '0900000003',
    userType: ROLES.DOCTOR,
    specialtyId: 2,
    degree: 'Bác sĩ chuyên khoa II; Thạc sĩ Phẫu thuật.',
    description:
      'Bác sĩ Ngoại chấn thương chỉnh hình, có kinh nghiệm về thay khớp, nội soi khớp và phẫu thuật bàn tay.',
    experience: 'Hơn 15 năm tại Bệnh viện Hoàn Mỹ Đà Nẵng',
  },
  {
    id: 120004,
    email: 'bacsi.demo04@example.com',
    fullName: 'Đoàn Thành Nhân',
    gender: GENDERS.MALE,
    phoneNumber: '0900000004',
    userType: ROLES.DOCTOR,
    specialtyId: 2,
    degree: 'Tiến sĩ Y học Phục hồi chức năng; Thạc sĩ Vật lý trị liệu – Phục hồi chức năng.',
    description:
      'Bác sĩ chuyên phục hồi chức năng cho các vấn đề về cơ, xương, khớp và thần kinh.',
    experience: 'Hơn 8 năm Bệnh viện Vinmec Đà Nẵng',
  },
  {
    id: 120005,
    email: 'bacsi.demo05@example.com',
    fullName: 'Nguyễn Quang Hải',
    gender: GENDERS.MALE,
    phoneNumber: '0900000005',
    userType: ROLES.DOCTOR,
    specialtyId: 3,
    degree: 'Tiến sĩ chuyên ngành Phẫu thuật hàm mặt.',
    description:
      'Bác sĩ chuyên phẫu thuật hàm mặt, có kinh nghiệm khám chữa bệnh, đào tạo và nghiên cứu về implant, ghép xương và các bệnh lý hàm mặt.',
    experience: 'Hơn 20 năm tại Bệnh viện Răng – Hàm – Mặt thành phố Đà Nẵng',
  },
  {
    id: 120006,
    email: 'bacsi.demo06@example.com',
    fullName: 'Doãn Bá Bình',
    gender: GENDERS.MALE,
    phoneNumber: '0900000006',
    userType: ROLES.DOCTOR,
    specialtyId: 3,
    degree: 'Bác sĩ chuyên khoa II.',
    description: 'Bác sĩ Răng hàm mặt có kinh nghiệm lâu năm trong lĩnh vực nha khoa.',
    experience: '25 năm tại Nha khoa Doãn Bá Bình, Đà Nẵng',
  },
  {
    id: 120007,
    email: 'bacsi.demo07@example.com',
    fullName: 'Trần Văn Đà',
    gender: GENDERS.MALE,
    phoneNumber: '0900000007',
    userType: ROLES.DOCTOR,
    specialtyId: 4,
    degree: 'Bác sĩ chuyên khoa II; chứng nhận phẫu thuật viên Phaco.',
    description:
      'Bác sĩ chuyên khám và điều trị bệnh lý mắt, có kinh nghiệm phẫu thuật đục thủy tinh thể và điều trị bệnh lý dịch kính – võng mạc.',
    experience: '40 năm theo hồ sơ bệnh viện Mắt Việt An Đà Nẵng',
  },
  {
    id: 120008,
    email: 'bacsi.demo08@example.com',
    fullName: 'Nguyễn Thị Thu',
    gender: GENDERS.FEMALE,
    phoneNumber: '0900000008',
    userType: ROLES.DOCTOR,
    specialtyId: 4,
    degree: 'Thạc sĩ, Bác sĩ chuyên khoa II.',
    description:
      'Bác sĩ chuyên khám và điều trị các bệnh lý mắt, đặc biệt là bệnh lý kết mạc và giác mạc.',
    experience: '40 năm theo hồ sơ bệnh viện Mắt Việt An Đà Nẵng',
  },
  {
    id: 120010,
    email: 'bacsi.demo09@example.com',
    fullName: 'Huỳnh Thúc Bảo',
    gender: GENDERS.MALE,
    phoneNumber: '0900000009',
    userType: ROLES.DOCTOR,
    specialtyId: 5,
    degree: 'Bác sĩ chuyên khoa II Nội tim mạch; Thạc sĩ Tim mạch.',
    description:
      'Bác sĩ chuyên điều trị và can thiệp bệnh lý tim mạch, có kinh nghiệm về động mạch vành và đặt máy tạo nhịp.',
    experience: 'Hơn 15 năm tại Bệnh viện Hoàn Mỹ Đà Nẵng',
  },
  {
    id: 120011,
    email: 'bacsi.demo10@example.com',
    fullName: 'Lê Xuân Túy',
    gender: GENDERS.MALE,
    phoneNumber: '0900000010',
    userType: ROLES.DOCTOR,
    specialtyId: 5,
    degree: 'Bác sĩ chuyên khoa II Tim mạch.',
    description:
      'Bác sĩ chuyên khám và điều trị bệnh tim mạch, có kinh nghiệm về hồi sức cấp cứu, siêu âm tim và mạch máu.',
    experience: '25 năm tại Bệnh viện Đại học Y khoa Phan Châu Trinh',
  },

  // Clean Patients from Dump20261029.sql
  {
    id: 1,
    email: 'miraisan2512@gmail.com',
    fullName: 'Huy Quoc',
    gender: GENDERS.MALE,
    phoneNumber: '0396975611',
    userType: ROLES.PATIENT,
  },
  {
    id: 30001,
    email: 'dovudn2015@gmail.com',
    fullName: 'Đỗ Anh Vũ',
    gender: GENDERS.OTHER,
    phoneNumber: '0778622183',
    userType: ROLES.PATIENT,
  },
  {
    id: 60001,
    email: 'nhiht6767@gmail.com',
    fullName: 'Hoàng Thị Nhi',
    gender: GENDERS.FEMALE,
    phoneNumber: '0982765672',
    userType: ROLES.PATIENT,
  },
  {
    id: 240002,
    email: 'vyh23306@gmail.com',
    fullName: 'Phùng Thị Hoàng Vy',
    gender: GENDERS.FEMALE,
    phoneNumber: '0795176321',
    userType: ROLES.PATIENT,
  },
  {
    id: 240003,
    email: 'll5127754@gmail.com',
    fullName: 'Lê Nguyễn Trang Linh',
    gender: GENDERS.FEMALE,
    phoneNumber: '0982870950',
    userType: ROLES.PATIENT,
  },
];

const SEED_RSS_SOURCES = [
  {
    id: 1,
    name: 'VnExpress Sức Khỏe',
    url: 'https://vnexpress.net/rss/suc-khoe.rss',
    category: 'Sức khỏe tổng quát',
    status: RSS_SOURCE_STATUSES.ACTIVE,
  },
  {
    id: 2,
    name: 'Báo Sức Khỏe & Đời Sống',
    url: 'https://suckhoedoisong.vn/rss/y-te.rss',
    category: 'Y tế & Phòng bệnh',
    status: RSS_SOURCE_STATUSES.ACTIVE,
  },
];

const SEED_NEWS = [
  {
    sourceId: 1,
    title: '5 thói quen buổi sáng giúp bảo vệ hệ tim mạch bền vững',
    link: 'https://vnexpress.net/5-thoi-quen-buoi-sang-bao-ve-he-tim-mach-100001.html',
    summary:
      'Uống đủ nước ấm, vận động nhẹ nhàng 20 phút và kiểm soát lượng muối trong bữa sáng giúp ổn định huyết áp và giảm nguy cơ bệnh lý tim mạch.',
    pubDate: new Date('2026-10-28T07:30:00.000Z'),
  },
  {
    sourceId: 1,
    title: 'Dấu hiệu sớm cảnh báo thoái hóa khớp gối ở người làm việc văn phòng',
    link: 'https://vnexpress.net/dau-hieu-som-thoai-hoa-khop-goi-van-phong-100002.html',
    summary:
      'Ngồi lâu một tư thế khiến sụn khớp thiếu dịch nuôi dưỡng. Các bác sĩ Cơ Xương Khớp khuyến nghị đứng dậy vận động sau mỗi 45-60 phút làm việc.',
    pubDate: new Date('2026-10-29T08:15:00.000Z'),
  },
  {
    sourceId: 2,
    title: 'Lịch khám sức khỏe định kỳ khuyến nghị cho từng nhóm tuổi',
    link: 'https://suckhoedoisong.vn/lich-kham-suc-khoe-dinh-ky-theo-nhom-tuoi-100003.html',
    summary:
      'Tầm soát định kỳ 6-12 tháng một lần giúp phát hiện sớm rối loạn chuyển hóa, tăng huyết áp và các bệnh lý nội khoa tiềm ẩn trước khi xuất hiện biến chứng.',
    pubDate: new Date('2026-10-30T06:00:00.000Z'),
  },
];

async function runSeed() {
  await connectDB();

  try {
    console.log('Seeding specialties...');
    for (const sp of SEED_SPECIALTIES) {
      await Specialty.findOneAndUpdate(
        { id: sp.id },
        { $set: sp },
        { upsert: true, returnDocument: 'after' },
      );
    }
    const maxSpecialtyId = Math.max(...SEED_SPECIALTIES.map((s) => s.id));
    await syncSequenceFloor('specialties', maxSpecialtyId);

    console.log('Seeding users (Admin, Receptionist, Doctors, Patients)...');
    const passwordHash = await bcrypt.hash(DEFAULT_DEV_PASSWORD, 10);

    for (const u of SEED_USERS) {
      const existing = await User.findOne({ email: u.email.toLowerCase() });
      if (!existing) {
        await User.create({
          ...u,
          email: u.email.toLowerCase(),
          password: passwordHash,
          isEnable: true,
          authProvider: AUTH_PROVIDERS.LOCAL,
        });
      }
    }

    const maxUser = await User.findOne().sort({ id: -1 }).lean();
    await syncSequenceFloor('users', maxUser ? maxUser.id : 250000);

    console.log('Seeding RSS sources & sample health news...');
    for (const src of SEED_RSS_SOURCES) {
      await RssSource.findOneAndUpdate(
        { id: src.id },
        { $setOnInsert: src },
        { upsert: true, returnDocument: 'after' },
      );
    }
    const maxRssSource = await RssSource.findOne().sort({ id: -1 }).lean();
    await syncSequenceFloor('rss_sources', maxRssSource ? maxRssSource.id : 10);

    for (const article of SEED_NEWS) {
      const existingNews = await News.findOne({ link: article.link }).lean();
      if (!existingNews) {
        await News.create(article);
      }
    }
    const maxNews = await News.findOne().sort({ id: -1 }).lean();
    await syncSequenceFloor('news', maxNews ? maxNews.id : 10);

    console.log('Seeding active vouchers...');
    const futureExpiry1 = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const futureExpiry2 = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const seedVouchers = [
      {
        id: 1,
        code: 'WOMANDAY2026',
        name: 'Tri ân khách hàng - Giảm 20% phí khám',
        discountValue: 20,
        type: VOUCHER_TYPES.DISCOUNT,
        enable: true,
        expiryDate: futureExpiry1,
      },
      {
        id: 2,
        code: 'HEALTHCARE50K',
        name: 'Phiếu ưu đãi dịch vụ khám sức khỏe 50.000đ',
        discountValue: 50000,
        type: VOUCHER_TYPES.SERVICE_TICKET,
        enable: true,
        expiryDate: futureExpiry2,
      },
    ];
    for (const v of seedVouchers) {
      await Voucher.findOneAndUpdate(
        { code: v.code },
        { $set: v },
        { upsert: true, returnDocument: 'after' },
      );
    }
    const maxVoucher = await Voucher.findOne().sort({ id: -1 }).lean();
    await syncSequenceFloor('vouchers', maxVoucher ? maxVoucher.id : 10);

    console.log('Seeding upcoming events...');
    const eventStart1 = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    const eventEnd1 = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const eventStart2 = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    const eventEnd2 = new Date(Date.now() + 45 * 24 * 3600 * 1000);
    const seedEvents = [
      {
        id: 1,
        title: 'Tri ân khách hàng - Chăm sóc sức khỏe toàn diện',
        description:
          'Khi tham gia sự kiện tại phòng khám, khách hàng được tư vấn miễn phí và tặng ngay mã ưu đãi giảm 20% tất cả dịch vụ khám trực tiếp.',
        location: '123 Nguyễn Văn Linh, Hải Châu, TP. Đà Nẵng',
        startDate: eventStart1,
        endDate: eventEnd1,
        isEnabled: true,
        voucherId: 1,
      },
      {
        id: 2,
        title: 'Ngày hội Tầm soát Tim mạch & Cơ Xương Khớp 2026',
        description:
          'Chương trình khám sàng lọc cùng đội ngũ Bác sĩ Chuyên khoa II và nhận phiếu ưu đãi dịch vụ 50.000đ.',
        location: 'Hội trường tầng 2 - Phòng khám Đa khoa',
        startDate: eventStart2,
        endDate: eventEnd2,
        isEnabled: true,
        voucherId: 2,
      },
    ];
    for (const ev of seedEvents) {
      await Event.findOneAndUpdate(
        { id: ev.id },
        { $set: ev },
        { upsert: true, returnDocument: 'after' },
      );
    }
    const maxEvent = await Event.findOne().sort({ id: -1 }).lean();
    await syncSequenceFloor('events', maxEvent ? maxEvent.id : 10);

    console.log('Seed completed successfully!');
    console.log(`Default dev password for newly seeded accounts: ${DEFAULT_DEV_PASSWORD}`);
    console.log('Sample logins:');
    console.log(`  - Admin:        admin@clinicbooking.com / ${DEFAULT_DEV_PASSWORD}`);
    console.log(`  - Receptionist: receptionist1@gmail.com / ${DEFAULT_DEV_PASSWORD}`);
    console.log(`  - Doctor:       bacsi.demo01@example.com / ${DEFAULT_DEV_PASSWORD}`);
    console.log(`  - Patient:      miraisan2512@gmail.com / ${DEFAULT_DEV_PASSWORD}`);
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { runSeed, SEED_SPECIALTIES, SEED_USERS };
