import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
  Table,
  Toast,
  ToastContainer,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  fetchAllUsersIncludingDisabled,
  fetchAdminReceptionists,
  banUser,
  unbanUser,
  type AdminUser,
} from '../../api/admin';
import { fetchDoctorsAll, type Doctor } from '../../api/doctor';
import { useAuth } from '../../hooks/useAuth';

type EnhancedUser = AdminUser & {
  role: 'Admin' | 'Doctor' | 'Receptionist' | 'Patient';
  isEnabled: boolean;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [receptionists, setReceptionists] = useState<AdminUser[]>([]);

  // Modal & filter state
  const [showAllUsersModal, setShowAllUsersModal] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Action state
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    show: boolean;
    msg: string;
    variant: 'success' | 'danger';
  }>({
    show: false,
    msg: '',
    variant: 'success',
  });

  const loadDashboardData = async () => {
    try {
      const [allUsersData, doctorsData, receptionistsData] = await Promise.all([
        fetchAllUsersIncludingDisabled(),
        fetchDoctorsAll(),
        fetchAdminReceptionists(),
      ]);
      setUsers(allUsersData ?? []);
      setDoctors(doctorsData ?? []);
      setReceptionists(receptionistsData ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể tải dữ liệu tổng quan';
      setError(message);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    loadDashboardData().finally(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const doctorIds = useMemo(() => new Set(doctors.map((d) => d.id)), [doctors]);
  const receptionistIds = useMemo(() => new Set(receptionists.map((r) => r.id)), [receptionists]);

  const enhancedUsers: EnhancedUser[] = useMemo(() => {
    return users.map((user) => {
      let role: EnhancedUser['role'] = 'Patient';
      if (user.userType === 'Admin' || user.role === 'Admin') {
        role = 'Admin';
      } else if (user.userType === 'Doctor' || doctorIds.has(user.id)) {
        role = 'Doctor';
      } else if (user.userType === 'Receptionist' || receptionistIds.has(user.id)) {
        role = 'Receptionist';
      }

      return {
        ...user,
        role,
        isEnabled: user.isEnabled !== false,
      };
    });
  }, [users, doctorIds, receptionistIds]);

  // Filtered users for the "Xem tất cả tài khoản" modal
  const filteredUsers = useMemo(() => {
    return enhancedUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }
      if (statusFilter === 'active' && !u.isEnabled) {
        return false;
      }
      if (statusFilter === 'locked' && u.isEnabled) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchName = u.fullName?.toLowerCase().includes(kw);
        const matchEmail = u.email?.toLowerCase().includes(kw);
        const matchPhone = u.phoneNumber?.toLowerCase().includes(kw);
        if (!matchName && !matchEmail && !matchPhone) {
          return false;
        }
      }
      return true;
    });
  }, [enhancedUsers, roleFilter, statusFilter, searchKeyword]);

  // Lock / Unlock toggle handler
  const handleToggleLock = async (targetUser: EnhancedUser) => {
    if (actionLoadingId !== null) return;
    if (Number(currentUser?.id) === targetUser.id) {
      setToast({
        show: true,
        msg: 'Không thể tự khóa tài khoản quản trị viên đang đăng nhập!',
        variant: 'danger',
      });
      return;
    }

    const willLock = targetUser.isEnabled;
    setActionLoadingId(targetUser.id);

    try {
      if (willLock) {
        await banUser(targetUser.id);
      } else {
        await unbanUser(targetUser.id);
      }

      // Optimistically update local users state
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isEnabled: !willLock } : u))
      );

      setToast({
        show: true,
        msg: willLock
          ? `Đã khóa tài khoản "${targetUser.fullName}" thành công`
          : `Đã mở khóa tài khoản "${targetUser.fullName}" thành công`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Thao tác thất bại';
      setToast({
        show: true,
        msg: message,
        variant: 'danger',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const stats = [
    {
      label: 'Tổng người dùng',
      value: users.length,
      color: '#e6f0ff',
    },
    {
      label: 'Bác sĩ',
      value: doctors.length,
      color: '#fff4d6',
    },
    {
      label: 'Lễ tân',
      value: receptionists.length,
      color: '#dff7f0',
    },
  ];

  const topUsers = enhancedUsers.slice(0, 7);
  const topDoctors = doctors.slice(0, 7);
  const topReceptionists = receptionists.slice(0, 7);

  const getRoleBadge = (role: EnhancedUser['role']) => {
    switch (role) {
      case 'Admin':
        return <Badge bg="dark">Admin</Badge>;
      case 'Doctor':
        return <Badge bg="primary">Doctor</Badge>;
      case 'Receptionist':
        return <Badge bg="info">Receptionist</Badge>;
      default:
        return <Badge bg="secondary">Patient / Other</Badge>;
    }
  };

  return (
    <div className="vstack gap-4">
      {/* Toast Notification */}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 1100 }}>
        <Toast
          show={toast.show}
          bg={toast.variant}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
          delay={3500}
          autohide
        >
          <Toast.Body className="text-white fw-semibold">{toast.msg}</Toast.Body>
        </Toast>
      </ToastContainer>

      <h2 className="fw-bold">Tổng quan hệ thống</h2>

      {loading && (
        <div className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" /> <span>Đang tải dữ liệu…</span>
        </div>
      )}

      {!loading && (
        <>
          <Row className="g-3">
            {stats.map((stat) => (
              <Col key={stat.label} md={4} sm={12}>
                <Card className="shadow-sm h-100 border-0" style={{ backgroundColor: stat.color }}>
                  <Card.Body className="d-flex flex-column justify-content-between">
                    <div>
                      <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 12 }}>
                        {stat.label}
                      </div>
                      <div className="display-6 fw-bold mt-1">{stat.value}</div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {error && (
            <Alert variant="danger" className="mb-0">
              {error}
            </Alert>
          )}

          <Row className="g-4">
            {/* Người dùng gần đây */}
            <Col xl={12} lg={12}>
              <Card className="shadow-sm border-0 h-100">
                <Card.Header className="d-flex justify-content-between align-items-center py-3">
                  <Card.Title as="h5" className="mb-0">
                    Người dùng gần đây
                  </Card.Title>
                  <div className="d-flex align-items-center gap-3">
                    <Button
                      size="sm"
                      variant="primary"
                      className="d-flex align-items-center gap-1 shadow-sm px-3"
                      onClick={() => setShowAllUsersModal(true)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                      </svg>
                      Xem tất cả tài khoản
                    </Button>
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0 text-decoration-none"
                      onClick={() => navigate('/admin/create-user')}
                    >
                      + Tạo mới
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table responsive hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Tên</th>
                        <th>Email</th>
                        <th>Số điện thoại</th>
                        <th>Loại</th>
                        <th>Trạng thái</th>
                        <th className="text-end">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-3 text-muted">
                            Chưa có dữ liệu người dùng
                          </td>
                        </tr>
                      )}
                      {topUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="fw-medium">{user.fullName}</td>
                          <td>{user.email ?? '—'}</td>
                          <td>{user.phoneNumber ?? '—'}</td>
                          <td>{getRoleBadge(user.role)}</td>
                          <td>
                            {user.isEnabled ? (
                              <Badge bg="success" className="px-2 py-1">Hoạt động</Badge>
                            ) : (
                              <Badge bg="danger" className="px-2 py-1">Bị khóa</Badge>
                            )}
                          </td>
                          <td className="text-end">
                            {Number(currentUser?.id) === user.id ? (
                              <span className="text-muted small">Hiện tại</span>
                            ) : (
                              <Button
                                size="sm"
                                variant={user.isEnabled ? 'outline-danger' : 'outline-success'}
                                disabled={actionLoadingId === user.id}
                                onClick={() => handleToggleLock(user)}
                              >
                                {actionLoadingId === user.id ? (
                                  <Spinner animation="border" size="sm" />
                                ) : user.isEnabled ? (
                                  'Khóa'
                                ) : (
                                  'Mở khóa'
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </Col>

            {/* Bác sĩ nổi bật */}
            <Col xl={6} md={12}>
              <Card className="shadow-sm border-0 h-100">
                <Card.Header className="d-flex justify-content-between align-items-center py-3">
                  <Card.Title as="h5" className="mb-0">
                    Bác sĩ nổi bật
                  </Card.Title>
                  <Button
                    size="sm"
                    variant="link"
                    className="p-0 text-decoration-none"
                    onClick={() => navigate('/admin/doctors')}
                  >
                    Xem tất cả
                  </Button>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table responsive hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Tên</th>
                        <th>Chuyên khoa</th>
                        <th>Kinh nghiệm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDoctors.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-center py-3 text-muted">
                            Chưa có dữ liệu bác sĩ
                          </td>
                        </tr>
                      )}
                      {topDoctors.map((doctor) => (
                        <tr key={doctor.id}>
                          <td className="fw-medium">{doctor.fullName}</td>
                          <td>{doctor.specialtyName ?? '—'}</td>
                          <td>{doctor.experience ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </Col>

            {/* Lễ tân */}
            <Col xl={6} md={12}>
              <Card className="shadow-sm border-0 h-100">
                <Card.Header className="d-flex justify-content-between align-items-center py-3">
                  <Card.Title as="h5" className="mb-0">
                    Lễ tân
                  </Card.Title>
                  <Button
                    size="sm"
                    variant="link"
                    className="p-0 text-decoration-none"
                    onClick={() => navigate('/admin/receptionists')}
                  >
                    Quản lý lễ tân
                  </Button>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table responsive hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Tên</th>
                        <th>Email</th>
                        <th>Số điện thoại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topReceptionists.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-center py-3 text-muted">
                            Chưa có dữ liệu lễ tân
                          </td>
                        </tr>
                      )}
                      {topReceptionists.map((rec) => (
                        <tr key={rec.id}>
                          <td className="fw-medium">{rec.fullName}</td>
                          <td>{rec.email ?? '—'}</td>
                          <td>{rec.phoneNumber ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ================= MODAL: XEM TẤT CẢ TÀI KHOẢN ================= */}
      <Modal
        show={showAllUsersModal}
        onHide={() => setShowAllUsersModal(false)}
        size="xl"
        centered
        scrollable
      >
        <Modal.Header closeButton className="border-bottom">
          <Modal.Title className="d-flex align-items-center gap-2">
            <span>Danh sách tất cả tài khoản</span>
            <Badge bg="primary" pill>
              {filteredUsers.length} / {enhancedUsers.length}
            </Badge>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="p-4">
          {/* Bộ lọc và tìm kiếm */}
          <Row className="g-3 mb-3">
            <Col lg={6} md={12}>
              <InputGroup>
                <InputGroup.Text id="search-addon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm kiếm theo họ tên, email, số điện thoại..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
                {searchKeyword && (
                  <Button variant="outline-secondary" onClick={() => setSearchKeyword('')}>
                    Xóa
                  </Button>
                )}
              </InputGroup>
            </Col>

            <Col lg={3} sm={6}>
              <Form.Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">Tất cả vai trò</option>
                <option value="Patient">Bệnh nhân (Patient)</option>
                <option value="Doctor">Bác sĩ (Doctor)</option>
                <option value="Receptionist">Lễ tân (Receptionist)</option>
                <option value="Admin">Quản trị viên (Admin)</option>
              </Form.Select>
            </Col>

            <Col lg={3} sm={6}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Đang bị khóa</option>
              </Form.Select>
            </Col>
          </Row>

          {/* Bảng danh sách tài khoản */}
          <div className="table-responsive border rounded">
            <Table hover className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 80 }}>ID</th>
                  <th>Họ và tên</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th className="text-end" style={{ width: 140 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted">
                      Không tìm thấy tài khoản nào phù hợp với bộ lọc
                    </td>
                  </tr>
                )}
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="text-muted fw-bold">#{user.id}</td>
                    <td>
                      <div className="fw-medium">{user.fullName}</div>
                      {user.degree && (
                        <div className="text-muted small" style={{ fontSize: 12 }}>
                          {user.degree}
                        </div>
                      )}
                    </td>
                    <td>{user.email ?? '—'}</td>
                    <td>{user.phoneNumber ?? '—'}</td>
                    <td>{getRoleBadge(user.role)}</td>
                    <td>
                      {user.isEnabled ? (
                        <Badge bg="success" className="px-2 py-1">Hoạt động</Badge>
                      ) : (
                        <Badge bg="danger" className="px-2 py-1">Bị khóa</Badge>
                      )}
                    </td>
                    <td className="text-end">
                      {Number(currentUser?.id) === user.id ? (
                        <Badge bg="light" text="dark" className="border">
                          Đang đăng nhập
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={user.isEnabled ? 'outline-danger' : 'outline-success'}
                          disabled={actionLoadingId === user.id}
                          className="px-3"
                          onClick={() => handleToggleLock(user)}
                        >
                          {actionLoadingId === user.id ? (
                            <Spinner animation="border" size="sm" />
                          ) : user.isEnabled ? (
                            'Khóa'
                          ) : (
                            'Mở khóa'
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Modal.Body>

        <Modal.Footer className="border-top justify-content-between">
          <div className="text-muted small">
            Đang hiển thị <strong>{filteredUsers.length}</strong> trên tổng số <strong>{enhancedUsers.length}</strong> tài khoản
          </div>
          <Button variant="secondary" onClick={() => setShowAllUsersModal(false)}>
            Đóng
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
