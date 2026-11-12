import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchAvailableEvents,
  fetchRegisteredEventIds,
  registerEvent,
  type UserEventItem,
} from "../../api/patientEvents";
import "../../styles/events-section.css";

function formatDateTime(value?: string): string {
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

function formatLocation(location?: string | null): string {
  if (!location) return "Tại phòng khám";
  return location;
}

function formatVoucher(event: UserEventItem): string {
  if (!event.voucherName && !event.voucherCode) return "Không có";
  const parts = [];
  if (event.voucherName) parts.push(event.voucherName);
  if (event.voucherCode) parts.push(`Mã: ${event.voucherCode}`);
  return parts.join(" - ");
}

export default function UpcomingEvents() {
  const { user, userType, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const canRegister = isAuthenticated && userType === "Patient";
  const [events, setEvents] = useState<UserEventItem[]>([]);
  const [registeredIds, setRegisteredIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchAvailableEvents();
        if (mounted) {
          setEvents(list);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Không thể tải sự kiện.";
        if (mounted) setError(message);
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
    setRegisteredIds([]);
    // Personal registrations are only available to authenticated patients.
    if (!canRegister) return;
    fetchRegisteredEventIds()
      .then((registered) => { if (mounted) setRegisteredIds(registered); })
      .catch((_err: unknown) => {
        // Silently ignore 401 when user is not logged in as patient or session expired
        if (mounted) setRegisteredIds([]);
      });
    return () => { mounted = false; };
  }, [canRegister, user?.id]);

  const upcomingEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const aTime = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
    [events]
  );

  const handleRegister = async (eventId: number) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!canRegister) return;
    setRegisteringId(eventId);
    setError("");
    setSuccessMessage("");
    try {
      await registerEvent(eventId);
      const updatedRegistered = await fetchRegisteredEventIds();
      setRegisteredIds(updatedRegistered);
      setSuccessMessage("Bạn đã đăng ký sự kiện thành công! Vui lòng kiểm tra thông tin trong mục Sự kiện của tôi.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể đăng ký sự kiện.";
      setError(message);
    } finally {
      setRegisteringId(null);
    };
  };

  return (
    <section className="events-section">
      <Container>
        <div className="section-header text-center mb-5">
          <span className="events-badge">CHƯƠNG TRÌNH &amp; ƯU ĐÃI</span>
          <h2 className="events-title mt-2">Sự Kiện Y Tế Nổi Bật</h2>
          <p className="events-subtitle text-muted mb-0">
            Đăng ký tham gia các chương trình ưu đãi và sự kiện chăm sóc sức khỏe mới nhất từ phòng khám.
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
        ) : upcomingEvents.length === 0 ? (
          <Card body className="text-center text-muted border-0 py-5 rounded-4 shadow-sm">
            Hiện chưa có sự kiện nào đang diễn ra.
          </Card>
        ) : (
          <Row className="g-4 justify-content-center">
            {upcomingEvents.map((event) => (
              <Col key={event.id} xs={12} md={6} lg={4} className="d-flex">
                <Card className="event-card h-100 border-0 w-100">
                  <Card.Body className="p-4 d-flex flex-column">
                    <div className="mb-2">
                      <div className="event-date-chip">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>{formatDateTime(event.startDate)}</span>
                      </div>
                    </div>
                    <h3 className="event-title">{event.title}</h3>
                    {event.description && (
                      <p className="event-desc">{event.description}</p>
                    )}
                    <div className="mt-auto">
                      <div className="event-meta-box">
                        <div>
                          <strong>Địa điểm:</strong> {formatLocation(event.location)}
                        </div>
                        <div>
                          <strong>Voucher:</strong> {formatVoucher(event)}
                        </div>
                      </div>
                      {registeredIds.includes(event.id) ? (
                        <Button variant="outline-secondary" disabled className="event-btn w-100">
                          Bạn đã đăng ký sự kiện này
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          onClick={() => handleRegister(event.id)}
                          disabled={registeringId === event.id || (isAuthenticated && !canRegister)}
                          className="event-btn btn-primary w-100"
                        >
                          {registeringId === event.id ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-2" />
                              Đang đăng ký...
                            </>
                          ) : (
                            !isAuthenticated ? "Đăng nhập để đăng ký" : canRegister ? "Đăng ký tham gia" : "Chỉ dành cho bệnh nhân"
                          )}
                        </Button>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>
    </section>
  );
}


