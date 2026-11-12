# Backend Agent Development Guide — ClinicBooking (Node.js + Express 5 + MongoDB)

> **Mục đích tài liệu:** Đây là bản thiết kế kỹ thuật & quy tắc chuẩn (Master Prompt / Blueprint) dành cho AI Agent và lập trình viên khi xây dựng toàn bộ `backend/` cho dự án **ClinicBooking** (môn SDN302).
>
> **Tài liệu tham chiếu đi kèm trong cùng thư mục `docs/`:**
> - [web_analysis_for_backend.md](./web_analysis_for_backend.md): Chi tiết hơn 60 API endpoints, luồng giao diện và các ràng buộc từ `web/`.
> - [Dump20261029.sql](./Dump20261029.sql): File SQL dump gốc (MySQL/TiDB từ bản Spring Boot cũ) chứa schema thực tế và dữ liệu mẫu chuẩn của phòng khám.

---

## 1. NGUYÊN TẮC BẮT BUỘC DÀNH CHO AGENT (HARD CONSTRAINTS)

1. **KHÔNG CHỈNH SỬA FRONTEND (`web/`):**
   - Giữ nguyên 100% mã nguồn trong `web/src/`. Mọi sự khác biệt về định dạng dữ liệu, kiểu ID, đường dẫn URL hay cấu trúc JSON **bắt buộc phải được xử lý ở phía `backend/`** (thông qua Mongoose `toJSON`, Middleware, hoặc Adapter trong Controller).
   - **Chỉ cho phép 2 ngoại lệ tối thiểu** khi thực sự cần chạy tích hợp:
     1. Tạo file biến môi trường `web/.env` với nội dung `VITE_API_URL=http://localhost:3000/api` (file cấu hình môi trường, không sửa code).
     2. *(Chỉ khi làm tới luồng VNPay callback)*: Bổ sung trang/route `/payment-result` vào `web/src/routes/Index.tsx` do `Step4.tsx` đang redirect về URL này nhưng chưa khai báo route.

2. **BẮT BUỘC DÙNG ID SỐ NGUYÊN TỰ TĂNG (`id: Number`) TRONG MONGODB:**
   - Toàn bộ cả Frontend (`Number(raw.id)`, `parseInt(id, 10)`) lẫn SQL gốc (`bigint AUTO_INCREMENT`) đều dùng ID số nguyên.
   - **Tuyệt đối không** trả `_id` chuỗi hex 24 ký tự của MongoDB làm `id` ra JSON (sẽ gây lỗi `NaN` trên khắp Frontend).
   - Phải tạo collection `counters` và plugin/helper tự động tăng `id: Number` (`1, 2, 3...`), đồng thời cấu hình `toJSON` trên mọi Mongoose Schema để trả ra `id: Number` và ẩn `_id`, `__v`, `password`.

3. **TUÂN THỦ KIẾN TRÚC HIỆN TẠI CỦA `backend/`:**
   - Ngôn ngữ & Module: **JavaScript (CommonJS — `require` / `module.exports`)**, Node.js `>= 20`, **Express `^5.3.0`**, **Mongoose `^9.11.4`**.
   - Lưu ý Express 5: Các `async (req, res)` controller tự động chuyển Promise rejection sang `errorHandler` tại `src/middlewares/error.middleware.js`. Sử dụng `throw new ApiError(statusCode, message)` từ `src/utils/ApiError.js`.
   - Cấu trúc thư mục chuẩn trong `backend/src/`:
     ```text
     backend/src/
     ├── app.js
     ├── server.js
     ├── config/         # env.js, db.js, multer.js
     ├── models/         # Mongoose schemas + Counter auto-increment plugin
     ├── middlewares/    # auth.middleware.js, error.middleware.js, validate.middleware.js
     ├── services/       # Business logic, slot generator, email, vnpay, chatbot, cron
     ├── controllers/    # Request/Response adapters khớp 100% contract của web/
     ├── routes/         # index.js (/api/*) + root.routes.js (ngoài /api)
     ├── utils/          # ApiError.js, dateParser.js, response.js, jwt.js
     └── seed/           # seed.js (nạp dữ liệu sạch từ SQL dump + sinh lịch trực mới)
     ```

---

## 2. ÁNH XẠ SCHEMA TỪ `Dump20261029.sql` SANG MONGODB (MỚI & TỐI ƯU)

File `Dump20261029.sql` có **21 bảng quan hệ** (dùng JPA Joined Inheritance). Khi chuyển sang MongoDB, cần thiết kế lại theo hướng **NoSQL chuẩn mực (nhúng subdocument hợp lý + bỏ bảng kế thừa rỗng)** thành **13 Collections**, vừa gọn nhẹ vừa tương thích 100% với Frontend:

### Bảng tổng hợp ánh xạ SQL → MongoDB

