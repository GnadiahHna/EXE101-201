import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { loginApi } from '../../api/auth';
import { getErrorMessage } from '../../utils/error';
import '../../styles/login.css';
import { useToast } from '../../components/common/ToastProvider';
import { useAuth } from '../../hooks/useAuth';
import type { PublicLayoutContextType } from '../../components/common/PublicLayout';

interface FireflyData {
  id: number;
  size: number;
  duration: string;
  delay: string;
  x1: string; y1: string;
  x2: string; y2: string;
  x3: string; y3: string;
  x4: string; y4: string;
  x5: string; y5: string;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedOnce, setFailedOnce] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess } = useToast();
  const { login } = useAuth();

  // Lamp State
  const outlet = useOutletContext<PublicLayoutContextType | null>();
  const [localIsOn, setLocalIsOn] = useState(false);
  const isOn = outlet ? outlet.isLampOn : localIsOn;
  const setIsOn = outlet ? outlet.setIsLampOn : setLocalIsOn;
  const [cordPos, setCordPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [fireflies, setFireflies] = useState<FireflyData[]>([]);
  const dragStartRef = useRef({ startX: 0, startY: 0, didMove: false });

  // Generate fireflies when lamp turns ON
  useEffect(() => {
    if (!isOn) {
      setFireflies([]);
      return;
    }

    const random = (min: number, max: number) => Math.random() * (max - min) + min;
    const generated: FireflyData[] = [];

    for (let i = 0; i < 18; i++) {
      generated.push({
        id: i,
        size: random(3, 7),
        duration: `${random(35, 65)}s`,
        delay: `${random(0, 3)}s`,
        x1: `${random(0, 100)}vw`, y1: `${random(0, 100)}vh`,
        x2: `${random(0, 100)}vw`, y2: `${random(0, 100)}vh`,
        x3: `${random(0, 100)}vw`, y3: `${random(0, 100)}vh`,
        x4: `${random(0, 100)}vw`, y4: `${random(0, 100)}vh`,
        x5: `${random(0, 100)}vw`, y5: `${random(0, 100)}vh`,
      });
    }

    setFireflies(generated);
  }, [isOn]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      setError(decodeURIComponent(err));
      // Turn on lamp automatically if error passed from OAuth
      setIsOn(true);
    }
  }, [searchParams]);

  // Pointer Handlers for String Cord
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, didMove: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore in older environments
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rawDx = (e.clientX - dragStartRef.current.startX) * 0.3;
    const rawDy = Math.max(0, e.clientY - dragStartRef.current.startY) * 0.6;
    if (Math.abs(rawDx) > 3 || rawDy > 3) {
      dragStartRef.current.didMove = true;
    }
    const clampedX = Math.max(-35, Math.min(35, rawDx));
    const clampedY = Math.min(180, rawDy);
    setCordPos({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const pulled = cordPos.y > 25 || !dragStartRef.current.didMove;
    setCordPos({ x: 0, y: 0 });

    if (pulled) {
      setIsOn(prev => !prev);
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi({ email, password });
      login(res.user, res.token);

      const role = (res?.user?.userType || res?.user?.userType?.[0] || "").toString();

      showSuccess('Đăng nhập thành công!');
      if (role === "Admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (role === "Patient") {
        navigate("/patient/profile", { replace: true });
      } else if (role === "Doctor") {
        navigate("/doctor/dashboard", { replace: true });
      } else if (role === "Receptionist") {
        navigate("/receptionist/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Đăng nhập thất bại');
      setFailedOnce(true);
    } finally {
      setLoading(false);
    }
  }

  const authBase = (import.meta.env.VITE_API_URL
      ? String(import.meta.env.VITE_API_URL).replace(/\/(?:api)(?:\/v1)?\/?$/, '')
      : 'http://localhost:8080');

  return (
    <div className={`lamp-room ${isOn ? 'on' : ''}`} id="room">
      <div className="room-light" />

      {/* Floating fireflies when light is ON */}
      <div className="fireflies">
        {fireflies.map((f) => (
          <span
            key={f.id}
            className="firefly"
            style={{
              width: `${f.size}px`,
              height: `${f.size}px`,
              // Pass custom CSS variables to keyframe animation
              ['--duration' as string]: f.duration,
              ['--delay' as string]: f.delay,
              ['--x1' as string]: f.x1, ['--y1' as string]: f.y1,
              ['--x2' as string]: f.x2, ['--y2' as string]: f.y2,
              ['--x3' as string]: f.x3, ['--y3' as string]: f.y3,
              ['--x4' as string]: f.x4, ['--y4' as string]: f.y4,
              ['--x5' as string]: f.x5, ['--y5' as string]: f.y5,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Lamp Interactive Section */}
      <section className="lamp-side">
        {/* Toggle prompt */}
        <div
          className="lamp-prompt"
          onClick={() => setIsOn(prev => !prev)}
          title="Bấm hoặc kéo dây để bật đèn"
        >
          <span>Kéo dây để bật đèn</span>
          <i />
        </div>

        <div className="lamp-container">
          <div className="lamp-glow" />
          <div className="lamp-head" />
          <div className="light-beam" />
          <div className="lamp-stem" />
          <div className="lamp-base" />
          <div className="desk-surface" />

          {/* SVG string cord */}
          <svg className="string-svg" aria-hidden="true">
            <path d={`M 0 0 L ${cordPos.x} ${80 + cordPos.y}`} />
          </svg>

          {/* Pull string handle */}
          <div
            className={`string-handle ${isDragging ? 'dragging' : ''}`}
            aria-label={isOn ? "Kéo dây tắt đèn" : "Kéo dây bật đèn"}
            title={isOn ? "Kéo dây để tắt đèn" : "Kéo dây để bật đèn"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              transform: `translate(${cordPos.x}px, ${cordPos.y}px)`,
            }}
          />
        </div>
      </section>

      {/* Login Card Section */}
      <section className="login-side">
        <div className="lamp-login-card">
          <div className="glass-line" />

          <div className="login-heading">
            <h2>Đăng nhập</h2>
            <p>Nhập thông tin để truy cập tài khoản ClinicBooking</p>
          </div>

          <form onSubmit={onSubmit} className="lamp-form">
            <label className="lamp-input-wrap">
              <span className="lamp-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                placeholder="Email đăng nhập"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="lamp-input-wrap">
              <span className="lamp-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="Mật khẩu"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && (
              <div className="lamp-error-block">
                <span style={{ whiteSpace: 'pre-line' }}>{error}</span>
                {failedOnce && (
                  <Link to="/forgot-password" className="btn-forgot-lamp">Quên mật khẩu?</Link>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className="sign-in-btn">
              {loading ? 'Đang xử lý…' : 'Đăng nhập'}
            </button>

            <p className="lamp-auth-footer">
              Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
            </p>

            <div className="lamp-divider">
              <span />
              <b>HOẶC TIẾP TỤC VỚI</b>
              <span />
            </div>

            <div className="lamp-socials">
              <button
                type="button"
                className="lamp-social-btn google"
                onClick={() => (window.location.href = `${authBase}/oauth2/authorization/google`)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                className="lamp-social-btn facebook"
                onClick={() => (window.location.href = `${authBase}/oauth2/authorization/facebook`)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
