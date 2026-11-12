import { Outlet } from "react-router-dom";
import RecepSidebar from "./RecepSidebar";
import AdminTopbar from "../adminlayouts/AdminTopbar";
import { Container } from "react-bootstrap";
import "../../../styles/layouts.css";
import { useAuth } from "../../../hooks/useAuth";

export default function RecepLayout() {
  const { user, logout } = useAuth();
  const userName = user?.fullName || "Receptionist";
  const onLogout = () => {
    logout();
  };

  return (
    <div className="admin-wrap admin-theme">
      <RecepSidebar />
      <main className="admin-main">
        <AdminTopbar userName={userName} onLogout={onLogout} />
        <div className="admin-body">
          <Container fluid>
            <Outlet />
          </Container>
        </div>
      </main>
    </div>
  );
}



