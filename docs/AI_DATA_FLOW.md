# AI Data Flow & Privacy Minimization Specification

Tài liệu quy định luồng dữ liệu tối thiểu hóa (Data Minimization) gửi tới Google Gemini API trong toàn bộ hệ thống ClinicBooking.

## Bảng tối thiểu hóa dữ liệu theo từng Purpose

| Purpose | Dữ liệu ĐƯỢC PHÉP gửi đi | Dữ liệu BỊ LOẠI BỎ (Triệt để) | Biện pháp ẩn danh & Giảm thiểu |
| :--- | :--- | :--- | :--- |
| **`triage`**<br>(Phân luồng chuyên khoa chatbot) | - Nội dung tin nhắn mô tả triệu chứng của người dùng (tối đa 500 ký tự)<br>- Danh sách chuyên khoa đang kích hoạt (`id`, `name`, `description`, `triageHints`) | - Tên người dùng / Bệnh nhân<br>- Số điện thoại, Email, Số CCCD/CMND<br>- Địa chỉ cư trú<br>- Lịch sử trò chuyện cũ hoặc lượt role `model` giả mạo | - Redact PII bằng Regex (`redactPII`) trước khi gửi.<br>- Chuẩn hóa Unicode, loại bỏ Homoglyphs và thẻ injection.<br>- Bọc input trong thẻ dữ liệu `<user_message>` với `systemInstruction` độc lập. |
| **`intake_summary`**<br>(Tóm tắt tiền khám cho Bác sĩ) | - `narrative`: Triệu chứng tự mô tả (`symptoms`), thời gian xuất hiện (`duration`), ghi chú tiền khám (`notes`)<br>- Tên chuyên khoa của lịch hẹn khám | - Tên, SĐT, Email, CCCD, Địa chỉ<br>- Các dữ kiện y khoa cố định (`facts`): Dị ứng (`allergies`), thuốc đang dùng (`currentMedications`), bệnh nền (`medicalHistory`), chỉ số sinh trắc (chiều cao, cân nặng, BMI). Toàn bộ `facts` do **Server render trực tiếp**, KHÔNG gửi cho LLM để tránh bị lược bỏ hay ảo giác. | - Tuổi chính xác được nhóm thành dải 10 tuổi (ví dụ: "Nhóm tuổi: 20-29 tuổi").<br>- Giới tính chỉ gửi dạng danh mục (Nam/Nữ/Khác).<br>- Bọc trong thẻ `<patient_input>` nghiêm ngặt. |

## Nguyên tắc An toàn & Không lưu trữ
1. **Không log nội dung**: Mọi logger (Pino) chỉ ghi nhận metadata: `purpose`, `model`, `latencyMs`, `usageTokens`, `resultStatus`, `sessionIdHash`. Tuyệt đối không log nội dung chat hoặc văn bản tiền khám.
2. **Schema Validation**: 100% phản hồi từ Gemini API bắt buộc phải qua xác thực `zodSchema`. Nếu vi phạm schema hoặc nội dung không hợp lệ, hệ thống tự động thay thế bằng bản mẫu an toàn do Server sinh ra.

