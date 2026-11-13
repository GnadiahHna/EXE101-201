import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAppt, type SelectedVoucherInfo } from "../../../contexts/AppointmentContext";
import { bookAppointment, type Appointment } from "../../../api/appointment";
import {
  claimVoucher,
  fetchMyVouchers,
  fetchPublicVouchers,
  type UserVoucher,
  type VoucherItem,
} from "../../../api/voucher";
import { getDoctorImagePathWithFallback } from "../../../utils/doctorImage";
import { http } from "../../../api/http";
import { useAuth } from "../../../hooks/useAuth";

const DEPOSIT_AMOUNT = 20000; // 20k VNĐ tiền cọc
const CLINIC_BANK_ID = "BIDV"; // BIDV
const CLINIC_BANK_NAME = "BIDV (Ngân hàng TMCP Đầu tư và Phát triển Việt Nam)";
const CLINIC_ACCOUNT_NO = "8881528121";
const CLINIC_ACCOUNT_NAME = "NGUYEN HOANG QUOC HUY";

const formatCurrency = (value: number) =>
  value.toLocaleString("vi-VN", { style: "currency", currency: "VND" });

function formatDate(dateISO?: string | null) {
  if (!dateISO) return "";
  const date = new Date(dateISO);
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function Step4Review() {
  const { state, dispatch } = useAppt();
  const { user: currentUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "SUCCESS" | "FAILED">(
    "IDLE"
  );
  const [transactionCode, setTransactionCode] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // QR Deposit Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrStep, setQrStep] = useState<"SCAN" | "PAID_SUCCESS">("SCAN");
  const [qrTimer, setQrTimer] = useState(600); // 10 phút
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [pendingBookingData, setPendingBookingData] = useState<Appointment | null>(null);

  const [myVouchers, setMyVouchers] = useState<UserVoucher[]>([]);
  const [publicVouchers, setPublicVouchers] = useState<VoucherItem[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadingVouchers(true);
    Promise.all([
      fetchMyVouchers().catch(() => [] as UserVoucher[]),
      fetchPublicVouchers().catch(() => [] as VoucherItem[]),
    ])
      .then(([mine, pub]) => {
        if (!mounted) return;
        setMyVouchers(mine);
        setPublicVouchers(pub);
      })
      .finally(() => {
        if (mounted) setLoadingVouchers(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Timer đếm ngược 10 phút cho modal thanh toán QR cọc
  useEffect(() => {
    if (!showQrModal || qrTimer <= 0 || qrStep !== "SCAN") return;
    const interval = setInterval(() => {
      setQrTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showQrModal, qrTimer, qrStep]);

  const availableVoucherChoices = useMemo<SelectedVoucherInfo[]>(() => {
    const usedIds = new Set(
      myVouchers.filter((uv) => uv.used).map((uv) => uv.voucherId)
    );
    const map = new Map<number, SelectedVoucherInfo>();

    for (const uv of myVouchers) {
      if (!uv.used) {
        map.set(uv.voucherId, {
          voucherId: uv.voucherId,
          code: uv.voucherCode,
          name: uv.voucherName,
          type: uv.type,
          discountValue: uv.discountValue,
          expiryDate: uv.expiryDate,
        });
      }
    }

    for (const pv of publicVouchers) {
      if (pv.enable && !usedIds.has(pv.id) && !map.has(pv.id)) {
        map.set(pv.id, {
          voucherId: pv.id,
          code: pv.code,
          name: pv.name,
          type: pv.type,
          discountValue: pv.discountValue,
          expiryDate: pv.expiryDate,
        });
      }
    }

    return Array.from(map.values());
  }, [myVouchers, publicVouchers]);

  const patientCount = state.patientSelections.length;
  const billedPatients = Math.max(1, patientCount);
  const baseFeePerPatient = 200_000;
  const onlineSurchargePerPatient = state.appointmentType === "ONLINE" ? 50_000 : 0;
  const subtotal = baseFeePerPatient * billedPatients;
  const surcharge = onlineSurchargePerPatient * billedPatients;
  const originalTotalAmount = subtotal + surcharge;

  const discountAmount = useMemo(() => {
    const v = state.selectedVoucher;
    if (!v || !v.discountValue || v.discountValue <= 0) return 0;
    if (v.type === "DISCOUNT") {
      const pct = Math.min(100, Math.max(0, v.discountValue));
      return Math.round((originalTotalAmount * pct) / 100);
    }
    const monetary = v.discountValue < 1000 ? v.discountValue * 1000 : v.discountValue;
    return Math.min(originalTotalAmount, Math.round(monetary));
  }, [state.selectedVoucher, originalTotalAmount]);

  const totalAmount = Math.max(0, originalTotalAmount - discountAmount);
  const totalLabel = useMemo(
    () => (totalAmount > 0 ? formatCurrency(totalAmount) : "Miễn phí"),
    [totalAmount]
  );

  const canSubmit =
    !submitting &&
    paymentStatus !== "SUCCESS" &&
    state.specialtyId &&
    state.doctorId &&
    state.shiftId &&
    state.dateISO &&
    patientCount > 0;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePaymentAndConfirm = async () => {
    if (!state.specialtyId || !state.doctorId) {
      setError("Thiếu thông tin bác sĩ hoặc chuyên khoa. Vui lòng quay lại bước 1.");
      return;
    }
    if (!state.dateISO) {
      setError("Vui lòng chọn ngày khám.");
      return;
    }
    if (!state.shiftId) {
      setError("Vui lòng chọn ca khám.");
      return;
    }
    if (patientCount === 0) {
      setError("Hãy thêm ít nhất một bệnh nhân vào danh sách.");
      return;
    }

    setError(null);
    setMessage(null);
    setSubmitting(true);
    setPaymentStatus("PROCESSING");

    const appointmentType =
      state.appointmentType === "ONLINE" ? "ONLINE" : "OFFLINE";

    const appointmentReason =
      state.patientSelections
        .map((p) => p.reason?.trim())
        .filter(Boolean)
        .join("; ") || undefined;

    const patientsPayload = state.patientSelections.map((p) => {
      const pIntake = {
        symptoms: p.symptoms || p.reason || undefined,
        duration: p.duration || undefined,
        allergies: p.allergies && p.allergies.length > 0 ? p.allergies : undefined,
        medicalHistory: p.medicalHistory && p.medicalHistory.length > 0 ? p.medicalHistory : undefined,
        currentMedications: p.currentMedications || undefined,
        weightKg: p.weightKg ?? undefined,
        heightCm: p.heightCm ?? undefined,
      };

      return p.patientInfoId
        ? { id: p.patientInfoId, intake: pIntake }
        : {
            fullName: p.fullName,
            gender: p.gender,
            phoneNumber: p.phoneNumber,
            dob: p.dob,
            relationship: p.relationship,
            intake: pIntake,
          };
    });

    const primaryPatient = state.patientSelections[0];
    const intakePayload = primaryPatient
      ? {
          symptoms: primaryPatient.symptoms || primaryPatient.reason,
          duration: primaryPatient.duration,
          allergies: primaryPatient.allergies,
          medicalHistory: primaryPatient.medicalHistory,
          currentMedications: primaryPatient.currentMedications,
          weightKg: primaryPatient.weightKg,
          heightCm: primaryPatient.heightCm,
        }
      : undefined;

    try {
      // 1. Claim voucher nếu có
      if (state.selectedVoucher) {
        try {
          await claimVoucher(state.selectedVoucher.voucherId);
        } catch {
          // Backend handles auto-claim
        }
      }

      const res = await bookAppointment(
        {
          appointment: {
            reason: appointmentReason,
            type: appointmentType,
          },
          intake: intakePayload,
          shiftId: state.shiftId ?? undefined,
          slotId: state.slotId ?? undefined,
          appointmentTime: state.slotStartTime ?? undefined,
          patients: patientsPayload,
          voucherId: state.selectedVoucher?.voucherId ?? null,
          voucherCode: state.selectedVoucher?.code ?? null,
        },
        {
          specialtyId: state.specialtyId,
          doctorId: state.doctorId,
        }
      );

      if (!res.ok || !res.data) {
        throw new Error(res.error || "Đặt lịch thất bại");
      }

      const appointmentNo = res.data.appointmentNo;
      if (!appointmentNo) {
        throw new Error("Không nhận được mã lịch hẹn từ server");
      }

      // Kích hoạt cập nhật chuông thông báo ngay sau khi tạo lịch hẹn
      window.dispatchEvent(new Event("notification-refresh"));

      // Lưu thông tin lịch hẹn tạm thời và mở Popup thanh toán cọc qua mã QR
      setTransactionCode(appointmentNo);
      setPendingBookingData(res.data);
      setQrTimer(600);
      setQrStep("SCAN");
      setShowQrModal(true);
      setSubmitting(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể hoàn tất đặt lịch. Vui lòng thử lại.";
      setError(message);
      setPaymentStatus("FAILED");
      setSubmitting(false);
    }
  };

  // Xác nhận chuyển khoản cọc thành công
  const handleConfirmQrPayment = async () => {
    setIsCheckingPayment(true);
    try {
      // Giả lập kiểm tra giao dịch chuyển khoản 1 giây
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setQrStep("PAID_SUCCESS");

      // Sau 1.5 giây, đóng modal và chuyển sang màn hình "Đặt lịch thành công vào lúc..."
      setTimeout(() => {
        setShowQrModal(false);
        setIsCheckingPayment(false);
        setPaymentStatus("SUCCESS");
        dispatch({ type: "SET_VOUCHER", value: null });
        // Clear cached Step 3 patient PII from sessionStorage upon successful completion
        sessionStorage.removeItem("appointment_step3_manual_form");
        sessionStorage.removeItem("appt");

        if (pendingBookingData) {
          setConfirmedAppointment({ ...pendingBookingData, status: "CONFIRMED" });
        }

        const apptNo = pendingBookingData?.appointmentNo || transactionCode;
        if (apptNo) {
          http.post(`/appointments/${apptNo}/send-confirmation`).catch((mailErr) => {
            console.warn("Could not dispatch confirmation email:", mailErr);
          });
        }

        const apptTime =
          pendingBookingData?.appointmentTime ||
          (state.slotStartTime ? `${state.slotStartTime} - ${state.slotEndTime || ""}` : state.shiftLabel) ||
          "08:00 - 11:30";
        const apptDate = formatDate(
          pendingBookingData?.appointmentDate || state.dateISO
        );
        setMessage(
          `Đã thanh toán cọc thành công! Đặt lịch thành công vào lúc ${apptTime}, ${apptDate}.`
        );
      }, 1500);
    } catch {
      setIsCheckingPayment(false);
      setError("Không thể xác nhận giao dịch. Vui lòng thử lại.");
    }
  };

  const transferContent = `COC ${pendingBookingData?.appointmentNo || transactionCode || "LICHKHAM"}`;
  const vietQrUrl = `https://img.vietqr.io/image/${CLINIC_BANK_ID}-${CLINIC_ACCOUNT_NO}-compact2.png?amount=${DEPOSIT_AMOUNT}&addInfo=${encodeURIComponent(
    transferContent
  )}&accountName=${encodeURIComponent(CLINIC_ACCOUNT_NAME)}`;

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="appt-card p-4">
      {/* ================= THÔNG BÁO THÀNH CÔNG NỔI BẬT ================= */}
      {paymentStatus === "SUCCESS" && confirmedAppointment ? (
        <Card className="border-0 shadow-sm p-4 text-center mb-4 bg-light">
          <div className="text-success mb-2" style={{ fontSize: 52 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#198754">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <Badge bg="success" className="px-3 py-2 fs-6 mx-auto mb-2">
            ĐÃ THANH TOÁN TIỀN CỌC THÀNH CÔNG (20.000 VNĐ)
          </Badge>
          <h3 className="fw-bold text-success mt-2 mb-3">
            Đặt lịch thành công vào lúc{" "}
            {confirmedAppointment.appointmentTime || state.shiftLabel || "08:00 - 11:30"},{" "}
            {formatDate(confirmedAppointment.appointmentDate || state.dateISO)}!
          </h3>

          <div
            className="alert alert-light border text-start mx-auto p-4 shadow-sm"
            style={{ maxWidth: 650, borderRadius: 16 }}
          >
            <div className="row g-2">
              <div className="col-sm-4 text-muted">Mã lịch hẹn:</div>
              <div className="col-sm-8 fw-bold text-primary">
                {confirmedAppointment.appointmentNo}
              </div>

              <div className="col-sm-4 text-muted">Bác sĩ khám:</div>
              <div className="col-sm-8 fw-semibold">
                {confirmedAppointment.doctorName || state.doctorFullName}
              </div>

              <div className="col-sm-4 text-muted">Chuyên khoa:</div>
              <div className="col-sm-8">
                {confirmedAppointment.specialtyName || state.specialtyName || "—"}
              </div>

              <div className="col-sm-4 text-muted">Thời gian khám:</div>
              <div className="col-sm-8 text-danger fw-bold">
                {confirmedAppointment.appointmentTime || state.shiftLabel || "08:00 - 11:30"},{" "}
                {formatDate(confirmedAppointment.appointmentDate || state.dateISO)}
              </div>

              <div className="col-sm-4 text-muted">Tiền cọc giữ chỗ:</div>
              <div className="col-sm-8 text-success fw-bold">
                20.000 VNĐ (Đã chuyển khoản qua QR)
              </div>

              <div className="col-sm-4 text-muted">Bệnh nhân:</div>
              <div className="col-sm-8">
                {state.patientSelections.map((p, i) => (
                  <span key={i} className="badge bg-secondary me-1">
                    {p.fullName}
                  </span>
                ))}
              </div>

              <div className="col-sm-4 text-muted">Trạng thái:</div>
              <div className="col-sm-8">
                <Badge bg="success">ĐÃ XÁC NHẬN (CONFIRMED)</Badge>
              </div>
            </div>

            <div className="alert alert-info d-flex align-items-center gap-2 mt-3 mb-0 text-start">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              <div>
                Thông tin lịch hẹn và biên nhận cọc 20.000 VNĐ đã được gửi tự động về hòm thư:{" "}
                <strong>{currentUser?.email || "email tài khoản của bạn"}</strong>. Vui lòng kiểm tra hộp thư đến (Inbox / Thư rác).
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-center gap-3 mt-4">
            <Link to="/patient/appointments" className="btn btn-primary px-4 py-2 fw-semibold">
              Xem lịch hẹn của tôi
            </Link>
            <Link to="/" className="btn btn-outline-secondary px-4 py-2">
              Về trang chủ
            </Link>
          </div>
        </Card>
      ) : (
        /* ================= GIAO DIỆN XÁC NHẬN BƯỚC 4 ================= */
        <div className="mb-4">
          <Card className="p-3 mb-3">
            <Row className="g-3 align-items-center">
              <Col md={4} className="text-center">
                <div
                  className="rounded-circle overflow-hidden bg-light mx-auto"
                  style={{ width: 88, height: 88 }}
                >
                  {getDoctorImagePathWithFallback(state.doctorFullName) ? (
                    <img
                      src={getDoctorImagePathWithFallback(state.doctorFullName) ?? undefined}
                      alt={state.doctorFullName}
                      className="w-100 h-100 object-fit-cover"
                    />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                      BS
                    </div>
                  )}
                </div>
              </Col>
              <Col md={8}>
                <h5 className="mb-1">{state.doctorFullName}</h5>
                <div className="text-muted small mb-2">
                  {state.doctorDegree} · {state.specialtyName}
                </div>
                <div className="d-flex flex-wrap gap-2 text-muted small">
                  <div>
                    <strong>Ngày:</strong> {formatDate(state.dateISO)}
                  </div>
                  <div>
                    <strong>Ca:</strong> {state.shiftLabel ?? "—"}
                  </div>
                  {state.slotStartTime && (
                    <div>
                      <strong>Giờ khám dự kiến:</strong>{" "}
                      <span className="text-primary fw-bold">
                        {state.slotStartTime} - {state.slotEndTime || ""}
                        {state.queueOrder ? ` (Lượt #${state.queueOrder})` : ""}
                      </span>
                    </div>
                  )}
                  <div>
                    <strong>Hình thức:</strong>{" "}
                    {state.appointmentType === "ONLINE" ? "Khám Online" : "Khám tại phòng khám"}
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          <Card className="p-3 mb-3">
            <h6 className="mb-2">Danh sách bệnh nhân ({patientCount})</h6>
            <div className="patient-scroll">
              {state.patientSelections.map((p, index) => (
                <div
                  key={index}
                  className="border rounded p-2 bg-white"
                  style={{ minWidth: 220 }}
                >
                  <div className="fw-semibold">{p.fullName}</div>
                  <div className="text-muted small">
                    {p.gender === "Male" ? "Nam" : p.gender === "Female" ? "Nữ" : "Khác"} ·{" "}
                    {p.dob ? new Date(p.dob).toLocaleDateString("vi-VN") : "—"}
                  </div>
                  <div className="text-muted small">{p.phoneNumber}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* VOUCHER SELECTION */}
          <Card className="p-3 mb-3">
            <h6 className="mb-2">Voucher ưu đãi</h6>
            {loadingVouchers ? (
              <div className="text-muted small py-2">
                <Spinner animation="border" size="sm" className="me-2" /> Đang tải voucher...
              </div>
            ) : availableVoucherChoices.length === 0 ? (
              <div className="text-muted small">Bạn chưa có voucher nào khả dụng.</div>
            ) : (
              <div className="vstack gap-2">
                <Form.Select
                  value={state.selectedVoucher?.voucherId ?? 0}
                  onChange={(e) => {
                    const vid = Number(e.target.value);
                    if (vid === 0) {
                      dispatch({ type: "SET_VOUCHER", value: null });
                    } else {
                      const found = availableVoucherChoices.find((c) => c.voucherId === vid);
                      if (found) {
                        dispatch({ type: "SET_VOUCHER", value: found });
                      }
                    }
                  }}
                  disabled={paymentStatus === "SUCCESS" || submitting}
                >
                  <option value={0}>-- Không áp dụng voucher --</option>
                  {availableVoucherChoices.map((v) => (
                    <option key={v.voucherId} value={v.voucherId}>
                      {v.code} - {v.name || "Ưu đãi"} (
                      {v.type === "DISCOUNT"
                        ? `Giảm ${v.discountValue}%`
                        : `Giảm ${formatCurrency(
                            v.discountValue && v.discountValue < 1000
                              ? v.discountValue * 1000
                              : v.discountValue || 0
                          )}`}
                      )
                    </option>
                  ))}
                </Form.Select>
              </div>
            )}
          </Card>

          {/* THÔNG TIN THANH TOÁN VÀ ĐẶT CỌC */}
          <Card className="p-3 mb-3">
            <h5 className="mb-3">Chi phí & Tiền cọc giữ chỗ</h5>
            <div className="payment-summary mb-3">
              <div className="payment-summary__row">
                <span>Phí khám cơ bản</span>
                <span>
                  {formatCurrency(baseFeePerPatient)} x {billedPatients}
                </span>
              </div>
              {discountAmount > 0 && state.selectedVoucher && (
                <div className="payment-summary__row text-success">
                  <span>Voucher giảm giá ({state.selectedVoucher.code})</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="payment-summary__row text-primary fw-bold">
                <span>Tiền cọc giữ chỗ (Thanh toán qua QR)</span>
                <span>{formatCurrency(DEPOSIT_AMOUNT)}</span>
              </div>
              <div className="payment-summary__total">
                <span>Tổng chi phí dự kiến tại phòng khám</span>
                <span>{totalLabel}</span>
              </div>
            </div>

            <Alert variant="info" className="mb-0 small d-flex align-items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
              <div>
                Để đảm bảo giữ chỗ lịch khám, quý khách chỉ cần thanh toán một khoản tiền cọc nhỏ{" "}
                <strong>{formatCurrency(DEPOSIT_AMOUNT)}</strong> qua mã QR ở bước tiếp theo. Tiền cọc
                sẽ được trừ vào tổng viện phí khi đến khám.
              </div>
            </Alert>
          </Card>

          {message && (
            <Alert variant="success" className="mb-3">
              {message}
            </Alert>
          )}
          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          <div className="appt-bottom">
            <button
              className="btn-back"
              onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
              disabled={submitting}
            >
              Quay lại
            </button>
            <button
              className="btn-next"
              onClick={handlePaymentAndConfirm}
              disabled={!canSubmit}
            >
              {submitting ? (
                <span className="d-inline-flex align-items-center gap-2">
                  <Spinner animation="border" size="sm" /> Đang tạo lịch hẹn...
                </span>
              ) : (
                "Xác nhận đặt lịch & Thanh toán cọc (20k)"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL QUÉT MÃ QR THANH TOÁN CỌC ================= */}
      <Modal
        show={showQrModal}
        onHide={() => !isCheckingPayment && setShowQrModal(false)}
        backdrop="static"
        keyboard={false}
        centered
        size="lg"
      >
        <Modal.Header closeButton={!isCheckingPayment} className="border-bottom">
          <Modal.Title className="d-flex align-items-center gap-2">
            <span>Thanh toán đặt cọc lịch khám</span>
            <Badge bg="warning" text="dark" pill>
              Cọc {formatCurrency(DEPOSIT_AMOUNT)}
            </Badge>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="p-4">
          {qrStep === "PAID_SUCCESS" ? (
            <div className="text-center py-5">
              <div className="text-success mb-3">
                <svg width="72" height="72" viewBox="0 0 24 24" fill="#198754">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <h3 className="fw-bold text-success mb-2">ĐÃ THANH TOÁN THÀNH CÔNG!</h3>
              <p className="text-muted fs-5">
                Hệ thống đã nhận được <strong>{formatCurrency(DEPOSIT_AMOUNT)}</strong> tiền đặt cọc.
              </p>
              <div className="d-flex align-items-center justify-content-center gap-2 text-primary mt-3">
                <Spinner animation="border" size="sm" />
                <span>Đang hoàn tất và xuất phiếu xác nhận đặt lịch...</span>
              </div>
            </div>
          ) : (
            <Row className="g-4 align-items-center">
              {/* Cột hiển thị mã QR VietQR */}
              <Col md={5} className="text-center">
                <div
                  className="p-2 border rounded-4 shadow-sm bg-white mx-auto"
                  style={{ maxWidth: 280 }}
                >
                  <img
                    src={vietQrUrl}
                    alt="VietQR Deposit Code"
                    className="img-fluid rounded-3"
                    style={{ width: "100%", height: "auto" }}
                  />
                  <div className="text-muted small mt-2 fw-medium">
                    Quét mã bằng bất kỳ App Ngân hàng hoặc MoMo/ZaloPay
                  </div>
                </div>

                <div className="mt-3">
                  <Badge bg="danger" className="px-3 py-2 fs-6">
                    ⏱ Thời gian giữ chỗ: {formatTimer(qrTimer)}
                  </Badge>
                </div>
              </Col>

              {/* Cột thông tin chuyển khoản */}
              <Col md={7}>
                <h6 className="fw-bold text-primary mb-3">
                  Thông tin chuyển khoản ngân hàng (Napas 24/7)
                </h6>

                <div className="table-responsive border rounded-3 p-3 bg-light mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <span className="text-muted">Ngân hàng:</span>
                    <strong className="text-dark">{CLINIC_BANK_NAME}</strong>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <span className="text-muted">Số tài khoản:</span>
                    <div className="d-flex align-items-center gap-2">
                      <strong className="text-primary fs-5">{CLINIC_ACCOUNT_NO}</strong>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="py-0 px-2"
                        onClick={() => handleCopy(CLINIC_ACCOUNT_NO, "accountNo")}
                      >
                        {copiedField === "accountNo" ? "Đã chép" : "Sao chép"}
                      </Button>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <span className="text-muted">Chủ tài khoản:</span>
                    <strong className="text-dark">{CLINIC_ACCOUNT_NAME}</strong>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                    <span className="text-muted">Số tiền cọc:</span>
                    <div className="d-flex align-items-center gap-2">
                      <strong className="text-danger fs-5">
                        {formatCurrency(DEPOSIT_AMOUNT)}
                      </strong>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="py-0 px-2"
                        onClick={() => handleCopy(String(DEPOSIT_AMOUNT), "amount")}
                      >
                        {copiedField === "amount" ? "Đã chép" : "Sao chép"}
                      </Button>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted">Nội dung CK:</span>
                    <div className="d-flex align-items-center gap-2">
                      <strong className="text-success">{transferContent}</strong>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="py-0 px-2"
                        onClick={() => handleCopy(transferContent, "content")}
                      >
                        {copiedField === "content" ? "Đã chép" : "Sao chép"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="alert alert-warning small py-2 mb-0">
                  💡 <strong>Gợi ý:</strong> Khi quét mã QR bằng App ngân hàng, thông tin Số tiền{" "}
                  <strong>(20.000đ)</strong> và Nội dung chuyển khoản sẽ được tự động điền sẵn.
                </div>
              </Col>
            </Row>
          )}
        </Modal.Body>

        {qrStep === "SCAN" && (
          <Modal.Footer className="border-top justify-content-between">
            <Button
              variant="outline-secondary"
              disabled={isCheckingPayment}
              onClick={() => setShowQrModal(false)}
            >
              Hủy / Đóng
            </Button>

            <div className="d-flex gap-2">
              <Button
                variant="outline-success"
                disabled={isCheckingPayment}
                onClick={handleConfirmQrPayment}
                className="d-flex align-items-center gap-2"
              >
                {isCheckingPayment ? (
                  <>
                    <Spinner animation="border" size="sm" /> Đang kiểm tra...
                  </>
                ) : (
                  "⚡ Mô phỏng thanh toán thành công (Test)"
                )}
              </Button>

              <Button
                variant="primary"
                disabled={isCheckingPayment}
                onClick={handleConfirmQrPayment}
                className="d-flex align-items-center gap-2 px-3"
              >
                {isCheckingPayment ? (
                  <>
                    <Spinner animation="border" size="sm" /> Đang kiểm tra giao dịch...
                  </>
                ) : (
                  "Tôi đã chuyển khoản thành công"
                )}
              </Button>
            </div>
          </Modal.Footer>
        )}
      </Modal>
    </div>
  );
}
