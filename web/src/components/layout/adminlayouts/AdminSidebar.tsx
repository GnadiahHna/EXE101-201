import { Nav } from "react-bootstrap";
import { NavLink } from "react-router-dom";
import "../../../styles/layouts.css";
import logo from '../../../assets/logo.png';

const Icon = {
    overview: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill="currentColor"/></svg>),
    doctor: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 0114 0H5z" fill="currentColor"/></svg>),
    staff: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm8 0c-.33 0-.68.02-1.03.06C16.83 14.13 18 15.35 18 17v3h6v-3c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>),
  tag: (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M20.59 13.41L11 3H3v8l9.59 9.59c.78.78 2.05.78 2.83 0l5.17-5.17c.78-.78.78-2.05 0-2.83zM6 8a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
  ),
  news: (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 4h13v12H4zM17 7h3v9a2 2 0 01-2 2H6v-2h11z" fill="currentColor"/></svg>
  ),
  event: (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 10h5v5H7z" fill="currentColor"/><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H5V9h14v9z" fill="currentColor"/></svg>
  ),
  voucher: (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22 7h-7l-2-2-2 2H4a2 2 0 00-2 2v3a2 2 0 002 2h7l2 2 2-2h5a2 2 0 002-2V9a2 2 0 00-2-2z" fill="currentColor"/></svg>
  ),
  feedback: (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 10H8v-2h6v2zm2-3H8V7h8v2z" fill="currentColor"/></svg>
  ),
};

export default function AdminSidebar() {
  return (
    <aside className="admin-sidebar">
      <div className="brand">
        <img src={logo} alt="Clinic Booking" />
        <span>Clinic Booking</span>
      </div>

      <div >
        <Nav className="menu">
          <Nav.Link as={NavLink} to="/admin/dashboard" end className="item">
            <span className="icon">{Icon.overview}</span>
            Tổng quan
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/doctors" className="item">
            <span className="icon">{Icon.doctor}</span>
            Bác sĩ
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/shifts" className="item">
            <span className="icon">{Icon.event}</span>
            Ca làm việc
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/shift-cancellations" className="item">
            <span className="icon">{Icon.event}</span>
            Duyệt hủy ca
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/receptionists" className="item">
            <span className="icon">{Icon.staff}</span>
            Lễ tân
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/specialties" className="item">
            <span className="icon">{Icon.tag}</span>
            Chuyên khoa
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/news" className="item">
            <span className="icon">{Icon.news}</span>
            Tin tức
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/events" className="item">
            <span className="icon">{Icon.event}</span>
            Sự kiện
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/vouchers" className="item">
            <span className="icon">{Icon.voucher}</span>
            Phiếu giảm giá
          </Nav.Link>
          <Nav.Link as={NavLink} to="/admin/feedbacks" className="item">
            <span className="icon">{Icon.feedback}</span>
            Feedback
          </Nav.Link>
        </Nav>
      </div>
    </aside>
  );
}

