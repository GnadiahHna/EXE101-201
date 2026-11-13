import { Navbar, Form, Button } from "react-bootstrap";
import NotificationBell from "../../common/NotificationBell";
import "../../../styles/layouts.css";

type Props = {
  userName?: string;
  onLogout?: () => void;
};

export default function AdminTopbar({ userName = "Administrator", onLogout }: Props) {
  return (
      <Navbar bg="white" className="admin-topbar" expand="md">
        <div className="search">
          <Form.Control className="searchbox" placeholder="Tìm kiếm bệnh nhân, lịch hẹn…" />
        </div>

        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NotificationBell />

          <div className="profile">
            <span className="avatar">{userName?.[0]?.toUpperCase()}</span>
            <span className="name">{userName}</span>
            <Button variant="light" className="logout" onClick={onLogout}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </Navbar> 
  );
}