| Bảng trong SQL cũ (`Dump20261029.sql`) | Collection MongoDB mới | Chiến lược chuyển đổi & Lý do kỹ thuật |
|---|---|---|
| *(AUTO_INCREMENT của MySQL)* | `counters` | Lưu `{ _id: "users", seq: 100 }` để cấp `id: Number` tuần tự, nguyên tử (`findOneAndUpdate` với `$inc`). |
| `users` + `admin` + `patient` + `receptionist` + `doctor` (5 bảng) | `users` (1 collection) | Trong SQL, 4 bảng role dùng khoá chính trỏ thẳng vào `users.id` (`doctor_id === users.id`). Gộp chung vào `users` giúp bảo toàn quy tắc sống còn của FE: **`user.id === doctor.id === receptionist.id`** mà không cần `$lookup`! |
| `specialties` | `specialties` | Ánh xạ 1-1 (`id`, `name` unique, `description`). Có sẵn 5 chuyên khoa chuẩn trong SQL. |
| `doctor_shifts` + `shift_slots` (2 bảng) | `doctor_shifts` (nhúng `slots[]`) | Nhúng mảng `slots` trực tiếp vào `doctor_shifts`. Khi `Step2.tsx` gọi `GET /shifts/by-doctor/:id`, có ngay mảng `slots` không tốn N+1 query, đồng thời đặt giữ chỗ atomic bằng toán tử mảng của MongoDB. |
| `patient_information` (vừa lưu danh bạ, vừa FK `appointment_id`) | `patient_profiles` + nhúng `Appointment.patients[]` | **Khắc phục lỗi thiết kế SQL cũ:** Tách danh bạ người thân tái sử dụng ra `patient_profiles` (`ownerId`), còn khi đặt lịch thì lưu **bản chụp (snapshot)** mảng `patients[]` vào thẳng `appointments` để lịch sử khám cũ không bao giờ bị ghi đè! |
| `appointments` | `appointments` | Ánh xạ đầy đủ các cột từ SQL (`appointmentNo`, `status` 10 trạng thái, `type`, `shiftId`, `slotId`, `doctorId`, `patientId`, `specialtyId`, `confirmedBy`, `meetingUrl`, `joinCode`, `patients[]`). |
| `prescriptions` | `prescriptions` | Ánh xạ 1-1 (`id`, `appointmentId`, `medicineName`, `dosage`, `duration`, `instructions`, `createdAt`). |
| `payment_transactions` | `payment_transactions` | Ánh xạ 1-1 lưu giao dịch VNPay (`appointmentId`, `amount`, `bankCode`, `orderInfo`, `payDate`, `responseCode`, `transactionNo`, `transactionStatus`). |
| `vouchers` | `vouchers` | Ánh xạ 1-1 (`id`, `code` unique, `name`, `discountValue`, `type`, `enable`, `expiryDate`). |
| `user_vouchers` | `user_vouchers` | Ánh xạ 1-1 (`id`, `userId`, `voucherId`, `issuedAt`, `used`). |
| `events` | `events` | Ánh xạ 1-1 (`id`, `title`, `description`, `location`, `startDate`, `endDate`, `isEnabled`, `voucherId`). |
| `user_events` | `user_events` | Ánh xạ 1-1 (`id`, `eventId`, `userId`, `status`: `'PENDING' \| 'CONFIRMED'`, `registeredAt`). Unique index `{ eventId: 1, userId: 1 }`. |
| `feedbacks` | `feedbacks` | Ánh xạ 1-1 (`id`, `userId`, `rating`, `title`, `comment`, `category`, `isAnonymous`, `status`, `adminResponse`, `adminRespondedAt`). |
| `images` | `images` | Ánh xạ 1-1 (`id`, `imageUrl`, `doctorId`, `specialtyId`). Đồng bộ cập nhật `avatarUrl` trên `users` để đọc nhanh. |
| `rss_sources` + `news` | `rss_sources` & `news` | Ánh xạ 1-1 phục vụ tin tức y tế trang chủ (`/rss-sources/news/latest`). |
| `shift_cancel_request` | *(Không bắt buộc ở Phase 1–4)* | Yêu cầu hủy ca trực. |

---

### Chi tiết thiết kế các Mongoose Schema cốt lõi

#### 2.1. Plugin `autoIncrement` & `toJSON` dùng chung (`src/models/plugins/autoIncrement.js`)
- Collection `counters`: `{ _id: String, seq: { type: Number, default: 0 } }`.
- Trong `schema.pre('save')` (khi `this.isNew && !this.id`): tăng `seq` và gán vào `this.id`.
- Trong `schema.set('toJSON', { virtuals: true, transform: (doc, ret) => { delete ret._id; delete ret.__v; delete ret.password; delete ret.temporaryPassword; return ret; } })`.

