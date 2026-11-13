# ClinicBooking

Clinic appointment booking system, organised as a monorepo.

| Folder | Stack | Description |
|---|---|---|
| [`backend/`](backend) | Node.js, Express 5, MongoDB (Mongoose) | REST API under `/api` |
| [`web/`](web) | React 19, TypeScript, Vite | Web client |
| [`mobile/`](mobile) | React Native, TypeScript, Expo | Mobile app (iOS / Android) |

## Structure

```
ClinicBooking/
├── backend/
│   └── src/  config · controllers · middlewares · models · routes · services · utils
├── web/
│   └── src/  app · components · config · hooks · pages · services · styles · types
├── mobile/
│   └── src/  app · components · config · hooks · screens · services · types
├── docker-compose.yml        # dev: backend + web + MongoDB
└── docker-compose.prod.yml   # production overrides
```

Both frontends use the `@/` alias for `src/` and talk to the API through
`services/api.ts`.

## Environment variables

Copy the template in each app you run outside Docker:

```bash
cp backend/.env.example backend/.env
cp web/.env.example web/.env
cp mobile/.env.example mobile/.env
```

| App | Variable | Notes |
|---|---|---|
| backend | `MONGO_URI`, `PORT`, `CORS_ORIGINS` | `CORS_ORIGINS` is comma-separated |
| web | `VITE_API_URL` | e.g. `http://localhost:3000/api` |
| mobile | `EXPO_PUBLIC_API_URL` | use your machine's LAN IP, **not** `localhost` (Android emulator: `10.0.2.2`) |

## Run with Docker (backend + web + MongoDB)

```bash
docker compose up --build        # dev with hot reload
docker compose down              # stop
docker compose down -v           # stop and wipe database
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/health

Production build (nginx serves the web app on port 80):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Run the mobile app

The mobile app is **not** dockerized: Expo runs on your machine and connects to
a simulator or the Expo Go app on a physical device.

```bash
cd mobile
npm install
npm start
```

Make sure the backend is running and `EXPO_PUBLIC_API_URL` points to it.

## Run without Docker (Quick 1-Command Start)

Tại thư mục gốc `ClinicBooking`, bạn có thể chạy đồng thời cả **Backend** (`http://localhost:3000`) và **Web** (`http://localhost:5173`) chỉ bằng **1 câu lệnh**:

```bash
# Chạy đồng thời cả Backend và Web (nhấn Ctrl + C để dừng cả 2 cùng lúc)
npm run dev

# Hoặc chạy 1 dòng lệnh trực tiếp từ terminal:
(cd backend && npm run dev) & (cd web && npm run dev) & wait
```

Các lệnh tiện ích khác từ thư mục gốc:

```bash
npm run seed         # Nạp dữ liệu mẫu (Chuyên khoa, Bác sĩ, Bệnh nhân, Voucher, Tin tức...)
npm test             # Chạy bộ kiểm thử tự động của Backend
npm run docker:dev   # Chạy bằng Docker Compose
```

Nếu muốn cài đặt hoặc chạy riêng từng phần:

```bash
cd backend && npm install && npm run dev
cd web     && npm install && npm run dev
```

---

## 📖 Hướng dẫn cài đặt và chạy chi tiết

Dưới đây là hướng dẫn từng bước để cài đặt và chạy toàn bộ hệ thống ClinicBooking trên máy tính.

### 1. Yêu cầu hệ thống (Prerequisites)
- **Node.js**: Phiên bản `>= 20.x`
- **npm**: Đi kèm với Node.js
- **Docker & Docker Compose** (nếu chọn chạy bằng Docker)
- **MongoDB** (nếu chạy local không qua Docker, cổng mặc định `27017`)
- **Expo Go** trên điện thoại hoặc Android Studio / Xcode Simulator (nếu muốn chạy mobile)

---

### 2. Thiết lập biến môi trường (.env)
Trước khi chạy, sao chép các file cấu hình mẫu cho từng phần:

```bash
# Cấu hình cho Backend
cp backend/.env.example backend/.env

# Cấu hình cho Web Frontend
cp web/.env.example web/.env

# Cấu hình cho Mobile App
cp mobile/.env.example mobile/.env
```

