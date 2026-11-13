import { NavLink, Link } from 'react-router-dom';
import NavDropdown from 'react-bootstrap/NavDropdown';
import logo from '../../assets/logo.png';
import '../../styles/header.css';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useState } from 'react';
import { fetchSpecialties, type Specialty } from '../../api/specialty';
import NotificationBell from './NotificationBell';

export default function Header(){
  const { user, userType, isAuthenticated, logout } = useAuth();
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSpecs, setLoadingSpecs] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadingSpecs(true);
    fetchSpecialties()
      .then((sp) => { if (alive) setSpecialties(sp); })
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setLoadingSpecs(false); });
    return () => { alive = false; };
  }, []);

  // Close mobile drawer when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.header')) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const linkClass = ({isActive}:{isActive:boolean}) =>
    `navlink ${isActive ? 'active' : ''}`;

  return (
    <header className="header" role="banner">
      <div className="header-inner">
        <Link to="/" className="logo-box" aria-label="Trang chủ" onClick={() => setMenuOpen(false)}>
          <img src={logo} alt="Clinic Logo"/>
        </Link>

        {/* Desktop nav */}
        <nav className="nav nav--desktop" aria-label="Chính">
          <NavLink to="/" end className={linkClass}>Trang chủ</NavLink>
          <NavDropdown title="Chuyên khoa" id="specialty-dropdown">
            {loadingSpecs && (
              <NavDropdown.Item disabled>Đang tải...</NavDropdown.Item>
            )}
            {!loadingSpecs && specialties.length === 0 && (
              <NavDropdown.Item disabled>Không có dữ liệu</NavDropdown.Item>
            )}
            {!loadingSpecs && specialties.map((s) => (
              <NavDropdown.Item as={Link} to={`/specialty/${s.id}`} key={s.id}>
                {s.name}
              </NavDropdown.Item>
            ))}
          </NavDropdown>

          <NavLink to="/doctors" end className={linkClass}>Bác sĩ</NavLink>
          <NavLink to="/services" end className={linkClass}>Dịch vụ</NavLink>
          <NavLink to="/about" end className={linkClass}>Giới thiệu</NavLink>
        </nav>

        {/* Desktop CTA buttons */}
        <div className="login-wrap login-wrap--desktop">
          {!isAuthenticated || userType === 'Guest' ? (
            <>
              <NavLink to="/appointment" className="btn login">Đặt lịch khám</NavLink>
              <NavLink to="/login" className="btn login login--ghost">Đăng nhập</NavLink>
            </>
          ) : (
            <>
              <NotificationBell />
              <NavLink to="/appointment" className="btn login">Đặt lịch khám</NavLink>
              <NavDropdown className="btn login login--ghost" title={user?.fullName || 'User'} id="user-dropdown">
                {userType === 'Doctor' ? (
                  <NavDropdown.Item as={Link} to="/doctor/dashboard">Trang quản trị Bác sĩ</NavDropdown.Item>
                ) : userType === 'Receptionist' ? (
                  <NavDropdown.Item as={Link} to="/receptionist/dashboard">Trang quản trị Lễ tân</NavDropdown.Item>
                ) : userType === 'Admin' ? (
                  <NavDropdown.Item as={Link} to="/admin/dashboard">Trang quản trị Hệ thống</NavDropdown.Item>
                ) : (
                  <NavDropdown.Item as={Link} to="/patient/profile">Xem thông tin</NavDropdown.Item>
                )}
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={() => logout()}>Đăng xuất</NavDropdown.Item>
              </NavDropdown>
            </>
          )}
        </div>

        {/* Mobile Hamburger toggle button */}
        <button
          type="button"
          className={`hamburger ${menuOpen ? 'hamburger--open' : ''}`}
          aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(prev => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile drawer navigation */}
      <div className={`mobile-menu ${menuOpen ? 'mobile-menu--open' : ''}`}>
        <nav className="mobile-nav" aria-label="Menu di động">
          <NavLink to="/" end className={linkClass} onClick={() => setMenuOpen(false)}>
            Trang chủ
          </NavLink>

          <details className="mobile-details">
            <summary className="mobile-summary">Chuyên khoa</summary>
            <div className="mobile-sub">
              {loadingSpecs && <span className="mobile-sub-item text-muted">Đang tải...</span>}
              {!loadingSpecs && specialties.length === 0 && (
                <span className="mobile-sub-item text-muted">Không có dữ liệu</span>
              )}
              {!loadingSpecs && specialties.map((s) => (
                <NavLink
                  key={s.id}
                  to={`/specialty/${s.id}`}
                  className="mobile-sub-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {s.name}
                </NavLink>
              ))}
            </div>
          </details>

          <NavLink to="/doctors" end className={linkClass} onClick={() => setMenuOpen(false)}>
            Bác sĩ
          </NavLink>
          <NavLink to="/services" end className={linkClass} onClick={() => setMenuOpen(false)}>
            Dịch vụ
          </NavLink>
          <NavLink to="/about" end className={linkClass} onClick={() => setMenuOpen(false)}>
            Giới thiệu
          </NavLink>
        </nav>

        <div className="mobile-cta">
          <NavLink
            to="/appointment"
            className="btn login mobile-cta-btn"
            onClick={() => setMenuOpen(false)}
          >
            Đặt lịch khám
          </NavLink>
          {!isAuthenticated || userType === 'Guest' ? (
            <NavLink
              to="/login"
              className="btn login login--ghost mobile-cta-btn"
              onClick={() => setMenuOpen(false)}
            >
              Đăng nhập
            </NavLink>
          ) : (
            <div className="mobile-user-actions">
              <NavLink
                to="/patient/profile"
                className="btn login login--ghost mobile-cta-btn"
                onClick={() => setMenuOpen(false)}
              >
                Hồ sơ ({user?.fullName || 'Tài khoản'})
              </NavLink>
              <button
                type="button"
                className="btn btn-outline-danger mobile-cta-btn"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
