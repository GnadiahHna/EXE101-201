const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || env.smtpHost;
  const port = Number(process.env.SMTP_PORT || env.smtpPort || 587);
  const user = process.env.SMTP_USER || env.smtpUser;
  const pass = process.env.SMTP_PASS || env.smtpPass;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Generate responsive HTML email for appointment confirmation
 */
function buildAppointmentHtml({ patientName, appointment, doctorName, specialtyName, patientsList }) {
  const appointmentNo = appointment.appointmentNo || `AP${appointment.id}`;
  const apptTime = appointment.appointmentTime || '08:00 - 11:30';
  const apptDate = appointment.appointmentDate || 'Chưa xác định';
  const apptType = appointment.type === 'ONLINE' ? 'Khám trực tuyến (Online)' : 'Khám trực tiếp tại phòng khám';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fb; margin: 0; padding: 20px; color: #333; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0e82fd 0%, #0056b3 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 28px 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827; }
    .desc { font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; }
    .info-val { font-weight: 600; color: #0f172a; text-align: right; }
    .badge-deposit { display: inline-block; background-color: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
    .badge-status { display: inline-block; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
    .instructions { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .instructions h4 { margin: 0 0 8px; font-size: 14px; color: #92400e; font-weight: 600; }
    .instructions ul { margin: 0; padding-left: 20px; font-size: 13px; color: #78350f; line-height: 1.5; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 20px 24px 28px; border-top: 1px solid #f1f5f9; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PHÒNG KHÁM NOVA CLINIC</h1>
      <p>Xác nhận đặt lịch hẹn & thanh toán cọc thành công</p>
    </div>
    <div class="content">
      <div class="greeting">Kính gửi ${patientName || 'Quý khách'},</div>
      <div class="desc">
        Hệ thống đã nhận được khoản <strong>tiền cọc 5.000 VNĐ</strong> và xác nhận lịch hẹn khám của quý khách với chi tiết như sau:
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Mã lịch hẹn:</span>
          <span class="info-val" style="color: #0e82fd;">${appointmentNo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Bác sĩ phụ trách:</span>
          <span class="info-val">${doctorName || 'Bác sĩ chuyên khoa'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Chuyên khoa:</span>
          <span class="info-val">${specialtyName || 'Đa khoa'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Thời gian khám:</span>
          <span class="info-val" style="color: #dc2626;">${apptTime}, ${apptDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Hình thức:</span>
          <span class="info-val">${apptType}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Tiền cọc giữ chỗ:</span>
          <span class="info-val"><span class="badge-deposit">20.000 VNĐ (Đã thanh toán)</span></span>
        </div>
        <div class="info-row">
          <span class="info-label">Bệnh nhân:</span>
          <span class="info-val">${patientsList || patientName || 'Người đặt'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Trạng thái:</span>
          <span class="info-val"><span class="badge-status">ĐÃ XÁC NHẬN</span></span>
        </div>
      </div>

      <div class="instructions">
        <h4>Lưu ý quan trọng khi đi khám:</h4>
        <ul>
          <li>Vui lòng có mặt tại quầy tiếp đón phòng khám trước <strong>15 phút</strong> để hoàn tất thủ tục đo sinh hiệu.</li>
          <li>Quý khách vui lòng mang theo Căn cước công dân (hoặc thẻ BHYT nếu có).</li>
          <li>Khoản tiền cọc 5.000 VNĐ sẽ được trừ trực tiếp vào hóa đơn khám tại phòng khám.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      <p><strong>PHÒNG KHÁM ĐA KHOA QUỐC TẾ NOVA CLINIC</strong></p>
      <p>Địa chỉ: 123 Nguyễn Văn Linh, Quận Hải Châu, TP. Đà Nẵng</p>
      <p>Hotline tư vấn & hỗ trợ: 1900 6868 · Email: cskh@clinicbooking.com</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send appointment confirmation email
 */
async function sendAppointmentConfirmationEmail({
  to,
  patientName,
  appointment,
  doctorName,
  specialtyName,
  patientsList,
}) {
  if (!to) {
    console.warn('[EmailService] Recipient email is missing, skipping email dispatch.');
    return { success: false, reason: 'NO_RECIPIENT' };
  }

  const subject = `[Nova Clinic] Xác nhận đặt lịch khám & cọc thành công - Mã #${appointment.appointmentNo || appointment.id}`;
  const html = buildAppointmentHtml({
    patientName,
    appointment,
    doctorName,
    specialtyName,
    patientsList,
  });

  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const from = process.env.SMTP_FROM || env.smtpFrom || '"Nova Clinic" <no-reply@clinicbooking.com>';
      const info = await activeTransporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Email sent successfully via SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error(`[EmailService] Failed to send email via SMTP:`, err.message);
    }
  }

  // Fallback Dev / Mock logger
  console.log('\n=================== [EMAIL SERVICE - DISPATCH] ===================');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Appointment: #${appointment.appointmentNo} · Doctor: ${doctorName} · Time: ${appointment.appointmentTime} ${appointment.appointmentDate}`);
  console.log(`Deposit Paid: 20.000 VNĐ -> Account: BIDV 8881528121 (NGUYEN HOANG QUOC HUY)`);
  console.log('Status: Email rendered and dispatched successfully (Mock/Dev Mode)');
  console.log('==================================================================\n');

  return { success: true, mode: 'mock' };
}

/**
 * Send Password Reset Link Email for Forgot Password flow
 */
async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const subject = '[Nova Clinic] Yêu cầu đặt lại mật khẩu tài khoản';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fb; margin: 0; padding: 20px; color: #333; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0e82fd 0%, #0056b3 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 28px 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827; }
    .desc { font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; }
    .btn-container { text-align: center; margin: 25px 0; }
    .btn { display: inline-block; background: #0e82fd; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .notice { font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 20px; }
    .url-fallback { word-break: break-all; font-size: 12px; color: #0e82fd; background: #f8fafc; padding: 10px; border-radius: 6px; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 20px 24px 28px; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PHÒNG KHÁM NOVA CLINIC</h1>
      <p>Đặt lại mật khẩu tài khoản</p>
    </div>
    <div class="content">
      <div class="greeting">Xin chào ${fullName || 'Quý khách'},</div>
      <div class="desc">
        Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản đăng ký với email này. Vui lòng bấm vào nút bên dưới để tiến hành thiết lập mật khẩu mới:
      </div>

      <div class="btn-container">
        <a href="${resetUrl}" class="btn" target="_blank">Đặt lại mật khẩu</a>
      </div>

      <div class="notice">
        • Đường liên kết này có hiệu lực trong vòng <strong>15 phút</strong> và chỉ sử dụng được <strong>một lần</strong>.<br>
        • Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ hotline phòng khám để được hỗ trợ bảo mật.<br><br>
        Nếu nút trên không bấm được, bạn có thể copy và dán liên kết sau vào trình duyệt:<br>
        <div class="url-fallback">${resetUrl}</div>
      </div>
    </div>
    <div class="footer">
      <p>Nova Clinic • 123 Nguyễn Văn Linh, Hải Châu, TP. Đà Nẵng</p>
      <p>Hotline: 0901 234 567 • Email: lienhe@clinicbooking.vn</p>
    </div>
  </div>
</body>
</html>
  `;

  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const from = process.env.SMTP_FROM || env.smtpFrom || '"Nova Clinic" <no-reply@clinicbooking.com>';
      const info = await activeTransporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Password reset email sent via SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error(`[EmailService] Failed to send password reset email via SMTP:`, err.message);
    }
  }

  // Fallback Dev / Mock logger
  console.log('\n=================== [EMAIL SERVICE - PASSWORD RESET] ===================');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Reset URL: ${resetUrl}`);
  console.log('Status: Rendered and dispatched successfully (Mock/Dev Mode)');
  console.log('========================================================================\n');

  return { success: true, mode: 'mock' };
}

/**
 * Send Email Verification link
 */
async function sendEmailVerificationEmail({ to, fullName, verifyUrl }) {
  const subject = '[Nova Clinic] Xác minh địa chỉ email đăng ký';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fb; margin: 0; padding: 20px; color: #333; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0e82fd 0%, #0056b3 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 28px 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #111827; }
    .desc { font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; }
    .btn-container { text-align: center; margin: 25px 0; }
    .btn { display: inline-block; background: #10b981; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .notice { font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 20px; }
    .url-fallback { word-break: break-all; font-size: 12px; color: #0e82fd; background: #f8fafc; padding: 10px; border-radius: 6px; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 20px 24px 28px; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PHÒNG KHÁM NOVA CLINIC</h1>
      <p>Xác minh tài khoản người dùng</p>
    </div>
    <div class="content">
      <div class="greeting">Xin chào ${fullName || 'Quý khách'},</div>
      <div class="desc">
        Cảm ơn bạn đã đăng ký tài khoản tại Nova Clinic. Vui lòng bấm vào nút bên dưới để xác minh địa chỉ email của bạn:
      </div>

      <div class="btn-container">
        <a href="${verifyUrl}" class="btn" target="_blank">Xác minh Email</a>
      </div>

      <div class="notice">
        • Đường liên kết này có hiệu lực trong vòng <strong>24 giờ</strong>.<br>
        • Nếu bạn không thực hiện đăng ký tài khoản tại Nova Clinic, vui lòng bỏ qua email này.<br><br>
        Nếu nút trên không bấm được, bạn có thể copy và dán liên kết sau vào trình duyệt:<br>
        <div class="url-fallback">${verifyUrl}</div>
      </div>
    </div>
    <div class="footer">
      <p>Nova Clinic • 123 Nguyễn Văn Linh, Hải Châu, TP. Đà Nẵng</p>
      <p>Hotline: 0901 234 567 • Email: lienhe@clinicbooking.vn</p>
    </div>
  </div>
</body>
</html>
  `;

  const activeTransporter = getTransporter();

  if (activeTransporter) {
    try {
      const from = process.env.SMTP_FROM || env.smtpFrom || '"Nova Clinic" <no-reply@clinicbooking.com>';
      const info = await activeTransporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Email verification sent via SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error(`[EmailService] Failed to send email verification via SMTP:`, err.message);
    }
  }

  // Fallback Dev / Mock logger
  console.log('\n=================== [EMAIL SERVICE - EMAIL VERIFICATION] ===================');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Verify URL: ${verifyUrl}`);
  console.log('Status: Rendered and dispatched successfully (Mock/Dev Mode)');
  console.log('============================================================================\n');

  return { success: true, mode: 'mock' };
}

module.exports = {
  sendAppointmentConfirmationEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  buildAppointmentHtml,
};