> **Lưu ý cấu hình cho Mobile:**
> Trong file `mobile/.env`, biến `EXPO_PUBLIC_API_URL` cần trỏ về IP mạng LAN của máy bạn (ví dụ: `http://192.168.1.15:3000/api`) khi quét QR bằng điện thoại thật, hoặc `http://10.0.2.2:3000/api` nếu dùng máy ảo Android Emulator. Không dùng `localhost`.

---

### 3. Cách 1: Chạy bằng Docker (Khuyến nghị cho Web & Backend)

Cách này sẽ tự động khởi động **MongoDB**, **Backend API** và **Web Frontend**:

```bash
# 1. Khởi động các container (tự động build)
docker compose up --build

# 2. (Chỉ cần chạy lần đầu) Khởi tạo dữ liệu mẫu (Seed Data)
# Mở một terminal mới và chạy:
docker compose exec backend npm run seed
```

**Các cổng và đường dẫn truy cập:**
- **Web App:** [http://localhost:5173](http://localhost:5173)
- **Backend API Health Check:** [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **MongoDB:** `localhost:27017`

**Các lệnh hữu ích khác với Docker:**
```bash
docker compose down        # Dừng toàn bộ services
docker compose down -v     # Dừng và xóa toàn bộ dữ liệu MongoDB
```

---

### 4. Cách 2: Chạy trực tiếp không dùng Docker (Local)

Nếu không dùng Docker, hãy đảm bảo MongoDB service trên máy đang hoạt động.

#### Bước 4.1: Khởi chạy Backend & Khởi tạo dữ liệu
```bash
cd backend
npm install

# Khởi tạo dữ liệu mẫu (Admin, Bác sĩ, Tiếp tân, Bệnh nhân, Chuyên khoa, Tin tức)
npm run seed

# Chạy server ở chế độ dev (nodemon tự động reload khi sửa code)
npm run dev
```
Backend sẽ lắng nghe tại: `http://localhost:3000`

#### Bước 4.2: Khởi chạy Web Frontend
Mở một tab Terminal mới:
```bash
cd web
npm install
npm run dev
```
Giao diện Web sẽ chạy tại: [http://localhost:5173](http://localhost:5173)

---

### 5. Khởi chạy Mobile App (React Native - Expo)

Mobile app chạy riêng biệt qua Expo CLI:

```bash
cd mobile
npm install
npm start
```

Sau khi chạy lệnh:
- **Trên điện thoại thật:** Cài ứng dụng **Expo Go** (App Store / Google Play), kết nối cùng mạng WiFi với máy tính và quét mã QR hiển thị trên Terminal.
- **Android Emulator:** Nhấn phím `a` trên terminal.
- **iOS Simulator (macOS):** Nhấn phím `i` trên terminal.
- **Xem trên trình duyệt:** Nhấn phím `w`.

---

### 6. Tài khoản kiểm thử có sẵn (Seed Accounts)

Sau khi chạy lệnh `npm run seed`, hệ thống đã có sẵn các tài khoản với mật khẩu mặc định là: **`123456`**

| Vai trò (Role) | Email đăng nhập | Mật khẩu | Mô tả |
|---|---|---|---|
| **Admin** | `admin@clinicbooking.com` | `123456` | Quản trị hệ thống, duyệt tài khoản, thống kê |
| **Tiếp tân (Receptionist)** | `receptionist1@gmail.com` | `123456` | Tiếp nhận và quản lý lịch hẹn |
| **Bác sĩ (Doctor)** | `bacsi.demo01@example.com` | `123456` | Bác sĩ CKII Nội tổng quát - Tôn Thất Việt Hùng |
| **Bác sĩ (Doctor)** | `bacsi.demo02@example.com` | `123456` | Bác sĩ Tim mạch - Lâm Trọng Cơ |
| **Bệnh nhân (Patient)** | `miraisan2512@gmail.com` | `123456` | Bệnh nhân mẫu Huy Quoc |

---

## 7. Quality Gates (CI/CD & Git Hooks)

Dự án thiết lập hệ thống kiểm soát chất lượng nhiều lớp nhằm ngăn chặn commit mã lỗi, rò rỉ secret hoặc làm hỏng bản build production:

### Local Git Hooks (Husky)
- **Pre-commit hook (`.husky/pre-commit`):**
  - Quét an toàn tự động: Chặn commit các file nhạy cảm (`.env`, `.env.*` ngoại trừ `.env.example`), khóa bí mật/chứng chỉ (`*.pem`, `*.key`, `id_rsa*`, `*.p12`), file dump `.sql` ngoài `docs/`, và file kích thước vượt quá 5MB.
  - Tự động chạy `gitleaks protect --staged` (nếu máy có cài `gitleaks`).
  - Chạy `lint-staged`: Tự động kiểm tra cú pháp backend bằng `node --check` và lint web bằng `oxlint`.
- **Pre-push hook (`.husky/pre-push`):**
  - Chặn push trực tiếp lên nhánh được bảo vệ (`main`/`master`). Yêu cầu tạo nhánh tính năng và mở Pull Request (override khẩn cấp: `ALLOW_MAIN_PUSH=true git push`).
  - Tự động thực thi `npm run ci:local` (`node scripts/ci-local.mjs`).

### Lệnh kiểm tra chất lượng tại Local (`ci-local`)
Chạy toàn bộ pipeline kiểm tra trước khi push mã nguồn:
```bash
npm run ci:local
```
Pipeline thực hiện tuần tự:
1. **Backend:** Kiểm tra cú pháp (`npm run lint`), chạy bộ test cốt lõi và kiểm tra bảo mật fail-fast.
2. **Web:** Kiểm tra lint (`oxlint`), kiểm tra kiểu (`npx tsc --noEmit`), và thử nghiệm build production (`npm run build`).
3. **Bảo mật:** Quét lỗ hổng dependency production mức High/Critical (`npm audit --omit=dev --audit-level=high`).
4. **Docker:** Xác thực cấu hình `docker compose config -q` (nếu local có cài Docker).

**Các cờ bỏ qua khi cần thiết (Environment Flags):**
- `SKIP_TESTS=1 npm run ci:local`: Bỏ qua bước chạy test backend.
- `SKIP_AUDIT=1 npm run ci:local`: Bỏ qua bước kiểm tra npm audit.
- `SKIP_BUILD=1 npm run ci:local`: Bỏ qua bước build web.
- `TEST_FILTER="tests/xyz.test.js" npm run ci:local`: Chỉ định file test chạy trong local CI.
- `RUN_ALL_TESTS=1 npm run ci:local`: Chạy toàn bộ các test file trong `backend/tests/`.

### GitHub Actions CI Workflow (`.github/workflows/ci.yml`)
Chạy tự động khi có PR hoặc Push vào nhánh `main`:
- **backend:** Khởi động MongoDB service container, chạy `npm ci`, lint và security/core test suite.
- **web:** `npm ci`, `oxlint`, `tsc --noEmit`, `npm run build`, upload dist artifact (lưu 7 ngày).
- **security:** Quét file `.env` bị lộ trong git, quét `npm audit` production, chạy official `gitleaks/gitleaks-action`.
- **docker:** Xác thực `docker compose config -q`, build thử Docker image backend & web (`push: false`).
- **ci-success:** Tổng hợp kết quả các jobs thành gate duy nhất để cấu hình Branch Protection Rule.

---

## 8. Các Tính Năng & Nghiệp Vụ Nổi Bật (Key Features & AI Capabilities)

Hệ thống ClinicBooking được thiết kế chuẩn mực y tế, bảo mật dữ liệu PII và tích hợp công nghệ AI Gemini phục vụ đắc lực cho cả bệnh nhân, nhân viên lễ tân và bác sĩ điều trị:

### 8.1. Trợ Lý AI Gemini Triage v2 & Điều Hướng Y Tế (Chatbot)
- **Cổng phân luồng 2 lớp (Dynamic Specialty Gate):**
  - **Lớp 1 (Quy tắc cứng, tốc độ cao):** Chuẩn hóa tiếng Việt bỏ dấu, nhận diện tín hiệu prompt injection, phát hiện khẩn cấp 115 cứng TRƯỚC khi gọi LLM, negative cache bằng SHA-256 trong 10 phút.
  - **Lớp 2 (Gemini Structured Output qua Zod Schema):** Model AI chỉ phân loại triệu chứng vào các chuyên khoa có thực tế trong cơ sở dữ liệu phòng khám (`triageHints`). Nếu triệu chứng thuộc chuyên khoa phòng khám không có hoặc câu hỏi lạc đề, hệ thống dùng câu trả lời an toàn do server định nghĩa sẵn và gợi ý đặt khám Nội tổng quát.
- **Bảo vệ quyền riêng tư (PII Hygiene):** Tự động che giấu (redact) số điện thoại, email, CCCD/CMND trước khi gửi dữ liệu sang Gemini API.
- **Failover đa model & Hạn mức ngân sách:** Tự động chuyển đổi giữa `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash`; giới hạn budget gọi AI hàng ngày qua MongoDB atomic counter (`ai_usage`).

### 8.2. Tóm Tắt Tiền Khám Y Tế Cho Bác Sĩ (Medical Intake Summary v2)
- **Tách bạch Facts & Narrative:**
  - **Facts lâm sàng:** Dị ứng thuốc, bệnh lý nền, thuốc đang dùng, chiều cao/cân nặng được server render trực tiếp từ database (đảm bảo không bao giờ bị AI ảo giác).
  - **AI Narrative:** Tóm tắt diễn biến triệu chứng của bệnh nhân, thời gian khởi phát và tự động gợi ý 2-3 câu hỏi khai thác bệnh sử cho bác sĩ.
- **Hỗ trợ tiền khám nhiều người:** Khi đặt lịch cho 2 người trở lên, hệ thống tự động bóc tách và tóm tắt chi tiết theo từng người (`Bệnh nhân 1`, `Bệnh nhân 2`).
- **Giao diện tinh gọn:** Khung tiền khám trong modal chi tiết của Bác sĩ tự động ẩn text thô khi đã có bản tóm tắt AI, kèm nút `🔄 Tóm tắt lại` và badge cảnh báo dị ứng đỏ rực rỡ.

### 8.3. Đặt Lịch & Đổi Lịch Nhiều Người (Multi-Patient Booking & Reschedule)
- **Đặt lịch nhóm:** Khách hàng có thể đặt lịch cho người thân (tối đa 4 người/ca khám). Hệ thống sẽ tự động khóa liên tiếp $N$ slots trong ca trực.
- **Bảo toàn slot khi đổi lịch (Reschedule):** Lễ tân/Bác sĩ khi đổi ca cho lịch hẹn $N$ người sẽ tự động tìm kiếm cụm $N$ slot liên tiếp khả dụng trong ca trực mới, chuyển trạng thái `BOOKED` cho toàn bộ các slot mới và giải phóng đầy đủ các slot ở ca cũ.
- **Bảng ca làm việc bác sĩ:** Tự động phân rã hiển thị từng mốc giờ tương ứng với từng người khám (ví dụ `18:00 DHA`, `18:20 Anh`).

### 8.4. Quản Lý Ca Trực & An Toàn Kê Đơn Bác Sĩ
- **Chặn hủy ca quá khứ:** Chặn nghiêm ngặt việc gửi yêu cầu hủy ca cho các ca trực trong quá khứ hoặc đã kết thúc (`shift.date < today` hoặc `shift.date === today && shift.endTime <= currentTime`).
- **Quản lý Hồ sơ bệnh nhân (`PatientProfile`):** Cho phép cập nhật thông tin y tế chuyên sâu (Dị ứng thuốc/thực phẩm, Tiền sử bệnh nền, Chiều cao, Cân nặng).
- **Cảnh báo tương tác dị ứng thuốc:** Tự động đối chiếu đơn thuốc bác sĩ kê với tiền sử dị ứng của bệnh nhân, chặn kê đơn khi có dị ứng chéo (cross-reactive) nếu không có ghi đè y khoa hợp lệ.

---

## 9. Cấu Hình Biến Môi Trường Nâng Cao Cho AI (AI Configuration)

Trong file `backend/.env`, có thể cấu hình các thông số sau:

| Biến môi trường | Mặc định | Mô tả |
|---|---|---|
| `GEMINI_API_KEY` | *(Tùy chọn)* | API key của Google AI Studio để kích hoạt Gemini |
| `AI_PROCESSING_ENABLED` | `true` | Bật/tắt xử lý AI (khi tắt sẽ dùng bộ quy tắc Rule-based fallback) |
| `DEMO_MODE` | `true` | Bật disclaimer chế độ thử nghiệm học thuật trên giao diện |
| `GEMINI_MODELS` | `gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.8-flash` | Danh sách model ưu tiên tự động failover |
| `CHAT_DAILY_BUDGET` | `500` | Số lượt gọi Gemini tối đa mỗi ngày cho Chatbot Triage |
| `INTAKE_SUMMARY_DAILY_BUDGET` | `200` | Số lượt gọi Gemini tối đa mỗi ngày cho Tóm tắt tiền khám |



