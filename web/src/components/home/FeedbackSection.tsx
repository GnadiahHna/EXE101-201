import { useEffect, useMemo, useState } from "react";
import { Container, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
  fetchFeedbackStats,
  fetchPublicFeedbacks,
  type FeedbackItem,
  type FeedbackStats,
} from "../../api/feedback";
import { useAuth } from "../../hooks/useAuth";
import "../../styles/home-feedback.css";

const PAGE_SIZE = 6;

export default function FeedbackSection() {
  const { isAuthenticated, userType } = useAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;

    const loadData = (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      Promise.all([fetchPublicFeedbacks(), fetchFeedbackStats()])
        .then(([list, statsData]) => {
          if (!alive) return;
          setFeedbacks(list);
          setStats(statsData);
        })
        .catch((err) => {
          console.error("Không thể tải đánh giá phòng khám:", err);
        })
        .finally(() => {
          if (alive && showSpinner) setLoading(false);
        });
    };

    // Initial fetch with spinner
    loadData(true);

    // Live Real-time Sync: Auto-refresh data and update relative time every 4 seconds
    const interval = setInterval(() => {
      setNowTs(Date.now());
      loadData(false);
    }, 4000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const filteredFeedbacks = useMemo(() => {
    if (!starFilter) return feedbacks;
    return feedbacks.filter((f) => f.rating === starFilter);
  }, [feedbacks, starFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredFeedbacks.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const displayedFeedbacks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFeedbacks.slice(start, start + PAGE_SIZE);
  }, [filteredFeedbacks, currentPage]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      const diffSec = Math.floor((nowTs - d.getTime()) / 1000);
      if (diffSec >= 0 && diffSec < 60) return "Vừa xong";
      if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
      if (diffSec >= 3600 && diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
      if (diffSec >= 86400 && diffSec < 86400 * 3) return `${Math.floor(diffSec / 86400)} ngày trước`;
      return d.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="d-inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            style={{
              color: star <= rating ? "#f59e0b" : "#cbd5e1",
              fontSize: "16px",
              lineHeight: 1,
            }}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <section id="clinic-feedbacks" className="home-feedback-section">
      <Container>
        {/* Section Heading */}
        <div className="text-center mb-5">
          <span className="home-feedback-badge">Ý KIẾN KHÁCH HÀNG & BỆNH NHÂN</span>
          <h2 className="home-feedback-title">Cảm Nhận & Đánh Giá Về Phòng Khám</h2>
          <p className="home-feedback-subtitle">
            Sự hài lòng, tin tưởng và sức khoẻ của người bệnh là niềm tự hào và động lực phát triển mỗi ngày của chúng tôi.
          </p>
        </div>

        {/* Overview Score Box */}
        {stats && stats.totalFeedbacks > 0 && (
          <div className="home-feedback-overview">
            {/* Score column */}
            <div className="home-feedback-score-col">
              <div className="home-feedback-score-big">
                {stats.averageRating.toFixed(1)}
              </div>
              <div className="home-feedback-stars-row">
                {renderStars(Math.round(stats.averageRating))}
              </div>
              <div className="home-feedback-score-count">
                Dựa trên <strong>{stats.totalFeedbacks}</strong> lượt đánh giá
              </div>
            </div>

            {/* Distribution bars */}
            <div className="home-feedback-bars">
              {[5, 4, 3, 2, 1].map((s) => {
                const count = stats.starCounts?.[s] || 0;
                const pct =
                  stats.totalFeedbacks > 0
                    ? Math.round((count / stats.totalFeedbacks) * 100)
                    : 0;

                return (
                  <div key={s} className="home-feedback-bar-item">
                    <span className="home-feedback-bar-label">
                      {s} <span style={{ color: "#f59e0b" }}>★</span>
                    </span>
                    <div className="home-feedback-bar-track">
                      <div
                        className="home-feedback-bar-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="home-feedback-bar-num">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* CTA action */}
            <div className="home-feedback-cta-col">
              {isAuthenticated && userType === "Patient" ? (
                <Link to="/patient/feedback" className="home-feedback-cta-btn">
                  <span>✍️ Viết đánh giá của bạn</span>
                </Link>
              ) : (
                <Link
                  to="/login?redirect=/patient/feedback"
                  className="home-feedback-cta-btn"
                >
                  <span>✍️ Gửi đánh giá phòng khám</span>
                </Link>
              )}
              <span className="home-feedback-cta-sub">
                Đóng góp ý kiến để chúng tôi phục vụ tốt hơn
              </span>
            </div>
          </div>
        )}

        {/* Filter bar */}
        {feedbacks.length > 0 && (
          <div className="home-feedback-filter-bar">
            <button
              type="button"
              className={`home-feedback-filter-chip ${
                starFilter === null ? "is-active" : ""
              }`}
              onClick={() => {
                setStarFilter(null);
                setCurrentPage(1);
              }}
            >
              Tất cả ({feedbacks.length})
            </button>
            {[5, 4, 3, 2, 1].map((s) => {
              const count = feedbacks.filter((f) => f.rating === s).length;
              const isActive = starFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  className={`home-feedback-filter-chip ${
                    isActive ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setStarFilter(starFilter === s ? null : s);
                    setCurrentPage(1);
                  }}
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
        )}

        {/* Feedbacks Grid */}
        {loading ? (
          <div className="text-center py-5 text-muted">
            <Spinner animation="border" size="sm" className="me-2" />
            Đang tải đánh giá từ người dùng...
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="text-center py-5 text-muted bg-white rounded-4 border p-4">
            <p className="mb-2 fs-5 fw-semibold text-secondary">
              Chưa có đánh giá nào được hiển thị
            </p>
            <p className="text-muted mb-3">
              Hãy là người đầu tiên chia sẻ cảm nhận về dịch vụ của chúng tôi!
            </p>
            <Link to="/patient/feedback" className="btn btn-outline-primary btn-sm">
              Gửi đánh giá ngay
            </Link>
          </div>
        ) : (
          <>
            <div className="home-feedback-grid">
              {displayedFeedbacks.map((item) => (
                <div key={item.id} className="home-feedback-card">
                  <div>
                    {/* Header: avatar + name + rating badge */}
                    <div className="home-feedback-card-header">
                      <div className="home-feedback-patient-info">
                        <div
                          className={`home-feedback-avatar ${
                            item.isAnonymous ? "anonymous" : ""
                          }`}
                        >
                          {item.isAnonymous
                            ? "ẨD"
                            : item.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="home-feedback-meta-name">
                            {item.patientName}
                            {item.isAnonymous && (
                              <span className="home-feedback-badge-anon">
                                Ẩn danh
                              </span>
                            )}
                          </div>
                          <span className="home-feedback-meta-date">
                            {formatDate(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="home-feedback-stars-badge">
                        ★ {item.rating}
                      </div>
                    </div>

                    {/* Body: category + title + comment */}
                    <div className="home-feedback-card-body">
                      {item.category && (
                        <span className="home-feedback-category">
                          {item.category}
                        </span>
                      )}
                      {item.title && (
                        <h4 className="home-feedback-card-title">{item.title}</h4>
                      )}
                      <p className="home-feedback-card-comment">{item.comment}</p>
                    </div>
                  </div>

                  {/* Clinic response */}
                  {item.adminResponse && (
                    <div className="home-feedback-admin-reply">
                      <div className="home-feedback-admin-title">
                        <span>🏥</span> Phản hồi từ Phòng khám:
                      </div>
                      <div>{item.adminResponse}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="home-feedback-pagination d-flex flex-column align-items-center gap-2">
                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="home-feedback-page-btn"
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      document.getElementById("clinic-feedbacks")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    title="Trang trước"
                  >
                    ‹ Trước
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <span key={p} className="d-inline-flex align-items-center">
                          {showEllipsisBefore && <span className="px-2 text-muted fw-bold">...</span>}
                          <button
                            type="button"
                            className={`home-feedback-page-btn ${p === currentPage ? "is-active" : ""}`}
                            onClick={() => {
                              setCurrentPage(p);
                              document.getElementById("clinic-feedbacks")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            {p}
                          </button>
                        </span>
                      );
                    })}

                  <button
                    type="button"
                    className="home-feedback-page-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => {
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                      document.getElementById("clinic-feedbacks")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    title="Trang sau"
                  >
                    Sau ›
                  </button>
                </div>

                <div className="text-muted small mt-1">
                  Trang <strong>{currentPage}</strong> / <strong>{totalPages}</strong> (Hiển thị {displayedFeedbacks.length} / {filteredFeedbacks.length} đánh giá)
                </div>
              </div>
            )}
          </>
        )}
      </Container>
    </section>
  );
}
