import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import {
  createFeedback,
  deleteFeedback,
  fetchFeedbackStats,
  fetchMyFeedbacks,
  fetchPublicFeedbacks,
  updateFeedback,
  type CreateFeedbackPayload,
  type FeedbackItem,
  type FeedbackStats,
} from "../../api/feedback";
import "../../styles/patient.css";
import "../../styles/feedback.css";

const CATEGORIES = [
  "Chất lượng khám chữa bệnh",
  "Thái độ nhân viên & Y bác sĩ",
  "Cơ sở vật chất & Thiết bị",
  "Thời gian chờ đợi",
  "Quy trình đặt lịch hẹn",
  "Chi phí & Dịch vụ",
  "Khác",
];

const RATING_LABELS: Record<number, string> = {
  1: "Rất không hài lòng (1/5)",
  2: "Chưa hài lòng, cần cải thiện (2/5)",
  3: "Bình thường / Tạm ổn (3/5)",
  4: "Hài lòng, dịch vụ tốt (4/5)",
  5: "Rất hài lòng, tuyệt vời! (5/5)",
};

export default function PatientFeedback() {
  const [activeTab, setActiveTab] = useState<"write" | "community">("write");

  // Data states
  const [myFeedbacks, setMyFeedbacks] = useState<FeedbackItem[]>([]);
  const [publicFeedbacks, setPublicFeedbacks] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);

  // Loading & error states
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for creating feedback
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Edit modal states
  const [editingItem, setEditingItem] = useState<FeedbackItem | null>(null);
  const [editRating, setEditRating] = useState<number>(5);
  const [editTitle, setEditTitle] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editCategory, setEditCategory] = useState(CATEGORIES[0]);
  const [editAnonymous, setEditAnonymous] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Community star filter
  const [starFilter, setStarFilter] = useState<number | null>(null);

  // Load patient's feedbacks
  const loadMyFeedbacks = useCallback(async () => {
    setLoadingMy(true);
    try {
      const data = await fetchMyFeedbacks();
      setMyFeedbacks(data);
    } catch (err) {
      console.error("Lỗi tải đánh giá của tôi:", err);
    } finally {
      setLoadingMy(false);
    }
  }, []);

  // Load public feedbacks and stats
  const loadPublicData = useCallback(async () => {
    setLoadingPublic(true);
    try {
      const [list, statsData] = await Promise.all([
        fetchPublicFeedbacks(),
        fetchFeedbackStats(),
      ]);
      setPublicFeedbacks(list);
      setStats(statsData);
    } catch (err) {
      console.error("Lỗi tải phản hồi công khai:", err);
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    void loadMyFeedbacks();
    void loadPublicData();
  }, [loadMyFeedbacks, loadPublicData]);

  // Handle submit new feedback
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setErrorMsg("Vui lòng nhập nội dung đánh giá của bạn.");
      return;
    }
    if (comment.trim().length < 5) {
      setErrorMsg("Nội dung đánh giá cần tối thiểu 5 ký tự để phòng khám hỗ trợ tốt nhất.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload: CreateFeedbackPayload = {
      rating,
      title: title.trim(),
      comment: comment.trim(),
      category,
      isAnonymous,
    };

    try {
      await createFeedback(payload);
      setSuccessMsg("Cảm ơn bạn! Đánh giá của bạn đã được gửi thành công.");
      // Reset form
      setTitle("");
      setComment("");
      setRating(5);
      setCategory(CATEGORIES[0]);
      setIsAnonymous(false);

      // Reload
      await Promise.all([loadMyFeedbacks(), loadPublicData()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gửi đánh giá không thành công.";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit modal
  const handleOpenEdit = (item: FeedbackItem) => {
    setEditingItem(item);
    setEditRating(item.rating);
    setEditTitle(item.title || "");
    setEditComment(item.comment);
    setEditCategory(item.category || CATEGORIES[0]);
    setEditAnonymous(Boolean(item.isAnonymous));
  };

  // Submit update feedback
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!editComment.trim()) {
      setErrorMsg("Nội dung đánh giá không được để trống.");
      return;
    }

    setSavingEdit(true);
    setErrorMsg(null);
    try {
      await updateFeedback(editingItem.id, {
        rating: editRating,
        title: editTitle.trim(),
        comment: editComment.trim(),
        category: editCategory,
        isAnonymous: editAnonymous,
      });
      setSuccessMsg("Cập nhật đánh giá thành công!");
      setEditingItem(null);
      await Promise.all([loadMyFeedbacks(), loadPublicData()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể cập nhật đánh giá.";
      setErrorMsg(message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete feedback
  const handleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá đánh giá này không?")) return;
    setErrorMsg(null);
    try {
      await deleteFeedback(id);
      setSuccessMsg("Đã xoá đánh giá thành công.");
      await Promise.all([loadMyFeedbacks(), loadPublicData()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể xoá đánh giá.";
      setErrorMsg(message);
    }
  };

  // Community filtered feedbacks
  const filteredPublicFeedbacks = useMemo(() => {
    if (!starFilter) return publicFeedbacks;
    return publicFeedbacks.filter((item) => item.rating === starFilter);
  }, [publicFeedbacks, starFilter]);

  // Format date helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const renderStars = (count: number, interactive = false, currentVal = 5, onSelect?: (val: number) => void) => {
    return (
      <div className="star-rating-stars">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = interactive
            ? star <= (hoverRating ?? currentVal)
            : star <= count;

          return (
            <button
              key={star}
              type="button"
              className="star-btn"
              disabled={!interactive}
              onClick={() => onSelect && onSelect(star)}
              onMouseEnter={() => interactive && setHoverRating(star)}
              onMouseLeave={() => interactive && setHoverRating(null)}
              aria-label={`${star} sao`}
            >
              <svg
                className={`star-icon ${isFilled ? "filled" : ""}`}
                viewBox="0 0 24 24"
              >
                <polygon
                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  strokeWidth="1.5"
                  stroke="currentColor"
                />
              </svg>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="patient-page feedback-container">
      {/* Header */}
      <header className="patient-header">
        <h1>Đánh giá & Góp ý phòng khám</h1>
        <p>
          Ý kiến của bạn là động lực to lớn giúp chúng tôi nâng cao chất lượng dịch vụ chăm sóc sức khoẻ tốt hơn mỗi ngày.
        </p>
        {successMsg && (
          <Alert variant="success" className="mt-2" onClose={() => setSuccessMsg(null)} dismissible>
            {successMsg}
          </Alert>
        )}
        {errorMsg && (
          <Alert variant="danger" className="mt-2" onClose={() => setErrorMsg(null)} dismissible>
            {errorMsg}
          </Alert>
        )}
      </header>

      {/* Tabs */}
      <nav className="feedback-tabs" aria-label="Feedback Navigation">
        <button
          type="button"
          className={`feedback-tab-btn ${activeTab === "write" ? "is-active" : ""}`}
          onClick={() => setActiveTab("write")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Gửi đánh giá & Phản hồi của tôi
          <span className="feedback-tab-badge">{myFeedbacks.length}</span>
        </button>

        <button
          type="button"
          className={`feedback-tab-btn ${activeTab === "community" ? "is-active" : ""}`}
          onClick={() => setActiveTab("community")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Đánh giá từ cộng đồng
          <span className="feedback-tab-badge">{stats?.totalFeedbacks ?? publicFeedbacks.length}</span>
        </button>
      </nav>

      {/* Tab 1: Write Feedback & My Feedbacks */}
      {activeTab === "write" && (
        <section className="patient-body">
          {/* Write feedback form */}
          <div className="patient-card">
            <div className="patient-card__header">
              <div>
                <h2 className="patient-card__title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Gửi đánh giá trải nghiệm phòng khám
                </h2>
                <p className="patient-card__subtitle">
                  Chia sẻ cảm nhận chân thực của bạn về trải nghiệm thăm khám tại phòng khám.
                </p>
              </div>
            </div>

            <Form onSubmit={handleSubmitFeedback}>
              {/* Star Rating Selection */}
              <Form.Group className="mb-4">
                <Form.Label className="fw-semibold">1. Mức độ hài lòng của bạn *</Form.Label>
                <div className="star-rating-box">
                  {renderStars(rating, true, rating, (val) => setRating(val))}
                  <div className="star-rating-label">
                    {RATING_LABELS[hoverRating ?? rating]}
                  </div>
                </div>
              </Form.Group>

              {/* Category picker */}
              <Form.Group className="mb-4">
                <Form.Label className="fw-semibold">2. Khía cạnh bạn muốn góp ý *</Form.Label>
                <div className="category-picker">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-chip ${category === cat ? "is-selected" : ""}`}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </Form.Group>

              {/* Title input */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">3. Tiêu đề ngắn gọn (tuỳ chọn)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Ví dụ: Bác sĩ rất ân cần, phòng khám hiện đại và sạch sẽ..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                />
              </Form.Group>

              {/* Comment textarea */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">4. Chi tiết phản hồi & góp ý *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder="Hãy chia sẻ chi tiết về trải nghiệm thăm khám, thái độ phục vụ, thời gian chờ hoặc bất kỳ điểm nào bạn muốn phòng khám cải thiện..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  required
                />
                <Form.Text className="text-muted d-flex justify-content-between">
                  <span>Tối thiểu 5 ký tự.</span>
                  <span>{comment.length} / 2000 ký tự</span>
                </Form.Text>
              </Form.Group>

              {/* Anonymous checkbox */}
              <Form.Group className="mb-4">
                <Form.Check
                  type="checkbox"
                  id="anonymous-check"
                  label={
                    <span>
                      <strong>Đánh giá ẩn danh</strong> (Họ và tên đầy đủ của bạn sẽ không hiển thị trên trang đánh giá công khai).
                    </span>
                  }
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
              </Form.Group>

              {/* Submit button */}
              <div className="d-flex justify-content-end">
                <Button
                  variant="primary"
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="px-4 d-inline-flex align-items-center gap-2"
                >
                  {submitting && <Spinner animation="border" size="sm" />}
                  {submitting ? "Đang gửi đánh giá..." : "Gửi đánh giá phòng khám"}
                </Button>
              </div>
            </Form>
          </div>

          {/* List of my previous feedbacks */}
          <div className="patient-card mt-2">
            <div className="patient-card__header">
              <div>
                <h2 className="patient-card__title">
                  Lịch sử đánh giá của bạn ({myFeedbacks.length})
                </h2>
                <p className="patient-card__subtitle">
                  Các đánh giá bạn đã từng gửi cho phòng khám. Bạn có thể cập nhật hoặc xoá bất cứ lúc nào.
                </p>
              </div>
            </div>

            {loadingMy ? (
              <div className="text-center py-4 text-muted">
                <Spinner animation="border" size="sm" className="me-2" />
                Đang tải danh sách đánh giá của bạn...
              </div>
            ) : myFeedbacks.length === 0 ? (
              <div className="feedback-empty">
                <svg className="feedback-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <strong>Bạn chưa gửi đánh giá nào</strong>
                <p className="text-muted mb-0">
                  Hãy gửi đánh giá đầu tiên của bạn ở biểu mẫu phía trên để chia sẻ cảm nhận nhé!
                </p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {myFeedbacks.map((item) => (
                  <div key={item.id} className="feedback-card-item">
                    <div className="feedback-card-header">
                      <div className="feedback-user-info">
                        <div className={`feedback-avatar ${item.isAnonymous ? "anonymous" : ""}`}>
                          {item.isAnonymous ? "ẨD" : item.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="feedback-meta">
                          <span className="feedback-user-name">
                            {item.patientName}
                            {item.isAnonymous && (
                              <span className="feedback-anonymous-badge">Ẩn danh</span>
                            )}
                          </span>
                          <span className="feedback-date">{formatDate(item.createdAt)}</span>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-2">
                        <div className="feedback-rating-badge">
                          ⭐ {item.rating} / 5
                        </div>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(item)}
                          title="Sửa đánh giá"
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          title="Xóa đánh giá"
                        >
                          Xoá
                        </Button>
                      </div>
                    </div>

                    <div className="feedback-card-content">
                      {item.category && (
                        <span className="feedback-category-badge">{item.category}</span>
                      )}
                      {item.title && <h4 className="feedback-title">{item.title}</h4>}
                      <p className="feedback-text">{item.comment}</p>
                    </div>

                    {/* Admin clinic reply if any */}
                    {item.adminResponse && (
                      <div className="feedback-admin-reply">
                        <div className="feedback-admin-reply-header">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          Phản hồi từ Ban Quản Lý Phòng Khám:
                        </div>
                        <p className="feedback-admin-reply-text">{item.adminResponse}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tab 2: Community Reviews & Stats */}
      {activeTab === "community" && (
        <section className="patient-body">
          {/* Stats Bar */}
          {stats && (
            <div className="stats-card">
              <div className="stats-score-box">
                <div className="stats-score-number">{stats.averageRating.toFixed(1)}</div>
                <div className="stats-score-stars">
                  {renderStars(Math.round(stats.averageRating))}
                </div>
                <div className="stats-score-total">
                  Dựa trên <strong>{stats.totalFeedbacks}</strong> lượt đánh giá
                </div>
              </div>

              <div className="stats-breakdown">
                {[5, 4, 3, 2, 1].map((starLevel) => {
                  const count = stats.starCounts?.[starLevel] || 0;
                  const pct = stats.totalFeedbacks > 0
                    ? Math.round((count / stats.totalFeedbacks) * 100)
                    : 0;

                  return (
                    <div key={starLevel} className="stats-bar-row">
                      <span className="stats-bar-label">
                        {starLevel} <span style={{ color: "#f59e0b" }}>★</span>
                      </span>
                      <div className="stats-bar-track">
                        <div className="stats-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="stats-bar-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Star Filter Bar */}
          <div className="feedback-filter-bar">
            <span className="me-2 text-muted fw-semibold small">Lọc theo:</span>
            <button
              type="button"
              className={`feedback-filter-btn ${starFilter === null ? "is-active" : ""}`}
              onClick={() => setStarFilter(null)}
            >
              Tất cả ({publicFeedbacks.length})
            </button>
            {[5, 4, 3, 2, 1].map((s) => {
              const count = publicFeedbacks.filter((f) => f.rating === s).length;
              const isActive = starFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  className={`feedback-filter-btn ${isActive ? "is-active" : ""}`}
                  onClick={() => setStarFilter(starFilter === s ? null : s)}
                >
                  <span className="d-inline-flex align-items-center gap-1">
                    <span
                      style={{
                        color: isActive ? "#fde047" : "#f59e0b",
                        letterSpacing: "1px",
                        fontSize: "14px",
                      }}
                    >
                      {"★".repeat(s)}
                    </span>
                    <span>({count})</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Public Feedback Items */}
          {loadingPublic ? (
            <div className="text-center py-5 text-muted">
              <Spinner animation="border" size="sm" className="me-2" />
              Đang tải danh sách đánh giá...
            </div>
          ) : filteredPublicFeedbacks.length === 0 ? (
            <div className="feedback-empty">
              <svg className="feedback-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <strong>Không có đánh giá nào phù hợp với bộ lọc</strong>
              <Button variant="outline-primary" size="sm" onClick={() => setStarFilter(null)}>
                Xem tất cả đánh giá
              </Button>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {filteredPublicFeedbacks.map((item) => (
                <div key={item.id} className="feedback-card-item">
                  <div className="feedback-card-header">
                    <div className="feedback-user-info">
                      <div className={`feedback-avatar ${item.isAnonymous ? "anonymous" : ""}`}>
                        {item.isAnonymous ? "ẨD" : item.patientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="feedback-meta">
                        <span className="feedback-user-name">
                          {item.patientName}
                          {item.isAnonymous && (
                            <span className="feedback-anonymous-badge">Ẩn danh</span>
                          )}
                          {item.isOwner && (
                            <span className="badge bg-primary-subtle text-primary border ms-1">
                              Đánh giá của bạn
                            </span>
                          )}
                        </span>
                        <span className="feedback-date">{formatDate(item.createdAt)}</span>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2">
                      <div className="feedback-rating-badge">
                        ⭐ {item.rating} / 5
                      </div>
                      {item.isOwner && (
                        <>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => handleOpenEdit(item)}
                          >
                            Sửa
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                          >
                            Xoá
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="feedback-card-content">
                    {item.category && (
                      <span className="feedback-category-badge">{item.category}</span>
                    )}
                    {item.title && <h4 className="feedback-title">{item.title}</h4>}
                    <p className="feedback-text">{item.comment}</p>
                  </div>

                  {item.adminResponse && (
                    <div className="feedback-admin-reply">
                      <div className="feedback-admin-reply-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        Phản hồi từ Ban Quản Lý Phòng Khám:
                      </div>
                      <p className="feedback-admin-reply-text">{item.adminResponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Edit Feedback Modal */}
      <Modal show={Boolean(editingItem)} onHide={() => setEditingItem(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Chỉnh sửa đánh giá</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Mức độ hài lòng *</Form.Label>
              <div className="star-rating-box">
                {renderStars(editRating, true, editRating, (val) => setEditRating(val))}
                <div className="star-rating-label">{RATING_LABELS[hoverRating ?? editRating]}</div>
              </div>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Khía cạnh góp ý *</Form.Label>
              <Form.Select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Tiêu đề (tuỳ chọn)</Form.Label>
              <Form.Control
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={150}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Nội dung đánh giá *</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                maxLength={2000}
                required
              />
            </Form.Group>

            <Form.Group className="mb-2">
              <Form.Check
                type="checkbox"
                id="edit-anonymous"
                label="Đánh giá ẩn danh (không hiện tên công khai)"
                checked={editAnonymous}
                onChange={(e) => setEditAnonymous(e.target.checked)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditingItem(null)}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveEdit}
            disabled={savingEdit}
            className="d-inline-flex align-items-center gap-2"
          >
            {savingEdit && <Spinner animation="border" size="sm" />}
            Lưu thay đổi
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
