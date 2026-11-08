import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  createAdminRssSource,
  fetchAdminManagedNews,
  fetchAdminRssSources,
  syncAdminRssSource,
  toggleAdminRssSourceStatus,
  updateAdminRssSource,
  type News,
  type RssSourceItem,
} from "../../api/news";
import "../../styles/appointmentlist.css";

type SourceFormState = {
  name: string;
  url: string;
  category: string;
  isEnabled: boolean;
};

const emptySourceForm: SourceFormState = {
  name: "",
  url: "",
  category: "",
  isEnabled: true,
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

export default function AdminNews() {
  const [sources, setSources] = useState<RssSourceItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [articles, setArticles] = useState<News[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalArticles, setTotalArticles] = useState<number>(0);

  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<RssSourceItem | null>(null);
  const [form, setForm] = useState<SourceFormState>({ ...emptySourceForm });
  const [saving, setSaving] = useState(false);

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const list = await fetchAdminRssSources();
      setSources(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể tải danh sách nguồn tin RSS.";
      setError(msg);
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadArticles = useCallback(
    async (targetPage = page, sourceFilter = selectedSourceId, searchKeyword = keyword) => {
      setLoadingArticles(true);
      try {
        const res = await fetchAdminManagedNews({
          sourceId: sourceFilter || undefined,
          keyword: searchKeyword.trim() || undefined,
          page: targetPage,
          limit: 10,
        });
        setArticles(res.items);
        setPage(res.pagination.page);
        setTotalPages(res.pagination.totalPages);
        setTotalArticles(res.pagination.total);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Không thể tải danh sách bài viết.";
        setError(msg);
      } finally {
        setLoadingArticles(false);
      }
    },
    [page, selectedSourceId, keyword]
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    void loadArticles(1, selectedSourceId, keyword);
  }, [selectedSourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreateModal = () => {
    setEditingSource(null);
    setForm({ ...emptySourceForm });
    setShowForm(true);
  };

  const openEditModal = (src: RssSourceItem) => {
    setEditingSource(src);
    setForm({
      name: src.name,
      url: src.url,
      category: src.category || "",
      isEnabled: src.isEnabled,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingSource(null);
    setForm({ ...emptySourceForm });
  };

  const handleSubmitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên nguồn tin RSS không được để trống.");
      return;
    }
    if (!form.url.trim()) {
      setError("URL nguồn tin RSS không được để trống.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim(),
        category: form.category.trim(),
        status: form.isEnabled ? ("active" as const) : ("inactive" as const),
      };

      if (editingSource) {
        await updateAdminRssSource(editingSource.id, payload);
        setSuccessMessage(`Đã cập nhật nguồn tin "${payload.name}" thành công.`);
      } else {
        await createAdminRssSource(payload);
        setSuccessMessage(`Đã tạo nguồn tin "${payload.name}" thành công.`);
      }
      closeForm();
      await Promise.all([loadSources(), loadArticles(page, selectedSourceId, keyword)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể lưu nguồn tin RSS.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (src: RssSourceItem) => {
    setTogglingId(src.id);
    setError("");
    setSuccessMessage("");
    try {
      const nextEnable = !src.isEnabled;
      await toggleAdminRssSourceStatus(src.id, nextEnable);
      setSuccessMessage(
        nextEnable
          ? `Đã kích hoạt nguồn tin "${src.name}".`
          : `Đã vô hiệu hóa nguồn tin "${src.name}".`
      );
      await Promise.all([loadSources(), loadArticles(page, selectedSourceId, keyword)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể đổi trạng thái nguồn tin.";
      setError(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSyncSource = async (src: RssSourceItem) => {
    setSyncingId(src.id);
    setError("");
    setSuccessMessage("");
    try {
      const result = await syncAdminRssSource(src.id);
      setSuccessMessage(
        `Đồng bộ "${src.name}" hoàn tất: +${result.summary.insertedCount} bài mới (bỏ qua ${result.summary.skippedDuplicateCount} bài trùng).`
      );
      await Promise.all([loadSources(), loadArticles(1, selectedSourceId, keyword)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể đồng bộ nguồn RSS.";
      setError(msg);
      await loadSources();
    } finally {
      setSyncingId(null);
    }
  };

  const handleSearchArticles = (e: React.FormEvent) => {
    e.preventDefault();
    void loadArticles(1, selectedSourceId, keyword);
  };

  return (
    <div className="page-section">
      <Row className="align-items-center mb-3">
        <Col>
          <h2 className="mb-0">Quản lý Tin tức &amp; Nguồn RSS</h2>
          <p className="text-muted mb-0">
            Quản lý các nguồn RSS y tế, đồng bộ bài viết mới và kiểm duyệt tin tức hiển thị trên trang chủ.
          </p>
        </Col>
        <Col className="text-end">
          <Button onClick={openCreateModal}>+ Thêm nguồn RSS</Button>
        </Col>
      </Row>

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

      {/* Danh sách Nguồn RSS */}
      <Card className="mb-4 shadow-sm border-0">
        <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Danh sách Nguồn RSS ({sources.length})</h5>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => void loadSources()}
            disabled={loadingSources}
          >
            Làm mới
          </Button>
        </Card.Header>
        <Card.Body>
          {loadingSources ? (
            <div className="d-flex align-items-center gap-2 py-3">
              <Spinner animation="border" size="sm" />
              <span>Đang tải nguồn tin RSS...</span>
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center text-muted py-3">
              Chưa có nguồn tin RSS nào. Hãy bấm &ldquo;+ Thêm nguồn RSS&rdquo; để bắt đầu.
            </div>
          ) : (
            <Table responsive hover className="align-middle mb-0">
              <thead>
                <tr>
                  <th>Tên nguồn</th>
                  <th>Danh mục</th>
                  <th>URL RSS Feed</th>
                  <th>Số bài viết</th>
                  <th>Lần đồng bộ cuối</th>
                  <th>Trạng thái</th>
                  <th style={{ width: 240 }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((src) => (
                  <tr key={src.id}>
                    <td className="fw-semibold">{src.name}</td>
                    <td>{src.category || "—"}</td>
                    <td>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-truncate d-inline-block"
                        style={{ maxWidth: 260 }}
                        title={src.url}
                      >
                        {src.url}
                      </a>
                    </td>
                    <td>
                      <Badge bg="info">{src.articleCount ?? 0} bài</Badge>
                    </td>
                    <td>
                      <div className="small">{formatDateTime(src.lastSyncedAt)}</div>
                      {src.lastSyncStatus === "FAILED" && src.lastSyncError && (
                        <div className="text-danger small" title={src.lastSyncError}>
                          Lỗi: {src.lastSyncError.slice(0, 45)}...
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge bg={src.isEnabled ? "success" : "secondary"}>
                        {src.isEnabled ? "Đang hoạt động" : "Đã tắt"}
                      </Badge>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!src.isEnabled || syncingId === src.id}
                          onClick={() => void handleSyncSource(src)}
                          title="Kéo bài viết mới từ RSS Feed"
                        >
                          {syncingId === src.id ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-1" />
                              Đồng bộ...
                            </>
                          ) : (
                            "Đồng bộ"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => openEditModal(src)}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant={src.isEnabled ? "outline-warning" : "outline-success"}
                          disabled={togglingId === src.id}
                          onClick={() => void handleToggleStatus(src)}
                        >
                          {togglingId === src.id ? (
                            <Spinner animation="border" size="sm" />
                          ) : src.isEnabled ? (
                            "Tắt"
                          ) : (
                            "Bật"
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Danh sách Bài viết Tin tức */}
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-white py-3">
          <Row className="g-2 align-items-center">
            <Col md={4}>
              <h5 className="mb-0">Bài viết đã lưu ({totalArticles})</h5>
            </Col>
            <Col md={3}>
              <Form.Select
                size="sm"
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
              >
                <option value="">— Tất cả nguồn RSS —</option>
                {sources.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.name} ({src.isEnabled ? "Active" : "Inactive"})
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={5}>
              <Form onSubmit={handleSearchArticles}>
                <InputGroup size="sm">
                  <Form.Control
                    placeholder="Tìm theo tiêu đề bài viết..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                  <Button type="submit" variant="outline-primary">
                    Tìm kiếm
                  </Button>
                </InputGroup>
              </Form>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          {loadingArticles ? (
            <div className="d-flex align-items-center gap-2 py-3">
              <Spinner animation="border" size="sm" />
              <span>Đang tải danh sách bài viết...</span>
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center text-muted py-4">
              Không có bài viết nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <>
              <Table responsive hover className="align-middle">
                <thead>
                  <tr>
                    <th>Tiêu đề bài viết</th>
                    <th>Nguồn tin</th>
                    <th>Ngày đăng</th>
                    <th style={{ width: 120 }}>Liên kết</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((art) => (
                    <tr key={art.id}>
                      <td>
                        <div className="fw-semibold">{art.title}</div>
                        {art.summary && (
                          <div className="text-muted small text-truncate" style={{ maxWidth: 580 }}>
                            {art.summary}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge bg="light" text="dark">
                          {art.source?.name || "Nguồn RSS"}
                        </Badge>
                      </td>
                      <td className="small text-muted">{formatDateTime(art.pubDate)}</td>
                      <td>
                        {art.link ? (
                          <a
                            href={art.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Xem bài
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <span className="small text-muted">
                    Trang {page} / {totalPages}
                  </span>
                  <div className="d-flex gap-2">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={page <= 1 || loadingArticles}
                      onClick={() => void loadArticles(page - 1, selectedSourceId, keyword)}
                    >
                      Trang trước
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={page >= totalPages || loadingArticles}
                      onClick={() => void loadArticles(page + 1, selectedSourceId, keyword)}
                    >
                      Trang sau
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>

      {/* Modal tạo / sửa nguồn RSS */}
      <Modal show={showForm} onHide={closeForm} centered>
        <Form onSubmit={handleSubmitSource}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title>
              {editingSource ? "Chỉnh sửa nguồn RSS" : "Thêm nguồn RSS mới"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            <Form.Group controlId="rssName">
              <Form.Label>Tên nguồn tin</Form.Label>
              <Form.Control
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ví dụ: VnExpress Sức Khỏe"
                required
              />
            </Form.Group>
            <Form.Group controlId="rssUrl">
              <Form.Label>URL RSS / Atom Feed</Form.Label>
              <Form.Control
                type="url"
                value={form.url}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://vnexpress.net/rss/suc-khoe.rss"
                required
              />
            </Form.Group>
            <Form.Group controlId="rssCategory">
              <Form.Label>Danh mục</Form.Label>
              <Form.Control
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Ví dụ: Sức khỏe tổng quát, Dinh dưỡng..."
              />
            </Form.Group>
            <Form.Check
              type="switch"
              id="rssEnabled"
              label="Kích hoạt nguồn tin (cho phép hiển thị bài viết trên trang chủ)"
              checked={form.isEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, isEnabled: e.target.checked }))}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeForm} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner animation="border" size="sm" /> : "Lưu nguồn RSS"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

