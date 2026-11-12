import { Nav } from "react-bootstrap";
import { NavLink } from "react-router-dom";
import "../../../styles/layouts.css";
import logo from '../../../assets/logo.png';

const Icon = {
  overview: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill="currentColor"/></svg>),
  calendar: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 10h5v5H7z" fill="currentColor"/><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H5V9h14v9z" fill="currentColor"/></svg>),
  users: (<svg width="18" height="18" viewBox="0 0 24 24"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm8 0c-.33 0-.68.02-1.03.06C16.83 14.13 18 15.35 18 17v3h6v-3c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>),
};

export default function DoctorSidebar() {
  return (
    <aside className="admin-sidebar">
      <div className="brand">
        <img src={logo} alt="Clinic Booking" />
        <span>Clinic Booking</span>
      </div>
      <div>
        <Nav className="menu">
          <Nav.Link as={NavLink} to="/doctor/dashboard" end className="item">
            <span className="icon">{Icon.overview}</span>
            Overview
          </Nav.Link>
          <Nav.Link as={NavLink} to="/doctor/appointments" className="item">
            <span className="icon">{Icon.calendar}</span>
            Appointment
          </Nav.Link>
          <Nav.Link as={NavLink} to="/doctor/patients" className="item">
            <span className="icon">{Icon.users}</span>
            Patient
          </Nav.Link>
          <Nav.Link as={NavLink} to="/doctor/shifts" className="item">
            <span className="icon">{Icon.calendar}</span>
            Shift
          </Nav.Link>
        </Nav>
      </div>
    </aside>
  );
}


