import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Container, Form, Row, Stack, Table } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchSpecialties, type Specialty } from "../../api/specialty";
import { fetchDoctorsBySpecialty, fetchDoctorById, type Doctor } from "../../api/doctor";
import { http } from "../../api/http";
import { fetchShiftsByDoctorAndDate } from "../../api/shift";
import Banner from "../../components/home/Banner";
import { useAuth } from "../../hooks/useAuth";

type Gender = "Male" | "Female" | "Other";

type Slot = {
  id: number;
  startTime: string;
  endTime: string;
  status: "AVAILABLE" | "BOOKED" | string;
};
type Shift = {
  id: number;
  date: string; // yyyy-mm-dd
  shift: string; // MORNING/AFTERNOON/EVENING
  startTime?: string;
  endTime?: string;
  slots: Slot[];
};

function todayISO(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function isPastDate(iso: string): boolean {
  if (!iso) return false;
  const sel = new Date(iso + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return sel < today;
}
function isToday(iso: string): boolean {
  if (!iso) return false;
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso === ymd;
}
function timeToMinutes(hhmmss?: string): number | null {
  if (!hhmmss) return null;
  const [h, m, s] = hhmmss.split(":").map((v) => parseInt(v || "0", 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m + (Number.isNaN(s) ? 0 : Math.floor(s / 60));
}
function isShiftPastForSelectedDate(sh: Shift, dateISO: string): boolean {
  if (isPastDate(dateISO)) return true;
  if (!isToday(dateISO)) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const end = timeToMinutes(sh.endTime);
  return end != null ? nowMinutes >= end : false;
}

export default function Appointment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Step 1 — personal info
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");

  // Step 2 — appointment info
  const [date, setDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const selectedDoctor = useMemo(() => doctors.find(d => String(d.id) === doctorId) || null, [doctors, doctorId]);
  const selectedSpecialty = useMemo(() => specialties.find(s => String(s.id) === specialtyId) || null, [specialties, specialtyId]);

  // Read doctorId from URL params and auto-select doctor
  useEffect(() => {
    const urlDoctorId = searchParams.get("doctorId");
    if (urlDoctorId && !doctorId) {
      setDoctorId(urlDoctorId);
      // Fetch doctor details to get specialtyId
      fetchDoctorById(Number(urlDoctorId))
        .then((doctor) => {
          if (doctor.specialtyId) {
            setSpecialtyId(String(doctor.specialtyId));
          }
        })
        .catch(() => {
          // If fetch fails, just set doctorId
        });
    }
  }, [searchParams, doctorId]);

  useEffect(() => {
    fetchSpecialties().then(setSpecialties).catch(() => {});
  }, []);

  useEffect(() => {
    if (!specialtyId) {
      setDoctors([]);
      // Don't clear doctorId if it came from URL
      const urlDoctorId = searchParams.get("doctorId");
      if (!urlDoctorId) {
        setDoctorId("");
      }
      return;
    }
    fetchDoctorsBySpecialty(Number(specialtyId)).then(setDoctors).catch(() => setDoctors([]));
  }, [specialtyId, searchParams]);

  useEffect(() => {
    setShifts([]);
    setSelectedShift(null);
    // clear previous selection
    if (!doctorId || !date) return;
    (async () => {
      setLoadingShifts(true);
      try {
        const arr = await fetchShiftsByDoctorAndDate(doctorId, date);
        const normalized: Shift[] = (arr || []).map((raw: any) => ({
          id: Number(raw.id),
          date: raw.date || "",
          shift: raw.shift || raw.shiftType || "",
          startTime: raw.startTime,
          endTime: raw.endTime,
          slots: Array.isArray(raw.slots) ? raw.slots.map((s: any) => ({
            id: Number(s.id), startTime: s.startTime, endTime: s.endTime, status: s.status || s.slotStatus || "AVAILABLE"
          })) : [],
        }));
        setShifts(normalized);
      } catch {
        setShifts([]);
      } finally {
        setLoadingShifts(false);
      }
    })();
  }, [doctorId, date]);

  function getFieldErrors() {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Vui lòng nhập họ tên";
    if (!gender) errs.gender = "Vui lòng chọn giới tính";
    if (!phoneNumber.trim()) errs.phoneNumber = "Vui lòng nhập số điện thoại";
    else if (!/^\d{10}$/.test(phoneNumber)) errs.phoneNumber = "Số điện thoại phải gồm 10 chữ số";
    if (!address.trim()) errs.address = "Vui lòng nhập địa chỉ";
    if (!dob) errs.dob = "Vui lòng chọn ngày sinh";
    else {
      const today = new Date();
      const d = new Date(dob);
      const hundredYearsAgo = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
      const isSameDate = d.toDateString() === today.toDateString();
      if (isSameDate || d < hundredYearsAgo || d > today) errs.dob = "Ngày sinh không hợp lệ";
    }
    return errs;
  }
  const fieldErrors = getFieldErrors();
  const hasAnyError = Object.keys(fieldErrors).length > 0;

  const { isAuthenticated, user } = useAuth();

  function canProceedStep2(): boolean {
    return !!date && !!specialtyId && !!doctorId && !!selectedShift;
  }

  async function submitBooking() {
    if (!canProceedStep2()) {
      return;
    }
    const role = user?.userType || user?.role;
    if (!isAuthenticated || (role !== "Patient" && role !== "Admin")) {
      navigate("/login", { replace: false, state: { from: "/appointment" } as any });
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        appointment: { reason },
        patients: [
          { fullName, gender, phoneNumber, address, dob }
        ],
        shiftId: selectedShift!.id,
      } as unknown;
      const params = `?specialtyId=${encodeURIComponent(specialtyId)}&doctorId=${encodeURIComponent(doctorId)}`;
      await http.post(`/appointments/create${params}`, body);
      setStep(1);
    } catch (e: unknown) {
    } finally {
      setSubmitting(false);
    }
  }

  async function autofillMyInfo() {
    try {
      const res = await http.get(`/patients-info/my`);
      const arr = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      const me = arr?.[0];
      if (me) {
        setFullName(me.fullName || "");
        const g = String(me.gender || "").toUpperCase();
        const mapped = g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : g === "OTHER" ? "Other" : "";
        setGender(mapped as Gender | "");
        setPhoneNumber(me.phoneNumber || "");
        setAddress(me.address || "");
        setDob(me.dob || "");
      }
    } catch {}
  }

  // Clear selected shift if date changes to past or the chosen shift becomes invalid for today
  useEffect(() => {
    if (!selectedShift) return;
    if (isShiftPastForSelectedDate(selectedShift, date)) {
      setSelectedShift(null);
    }
  }, [date, shifts]);

  return (
    <>
      <Banner />
      <Container className="py-4">
      <Row className="g-4">
      <Col md={9}>
        <div className="mb-3">
          <Stack direction="horizontal" gap={2}>
            <Button variant={step === 1 ? "primary" : "outline-primary"} disabled>1. Thông tin cá nhân</Button>
            <Button variant={step === 2 ? "primary" : "outline-primary"} disabled>2. Thông tin lịch hẹn</Button>
            <Button variant={step === 3 ? "primary" : "outline-primary"} disabled>3. Xác nhận</Button>
          </Stack>
        </div>

        {step === 1 && (
          <Card>
            <Card.Body>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="fullName">
                    <Form.Label>Họ tên</Form.Label>
                    <Form.Control
                      value={fullName}
                      isInvalid={!!fieldErrors.fullName && !!touched.fullName}
                      onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                      onChange={(e) => { setFullName(e.target.value); if (!touched.fullName) setTouched((t) => ({ ...t, fullName: true })); }}
                    />
                    <Form.Control.Feedback type="invalid">{fieldErrors.fullName}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="gender">
                    <Form.Label>Giới tính</Form.Label>
                    <Form.Select
                      value={gender}
                      isInvalid={!!fieldErrors.gender && !!touched.gender}
                      onBlur={() => setTouched((t) => ({ ...t, gender: true }))}
                      onChange={(e) => { setGender(e.target.value as Gender); if (!touched.gender) setTouched((t) => ({ ...t, gender: true })); }}
                    >
                      <option value="">-- Chọn --</option>
                      <option value="Male">Nam</option>
                      <option value="Female">Nữ</option>
                      <option value="Other">Khác</option>
                    </Form.Select>
                    <Form.Control.Feedback type="invalid">{fieldErrors.gender}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="phone">
                    <Form.Label>Số điện thoại</Form.Label>
                    <Form.Control
                      value={phoneNumber}
                      isInvalid={!!fieldErrors.phoneNumber && !!touched.phoneNumber}
                      onBlur={() => setTouched((t) => ({ ...t, phoneNumber: true }))}
                      onChange={(e) => { setPhoneNumber(e.target.value); if (!touched.phoneNumber) setTouched((t) => ({ ...t, phoneNumber: true })); }}
                    />
                    <Form.Control.Feedback type="invalid">{fieldErrors.phoneNumber}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="dob">
                    <Form.Label>Ngày sinh</Form.Label>
                    <Form.Control
                      type="date"
                      value={dob}
                      isInvalid={!!fieldErrors.dob && !!touched.dob}
                      onBlur={() => setTouched((t) => ({ ...t, dob: true }))}
                      onChange={(e) => { setDob(e.target.value); if (!touched.dob) setTouched((t) => ({ ...t, dob: true })); }}
                    />
                    <Form.Control.Feedback type="invalid">{fieldErrors.dob}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="address">
                    <Form.Label>Địa chỉ</Form.Label>
                    <Form.Control
                      value={address}
                      isInvalid={!!fieldErrors.address && !!touched.address}
                      onBlur={() => setTouched((t) => ({ ...t, address: true }))}
                      onChange={(e) => { setAddress(e.target.value); if (!touched.address) setTouched((t) => ({ ...t, address: true })); }}
                    />
                    <Form.Control.Feedback type="invalid">{fieldErrors.address}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              </Row>

              <div className="mt-3 d-flex justify-content-between">
                <Button variant="outline-secondary" onClick={autofillMyInfo}>Tự điền thông tin của tôi</Button>
                <Button onClick={() => setStep(2)} disabled={hasAnyError}>Tiếp tục</Button>
              </div>
            </Card.Body>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <Card.Body>
              <Row className="g-3 mb-3">
                <Col md={4}>
                  <Form.Group controlId="date">
                    <Form.Label>Ngày khám</Form.Label>
                    <Form.Control type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group controlId="specialty">
                    <Form.Label>Chuyên khoa</Form.Label>
                    <Form.Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
                      <option value="">-- Chọn --</option>
                      {specialties.map(s => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group controlId="doctor">
                    <Form.Label>Bác sĩ</Form.Label>
                    <Form.Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!date || !specialtyId}>
                      <option value="">-- Chọn --</option>
                      {doctors.map(d => (
                        <option key={d.id} value={String(d.id)}>
                          {d.fullName}{d.specialtyName ? ` - ${d.specialtyName}` : ""}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="reason">
                    <Form.Label>Lý do khám (tuỳ chọn)</Form.Label>
                    <Form.Control as="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Form.Group>
                </Col>
              </Row>

              {!!doctorId && !!date && (
                <div>
                  <div className="fw-semibold mb-2">Các ca làm việc</div>
                  {loadingShifts ? (
                    <div>Đang tải...</div>
                  ) : shifts.length === 0 ? (
                    <div>Không có ca trong ngày</div>
                  ) : (
                    <Table bordered hover responsive>
                      <thead>
                        <tr>
                          <th>Ca</th>
                          <th>Bắt đầu</th>
                          <th>Kết thúc</th>
                          <th>Chọn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map(sh => {
                          const disabled = isShiftPastForSelectedDate(sh, date);
                          return (
                          <tr key={sh.id}>
                            <td>{sh.shift}</td>
                            <td>{sh.startTime || ""}</td>
                            <td>{sh.endTime || ""}</td>
                            <td>
                              <Button
                                size="sm"
                                variant={selectedShift?.id === sh.id ? "primary" : (disabled ? "outline-secondary" : "outline-primary")}
                                disabled={disabled}
                                onClick={() => { if (!disabled) setSelectedShift(sh); }}
                              >
                                {disabled ? "Đã qua" : (selectedShift?.id === sh.id ? "Đã chọn" : "Chọn ca")}
                              </Button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  )}
                </div>
              )}

              <div className="mt-3 d-flex justify-content-between">
                <Button variant="outline-secondary" onClick={() => setStep(1)}>Quay lại</Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedStep2()}>Tiếp tục</Button>
              </div>
            </Card.Body>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <Card.Body>
              <div className="fw-semibold mb-2">Xác nhận thông tin</div>
              <Row className="g-2">
                <Col md={6}>
                  <div className="mb-2">Họ tên: <strong>{fullName}</strong></div>
                  <div className="mb-2">Giới tính: <strong>{gender}</strong></div>
                  <div className="mb-2">SĐT: <strong>{phoneNumber}</strong></div>
                  <div className="mb-2">Ngày sinh: <strong>{dob}</strong></div>
                  <div className="mb-2">Địa chỉ: <strong>{address}</strong></div>
                </Col>
                <Col md={6}>
                  <div className="mb-2">Ngày khám: <strong>{date}</strong></div>
                  <div className="mb-2">Chuyên khoa: <strong>{selectedSpecialty?.name || ""}</strong></div>
                  <div className="mb-2">Bác sĩ: <strong>{selectedDoctor?.fullName || ""}</strong></div>
                  <div className="mb-2">Ca: <strong>{selectedShift ? `${selectedShift.shift} (${selectedShift.startTime || ""} - ${selectedShift.endTime || ""})` : ""}</strong></div>
                  {reason && <div className="mb-2">Lý do: <strong>{reason}</strong></div>}
                </Col>
              </Row>

              <Form.Check
                className="mt-3"
                type="checkbox"
                id="agree"
                label="Xác nhận thông tin trên là đúng sự thật và tôi đồng ý đăng ký khám"
                checked={agree}
                onChange={(e) => setAgree(e.currentTarget.checked)}
              />

              <div className="mt-3 d-flex justify-content-between">
                <Button variant="outline-secondary" onClick={() => setStep(2)}>Quay lại</Button>
                <Button id="btn-submit-booking" onClick={submitBooking} disabled={submitting || !agree}>Đặt lịch</Button>
              </div>
            </Card.Body>
          </Card>
        )}
      </Col>

      <Col md={3}>
        <Card>
          <Card.Body>
            <div className="fw-semibold mb-2">Bác sĩ đã chọn</div>
            {selectedDoctor ? (
              <>
                <div className="mb-1">{selectedDoctor.fullName}</div>
                {selectedDoctor.specialtyName && <div className="text-muted mb-2">{selectedDoctor.specialtyName}</div>}
                {date ? <div className="mb-2">Ngày: {date}</div> : <div className="text-muted mb-2">Chưa chọn ngày</div>}
                <div className="fw-semibold mt-2">Chọn ca khám</div>
                {(!date || !doctorId) && <div className="text-muted">Chọn ngày và bác sĩ để xem ca</div>}
                {!!date && !!doctorId && (
                  <Stack gap={2} className="mt-2">
                    {shifts.length === 0 && (
                      <div className="text-muted">Không có ca</div>
                    )}
                    {shifts.map(s => {
                      const disabled = isShiftPastForSelectedDate(s, date);
                      return (
                        <div key={s.id} className="d-flex align-items-center justify-content-between">
                          <div>{s.shift} ({s.startTime || ""}-{s.endTime || ""})</div>
                          <Button
                            size="sm"
                            variant={selectedShift?.id === s.id ? "primary" : (disabled ? "outline-secondary" : "outline-primary")}
                            disabled={disabled}
                            onClick={() => { if (!disabled) setSelectedShift(s); }}
                          >
                            {disabled ? "Đã qua" : (selectedShift?.id === s.id ? "Đã chọn" : "Chọn ca")}
                          </Button>
                        </div>
                      );
                    })}
    </Stack>
                )}
              </>
            ) : (
              <div className="text-muted">Chưa chọn bác sĩ</div>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
    </Container>
    </>
  );
}