#### 2.2. `User` Schema (`src/models/user.model.js`)
```js
{
  id: { type: Number, unique: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // Hash bcrypt ($2a$10$ / $2b$10$) hoặc '{noop}GOOGLE_LOGIN'
  temporaryPassword: { type: String, default: null }, // Dùng cho /auth/forgot-password & /auth/reset-password
  temporaryPasswordExpiresAt: { type: Date, default: null },
  fullName: { type: String, required: true, trim: true },
  phoneNumber: { type: String, default: null },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Other' },
  userType: {
    type: String,
    enum: ['Patient', 'Doctor', 'Receptionist', 'Admin'], // ĐÚNG CHỮ HOA/THƯỜNG NHƯ FE!
    required: true,
    default: 'Patient',
  },
  isEnable: { type: Boolean, default: true }, // Alias virtual `isEnabled` = `isEnable` cho FE!
  authProvider: { type: String, enum: ['LOCAL', 'GOOGLE', 'FACEBOOK'], default: 'LOCAL' },

  // --- Trường riêng khi userType === 'Doctor' (từ bảng `doctor` trong SQL) ---
  specialtyId: { type: Number, default: null, index: true },
  degree: { type: String, default: null },
  description: { type: String, default: null },
  experience: { type: String, default: null },
  consultationFee: { type: Number, default: null },
  isVip: { type: Boolean, default: false },
  avatarUrl: { type: String, default: null },
}
```
> **Lưu ý tương thích dữ liệu SQL:**
> - Trong SQL cũ cột tên là `is_enable`, còn FE đọc cả `raw.isEnabled` lẫn `raw.isEnable` (`admin.ts` L59). Hãy trả ra cả `isEnable` và `isEnabled` trong JSON transform!
> - Hash mật khẩu trong `Dump20261029.sql` có tiền tố `$2a$10$...` — thư viện `bcryptjs` trên Node.js xác thực trực tiếp được chuẩn `$2a$` này! Với tài khoản có `password === '{noop}GOOGLE_LOGIN'`, chặn đăng nhập bằng mật khẩu thường và báo `"Tài khoản này đăng nhập qua Google"`.

#### 2.3. `DoctorShift` Schema & Thuật toán chia Slot tự động (`src/models/doctorShift.model.js`)
Từ `Dump20261029.sql` (dòng 137–164 & 583–603), quy tắc ca trực trong hệ thống gốc rất rõ ràng:
```js
const ShiftSlotSchema = new Schema({
  id: { type: Number, required: true },
  slotNumber: { type: Number, required: true },
  startTime: { type: String, required: true }, // "HH:mm" (VD: "08:00")
  endTime: { type: String, required: true },   // "HH:mm" (VD: "08:45")
  status: {
    type: String,
    enum: ['AVAILABLE', 'BOOKED', 'CANCELLED', 'COMPLETED'],
    default: 'AVAILABLE',
  },
}, { _id: false });

const DoctorShiftSchema = new Schema({
  id: { type: Number, unique: true, index: true },
  doctorId: { type: Number, required: true, index: true }, // Trỏ tới User.id (userType='Doctor')
  date: { type: String, required: true, index: true },     // "YYYY-MM-DD"
  shift: { type: String, enum: ['MORNING', 'AFTERNOON', 'EVENING'], required: true },
  startTime: { type: String, required: true },             // "08:00" | "13:00" | "18:00"
  endTime: { type: String, required: true },               // "12:00" | "17:00" | "21:00"
  slotDurationMinutes: { type: Number, default: 45 },
  bufferMinutes: { type: Number, default: 15 },
  maxPatients: { type: Number, default: 10 },
  note: { type: String, default: null },
  repeatWeekly: { type: Boolean, default: false },
  repeatCount: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' },
  slots: [ShiftSlotSchema],
});
// Unique constraint y hệt SQL `UKmrtxpnioa9s4i8a1stgf05l08`:
DoctorShiftSchema.index({ doctorId: 1, date: 1, shift: 1 }, { unique: true });
```
- **Thuật toán tự sinh `slots` khi bác sĩ gọi `POST /api/shifts/create`:**
  - Khung giờ cố định (bắt buộc khớp `DoctorShifts.tsx` L115–129):
    - `MORNING`: `08:00` – `12:00` → 4 khung giờ chuẩn (`08:00-08:45`, `09:00-09:45`, `10:00-10:45`, `11:00-11:45`), hoặc chia theo `maxPatients` nằm gọn trong `08:00–11:59`.
    - `AFTERNOON`: `13:00` – `17:00` → 4 khung giờ chuẩn (`13:00-13:45`, `14:00-14:45`, `15:00-15:45`, `16:00-16:45`).
    - `EVENING`: `18:00` – `21:00` → 3 khung giờ chuẩn (`18:00-18:45`, `19:00-19:45`, `20:00-20:45`).
  - Tính trường động `availableSlots` khi trả JSON: đếm số phần tử trong `slots` có `status === 'AVAILABLE'`.
  - Nếu `repeatWeekly === true` và `repeatCount` từ `1..3`: lặp tạo thêm ca cho `date + 7 * k` ngày (`k = 1..repeatCount`), bỏ qua các ngày bị trùng Unique Index để không văng lỗi toàn bộ request.

