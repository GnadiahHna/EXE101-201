# MA TRẬN BẢO MẬT & KIỂM SOÁT PHÂN QUYỀN (SECURITY MATRIX)

Dự án: **ClinicBooking Monorepo**  
Phiên bản: **Phase 3 - Hardening & IDOR Protection**  
Mục đích: Định nghĩa chi tiết quy tắc kiểm soát truy cập (Access Control), quyền sở hữu tài nguyên (Ownership Check), và kịch bản kiểm thử âm tính (Negative Test Cases) cho toàn bộ các endpoint nhận tham số định danh (`:id`, `:appointmentId`, `:profileId`, v.v.).

---

## 1. Nguyên tắc kiểm soát truy cập & Phòng chống IDOR

1. **Numeric ID Protection**: Hệ thống sử dụng ID số tuần tự tăng dần (`autoIncrement`), do đó mọi truy vấn theo ID số bắt buộc phải đi kèm điều kiện sở hữu (`ownerId === user.id` hoặc `patientId === user.id` hoặc `doctorId === user.id`) trực tiếp trong query database.
2. **Timing-Safe / Enumeration Protection**: Khi người dùng A cố tình truy cập tài nguyên của người dùng B:
   - Các API nhạy cảm (Đơn thuốc, Hồ sơ người thân, Lịch hẹn cá nhân, Tham gia phòng khám online, Voucher cá nhân) trả về `404 Not Found` (hoặc `403 Forbidden` tuỳ theo ngữ cảnh vai trò) với thông điệp chung nhằm tránh kẻ tấn công dò quét sự tồn tại của ID số.
3. **Role Scoping & Principle of Least Privilege**:
   - `Patient`: Chỉ có quyền đọc/ghi tài nguyên thuộc quyền sở hữu của chính mình hoặc hồ sơ người thân phụ thuộc (`ownerId`).
   - `Doctor`: Chỉ có quyền xem lịch hẹn, ca trực và kê đơn cho các ca khám được phân công (`doctorId === user.id`).
   - `Receptionist`: Có quyền xác nhận, check-in, hủy hoặc đổi lịch theo ca trực vận hành; bị giới hạn chặt chẽ chỉ xem thông tin tài khoản Patient (bị chặn xem Doctor/Admin).
   - `Admin`: Có toàn quyền quản trị hệ thống, mọi thao tác thay đổi nhạy cảm (phân quyền, khóa/mở tài khoản, duyệt ca) đều được ghi Audit Log bất biến.

---

## 2. Bảng Ma Trận Phân Quyền & Quy Tắc IDOR (Endpoint → Rule → Test)

