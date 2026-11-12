import { Outlet } from "react-router-dom";
import DoctorSidebar from "./DoctorSidebar";
import AdminTopbar from "../adminlayouts/AdminTopbar";
import { Container } from "react-bootstrap";
import "../../../styles/layouts.css";
import { useAuth } from "../../../hooks/useAuth";

export default function DoctorLayout() {
  const { user, logout } = useAuth();
  const userName = user?.fullName || "Doctor";
  const onLogout = () => {
    logout();
  };

  return (
    <div className="admin-wrap admin-theme">
      <DoctorSidebar />
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


