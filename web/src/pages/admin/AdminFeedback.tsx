import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Modal,
  Pagination,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  deleteFeedbackAdmin,
  fetchAdminFeedbacks,
  respondToFeedbackAdmin,
  updateFeedbackStatusAdmin,
  type FeedbackItem,
} from "../../api/feedback";
import "../../styles/appointmentlist.css";

function formatDisplayDate(value?: string | null, nowTs?: number): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (nowTs) {
    const diffSec = Math.floor((nowTs - date.getTime()) / 1000);
    if (diffSec >= 0 && diffSec < 60) return "Vừa xong";
    if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec >= 3600 && diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function renderStars(rating: number) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span
        key={i}
        style={{ color: i <= rating ? "#f59e0b" : "#d1d5db", fontSize: "1rem" }}
      >
        ★
      </span>
    );
  }
  return <div className="d-inline-flex align-items-center gap-1">{stars}</div>;
}

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Respond modal state
  const [respondTarget, setRespondTarget] = useState<FeedbackItem | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responding, setResponding] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Action in progress (e.g. status toggling)
  const [actionId, setActionId] = useState<number | null>(null);

  // Live timer & auto-sync state
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const loadFeedbacks = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const data = await fetchAdminFeedbacks();
      setFeedbacks(data);
    } catch (err) {
      if (showSpinner) {
        const message =
          err instanceof Error ? err.message : "Không thể tải danh sách đánh giá.";
        setError(message);
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeedbacks(true);

    // Live Real-time Sync: Auto-refresh data and update relative time every 4 seconds
    const interval = setInterval(() => {
      setNowTs(Date.now());
      void loadFeedbacks(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [loadFeedbacks]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = feedbacks.length;
    const avg =
      total > 0
        ? (feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / total).toFixed(1)
        : "0.0";
    const approved = feedbacks.filter(
      (f) => f.status === "APPROVED" || f.status === "PUBLISHED"
    ).length;
    const hidden = feedbacks.filter((f) => f.status === "HIDDEN").length;
    const responded = feedbacks.filter((f) => Boolean(f.adminResponse)).length;

    return { total, avg, approved, hidden, responded };
  }, [feedbacks]);

  // Filtered feedbacks
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      // Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "APPROVED") {
          if (f.status !== "APPROVED" && f.status !== "PUBLISHED") return false;
        } else if (f.status !== statusFilter) {
          return false;
        }
      }

      // Rating filter
      if (ratingFilter > 0 && f.rating !== ratingFilter) {
        return false;
      }

      // Search term filter (patient name, email, comment, title)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const nameMatch = f.patientName?.toLowerCase().includes(query);
        const emailMatch = f.patientEmail?.toLowerCase().includes(query);
        const commentMatch = f.comment?.toLowerCase().includes(query);
        const titleMatch = f.title?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !commentMatch && !titleMatch) {
          return false;
        }
      }

      return true;
    });
  }, [feedbacks, statusFilter, ratingFilter, searchTerm]);

  // Pagination state & calculation
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, ratingFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredFeedbacks.length / pageSize));

  const paginatedFeedbacks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFeedbacks.slice(start, start + pageSize);
  }, [filteredFeedbacks, currentPage, pageSize]);

  // Handle status toggle (APPROVED <-> HIDDEN)
  const handleToggleStatus = async (item: FeedbackItem) => {
    const isCurrentlyApproved =
      item.status === "APPROVED" || item.status === "PUBLISHED";
    const nextStatus = isCurrentlyApproved ? "HIDDEN" : "APPROVED";

    setActionId(item.id);
    setError("");
    try {
      await updateFeedbackStatusAdmin(item.id, nextStatus);
      setSuccessMsg(
        `Đã ${nextStatus === "APPROVED" ? "công bố" : "ẩn"} đánh giá #${item.id} thành công.`
      );
      await loadFeedbacks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật trạng thái.";
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  // Open respond modal
  const openRespondModal = (item: FeedbackItem) => {
    setRespondTarget(item);
    setResponseText(item.adminResponse || "");
  };

  // Submit response
  const handleSaveResponse = async () => {
    if (!respondTarget) return;
    if (!responseText.trim()) {
      setError("Nội dung phản hồi không được để trống.");
      return;
    }

    setResponding(true);
    setError("");
    try {
      await respondToFeedbackAdmin(respondTarget.id, responseText.trim());
      setSuccessMsg(`Đã lưu phản hồi cho đánh giá #${respondTarget.id}.`);
      setRespondTarget(null);
      await loadFeedbacks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể gửi phản hồi.";
      setError(message);
    } finally {
      setResponding(false);
    }
  };

  // Confirm delete feedback
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await deleteFeedbackAdmin(deleteTarget.id);
      setSuccessMsg(`Đã xóa đánh giá #${deleteTarget.id}.`);
      setDeleteTarget(null);
      await loadFeedbacks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể xóa đánh giá.";
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-section">
      <Row className="align-items-center mb-3">
        <Col>
          <h2 className="mb-0">Quản lý phản hồi & đánh giá</h2>
          <p className="text-muted mb-0">
            Xem xét, kiểm duyệt công bố/ẩn và phản hồi ý kiến từ bệnh nhân.
          </p>
        </Col>
        <Col className="text-end">
          <Button variant="outline-primary" onClick={() => void loadFeedbacks(true)} disabled={loading}>
            {loading ? "Đang làm mới..." : "Làm mới danh sách"}
          </Button>
        </Col>
      </Row>

      {/* Quick Statistics Banner */}
      <Row className="mb-4 g-3">
        {/* Card 1: Tổng đánh giá */}
        <Col sm={6} md={3}>
          <Card
            className="shadow-sm h-100"
            style={{
              background: "linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)",
              border: "1px solid #bae6fd",
              borderRadius: "14px",
            }}
          >
            <Card.Body className="p-3 d-flex align-items-center justify-content-between">
              <div>
                <div
                  className="text-uppercase fw-bold"
                  style={{ fontSize: "11px", color: "#0369a1", letterSpacing: "0.5px" }}
                >
                  Tổng đánh giá
                </div>
                <div className="fs-2 fw-bolder mt-1" style={{ color: "#0284c7" }}>
                  {stats.total}
                </div>
              </div>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 2: Điểm trung bình */}
        <Col sm={6} md={3}>
          <Card
            className="shadow-sm h-100"
            style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)",
              border: "1px solid #fde68a",
              borderRadius: "14px",
            }}
          >
            <Card.Body className="p-3 d-flex align-items-center justify-content-between">
              <div>
                <div
                  className="text-uppercase fw-bold"
                  style={{ fontSize: "11px", color: "#b45309", letterSpacing: "0.5px" }}
                >
                  Điểm trung bình
                </div>
                <div className="fs-2 fw-bolder mt-1" style={{ color: "#d97706" }}>
                  {stats.avg} <span style={{ fontSize: "1.4rem" }}>★</span>
                </div>
              </div>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: "#f59e0b",
                  color: "#ffffff",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 3: Đang công bố */}
        <Col sm={6} md={3}>
          <Card
            className="shadow-sm h-100"
            style={{
              background: "linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)",
              border: "1px solid #bbf7d0",
              borderRadius: "14px",
            }}
          >
            <Card.Body className="p-3 d-flex align-items-center justify-content-between">
              <div>
                <div
                  className="text-uppercase fw-bold"
                  style={{ fontSize: "11px", color: "#047857", letterSpacing: "0.5px" }}
                >
                  Đang công bố
                </div>
                <div className="fs-2 fw-bolder mt-1" style={{ color: "#059669" }}>
                  {stats.approved}
                </div>
              </div>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 4: Đã phản hồi */}
        <Col sm={6} md={3}>
          <Card
            className="shadow-sm h-100"
            style={{
              background: "linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%)",
              border: "1px solid #e9d5ff",
              borderRadius: "14px",
            }}
          >
            <Card.Body className="p-3 d-flex align-items-center justify-content-between">
              <div>
                <div
                  className="text-uppercase fw-bold"
                  style={{ fontSize: "11px", color: "#6d28d9", letterSpacing: "0.5px" }}
                >
                  Đã có phản hồi
                </div>
                <div className="fs-2 fw-bolder mt-1" style={{ color: "#7c3aed" }}>
                  {stats.responded}
                </div>
              </div>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: "#8b5cf6",
                  color: "#ffffff",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Notifications */}
      {error && (
        <Alert variant="danger" onClose={() => setError("")} dismissible>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg("")} dismissible>
          {successMsg}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card className="mb-3 shadow-sm border-0">
        <Card.Body className="p-3">
          <Row className="g-2 align-items-center">
            <Col md={4}>
              <Form.Control
                type="text"
                placeholder="Tìm theo tên bệnh nhân, nội dung..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col md={3}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="APPROVED">Đang công bố (Hiển thị)</option>
                <option value="HIDDEN">Đã ẩn (Tạm dừng)</option>
                <option value="PENDING">Chờ duyệt</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(Number(e.target.value))}
              >
                <option value={0}>Tất cả số sao</option>
                <option value={5}>5 sao (Rất hài lòng)</option>
                <option value={4}>4 sao (Hài lòng)</option>
                <option value={3}>3 sao (Bình thường)</option>
                <option value={2}>2 sao (Chưa hài lòng)</option>
                <option value={1}>1 sao (Không hài lòng)</option>
              </Form.Select>
            </Col>
            <Col md={2} className="text-end">
              <Button
                variant="outline-secondary"
                size="sm"
                className="w-100"
                onClick={() => {
                  setStatusFilter("ALL");
                  setRatingFilter(0);
                  setSearchTerm("");
                }}
              >
                Đặt lại lọc
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Feedback Table */}
      {loading ? (
        <Card body className="d-flex align-items-center gap-2 text-center py-5">
          <Spinner animation="border" size="sm" />
          <span>Đang tải danh sách phản hồi...</span>
        </Card>
      ) : filteredFeedbacks.length === 0 ? (
        <Card body className="text-center text-muted py-5">
          Không tìm thấy đánh giá nào phù hợp với bộ lọc.
        </Card>
      ) : (
        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            <Table responsive hover className="align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 60 }}>#ID</th>
                  <th style={{ width: 180 }}>Bệnh nhân</th>
                  <th style={{ width: 280 }}>Nội dung đánh giá</th>
                  <th style={{ width: 130 }}>Thời gian</th>
                  <th style={{ width: 120 }}>Trạng thái</th>
                  <th>Phản hồi phòng khám</th>
                  <th style={{ width: 200 }} className="text-center">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedFeedbacks.map((f) => {
                  const isApproved =
                    f.status === "APPROVED" || f.status === "PUBLISHED";
                  return (
                    <tr key={f.id}>
                      <td className="fw-semibold text-muted">#{f.id}</td>
                      <td>
                        <div className="fw-bold text-dark">{f.patientName}</div>
                        {f.patientEmail && (
                          <div className="text-muted small">{f.patientEmail}</div>
                        )}
                        {f.isAnonymous && (
                          <Badge bg="secondary" className="mt-1" style={{ fontSize: "0.7rem" }}>
                            Ẩn danh với khách
                          </Badge>
                        )}
                      </td>
                      <td>
                        <div className="mb-1">{renderStars(f.rating)}</div>
                        {f.title && <div className="fw-bold small">{f.title}</div>}
                        <div className="text-secondary small">{f.comment}</div>
                        {f.category && (
                          <Badge bg="light" text="dark" className="border mt-1">
                            {f.category}
                          </Badge>
                        )}
                      </td>
                      <td className="small text-muted">{formatDisplayDate(f.createdAt, nowTs)}</td>
                      <td>
                        {isApproved ? (
                          <Badge bg="success">Đang công bố</Badge>
                        ) : f.status === "HIDDEN" ? (
                          <Badge bg="secondary">Đã ẩn</Badge>
                        ) : (
                          <Badge bg="warning" text="dark">
                            Chờ duyệt
                          </Badge>
                        )}
                      </td>
                      <td>
                        {f.adminResponse ? (
                          <div
                            className="p-2 rounded bg-light border"
                            style={{ maxWidth: 320 }}
                          >
                            <div
                              className="fw-semibold text-primary mb-1"
                              style={{ fontSize: "0.75rem" }}
                            >
                              {f.adminRespondedByName || "Admin"}
                              {f.adminRespondedAt && (
                                <span className="text-muted ms-1 fw-normal">
                                  ({formatDisplayDate(f.adminRespondedAt, nowTs)})
                                </span>
                              )}
                            </div>
                            <div
                              className="text-dark small"
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {f.adminResponse}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted small fst-italic">
                            Chưa có phản hồi
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="d-flex justify-content-center gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant={isApproved ? "outline-secondary" : "outline-success"}
                            disabled={actionId === f.id}
                            onClick={() => void handleToggleStatus(f)}
                            title={isApproved ? "Ẩn khỏi trang chủ" : "Công bố hiển thị"}
                          >
                            {actionId === f.id
                              ? "..."
                              : isApproved
                              ? "Ẩn"
                              : "Công bố"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => openRespondModal(f)}
                          >
                            {f.adminResponse ? "Sửa trả lời" : "Trả lời"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => setDeleteTarget(f)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card.Body>

          {/* Pagination Footer */}
          {filteredFeedbacks.length > 0 && (
            <Card.Footer className="bg-white border-top py-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div className="d-flex align-items-center gap-2 text-muted small">
                <span>
                  Hiển thị{" "}
                  <strong>
                    {(currentPage - 1) * pageSize + 1} -{" "}
                    {Math.min(currentPage * pageSize, filteredFeedbacks.length)}
                  </strong>{" "}
                  trong số <strong>{filteredFeedbacks.length}</strong> đánh giá
                </span>
                <span className="ms-3 d-flex align-items-center gap-1">
                  Mỗi trang:
                  <Form.Select
                    size="sm"
                    style={{ width: 75 }}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </Form.Select>
                </span>
              </div>

              {totalPages > 1 && (
                <Pagination size="sm" className="mb-0">
                  <Pagination.First
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                  />
                  <Pagination.Prev
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  />
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .map((p, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <span key={p} className="d-inline-flex">
                          {showEllipsisBefore && <Pagination.Ellipsis disabled />}
                          <Pagination.Item
                            active={p === currentPage}
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </Pagination.Item>
                        </span>
                      );
                    })}
                  <Pagination.Next
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  />
                  <Pagination.Last
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                  />
                </Pagination>
              )}
            </Card.Footer>
          )}
        </Card>
      )}

      {/* Modal Respond to Feedback */}
      <Modal
        show={Boolean(respondTarget)}
        onHide={() => setRespondTarget(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {respondTarget?.adminResponse
              ? "Cập nhật phản hồi đánh giá"
              : "Phản hồi đánh giá bệnh nhân"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {respondTarget && (
            <div className="mb-3 p-3 bg-light rounded border">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="fw-bold">{respondTarget.patientName}</span>
                <span>{renderStars(respondTarget.rating)}</span>
              </div>
              <p className="mb-0 text-secondary small fst-italic">
                &ldquo;{respondTarget.comment}&rdquo;
              </p>
            </div>
          )}

          <Form.Group controlId="adminResponseInput">
            <Form.Label className="fw-semibold">
              Nội dung phản hồi chính thức từ phòng khám:
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Nhập câu trả lời lịch sự, chuyên nghiệp để gửi đến bệnh nhân..."
              value={responseText}
              maxLength={2000}
              onChange={(e) => setResponseText(e.target.value)}
            />
            <div className="d-flex justify-content-between text-muted small mt-1">
              <span>Nội dung sẽ hiển thị công khai cùng với đánh giá</span>
              <span>{responseText.length}/2000 ký tự</span>
            </div>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setRespondTarget(null)}
            disabled={responding}
          >
            Đóng
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSaveResponse()}
            disabled={responding || !responseText.trim()}
          >
            {responding ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" />
                Đang lưu...
              </>
            ) : (
              "Lưu phản hồi"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal Confirm Delete */}
      <Modal
        show={Boolean(deleteTarget)}
        onHide={() => setDeleteTarget(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">Xóa đánh giá</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Bạn có chắc chắn muốn xóa đánh giá{" "}
            <strong>#{deleteTarget?.id}</strong> của bệnh nhân{" "}
            <strong>{deleteTarget?.patientName}</strong>?
          </p>
          <p className="text-muted small mb-0">
            Hành động này sẽ được ghi lại trong nhật ký hệ thống (Audit log).
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirmDelete()}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" />
                Đang xóa...
              </>
            ) : (
              "Xác nhận xóa"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
