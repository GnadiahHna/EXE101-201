import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  fetchAllUserVouchersForReception,
  fetchUserVouchersForReception,
  searchUsersForReception,
  useVoucherForUserReception,
} from "../../api/receptionist";
import {
  type UserVoucher,
  type VoucherType,
} from "../../api/voucher";
import "../../styles/appointmentlist.css";

const VoucherTypeLabel: Record<VoucherType, string> = {
  SERVICE_TICKET: "Vé dịch vụ",
  DISCOUNT: "Giảm giá",
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

export default function RecepVouchers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    { id: number; fullName?: string | null; email?: string | null; phone?: string | null }[]
  >([]);
  const [selectedUser, setSelectedUser] = useState<
    { id: number; fullName?: string | null; email?: string | null; phone?: string | null } | null
  >(null);

  const [allVouchers, setAllVouchers] = useState<UserVoucher[]>([]);
  const [userVouchers, setUserVouchers] = useState<UserVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [usingVoucherId, setUsingVoucherId] = useState<number | null>(null);

  const loadAllVouchers = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchAllUserVouchersForReception();
      setAllVouchers(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải danh sách voucher.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllVouchers();
  }, []);

  const loadUserVouchers = async (user: { id: number; fullName?: string | null; email?: string | null; phone?: string | null }) => {
    setSelectedUser(user);
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const list = await fetchUserVouchersForReception(user.id);
      setUserVouchers(list);
      if (list.length === 0) {
        setSuccessMessage(`${user.fullName || `User #${user.id}`} chưa sở hữu voucher nào.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải voucher của người dùng.";
      setError(message);
      setUserVouchers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSearch = () => {
    setSelectedUser(null);
    setSearchResults([]);
    setSearchTerm("");
    setError("");
    setSuccessMessage("");
    void loadAllVouchers();
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = searchTerm.trim();
    if (keyword.length === 0) {
      handleResetSearch();
      return;
    }
    setError("");
    setSuccessMessage("");
    setSearching(true);
    try {
      const users = await searchUsersForReception(keyword);
      setSearchResults(users);
      if (users.length === 1) {
        void loadUserVouchers(users[0]);
      } else if (users.length === 0) {
        setSelectedUser(null);
        setSuccessMessage("Không tìm thấy người dùng phù hợp.");
      } else {
        setSelectedUser(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tìm kiếm người dùng.";
      setError(message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleUseVoucher = async (userVoucherId: number, owner: UserVoucher) => {
    setUsingVoucherId(owner.id);
    setError("");
    setSuccessMessage("");
    if (!owner.userId) {
      setError("Không xác định được người dùng của voucher.");
      setUsingVoucherId(null);
      return;
    }
    try {
      const updated = await useVoucherForUserReception(userVoucherId, owner.userId);
      setAllVouchers((prev) =>
        prev.map((item) =>
          item.id === owner.id ? { ...item, used: updated.used } : item
        )
      );
      setUserVouchers((prev) =>
        prev.map((item) =>
          item.id === owner.id ? { ...item, used: updated.used } : item
        )
      );
      setSuccessMessage(
        `Đã đánh dấu voucher ${updated.voucherCode} của ${owner.userFullName || "người dùng"} là đã sử dụng.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể áp dụng voucher.";
      setError(message);
    } finally {
      setUsingVoucherId(null);
    }
  };

  return (
    <div className="page-section">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 className="mb-1">Quản lý voucher</h2>
          <p className="text-muted mb-0">Theo dõi tất cả tài khoản sở hữu voucher và xác nhận sử dụng.</p>
        </div>
        {selectedUser && (
          <Button variant="outline-secondary" size="sm" onClick={handleResetSearch}>
            &larr; Xem tất cả voucher
          </Button>
        )}
      </div>

      <Card body className="mb-3">
        <Form onSubmit={handleSearch}>
          <Row className="g-2 align-items-center">
            <Col xs={12} md={8} lg={9}>
              <InputGroup>
                <Form.Control
                  placeholder="Nhập tên, email hoặc số điện thoại người dùng để lọc..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </InputGroup>
            </Col>
            <Col xs={12} md={4} lg={3} className="d-flex justify-content-end gap-2">
              <Button type="submit" variant="primary" disabled={searching}>
                {searching ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Đang tìm...
                  </>
                ) : (
                  "Tìm kiếm"
                )}
              </Button>
              {(searchTerm || selectedUser || searchResults.length > 0) && (
                <Button variant="outline-secondary" onClick={handleResetSearch}>
                  Đặt lại
                </Button>
              )}
            </Col>
          </Row>
        </Form>
      </Card>

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

      {searchResults.length > 0 && !selectedUser && (
        <Card body className="mb-3">
          <h5 className="mb-3">Kết quả tìm kiếm người dùng</h5>
          <Table responsive hover className="align-middle mb-0">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th style={{ width: 140 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName || `User #${user.id}`}</td>
                  <td>{user.email || "—"}</td>
                  <td>{user.phone || "—"}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => void loadUserVouchers(user)}
                    >
                      Xem voucher
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Hiển thị voucher của user được chọn */}
      {selectedUser ? (
        <Card className="mb-3">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="mb-1">Voucher của {selectedUser.fullName || `User #${selectedUser.id}`}</h5>
              <div className="text-muted small">
                Email: {selectedUser.email || "—"} &middot; SĐT: {selectedUser.phone || "—"}
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Badge bg="info">Tổng: {userVouchers.length}</Badge>
              <Button variant="outline-secondary" size="sm" onClick={handleResetSearch}>
                Đóng
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <div className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" />
                Đang tải voucher...
              </div>
            ) : userVouchers.length === 0 ? (
              <div className="text-muted">Người dùng chưa có voucher nào.</div>
            ) : (
              <Table responsive hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên voucher</th>
                    <th>Loại</th>
                    <th>Nhận lúc</th>
                    <th>Hạn sử dụng</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 140 }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {userVouchers.map((voucher) => (
                    <tr key={voucher.id}>
                      <td>
                        <strong>{voucher.voucherCode}</strong>
                      </td>
                      <td>{voucher.voucherName || "Voucher ưu đãi"}</td>
                      <td>{VoucherTypeLabel[voucher.type]}</td>
                      <td>{formatDateTime(voucher.issuedAt)}</td>
                      <td>{formatDateTime(voucher.expiryDate)}</td>
                      <td>
                        <Badge bg={voucher.used ? "secondary" : "success"}>
                          {voucher.used ? "Đã dùng" : "Chưa dùng"}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={voucher.used || usingVoucherId === voucher.id}
                          onClick={() => handleUseVoucher(voucher.id, voucher)}
                        >
                          {usingVoucherId === voucher.id ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-1" />
                              Đang xử lý...
                            </>
                          ) : (
                            "Đánh dấu dùng"
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      ) : (
        /* Hiển thị tất cả tài khoản đang có voucher khi mới vào trang */
        <Card className="mb-3">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Tất cả tài khoản đang sở hữu voucher</h5>
            <Badge bg="primary">Tổng cộng: {allVouchers.length} voucher</Badge>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <div className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" />
                Đang tải danh sách voucher...
              </div>
            ) : allVouchers.length === 0 ? (
              <div className="text-muted">Chưa có người dùng nào sở hữu voucher.</div>
            ) : (
              <Table responsive hover className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Chủ sở hữu</th>
                    <th>Liên hệ</th>
                    <th>Mã voucher</th>
                    <th>Tên voucher</th>
                    <th>Loại</th>
                    <th>Hạn sử dụng</th>
                    <th>Trạng thái</th>
                    <th style={{ width: 140 }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {allVouchers.map((voucher) => (
                    <tr key={voucher.id}>
                      <td>
                        <strong>{voucher.userFullName || `User #${voucher.userId || "—"}`}</strong>
                      </td>
                      <td className="small text-muted">
                        <div>{voucher.userPhone || "—"}</div>
                        <div>{voucher.userEmail || ""}</div>
                      </td>
                      <td>
                        <Badge bg="light" text="dark" className="border font-monospace">
                          {voucher.voucherCode}
                        </Badge>
                      </td>
                      <td>{voucher.voucherName || "Voucher ưu đãi"}</td>
                      <td>{VoucherTypeLabel[voucher.type]}</td>
                      <td>{formatDateTime(voucher.expiryDate)}</td>
                      <td>
                        <Badge bg={voucher.used ? "secondary" : "success"}>
                          {voucher.used ? "Đã dùng" : "Chưa dùng"}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={voucher.used || usingVoucherId === voucher.id}
                          onClick={() => handleUseVoucher(voucher.id, voucher)}
                        >
                          {usingVoucherId === voucher.id ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-1" />
                              Đang xử lý...
                            </>
                          ) : (
                            "Đánh dấu dùng"
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
