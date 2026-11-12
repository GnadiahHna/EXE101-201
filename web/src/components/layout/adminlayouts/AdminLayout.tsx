// src/layouts/admin/AdminLayout.tsx
import { Container } from "react-bootstrap";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import "../../../styles/layouts.css";
import { useAuth } from "../../../hooks/useAuth";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const userName = user?.fullName || "Administrator";

  const onLogout = () => {
    logout();
  };

  return (
    <div className="admin-wrap admin-theme">
      <AdminSidebar />
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