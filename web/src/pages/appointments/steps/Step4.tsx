import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import { useAppt, type SelectedVoucherInfo } from "../../../contexts/AppointmentContext";
import { bookAppointment, type Appointment } from "../../../api/appointment";
import {
  claimVoucher,
  fetchMyVouchers,
  fetchPublicVouchers,
  type UserVoucher,
  type VoucherItem,
} from "../../../api/voucher";
import { http } from "../../../api/http";
import { getDoctorImagePathWithFallback } from "../../../utils/doctorImage";

type PaymentMethod = "VNPAY" | "MOMO" | "CREDIT";

const PAYMENT_OPTIONS: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "VNPAY",
    label: "VNPay QR",
    description: "Quét QR với ứng dụng ngân hàng hỗ trợ VNPay.",
  },
  {
    value: "MOMO",
    label: "Ví MoMo",
    description: "Thanh toán nhanh qua ví điện tử MoMo.",
  },
  {
    value: "CREDIT",
    label: "Thẻ tín dụng/Ghi nợ",
    description: "Visa, Mastercard, JCB, Napas hỗ trợ 3-D Secure.",
  },
];

const formatCurrency = (value: number) =>
  value.toLocaleString("vi-VN", { style: "currency", currency: "VND" });

function formatDate(dateISO?: string) {
  if (!dateISO) return "";
  const date = new Date(dateISO);
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Step4Review() {
  const { state, dispatch } = useAppt();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("VNPAY");
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "SUCCESS" | "FAILED">(
    "IDLE"
  );
  const [transactionCode, setTransactionCode] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

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

  const shiftSummaryText =
    state.shiftLabel || state.shiftName || "Chưa chọn ca khám";

  const totalLabel = useMemo(
    () => formatCurrency(totalAmount),
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
      state.appointmentType === "ONLINE" ? "ONLINE" : "OFFLINE"; // Backend expects "OFFLINE" but context uses "ONSITE"

    const appointmentReason =
      state.patientSelections
        .map((p) => p.reason?.trim())
        .filter(Boolean)
        .join("; ") || undefined;

    const patientsPayload = state.patientSelections.map((p) =>
      p.patientInfoId
        ? { id: p.patientInfoId }
        : {
            fullName: p.fullName,
            gender: p.gender,
            phoneNumber: p.phoneNumber,
            dob: p.dob,
            relationship: p.relationship,
          }
    );

    try {
      // 1. Tạo appointment (kèm voucher nếu bệnh nhân đã chọn)
      if (state.selectedVoucher) {
        try {
          await claimVoucher(state.selectedVoucher.voucherId);
        } catch {
          // Backend bookAppointment also handles auto-claim/consumption
        }
      }

      const res = await bookAppointment(
        {
          appointment: {
            reason: appointmentReason,
            type: appointmentType,
          },
          shiftId: state.shiftId ?? undefined,
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

      // 2. Nếu là OFFLINE (ONSITE): không cần thanh toán, xác nhận luôn
      if (appointmentType === "OFFLINE" || state.appointmentType === "ONSITE") {
        setTransactionCode(appointmentNo);
        setConfirmedAppointment({ ...res.data, status: "CONFIRMED" });
        dispatch({ type: "SET_VOUCHER", value: null });
        setMessage("Đặt lịch thành công! Lịch hẹn đã được xác nhận.");
        setPaymentStatus("SUCCESS");
        setSubmitting(false);
        return;
      }

      // 3. Nếu là ONLINE: tạo payment URL và redirect đến VNPay
      if (appointmentType === "ONLINE") {
        try {
          const paymentRes = await http.get(`/payment/create`, {
            params: { appointmentNo },
          });

          const paymentUrl = paymentRes.data?.paymentUrl;
          if (!paymentUrl) {
            throw new Error("Không nhận được URL thanh toán từ server");
          }

          // Redirect đến VNPay
          window.location.href = paymentUrl;
          // Note: Sau khi thanh toán, VNPay sẽ redirect về /payment-result
          // và backend sẽ xử lý callback để cập nhật trạng thái appointment
        } catch (paymentErr: unknown) {
          const paymentMessage =
            paymentErr instanceof Error
              ? paymentErr.message
              : "Không thể tạo link thanh toán. Vui lòng thử lại.";
          setError(paymentMessage);
          setPaymentStatus("FAILED");
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể hoàn tất đặt lịch. Vui lòng thử lại.";
      setError(message);
      setPaymentStatus("FAILED");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="appt-card p-4">
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
                    src={getDoctorImagePathWithFallback(state.doctorFullName)!}
                    alt={state.doctorFullName || "Doctor"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const placeholder = target.parentElement?.querySelector('.doctor-avatar-placeholder');
                      if (placeholder) {
                        (placeholder as HTMLElement).style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div 
                  className="doctor-avatar-placeholder"
                  style={{ 
                    display: getDoctorImagePathWithFallback(state.doctorFullName) ? 'none' : 'flex',
                    width: '88px',
                    height: '88px',
                    backgroundColor: '#e9ecef',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6c757d',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    borderRadius: '50%'
                  }}
                >
                  {state.doctorFullName?.charAt(0)?.toUpperCase() || 'BS'}
                </div>
              </div>
              <div className="fw-semibold mt-3">
                {state.doctorFullName}
                {state.doctorDegree ? ` - ${state.doctorDegree}` : ""}
              </div>
              <div className="text-primary">{state.specialtyName}</div>
            </Col>
            <Col md={8}>
              <Row className="g-3">
                <Col sm={6}>
                  <div className="text-muted small">Ngày khám</div>
                  <div className="fw-semibold">{formatDate(state.dateISO)}</div>
                </Col>
                <Col sm={6}>
                  <div className="text-muted small">Ca khám</div>
                  <div className="fw-semibold">{shiftSummaryText}</div>
                </Col>
                <Col sm={6}>
                  <div className="text-muted small">Hình thức</div>
                  <div className="fw-semibold">
                    {state.appointmentType === "ONLINE"
                      ? "Khám trực tuyến"
                      : state.appointmentType === "ONSITE"
                      ? "Khám trực tiếp"
                      : "Chưa chọn"}
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="text-muted small">Số bệnh nhân</div>
                  <div className="fw-semibold">{patientCount}</div>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        <Card className="p-3 mb-3">
          <h5>Danh sách bệnh nhân</h5>
          {state.patientSelections.length === 0 ? (
            <div className="text-muted">
              Chưa có bệnh nhân nào được chọn.
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {state.patientSelections.map((patient, index) => (
                <div
                  key={`${patient.patientInfoId ?? "manual"}-${index}`}
                  className="border rounded-3 p-3"
                >
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="fw-semibold">{patient.fullName}</div>
                      <div className="text-muted small">
                        {patient.gender}
                        {patient.dob ? ` · ${patient.dob}` : ""}
                      </div>
                      <div className="text-muted small">
                        {patient.phoneNumber}
                      </div>
                      <div className="text-muted small">
                        {patient.relationship || "Mối quan hệ chưa cập nhật"}
                      </div>
                    </div>
                    <span className="badge bg-light text-dark">
                      {patient.patientInfoId ? "Hồ sơ đã lưu" : "Nhập thủ công"}
                    </span>
                  </div>
                  {patient.reason && (
                    <div className="mt-2">
                      <div className="text-muted small">Lý do khám</div>
                      <div>{patient.reason}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Chọn mã ưu đãi / Voucher */}
        <Card className="p-3 mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Mã ưu đãi / Voucher</h5>
            {loadingVouchers && <Spinner animation="border" size="sm" />}
          </div>
          {availableVoucherChoices.length === 0 ? (
            <div className="text-muted small">
              Hiện chưa có mã voucher khả dụng để áp dụng.
            </div>
          ) : (
            <Row className="g-2 align-items-center">
              <Col md={8}>
                <Form.Select
                  value={state.selectedVoucher?.voucherId ?? ""}
                  disabled={paymentStatus === "SUCCESS" || submitting}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!val) {
                      dispatch({ type: "SET_VOUCHER", value: null });
                      return;
                    }
                    const found = availableVoucherChoices.find((v) => v.voucherId === val);
                    dispatch({ type: "SET_VOUCHER", value: found || null });
                  }}
                >
                  <option value="">-- Chọn voucher ưu đãi --</option>
                  {availableVoucherChoices.map((v) => {
                    const benefitText =
                      v.type === "DISCOUNT"
                        ? `Giảm ${v.discountValue ?? 0}%`
                        : v.discountValue && v.discountValue >= 1000
                        ? `Giảm ${v.discountValue.toLocaleString("vi-VN")}đ`
                        : `Tặng ${v.discountValue ?? 0} điểm`;
                    return (
                      <option key={v.voucherId} value={v.voucherId}>
                        [{v.code}] {v.name || "Voucher ưu đãi"} ({benefitText})
                      </option>
                    );
                  })}
                </Form.Select>
              </Col>
              <Col md={4} className="text-md-end">
                {state.selectedVoucher ? (
                  <div className="d-inline-flex align-items-center gap-2">
                    <Badge bg="success">
                      -{formatCurrency(discountAmount)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={paymentStatus === "SUCCESS" || submitting}
                      onClick={() => dispatch({ type: "SET_VOUCHER", value: null })}
                    >
                      Bỏ chọn
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted small">Chưa chọn mã ưu đãi</span>
                )}
              </Col>
            </Row>
          )}
        </Card>

        {/* Chỉ hiển thị phần thanh toán nếu là khám trực tuyến (ONLINE) */}
        {state.appointmentType === "ONLINE" ? (
          <Card className="p-3 mb-3">
            <h5 className="mb-3">Thanh toán</h5>
            <div className="payment-method-grid mb-4">
              {PAYMENT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`payment-${option.value}`}
                  className={[
                    "payment-method-card",
                    paymentMethod === option.value ? "active" : "",
                    paymentStatus === "SUCCESS" ? "completed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    id={`payment-${option.value}`}
                    className="payment-method-card__input"
                    type="radio"
                    name="paymentMethod"
                    value={option.value}
                    checked={paymentMethod === option.value}
                    onChange={() => {
                      if (paymentStatus !== "SUCCESS") {
                        setPaymentMethod(option.value);
                      }
                    }}
                    disabled={paymentStatus === "SUCCESS"}
                  />
                  <span
                    aria-hidden="true"
                    className={[
                      "payment-method-card__check",
                      paymentMethod === option.value ? "checked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  <div className="payment-method-card__body">
                    <div className="payment-method-card__label">{option.label}</div>
                    <div className="payment-method-card__desc">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="payment-summary mb-3">
              <div className="payment-summary__row">
                <span>Phí khám cơ bản</span>
                <span>{formatCurrency(baseFeePerPatient)} x {billedPatients}</span>
              </div>
              <div className="payment-summary__row">
                <span>Phụ phí khám trực tuyến</span>
                <span>{formatCurrency(onlineSurchargePerPatient)} x {billedPatients}</span>
              </div>
              <div className="payment-summary__row">
                <span>Số bệnh nhân</span>
                <span>{patientCount}</span>
              </div>
              {discountAmount > 0 && state.selectedVoucher && (
                <div className="payment-summary__row text-success">
                  <span>Voucher ưu đãi ({state.selectedVoucher.code})</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="payment-summary__total">
                <span>Tổng thanh toán</span>
                <span>{totalLabel}</span>
              </div>
            </div>

            {transactionCode && (
              <Alert variant="info" className="mb-3">
                Mã giao dịch: <strong>{transactionCode}</strong> · Phương thức:{" "}
                <strong>{PAYMENT_OPTIONS.find((opt) => opt.value === paymentMethod)?.label}</strong>
              </Alert>
            )}
          </Card>
        ) : (
          /* Hiển thị thông báo cho khám trực tiếp (ONSITE/OFFLINE) */
          <Card className="p-3 mb-3">
            <h5 className="mb-3">Thông tin thanh toán</h5>
            <div className="payment-summary mb-3">
              <div className="payment-summary__row">
                <span>Phí khám cơ bản dự kiến</span>
                <span>{formatCurrency(baseFeePerPatient)} x {billedPatients}</span>
              </div>
              {discountAmount > 0 && state.selectedVoucher && (
                <div className="payment-summary__row text-success">
                  <span>Voucher ưu đãi ({state.selectedVoucher.code})</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="payment-summary__total">
                <span>Tổng chi phí dự kiến tại quầy</span>
                <span>{totalLabel}</span>
              </div>
            </div>
            <Alert variant="info" className="mb-0">
              <strong>Khám trực tiếp:</strong> Bạn sẽ thanh toán trực tiếp tại phòng khám khi đến khám.
              Không cần thanh toán trước.
            </Alert>
          </Card>
        )}

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
        {paymentStatus === "SUCCESS" && confirmedAppointment && (
          <Alert variant="success" className="mb-0">
            Lịch hẹn của bạn với bác sĩ <strong>{confirmedAppointment.doctorName ?? state.doctorFullName}</strong>{" "}
            vào ngày <strong>{formatDate(confirmedAppointment.appointmentDate ?? state.dateISO)}</strong>{" "}
            đã được xác nhận.
          </Alert>
        )}
      </div>

      <div className="appt-bottom">
        <button
          className="btn-back"
          onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
        >
          Quay lại
        </button>
        <button
          className="btn-next"
          onClick={handlePaymentAndConfirm}
          disabled={!canSubmit}
        >
          {submitting || paymentStatus === "PROCESSING" ? (
            <span className="d-inline-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" /> 
              {state.appointmentType === "ONLINE" ? "Đang xử lý thanh toán..." : "Đang đặt lịch..."}
            </span>
          ) : paymentStatus === "SUCCESS" ? (
            state.appointmentType === "ONLINE" ? "Đã thanh toán" : "Đã đặt lịch"
          ) : (
            state.appointmentType === "ONLINE" ? "Thanh toán & Đặt lịch" : "Xác nhận đặt lịch"
          )}
        </button>
      </div>
    </div>
  );
}