#### 2.4. `Appointment` Schema (`src/models/appointment.model.js`)
Đối chiếu `Dump20261029.sql` (dòng 50–84) và `web/src/api/appointment.ts`:
```js
{
  id: { type: Number, unique: true, index: true },
  appointmentNo: { type: String, required: true, unique: true, index: true }, // VD: "OFF60E56958" hoặc "ONL8A91B2C3"
  patientId: { type: Number, required: true, index: true },   // User.id của tài khoản đặt lịch
  doctorId: { type: Number, required: true, index: true },    // User.id của bác sĩ
  specialtyId: { type: Number, required: true, index: true }, // Specialty.id
  shiftId: { type: Number, required: true, index: true },     // DoctorShift.id
  slotIds: [{ type: Number }],                                // Các slotId được giữ trong ca trực
  appointmentDate: { type: String, required: true, index: true }, // "YYYY-MM-DD" (lấy từ shift.date)
  appointmentTime: { type: String, required: true },              // "HH:mm" (lấy từ slot đầu tiên, VD "08:00")
  actualStartTime: { type: String, default: null },
  actualEndTime: { type: String, default: null },
  type: { type: String, enum: ['OFFLINE', 'ONLINE'], default: 'OFFLINE' },
  status: {
    type: String,
    enum: [
      'PENDING_PAYMENT',      // Lịch ONLINE vừa tạo, chờ thanh toán VNPay
      'PENDING_CONFIRMATION', // Lịch OFFLINE vừa tạo (hoặc ONLINE đã thanh toán), chờ lễ tân xác nhận
      'CONFIRMED',            // Lễ tân đã xác nhận
      'CHECKED_IN',           // Bệnh nhân đã đến quầy check-in
      'IN_PROGRESS',          // Bác sĩ đang khám
      'COMPLETED',            // Bác sĩ đã kê đơn và hoàn tất
      'CANCELLED',            // Đã huỷ (hoàn trả slot)
      'RESCHEDULED',          // Đã dời sang ca trực khác
      'EXPIRED',              // Quá hạn xác nhận/thanh toán (tự động hoàn trả slot)
      'NO_SHOW',              // Không đến khám
    ],
    default: 'PENDING_CONFIRMATION',
  },
  checkedIn: { type: Boolean, default: false },
  confirmedBy: { type: Number, default: null }, // User.id của Lễ tân
  reason: { type: String, default: null },
  joinCode: { type: String, default: null },    // Dùng cho khám ONLINE
  meetingUrl: { type: String, default: null },  // Dùng cho khám ONLINE
  patients: [{                                  // Snapshot danh sách người khám (1..4 người)
    id: Number,
    fullName: String,
    gender: String,
    phoneNumber: String,
    dob: String,
    relationship: String,
  }],
}
```
- **Quy tắc sinh `appointmentNo` (khớp dữ liệu thật trong SQL dump):**
  `const prefix = type === 'ONLINE' ? 'ONL' : 'OFF';` + `crypto.randomBytes(4).toString('hex').toUpperCase()` → Ví dụ: `OFF60E56958`, `ONL3F92A1B0`.
- **Khi trả JSON `Appointment` ra cho FE:** Populate/join nhẹ thông tin tên để trả kèm `patientName` (`patients[0]?.fullName` hoặc tên tài khoản đặt), `doctorName`, `specialtyName` ngay ở top-level của object `Appointment` (xem `normalizeAppointment` trong `web/src/api/appointment.ts` L80–145).

---

## 3. BẢNG QUY TẮC XỬ LÝ TƯƠNG THÍCH "NGẦM" (ADAPTER RULES)

Để tuân thủ nguyên tắc **Không sửa Frontend**, Backend bắt buộc cài đặt 6 quy tắc chuyển đổi sau:

1. **Parser Ngày Giờ Kép (`src/utils/dateParser.js`):**
   - `AdminEvents.tsx` và `AdminVouchers.tsx` gửi `startDate`, `endDate`, `expiryDate` theo định dạng `"dd/MM/yyyy HH:mm"` (ví dụ `"20/11/2026 23:59"`), nhưng khi đọc lại truyền vào `new Date(val)`.
   - Hàm `parseFlexibleDate(input)` ở Backend phải:
     - Nhận diện regex `/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/` → chuyển thành đối tượng `Date` hợp lệ.
     - Nếu là chuỗi ISO-8601 → `new Date(input)`.
     - Khi serialize ra JSON → luôn trả chuỗi ISO-8601 (`Date.prototype.toISOString()`).

