import { useEffect, useState } from "react";
import { Card, Col, Row, Spinner, Modal, Table, Form, InputGroup, Badge } from "react-bootstrap";
import { Link } from "react-router-dom";
import { fetchAllShiftsByDate } from "../../api/shift";
import { fetchAllByDate, toISODateInput } from "../../api/appointment";
import { fetchReceptionEvents } from "../../api/receptionist";
import { fetchVouchers } from "../../api/voucher";
import { fetchAdminPatients, fetchAllUsersIncludingDisabled, fetchDisabledUsers, unbanUser, type AdminUser } from "../../api/admin";
import "../../styles/recep-dashboard.css";

// Component hiển thị Total Patients ở góc phải trên
function TotalPatientsCircle({ count }: { count: number }) {
  return (
    <div className="total-users-circle">
      <div className="total-users-circle__content">
        <div className="total-users-circle__label">Tổng bệnh nhân</div>
        <div className="total-users-circle__value">{count.toLocaleString()}</div>
      </div>
    </div>
  );
}

// Component card quản lý
function ManagementCard({
  title,
  description,
  icon,
  link,
  onClick,
  count,
  loading,
  countLabel = "items",
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  link?: string;
  onClick?: () => void;
  count?: number;
  loading?: boolean;
  countLabel?: string;
}) {
  const cardContent = (
    <Card.Body>
      <div className="management-card__icon">{icon}</div>
      <div className="management-card__content">
        <h5 className="management-card__title">{title}</h5>
        <p className="management-card__description">{description}</p>
        {loading ? (
          <div className="management-card__count">
            <Spinner animation="border" size="sm" />
          </div>
        ) : count !== undefined ? (
          <div className="management-card__count">
            {count.toLocaleString()} {countLabel}
          </div>
        ) : null}
      </div>
    </Card.Body>
  );

  if (onClick) {
    return (
      <Card className="management-card" style={{ cursor: "pointer" }} onClick={onClick}>
        {cardContent}
      </Card>
    );
  }

  return (
    <Card className="management-card" as={Link} to={link || "#"}>
      {cardContent}
    </Card>
  );
}

// Icons
const IconShift = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H5V9h14v9z" fill="currentColor"/>
    <path d="M7 11h5v5H7z" fill="currentColor"/>
  </svg>
);

const IconUsers = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" fill="currentColor"/>
  </svg>
);

const IconAppointment = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H5V9h14v9z" fill="currentColor"/>
    <path d="M7 11h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z" fill="currentColor"/>
  </svg>
);

const IconEvent = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 12h-5v5h5v-5zM16 1v2M8 1v2m-5 4h18M3 5h18a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" fill="none"/>
  </svg>
);

const IconVoucher = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 5h-8l-1-1h-2l-1 1H3v6h1a2 2 0 010 4H3v6h16l1 1h2l1-1h2v-6h-1a2 2 0 010-4h1V5z" fill="currentColor"/>
  </svg>
);

const IconLocked = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10z" fill="currentColor"/>
  </svg>
);

type PatientWithStatus = AdminUser & {
  isEnabled?: boolean;
};