| Endpoint | Method | Vai trò được phép | Quy tắc sở hữu (Ownership Rule) | Kịch bản kiểm thử âm (Negative Test Case) | Mã phản hồi |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `/api/patients-info/:id` | `GET` | `Patient`, `Admin`, `Receptionist` | Nếu là `Patient`: bắt buộc `profile.ownerId === user.id` | Patient A dùng token của mình xem hồ sơ ID của Patient B | **`403 Forbidden`** |
| `/api/patients-info/update/:id` | `PUT` | `Patient` | Bắt buộc `profile.ownerId === user.id` | Patient A sửa họ tên/SĐT trong hồ sơ của Patient B | **`403 Forbidden`** |
| `/api/patients-info/delete/:id` | `DELETE` | `Patient` | Bắt buộc `profile.ownerId === user.id` | Patient A yêu cầu xóa hồ sơ của Patient B | **`403 Forbidden`** |
| `/api/appointments/:id` | `GET` | `Patient` | Bắt buộc `appointment.patientId === user.id` | Patient A đọc chi tiết lịch hẹn ID của Patient B | **`404 Not Found`** |
| `/api/appointments/cancel/:id` | `PUT` | `Patient` | Bắt buộc `appointment.patientId === user.id` | Patient A hủy lịch khám của Patient B | **`403 Forbidden`** |
| `/api/appointments/:id/join-online` | `POST` | `Patient` | Bắt buộc `appointment.patientId === user.id` & `type === 'ONLINE'` | Patient A lấy link/token phòng khám online của Patient B | **`404 Not Found`** |
| `/api/prescriptions/by-appointment/:appointmentId` | `GET` | `Patient`, `Doctor` | Bệnh nhân: `patientId === user.id` hoặc bệnh nhân trong `patients[]` thuộc `PatientProfile` của mình. Bác sĩ: `doctorId === user.id` | Patient A xem đơn thuốc gắn với lịch hẹn của Patient B; Bác sĩ A xem đơn thuốc lịch phân công cho Bác sĩ B | **`404 Not Found`** (Patient) / **`404 Not Found`** (Doctor) |
| `/api/prescriptions/create/:appointmentId` | `POST` | `Doctor` | Bác sĩ chỉ tạo đơn cho lịch khám của chính mình (`doctorId === user.id`) và trạng thái đang `IN_PROGRESS` | Bác sĩ A tạo đơn thuốc cho ca khám của Bác sĩ B | **`404 Not Found`** |
| `/api/prescriptions/update/:appointmentId` | `PUT` | `Doctor` | Bác sĩ chỉ cập nhật đơn thuốc của chính mình (`doctorId === user.id`) | Bác sĩ A sửa đơn thuốc cho ca khám của Bác sĩ B | **`404 Not Found`** |
| `/api/feedbacks/:id` | `PUT` | `Patient` | Bắt buộc `feedback.userId === user.id` | Patient A sửa bình luận/đánh giá của Patient B | **`403 Forbidden`** |
| `/api/feedbacks/:id` | `DELETE` | `Patient` | Bắt buộc `feedback.userId === user.id` | Patient A xóa đánh giá của Patient B | **`403 Forbidden`** |
| `/api/vouchers/my/:userVoucherId/redeem` | `POST` | `Patient` | Bắt buộc `userVoucher.userId === user.id` | Patient A áp dụng mã voucher thuộc sở hữu của Patient B | **`404 Not Found`** |
| `/api/payment/my` | `GET` | `Patient` | Bắt buộc filter `{ userId: user.id }` | Patient A chỉ xem danh sách giao dịch nộp cọc/thanh toán của chính mình | Không lộ giao dịch người khác |
| `/api/events/my` | `GET` | `Patient` | Bắt buộc filter `{ userId: user.id }` | Patient A chỉ xem danh sách sự kiện mình đã đăng ký | Không lộ thông tin đăng ký người khác |
| `/api/doctors/:id` | `GET` | `Public` | Áp dụng `toPublicDoctor`: Chỉ lộ `id, fullName, specialtyId, specialtyName, degree, description, experience, consultationFee, isVip, avatarUrl, rating` | Khách truy cập không thấy `email`, `phoneNumber`, `password` | Không chứa PII nhạy cảm |
| `/api/doctors/search` | `GET` | `Public` | Chỉ tìm kiếm theo tên bác sĩ (`fullName`), không tìm theo `email`/`phoneNumber` | Truy vấn `?keyword=0901234567` không trả về bác sĩ | Không lộ PII |
| `/api/admin/users/:id/role` | `PUT` | `Admin` | Phải có quyền `ADMIN`. Ghi Audit Log hành vi thay đổi quyền | Bác sĩ/Lễ tân/Bệnh nhân cố tình đổi vai trò tài khoản | **`403 Forbidden`** |
| `/api/admin/users/:id/status` | `PUT` | `Admin`, `Receptionist` | Receptionist chỉ được khóa/mở tài khoản bệnh nhân (`Patient`), không được đụng vào staff | Receptionist cố tình khóa tài khoản Bác sĩ hoặc Admin | **`403 Forbidden`** |

---

## 3. Danh sách Test Chứng minh (Negative IDOR Tests)

File kiểm thử tự động: `backend/tests/security-phase3-idor.test.js`
- Test 1: Bệnh nhân A không thể xem, sửa hoặc xóa hồ sơ người thân của Bệnh nhân B (`PatientProfile`).
- Test 2: Bệnh nhân A không thể xem chi tiết hoặc hủy lịch hẹn của Bệnh nhân B (`Appointment`).
- Test 3: Bệnh nhân A không thể xem đơn thuốc của Bệnh nhân B (`Prescription`).
- Test 4: Bác sĩ A không thể xem hoặc sửa đơn thuốc của lịch khám do Bác sĩ B phụ trách.
- Test 5: Bệnh nhân A không thể tham gia phòng khám online (`join-online`) của Bệnh nhân B.
- Test 6: Bệnh nhân A không thể sử dụng (`redeem`) voucher thuộc về Bệnh nhân B.
- Test 7: Bệnh nhân A không thể sửa hoặc xóa feedback đánh giá của Bệnh nhân B.
- Test 8: Public API bác sĩ (`/api/doctors/:id`, `/api/doctors/search`, `/api/doctors/by-specialty/:id`) tuyệt đối không trả về `email` hoặc `phoneNumber`.

