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

