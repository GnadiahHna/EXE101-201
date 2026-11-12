# GROUP HEALTH REMOVAL - BASELINE & AUDIT REPORT

- **Thời điểm ghi nhận:** 2026-11-12
- **Mục tiêu:** Lưu trữ hiện trạng hệ thống trước khi gỡ tính năng Khám đoàn (Group Health) để phục vụ so sánh nghiệm thu.

---

## 1. Kết quả kiểm thử trước khi sửa (Baseline)

### Backend (`npm test` -> `node --test tests/*.test.js`)
- **Tổng số test suites:** 72 suites (trong 41 file test)
- **Tổng số tests:** 430 tests
- **Pass:** 408 tests
- **Fail:** 22 tests (Lưu ý: 22 tests fail này nằm ở các file khác chưa thuộc phase này như `fix-1-payment-flow.test.js`, `oauth.test.js`, `uc-pat-12.test.js`, `uc-rec-01.test.js` - không liên quan đến Group Health).
- **Chi tiết các test liên quan trực tiếp đến Group Health:**
  - `backend/tests/uc-adm-06.test.js`: 5 suites, 11 tests -> **11/11 PASS** (Nhóm A - sẽ xóa).
  - `backend/tests/uc-adm-07.test.js`: 6 suites, 6 tests -> **6/6 PASS** (Nhóm A - sẽ xóa).
  - `backend/tests/uc-adm-04.test.js`: dòng 491 có 1 test case `Không cho phép đổi trạng thái sang GROUP_BLOCKED nếu ca đã có lịch hẹn cá nhân (409 Conflict)` -> **PASS** (Nhóm B - sửa đổi).
  - `backend/tests/uc-pat-03.test.js`: test case `2. Filter ACTIVE shifts only: excludes CANCELLED and GROUP_BLOCKED shifts` -> **PASS** (Nhóm B - sửa đổi).

### Web Frontend
- `npm run build` (`tsc -b && vite build`): **Thành công 100%**, hoàn thành trong ~826ms, 0 lỗi TypeScript.
- `npx tsc --noEmit`: **Thành công**, 0 lỗi type.

---

## 2. Bản đồ phân loại phụ thuộc (Nhóm A vs Nhóm B)

| Vị trí / File | Phân loại | Hành động dự kiến |
| :--- | :---: | :--- |
| `backend/src/controllers/adminGroupHealth.controller.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/controllers/doctorGroupHealth.controller.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/services/adminGroupHealth.service.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/services/doctorGroupHealth.service.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/routes/adminGroupHealth.routes.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/routes/doctorGroupHealth.routes.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/models/GroupHealthRequest.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/models/GroupHealthAssignment.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/utils/groupHealthStorage.js` | **Nhóm A** | Xóa hẳn file |
| `backend/src/seed/seedGroupHealth.js` | **Nhóm A** | Xóa hẳn file |
| `backend/tests/uc-adm-06.test.js` | **Nhóm A** | Xóa hẳn file (11 tests chuyên về Group Health) |
| `backend/tests/uc-adm-07.test.js` | **Nhóm A** | Xóa hẳn file (6 tests chuyên về duyệt kết quả Group Health) |
| `web/src/pages/doctor/DoctorGroupHealth.tsx` | **Nhóm A** | Xóa hẳn file |
| `web/src/api/groupHealth.ts` | **Nhóm A** | Xóa hẳn file |
| `backend/src/models/index.js` | **Nhóm A/B** | Bỏ export `GroupHealthRequest`, `GroupHealthAssignment` |
| `backend/src/routes/index.js` | **Nhóm A/B** | Bỏ mount `/admin/group-health` và `/group-health` |
| `web/src/routes/Index.tsx` | **Nhóm A/B** | Bỏ import & route `/doctor/group-health` |
| `web/src/components/layout/doctorlayouts/DoctorSidebar.tsx` | **Nhóm A/B** | Bỏ Nav.Link "Group health" |
| `backend/src/constants/enums.js` | **Nhóm B** | Bỏ `GROUP_BLOCKED` khỏi `SHIFT_STATUSES`, bỏ các enum `GROUP_HEALTH_*` |
| `backend/src/services/doctorShift.service.js` | **Nhóm B** | Bỏ kiểm tra và gán `GROUP_BLOCKED`, giữ nguyên kiểm tra `ACTIVE`/`CANCELLED` |
| `backend/src/services/user.service.js` | **Nhóm B** | Bỏ count `GroupHealthAssignment` khi kiểm tra quan hệ xóa/khóa tài khoản bác sĩ, giữ nguyên các quan hệ y tế khác |
| `backend/tests/uc-adm-04.test.js` | **Nhóm B** | Chuyển test case đổi trạng thái `GROUP_BLOCKED` thành test từ chối trạng thái không hợp lệ (giữ nguyên tổng số test của file) |
| `backend/tests/uc-pat-03.test.js` | **Nhóm B** | Bỏ ca trực phụ `GROUP_BLOCKED`, test chỉ tập trung lọc `ACTIVE` loại bỏ `CANCELLED` (giữ nguyên tổng số test của file) |
| `docs/DECISIONS.md`, `BACKEND_AGENT_GUIDE.md`, `FIELD_MAP.md` | **Nhóm B** | Cập nhật tài liệu kỹ thuật không còn ca `GROUP_BLOCKED` |

