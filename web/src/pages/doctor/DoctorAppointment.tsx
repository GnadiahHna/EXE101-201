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
  startAppointment as apiStartAppointment,
  completeAppointment as apiCompleteAppointment,
} from "../../api/appointment";
import { getPrescriptionsByAppointment, type Prescription as PrescriptionType } from "../../api/prescription";

import AppointmentStatus from "../../components/appointment/AppointmentStatus";
import type { UiStatus } from "../../components/appointment/AppointmentStatus";
import { normStatus, STATUS_OPTIONS, statusLabel, statusTone } from "../../components/appointment/AppointmentStatus";

import { fetchMyShifts, type DoctorShift } from "../../api/shift";
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
  const [intakeSummary, setIntakeSummary] = useState<{ summary?: string; bullets?: string[]; verifiedDisclaimer?: string } | null>(null);

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
          <Modal.Title>Appointment #{viewItem?.appointmentNo || viewItem?.id}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewItem && (
            <div className="detail-grid">
              <Detail label="Date">{viewItem.appointmentDate}</Detail>
              <Detail label="Time">{viewItem.appointmentTime}</Detail>
              <Detail label="Patient">{viewItem.patientName}</Detail>
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
                <AppointmentStatus status={normStatus(viewItem.status)} withBadge={false} />
              </Detail>
              {viewItem.reason && <Detail label="Reason">{viewItem.reason}</Detail>}

              {/* Patient Intake Information Card */}
              <div className="mt-3 p-3 border rounded bg-light">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0 fw-bold">Thông tin Tiền Khám (Medical Intake):</h6>
                  <Button
                    size="sm"
                    variant="outline-info"
                    disabled={loadingSummary}
                    onClick={async () => {
                      if (!viewItem) return;
                      setLoadingSummary(true);
                      try {
                        const res = await (await import("../../api/http")).http.post(
                          `/doctor/appointments/${viewItem.id}/intake-summary`
                        );
                        setIntakeSummary(res.data?.data || res.data);
                      } catch (err: any) {
                        alert(err.response?.data?.message || "Không thể tạo tóm tắt AI.");
                      } finally {
                        setLoadingSummary(false);
                      }
                    }}
                  >
                    {loadingSummary ? "Đang xử lý..." : "✨ Tóm tắt tiền khám AI"}
                  </Button>
                </div>

                {intakeSummary && (
                  <div className="alert alert-info py-2 px-3 mb-2">
                    <div className="fw-semibold small text-primary mb-1">
                      {intakeSummary.verifiedDisclaimer || "Bản nháp do AI, bác sĩ cần xác minh"}
                    </div>
                    {intakeSummary.bullets && intakeSummary.bullets.length > 0 ? (
                      <ul className="mb-0 ps-3 small">
                        {intakeSummary.bullets.map((b: string, i: number) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="small">{intakeSummary.summary}</div>
                    )}
                  </div>
                )}

                <div className="small text-secondary">
                  <div><strong>Triệu chứng:</strong> {(viewItem as any).intake?.symptoms || viewItem.reason || "Chưa ghi nhận"}</div>
                  <div><strong>Thời gian xuất hiện:</strong> {(viewItem as any).intake?.duration || "—"}</div>
                  <div><strong>Dị ứng thuốc/thực phẩm:</strong> <span className="text-danger fw-semibold">{(viewItem as any).intake?.allergies || "Không rõ / Chưa ghi nhận"}</span></div>
                  <div><strong>Tiền sử bệnh lý:</strong> {(viewItem as any).intake?.medicalHistory || "—"}</div>
                  <div><strong>Thuốc đang dùng:</strong> {(viewItem as any).intake?.currentMedications || "—"}</div>
                  {((viewItem as any).intake?.heightCm || (viewItem as any).intake?.weightKg) && (
                    <div><strong>Chỉ số sinh trắc:</strong> Chiều cao: {(viewItem as any).intake?.heightCm || "—"} cm, Cân nặng: {(viewItem as any).intake?.weightKg || "—"} kg</div>
                  )}
                </div>
              </div>
              
              {/* Display prescriptions if any */}
              {prescriptions.length > 0 && (
                <div className="mt-3">
                  <h6>Prescription(s):</h6>
                  {prescriptions.map((prescription, idx) => (
                    <div key={prescription.id || idx} className="border rounded p-3 mb-2">
                      <div><strong>Medicine:</strong> {prescription.medicineName || "-"}</div>
                      {prescription.dosage && <div><strong>Dosage:</strong> {prescription.dosage}</div>}
                      {prescription.duration && <div><strong>Duration:</strong> {prescription.duration}</div>}
                      {prescription.instructions && (
                        <div><strong>Instructions:</strong> {prescription.instructions}</div>
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
            {/* Only show actions if appointment is not completed */}
            {viewItem && normStatus(viewItem.status) !== "COMPLETED" && (
              <>
                {/* CHECK_IN -> Start */}
                {normStatus(viewItem.status) === "CHECK_IN" && (
                  <Button onClick={() => startAppointment(viewItem.id)}>Start</Button>
                )}

                {/* IN_PROGRESS -> Add/Edit Prescription -> Complete */}
                {normStatus(viewItem.status) === "IN_PROGRESS" && (
                  <>
                    {addedPrescription ? (
                      <Button
                        variant="outline-primary"
                        onClick={() => openPrescriptionModal(true)}
                      >
                        Edit Prescription
                      </Button>
                    ) : (
                      <Button
                        variant="outline-secondary"
                        onClick={() => openPrescriptionModal(false)}
                      >
                        Add Prescription
                      </Button>
                    )}
                    <Button
                      variant="success"
                      onClick={() => completeAppointment(viewItem.id)}
                      disabled={!addedPrescription}
                    >
                      Complete
                    </Button>
                  </>
                )}
              </>
            )}
            
            {/* If completed, show info message or nothing */}
            {viewItem && normStatus(viewItem.status) === "COMPLETED" && (
              <div className="text-muted">Appointment completed. View only.</div>
            )}
          </Stack>
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
