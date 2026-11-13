import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { http } from '../../api/http';

export default function OAuth2Callback() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const hasExchanged = useRef(false);

  useEffect(() => {
    if (hasExchanged.current) return;
    hasExchanged.current = true;

    (async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const legacyToken = searchParams.get('token');

        if (code) {
          // Exchange single-use code for access token & set refresh cookie
          const res = await http.post('/auth/oauth2/exchange', { code });
          const data = res.data?.data;
          if (data?.token) {
            login(
              {
                id: String(data.id),
                fullName: data.fullName,
                userType: data.role,
                role: data.role,
              },
              data.token
            );
            navigate('/', { replace: true });
            return;
          }
        } else if (legacyToken) {
          // Fallback legacy token
          login({ id: '0', userType: 'Patient' }, legacyToken);
          navigate('/', { replace: true });
          return;
        }

        navigate('/login?error=' + encodeURIComponent('Không nhận được mã xác thực từ máy chủ.'), { replace: true });
      } catch (err: unknown) {
        console.error('OAuth2 callback error:', err);
        const msg = err instanceof Error ? err.message : 'Đăng nhập mạng xã hội thất bại';
        navigate('/login?error=' + encodeURIComponent(msg), { replace: true });
      }
    })();
  }, [login, navigate]);

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <p>Đang xử lý đăng nhập tài khoản...</p>
    </div>
  );
}
