import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { fetchMyVouchers, type UserVoucher, type VoucherType } from "../../api/voucher";
import "../../styles/appointmentlist.css";

const VoucherTypeLabel: Record<VoucherType, string> = {
  SERVICE_TICKET: "Vé dịch vụ",
  DISCOUNT: "Giảm giá",
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDiscount(voucher: UserVoucher): string {
  if (voucher.discountValue === null || voucher.discountValue === undefined) return "—";
  if (voucher.type === "DISCOUNT") {
    return `${voucher.discountValue}%`;
  }
  return `${voucher.discountValue}`;
}

export default function PatientVouchers() {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchMyVouchers();
        if (mounted) setVouchers(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Không thể tải danh sách voucher.";
        if (mounted) setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activeVouchers = useMemo(
    () => vouchers.filter((voucher) => !voucher.used),
    [vouchers]
  );

  return (
    <div className="patient-page">
      <header className="patient-header">
        <h1>Voucher của tôi</h1>
        <p>Những mã ưu đãi được cấp khi bạn tham gia sự kiện hoặc chương trình của phòng khám.</p>
        {error && (
          <Alert variant="danger" className="mt-3" onClose={() => setError("")} dismissible>
            {error}
          </Alert>
        )}
      </header>

      <section className="patient-body">
        {loading ? (
          <Card body className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" />
            Đang tải voucher...
          </Card>
        ) : activeVouchers.length === 0 ? (
          <Card body className="text-center text-muted">
            Bạn chưa có voucher nào đang hoạt động.
          </Card>
        ) : (
          <Row className="g-3">
            {activeVouchers.map((voucher) => (
              <Col key={voucher.id} xs={12} md={6} lg={4}>
                <Card className="h-100 shadow-sm border-0">
                  <Card.Body className="d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <Card.Title className="mb-0">{voucher.voucherName || "Voucher ưu đãi"}</Card.Title>
                      <Badge bg="info">{VoucherTypeLabel[voucher.type]}</Badge>
                    </div>
                    <div className="text-muted mb-2">
                      Mã: <strong>{voucher.voucherCode}</strong>
                    </div>
                    <div className="fw-semibold mb-2">
                      Giá trị: {formatDiscount(voucher)}
                    </div>
                    <div className="small text-muted mb-1">
                      Hạn sử dụng: {formatDateTime(voucher.expiryDate)}
                    </div>
                    <div className="small text-muted mb-3">
                      Nhận lúc: {formatDateTime(voucher.issuedAt)}
                    </div>
                    <div className="mt-auto">
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-100 rounded-pill"
                        onClick={() =>
                          navigate(
                            `/appointment?voucherId=${voucher.voucherId}&voucherCode=${encodeURIComponent(
                              voucher.voucherCode
                            )}`
                          )
                        }
                      >
                        Dùng ngay khi đặt lịch
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </section>
    </div>
  );
}


