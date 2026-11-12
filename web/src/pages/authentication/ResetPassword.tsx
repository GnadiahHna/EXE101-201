import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { resetPasswordApi } from '../../api/auth';
import { getErrorMessage } from '../../utils/error';
import '../../styles/login.css';
import { useToast } from '../../components/common/ToastProvider';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [form, setForm] = useState({
    token: token,
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  useEffect(() => {
    if (token) {
      setForm((prev) => ({ ...prev, token }));
    }
  }, [token]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.token) {
      setError('Đường link đặt lại mật khẩu không hợp lệ hoặc thiếu mã token.');
      return;
    }

    if (form.newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và chữ số');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi({
        token: form.token,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });

      setSuccess(true);
      showSuccess('Đặt lại mật khẩu thành công! Vui lòng đăng nhập.');
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <section className="login-page">
        <div className="login-card">
          <div className="success-message">
            <h2>Đặt lại mật khẩu thành công!</h2>
            <p>Mật khẩu mới của bạn đã được cập nhật an toàn và các phiên đăng nhập cũ đã được thu hồi.</p>
            <p>Hệ thống đang chuyển hướng bạn về trang đăng nhập...</p>
            <div style={{ marginTop: '20px' }}>
              <Link to="/login" className="btn-auth" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Đăng nhập ngay
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
          <h2>Đặt lại mật khẩu</h2>
          <p>Nhập mật khẩu mới cho tài khoản của bạn</p>
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}

        {!form.token && (
          <div className="alert alert-warning">
            Cảnh báo: Không tìm thấy token xác thực trong đường dẫn URL. Vui lòng mở lại liên kết từ email.
          </div>
        )}

        <form onSubmit={onSubmit} className="login-form">
          <Input
            label="Mật khẩu mới"
            type="password"
            name="newPassword"
            placeholder="Tối thiểu 8 ký tự (chữ hoa, thường, số)"
            value={form.newPassword}
            onChange={onChange}
            required
            autoFocus
          />

          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            name="confirmPassword"
            placeholder="Nhập lại mật khẩu mới"
            value={form.confirmPassword}
            onChange={onChange}
            required
          />

          <Button type="submit" variant="primary" disabled={loading || !form.token} className="btn-auth">
            {loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
          </Button>

          <div className="form-footer">
            <Link to="/login" className="link-secondary">Quay lại đăng nhập</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