2. **Chuẩn hoá Giới tính (`normalizeGender`):**
   - Nhận mọi biến thể `'MALE' | 'Male' | 'male' | 'Nam'` → lưu `'Male'`.
   - `'FEMALE' | 'Female' | 'female' | 'Nữ'` → lưu `'Female'`.
   - Còn lại → lưu `'Other'`.
   - Luôn trả ra `'Male' | 'Female' | 'Other'` để bộ lọc `d.gender === filters.gender` ở `SpecialtyDetail.tsx` hoạt động chính xác.

3. **Tạo Bác sĩ từ Admin (`POST /api/admin/create-user`):**
   - `AdminCreateUser.tsx` gửi `specialization: "Tim mạch"` (**tên chuyên khoa**, không phải `specialtyId`!), trong khi `PUT /api/admin/update-doctor/:id` lại gửi `specialtyId: 5`.
   - Controller `createUser` khi thấy `userType === 'Doctor'` phải hỗ trợ cả 2: nếu có `specialtyId` thì dùng luôn, nếu chỉ có `specialization` thì tìm `Specialty.findOne({ name: specialization })` để lấy `specialtyId`!

4. **Mount các Route nằm NGOÀI `/api` trong `backend/src/app.js`:**
   - Bật `credentials: true` trong `cors(...)`:
     ```js
     app.use(cors({
       origin: (origin, cb) => (!origin || env.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
       credentials: true,
     }));
     ```
   - Phục vụ file ảnh tĩnh ở cả 2 đường dẫn (do `getImageFullUrl` trong `web/src/api/image.ts` cắt `/api` và chèn `/images/file`):
     ```js
     app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
     app.use('/images/file/uploads', express.static(path.join(__dirname, '../uploads')));
     ```
   - Mount OAuth2 redirect ở root:
     - `GET /oauth2/authorization/google` & `GET /oauth2/authorization/facebook`.
   - Bật `express.text({ type: 'text/plain' })` trước hoặc ngay trên route `POST /api/chat/ask`.

5. **4 Endpoint trả JSON Top-Level (không bọc chỉ trong `{ data }`):**
   - Hầu hết API trả `{ success: true, message: "...", data: ... }` đều tương thích tốt. Riêng **4 nhóm sau** cần lưu ý cấu trúc top-level:
     1. `POST /api/chat/ask`: `res.type('text/plain').send(htmlAnswerString)`.
     2. `GET /api/payment/create`: `res.json({ paymentUrl })`.
     3. `GET | POST | PUT /api/images/doctor/:doctorId`: `res.json({ id, imageUrl, doctorId })` (khi bác sĩ chưa có ảnh trong DB, trả `404` để FE tự fallback sang ảnh tĩnh trong `web/public/images/`).
     4. `GET /api/auth/oauth2/user-info`: `res.json({ token, user: { id, fullName, email, userType } })`.
   - Đặc biệt với `POST /api/auth/login`, `web/src/api/auth.ts` đọc `data.data` theo cấu trúc:
     ```json
     {
       "message": "Đăng nhập thành công",
       "data": {
         "message": "Đăng nhập thành công",
         "success": true,
         "id": 2,
         "fullName": "Admin System",
         "role": "Admin",
         "token": "eyJhbGci..."
       }
     }
     ```
   - Và khi ký JWT (`jsonwebtoken`), payload **bắt buộc** có `{ userId: user.id, sub: user.email, role: user.userType }` để khớp với `OAuth2Callback.tsx`!

6. **Phân quyền Thực tế theo Hành vi của `web/`:**
   - `GET /api/admin/doctors` → **Cho phép Public (không cần đăng nhập)** vì trang chủ `DoctorsSection.tsx` và trang `Doctors.tsx` của khách vãng lai đều gọi endpoint này!
   - `GET /api/admin/users`, `GET /api/admin/disabled`, `DELETE /api/admin/users/:userId`, `POST /api/admin/activate/:userId` → **Cho phép cả `Admin` VÀ `Receptionist`** (vì `RecepDashboard.tsx` dùng các API này để xem và khoá/mở khoá bệnh nhân). Lưu ý: Nếu người gọi có role `Receptionist`:
     - Ở `GET /api/admin/users` và `/api/admin/disabled`: chỉ trả về danh sách `userType === 'Patient'` để Lễ tân không nhìn thấy hay vô tình khoá nhầm Admin/Receptionist khác (do `RecepDashboard.tsx` nhận diện bệnh nhân bằng cách kiểm tra `!u.degree && !u.description && !u.experience`!).
     - Ở `DELETE /api/admin/users/:userId`: chặn không cho phép Lễ tân khoá tài khoản khác `Patient` và không cho Admin tự khoá chính mình.
   - `GET /api/appointments/status/:status` → Hỗ trợ `:status === 'ALL'`. Nếu người gọi có role `Doctor`, **tự động lọc `doctorId === req.user.id`** (vì `doctorDashboard.ts` gọi `/appointments/status/ALL` để tính thống kê riêng của bác sĩ đang đăng nhập!).

