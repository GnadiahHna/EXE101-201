// src/pages/doctor/AddPrescription.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Form,
  Modal,
  Stack,
  Table,
} from "react-bootstrap";
import { fetchDetail } from "../../api/appointment";
import { createPrescriptions, updatePrescriptions, getPrescriptionsByAppointment, type Prescription } from "../../api/prescription";
import type { Appointment } from "../../api/appointment";
import AppointmentStatus from "../../components/appointment/AppointmentStatus";
import { normStatus } from "../../components/appointment/AppointmentStatus";

/* ============================== Types ============================== */
type PrescriptionRow = {
  id: string; // temporary ID for React key
  medicineName: string;
  dosageAmount: string;
  dosageUnit: string;
  durationAmount: string;
  durationUnit: string;
  instructions: string;
  customInstructions: string; // For "Other" option
};

type RowErrors = {
  medicineName?: string;
  dosageAmount?: string;
  durationAmount?: string;
  customInstructions?: string;
};

/* ============================== Constants ============================== */
const DOSAGE_UNITS = ["mg", "ml", "tablet", "capsule", "viên", "g", "IU"];
const DURATION_UNITS = ["day", "week", "month"];
const DURATION_UNITS_LABELS: Record<string, string> = {
  day: "ngày",
  week: "tuần",
  month: "tháng",
};

const INSTRUCTIONS_OPTIONS = [
  { value: "", label: "-- Select instruction --" },
  { value: "Take before breakfast", label: "Take before breakfast" },
  { value: "Take after breakfast", label: "Take after breakfast" },
  { value: "Take before lunch", label: "Take before lunch" },
  { value: "Take after lunch", label: "Take after lunch" },
  { value: "Take before dinner", label: "Take before dinner" },
  { value: "Take after dinner", label: "Take after dinner" },
  { value: "Take with meals", label: "Take with meals" },
  { value: "Take on empty stomach", label: "Take on empty stomach" },
  { value: "Take with plenty of water", label: "Take with plenty of water" },
  { value: "Take at bedtime", label: "Take at bedtime" },
  { value: "OTHER", label: "Other (specify)" },
];

