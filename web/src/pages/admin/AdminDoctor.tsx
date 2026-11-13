import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Dropdown,
  DropdownButton,
  Form,
  Modal,
  Row,
  Spinner,
  Toast,
  ToastContainer,
} from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  fetchDoctorsAll,
  fetchDoctorsBySpecialty,
  fetchDoctorById,
  createDoctor,
  updateDoctor,
  type Doctor,
  type CreateDoctorPayload,
  type UpdateDoctorPayload,
} from "../../api/doctor";

import { fetchSpecialties, type Specialty } from "../../api/specialty";
import {
  uploadDoctorImage,
  getDoctorImage,
  updateDoctorImageFile,
  getImageFullUrl,
  type Image,
} from "../../api/image";

const LIST_ALL_PATH = "/admin/doctors";
const BY_SPEC_BASE = "/admin/doctors/by-specialty";
const CREATE_PATH = "/admin/create-user"; // href tạo mới
const DETAIL_RE = /^\/admin\/doctors\/(\d+)$/; // /admin/doctors/:id
const UPDATE_RE = /^\/admin\/update-doctor\/(\d+)$/; // /admin/update-doctor/:id

type SortKey = "all" | "by-specialty";

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
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export default function AdminDoctor() {
  const navigate = useNavigate();
  const location = useLocation();

  // Data
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [currentSpecId, setCurrentSpecId] = useState<number | null>(null);

  // UI
  const [sortKey, setSortKey] = useState<SortKey>("all");
  const [loading, setLoading] = useState(true);
  const [loadingSpecs, setLoadingSpecs] = useState(true);
  const [error, setError] = useState("");
  // Removed search state

  // Toast
  const [toast, setToast] = useState<{
    show: boolean;
    msg: string;
    variant?: "success" | "danger";
  }>({
    show: false,
    msg: "",
    variant: "success",
  });

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  // Entities for modals
  const [detailDoctor, setDetailDoctor] = useState<Doctor | null>(null);
  const [updateDoctorEntity, setUpdateDoctorEntity] = useState<Doctor | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    password: "",
    gender: "Other" as "Male" | "Female" | "Other",
    specialtyId: 0,
    degree: "",
    description: "",
    experience: "",
  });
  const [savingCreate, setSavingCreate] = useState(false);
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);

  // Update form
  const [updateForm, setUpdateForm] = useState({
    fullName: "",
    phoneNumber: "",
    gender: "Other" as "Male" | "Female" | "Other",
    specialtyId: 0,
    degree: "",
    description: "",
    experience: "",
  });
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [updateImageFile, setUpdateImageFile] = useState<File | null>(null);
  const [updateImagePreview, setUpdateImagePreview] = useState<string | null>(null);
  const [updateDoctorImageData, setUpdateDoctorImageData] = useState<Image | null>(null);

  /* ===================== LOAD SPECIALTIES ===================== */
  useEffect(() => {
    let alive = true;
    setLoadingSpecs(true);
    fetchSpecialties()
      .then((sp) => {
        if (alive) setSpecialties(sp);
      })
      .catch((err) => {
        if (alive) setError(getErrMsg(err));
      })
      .finally(() => {
        if (alive) setLoadingSpecs(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ===================== LOAD DOCTORS by route ===================== */
  const loadDoctors = async (specId: number | null) => {
    setLoading(true);
    setError("");
    try {
      const data = specId
        ? await fetchDoctorsBySpecialty(specId)
        : await fetchDoctorsAll();
      setDoctors(data ?? []);
    } catch (err) {
      setError(getErrMsg(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // /admin/create-user (create)
    if (location.pathname === CREATE_PATH) {
      setShowCreate(true);
      return;
    }

    // /admin/doctors (all)
    if (location.pathname === LIST_ALL_PATH) {
      setSortKey("all");
      setCurrentSpecId(null);
      loadDoctors(null);
      return;
    }

    if (location.pathname.startsWith(BY_SPEC_BASE)) {
      const parts = location.pathname.split("/");
      const specIdStr = parts[parts.length - 1];
      const specId = Number(specIdStr);
      if (!Number.isNaN(specId) && specId > 0) {
        setSortKey("by-specialty");
        setCurrentSpecId(specId);
        loadDoctors(specId);
      } else {
        setError("Invalid specialty");
      }
      return;
    }

    const mDetail = location.pathname.match(DETAIL_RE);
    if (mDetail) {
      const id = Number(mDetail[1]);
      openDetailById(id);
      return;
    }

    // /admin/update-doctor/:id (update)
    const mUpdate = location.pathname.match(UPDATE_RE);
    if (mUpdate) {
      const id = Number(mUpdate[1]);
      openUpdateById(id);
      return;
    }

    // default load all
    setSortKey("all");
    setCurrentSpecId(null);
    loadDoctors(null);
  }, [location.pathname]);

  /* ===================== HANDLERS ===================== */
  const handleSortAll = () => navigate(LIST_ALL_PATH);

  const handleSortBySpecialty = (id: number) => {
    navigate(`${BY_SPEC_BASE}/${id}`);
  };

  const openCreate = () => {
    setCreateImageFile(null);
    setCreateImagePreview(null);
    navigate(CREATE_PATH, { replace: false });
  };
  const closeCreate = () => {
    setShowCreate(false);
    setCreateImageFile(null);
    setCreateImagePreview(null);
    if (location.pathname === CREATE_PATH) {
      if (currentSpecId)
        navigate(`${BY_SPEC_BASE}/${currentSpecId}`, { replace: true });
      else navigate(LIST_ALL_PATH, { replace: true });
    }
  };

  const openDetailById = async (id: number) => {
    try {
      const doc = await fetchDoctorById(id);
      setDetailDoctor(doc);
      setShowDetail(true);
    } catch (err) {
      setError(getErrMsg(err));
    }
  };
  const closeDetail = () => {
    setShowDetail(false);
    if (DETAIL_RE.test(location.pathname)) {
      if (currentSpecId)
        navigate(`${BY_SPEC_BASE}/${currentSpecId}`, { replace: true });
      else navigate(LIST_ALL_PATH, { replace: true });
    }
  };

  const openUpdateById = async (id: number) => {
    try {
      const doc = await fetchDoctorById(id);
      setUpdateDoctorEntity(doc);
      setUpdateForm({
        fullName: doc.fullName || "",
        phoneNumber: doc.phoneNumber || "",
        gender: doc.gender ?? "Other",
        specialtyId: doc.specialtyId || 0,
        degree: doc.degree || "",
        description: doc.description || "",
        experience: doc.experience || "",
      });
      // Load existing doctor image if available
      setUpdateImageFile(null);
      setUpdateImagePreview(null);
      try {
        const image = await getDoctorImage(id);
        setUpdateDoctorImageData(image);
        if (image?.imageUrl) {
          // Sử dụng getImageFullUrl để đảm bảo URL đúng (có thể cần prefix với base URL)
          const fullUrl = getImageFullUrl(image.imageUrl);
          if (fullUrl) {
            setUpdateImagePreview(fullUrl);
          }
        }
      } catch {
        // Doctor doesn't have an image yet
        setUpdateDoctorImageData(null);
      }
      setShowUpdate(true);
    } catch (err) {
      setError(getErrMsg(err));
    }
  };
  const closeUpdate = () => {
    setShowUpdate(false);
    setUpdateImageFile(null);
    setUpdateImagePreview(null);
    setUpdateDoctorImageData(null);
    if (UPDATE_RE.test(location.pathname)) {
      if (currentSpecId)
        navigate(`${BY_SPEC_BASE}/${currentSpecId}`, { replace: true });
      else navigate(LIST_ALL_PATH, { replace: true });
    }
  };

  /* ===================== CREATE ===================== */
  const onCreateChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setCreateForm((p) => ({
      ...p,
      [name]: name === "specialtyId" ? Number(value) : value,
    }));
  };

  const handleCreateImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setToast({
          show: true,
          msg: "Please select an image file",
          variant: "danger",
        });
        return;
      }
      setCreateImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCreateImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = createForm;
    if (!f.fullName.trim() || !f.email || !f.password || !f.specialtyId) return;

    const sp = specialties.find((s) => s.id === f.specialtyId);
    if (!sp) {
      setToast({
        show: true,
        msg: "Invalid specialty",
        variant: "danger",
      });
      return;
    }

    const payload: CreateDoctorPayload = {
      fullName: f.fullName.trim(),
      email: f.email,
      phoneNumber: f.phoneNumber,
      password: f.password,
      gender: f.gender,
      specialization: sp.name,
      degree: createForm.degree || undefined,
      description: createForm.description || undefined,
      experience: createForm.experience || undefined,
    };

    setSavingCreate(true);
    setError("");
    try {
      const created = await createDoctor(payload);
      setDoctors((prev) => [created, ...prev]);

      // Upload image if provided
      if (createImageFile) {
        try {
          await uploadDoctorImage(created.id, createImageFile);
          setToast({
            show: true,
            msg: "Doctor created successfully with image!",
            variant: "success",
          });
        } catch (imgErr) {
          setToast({
            show: true,
            msg:
              "Doctor created but image upload failed: " + getErrMsg(imgErr),
            variant: "danger",
          });
        }
      } else {
        setToast({
          show: true,
          msg: "Doctor created successfully!",
          variant: "success",
        });
      }

      closeCreate();
    } catch (err) {
      const msg = getErrMsg(err);
      setToast({ show: true, msg, variant: "danger" });
      setError(msg);
    } finally {
      setSavingCreate(false);
    }
  };

  /* ===================== UPDATE ===================== */
  const onUpdateChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setUpdateForm((p) => ({
      ...p,
      [name]: name === "specialtyId" ? Number(value) : value,
    }));
  };

  const handleUpdateImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setToast({
          show: true,
          msg: "Please select an image file",
          variant: "danger",
        });
        return;
      }
      setUpdateImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUpdateImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateDoctorEntity) return;
    setSavingUpdate(true);
    setError("");
    try {
      const currentSpecId = updateDoctorEntity.specialtyId || 0;
      const specChanged =
        typeof updateForm.specialtyId === "number" &&
        updateForm.specialtyId !== currentSpecId;
      const payload: UpdateDoctorPayload = {
        fullName: updateForm.fullName,
        phoneNumber: updateForm.phoneNumber,
        gender: updateForm.gender,
        degree: updateForm.degree,
        description: updateForm.description,
        experience: updateForm.experience,
      };
      if (specChanged) payload.specialtyId = updateForm.specialtyId;

      const updated = await updateDoctor(updateDoctorEntity.id, payload);
      setDoctors((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));

      // Upload / update image if provided
      if (updateImageFile) {
        try {
          if (updateDoctorImageData) {
            // đã có ảnh -> update (PUT)
            await updateDoctorImageFile(updated.id, updateImageFile);
          } else {
            // chưa có ảnh -> create (POST)
            await uploadDoctorImage(updated.id, updateImageFile);
          }

          setToast({
            show: true,
            msg: "Doctor updated successfully with image!",
            variant: "success",
          });
        } catch (imgErr) {
          setToast({
            show: true,
            msg:
              "Doctor updated but image upload failed: " + getErrMsg(imgErr),
            variant: "danger",
          });
        }
      } else {
        setToast({
          show: true,
          msg: "Doctor updated successfully!",
          variant: "success",
        });
      }

      closeUpdate();
    } catch (err) {
      const msg = getErrMsg(err);
      setToast({ show: true, msg, variant: "danger" });
      setError(msg);
    } finally {
      setSavingUpdate(false);
    }
  };

  /* ===================== RENDER ===================== */
  const specName = useMemo(() => {
    if (!currentSpecId) return "All";
    return (
      specialties.find((s) => s.id === currentSpecId)?.name ??
      `Specialty #${currentSpecId}`
    );
  }, [currentSpecId, specialties]);

  return (
    <>
      {/* Toolbar */}
      <Row className="align-items-center mb-3">
        <Col xs="12" md="6" className="d-flex align-items-center gap-2">
          <DropdownButton
            id="sort-doctors"
            title={`Lọc: ${
              sortKey === "all" ? "Tất cả" : `Theo chuyên khoa (${specName})`
            }`}
            variant="light"
          >
            <Dropdown.Item active={sortKey === "all"} onClick={handleSortAll}>
              Tất cả (mặc định)
            </Dropdown.Item>

            <Dropdown.Item />
            <Form.Select
              disabled={loadingSpecs}
              value={currentSpecId ?? 0}
              onChange={(e) => handleSortBySpecialty(Number(e.target.value))}
            >
              <option value={0} disabled>
                Chọn chuyên khoa
              </option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Form.Select>
          </DropdownButton>
        </Col>

        <Col
          xs="12"
          md="6"
          className="d-flex justify-content-md-end mt-2 mt-md-0"
        >
          <Button
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              openCreate();
              navigate("/admin/create-user", {
                state: { from: location.pathname, defaultUserType: "Doctor" },
              });
            }}
          >
            + Thêm bác sĩ
          </Button>
        </Col>
      </Row>

      {/* Error / Loading */}
      {error && (
        <Row className="mb-3">
          <Col>
            <Card body className="border-danger-subtle text-danger">
              {error}
            </Card>
          </Col>
        </Row>
      )}

      {loading ? (
        <div className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" />
          <span>Loading doctors…</span>
        </div>
      ) : (
        <Row className="g-3">
          {doctors.map((d) => (
            <Col key={d.id} xs={12} md={6} lg={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="d-flex flex-column">
                  <div className="d-flex align-items-start justify-content-between mb-2">
                    <Card.Title className="mb-0">
                      {d.fullName}
                      {d.degree ? (
                        <span className="text-muted small">
                          {" "}
                          · {d.degree}
                        </span>
                      ) : null}
                    </Card.Title>
                    <div className="d-flex gap-2">
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate(`/admin/doctors/${d.id}`);
                        }}
                      >
                        Chi tiết
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate(`/admin/update-doctor/${d.id}`);
                        }}
                      >
                        Cập nhật
                      </Button>
                    </div>
                  </div>
                  <div className="text-muted small mb-2">
                    {d.email || "—"} · {d.phoneNumber || "—"}
                  </div>
                  <Card.Text className="text-muted flex-grow-1">
                    Chuyên khoa:{" "}
                    {d.specialtyName ??
                      (d.specialtyId ? `#${d.specialtyId}` : "—")}
                  </Card.Text>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    ID: {d.id}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
          {doctors.length === 0 && (
            <Col xs={12}>
              <Card className="shadow-sm">
                <Card.Body className="text-center text-muted">
                  No doctors found.
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* ============== CREATE MODAL ============== */}
      <Modal show={showCreate} onHide={closeCreate} centered>
        <Form onSubmit={submitCreate}>
          <Modal.Header closeButton>
            <Modal.Title>Create Doctor</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Group controlId="dFullName">
                  <Form.Label>Full name</Form.Label>
                  <Form.Control
                    name="fullName"
                    value={createForm.fullName}
                    onChange={onCreateChange}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="dEmail">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={createForm.email}
                    onChange={onCreateChange}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="dPhone">
                  <Form.Label>Phone number</Form.Label>
                  <Form.Control
                    name="phoneNumber"
                    value={createForm.phoneNumber}
                    onChange={onCreateChange}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="dPassword">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    name="password"
                    value={createForm.password}
                    onChange={onCreateChange}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="dGender">
                  <Form.Label>Gender</Form.Label>
                  <Form.Select
                    name="gender"
                    value={createForm.gender}
                    onChange={onCreateChange}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="dSpec">
                  <Form.Label>Specialty</Form.Label>
                  <Form.Select
                    name="specialtyId"
                    value={createForm.specialtyId || 0}
                    onChange={onCreateChange}
                    required
                    isInvalid={
                      !!createForm.specialtyId &&
                      !specialties.find((s) => s.id === createForm.specialtyId)
                    }
                  >
                    <option value={0} disabled>
                      Select specialty
                    </option>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">
                    Invalid specialty
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="cDegree">
                  <Form.Label>Degree</Form.Label>
                  <Form.Control
                    name="degree"
                    value={createForm.degree}
                    onChange={onCreateChange}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="cExperience">
                  <Form.Label>Experience</Form.Label>
                  <Form.Control
                    name="experience"
                    value={createForm.experience}
                    onChange={onCreateChange}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="cDescription">
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    name="description"
                    value={createForm.description}
                    onChange={onCreateChange}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group controlId="cImage">
                  <Form.Label>Doctor Image</Form.Label>
                  <Form.Control
                    type="file"
                    accept="image/*"
                    onChange={handleCreateImageChange}
                  />
                  {createImagePreview && (
                    <div className="mt-2">
                      <img
                        src={createImagePreview}
                        alt="Preview"
                        style={{
                          maxWidth: "200px",
                          maxHeight: "200px",
                          objectFit: "cover",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  )}
                  <Form.Text className="text-muted">
                    Upload an image for this doctor (optional)
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer className="justify-content-between">
            <div className="text-muted small ms-1">
              Create a new doctor account
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                onClick={closeCreate}
                disabled={savingCreate}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  savingCreate ||
                  !createForm.fullName ||
                  !createForm.email ||
                  !createForm.password ||
                  !createForm.specialtyId
                }
              >
                {savingCreate ? "Saving..." : "Create"}
              </Button>
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ============== DETAIL MODAL ============== */}
      <Modal show={showDetail} onHide={closeDetail} centered>
        <Modal.Header closeButton>
          <Modal.Title>Doctor Detail</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailDoctor ? (
            <div className="vstack gap-2">
              <div>
                <strong>ID:</strong> {detailDoctor.id}
              </div>
              <div>
                <strong>Full name:</strong> {detailDoctor.fullName}
              </div>
              <div>
                <strong>Email:</strong> {detailDoctor.email ?? "—"}
              </div>
              <div>
                <strong>Phone:</strong> {detailDoctor.phoneNumber ?? "—"}
              </div>
              <div>
                <strong>Gender:</strong> {detailDoctor.gender ?? "—"}
              </div>
              <div>
                <strong>Degree:</strong> {detailDoctor.degree ?? "—"}
              </div>
              <div>
                <strong>Experience:</strong> {detailDoctor.experience ?? "—"}
              </div>
              <div>
                <strong>Description:</strong>{" "}
                {detailDoctor.description ?? "—"}
              </div>
              <div>
                <strong>Specialty:</strong>{" "}
                {detailDoctor.specialtyName ??
                  (detailDoctor.specialtyId
                    ? `#${detailDoctor.specialtyId}`
                    : "—")}
              </div>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" /> <span>Loading…</span>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDetail}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============== UPDATE MODAL ============== */}
      <Modal show={showUpdate} onHide={closeUpdate} centered>
        <Form onSubmit={submitUpdate}>
          <Modal.Header closeButton>
            <Modal.Title>Update Doctor</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {updateDoctorEntity ? (
              <Row className="g-3">
                <Col md={12}>
                  <Form.Group controlId="uFullName">
                    <Form.Label>Full name</Form.Label>
                    <Form.Control
                      name="fullName"
                      value={updateForm.fullName}
                      onChange={onUpdateChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uPhone">
                    <Form.Label>Phone number</Form.Label>
                    <Form.Control
                      name="phoneNumber"
                      value={updateForm.phoneNumber}
                      onChange={onUpdateChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uGender">
                    <Form.Label>Gender</Form.Label>
                    <Form.Select
                      name="gender"
                      value={updateForm.gender}
                      onChange={onUpdateChange}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="uSpec">
                    <Form.Label>Specialty</Form.Label>
                    <Form.Select
                      name="specialtyId"
                      value={
                        updateForm.specialtyId ||
                        updateDoctorEntity?.specialtyId ||
                        0
                      }
                      onChange={onUpdateChange}
                      required
                      isInvalid={
                        !!updateForm.specialtyId &&
                        !specialties.find(
                          (s) => s.id === updateForm.specialtyId
                        )
                      }
                    >
                      <option value={0} disabled>
                        Select specialty
                      </option>
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Control.Feedback type="invalid">
                      Invalid specialty
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uDegree">
                    <Form.Label>Degree</Form.Label>
                    <Form.Control
                      name="degree"
                      value={updateForm.degree}
                      onChange={onUpdateChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="uExperience">
                    <Form.Label>Experience</Form.Label>
                    <Form.Control
                      name="experience"
                      value={updateForm.experience}
                      onChange={onUpdateChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="uDescription">
                    <Form.Label>Description</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      name="description"
                      value={updateForm.description}
                      onChange={onUpdateChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="uImage">
                    <Form.Label>Doctor Image</Form.Label>
                    {updateImagePreview && (
                      <div className="mb-2">
                        <img
                          src={updateImagePreview}
                          alt="Current/Preview"
                          style={{
                            maxWidth: "200px",
                            maxHeight: "200px",
                            objectFit: "cover",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    )}
                    <Form.Control
                      type="file"
                      accept="image/*"
                      onChange={handleUpdateImageChange}
                    />
                    <Form.Text className="text-muted">
                      {updateDoctorImageData
                        ? "Update doctor image (optional)"
                        : "Upload an image for this doctor (optional)"}
                    </Form.Text>
                  </Form.Group>
                </Col>
              </Row>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" /> <span>Loading…</span>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-content-between">
            <div className="text-muted small ms-1">
              {updateDoctorEntity ? `Updating ID: ${updateDoctorEntity.id}` : ""}
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                onClick={closeUpdate}
                disabled={savingUpdate}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  savingUpdate ||
                  !updateForm.fullName ||
                  (!updateForm.specialtyId &&
                    !updateDoctorEntity?.specialtyId)
                }
              >
                {savingUpdate ? "Saving..." : "Update"}
              </Button>
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Toast */}
      <ToastContainer position="top-center">
        <Toast
          bg={toast.variant === "danger" ? "danger" : "success"}
          onClose={() => setToast((t) => ({ ...t, show: false }))}
          show={toast.show}
          delay={2500}
          autohide
        >
          <Toast.Body className="text-white">{toast.msg}</Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}
