import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import {
  useAppt,
  type PatientSelection,
} from "../../../contexts/AppointmentContext";
import {
  fetchMyPatients,
  type PatientInfo,
} from "../../../api/patient";
import { useAuth } from "../../../hooks/useAuth";
import { fetchMyProfile } from "../../../api/user";
import { getDoctorImagePathWithFallback } from "../../../utils/doctorImage";

type ManualFormState = {
  fullName: string;
  phoneNumber: string;
  gender: "" | "Male" | "Female" | "Other";
  dob: string;
  relationship: string;
  reason: string;
};

const initialManualForm: ManualFormState = {
  fullName: "",
  phoneNumber: "",
  gender: "",
  dob: "",
  relationship: "",
  reason: "",
};

const STORAGE_KEY = "appointment_step3_manual_form";

function normalizeGender(value?: string | null): "Male" | "Female" | "Other" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "male" || normalized === "m" || normalized === "nam") {
    return "Male";
  }
  if (
    normalized === "female" ||
    normalized === "f" ||
    normalized === "nu" ||
    normalized === "nữ"
  ) {
    return "Female";
  }
  return "Other";
}

function mapToPatientSelection(p: PatientInfo): PatientSelection {
  return {
    patientInfoId: p.id,
    fullName: p.fullName,
    phoneNumber: p.phoneNumber ?? "",
    gender: normalizeGender(p.gender),
    dob: p.dob ?? "",
    relationship: p.relationship,
    reason: "",
  };
}