/* ============================== Component ============================== */
export default function AddPrescription() {
  const { id } = useParams<{ id: string }>();
  const appointmentId = id ? Number(id) : null;
  const navigate = useNavigate();
  
  // Check if edit mode from query params
  const searchParams = new URLSearchParams(window.location.search);
  const isEditMode = searchParams.get("edit") === "true";

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [rows, setRows] = useState<PrescriptionRow[]>([
    {
      id: `row-${Date.now()}`,
      medicineName: "",
      dosageAmount: "",
      dosageUnit: "mg",
      durationAmount: "",
      durationUnit: "day",
      instructions: "",
      customInstructions: "",
    },
  ]);
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [allergyWarning, setAllergyWarning] = useState<{ isWarning: boolean; message: string; details: string[] } | null>(null);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState<boolean>(false);

  /* ---- Parse dosage from string (e.g., "500 mg" -> {amount: "500", unit: "mg"}) ---- */
  const parseDosage = (dosage: string | null | undefined): { amount: string; unit: string } => {
    if (!dosage) return { amount: "", unit: "mg" };
    const trimmed = dosage.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const amount = parts[0];
      const unit = parts.slice(1).join(" ");
      return { amount, unit };
    }
    return { amount: trimmed, unit: "mg" };
  };

  /* ---- Parse duration from string (e.g., "7 ngày" -> {amount: "7", unit: "day"}) ---- */
  const parseDuration = (duration: string | null | undefined): { amount: string; unit: string } => {
    if (!duration) return { amount: "", unit: "day" };
    const trimmed = duration.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const amount = parts[0];
      const unitStr = parts.slice(1).join(" ").toLowerCase();
      // Map Vietnamese to English
      if (unitStr.includes("ngày") || unitStr.includes("day")) return { amount, unit: "day" };
      if (unitStr.includes("tuần") || unitStr.includes("week")) return { amount, unit: "week" };
      if (unitStr.includes("tháng") || unitStr.includes("month")) return { amount, unit: "month" };
      return { amount, unit: "day" };
    }
    return { amount: trimmed, unit: "day" };
  };

  /* ---- Load appointment details and existing prescriptions (if edit mode) ---- */
  useEffect(() => {
    if (!appointmentId) {
      setError("Invalid appointment ID");
      return;
    }

    (async () => {
      try {
        const res = await fetchDetail(appointmentId);
        if (res.ok && res.data) {
          setAppointment(res.data);
          
          // If edit mode, load existing prescriptions
          if (isEditMode) {
            setLoadingPrescriptions(true);
            const presRes = await getPrescriptionsByAppointment(appointmentId);
            if (presRes.ok && presRes.data && presRes.data.length > 0) {
              const prescriptionRows: PrescriptionRow[] = presRes.data.map((prescription: Prescription) => {
                const dosage = parseDosage(prescription.dosage);
                const duration = parseDuration(prescription.duration);
                const instructions = prescription.instructions || "";
                const isOther = instructions && !INSTRUCTIONS_OPTIONS.some(opt => opt.value === instructions);
                
                return {
                  id: `row-${prescription.id || Date.now()}-${Math.random()}`,
                  medicineName: prescription.medicineName || "",
                  dosageAmount: dosage.amount,
                  dosageUnit: DOSAGE_UNITS.includes(dosage.unit) ? dosage.unit : "mg",
                  durationAmount: duration.amount,
                  durationUnit: duration.unit,
                  instructions: isOther ? "OTHER" : instructions,
                  customInstructions: isOther ? instructions : "",
                };
              });
              setRows(prescriptionRows);
            }
            setLoadingPrescriptions(false);
          }
        } else {
          setError(res.error || "Failed to load appointment");
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load appointment";
        setError(message);
      }
    })();
  }, [appointmentId, isEditMode]);

  /* ---- Add new row ---- */
  const addRow = () => {
    setRows([
      ...rows,
      {
        id: `row-${Date.now()}-${Math.random()}`,
        medicineName: "",
        dosageAmount: "",
        dosageUnit: "mg",
        durationAmount: "",
        durationUnit: "day",
        instructions: "",
        customInstructions: "",
      },
    ]);
  };

  /* ---- Remove row ---- */
  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      setError("At least one medicine is required");
      return;
    }
    setRows(rows.filter((r) => r.id !== rowId));
    const newErrors = { ...errors };
    delete newErrors[rowId];
    setErrors(newErrors);
  };

  /* ---- Update row field ---- */
  const updateRow = (rowId: string, field: keyof PrescriptionRow, value: string) => {
    setRows((prevRows) =>
      prevRows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
    // Clear error when user starts typing
    setErrors((prevErrors) => {
      if (prevErrors[rowId]?.[field as keyof RowErrors]) {
        const newErrors = { ...prevErrors };
        if (newErrors[rowId]) {
          delete newErrors[rowId][field as keyof RowErrors];
          if (Object.keys(newErrors[rowId]).length === 0) {
            delete newErrors[rowId];
          }
        }
        return newErrors;
      }
      return prevErrors;
    });
  };

  /* ---- Handle instructions change ---- */
  const handleInstructionsChange = (rowId: string, newValue: string) => {
    setRows((prevRows) =>
      prevRows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              instructions: newValue,
              customInstructions: newValue !== "OTHER" ? "" : r.customInstructions,
            }
          : r
      )
    );
    // Clear error when user changes selection
    setErrors((prevErrors) => {
      if (prevErrors[rowId]?.customInstructions && newValue !== "OTHER") {
        const newErrors = { ...prevErrors };
        if (newErrors[rowId]) {
          delete newErrors[rowId].customInstructions;
          if (Object.keys(newErrors[rowId]).length === 0) {
            delete newErrors[rowId];
          }
        }
        return newErrors;
      }
      return prevErrors;
    });
  };

  /* ---- Validate form ---- */
  const validate = (): boolean => {
    const newErrors: Record<string, RowErrors> = {};
    let isValid = true;

    rows.forEach((row) => {
      const rowErrors: RowErrors = {};
      
      if (!row.medicineName?.trim()) {
        rowErrors.medicineName = "Medicine name is required";
        isValid = false;
      }

      // Dosage: số lượng là bắt buộc và phải > 0
      if (!row.dosageAmount?.trim()) {
        rowErrors.dosageAmount = "Dosage amount is required";
        isValid = false;
      } else {
        const amount = Number(row.dosageAmount);
        if (isNaN(amount) || amount <= 0) {
          rowErrors.dosageAmount = "Dosage amount must be greater than 0";
          isValid = false;
        }
      }

      // Duration: số lượng là bắt buộc và phải > 0
      if (!row.durationAmount?.trim()) {
        rowErrors.durationAmount = "Duration amount is required";
        isValid = false;
      } else {
        const amount = Number(row.durationAmount);
        if (isNaN(amount) || amount <= 0) {
          rowErrors.durationAmount = "Duration amount must be greater than 0";
          isValid = false;
        }
      }

      // Nếu chọn "OTHER" cho instructions, customInstructions phải có giá trị
      if (row.instructions === "OTHER" && !row.customInstructions?.trim()) {
        rowErrors.customInstructions = "Please specify custom instructions";
        isValid = false;
      }

      if (Object.keys(rowErrors).length > 0) {
        newErrors[row.id] = rowErrors;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  /* ---- Submit form ---- */
  const handleSubmit = async (overrideConfirmation = false) => {
    if (!appointmentId || !validate()) {
      return;
    }

    setLoading(true);
    setError("");
    setAllergyWarning(null);

    try {
      const prescriptions = rows.map((row) => {
        // Dosage và duration đã được validate là required và > 0
        const dosage = `${row.dosageAmount} ${row.dosageUnit}`;
        const duration = `${row.durationAmount} ${DURATION_UNITS_LABELS[row.durationUnit] || row.durationUnit}`;
        
        // Nếu chọn "OTHER", dùng customInstructions, ngược lại dùng instructions từ dropdown
        const instructions = row.instructions === "OTHER" 
          ? (row.customInstructions.trim() || null)
          : (row.instructions.trim() || null);

        return {
          medicineName: row.medicineName.trim(),
          dosage,
          duration,
          instructions,
        };
      });

      // Use update or create based on edit mode
      const res = isEditMode
        ? await updatePrescriptions(appointmentId, prescriptions, overrideConfirmation)
        : await createPrescriptions(appointmentId, prescriptions, overrideConfirmation);
      
      if (res.ok) {
        navigate(-1); // Go back to previous page
      } else if (res.isAllergyWarning) {
        setAllergyWarning({
          isWarning: true,
          message: res.error || "Cảnh báo dị ứng thuốc!",
          details: res.allergyDetails || [],
        });
      } else {
        setError(res.error || `Failed to ${isEditMode ? "update" : "create"} prescriptions`);
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to create prescriptions";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /* ---- Handle cancel ---- */
  const handleCancel = () => {
    navigate(-1);
  };

  /* ============================== Render ============================== */
  return (
    <Modal show={true} onHide={handleCancel} centered size="xl" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? "Edit Prescription(s)" : "Add Prescription(s)"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Appointment Info */}
        {appointment && (
          <div className="mb-4 p-3 bg-light rounded">
            <div className="row">
              <div className="col-md-6">
                <div><strong>Patient:</strong> {appointment.patientName || "N/A"}</div>
                <div><strong>Date:</strong> {appointment.appointmentDate} {appointment.appointmentTime}</div>
              </div>
              <div className="col-md-6">
                <div><strong>Status:</strong> <AppointmentStatus status={normStatus(appointment.status)} withBadge={false} /></div>
                {appointment.doctorName && <div><strong>Doctor:</strong> {appointment.doctorName}</div>}
              </div>
            </div>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {allergyWarning && (
          <div className="alert alert-warning border border-warning p-3 mb-3">
            <h5 className="alert-heading text-danger fw-bold">⚠️ CẢNH BÁO NGUY CƠ DỊ ỨNG THUỐC</h5>
            <p className="mb-2">{allergyWarning.message}</p>
            {allergyWarning.details.length > 0 && (
              <ul className="mb-3">
                {allergyWarning.details.map((item, idx) => (
                  <li key={idx} className="fw-semibold text-danger">{item}</li>
                ))}
              </ul>
            )}
            <p className="text-muted small mb-3">
              Thuốc kê đơn trùng hoặc phản ứng chéo với nhóm dị ứng đã ghi nhận của bệnh nhân. Bác sĩ chỉ tiếp tục nếu đã đánh giá nguy cơ lâm sàng.
            </p>
            <div className="d-flex gap-2">
              <Button variant="danger" onClick={() => handleSubmit(true)} disabled={loading}>
                Xác nhận ghi đè (Override) & Lưu đơn thuốc
              </Button>
              <Button variant="secondary" onClick={() => setAllergyWarning(null)}>
                Xem lại danh sách thuốc
              </Button>
            </div>
          </div>
        )}

        {/* Prescription Form */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6>Medicines</h6>
            <Button variant="outline-primary" size="sm" onClick={addRow}>
              + Add Medicine
            </Button>
          </div>

          <div className="table-responsive">
            <Table bordered hover>
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>Medicine Name *</th>
                  <th style={{ width: "20%" }}>Dosage *</th>
                  <th style={{ width: "20%" }}>Duration *</th>
                  <th style={{ width: "30%" }}>Instructions</th>
                  <th style={{ width: "5%" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {/* Medicine Name */}
                    <td>
                      <Form.Control
                        type="text"
                        placeholder="Enter medicine name"
                        value={row.medicineName}
                        onChange={(e) => updateRow(row.id, "medicineName", e.target.value)}
                        isInvalid={!!errors[row.id]?.medicineName}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors[row.id]?.medicineName}
                      </Form.Control.Feedback>
                    </td>

                    {/* Dosage */}
                    <td>
                      <div className="d-flex gap-1">
                        <Form.Control
                          type="number"
                          placeholder="Amount"
                          min="0.01"
                          step="0.01"
                          value={row.dosageAmount}
                          onChange={(e) => updateRow(row.id, "dosageAmount", e.target.value)}
                          isInvalid={!!errors[row.id]?.dosageAmount}
                          style={{ width: "60%" }}
                        />
                        <Form.Select
                          value={row.dosageUnit}
                          onChange={(e) => updateRow(row.id, "dosageUnit", e.target.value)}
                          style={{ width: "40%" }}
                        >
                          {DOSAGE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      <Form.Control.Feedback type="invalid">
                        {errors[row.id]?.dosageAmount}
                      </Form.Control.Feedback>
                    </td>

                    {/* Duration */}
                    <td>
                      <div className="d-flex gap-1">
                        <Form.Control
                          type="number"
                          placeholder="Amount"
                          min="1"
                          step="1"
                          value={row.durationAmount}
                          onChange={(e) => updateRow(row.id, "durationAmount", e.target.value)}
                          isInvalid={!!errors[row.id]?.durationAmount}
                          style={{ width: "60%" }}
                        />
                        <Form.Select
                          value={row.durationUnit}
                          onChange={(e) => updateRow(row.id, "durationUnit", e.target.value)}
                          style={{ width: "40%" }}
                        >
                          {DURATION_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {DURATION_UNITS_LABELS[unit]}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      <Form.Control.Feedback type="invalid">
                        {errors[row.id]?.durationAmount}
                      </Form.Control.Feedback>
                    </td>

                    {/* Instructions */}
                    <td>
                      <Form.Select
                        value={row.instructions || ""}
                        onChange={(e) => handleInstructionsChange(row.id, e.target.value)}
                      >
                        {INSTRUCTIONS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Form.Select>
                      {row.instructions === "OTHER" && (
                        <>
                          <Form.Control
                            type="text"
                            className="mt-2"
                            placeholder="Enter custom instructions"
                            value={row.customInstructions}
                            onChange={(e) => {
                              updateRow(row.id, "customInstructions", e.target.value);
                              // Clear error when user starts typing
                              if (errors[row.id]?.customInstructions) {
                                const newErrors = { ...errors };
                                if (newErrors[row.id]) {
                                  delete newErrors[row.id].customInstructions;
                                  if (Object.keys(newErrors[row.id]).length === 0) {
                                    delete newErrors[row.id];
                                  }
                                }
                                setErrors(newErrors);
                              }
                            }}
                            isInvalid={!!errors[row.id]?.customInstructions}
                          />
                          <Form.Control.Feedback type="invalid">
                            {errors[row.id]?.customInstructions}
                          </Form.Control.Feedback>
                        </>
                      )}
                    </td>

                    {/* Remove button */}
                    <td>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Stack direction="horizontal" gap={2} className="ms-auto">
          <Button variant="outline-secondary" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit(false)} disabled={loading || loadingPrescriptions}>
            {loading ? "Saving..." : isEditMode ? "Update Prescriptions" : "Save Prescriptions"}
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
