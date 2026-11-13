import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table } from "react-bootstrap";
import {
  fetchPendingShiftCancellationRequests,
  approveShiftCancellationRequest,
  rejectShiftCancellationRequest,
  type ShiftCancellationRequest,
} from "../../api/shift";
import "../../styles/shift.css";

const slotLabel: Record<string, string> = {
  MORNING: "Ca Sáng (08:00 - 12:00)",
  AFTERNOON: "Ca Chiều (13:00 - 17:00)",
  EVENING: "Ca Tối (18:00 - 21:00)",
};

export default function ShiftCancellationManagement() {
  const [requests, setRequests] = useState<ShiftCancellationRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Modal xử lý duyệt / từ chối
  const [selectedReq, setSelectedReq] = useState<ShiftCancellationRequest | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [decisionNote, setDecisionNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string>("");

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPendingShiftCancellationRequests();
      setRequests(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không thể tải danh sách yêu cầu hủy ca.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const handleOpenModal = (req: ShiftCancellationRequest, type: "APPROVE" | "REJECT") => {
    setSelectedReq(req);
    setActionType(type);
    setDecisionNote(type === "APPROVE" ? "Đồng ý phê duyệt hủy ca" : "Từ chối yêu cầu hủy ca");
    setModalError("");
  };

  const handleConfirmDecision = async () => {
    if (!selectedReq) return;
    if (actionType === "REJECT" && !decisionNote.trim()) {
      setModalError("Vui lòng nhập lý do từ chối.");
      return;
    }
    setSubmitting(true);
    setModalError("");
    try {
      if (actionType === "APPROVE") {
        await approveShiftCancellationRequest(selectedReq.id, decisionNote.trim());
        setSuccessMsg(`Đã duyệt yêu cầu hủy ca của Bác sĩ ${selectedReq.doctorName || ""} thành công.`);
      } else {
        await rejectShiftCancellationRequest(selectedReq.id, decisionNote.trim());
        setSuccessMsg(`Đã từ chối yêu cầu hủy ca của Bác sĩ ${selectedReq.doctorName || ""}.`);
      }
      setSelectedReq(null);
      await loadRequests();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="shift-wrap">
      <div className="shift-filterbar mb-4">
        <div className="left">
          <h4 className="title mb-1">Duyệt yêu cầu hủy ca làm việc</h4>
          <span className="text-muted">
            Xem và xử lý các yêu cầu hủy ca trực do Bác sĩ gửi lên hệ thống
          </span>
        </div>
        <div className="right">
          <Button variant="outline-primary" onClick={loadRequests} disabled={loading}>
            🔄 Làm mới
          </Button>
        </div>
      </div>

      {successMsg && (
        <Alert variant="success" dismissible onClose={() => setSuccessMsg("")}>
          {successMsg}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <div className="mt-2 text-muted">Đang tải danh sách yêu cầu...</div>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <h5>Không có yêu cầu hủy ca nào đang chờ duyệt</h5>
              <p className="mb-0">Tất cả các ca trực của bác sĩ đang diễn ra bình thường.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "80px" }}>ID</th>
                    <th>Bác sĩ</th>
                    <th>Ngày khám</th>
                    <th>Ca trực</th>
                    <th>Lý do hủy</th>
                    <th style={{ width: "120px" }} className="text-center">Số lịch hẹn ảnh hưởng</th>
                    <th style={{ width: "120px" }}>Trạng thái</th>
                    <th style={{ width: "180px" }} className="text-end">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id}>
                      <td className="fw-semibold">#{req.id}</td>
                      <td>
                        <div className="fw-bold text-dark">{req.doctorName || `Bác sĩ #${req.doctorId}`}</div>
                        <small className="text-muted">ID: {req.doctorId}</small>
                      </td>
                      <td>{req.shiftDate}</td>
                      <td>
                        <Badge bg="info" className="text-dark">
                          {slotLabel[req.shift] || req.shift}
                        </Badge>
                      </td>
                      <td>
                        <div className="text-wrap" style={{ maxWidth: "260px" }}>
                          {req.reason}
                        </div>
                      </td>
                      <td className="text-center">
                        <Badge bg={req.affectedAppointmentCount > 0 ? "danger" : "secondary"}>
                          {req.affectedAppointmentCount} cuộc hẹn
                        </Badge>
                      </td>
                      <td>
                        <Badge bg="warning" className="text-dark">
                          Chờ duyệt
                        </Badge>
                      </td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          variant="success"
                          className="me-2"
                          onClick={() => handleOpenModal(req, "APPROVE")}
                        >
                          Duyệt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleOpenModal(req, "REJECT")}
                        >
                          Từ chối
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Modal xác nhận Duyệt / Từ chối */}
      <Modal show={!!selectedReq} onHide={() => !submitting && setSelectedReq(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {actionType === "APPROVE" ? "Xác nhận duyệt hủy ca" : "Từ chối yêu cầu hủy ca"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedReq && (
            <div>
              <p>
                <strong>Bác sĩ:</strong> {selectedReq.doctorName} (ID: {selectedReq.doctorId})
              </p>
              <p>
                <strong>Ngày & Ca trực:</strong> {selectedReq.shiftDate} - {slotLabel[selectedReq.shift] || selectedReq.shift}
              </p>
              <p>
                <strong>Lý do bác sĩ gửi:</strong> {selectedReq.reason}
              </p>
              {selectedReq.affectedAppointmentCount > 0 && (
                <Alert variant="warning">
                  ⚠️ Ca này hiện đang có <strong>{selectedReq.affectedAppointmentCount}</strong> lịch hẹn của bệnh nhân. Khi duyệt hủy ca, hệ thống sẽ tự động hủy các lịch hẹn này và bắn chuông thông báo cho bệnh nhân!
                </Alert>
              )}

              <Form.Group className="mt-3">
                <Form.Label>
                  Ghi chú phản hồi {actionType === "REJECT" && <span className="text-danger">*</span>}:
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Nhập ghi chú phản hồi cho bác sĩ..."
                  required={actionType === "REJECT"}
                />
              </Form.Group>

              {modalError && <div className="text-danger mt-2">{modalError}</div>}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setSelectedReq(null)} disabled={submitting}>
            Hủy
          </Button>
          <Button
            variant={actionType === "APPROVE" ? "success" : "danger"}
            onClick={handleConfirmDecision}
            disabled={submitting}
          >
            {submitting ? "Đang xử lý..." : actionType === "APPROVE" ? "Đồng ý duyệt" : "Xác nhận từ chối"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
