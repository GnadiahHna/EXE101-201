import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import type { Appointment } from "../../api/appointment";
import {
  fetchByStatusAndDate,
  fetchAllByDate,
  toISODateInput,
  deriveSpecialties,
  applyClientFilters,
  paginate,
  confirmAppointment,
  checkinAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "../../api/appointment";

import AppointmentStatus from "../../components/appointment/AppointmentStatus";
import type { UiStatus } from "../../components/appointment/AppointmentStatus";
import { STATUS_OPTIONS, statusLabel, statusTone } from "../../components/appointment/AppointmentStatus";
import {
  fetchAllShiftsByDate,
  fetchShiftsByDoctorAndDate,
  type DoctorShift,
  type DoctorShiftSlot,
} from "../../api/shift";
import Paging from "../../components/common/Paging";
import "../../styles/appointmentlist.css";

/* ----------------------------- TYPES ----------------------------- */
type DoctorShiftWithSlots = DoctorShift & {
  availableSlotsCount?: number;
};

/* ----------------------------- MAIN COMPONENT ----------------------------- */
export default function RecepAppointment() {
  /* ----- STATE ----- */
  const [date, setDate] = useState<string>(() => toISODateInput(new Date()));
  const [status, setStatus] = useState<UiStatus | "ALL">("ALL");
  const [specialty, setSpecialty] = useState<string>("ALL");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [search, setSearch] = useState<string>("");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [viewItem, setViewItem] = useState<Appointment | null>(null);

  // Reschedule modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState<boolean>(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<number | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<number | null>(null); // Lưu doctorId để lọc shifts
  const [availableShifts, setAvailableShifts] = useState<DoctorShiftWithSlots[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(() => toISODateInput(new Date()));
  const [loadingShifts, setLoadingShifts] = useState<boolean>(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("Bệnh nhân yêu cầu hủy");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  /* ----- LOAD DATA ----- */
  useEffect(() => {
    loadAppointments(status, date);
  }, [status, date]);

  async function loadAppointments(st: UiStatus | "ALL", d: string) {
    setLoading(true);
    setError("");
    const res = st === "ALL" 
      ? await fetchAllByDate(d)
      : await fetchByStatusAndDate(st, d);
    if (res.ok && res.data) {
      setAppointments(res.data);
      setSpecialties(deriveSpecialties(res.data));
      setPage(1);
    } else {
      setAppointments([]);
      setError(res.error || "Failed to load data");
    }
    setLoading(false);
  }

  /* ----- ACTIONS ----- */
  const handleConfirm = async (id: number) => {
    setLoading(true);
    const res = await confirmAppointment(id);
    if (res.ok) await loadAppointments(status, date);
    else setError(res.error || "Confirm failed");
    setViewItem(null);
    setLoading(false);
  };

  const handleCheckin = async (id: number) => {
    setLoading(true);
    const res = await checkinAppointment(id);
    if (res.ok) await loadAppointments(status, date);
    else setError(res.error || "Check-in failed");
    setViewItem(null);
    setLoading(false);
  };

  const handleOpenCancelModal = (id: number) => {
    setCancelAppointmentId(id);
    setCancelReason("Bệnh nhân yêu cầu hủy");
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
      await loadAppointments(status, date);
      setShowCancelModal(false);
      setCancelAppointmentId(null);
      setViewItem(null);
    } else {
      setError(res.error || "Hủy lịch hẹn thất bại.");
    }
    setLoading(false);
  };

  // Load available shifts for reschedule (filtered by the same doctor)
  const loadAvailableShifts = async (targetDate: string, doctorId?: number) => {
    setLoadingShifts(true);
    setError("");
    try {
      let shifts: DoctorShift[];
      
      // If doctorId is provided, use the endpoint that fetches shifts by doctor and date
      // This ensures we get all shifts for that doctor, even if no appointments exist yet
      if (doctorId) {
        shifts = await fetchShiftsByDoctorAndDate(doctorId, targetDate);
      } else {
        // Fallback: if no doctorId, get all shifts (shouldn't happen in normal flow)
        shifts = await fetchAllShiftsByDate(targetDate);
      }
      
      // Hiển thị tất cả shifts (kể cả khi chưa có slots - backend sẽ tự động tạo khi reschedule)
      const shiftsWithAvailableSlots = shifts.map((s) => {
        const rawSlots = Array.isArray(s.slots) ? (s.slots as DoctorShiftSlot[]) : [];
        const availableCount = rawSlots.filter((slot) => {
          const status = (slot.status ?? slot.slotStatus ?? "").toUpperCase();
          return status === "AVAILABLE" || status === "FREE";
        }).length;
        return {
          ...s,
          slots: rawSlots,
          availableSlotsCount: availableCount,
        };
      });
      // Không filter - hiển thị tất cả shifts, backend sẽ tự động tạo slots nếu cần
      
      setAvailableShifts(shiftsWithAvailableSlots as DoctorShiftWithSlots[]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load available shifts";
      setError(message);
      setAvailableShifts([]);
    } finally {
      setLoadingShifts(false);
    }
  };

  // Open reschedule modal and load available shifts
  const handleOpenReschedule = async (id: number) => {
    setError(""); // Clear previous errors
    
    // Mở modal ngay để user thấy UI
    setRescheduleAppointmentId(id);
    setSelectedShiftId(null);
    setRescheduleDate(date); // Default to current filter date
    setShowRescheduleModal(true);
    
    setLoading(true);
    
    try {
      // Luôn fetch detail để đảm bảo có đầy đủ thông tin (đặc biệt là doctorId)
      const { fetchDetail } = await import("../../api/appointment");
      const detailRes = await fetchDetail(id);
      
      if (!detailRes.ok || !detailRes.data) {
        setError(detailRes.error || "Không thể tải thông tin appointment");
        setLoading(false);
        return;
      }
      
      const appointmentDetail = detailRes.data;
      
      // Lấy doctorId từ detail (có thể từ doctorId trực tiếp hoặc từ shift.doctor)
      let doctorId = appointmentDetail.doctorId;
      
      // Nếu vẫn không có doctorId, thử tìm từ appointment trong list
      if (!doctorId) {
        const appointment = appointments.find(a => a.id === id);
        doctorId = appointment?.doctorId;
      }
      
      // Nếu vẫn không có, thử lấy từ raw response data
      if (!doctorId && detailRes.data) {
        const rawData = detailRes.data as { shift?: { doctor?: { id?: number }; doctorId?: number }; doctor?: { id?: number } };
        // Thử các cách khác để lấy doctorId
        if (rawData.shift?.doctor?.id) {
          doctorId = rawData.shift.doctor.id;
        } else if (rawData.shift?.doctorId) {
          doctorId = rawData.shift.doctorId;
        } else if (rawData.doctor?.id) {
          doctorId = rawData.doctor.id;
        }
      }
      
      // Nếu vẫn không có, hiển thị lỗi nhưng vẫn giữ modal mở
      if (!doctorId) {
        setError("Không thể xác định bác sĩ cho appointment này. Vui lòng kiểm tra lại thông tin appointment.");
        setLoading(false);
        return;
      }
      
      setRescheduleDoctorId(doctorId);
      
      // Load shifts filtered by the same doctor
      await loadAvailableShifts(date, doctorId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Không thể tải thông tin appointment";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Execute reschedule with selected shift
  const handleReschedule = async () => {
    if (!rescheduleAppointmentId || !selectedShiftId) {
      setError("Please select a shift");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await rescheduleAppointment(rescheduleAppointmentId, selectedShiftId);
        if (res.ok) {
          await loadAppointments(status, date);
          setShowRescheduleModal(false);
          setViewItem(null);
          setRescheduleAppointmentId(null);
          setSelectedShiftId(null);
          setRescheduleDoctorId(null);
        } else {
        setError(res.error || "Reschedule failed");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Reschedule failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /* ----- CLIENT FILTERS & PAGING ----- */
  const filtered = useMemo(
    () => applyClientFilters(appointments, { specialty, search }),
    [appointments, specialty, search]
  );
  const paged = useMemo(
    () => paginate(filtered, page, pageSize),
    [filtered, page]
  );

  /* ----------------------------- RENDER ----------------------------- */
  return (
    <div className="recep-wrap">
      {/* ---------- FILTER BAR ---------- */}
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
          <Form.Label>Specialty</Form.Label>
          <Form.Select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="ALL">All specialties</option>
            {specialties.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </Form.Select>
        </Col>

        <Col lg={3} md={6}>
          <Form.Label>Date</Form.Label>
          <Form.Control
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Col>

        <Col lg={3} md={6}>
          <Form.Label>Search</Form.Label>
          <InputGroup>
            <Form.Control
              placeholder="Search by patient or doctor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={() => setSearch("")}>
              Clear
            </Button>
          </InputGroup>
        </Col>
      </Row>

      {error && <div className="text-danger mt-2">{error}</div>}

        <div className="legend justify-content-end mt-2">
          {STATUS_OPTIONS.map((s) => (
            <LegendDot key={s} tone={statusTone[s]} label={statusLabel[s]} />
          ))}
        </div>

      {/* ---------- TABLE ---------- */}
      <div className="table-card">
        <div className="table-title">
          <h6>Appointments List</h6>
        </div>

        <Table responsive hover className="appt-table align-middle">
          <thead>
            <tr>
              <th>DATE - TIME</th>
              <th>PATIENT</th>
              <th>DOCTOR</th>
              <th>SPECIALTY</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>Loading...</td>
              </tr>
            )}

            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={6}>No appointments found</td>
              </tr>
            )}

            {paged.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.appointmentDate} {a.appointmentTime}
                </td>
                <td>{a.patientName || "N/A"}</td>
                <td>{a.doctorName || "N/A"}</td>
                <td>{a.specialtyName || "-"}</td>
                <td>
                  <AppointmentStatus status={a.status} withBadge />
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={() => setViewItem(a)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Paging
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
        />
      </div>

      {/* ---------- MODAL ---------- */}
      <Modal show={!!viewItem} onHide={() => setViewItem(null)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            Appointment #{viewItem?.appointmentNo || viewItem?.id}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewItem && (
            <div className="detail-grid">
              <Detail label="Date">
                {viewItem.appointmentDate} {viewItem.appointmentTime}
              </Detail>
              <Detail label="Patient">{viewItem.patientName}</Detail>
              <Detail label="Doctor">{viewItem.doctorName}</Detail>
              <Detail label="Specialty">{viewItem.specialtyName}</Detail>
              <Detail label="Type">
                {viewItem.type ? (
                  <span className={`badge ${viewItem.type === "ONLINE" ? "bg-info" : "bg-secondary"}`}>
                    {viewItem.type === "ONLINE" ? "Online" : "Offline"}
                  </span>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Status">
                <AppointmentStatus status={viewItem.status} withBadge={false} />
              </Detail>
              {viewItem.reason && (
                <Detail label="Reason">{viewItem.reason}</Detail>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Stack direction="horizontal" gap={2} className="ms-auto">
            {viewItem?.status === "PENDING_CONFIRM" && (
              <>
                <Button onClick={() => handleConfirm(viewItem.id)}>
                  Confirm
                </Button>
                <Button
                  variant="outline-danger"
                  onClick={() => handleOpenCancelModal(viewItem.id)}
                >
                  Cancel
                </Button>
              </>
            )}

            {viewItem?.status === "CONFIRMED" && (
              <>
                <Button
                  variant="success"
                  onClick={() => handleCheckin(viewItem.id)}
                >
                  Check in
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => handleOpenReschedule(viewItem.id)}
                >
                  Reschedule
                </Button>
                <Button
                  variant="outline-danger"
                  onClick={() => handleOpenCancelModal(viewItem.id)}
                >
                  Cancel
                </Button>
              </>
            )}

            {viewItem?.status === "RESCHEDULED" && (
              <>
                <Button
                  variant="success"
                  onClick={() => handleCheckin(viewItem.id)}
                >
                  Check in
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => handleOpenReschedule(viewItem.id)}
                >
                  Reschedule
                </Button>
                <Button
                  variant="outline-danger"
                  onClick={() => handleOpenCancelModal(viewItem.id)}
                >
                  Cancel
                </Button>
              </>
            )}

            {viewItem?.status === "CANCELLED" && (
              <>
                <Button
                  variant="primary"
                  onClick={() => handleOpenReschedule(viewItem.id)}
                >
                  Reschedule
                </Button>
              </>
            )}
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* ---------- RESCHEDULE MODAL ---------- */}
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
          <Modal.Title>Reschedule Appointment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <div className="alert alert-danger mb-3" role="alert">
              {error}
            </div>
          )}
          <div className="mb-3">
            {(() => {
              const appointment = appointments.find(a => a.id === rescheduleAppointmentId);
              return appointment?.doctorName && (
                <div className="alert alert-info mb-3">
                  <strong>Doctor:</strong> {appointment.doctorName} - Only shifts for this doctor will be shown.
                </div>
              );
            })()}
            <Form.Group className="mb-3">
              <Form.Label>
                <strong>Select date for new shift:</strong>
              </Form.Label>
              <Form.Control
                type="date"
                value={rescheduleDate}
                min={toISODateInput(new Date())}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setRescheduleDate(newDate);
                  setSelectedShiftId(null);
                  // Sử dụng doctorId đã lưu trong state
                  if (rescheduleDoctorId) {
                    loadAvailableShifts(newDate, rescheduleDoctorId);
                  }
                }}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                <strong>Select a new shift:</strong>
              </Form.Label>
              {loadingShifts && <div>Loading available shifts...</div>}
              {!loadingShifts && availableShifts.length === 0 && (
                <div className="text-warning">
                  No available shifts found for the same doctor on {rescheduleDate}. Please select another date.
                </div>
              )}
              {!loadingShifts && availableShifts.length > 0 && (
                <Form.Select
                  value={selectedShiftId || ""}
                  onChange={(e) => setSelectedShiftId(Number(e.target.value) || null)}
                >
                  <option value="">-- Select a shift --</option>
                  {availableShifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.doctorName || "N/A"} - {shift.shift} ({shift.startTime} - {shift.endTime})
                      {shift.availableSlotsCount !== undefined && shift.availableSlotsCount > 0 
                        ? ` - ${shift.availableSlotsCount} slot(s) available`
                        : ""}
                    </option>
                  ))}
                </Form.Select>
              )}
            </Form.Group>

            {selectedShiftId && (
              <div className="mt-3 p-3 bg-light rounded">
                <div>
                  <strong>Selected shift:</strong>
                </div>
                <div className="mt-2">
                  <div>
                    <strong>Doctor:</strong> {availableShifts.find((s) => s.id === selectedShiftId)?.doctorName || "N/A"}
                  </div>
                  <div>
                    <strong>Shift:</strong> {availableShifts.find((s) => s.id === selectedShiftId)?.shift}
                  </div>
                  <div>
                    <strong>Time:</strong> {availableShifts.find((s) => s.id === selectedShiftId)?.startTime} - {availableShifts.find((s) => s.id === selectedShiftId)?.endTime}
                  </div>
                  <div>
                    <strong>Date:</strong> {availableShifts.find((s) => s.id === selectedShiftId)?.date}
                  </div>
                  <div>
                    <strong>Available slots:</strong> {
                      (() => {
                        const selectedShift = availableShifts.find((s) => s.id === selectedShiftId);
                        const count = selectedShift?.availableSlotsCount;
                        if (count !== undefined && count > 0) {
                          return `${count} slot(s) available`;
                        } else {
                          return "0";
                        }
                      })()
                    }
                  </div>
                </div>
              </div>
            )}
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
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleReschedule}
              disabled={!selectedShiftId || loading}
            >
              Confirm Reschedule
            </Button>
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* Modal Hủy Lịch Hẹn cho Lễ tân */}
      <Modal
        show={showCancelModal}
        onHide={() => !loading && setShowCancelModal(false)}
        centered
      >
        <Modal.Header closeButton={!loading}>
          <Modal.Title>Xác nhận hủy lịch hẹn</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Vui lòng nhập lý do hủy lịch hẹn (bắt buộc theo quy định hệ thống):
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
              "Bệnh nhân yêu cầu hủy",
              "Bác sĩ bận lịch đột xuất",
              "Bệnh nhân không có mặt",
              "Trùng lịch khám khác",
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

/* ----------------------------- MINI COMPONENTS ----------------------------- */
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