---

## 4. CÒN GÌ NỮA ĐỂ PHÁT TRIỂN BACKEND HOÀN CHỈNH? (CHECKLIST BỔ SUNG)

Ngoài Models và CRUD Controllers, một Backend hoàn chỉnh cho dự án này cần có **6 mảnh ghép hạ tầng & nghiệp vụ** sau (được phát hiện từ dữ liệu thực tế trong `Dump20261029.sql` và luồng UI):

### 4.1. Cron Job / Background Worker xử lý lịch hẹn quá hạn (`EXPIRED`)
- Trong `Dump20261029.sql` có nhiều bản ghi mang `status = 'EXPIRED'`.
- Cần cài `node-cron` chạy mỗi 5 phút (`*/5 * * * *`) để:
  1. Tìm các lịch `ONLINE` có `status === 'PENDING_PAYMENT'` tạo quá **15 phút** mà chưa thanh toán → chuyển sang `'EXPIRED'` và mở lại `slot.status = 'AVAILABLE'`.
  2. Tìm các lịch `PENDING_CONFIRMATION` đã quá ngày khám (`appointmentDate < today`) → chuyển sang `'EXPIRED'` và giải phóng slot.

### 4.2. Quản lý Giao dịch Slot Nguyên tử (Atomic Slot Reservation & Release)
- **Khi đặt lịch (`POST /api/appointments/create`):**
  - Kiểm tra ca trực `ACTIVE`, lấy đủ `N = patients.length` slot đang `'AVAILABLE'` đầu tiên, đổi sang `'BOOKED'`. Nếu không đủ slot trống thì trả lỗi `400` `"Ca khám đã hết chỗ hoặc không đủ số lượng chỗ trống"`.
  - Gán `appointmentTime` bằng `startTime` của slot đầu tiên vừa giữ (định dạng `"HH:mm"`, ví dụ `"08:00"`).
  - Nếu người dùng nhập tay bệnh nhân mới (phần tử trong `patients[]` không có `id`), tự động lưu hoặc cập nhật vào `patient_profiles` của `ownerId = req.user.id` để lần sau bệnh nhân đặt lại có sẵn hồ sơ.
- **Khi huỷ lịch (`PUT /api/appointments/cancel/:id`):**
  - Đổi `appointment.status = 'CANCELLED'` và trả các `slotIds` của lịch đó trong `DoctorShift` về lại `'AVAILABLE'`.
- **Khi dời lịch (`PUT /api/appointments/reschedule/:id?newShiftId=...`):**
  - Trả slot ở ca cũ về `'AVAILABLE'`, giữ slot mới ở `newShiftId`, cập nhật `shiftId`, `appointmentDate`, `appointmentTime`, và đặt trạng thái về `'CONFIRMED'` (để bệnh nhân vẫn nhìn thấy lịch trong tab *Lịch hẹn sắp tới* của `PatientAppointments.tsx`, vốn chỉ lọc `PENDING_CONFIRM`, `CONFIRMED`, `CHECK_IN`!).
- **Khi hoàn tất khám (`PUT /api/appointments/complete/:id`):**
  - Kiểm tra `Prescription.countDocuments({ appointmentId: id }) > 0`. Nếu `=== 0`, trả lỗi `400` `"Vui lòng kê đơn thuốc trước khi hoàn tất ca khám"`. Sau đó đổi trạng thái lịch hẹn sang `'COMPLETED'` và slot tương ứng sang `'COMPLETED'`.

### 4.3. Nghiệp vụ Check-in Sự kiện Tự động Tặng Voucher
- Tại `POST /api/reception/events/:eventId/confirm/:userId`:
  1. Chuyển `UserEvent.status` từ `'PENDING'` sang `'CONFIRMED'`.
  2. Kiểm tra `Event.voucherId`: nếu sự kiện có gắn mã giảm giá/phiếu dịch vụ còn hiệu lực (`enable: true`), tự động tạo bản ghi `UserVoucher` (`{ userId, voucherId, issuedAt: new Date(), used: false }`, chống trùng lặp nếu đã cấp rồi).

