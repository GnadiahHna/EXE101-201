// src/pages/doctor/DoctorAppointment.tsx
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Col,
  Form,
  InputGroup,
  Modal,
  Row,
  Stack,
  Table,
} from "react-bootstrap";

import {
  toISODateInput,
  paginate,
  type Appointment,
  fetchByShifts,
  fetchDetail,
  startAppointment as apiStartAppointment,
  completeAppointment as apiCompleteAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../../api/appointment";
import { getPrescriptionsByAppointment, type Prescription as PrescriptionType } from "../../api/prescription";

import AppointmentStatus from "../../components/appointment/AppointmentStatus";
import type { UiStatus } from "../../components/appointment/AppointmentStatus";
import { normStatus, STATUS_OPTIONS, statusLabel, statusTone } from "../../components/appointment/AppointmentStatus";

import { fetchMyShifts, fetchShiftsByDoctorAndDate, type DoctorShift, type DoctorShiftSlot } from "../../api/shift";
import "../../styles/appointmentlist.css";
import Paging from "../../components/common/Paging";

/* ============================== Component ============================== */
export default function DoctorAppointment() {
  const navigate = useNavigate();
  
  // Filters
  const [date, setDate] = useState<string>(() => toISODateInput(new Date()));
  const [status, setStatus] = useState<UiStatus | "ALL">("ALL");
  const [search, setSearch] = useState<string>("");

  // Data
  const [shifts, setShifts] = useState<DoctorShift[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Modal
  const [viewItem, setViewItem] = useState<Appointment | null>(null);
  const [addedPrescription, setAddedPrescription] = useState<boolean>(false);
  const [prescriptions, setPrescriptions] = useState<PrescriptionType[]>([]);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const [showRawIntake, setShowRawIntake] = useState<boolean>(false);
  const [intakeSummary, setIntakeSummary] = useState<{ summary?: string; bullets?: string[]; verifiedDisclaimer?: string; source?: string; generatedAt?: string } | null>(null);

  // Reschedule Modal
  type DoctorShiftWithSlots = DoctorShift & { availableSlotsCount?: number };
  const [showRescheduleModal, setShowRescheduleModal] = useState<boolean>(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<number | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<number | null>(null);
  const [availableShifts, setAvailableShifts] = useState<DoctorShiftWithSlots[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(() => toISODateInput(new Date()));
  const [loadingShifts, setLoadingShifts] = useState<boolean>(false);
  const [rescheduleReason, setRescheduleReason] = useState<string>("Bác sĩ điều chỉnh lịch hẹn");

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("Bác sĩ bận lịch đột xuất");

  // Paging (nếu muốn hiển thị nhiều trang, bạn có thể bật Paging bên dưới)
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  /* ---- Load shifts theo ngày ---- */
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchMyShifts(undefined, date);
        setShifts(list || []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load shifts";
        setError(message);
        setShifts([]);
      }
    })();
  }, [date]);

  /* ---- Load appointments theo shifts trong ngày ---- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (!shifts || shifts.length === 0) {
          setAppointments([]);
          setLoading(false);
          return;
        }
        const shiftIds = shifts.map((s) => s.id);
        const res = await fetchByShifts(shiftIds);
        if (res.ok && res.data) {
          setAppointments(res.data);
          setPage(1);
        } else {
          setError(res.error || "Failed to load appointments");
          setAppointments([]);
        }
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Failed to load appointments";
        setError(message);
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [shifts]);

  /* ---- Reload prescriptions when viewItem modal is opened ---- */
  useEffect(() => {
    if (viewItem) {
      // Reload prescriptions when modal is opened (in case prescriptions were added from AddPrescription page)
      (async () => {
        const presRes = await getPrescriptionsByAppointment(viewItem.id);
        if (presRes.ok && presRes.data) {
          setPrescriptions(presRes.data);
          setAddedPrescription(presRes.data.length > 0);
        }
      })();
    }
  }, [viewItem]);

  /* ---- Client filters ---- */
  const filtered = useMemo(() => {
    let list = [...appointments];

    if (status !== "ALL") {
      list = list.filter((x) => normStatus(x.status) === status);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => (x.patientName || "").toLowerCase().includes(q));
    }
    return list;
  }, [appointments, status, search]);

  const paged = useMemo(() => paginate(filtered, page, pageSize), [filtered, page]);

  /* ---- Actions in modal ---- */
  const startAppointment = async (id: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiStartAppointment(id);
      if (res.ok) {
        if (res.data) {
          setViewItem(res.data);
          setAppointments((current) => current.map((item) => item.id === id ? res.data! : item));
        }
        await reloadAfterAction();
        setAddedPrescription(false);
      } else {
        setError(res.error || "Failed to start appointment");
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to start appointment";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const openPrescriptionModal = (isEdit: boolean = false) => {
    if (!viewItem) return;
    // Navigate to AddPrescription page
    const url = isEdit 
      ? `/doctor/appointment/${viewItem.id}/prescription?edit=true`
      : `/doctor/appointment/${viewItem.id}/prescription`;
    navigate(url);
  };

  const completeAppointment = async (id: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiCompleteAppointment(id);
      if (res.ok) {
        await reloadAfterAction();
        setViewItem(null);
      } else {
        setError(res.error || "Failed to complete appointment");
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to complete appointment";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reloadAfterAction = async () => {
    // reload toàn bộ danh sách theo ngày hiện tại
    if (!shifts || shifts.length === 0) return;
    setLoading(true);
    try {
      const shiftIds = shifts.map((s) => s.id);
      const res = await fetchByShifts(shiftIds);
      if (res.ok && res.data) {
        setAppointments(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ---- Cancel appointment by Doctor ---- */
  const handleOpenCancelModal = (id: number) => {
    setCancelAppointmentId(id);
    setCancelReason("Bác sĩ bận lịch đột xuất");
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelAppointmentId) return;
    if (!cancelReason.trim()) {
      setError("Vui lòng nhập lý do hủy lịch hẹn.");
      return;
    }
    setLoading(true);
    const res = await cancelAppointment(cancelAppointmentId, cancelReason.trim());
    if (res.ok) {
      await reloadAfterAction();
      setShowCancelModal(false);
      setCancelAppointmentId(null);
      setViewItem(null);
    } else {
      setError(res.error || "Hủy lịch hẹn thất bại.");
    }
    setLoading(false);
  };

  /* ---- Reschedule appointment by Doctor ---- */
  const loadAvailableShifts = async (targetDate: string, docId?: number) => {
    setLoadingShifts(true);
    setError("");
    try {
      const list = docId
        ? await fetchShiftsByDoctorAndDate(docId, targetDate)
        : await fetchMyShifts(undefined, targetDate);

      const mapped = (list || []).map((s) => {
        const rawSlots = Array.isArray(s.slots) ? (s.slots as DoctorShiftSlot[]) : [];
        const availableCount = rawSlots.filter((slot) => {
          const st = (slot.status ?? slot.slotStatus ?? "").toUpperCase();
          return st === "AVAILABLE" || st === "FREE";
        }).length;
        return {
          ...s,
          slots: rawSlots,
          availableSlotsCount: availableCount,
        };
      });
      setAvailableShifts(mapped);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load available shifts";
      setError(message);
      setAvailableShifts([]);
    } finally {
      setLoadingShifts(false);
    }
  };

  const handleOpenReschedule = async (id: number) => {
    setError("");
    setRescheduleAppointmentId(id);
    setSelectedShiftId(null);
    setRescheduleDate(date);
    setRescheduleReason("Bác sĩ điều chỉnh lịch hẹn");
    setShowRescheduleModal(true);
    setLoading(true);

    try {
      const detailRes = await fetchDetail(id);
      let docId = detailRes.data?.doctorId;
      if (!docId) {
        const appt = appointments.find((a) => a.id === id);
        docId = appt?.doctorId;
      }
      if (docId) {
        setRescheduleDoctorId(docId);
        await loadAvailableShifts(date, docId);
      } else {
        await loadAvailableShifts(date);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Không thể tải thông tin appointment";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleAppointmentId || !selectedShiftId) {
      setError("Vui lòng chọn ca trực mới để dời lịch");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await rescheduleAppointment(rescheduleAppointmentId, selectedShiftId, undefined, rescheduleReason);
      if (res.ok) {
        await reloadAfterAction();
        setShowRescheduleModal(false);
        setViewItem(null);
        setRescheduleAppointmentId(null);
        setSelectedShiftId(null);
        setRescheduleDoctorId(null);
      } else {
        setError(res.error || "Điều chỉnh lịch hẹn thất bại");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Điều chỉnh lịch hẹn thất bại";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /* ============================== Render ============================== */
  return (
    <div className="recep-wrap">
      {/* ---- Filter Bar ---- */}
      <Row className="filters g-2">
        <Col lg={3} md={6}>
          <Form.Label>Status</Form.Label>
          <Form.Select
            value={status}
            onChange={(e) => setStatus(e.target.value as UiStatus | "ALL")}
          >
            <option value="ALL">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </Form.Select>
        </Col>

        <Col lg={3} md={6}>
          <Form.Label>Date</Form.Label>
          <Form.Control type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Col>

        <Col lg={6} md={12}>
          <Form.Label>Search</Form.Label>
          <InputGroup>
            <Form.Control
              placeholder="Search by patient name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={() => setSearch("")}>
              Clear
            </Button>
          </InputGroup>
        </Col>
      </Row>

      {error && <div className="text-danger mt-2 mb-2">{error}</div>}

      {/* ---- Legend ---- */}
      <div className="legend justify-content-end mt-2">
        {STATUS_OPTIONS.map((s) => (
          <LegendDot key={s} tone={statusTone[s]} label={statusLabel[s]} />
        ))}
      </div>

      {/* ---- Table ---- */}
      <div className="table-card">
        <div className="table-title">
          <h6>My Appointments</h6>
        </div>

        <Table responsive hover className="appt-table align-middle">
          <thead>
            <tr>
              <th>DATE</th>
              <th>TIME</th>
              <th>PATIENT</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading...</td>
              </tr>
            )}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={5}>No appointments</td>
              </tr>
            )}
            {paged.map((a) => (
              <tr key={a.id} className="row-item">
                <td>{a.appointmentDate}</td>
                <td>{a.appointmentTime}</td>
                <td>{a.patientName || "N/A"}</td>
                <td>
                  <AppointmentStatus status={normStatus(a.status)} withBadge />
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={async () => {
                      setAddedPrescription(false);
                      setIntakeSummary(null);
                      setShowRawIntake(false);
                      setViewItem(a);
                      // Check if appointment already has prescription
                      const presRes = await getPrescriptionsByAppointment(a.id);
                      if (presRes.ok && presRes.data) {
                        setPrescriptions(presRes.data);
                        setAddedPrescription(presRes.data.length > 0);
                      }
                    }}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Paging total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} />
       
      </div>

      {/* ---- Modal (Detail + Actions) ---- */}
      <Modal show={!!viewItem} onHide={() => setViewItem(null)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết lịch hẹn #{viewItem?.appointmentNo || viewItem?.id}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewItem && (
            <div className="detail-grid">
              <Detail label="Ngày khám">{viewItem.appointmentDate}</Detail>
              <Detail label="Giờ khám">{viewItem.appointmentTime}</Detail>
              <Detail label="Bệnh nhân">
                <div>
                  <strong>{viewItem.patientName}</strong>
                  {(viewItem as any).patients && (viewItem as any).patients.length > 1 && (
                    <span className="badge bg-primary-subtle text-primary ms-2">
                      {(viewItem as any).patients.length} người khám
                    </span>
                  )}
                </div>
              </Detail>
              {(viewItem as any).patients && (viewItem as any).patients.length > 1 && (
                <div className="col-12 mt-2 p-2 rounded bg-light border">
                  <div className="small fw-bold text-secondary mb-1">Danh sách người khám:</div>
                  <div className="d-flex flex-column gap-1">
                    {(viewItem as any).patients.map((p: any, idx: number) => (
                      <div key={idx} className="small d-flex justify-content-between align-items-center py-1 border-bottom border-light">
                        <span>
                          <strong>{idx + 1}. {p.fullName}</strong> ({p.gender === 'Male' ? 'Nam' : p.gender === 'Female' ? 'Nữ' : 'Khác'})
                          {p.relationship ? ` - Mối quan hệ: ${p.relationship}` : ''}
                        </span>
                        <span className="text-muted">{p.phoneNumber || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Detail label="Hình thức">
                {viewItem.type ? (
                  <span className={`badge ${viewItem.type === "ONLINE" ? "bg-info" : "bg-secondary"}`}>
                    {viewItem.type === "ONLINE" ? "Online" : "Offline"}
                  </span>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Trạng thái">
                <AppointmentStatus status={normStatus(viewItem.status)} withBadge={false} />
              </Detail>
              {viewItem.reason && <Detail label="Lý do khám">{viewItem.reason}</Detail>}

              {/* Patient Intake Information Card */}
              <div className="mt-3 p-3 border rounded-3 bg-light shadow-sm">
                <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                  <div className="d-flex align-items-center gap-2">
                    <h6 className="mb-0 fw-bold text-dark">📋 Thông tin Tiền khám</h6>
                    {/* Cảnh báo dị ứng nổi bật ngay tiêu đề nếu có */}
                    {((viewItem as any).intake?.allergies && (viewItem as any).intake.allergies.length > 0) && (
                      <span className="badge bg-danger-subtle text-danger border border-danger small px-2 py-1">
                        ⚠️ Dị ứng: {Array.isArray((viewItem as any).intake.allergies) ? (viewItem as any).intake.allergies.join(", ") : (viewItem as any).intake.allergies}
                      </span>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <Button
                      size="sm"
                      variant={intakeSummary ? "outline-secondary" : "primary"}
                      disabled={loadingSummary}
                      className="py-1 px-2.5 fw-medium d-flex align-items-center gap-1"
                      onClick={async () => {
                        if (!viewItem) return;
                        setLoadingSummary(true);
                        try {
                          const regenerateParam = intakeSummary ? "?regenerate=true" : "";
                          const res = await (await import("../../api/http")).http.post(
                            `/doctor/appointments/${viewItem.id}/intake-summary${regenerateParam}`
                          );
                          setIntakeSummary(res.data?.data || res.data);
                        } catch (err: any) {
                          alert(err.response?.data?.message || "Không thể tạo tóm tắt AI.");
                        } finally {
                          setLoadingSummary(false);
                        }
                      }}
                    >
                      {loadingSummary ? (
                        "Đang xử lý..."
                      ) : intakeSummary ? (
                        <>🔄 Tóm tắt lại</>
                      ) : (
                        <>✨ Tóm tắt tiền khám AI</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Khung Tóm tắt AI */}
                {intakeSummary ? (
                  <div>
                    <div className="alert alert-info py-2 px-3 mb-2 border-0 bg-info-subtle rounded-2">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-primary text-white px-2 py-1">
                          {intakeSummary.source === "ai" ? "🤖 Tóm tắt AI" : "📋 Phân tích Quy tắc"}
                        </span>
                        <span className="text-secondary small fst-italic" style={{ fontSize: "12px" }}>
                          Bác sĩ cần xác minh trước khi khám
                        </span>
                      </div>
                      {intakeSummary.bullets && intakeSummary.bullets.length > 0 ? (
                        <ul className="mb-0 ps-3 small text-dark d-flex flex-column gap-1">
                          {intakeSummary.bullets.map((b: string, i: number) => (
                            <li key={i} className="line-height-base">{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="small text-dark">{intakeSummary.summary}</div>
                      )}
                    </div>
                    {/* Toggle đối chiếu văn bản gốc */}
                    <div className="text-end">
                      <Button
                        variant="link"
                        size="sm"
                        className="text-muted p-0 text-decoration-none small"
                        style={{ fontSize: "12px" }}
                        onClick={() => setShowRawIntake(!showRawIntake)}
                      >
                        {showRawIntake ? "▲ Thu gọn thông tin gốc" : "▼ Xem thông tin bệnh nhân nhập ban đầu"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Thông tin tiền khám gốc (Hiển thị khi chưa có tóm tắt hoặc khi bác sĩ chủ động bấm xem) */}
                {(!intakeSummary || showRawIntake) && (
                  <div className={`small text-secondary ${intakeSummary ? "mt-2 pt-2 border-top" : ""}`}>
                    {Array.isArray((viewItem as any).patients) && (viewItem as any).patients.length > 1 ? (
                      <div className="d-flex flex-column gap-3">
                        {(viewItem as any).patients.map((p: any, idx: number) => {
                          const pIntake = p.intake || {};
                          return (
                            <div key={idx} className="p-2 border rounded bg-white">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="fw-bold text-dark">
                                  #{idx + 1}. {p.fullName} ({p.gender === "Male" ? "Nam" : p.gender === "Female" ? "Nữ" : "Khác"} - {p.relationship || "Chính chủ"})
                                </span>
                                {pIntake.allergies && pIntake.allergies.length > 0 && (
                                  <span className="badge bg-danger-subtle text-danger border border-danger px-1 py-0.5" style={{ fontSize: "11px" }}>
                                    ⚠️ {Array.isArray(pIntake.allergies) ? pIntake.allergies.join(", ") : pIntake.allergies}
                                  </span>
                                )}
                              </div>
                              <div className="row g-1 text-muted" style={{ fontSize: "12px" }}>
                                <div className="col-12">
                                  <strong>Triệu chứng:</strong> {pIntake.symptoms || (idx === 0 ? (viewItem as any).intake?.symptoms || viewItem.reason : "—")}
                                  {pIntake.duration ? ` (${pIntake.duration})` : ""}
                                </div>
                                <div className="col-md-6">
                                  <strong>Dị ứng:</strong>{" "}
                                  <span className={pIntake.allergies && pIntake.allergies.length > 0 ? "text-danger fw-semibold" : ""}>
                                    {pIntake.allergies && pIntake.allergies.length > 0
                                      ? (Array.isArray(pIntake.allergies) ? pIntake.allergies.join(", ") : pIntake.allergies)
                                      : "Chưa ghi nhận"}
                                  </span>
                                </div>
                                <div className="col-md-6">
                                  <strong>Bệnh lý:</strong>{" "}
                                  {pIntake.medicalHistory && pIntake.medicalHistory.length > 0
                                    ? (Array.isArray(pIntake.medicalHistory) ? pIntake.medicalHistory.join(", ") : pIntake.medicalHistory)
                                    : "—"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="row g-2">
                        <div className="col-md-6">
                          <strong>Triệu chứng:</strong> {(viewItem as any).intake?.symptoms || viewItem.reason || "Chưa ghi nhận"}
                        </div>
                        <div className="col-md-6">
                          <strong>Thời gian xuất hiện:</strong> {(viewItem as any).intake?.duration || "—"}
                        </div>
                        <div className="col-md-6">
                          <strong>Dị ứng thuốc/thực phẩm:</strong>{" "}
                          <span className="text-danger fw-semibold">
                            {(viewItem as any).intake?.allergies && (viewItem as any).intake.allergies.length > 0
                              ? (Array.isArray((viewItem as any).intake.allergies) ? (viewItem as any).intake.allergies.join(", ") : (viewItem as any).intake.allergies)
                              : "Không có / Chưa ghi nhận"}
                          </span>
                        </div>
                        <div className="col-md-6">
                          <strong>Tiền sử bệnh lý:</strong> {(viewItem as any).intake?.medicalHistory && (viewItem as any).intake.medicalHistory.length > 0 ? (Array.isArray((viewItem as any).intake.medicalHistory) ? (viewItem as any).intake.medicalHistory.join(", ") : (viewItem as any).intake.medicalHistory) : "—"}
                        </div>
                        <div className="col-md-6">
                          <strong>Thuốc đang dùng:</strong> {(viewItem as any).intake?.currentMedications || "—"}
                        </div>
                        {((viewItem as any).intake?.heightCm || (viewItem as any).intake?.weightKg) && (
                          <div className="col-md-6">
                            <strong>Thể trạng:</strong> Chiều cao: {(viewItem as any).intake?.heightCm || "—"} cm, Cân nặng: {(viewItem as any).intake?.weightKg || "—"} kg
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Display prescriptions if any */}
              {prescriptions.length > 0 && (
                <div className="mt-3">
                  <h6>Đơn thuốc:</h6>
                  {prescriptions.map((prescription, idx) => (
                    <div key={prescription.id || idx} className="border rounded p-3 mb-2">
                      <div><strong>Tên thuốc:</strong> {prescription.medicineName || "-"}</div>
                      {prescription.dosage && <div><strong>Liều lượng:</strong> {prescription.dosage}</div>}
                      {prescription.duration && <div><strong>Thời gian dùng:</strong> {prescription.duration}</div>}
                      {prescription.instructions && (
                        <div><strong>Hướng dẫn:</strong> {prescription.instructions}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Stack direction="horizontal" gap={2} className="ms-auto">
            {/* Action buttons based on status */}
            {viewItem && normStatus(viewItem.status) !== "COMPLETED" && (
              <>
                {/* CONFIRMED or RESCHEDULED: Doctor can Reschedule or Cancel */}
                {(normStatus(viewItem.status) === "CONFIRMED" || normStatus(viewItem.status) === "RESCHEDULED") && (
                  <>
                    <Button
                      variant="outline-secondary"
                      onClick={() => handleOpenReschedule(viewItem.id)}
                    >
                      Đổi lịch hẹn
                    </Button>
                    <Button
                      variant="outline-danger"
                      onClick={() => handleOpenCancelModal(viewItem.id)}
                    >
                      Hủy lịch
                    </Button>
                  </>
                )}

                {/* CHECK_IN -> Start examination or Reschedule/Cancel */}
                {normStatus(viewItem.status) === "CHECK_IN" && (
                  <>
                    <Button onClick={() => startAppointment(viewItem.id)}>Bắt đầu khám</Button>
                    <Button
                      variant="outline-secondary"
                      onClick={() => handleOpenReschedule(viewItem.id)}
                    >
                      Đổi lịch hẹn
                    </Button>
                    <Button
                      variant="outline-danger"
                      onClick={() => handleOpenCancelModal(viewItem.id)}
                    >
                      Hủy lịch
                    </Button>
                  </>
                )}

                {/* IN_PROGRESS -> Add/Edit Prescription -> Complete */}
                {normStatus(viewItem.status) === "IN_PROGRESS" && (
                  <>
                    {addedPrescription ? (
                      <Button
                        variant="outline-primary"
                        onClick={() => openPrescriptionModal(true)}
                      >
                        Sửa đơn thuốc
                      </Button>
                    ) : (
                      <Button
                        variant="outline-secondary"
                        onClick={() => openPrescriptionModal(false)}
                      >
                        Thêm đơn thuốc
                      </Button>
                    )}
                    <Button
                      variant="success"
                      onClick={() => completeAppointment(viewItem.id)}
                      disabled={!addedPrescription}
                    >
                      Hoàn thành khám
                    </Button>
                  </>
                )}
              </>
            )}
            
            {/* If completed, show info message */}
            {viewItem && normStatus(viewItem.status) === "COMPLETED" && (
              <div className="text-muted">Lịch hẹn đã hoàn thành (chế độ chỉ xem).</div>
            )}
            <Button variant="secondary" onClick={() => setViewItem(null)}>
              Đóng
            </Button>
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* ---------- RESCHEDULE MODAL (Bác sĩ điều chỉnh lịch hẹn) ---------- */}
      <Modal
        show={showRescheduleModal}
        onHide={() => {
          setShowRescheduleModal(false);
          setSelectedShiftId(null);
          setRescheduleAppointmentId(null);
          setRescheduleDoctorId(null);
        }}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Điều chỉnh lịch hẹn (Bác sĩ)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <div className="alert alert-danger mb-3" role="alert">
              {error}
            </div>
          )}
          <div className="mb-3">
            <Form.Group className="mb-3">
              <Form.Label>
                <strong>Lý do điều chỉnh lịch hẹn (bắt buộc):</strong>
              </Form.Label>
              <Form.Control
                type="text"
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh..."
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                <strong>Chọn ngày cho ca trực mới:</strong>
              </Form.Label>
              <Form.Control
                type="date"
                value={rescheduleDate}
                min={toISODateInput(new Date())}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setRescheduleDate(newDate);
                  setSelectedShiftId(null);
                  if (rescheduleDoctorId) {
                    loadAvailableShifts(newDate, rescheduleDoctorId);
                  } else {
                    loadAvailableShifts(newDate);
                  }
                }}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                <strong>Chọn ca trực mới của bác sĩ:</strong>
              </Form.Label>
              {loadingShifts && <div>Đang tải danh sách ca trực...</div>}
              {!loadingShifts && availableShifts.length === 0 && (
                <div className="text-warning">
                  Không tìm thấy ca trực nào của bác sĩ trong ngày {rescheduleDate}. Vui lòng chọn ngày khác.
                </div>
              )}
              {!loadingShifts && availableShifts.length > 0 && (
                <Form.Select
                  value={selectedShiftId || ""}
                  onChange={(e) => setSelectedShiftId(Number(e.target.value) || null)}
                >
                  <option value="">-- Chọn ca trực --</option>
                  {availableShifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.doctorName || "Bác sĩ"} - {shift.shift} ({shift.startTime} - {shift.endTime})
                      {shift.availableSlotsCount !== undefined && shift.availableSlotsCount > 0 
                        ? ` - còn ${shift.availableSlotsCount} khung giờ trống`
                        : ""}
                    </option>
                  ))}
                </Form.Select>
              )}
            </Form.Group>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Stack direction="horizontal" gap={2} className="ms-auto">
            <Button
              variant="outline-secondary"
              onClick={() => {
                setShowRescheduleModal(false);
                setSelectedShiftId(null);
                setRescheduleAppointmentId(null);
                setRescheduleDoctorId(null);
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleReschedule}
              disabled={!selectedShiftId || loading || !rescheduleReason.trim()}
            >
              {loading ? "Đang xử lý..." : "Xác nhận đổi lịch"}
            </Button>
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* ---------- CANCEL MODAL (Bác sĩ hủy lịch hẹn) ---------- */}
      <Modal
        show={showCancelModal}
        onHide={() => !loading && setShowCancelModal(false)}
        centered
      >
        <Modal.Header closeButton={!loading}>
          <Modal.Title>Xác nhận hủy lịch hẹn (Bác sĩ)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Vui lòng nhập lý do hủy lịch hẹn (thông báo sẽ được gửi tới Lễ tân, Quản trị viên và Bệnh nhân):
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Lý do hủy:</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Nhập lý do hủy..."
              disabled={loading}
            />
          </Form.Group>
          <div className="d-flex flex-wrap gap-2">
            {[
              "Bác sĩ bận lịch đột xuất",
              "Bác sĩ tham gia hội chẩn khẩn",
              "Bệnh nhân yêu cầu đổi thời gian",
              "Bệnh nhân không đủ điều kiện thực hiện khám",
            ].map((sug) => (
              <Button
                key={sug}
                variant="outline-secondary"
                size="sm"
                onClick={() => setCancelReason(sug)}
                disabled={loading}
              >
                {sug}
              </Button>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCancelModal(false)}
            disabled={loading}
          >
            Đóng
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmCancel}
            disabled={loading || !cancelReason.trim()}
          >
            {loading ? "Đang xử lý..." : "Xác nhận hủy lịch"}
          </Button>
        </Modal.Footer>
      </Modal>

    </div>
  );
}

/* ============================== Small Presentational ============================== */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: "green" | "blue" | "purple" | "teal" | "red" | "gray";
  label: string;
}) {
  return (
    <div className="legend-item">
      <span className={`status-dot ${tone}`} />
      <span className="legend-text">{label}</span>
    </div>
  );
}