export default function Step3Patients() {
  const { state, dispatch } = useAppt();
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientInfo[]>([]);
  const [manualForm, setManualForm] = useState<ManualFormState>(initialManualForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingUserInfo, setLoadingUserInfo] = useState(false);

  // Get today's date in YYYY-MM-DD format for max date
  const todayDate = useMemo(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }, []);

  const shiftSlots = state.shiftAvailableSlots ?? state.shiftTotalSlots ?? 4;
  const maxSelectable = Math.max(1, Math.min(4, shiftSlots || 1));
  const selected = state.patientSelections;
  const selectedCount = selected.length;
  const remainingSlots = Math.max(0, maxSelectable - selectedCount);

  // Load form data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setManualForm(parsed);
      }
    } catch (err) {
      console.error('Error loading form from localStorage:', err);
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manualForm));
    } catch (err) {
      console.error('Error saving form to localStorage:', err);
    }
  }, [manualForm]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMyPatients();
        if (!active) return;
        setPatients(data);
      } catch (err: unknown) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Không thể tải danh sách bệnh nhân.";
        setError(message);
        setPatients([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const bookingDateText = useMemo(() => {
    if (!state.dateISO) return "";
    const d = new Date(state.dateISO);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [state.dateISO]);

  const setSelections = (value: PatientSelection[]) => {
    dispatch({ type: "SET_PATIENT_SELECTIONS", value });
  };

  const toggleSavedPatient = (patient: PatientInfo) => {
    const index = selected.findIndex(
      (item) => item.patientInfoId === patient.id
    );
    if (index >= 0) {
      setSelections(selected.filter((_, idx) => idx !== index));
      return;
    }
    if (selectedCount >= maxSelectable) {
      setFormError(
        `Bạn chỉ có thể chọn tối đa ${maxSelectable} bệnh nhân cho ca khám này.`
      );
      return;
    }
    setFormError(null);
    setSelections([...selected, mapToPatientSelection(patient)]);
  };

  const handleManualInputChange = (
    field: keyof ManualFormState,
    value: string
  ) => {
    setManualForm((prev) => ({ ...prev, [field]: value }));
  };

  const loadUserInfo = async () => {
    if (!isAuthenticated) {
      setFormError("Vui lòng đăng nhập để sử dụng tính năng này.");
      return;
    }

    setLoadingUserInfo(true);
    setFormError(null);
    
    try {
      // Try to fetch from API first (more complete data)
      try {
        const profile = await fetchMyProfile();
        setManualForm((prev) => ({
          ...prev,
          fullName: profile.fullName || prev.fullName || "",
          phoneNumber: profile.phoneNumber || prev.phoneNumber || "",
          gender: normalizeGender(profile.gender) || prev.gender || "",
          // Don't update relationship and dob from user profile
        }));
      } catch (apiErr) {
        // Fallback to user from auth context
        console.warn('Failed to fetch profile from API, using auth context:', apiErr);
        if (user) {
          setManualForm((prev) => ({
            ...prev,
            fullName: user.fullName || prev.fullName || "",
            phoneNumber: user.phoneNumber || prev.phoneNumber || "",
            gender: normalizeGender(user.gender) || prev.gender || "",
            // Don't update relationship and dob from user
          }));
        }
      }
    } catch (err) {
      console.error('Error loading user info:', err);
      setFormError("Không thể tải thông tin từ tài khoản. Vui lòng thử lại.");
    } finally {
      setLoadingUserInfo(false);
    }
  };

  const addManualPatient = () => {
    if (selectedCount >= maxSelectable) {
      setFormError(
        `Bạn chỉ có thể chọn tối đa ${maxSelectable} bệnh nhân cho ca khám này.`
      );
      return;
    }

    if (!manualForm.fullName.trim()) {
      setFormError("Vui lòng nhập họ tên.");
      return;
    }
    if (!manualForm.phoneNumber.trim()) {
      setFormError("Vui lòng nhập số điện thoại.");
      return;
    }
    if (!manualForm.gender) {
      setFormError("Vui lòng chọn giới tính.");
      return;
    }
    if (!manualForm.dob) {
      setFormError("Vui lòng chọn ngày sinh.");
      return;
    }

    const newSelection: PatientSelection = {
      patientInfoId: null,
      fullName: manualForm.fullName.trim(),
      phoneNumber: manualForm.phoneNumber.trim(),
      gender: manualForm.gender,
      dob: manualForm.dob,
      relationship: manualForm.relationship.trim() || undefined,
      reason: manualForm.reason.trim() || undefined,
    };

    setSelections([...selected, newSelection]);
    // Keep form data in localStorage, only clear reason field for next entry
    setManualForm((prev) => ({
      ...prev,
      reason: "", // Clear reason for next patient, keep other fields
    }));
    setFormError(null);
  };

  const updateSelection = (
    index: number,
    payload: Partial<PatientSelection>
  ) => {
    setSelections(
      selected.map((item, idx) =>
        idx === index ? { ...item, ...payload } : item
      )
    );
  };

  const removeSelection = (index: number) => {
    setSelections(selected.filter((_, idx) => idx !== index));
    setFormError(null);
  };

  const canProceed = selectedCount >= 1 && selectedCount <= maxSelectable;
  const appointmentTypeLabel =
    state.appointmentType === "ONLINE" ? "Khám trực tuyến" : "Khám trực tiếp";

  return (
    <div className="appt-card p-4">
      <Row className="g-3 mb-4">
        <Col lg={5} xl={4}>
          <Card className="appt-inner-card h-100">
            <Card.Body>
              <div className="doctor-preview doctor-preview--compact">
                <div className="doctor-preview__photo">
                  {getDoctorImagePathWithFallback(state.doctorFullName) ? (
                    <img
                      src={getDoctorImagePathWithFallback(state.doctorFullName)!}
                      alt={state.doctorFullName || "Doctor"}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = target.parentElement?.querySelector('.doctor-preview-placeholder');
                        if (placeholder) {
                          (placeholder as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className="doctor-preview-placeholder"
                    style={{ 
                      display: getDoctorImagePathWithFallback(state.doctorFullName) ? 'none' : 'flex',
                      width: '100%',
                      height: '150px',
                      backgroundColor: '#e9ecef',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6c757d',
                      fontSize: '36px',
                      fontWeight: 'bold',
                      borderRadius: '8px'
                    }}
                  >
                    {state.doctorFullName?.charAt(0)?.toUpperCase() || 'BS'}
                  </div>
                </div>
                <div className="doctor-preview__info">
                  <div className="doctor-preview__name">
                    {state.doctorFullName}
                    {state.doctorDegree ? ` - ${state.doctorDegree}` : ""}
                  </div>
                  <div className="doctor-preview__specialty">
                    {state.specialtyName || "Chuyên khoa"}
                  </div>
                  <div className="doctor-preview__meta">
                    {state.doctorExperience || "Kinh nghiệm chưa cập nhật"}
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={7} xl={8}>
          <Card className="appt-inner-card h-100">
            <Card.Body>
              <div className="appt-heading mb-3">Booking Info</div>
              <div className="booking-info-grid">
                <div>
                  <div className="booking-info__label">Ngày khám</div>
                  <div className="booking-info__value">
                    {bookingDateText || "Chưa chọn"}
                  </div>
                </div>
                <div>
                  <div className="booking-info__label">Ca khám</div>
                  <div className="booking-info__value">
                    {state.shiftLabel || state.shiftName || "Khám online"}
                  </div>
                </div>
                {state.slotStartTime && (
                  <div>
                    <div className="booking-info__label">Giờ khám dự kiến</div>
                    <div className="booking-info__value text-primary fw-bold">
                      {state.slotStartTime} - {state.slotEndTime || ""}
                      {state.queueOrder && (
                        <span className="badge bg-primary-subtle text-primary ms-2" style={{ fontSize: "11px" }}>
                          Lượt #{state.queueOrder}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <div className="booking-info__label">Hình thức</div>
                  <div className="booking-info__badge">{appointmentTypeLabel}</div>
                </div>
                <div>
                  <div className="booking-info__label">Số bệnh nhân</div>
                  <div className="booking-info__value">
                    {selectedCount}/{maxSelectable}
                  </div>
                </div>
              </div>
              <div className="booking-info__footnote mt-3">
                {remainingSlots > 0
                  ? `Còn ${remainingSlots} chỗ trống trong ca khám này.`
                  : "Ca khám đã đầy với số bệnh nhân hiện tại."}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="appt-inner-card mb-4">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h5 className="mb-0">Hồ sơ bệnh nhân đã lưu</h5>
            <small className="text-muted">
              
            </small>
            <div className="appt-header mb-4 justify-content-end">
              Chạm để chọn <div className="appt-selected-tag">{selectedCount}/{maxSelectable} bệnh nhân</div>
            </div>
          </div>
          {loading ? (
            <div className="d-flex align-items-center gap-2 text-muted">
              <Spinner size="sm" /> Đang tải hồ sơ bệnh nhân…
            </div>
          ) : patients.length === 0 ? (
            <div className="text-muted">
              Bạn chưa có hồ sơ bệnh nhân nào. Hãy thêm mới bên dưới.
            </div>
          ) : (
            <div className="patient-scroll">
              {patients.map((patient) => {
                const isSelected = selected.some(
                  (item) => item.patientInfoId === patient.id
                );
                const disabled = !isSelected && selectedCount >= maxSelectable;
                return (
                  <Card
                    key={patient.id}
                    role="button"
                    className={`patient-card p-3 ${
                      isSelected ? "border-primary shadow-sm" : ""
                    } ${disabled ? "opacity-50" : ""}`}
                    onClick={() => toggleSavedPatient(patient)}
                  >
                    <div className="fw-semibold">{patient.fullName}</div>
                    <div className="text-muted small">
                      {patient.relationship || "Chưa rõ quan hệ"}
                    </div>
                    <div className="text-muted small">
                      {normalizeGender(patient.gender)}
                      {patient.dob ? ` · ${patient.dob}` : ""}
                    </div>
                    <div className="text-muted small">
                      {patient.phoneNumber || "Chưa có số điện thoại"}
                    </div>
                    {isSelected && (
                      <div className="text-end">
                        <span className="badge bg-primary">Đã chọn</span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="appt-inner-card mb-4">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h5 className="mb-0">Thêm bệnh nhân mới</h5>
            <small className="text-muted">
              Điền thông tin để thêm bệnh nhân khác cho cùng ca khám
            </small>
          </div>
          {isAuthenticated && patients.length === 0 && (
            <div className="mb-3">
              <Button
                variant="outline-info"
                size="sm"
                onClick={loadUserInfo}
                disabled={loadingUserInfo}
              >
                {loadingUserInfo ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Đang tải...
                  </>
                ) : (
                  "📋 Lấy thông tin từ tài khoản"
                )}
              </Button>
              <small className="text-muted ms-2">
                Điền tự động họ tên, số điện thoại, giới tính từ tài khoản của bạn
              </small>
            </div>
          )}
          <Row className="g-3">
            <Col md={6}>
              <Form.Label>Họ và tên</Form.Label>
              <Form.Control
                value={manualForm.fullName}
                onChange={(e) => handleManualInputChange("fullName", e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </Col>
            <Col md={6}>
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                value={manualForm.phoneNumber}
                onChange={(e) =>
                  handleManualInputChange("phoneNumber", e.target.value)
                }
                placeholder="09xx xxx xxx"
              />
            </Col>
            <Col md={4}>
              <Form.Label>Giới tính</Form.Label>
              <Form.Select
                value={manualForm.gender}
                onChange={(e) =>
                  handleManualInputChange(
                    "gender",
                    e.target.value as ManualFormState["gender"]
                  )
                }
              >
                <option value="">-- Chọn --</option>
                <option value="Male">Nam</option>
                <option value="Female">Nữ</option>
                <option value="Other">Khác</option>
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label>Ngày sinh</Form.Label>
              <Form.Control
                type="date"
                value={manualForm.dob}
                onChange={(e) => handleManualInputChange("dob", e.target.value)}
                max={todayDate}
              />
            </Col>
            <Col md={4}>
              <Form.Label>Mối quan hệ</Form.Label>
              <Form.Control
                value={manualForm.relationship}
                onChange={(e) =>
                  handleManualInputChange("relationship", e.target.value)
                }
                placeholder="Gia đình, bạn bè…"
              />
            </Col>
            <Col md={12}>
              <Form.Label>Lý do khám (tuỳ chọn)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={manualForm.reason}
                onChange={(e) => handleManualInputChange("reason", e.target.value)}
                placeholder="Mô tả ngắn gọn triệu chứng hoặc nhu cầu khám…"
              />
            </Col>
          </Row>
          <div className="d-flex justify-content-end mt-3">
            <Button
              variant="outline-primary"
              onClick={addManualPatient}
              disabled={selectedCount >= maxSelectable}
            >
              Thêm bệnh nhân vào danh sách
            </Button>
          </div>
          {formError && (
            <Alert variant="warning" className="mt-3 mb-0">
              {formError}
            </Alert>
          )}
        </Card.Body>
      </Card>

      <Card className="appt-inner-card mb-4">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h5 className="mb-0">Danh sách bệnh nhân sẽ đặt lịch</h5>
            <small className="text-muted">
              Nhấn xoá để bỏ bớt bệnh nhân khỏi danh sách
            </small>
          </div>
          {selected.length === 0 ? (
            <div className="text-muted">
              Bạn chưa thêm bệnh nhân nào. Hãy chọn từ danh sách hoặc nhấn “Thêm bệnh nhân vào danh sách”.
            </div>
          ) : (
            <Row className="g-3">
              {selected.map((item, index) => (
                <Col md={6} key={`${item.patientInfoId ?? "manual"}-${index}`}>
                  <Card className="p-3 h-100 border-0 shadow-sm rounded-4">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-semibold">{item.fullName}</div>
                        <div className="text-muted small">
                          {item.gender}
                          {item.dob ? ` · ${item.dob}` : ""}
                        </div>
                        <div className="text-muted small">{item.phoneNumber}</div>
                        <div className="text-muted small">
                          {item.relationship || "Mối quan hệ chưa cập nhật"}
                        </div>
                        <span className="badge bg-light text-dark mt-2">
                          {item.patientInfoId ? "Hồ sơ đã lưu" : "Nhập thủ công"}
                        </span>
                      </div>
                      <Button
                        variant="link"
                        className="text-danger p-0"
                        onClick={() => removeSelection(index)}
                      >
                        Xoá
                      </Button>
                    </div>
                    <Form.Group className="mt-3">
                      <Form.Label className="small">
                        Lý do khám (có thể chỉnh sửa)
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        value={item.reason ?? ""}
                        onChange={(e) =>
                          updateSelection(index, { reason: e.target.value })
                        }
                        placeholder="Nhập lý do khám cho bệnh nhân này…"
                      />
                    </Form.Group>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card.Body>
      </Card>

      <div className="appt-bottom">
        <button
          className="btn-back"
          onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
        >
          Quay lại
        </button>
        <button
          className="btn-next"
          disabled={!canProceed}
          onClick={() => dispatch({ type: "SET_STEP", step: 4 })}
        >
          Tiếp tục
        </button>
      </div>
    </div>
  );
}
