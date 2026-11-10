import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import { statusLabel, type UiStatus } from "../../components/appointment/AppointmentStatus";
import { fetchMyUpcomingAppointments, cancelAppointment, type Appointment } from "../../api/appointment";

type GroupedAppointments = Record<UiStatus, Appointment[]>;
type ChipTone = "blue" | "green" | "purple" | "red";

const statusOrder: UiStatus[] = ["PENDING_CONFIRM", "CONFIRMED", "CHECK_IN", "CANCELLED"];

const STATUS_META: Partial<
  Record<
    UiStatus,
    {
      title: string;
      description?: string;
      tone: ChipTone;
      badge?: string;
      defaultReason?: string;
    }
  >
> = {
  PENDING_CONFIRM: {
    title: "Chờ xác nhận",
    description: "Lịch hẹn đang đợi phòng khám phê duyệt.",
    tone: "blue",
    badge: "Pending confirmation",
    defaultReason: "Khám định kỳ",
  },
  CONFIRMED: {
    title: "Đã xác nhận",
    description: "Phòng khám đã xác nhận thời gian khám.",
    tone: "green",
    badge: "Confirmed",
    defaultReason: "Lịch khám đã xác nhận",
  },
  CHECK_IN: {
    title: "Đã check-in",
    description: "Bạn đã xác nhận có mặt tại phòng khám.",
    tone: "purple",
    badge: "Checked in",
    defaultReason: "Đang chờ khám",
  },
  CANCELLED: {
    title: "Đã hủy",
    description: "Các lịch hẹn đã được hủy thành công.",
    tone: "red",
    badge: "Cancelled",
    defaultReason: "Khám định kỳ",
  },
};

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Check-in QR Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrAppt, setQrAppt] = useState<Appointment | null>(null);
  const [selectedPatientForQr, setSelectedPatientForQr] = useState<any | null>(null);

  const loadAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchMyUpcomingAppointments();
      if (res.ok && res.data) {
        setAppointments(res.data);
        setError(null);
      } else {
        setError(res.error || "Không thể tải danh sách lịch hẹn");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải danh sách lịch hẹn";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const handleOpenCancel = (appt: Appointment) => {
    setSelectedAppt(appt);
    setCancelReason("");
    setCancelError(null);
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedAppt) return;
    try {
      setCancelling(true);
      setCancelError(null);
      const res = await cancelAppointment(selectedAppt.id);
      if (res.ok) {
        setCancelModalOpen(false);
        await loadAppointments();
      } else {
        setCancelError(res.error || "Không thể hủy lịch hẹn");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đã có lỗi xảy ra khi hủy lịch";
      setCancelError(message);
    } finally {
      setCancelling(false);
    }
  };

  const grouped: GroupedAppointments = useMemo(() => {
    return appointments.reduce<GroupedAppointments>((acc, item) => {
      const key = item.status;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as GroupedAppointments);
  }, [appointments]);

  const formatStatusInfo = (status: UiStatus) => {
    const meta = STATUS_META[status];
    if (meta) {
      return {
        title: meta.title,
        description: meta.description,
        tone: meta.tone,
        badge: meta.badge ?? statusLabel[status],
        defaultReason: meta.defaultReason,
      };
    }
    return {
      title: statusLabel[status],
      description: undefined,
      tone: "blue" as ChipTone,
      badge: statusLabel[status],
      defaultReason: undefined,
    };
  };

  const getPatientsLabel = (appointment: Appointment) => {
    if (appointment.patients?.length) {
      return appointment.patients.map((p) => p.fullName || "").filter(Boolean).join(", ");
    }
    return appointment.patientName || "—";
  };

  const formatDate = (value?: string) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString("vi-VN");
    } catch (err) {
      return value;
    }
  };

  const formatTime = (value?: string) => {
    if (!value) return "—";
    if (value.length > 5) return value.slice(0, 5);
    return value;
  };

  return (
    <div className="patient-page">
      <header className="patient-header">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h1>Lịch hẹn của tôi</h1>
            <p>Theo dõi các cuộc hẹn sắp tới và chuẩn bị cho buổi khám.</p>
          </div>
          <Link to="/appointment" className="btn btn-primary">
            Đặt lịch khám mới
          </Link>
        </div>
        {error && !loading && (
          <Alert variant="danger" className="mt-3" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
      </header>

      <section className="patient-body">
        {loading ? (
          <div className="patient-card">
            <div className="patient-loading">
              <Spinner animation="border" size="sm" />
              Đang tải lịch hẹn...
            </div>
          </div>
        ) : appointments.length === 0 ? (
          <div className="patient-card">
            <div className="patient-placeholder">
              <strong>Chưa có lịch hẹn nào.</strong>
              Bạn có thể đặt lịch khám mới để bắt đầu quản lý lịch trình.
            </div>
          </div>
        ) : (
          statusOrder.map((status) => {
            const list = grouped[status] ?? [];
            if (!list.length) return null;
            const info = formatStatusInfo(status);
            return (
              <div key={status} className="patient-card">
                <div className="patient-card__header">
                  <div>
                    <h2 className="patient-card__title mb-0">{info.title}</h2>
                    {info.description && <p className="patient-card__subtitle">{info.description}</p>}
                  </div>
                  <div className={`patient-status-chip tone-${info.tone}`}>
                    <span className="patient-status-chip__dot" />
                    {info.badge}
                  </div>
                </div>
                <div className="patient-appointment-list">
                  {list.map((item) => (
                    <div key={item.id} className="patient-appointment-item">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="patient-appointment-title">
                          {item.reason?.trim() || info.defaultReason || "Khám định kỳ"}
                        </div>
                        {item.type && (
                          <span className={`badge ${item.type === "ONLINE" ? "bg-info" : "bg-secondary"}`}>
                            {item.type === "ONLINE" ? "Online" : "Offline"}
                          </span>
                        )}
                      </div>
                      <div className="patient-appointment-grid">
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Ngày</span>
                          <span className="patient-appointment-value">{formatDate(item.appointmentDate)}</span>
                        </div>
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Giờ</span>
                          <span className="patient-appointment-value">{formatTime(item.appointmentTime)}</span>
                        </div>
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Bác sĩ</span>
                          <span className="patient-appointment-value">{item.doctorName || "—"}</span>
                        </div>
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Bệnh nhân</span>
                          <span className="patient-appointment-value">{getPatientsLabel(item)}</span>
                        </div>
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Chuyên khoa</span>
                          <span className="patient-appointment-value">{item.specialtyName || "—"}</span>
                        </div>
                        <div className="patient-appointment-field">
                          <span className="patient-appointment-label">Mã QR Check-in</span>
                          <span className="patient-appointment-value">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 py-0 px-2"
                              style={{ fontSize: "12px", height: "26px" }}
                              onClick={() => {
                                setQrAppt(item);
                                setSelectedPatientForQr(null);
                                setQrModalOpen(true);
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                              </svg>
                              Xem mã QR
                            </button>
                          </span>
                        </div>
                      </div>

                      {/* Nếu có từ 2 bệnh nhân trở lên, hiển thị chi tiết từng người với giờ khám riêng */}
                      {Array.isArray(item.patients) && item.patients.length > 1 ? (
                        <div className="mt-3 pt-2 border-top">
                          <div className="text-muted small fw-semibold mb-2">
                            Danh sách người khám & giờ khám theo slot:
                          </div>
                          <div className="d-flex flex-column gap-2">
                            {item.patients.map((p, pIdx) => {
                              const pTime = p.slotStartTime
                                ? `${formatTime(p.slotStartTime)}${p.slotEndTime ? ` - ${formatTime(p.slotEndTime)}` : ""}`
                                : formatTime(p.appointmentTime || item.appointmentTime);
                              return (
                                <div
                                  key={p.id || pIdx}
                                  className="d-flex justify-content-between align-items-center p-2 rounded bg-light border"
                                >
                                  <div>
                                    <strong className="text-dark">{p.fullName}</strong>
                                    {p.relationship && (
                                      <span className="text-muted small ms-2">({p.relationship})</span>
                                    )}
                                  </div>
                                  <div className="d-flex align-items-center gap-2">
                                    <span className="text-muted small">Giờ khám:</span>
                                    <span className="badge bg-primary px-2 py-1 fs-6">
                                      {pTime}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 py-0 px-2 ms-2"
                                      style={{ fontSize: "11px", height: "24px" }}
                                      onClick={() => {
                                        setQrAppt(item);
                                        setSelectedPatientForQr(p);
                                        setQrModalOpen(true);
                                      }}
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <rect x="3" y="3" width="7" height="7"></rect>
                                        <rect x="14" y="3" width="7" height="7"></rect>
                                        <rect x="14" y="14" width="7" height="7"></rect>
                                        <rect x="3" y="14" width="7" height="7"></rect>
                                      </svg>
                                      Mã QR
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Nút hủy lịch cho trạng thái PENDING_CONFIRM và CONFIRMED */}
                      {(status === "PENDING_CONFIRM" || status === "CONFIRMED") && (
                        <div className="d-flex justify-content-end mt-3 pt-2 border-top">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleOpenCancel(item)}
                          >
                            Hủy lịch hẹn
                          </Button>
                        </div>
                      )}

                      {status === "CANCELLED" && (
                        <div className="mt-2 pt-2 border-top d-flex justify-content-between align-items-center small">
                          <span className="text-danger">
                            <strong>Lý do hủy:</strong>{" "}
                            {item.cancelReason || "Bệnh nhân yêu cầu hủy"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Modal xác nhận hủy lịch */}
      <Modal show={cancelModalOpen} onHide={() => !cancelling && setCancelModalOpen(false)} centered>
        <Modal.Header closeButton={!cancelling}>
          <Modal.Title>Xác nhận hủy lịch hẹn</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {cancelError && <Alert variant="danger">{cancelError}</Alert>}
          <p>
            Bạn có chắc chắn muốn hủy lịch hẹn với bác sĩ{" "}
            <strong>{selectedAppt?.doctorName || "bác sĩ"}</strong> vào ngày{" "}
            <strong>{selectedAppt ? formatDate(selectedAppt.appointmentDate) : ""}</strong> lúc{" "}
            <strong>{selectedAppt ? formatTime(selectedAppt.appointmentTime) : ""}</strong>?
          </p>
          <div className="alert alert-warning py-2 mb-3" style={{ fontSize: "13px" }}>
            <strong>Lưu ý:</strong> Theo quy định phòng khám, lịch hẹn chỉ có thể hủy trước giờ bắt đầu ca khám tối thiểu <strong>24 giờ</strong>.
          </div>
          <Form.Group className="mb-2">
            <Form.Label>Lý do hủy (tùy chọn):</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Nhập lý do hủy lịch của bạn..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelling}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setCancelModalOpen(false)}
            disabled={cancelling}
          >
            Đóng
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Đang xử lý...
              </>
            ) : (
              "Xác nhận hủy"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal hiển thị mã QR Check-in */}
      <Modal show={qrModalOpen} onHide={() => setQrModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">
            {selectedPatientForQr
              ? `Mã QR Check-in: ${selectedPatientForQr.fullName}`
              : "Mã QR Check-in Lịch Hẹn"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <div className="mb-3 d-flex flex-wrap justify-content-center gap-2">
            <span className="badge bg-primary-subtle text-primary px-3 py-2 fs-6">
              Mã lịch hẹn: #{qrAppt?.appointmentNo || qrAppt?.id}
            </span>
            {selectedPatientForQr?.slotStartTime && (
              <span className="badge bg-success-subtle text-success px-3 py-2 fs-6">
                Giờ khám: {formatTime(selectedPatientForQr.slotStartTime)}
                {selectedPatientForQr.slotEndTime ? ` - ${formatTime(selectedPatientForQr.slotEndTime)}` : ""}
              </span>
            )}
          </div>

          {/* Nếu cuộc hẹn có nhiều người và đang xem mã chung, cho phép chọn nhanh từng bệnh nhân */}
          {Array.isArray(qrAppt?.patients) && qrAppt.patients.length > 1 && (
            <div className="d-flex justify-content-center gap-1 mb-3">
              <button
                type="button"
                className={`btn btn-sm ${!selectedPatientForQr ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setSelectedPatientForQr(null)}
              >
                Tất cả ({qrAppt.patients.length} người)
              </button>
              {qrAppt.patients.map((p, idx) => (
                <button
                  key={p.id || idx}
                  type="button"
                  className={`btn btn-sm ${selectedPatientForQr?.fullName === p.fullName ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setSelectedPatientForQr(p)}
                >
                  {p.fullName} ({formatTime(p.slotStartTime || p.appointmentTime || qrAppt.appointmentTime)})
                </button>
              ))}
            </div>
          )}

          <div className="d-flex justify-content-center my-3">
            <div className="p-2 border rounded shadow-sm bg-white" style={{ display: "inline-block" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  selectedPatientForQr
                    ? `CLINIC_CHECKIN:${qrAppt?.appointmentNo || qrAppt?.id}:${qrAppt?.appointmentDate}:${selectedPatientForQr.fullName}:${selectedPatientForQr.slotStartTime || qrAppt?.appointmentTime}`
                    : `CLINIC_CHECKIN:${qrAppt?.appointmentNo || qrAppt?.id}:${qrAppt?.appointmentDate}`
                )}`}
                alt="QR Code Check-in"
                width="180"
                height="180"
                className="img-fluid"
              />
            </div>
          </div>
          <p className="text-muted small mb-2">
            Vui lòng đưa mã QR này cho lễ tân hoặc quét tại kiosk để check-in nhanh khi đến phòng khám.
          </p>
          <div className="bg-light p-3 rounded small text-start mx-auto" style={{ maxWidth: "340px" }}>
            <div>
              <strong>Bệnh nhân:</strong>{" "}
              {selectedPatientForQr ? selectedPatientForQr.fullName : (qrAppt ? getPatientsLabel(qrAppt) : "—")}
              {selectedPatientForQr?.relationship && (
                <span className="text-muted ms-1">({selectedPatientForQr.relationship})</span>
              )}
            </div>
            <div><strong>Bác sĩ:</strong> {qrAppt?.doctorName || "—"}</div>
            <div>
              <strong>Giờ khám:</strong>{" "}
              <span className="text-primary fw-bold">
                {selectedPatientForQr
                  ? `${formatTime(selectedPatientForQr.slotStartTime || selectedPatientForQr.appointmentTime || qrAppt?.appointmentTime)}${selectedPatientForQr.slotEndTime ? ` - ${formatTime(selectedPatientForQr.slotEndTime)}` : ""}`
                  : formatTime(qrAppt?.appointmentTime)}
              </span>
              {" "}— Ngày {formatDate(qrAppt?.appointmentDate)}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setQrModalOpen(false)}>
            Đóng
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

