import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  claimVoucher,
  fetchMyVouchers,
  fetchPublicVouchers,
  type UserVoucher,
  type VoucherItem,
} from "../../api/voucher";
import "../../styles/vouchers-section.css";

function formatDateTime(value?: string | null): string {
  if (!value) return "Không giới hạn";
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

function formatVoucherBenefit(voucher: VoucherItem): string {
  const val = voucher.discountValue;
  if (val === null || val === undefined) {
    return voucher.type === "DISCOUNT" ? "Ưu đãi giảm giá" : "Vé dịch vụ";
  }
  if (voucher.type === "DISCOUNT") {
    return `Giảm ${val}%`;
  }
  if (val >= 1000) {
    return `Giảm ${val.toLocaleString("vi-VN")}đ`;
  }
  return `Tặng ${val} điểm (${(val * 1000).toLocaleString("vi-VN")}đ)`;
}

export default function VouchersSection() {
  const { user, userType, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const isPatient = isAuthenticated && userType === "Patient";

  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [myVouchers, setMyVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [usingId, setUsingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchPublicVouchers();
        if (mounted) setVouchers(list);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Không thể tải danh sách voucher.";
        if (mounted) setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!isPatient) {
      setMyVouchers([]);
      return;
    }
    fetchMyVouchers()
      .then((list) => {
        if (mounted) setMyVouchers(list);
      })
      .catch(() => {
        // Silent ignore if personal vouchers cannot be prefetched
      });
    return () => {
      mounted = false;
    };
  }, [isPatient, user?.id]);

  const myVoucherMap = useMemo(() => {
    const map = new Map<number, UserVoucher>();
    for (const uv of myVouchers) {
      map.set(uv.voucherId, uv);
    }
    return map;
  }, [myVouchers]);

  const handleSaveVoucher = async (voucher: VoucherItem) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!isPatient) return;

    setClaimingId(voucher.id);
    setError("");
    setSuccessMessage("");
    try {
      const claimed = await claimVoucher(voucher.id);
      setMyVouchers((prev) => {
        const filtered = prev.filter((item) => item.voucherId !== claimed.voucherId);
        return [claimed, ...filtered];
      });
      setSuccessMessage(
        `Đã lưu mã ưu đãi ${voucher.code} vào kho Voucher của bạn!`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể lưu voucher.";
      setError(msg);
    } finally {
      setClaimingId(null);
    }
  };

  const handleUseVoucherNow = async (voucher: VoucherItem) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!isPatient) return;

    setUsingId(voucher.id);
    setError("");
    try {
      const owned = myVoucherMap.get(voucher.id);
      if (!owned) {
        const claimed = await claimVoucher(voucher.id);
        setMyVouchers((prev) => [claimed, ...prev]);
      }
      navigate(`/appointment?voucherId=${voucher.id}&voucherCode=${encodeURIComponent(voucher.code)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể áp dụng voucher này.";
      setError(msg);
    } finally {
      setUsingId(null);
    }
  };

  return (
    <section className="vouchers-section">
      <Container>
        <div className="section-header text-center mb-5">
          <span className="vouchers-badge">MÃ ƯU ĐÃI ĐẶC BIỆT</span>
          <h2 className="vouchers-title mt-2">Voucher &amp; Quà Tặng Sức Khỏe</h2>
          <p className="vouchers-subtitle text-muted mb-0">
            Lưu ngay các mã giảm giá và vé dịch vụ từ phòng khám để nhận ưu đãi trực tiếp khi đặt lịch khám bệnh.
          </p>
        </div>

        {error && (
          <Alert variant="danger" onClose={() => setError("")} dismissible>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert variant="success" onClose={() => setSuccessMessage("")} dismissible>
            {successMessage}
          </Alert>
        )}

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" />
          </div>
        ) : vouchers.length === 0 ? (
          <Card body className="text-center text-muted border-0 py-5 rounded-4 shadow-sm">
            Hiện chưa có chương trình voucher ưu đãi nào đang mở.
          </Card>
        ) : (
          <Row className="g-4 justify-content-center">
            {vouchers.map((voucher) => {
              const owned = myVoucherMap.get(voucher.id);
              const isUsed = Boolean(owned?.used);
              const isClaimed = Boolean(owned);

              return (
                <Col key={voucher.id} xs={12} md={6} lg={4} className="d-flex">
                  <Card className="voucher-ticket-card h-100 w-100">
                    <div
                      className={`voucher-ticket-banner ${
                        voucher.type === "SERVICE_TICKET" ? "voucher-ticket-banner--service" : ""
                      }`}
                    >
                      <div className="voucher-ticket-value">
                        {formatVoucherBenefit(voucher)}
                      </div>
                      <span className="voucher-ticket-type-pill">
                        {voucher.type === "DISCOUNT" ? "Mã giảm giá" : "Vé dịch vụ"}
                      </span>
                    </div>

                    <Card.Body className="p-4 d-flex flex-column">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="voucher-code-box">
                          <span>MÃ:</span>
                          <span>{voucher.code}</span>
                        </span>
                        {isUsed ? (
                          <Badge bg="secondary">Đã sử dụng</Badge>
                        ) : isClaimed ? (
                          <Badge bg="success">Đã lưu</Badge>
                        ) : null}
                      </div>

                      <h3 className="voucher-name">
                        {voucher.name || `Ưu đãi ${voucher.code}`}
                      </h3>

                      <div className="voucher-expiry">
                        <strong>Hạn sử dụng:</strong> {formatDateTime(voucher.expiryDate)}
                      </div>

                      <div className="voucher-actions">
                        {isUsed ? (
                          <Button
                            variant="outline-secondary"
                            disabled
                            className="voucher-btn w-100"
                          >
                            Bạn đã sử dụng voucher này
                          </Button>
                        ) : !isAuthenticated ? (
                          <Button
                            variant="primary"
                            onClick={() => navigate("/login")}
                            className="voucher-btn voucher-btn-use w-100"
                          >
                            Đăng nhập để nhận &amp; sử dụng
                          </Button>
                        ) : !isPatient ? (
                          <Button
                            variant="outline-secondary"
                            disabled
                            className="voucher-btn w-100"
                          >
                            Chỉ dành cho bệnh nhân
                          </Button>
                        ) : (
                          <>
                            {!isClaimed && (
                              <Button
                                variant="outline-primary"
                                onClick={() => void handleSaveVoucher(voucher)}
                                disabled={claimingId === voucher.id || usingId === voucher.id}
                                className="voucher-btn flex-grow-1"
                              >
                                {claimingId === voucher.id ? (
                                  <Spinner animation="border" size="sm" />
                                ) : (
                                  "Lưu mã"
                                )}
                              </Button>
                            )}
                            <Button
                              variant="primary"
                              onClick={() => void handleUseVoucherNow(voucher)}
                              disabled={usingId === voucher.id || claimingId === voucher.id}
                              className="voucher-btn voucher-btn-use flex-grow-1"
                            >
                              {usingId === voucher.id ? (
                                <>
                                  <Spinner animation="border" size="sm" className="me-2" />
                                  Đang xử lý...
                                </>
                              ) : (
                                "Dùng ngay"
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Container>
    </section>
  );
}

