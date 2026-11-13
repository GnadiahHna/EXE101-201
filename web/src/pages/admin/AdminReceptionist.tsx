import { useEffect, useState } from "react";
import { Button, Card, Col, Form, Modal, Row, Spinner, Toast, ToastContainer } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { fetchReceptionistById, fetchReceptionistsAll, updateReceptionist, type Receptionist } from "../../api/receptionist";

const LIST_ALL_PATH = "/admin/receptionists";
const DETAIL_RE = /^\/admin\/receptionists\/(\d+)$/;
const UPDATE_RE = /^\/admin\/receptionists\/update\/(\d+)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function getErrMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    const message =
      typeof data === "string"
        ? data
        : isRecord(data) && typeof data.message === "string"
        ? (data.message as string)
        : undefined;
    return message ?? err.message ?? "Request failed";
  }
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return "Unknown error"; }
}

export default function AdminReceptionist() {
  const navigate = useNavigate();
  const location = useLocation();

  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [toast, setToast] = useState<{ show: boolean; msg: string; variant?: "success" | "danger" }>({ show: false, msg: "", variant: "success" });

  // create flow handled by /admin/create-user page
  // const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  const [detailEntity, setDetailEntity] = useState<Receptionist | null>(null);
  const [updateEntity, setUpdateEntity] = useState<Receptionist | null>(null);

  // removed local create form state — unified creator page used

  const [updateForm, setUpdateForm] = useState({
    fullName: "",
    phoneNumber: "",
    gender: "Other" as "Male" | "Female" | "Other",
  });
  const [savingUpdate, setSavingUpdate] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchReceptionistsAll();
      setReceptionists(data ?? []);
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.pathname === LIST_ALL_PATH) {
      loadAll();
      return;
    }

    // If user navigates directly to create path, let unified page handle it via /admin/create-user route

    const mDetail = location.pathname.match(DETAIL_RE);
    if (mDetail) {
      const id = Number(mDetail[1]);
      openDetailById(id);
      return;
    }

    const mUpdate = location.pathname.match(UPDATE_RE);
    if (mUpdate) {
      const id = Number(mUpdate[1]);
      openUpdateById(id);
      return;
    }

    // default
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const openCreate = () => {
    navigate("/admin/create-user", { state: { from: LIST_ALL_PATH, defaultUserType: "Receptionist" }, replace: false });
  };
  // no local create modal, so no closeCreate

  const openDetailById = async (id: number) => {
    try {
      const inList = receptionists.find((u) => u.id === id);
      const entity = inList ?? (await fetchReceptionistById(id));
      setDetailEntity(entity);
      setShowDetail(true);
    } catch (err) {
      setError(getErrMsg(err));
    }
  };
  const closeDetail = () => {
    setShowDetail(false);
    if (DETAIL_RE.test(location.pathname)) navigate(LIST_ALL_PATH, { replace: true });
  };

  const openUpdateById = async (id: number) => {
    try {
      const inList = receptionists.find((u) => u.id === id);
      const entity = inList ?? (await fetchReceptionistById(id));
      setUpdateEntity(entity);
      setUpdateForm({
        fullName: entity.fullName || "",
        phoneNumber: entity.phoneNumber || "",
        gender: entity.gender ?? "Other",
      });
      setShowUpdate(true);
    } catch (err) {
      setError(getErrMsg(err));
    }
  };
  const closeUpdate = () => {
    setShowUpdate(false);
    if (UPDATE_RE.test(location.pathname)) navigate(LIST_ALL_PATH, { replace: true });
  };

  // create handlers removed

  const onUpdateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setUpdateForm((p) => ({ ...p, [name]: value }));
  };
  const submitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateEntity) return;
    setSavingUpdate(true);
    setError("");
    try {
      const updated = await updateReceptionist(updateEntity.id, {
        fullName: updateForm.fullName,
        phoneNumber: updateForm.phoneNumber,
        gender: updateForm.gender,
      });
      setReceptionists((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setToast({ show: true, msg: "Receptionist updated successfully!", variant: "success" });
      closeUpdate();
    } catch (err) {
      const msg = getErrMsg(err);
      setToast({ show: true, msg, variant: "danger" });
      setError(msg);
    } finally {
      setSavingUpdate(false);
    }
  };

  return (
    <>
      <Row className="align-items-center mb-3">
        <Col xs="12" md="6" className="d-flex align-items-center gap-2">
          <div className="fw-semibold">Danh sách lễ tân</div>
        </Col>
        <Col xs="12" md="6" className="d-flex justify-content-md-end mt-2 mt-md-0">
          <Button onClick={(e) => { e.preventDefault(); openCreate(); }}>+ Thêm lễ tân</Button>
        </Col>
      </Row>

      {error && (
        <Row className="mb-3">
          <Col>
            <Card body className="border-danger-subtle text-danger">{error}</Card>
          </Col>
        </Row>
      )}

      {loading ? (
        <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Đang tải danh sách lễ tân…</span></div>
      ) : (
        <Row className="g-3">
          {receptionists.map((r) => (
            <Col key={r.id} xs={12} md={6} lg={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="d-flex flex-column">
                  <div className="d-flex align-items-start justify-content-between mb-2">
                    <Card.Title className="mb-0">{r.fullName}</Card.Title>
                    <div className="d-flex gap-2">
                      <Button size="sm" variant="outline-primary" onClick={(e) => { e.preventDefault(); navigate(`/admin/receptionists/${r.id}`); }}>Chi tiết</Button>
                      <Button size="sm" variant="outline-secondary" onClick={(e) => { e.preventDefault(); navigate(`/admin/receptionists/update/${r.id}`); }}>Cập nhật</Button>
                    </div>
                  </div>
                  <div className="text-muted small mb-2">{r.email || "—"} · {r.phoneNumber || "—"}</div>
                  <Card.Text className="text-muted flex-grow-1">Giới tính: {r.gender === "Female" ? "Nữ" : r.gender === "Male" ? "Nam" : (r.gender ?? "—")}</Card.Text>
                  <div className="text-muted" style={{ fontSize: 12 }}>ID: {r.id}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
          {receptionists.length === 0 && (
            <Col xs={12}>
              <Card className="shadow-sm"><Card.Body className="text-center text-muted">Không tìm thấy nhân viên lễ tân nào.</Card.Body></Card>
            </Col>
          )}
        </Row>
      )}

       {/* Create flow moved to unified /admin/create-user page */}

      {/* Detail Modal */}
      <Modal show={showDetail} onHide={closeDetail} centered>
        <Modal.Header closeButton>
          <Modal.Title>Chi tiết lễ tân</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailEntity ? (
            <div className="vstack gap-2">
              <div><strong>ID:</strong> {detailEntity.id}</div>
              <div><strong>Họ và tên:</strong> {detailEntity.fullName}</div>
              <div><strong>Email:</strong> {detailEntity.email ?? "—"}</div>
              <div><strong>Số điện thoại:</strong> {detailEntity.phoneNumber ?? "—"}</div>
              <div><strong>Giới tính:</strong> {detailEntity.gender === "Female" ? "Nữ" : detailEntity.gender === "Male" ? "Nam" : (detailEntity.gender ?? "—")}</div>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Đang tải…</span></div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDetail}>Đóng</Button>
        </Modal.Footer>
      </Modal>

      {/* Update Modal */}
      <Modal show={showUpdate} onHide={closeUpdate} centered>
        <Form onSubmit={submitUpdate}>
          <Modal.Header closeButton>
            <Modal.Title>Cập nhật lễ tân</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {updateEntity ? (
              <Row className="g-3">
                <Col md={12}>
                  <Form.Group controlId="uFullName">
                    <Form.Label>Họ và tên</Form.Label>
                    <Form.Control name="fullName" value={updateForm.fullName} onChange={onUpdateChange} required />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uPhone">
                    <Form.Label>Phone number</Form.Label>
                    <Form.Control name="phoneNumber" value={updateForm.phoneNumber} onChange={onUpdateChange} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uGender">
                    <Form.Label>Gender</Form.Label>
                    <Form.Select name="gender" value={updateForm.gender} onChange={onUpdateChange}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
            ) : (
              <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /> <span>Loading…</span></div>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-content-between">
            <div className="text-muted small ms-1">{updateEntity ? `Updating ID: ${updateEntity.id}` : ""}</div>
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={closeUpdate} disabled={savingUpdate}>Cancel</Button>
              <Button type="submit" disabled={savingUpdate || !updateForm.fullName}>{savingUpdate ? "Saving..." : "Update"}</Button>
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      <ToastContainer position="top-center">
        <Toast bg={toast.variant === "danger" ? "danger" : "success"} onClose={() => setToast((t) => ({ ...t, show: false }))} show={toast.show} delay={2500} autohide>
          <Toast.Body className="text-white">{toast.msg}</Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}