import { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { forgotPasswordApi } from '../../api/auth';
import { getErrorMessage } from '../../utils/error';
import '../../styles/login.css';
import { useToast } from '../../components/common/ToastProvider';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { showSuccess } = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await forgotPasswordApi({ email });
      setSuccess(true);
      showSuccess('Nếu email tồn tại, đường link đặt lại mật khẩu đã được gửi đến hộp thư của bạn.');
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Không thể gửi email. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <section className="login-page">
        <div className="login-card">
          <div className="success-message">
            <h2>Kiểm tra hộp thư của bạn</h2>
            <p>
              Nếu địa chỉ <strong>{email}</strong> tồn tại trong hệ thống, chúng tôi đã gửi một liên kết an toàn để đặt lại mật khẩu.
            </p>
            <p>Liên kết có hiệu lực trong vòng <strong>15 phút</strong> và chỉ sử dụng được một lần.</p>
            <div style={{ marginTop: '20px' }}>
              <Link to="/login" className="btn-auth" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Quay lại đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h2>Quên mật khẩu</h2>
          <p>Nhập email tài khoản của bạn để nhận liên kết đặt lại mật khẩu.</p>
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}

        <form onSubmit={onSubmit} className="login-form">
          <Input
            label="Email"
            type="email"
            placeholder="example@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          <Button type="submit" variant="primary" disabled={loading} className="btn-auth">
            {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
          </Button>

          <div className="form-footer">
            <Link to="/login" className="link-secondary">Quay lại đăng nhập</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
