import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Alert, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import {
  createPatientInfo,
  deletePatientInfo,
  fetchMyPatients,
  updatePatientInfo,
  type CreatePatientInfoPayload,
  type PatientInfo,
} from "../../api/patient";
import { fetchMyProfile, updateMyProfile, type UpdateUserPayload, type UserProfile } from "../../api/user";
import { changePasswordApi, type ChangePasswordPayload } from "../../api/auth";
import { useAuth } from "../../hooks/useAuth";
import Button from "../common/Button";
import { useToast } from "../common/ToastProvider";

const emptyForm: CreatePatientInfoPayload = {
  fullName: "",
  gender: "",
  phoneNumber: "",
  dob: "",
  relationship: "",
};

const emptyAccountForm = {
  fullName: "",
  phoneNumber: "",
  gender: "",
};

export default function PatientProfile() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<PatientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [form, setForm] = useState<CreatePatientInfoPayload>({ ...emptyForm });
  const [accountForm, setAccountForm] = useState({ ...emptyAccountForm });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [updatingAccount, setUpdatingAccount] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PatientInfo | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<PatientInfo | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  const genderOptions = useMemo(
    () => [
      { value: "Male", label: "Nam" },
      { value: "Female", label: "Nữ" },
      { value: "Other", label: "Khác" },
    ],
    []
  );

  const normalizeGenderValue = useCallback((value?: string | null) => {
    const upper = (value || "").toUpperCase();
    if (upper === "MALE") return "Male";
    if (upper === "FEMALE") return "Female";
    if (upper === "OTHER") return "Other";
    return "";
  }, []);

  const getGenderLabel = useCallback(
    (value?: string | null) => {
      const normalized = normalizeGenderValue(value);
      const option = genderOptions.find((opt) => opt.value === normalized);
      if (option) return option.label;
      return value || "—";
    },
    [genderOptions, normalizeGenderValue]
  );

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchMyPatients();
      setRecords(list);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể tải thông tin bệnh nhân.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const data = await fetchMyProfile();
    const normalized: UserProfile = {
      ...data,
      gender: normalizeGenderValue(data.gender),
    };
    setProfile(normalized);
    return normalized;
  }, [normalizeGenderValue]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    refreshProfile().catch((err) => {
      const message = err instanceof Error ? err.message : "Không thể tải thông tin tài khoản.";
      setError(message);
    });
  }, [refreshProfile]);

  const accountData = useMemo(() => {
    if (profile) return profile;
    if (!user) return null;
    const numericId = Number(user.id ?? 0);
    return {
      id: Number.isNaN(numericId) ? 0 : numericId,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      gender: normalizeGenderValue(user.gender),
      userType: user.userType,
    };
  }, [normalizeGenderValue, profile, user]);

  const userDetails = useMemo(
    () => [
      { label: "Họ tên", value: accountData?.fullName || "—" },
      { label: "Email", value: accountData?.email || "—" },
      { label: "Số điện thoại", value: accountData?.phoneNumber || "—" },
      { label: "Giới tính", value: getGenderLabel(accountData?.gender) },
    ],
    [accountData, getGenderLabel]
  );

  const handleChange = (field: keyof CreatePatientInfoPayload) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setSubmitting(false);
    setEditingRecord(null);
  };

  const handleCloseModal = () => {
    if (!submitting) {
      setShowModal(false);
      resetForm();
    }
  };

  const openCreateRecord = () => {
    setSuccessMessage(null);
    setEditingRecord(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEditRecord = (record: PatientInfo) => {
    setSuccessMessage(null);
    setEditingRecord(record);
    setForm({
      fullName: record.fullName || "",
      gender: normalizeGenderValue(record.gender) || "",
      phoneNumber: record.phoneNumber || "",
      dob: record.dob || "",
      relationship: record.relationship || "",
    });
    setShowModal(true);
  };

  const openAccountModal = () => {
    setSuccessMessage(null);
    setAccountForm({
      fullName: accountData?.fullName || "",
      phoneNumber: accountData?.phoneNumber || "",
      gender: normalizeGenderValue(accountData?.gender) || "",
    });
    setShowAccountModal(true);
  };

  const handleAccountChange = (field: keyof typeof emptyAccountForm) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { value } = event.target;
    setAccountForm((prev) => ({ ...prev, [field]: value }));
  };

  const closeAccountModal = () => {
    if (!updatingAccount) {
      setShowAccountModal(false);
      setAccountForm({ ...emptyAccountForm });
    }
  };

  const openChangePasswordModal = () => {
    setSuccessMessage(null);
    setError(null);
    setPasswordForm({
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setShowChangePasswordModal(true);
  };

  const closeChangePasswordModal = () => {
    if (!changingPassword) {
      setShowChangePasswordModal(false);
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  };

  const handlePasswordChange = (field: keyof typeof passwordForm) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const { value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    setError(null);
    setChangingPassword(true);

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Mật khẩu mới không trùng khớp");
      setChangingPassword(false);
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError("Mật khẩu mới phải có ít nhất 6 ký tự");
      setChangingPassword(false);
      return;
    }

    if (!accountData?.email) {
      setError("Không tìm thấy email của bạn");
      setChangingPassword(false);
      return;
    }

    try {
      const payload: ChangePasswordPayload = {
        email: accountData.email,
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      };
      await changePasswordApi(payload);
      setSuccessMessage("Đổi mật khẩu thành công");
      showSuccess("Đổi mật khẩu thành công!");
      setShowChangePasswordModal(false);
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể đổi mật khẩu.";
      setError(message);
      showError(message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    setError(null);

    if (form.dob) {
      const dobDate = new Date(form.dob);
      if (Number.isNaN(dobDate.getTime())) {
        setError("Ngày sinh không hợp lệ.");
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dobDate.setHours(0, 0, 0, 0);
      if (dobDate > today) {
        setError("Ngày sinh không được lớn hơn ngày hiện tại.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: CreatePatientInfoPayload = {
        ...form,
        gender: form.gender || undefined,
      };
      if (editingRecord) {
        await updatePatientInfo(editingRecord.id, payload);
        setSuccessMessage("Cập nhật hồ sơ bệnh nhân thành công");
      } else {
        await createPatientInfo(payload);
        setSuccessMessage("Thêm hồ sơ bệnh nhân thành công");
      }
      setShowModal(false);
      resetForm();
      await loadRecords();
    } catch (err) {
      const fallback = editingRecord ? "Không thể cập nhật hồ sơ bệnh nhân." : "Không thể thêm hồ sơ bệnh nhân.";
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUpdatingAccount(true);
    setSuccessMessage(null);
    try {
      const payload: UpdateUserPayload = { ...accountForm };
      if (!payload.gender) {
        delete payload.gender;
      }
      await updateMyProfile(payload);
      const latest = await refreshProfile();
      if (latest && user) {
        const merged = { ...user, ...latest };
        sessionStorage.setItem("user_meta", JSON.stringify(merged));
      }
      setSuccessMessage("Cập nhật thông tin tài khoản thành công");
      setShowAccountModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể cập nhật tài khoản.";
      setError(message);
    } finally {
      setUpdatingAccount(false);
    }
  };

  const handleDeleteRecordConfirm = async () => {
    if (!recordToDelete) return;
    setDeletingRecord(true);
    setSuccessMessage(null);
    try {
      await deletePatientInfo(recordToDelete.id);
      setSuccessMessage("Đã xóa hồ sơ bệnh nhân");
      setRecordToDelete(null);
      await loadRecords();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể xóa hồ sơ bệnh nhân.";
      setError(message);
    } finally {
      setDeletingRecord(false);
    }
  };

  return (
    <div className="patient-page">
      <header className="patient-header">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h1>Hồ sơ bệnh nhân</h1>
          </div>
        </div>
        {successMessage && (
          <Alert
            variant="success"
            className="mt-3"
            onClose={() => setSuccessMessage(null)}
            dismissible
          >
            {successMessage}
          </Alert>
        )}
        {error && !loading && (
          <Alert variant="danger" className="mt-3" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
      </header>

      <section className="patient-body">
      <div className="patient-card-my">
        <h2 className="patient-card__title">Thông tin tài khoản</h2>
        <div className="patient-info-grid">
            {userDetails.map((item) => (
              <div key={item.label} className="patient-info-field">
                <span className="patient-info-label">{item.label}</span>
                <span className="patient-info-value">{item.value}</span>
              </div>
            ))}
        </div>
        <div className="d-flex align-items-center gap-2 justify-content-end">
          <Button variant="outline-primary" onClick={openChangePasswordModal}>
            Đổi mật khẩu
          </Button>
          <Button variant="outline-secondary" onClick={openAccountModal}>
            Cập nhật tài khoản
          </Button>
        </div>
      </div>

      <div className="patient-card">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <h2 className="patient-card__title mb-0">Hồ sơ bệnh nhân của tôi</h2>
            <Button variant="outline-primary" onClick={openCreateRecord}>
              Thêm hồ sơ mới
            </Button>
          </div>

          {loading ? (
            <div className="patient-loading">
              <Spinner animation="border" size="sm" />
              Đang tải danh sách hồ sơ...
            </div>
          ) : records.length === 0 ? (
          <div className="patient-placeholder">
            <strong>Chưa có hồ sơ bệnh nhân.</strong>
            Thêm mới thông tin để cập nhật lịch sử khám và theo dõi sức khỏe nhanh chóng hơn.
          </div>
        ) : (
          <Row className="g-3">
            {records.map((record) => (
              <Col key={record.id} xs={12} md={6} lg={4}>
                <div
                  className="patient-record patient-record--compact h-100"
                  data-record-id={record.id}
                >
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <h3 className="patient-record__title mb-0">{record.fullName || "Chưa có tên"}</h3>
                      {record.relationship && (
                        <span className="badge bg-light text-dark">{record.relationship}</span>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => openEditRecord(record)}
                      >
                        Cập nhật
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => setRecordToDelete(record)}
                      >
                        Xóa
                      </Button>
                    </div>
                  </div>
                  <div className="patient-info-grid">
                    <div className="patient-info-field">
                      <span className="patient-info-label">Giới tính</span>
                      <span className="patient-info-value">{getGenderLabel(record.gender)}</span>
                    </div>
                    <div className="patient-info-field">
                      <span className="patient-info-label">Ngày sinh</span>
                      <span className="patient-info-value">{record.dob || "—"}</span>
                    </div>
                    <div className="patient-info-field">
                      <span className="patient-info-label">Số điện thoại</span>
                      <span className="patient-info-value">{record.phoneNumber || "—"}</span>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>
      </section>

      <Modal show={showModal} onHide={handleCloseModal} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton={!submitting}>
            <Modal.Title>{editingRecord ? "Cập nhật hồ sơ bệnh nhân" : "Thêm hồ sơ bệnh nhân"}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            <Form.Group controlId="patientFullName">
              <Form.Label>Họ và tên</Form.Label>
              <Form.Control
                required
                value={form.fullName}
                onChange={handleChange("fullName")}
                placeholder="Nguyễn Văn A"
              />
            </Form.Group>
            <Form.Group controlId="patientRelationship">
              <Form.Label>Mối quan hệ</Form.Label>
              <Form.Control
                required
                value={form.relationship}
                onChange={handleChange("relationship")}
                placeholder="Bản thân, Con, Bố, Mẹ..."
              />
            </Form.Group>
            <Form.Group controlId="patientGender">
              <Form.Label>Giới tính</Form.Label>
              <Form.Select
                value={form.gender}
                onChange={handleChange("gender")}
              >
                <option value="">Chọn giới tính</option>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="patientDob">
              <Form.Label>Ngày sinh</Form.Label>
              <Form.Control
                type="date"
                value={form.dob || ""}
                max={todayISO}
                onChange={handleChange("dob")}
              />
            </Form.Group>
            <Form.Group controlId="patientPhone">
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                value={form.phoneNumber}
                onChange={handleChange("phoneNumber")}
                placeholder="09xxxxxxxx"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="outline-secondary"
              onClick={handleCloseModal}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? <Spinner animation="border" size="sm" /> : editingRecord ? "Cập nhật" : "Lưu hồ sơ"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showAccountModal} onHide={closeAccountModal} centered>
        <Form onSubmit={handleAccountSubmit}>
          <Modal.Header closeButton={!updatingAccount}>
            <Modal.Title>Cập nhật thông tin tài khoản</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            <Form.Group controlId="accountFullName">
              <Form.Label>Họ và tên</Form.Label>
              <Form.Control
                required
                value={accountForm.fullName}
                onChange={handleAccountChange("fullName")}
                placeholder="Nguyễn Văn A"
              />
            </Form.Group>
            <Form.Group controlId="accountPhone">
              <Form.Label>Số điện thoại</Form.Label>
              <Form.Control
                value={accountForm.phoneNumber}
                onChange={handleAccountChange("phoneNumber")}
                placeholder="09xxxxxxxx"
              />
            </Form.Group>
            <Form.Group controlId="accountGender">
              <Form.Label>Giới tính</Form.Label>
              <Form.Select value={accountForm.gender} onChange={handleAccountChange("gender")}>
                <option value="">Chọn giới tính</option>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeAccountModal} disabled={updatingAccount}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={updatingAccount}>
              {updatingAccount ? <Spinner animation="border" size="sm" /> : "Lưu thay đổi"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showChangePasswordModal} onHide={closeChangePasswordModal} centered>
        <Form onSubmit={handleChangePasswordSubmit}>
          <Modal.Header closeButton={!changingPassword}>
            <Modal.Title>Đổi mật khẩu</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            <Form.Group controlId="oldPassword">
              <Form.Label>Mật khẩu hiện tại</Form.Label>
              <Form.Control
                type="password"
                required
                value={passwordForm.oldPassword}
                onChange={handlePasswordChange("oldPassword")}
                placeholder="Nhập mật khẩu hiện tại"
              />
            </Form.Group>
            <Form.Group controlId="newPassword">
              <Form.Label>Mật khẩu mới</Form.Label>
              <Form.Control
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={handlePasswordChange("newPassword")}
                placeholder="Nhập mật khẩu mới"
                minLength={6}
              />
              <Form.Text className="text-muted">Mật khẩu phải có ít nhất 6 ký tự</Form.Text>
            </Form.Group>
            <Form.Group controlId="confirmPassword">
              <Form.Label>Xác nhận mật khẩu mới</Form.Label>
              <Form.Control
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange("confirmPassword")}
                placeholder="Nhập lại mật khẩu mới"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeChangePasswordModal} disabled={changingPassword}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={changingPassword}>
              {changingPassword ? <Spinner animation="border" size="sm" /> : "Đổi mật khẩu"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!recordToDelete} onHide={() => (!deletingRecord ? setRecordToDelete(null) : undefined)} centered>
        <Modal.Header closeButton={!deletingRecord}>
          <Modal.Title>Xóa hồ sơ bệnh nhân</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Bạn có chắc chắn muốn xóa hồ sơ
          {recordToDelete?.fullName ? ` "${recordToDelete.fullName}"` : ""}? Hành động này không thể hoàn tác.
        </Modal.Body>
        <Modal.Footer>
            <Button
              variant="outline-secondary"
              onClick={() => setRecordToDelete(null)}
              disabled={deletingRecord}
            >
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteRecordConfirm}
            disabled={deletingRecord}
          >
            {deletingRecord ? <Spinner animation="border" size="sm" /> : "Xóa"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