### 4.4. Cơ chế Graceful Fallback cho 5 Dịch vụ Tích hợp Ngoài
Để dự án **chạy được ngay lập tức bằng `npm run dev` hoặc `docker compose up`** trên máy bất kỳ thành viên nào trong nhóm (kể cả khi chưa điền API Key bên thứ ba), mọi tích hợp ngoài cần viết theo mô hình **Real + Local Fallback**:
1. **Email Quên mật khẩu (`nodemailer`):** Nếu có `SMTP_HOST` & `SMTP_USER` trong `.env` → gửi email thật chứa `temporaryPassword`; nếu trống → log rõ khung thông báo `[DEV MAIL] Temporary password for <email>: <tempPass>` ra terminal để test ngay được bước `/reset-password`.
2. **AI Chatbot (`POST /api/chat/ask`):** Nếu có `GEMINI_API_KEY` → gọi Gemini API kèm system prompt chứa danh sách 5 chuyên khoa & các bác sĩ đang trực trong MongoDB, trả lời bằng HTML ngắn gọn (`<b>`, `<ul><li>`, `<br/>`); nếu chưa có key → dùng bộ rule-based thông minh phân tích từ khoá triệu chứng (đau răng → Răng Hàm Mặt, đau ngực/huyết áp → Tim mạch, mờ mắt → Mắt, đau khớp/lưng → Cơ Xương Khớp, sốt/tiêu hoá → Nội tổng quát) kèm gợi ý bác sĩ thật từ DB! *(Tuyệt đối không trả câu bắt đầu bằng `"Xin lỗi bạn, trợ lý AI hiện"` trừ khi thực sự lỗi mạng, vì FE bắt chuỗi đó để hiện nút Retry báo lỗi)*.
3. **Thanh toán VNPay (`GET /api/payment/create` & `/api/payment/vnpay-return`):** Nếu có `VNP_TMNCODE` & `VNP_HASHSECRET` → ký HMAC-SHA512 chuẩn VNPay Sandbox và lưu `PaymentTransaction`; nếu chưa cấu hình → chuyển hướng sang endpoint xác nhận thanh toán giả lập nội bộ (cập nhật `status: 'PENDING_CONFIRMATION'` và đưa người dùng về trang lịch hẹn).
4. **Google / Facebook OAuth2:** Nếu có `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` → chạy luồng OAuth2 chuẩn và redirect về `${FRONTEND_URL}/oauth2/callback?token=${jwt}`; nếu chưa cấu hình → redirect về `${FRONTEND_URL}/login?error=${encodeURIComponent('Chưa cấu hình Google/Facebook OAuth2 trên server')}` (trang `Login.tsx` L71–77 đã hỗ trợ đọc `?error=...` và hiển thị thông báo đẹp!).
5. **RSS Tin tức Y tế (`GET /api/rss-sources/news/latest`):** Đọc từ collection `news` trong MongoDB (đã được seed sẵn 6–10 bài viết sức khoẻ có ảnh đẹp), kèm job tuỳ chọn dùng `rss-parser` kéo tin mới từ RSS Sức khoẻ VnExpress / Báo Sức khoẻ & Đời sống khi có mạng.

### 4.5. Bộ Seed Database Chuẩn Hoá từ `Dump20261029.sql` (`npm run seed`)
Cần viết script `backend/src/seed/seed.js` (`"seed": "node src/seed/seed.js"` trong `backend/package.json`) thực hiện:
1. Nạp **5 chuyên khoa gốc** từ `Dump20261029.sql` (`1: Nội tổng quát`, `2: Cơ Xương Khớp`, `3: Răng Hàm Mặt`, `4: Mắt`, `5: Tim mạch`).
2. Nạp hệ thống tài khoản mẫu (cung cấp mật khẩu mặc định dễ test như `123456` cho môi trường dev, hoặc giữ tài khoản chuẩn):
   - **Admin:** `admin@clinicbooking.com` (`Admin System`).
   - **Receptionist:** `receptionist1@gmail.com` (`Võ Mai Phương`).
   - **Doctors:** Nạp 10 bác sĩ chuyên khoa từ `Dump20261029.sql` (như BS CKII Tôn Thất Việt Hùng, Lâm Trọng Cơ, Đoàn Thành Nhân, Nguyễn Quang Hải, Doãn Bá Bình, Trần Văn Đà, Nguyễn Thị Thu, Hà Nguyễn Minh Quang, Huỳnh Thúc Bảo, Lê Xuân Túy) — có thể bổ sung thêm các bác sĩ trùng tên với bộ ảnh tĩnh có sẵn trong `web/public/images/` (`dovanthanh.jpg`, `nguyentienhung.jpg`, `phamhongphuc.jpg`...) để giao diện hiển thị đầy đủ chân dung bác sĩ ngay từ đầu!
   - **Patients:** Nạp các tài khoản bệnh nhân mẫu hợp lệ từ SQL dump (**LƯU Ý QUAN TRỌNG:** Bỏ qua dòng dữ liệu test phản cảm `id = 240001` trong `Dump20261029.sql`!).
3. **Tự động sinh Ca trực động (`doctor_shifts` + `slots`) cho 14 ngày tới tính từ `new Date()`:**
   - Vì dữ liệu ca trực trong `Dump20261029.sql` nằm ở các ngày cũ (`19/10 – 28/10/2026`), script seed phải tự tạo ca trực Sáng/Chiều/Tối cho các bác sĩ trong **tuần hiện tại và tuần kế tiếp** để mở web lên là đặt lịch khám được ngay!