export default function RecepDashboard() {
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [stats, setStats] = useState({
    shifts: undefined as number | undefined,
    appointments: undefined as number | undefined,
    events: undefined as number | undefined,
    vouchers: undefined as number | undefined,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Modal state for active patients
  const [showPatientsModal, setShowPatientsModal] = useState(false);
  const [patients, setPatients] = useState<PatientWithStatus[]>([]);
  const [loadingPatientsList, setLoadingPatientsList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal state for disabled patients
  const [showDisabledModal, setShowDisabledModal] = useState(false);
  const [disabledPatients, setDisabledPatients] = useState<AdminUser[]>([]);
  const [loadingDisabledList, setLoadingDisabledList] = useState(false);
  const [searchTermDisabled, setSearchTermDisabled] = useState("");
  const [unbanningUserId, setUnbanningUserId] = useState<number | null>(null);

  // Modal state for confirm unban
  const [showUnbanConfirmModal, setShowUnbanConfirmModal] = useState(false);
  const [patientToUnban, setPatientToUnban] = useState<AdminUser | null>(null);

  // Load total patients
  useEffect(() => {
    const loadTotalPatients = async () => {
      try {
        setLoadingPatients(true);
        
        // Receptionist có thể không có quyền /admin/patients
        // Nên dùng /admin/all-including-disabled và filter patients
        let patientsCount = 0;
        
        try {
          // Thử /admin/patients trước (nếu có quyền Admin)
          const patientsList = await fetchAdminPatients();
          patientsCount = patientsList.length;
          console.log("Loaded patients from /admin/patients:", patientsCount);
        } catch (err) {
          console.warn("Cannot access /admin/patients (may need Admin role), trying /admin/all-including-disabled...", err);
          
          // Fallback: dùng /admin/all-including-disabled (Receptionist có quyền)
          try {
            const allUsers = await fetchAllUsersIncludingDisabled();
            console.log("Loaded all users including disabled:", allUsers.length);
            
            // Filter để lấy patients (không có degree/description/experience - đặc điểm của patients)
            // Và chỉ đếm active patients (isEnabled !== false)
            const patients = allUsers.filter(u => 
              !u.degree && 
              !u.description && 
              !u.experience &&
              (u.isEnabled === undefined || u.isEnabled === true) // Chỉ đếm active patients
            );
            patientsCount = patients.length;
            console.log("Filtered patients from all users:", patientsCount);
          } catch (err2) {
            console.error("Failed to load from /admin/all-including-disabled:", err2);
            patientsCount = 0;
          }
        }
        
        setTotalPatients(patientsCount);
      } catch (err) {
        console.error("Unexpected error loading total patients:", err);
        setTotalPatients(0);
      } finally {
        setLoadingPatients(false);
      }
    };

    void loadTotalPatients();
  }, []);

  // Load all stats from API
  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoadingStats(true);
        const today = toISODateInput(new Date());

        // Load tất cả stats song song
        const [shiftsResult, appointmentsResult, eventsResult, vouchersResult, disabledResult] = await Promise.allSettled([
          // 1. Load shifts cho ngày hôm nay
          fetchAllShiftsByDate(today).catch(() => []),
          
          // 2. Load appointments cho ngày hôm nay
          fetchAllByDate(today).then(res => res.ok && res.data ? res.data : []).catch(() => []),
          
          // 3. Load events
          fetchReceptionEvents().catch(() => []),
          
          // 4. Load vouchers
          fetchVouchers().catch(() => []),
          
          // 5. Load disabled users to count disabled patients
          fetchDisabledUsers().catch(() => []),
        ]);

        // Xử lý kết quả
        const shifts = shiftsResult.status === 'fulfilled' ? shiftsResult.value : [];
        const appointments = appointmentsResult.status === 'fulfilled' ? appointmentsResult.value : [];
        const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
        const vouchers = vouchersResult.status === 'fulfilled' ? vouchersResult.value : [];
        const allDisabled = disabledResult.status === 'fulfilled' ? disabledResult.value : [];

        // Filter disabled patients
        const disabledPatientsList = Array.isArray(allDisabled) 
          ? allDisabled.filter(u => !u.degree && !u.description && !u.experience)
          : [];
        
        setDisabledPatients(disabledPatientsList);

        setStats({
          shifts: Array.isArray(shifts) ? shifts.length : 0,
          appointments: Array.isArray(appointments) ? appointments.length : 0,
          events: Array.isArray(events) ? events.length : 0,
          vouchers: Array.isArray(vouchers) ? vouchers.length : 0,
        });
      } catch (err) {
        console.error("Failed to load stats:", err);
        // Giữ nguyên giá trị undefined để hiển thị loading
      } finally {
        setLoadingStats(false);
      }
    };

    void loadStats();
  }, []);

  // Load patients when modal opens (including disabled)
  const handleOpenPatientsModal = async () => {
    setShowPatientsModal(true);
    setLoadingPatientsList(true);
    try {
      console.log("Opening patients modal, loading data...");
      
      let activePatients: AdminUser[] = [];
      let allUsers: AdminUser[] = [];
      
      // Strategy 1: Thử /admin/patients (nếu có quyền Admin)
      try {
        activePatients = await fetchAdminPatients();
        console.log("✓ Loaded active patients from /admin/patients:", activePatients.length);
      } catch (err) {
        console.warn("✗ Cannot access /admin/patients (Receptionist may not have permission)", err);
      }
      
      // Strategy 2: Load all users including disabled (Receptionist có quyền)
      try {
        allUsers = await fetchAllUsersIncludingDisabled();
        console.log("✓ Loaded all users including disabled:", allUsers.length);
        
        // Nếu chưa có activePatients, filter từ allUsers
        if (activePatients.length === 0) {
          // Filter patients: không có degree/description/experience và isEnabled = true
          activePatients = allUsers.filter(u => 
            !u.degree && 
            !u.description && 
            !u.experience
          );
          console.log("✓ Filtered active patients from all users:", activePatients.length);
        }
      } catch (err) {
        console.error("✗ Failed to load all users including disabled:", err);
      }
      
      // Build complete patients list with status
      const patientsWithStatus: PatientWithStatus[] = [];
      const activePatientIds = new Set(activePatients.map(p => p.id));
      
      // Add active patients
      activePatients.forEach(p => {
        patientsWithStatus.push({ ...p, isEnabled: true });
      });
      
      // Add disabled patients from allUsers
      if (allUsers.length > 0) {
        allUsers.forEach(user => {
          // Skip if already added as active
          if (activePatientIds.has(user.id)) return;
          
          // Check if this is a disabled patient (not doctor/receptionist)
          const isLikelyPatient = !user.degree && !user.description && !user.experience;
          if (isLikelyPatient) {
            patientsWithStatus.push({ ...user, isEnabled: false });
          }
        });
      }
      
      console.log("✓ Final patients list:", patientsWithStatus.length);
      console.log("  - Active:", patientsWithStatus.filter(p => p.isEnabled !== false).length);
      console.log("  - Disabled:", patientsWithStatus.filter(p => p.isEnabled === false).length);
      
      setPatients(patientsWithStatus);
      
      if (patientsWithStatus.length === 0) {
        console.warn("⚠ No patients found. Possible reasons:");
        console.warn("  1. No patients in database");
        console.warn("  2. API permission issues");
        console.warn("  3. All users have degree/description (might be doctors)");
      }
    } catch (err) {
      console.error("✗ Unexpected error loading patients:", err);
      setPatients([]);
    } finally {
      setLoadingPatientsList(false);
    }
  };

  // Filter patients by search term
  const filteredPatients = patients.filter((patient) => {
    const search = searchTerm.toLowerCase();
    return (
      patient.fullName?.toLowerCase().includes(search) ||
      patient.email?.toLowerCase().includes(search) ||
      patient.phoneNumber?.toLowerCase().includes(search)
    );
  });

  // Load disabled patients when modal opens
  const handleOpenDisabledModal = async () => {
    setShowDisabledModal(true);
    setLoadingDisabledList(true);
    try {
      console.log("Opening disabled patients modal, loading data...");
      
      // Load disabled users from API
      const allDisabled = await fetchDisabledUsers();
      console.log("✓ Loaded disabled users:", allDisabled.length);
      
      // Filter to get only patients (not doctors/receptionists)
      const disabledPatientsList = allDisabled.filter(u => 
        !u.degree && 
        !u.description && 
        !u.experience
      );
      
      console.log("✓ Filtered disabled patients:", disabledPatientsList.length);
      setDisabledPatients(disabledPatientsList);
    } catch (err) {
      console.error("✗ Failed to load disabled patients:", err);
      setDisabledPatients([]);
    } finally {
      setLoadingDisabledList(false);
    }
  };

  // Filter disabled patients by search term
  const filteredDisabledPatients = disabledPatients.filter((patient) => {
    const search = searchTermDisabled.toLowerCase();
    return (
      patient.fullName?.toLowerCase().includes(search) ||
      patient.email?.toLowerCase().includes(search) ||
      patient.phoneNumber?.toLowerCase().includes(search)
    );
  });

  // Handle click unban button - show confirm modal
  const handleClickUnban = (patient: AdminUser) => {
    setPatientToUnban(patient);
    setShowUnbanConfirmModal(true);
  };

  // Handle confirm unban
  const handleConfirmUnban = async () => {
    if (!patientToUnban) return;

    const patientId = patientToUnban.id;
    setShowUnbanConfirmModal(false);
    setUnbanningUserId(patientId);
    
    try {
      // Unban (activate) - POST /admin/activate/{id}
      await unbanUser(patientId);
      console.log("✓ Patient unbanned successfully");
      
      // Reload disabled patients list
      setLoadingDisabledList(true);
      try {
        const allDisabled = await fetchDisabledUsers();
        const disabledPatientsList = allDisabled.filter(u => 
          !u.degree && 
          !u.description && 
          !u.experience
        );
        setDisabledPatients(disabledPatientsList);
        
        // Update total patients count
        const activePatients = await fetchAdminPatients().catch(() => []);
        setTotalPatients(activePatients.length);
      } catch (reloadErr) {
        console.error("Failed to reload disabled patients:", reloadErr);
        // Remove from local state
        setDisabledPatients(prev => prev.filter(p => p.id !== patientId));
      } finally {
        setLoadingDisabledList(false);
      }
    } catch (err) {
      console.error("✗ Failed to unban patient:", err);
      const errorMessage = err instanceof Error ? err.message : "Không thể thực hiện thao tác";
      alert(`Lỗi: ${errorMessage}\n\nVui lòng kiểm tra quyền truy cập hoặc thử lại sau.`);
    } finally {
      setUnbanningUserId(null);
      setPatientToUnban(null);
    }
  };

  return (
    <div className="recep-dashboard">
      {/* Header với Total Users Circle */}
      <div className="recep-dashboard__header">
        <div>
          <h2 className="recep-dashboard__title">Tổng quan Lễ tân</h2>
          <p className="recep-dashboard__subtitle">Quản lý và theo dõi các hoạt động của phòng khám</p>
        </div>
        <div className="recep-dashboard__header-right">
          {loadingPatients ? (
            <div className="total-users-circle total-users-circle--loading">
              <Spinner animation="border" size="sm" />
            </div>
          ) : (
            <TotalPatientsCircle count={totalPatients} />
          )}
        </div>
      </div>

      {/* Management Cards Grid */}
      <Row className="g-4 mt-3">
        <Col md={6} lg={4}>
          <ManagementCard
            title="Quản lý Ca làm việc"
            description="Xem và quản lý các ca làm việc của bác sĩ"
            icon={IconShift}
            link="/receptionist/shift"
            count={stats.shifts}
            loading={loadingStats}
            countLabel="ca hôm nay"
          />
        </Col>

        <Col md={6} lg={4}>
          <ManagementCard
            title="Quản lý Tài khoản"
            description="Xem và quản lý các tài khoản bệnh nhân"
            icon={IconUsers}
            onClick={handleOpenPatientsModal}
            count={totalPatients}
            loading={loadingPatients}
            countLabel="bệnh nhân"
          />
        </Col>

        <Col md={6} lg={4}>
          <ManagementCard
            title="Quản lý Lịch hẹn"
            description="Xem và quản lý các lịch hẹn khám bệnh"
            icon={IconAppointment}
            link="/receptionist/appointment"
            count={stats.appointments}
            loading={loadingStats}
            countLabel="lịch hẹn hôm nay"
          />
        </Col>

        <Col md={6} lg={4}>
          <ManagementCard
            title="Quản lý Sự kiện"
            description="Xem và quản lý các sự kiện của phòng khám"
            icon={IconEvent}
            link="/receptionist/events"
            count={stats.events}
            loading={loadingStats}
            countLabel="sự kiện"
          />
        </Col>

        <Col md={6} lg={4}>
          <ManagementCard
            title="Quản lý Phiếu giảm giá"
            description="Xem và quản lý các voucher của khách hàng"
            icon={IconVoucher}
            link="/receptionist/vouchers"
            count={stats.vouchers}
            loading={loadingStats}
            countLabel="voucher"
          />
        </Col>

        <Col md={6} lg={4}>
          <ManagementCard
            title="Danh sách tài khoản bị khóa"
            description="Xem và mở khóa các tài khoản bệnh nhân đã bị khóa"
            icon={IconLocked}
            onClick={handleOpenDisabledModal}
            count={disabledPatients.length}
            loading={loadingStats}
            countLabel="tài khoản bị khóa"
          />
        </Col>
      </Row>

      {/* Patients Modal */}
      <Modal
        show={showPatientsModal}
        onHide={() => {
          setShowPatientsModal(false);
          setSearchTerm("");
        }}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Danh sách Tài khoản Bệnh nhân</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Search */}
          <Form.Group className="mb-3">
            <InputGroup>
              <Form.Control
                type="text"
                placeholder="Tìm kiếm theo tên, email hoặc số điện thoại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <InputGroup.Text
                  style={{ cursor: "pointer" }}
                  onClick={() => setSearchTerm("")}
                >
                  ✕
                </InputGroup.Text>
              )}
            </InputGroup>
          </Form.Group>

          {/* Patients Table */}
          {loadingPatientsList ? (
            <div className="d-flex justify-content-center align-items-center py-5">
              <Spinner animation="border" />
              <span className="ms-2">Đang tải danh sách bệnh nhân...</span>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center text-muted py-5">
              {searchTerm ? "Không tìm thấy bệnh nhân phù hợp" : "Không có bệnh nhân nào"}
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
              <Table hover striped className="align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: "50px" }}>ID</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Số điện thoại</th>
                    <th>Giới tính</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <Badge bg="secondary">#{patient.id}</Badge>
                      </td>
                      <td>
                        <strong>{patient.fullName || "—"}</strong>
                      </td>
                      <td>{patient.email || "—"}</td>
                      <td>{patient.phoneNumber || "—"}</td>
                      <td>
                        {patient.gender ? (
                          <span style={{ color: "#0066cc", fontWeight: 500 }}>
                            {patient.gender === "Male" ? "Nam" : patient.gender === "Female" ? "Nữ" : "Khác"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

          {/* Summary */}
          {!loadingPatientsList && (
            <div className="mt-3 text-muted small">
              Hiển thị {filteredPatients.length} / {patients.length} bệnh nhân
              {searchTerm && ` (đã lọc theo: "${searchTerm}")`}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="text-muted small me-auto">
            Tổng số: <strong>{patients.length}</strong> bệnh nhân
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowPatientsModal(false);
              setSearchTerm("");
            }}
          >
            Đóng
          </button>
        </Modal.Footer>
      </Modal>

      {/* Disabled Patients Modal */}
      <Modal
        show={showDisabledModal}
        onHide={() => {
          setShowDisabledModal(false);
          setSearchTermDisabled("");
        }}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Danh sách Tài khoản Bị khóa</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Search */}
          <Form.Group className="mb-3">
            <InputGroup>
              <Form.Control
                type="text"
                placeholder="Tìm kiếm theo tên, email hoặc số điện thoại..."
                value={searchTermDisabled}
                onChange={(e) => setSearchTermDisabled(e.target.value)}
              />
              {searchTermDisabled && (
                <InputGroup.Text
                  style={{ cursor: "pointer" }}
                  onClick={() => setSearchTermDisabled("")}
                >
                  ✕
                </InputGroup.Text>
              )}
            </InputGroup>
          </Form.Group>

          {/* Disabled Patients Table */}
          {loadingDisabledList ? (
            <div className="d-flex justify-content-center align-items-center py-5">
              <Spinner animation="border" />
              <span className="ms-2">Đang tải danh sách tài khoản bị khóa...</span>
            </div>
          ) : filteredDisabledPatients.length === 0 ? (
            <div className="text-center text-muted py-5">
              {searchTermDisabled ? "Không tìm thấy tài khoản bị khóa phù hợp" : "Không có tài khoản nào bị khóa"}
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: "500px", overflowY: "auto" }}>
              <Table hover striped className="align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: "50px" }}>ID</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Số điện thoại</th>
                    <th>Giới tính</th>
                    <th style={{ width: "120px" }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDisabledPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <Badge bg="secondary">#{patient.id}</Badge>
                      </td>
                      <td>
                        <strong>{patient.fullName || "—"}</strong>
                      </td>
                      <td>{patient.email || "—"}</td>
                      <td>{patient.phoneNumber || "—"}</td>
                      <td>
                        {patient.gender ? (
                          <span style={{ color: "#0066cc", fontWeight: 500 }}>
                            {patient.gender === "Male" ? "Nam" : patient.gender === "Female" ? "Nữ" : "Khác"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {unbanningUserId === patient.id ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleClickUnban(patient)}
                            disabled={unbanningUserId !== null}
                          >
                            Mở khóa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

          {/* Summary */}
          {!loadingDisabledList && (
            <div className="mt-3 text-muted small">
              Hiển thị {filteredDisabledPatients.length} / {disabledPatients.length} tài khoản bị khóa
              {searchTermDisabled && ` (đã lọc theo: "${searchTermDisabled}")`}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="text-muted small me-auto">
            Tổng số: <strong>{disabledPatients.length}</strong> tài khoản bị khóa
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowDisabledModal(false);
              setSearchTermDisabled("");
            }}
          >
            Đóng
          </button>
        </Modal.Footer>
      </Modal>

      {/* Confirm Unban Modal */}
      <Modal
        show={showUnbanConfirmModal}
        onHide={() => {
          setShowUnbanConfirmModal(false);
          setPatientToUnban(null);
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Xác nhận Mở khóa Tài khoản</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {patientToUnban && (
            <div>
              <p className="mb-3">
                Bạn có chắc chắn muốn mở khóa tài khoản bệnh nhân này?
              </p>
              <div className="border rounded p-3 bg-light">
                <div className="mb-2">
                  <strong>ID:</strong> <Badge bg="secondary">#{patientToUnban.id}</Badge>
                </div>
                <div className="mb-2">
                  <strong>Họ và tên:</strong> {patientToUnban.fullName || "—"}
                </div>
                <div className="mb-2">
                  <strong>Email:</strong> {patientToUnban.email || "—"}
                </div>
                <div className="mb-2">
                  <strong>Số điện thoại:</strong> {patientToUnban.phoneNumber || "—"}
                </div>
                {patientToUnban.gender && (
                  <div>
                    <strong>Giới tính:</strong>{" "}
                    <span style={{ color: "#0066cc", fontWeight: 500 }}>
                      {patientToUnban.gender === "Male" ? "Nam" : patientToUnban.gender === "Female" ? "Nữ" : "Khác"}
                    </span>
                  </div>
                )}
              </div>
              <div className="alert alert-warning mt-3 mb-0">
                <small>
                  <strong>Lưu ý:</strong> Sau khi mở khóa, tài khoản này sẽ có thể đăng nhập và sử dụng hệ thống bình thường.
                </small>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowUnbanConfirmModal(false);
              setPatientToUnban(null);
            }}
            disabled={unbanningUserId !== null}
          >
            Hủy
          </button>
          <button
            className="btn btn-success"
            onClick={handleConfirmUnban}
            disabled={unbanningUserId !== null}
          >
            {unbanningUserId !== null ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Đang xử lý...
              </>
            ) : (
              "Xác nhận Mở khóa"
            )}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