4. Nạp sẵn **Vouchers**, **Events** (có hạn sử dụng trong tương lai để hiển thị ở mục *Sự kiện sắp diễn ra*), **7 Feedbacks** đánh giá 5 sao từ SQL dump, và **News** y tế mẫu.
5. Cập nhật giá trị `seq` trong collection `counters` lớn hơn `max(id)` của từng collection để các bản ghi tạo mới sau khi seed không bao giờ đụng ID cũ!

### 4.6. Biến Môi Trường Đầy Đủ cho `backend/.env.example`
```env
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/clinic_booking
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# JWT Auth
JWT_SECRET=clinic_booking_super_secret_key_change_in_prod
JWT_EXPIRES_IN=7d

# Optional: SMTP Email (Forgot Password)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Clinic Booking <no-reply@clinicbooking.com>"

# Optional: AI Chatbot (Gemini)
GEMINI_API_KEY=

# Optional: VNPay Sandbox
VNP_TMNCODE=
VNP_HASHSECRET=
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/api/payment/vnpay-return

# Optional: Google OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/oauth2/callback/google
```

---

## 5. LỘ TRÌNH THỰC THI TỪNG BƯỚC CHO AGENT (IMPLEMENTATION ROADMAP)

Khi bắt đầu code Backend, Agent hãy thực hiện tuần tự 5 Phase sau và kiểm thử từng Phase trước khi sang Phase tiếp theo:

- **Phase 1 — Core Foundation, Models & Database Seeder:**
  1. Cài đặt dependencies trong `backend/`: `npm install bcryptjs jsonwebtoken multer node-cron nodemailer rss-parser`.
  2. Cập nhật `src/config/env.js` và `src/app.js` (`credentials: true` cho CORS, `express.text()`, static `/uploads` & `/images/file/uploads`).
  3. Xây dựng toàn bộ 13 Mongoose Models + `Counter` auto-increment `id: Number` + `toJSON` chuẩn hoá.
  4. Viết `src/seed/seed.js` chuyển đổi dữ liệu sạch từ `Dump20261029.sql` + sinh ca trực mới, chạy `npm run seed` kiểm tra dữ liệu trong MongoDB.

- **Phase 2 — Authentication, Users & Role Guards:**
  1. Xây dựng `auth.middleware.js` (`authenticate`, `authorizeRoles`) đọc `Bearer <token>` và gắn `req.user`.
  2. Triển khai `/api/auth/*` (`login`, `register`, `register-admin`, `forgot-password`, `reset-password`, `change-password`, `oauth2/*` + root `/oauth2/authorization/:provider`).
  3. Triển khai `/api/users/*` (`me`, `update`, `search`) và `/api/patients-info/*` (CRUD hồ sơ người thân).

- **Phase 3 — Quản trị Phòng khám (Specialties, Doctors, Receptionists, Admin, Images):**
  1. Triển khai `/api/specialties/*`, `/api/services/*`.
  2. Triển khai `/api/doctors/*`, `/api/receptionists/*`, `/api/admin/*` (lưu ý quyền Public cho `GET /api/admin/doctors` và quyền Receptionist quản lý Patient).
  3. Triển khai upload/update/delete/get ảnh bác sĩ `/api/images/doctor/:doctorId` với `multer`.

- **Phase 4 — Luồng Đặt lịch, Ca trực & Kê đơn thuốc (Core Workflow):**
  1. Triển khai `/api/shifts/*` (`create` kèm tự chia slot & lặp tuần, `my`, `admin/week`, `by-doctor/:doctorId`, `by-date`).
  2. Triển khai `/api/appointments/*` (`create` kèm cấp `appointmentNo` & giữ slot atomic, `my-upcoming`, `my-completed`, `status/:status`, `by-date`, `by-shift/:shiftId`, `:id`, `confirm`, `checkin`, `cancel`, `reschedule`, `start`, `complete`).
  3. Triển khai `/api/prescriptions/*` (`by-appointment`, `create`, `batch-create`, `update`) + Cron Job tự động chuyển `EXPIRED`.

- **Phase 5 — Sự kiện, Voucher, Đánh giá, Tin tức, Chatbot & Thanh toán:**
  1. Triển khai `/api/vouchers/*`, `/api/events/*`, `/api/reception/events/*` (tự cấp voucher khi lễ tân xác nhận tham gia sự kiện).
  2. Triển khai `/api/feedbacks/*` (`public`, `stats`, `my`, CRUD).
  3. Triển khai `/api/rss-sources/news/*`, `/api/chat/ask`, `/api/payment/*` (với cơ chế Graceful Fallback).
  4. Tạo `web/.env` (`VITE_API_URL=http://localhost:3000/api`) và kiểm thử tích hợp đầu-cuối (End-to-End) trên tất cả 5 vai trò (`Guest`, `Patient`, `Receptionist`, `Doctor`, `Admin`).

