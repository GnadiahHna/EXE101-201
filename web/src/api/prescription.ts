// src/api/prescription.ts
import { http } from "./http";

/** ===== Types ===== */
export type Prescription = {
  id: number | string;
  medicineName?: string | null;
  dosage?: string | null;
  duration?: string | null;
  instructions?: string | null;
  createdAt?: string;
  appointmentId?: number | string;
};

export type CreatePrescriptionPayload = {
  medicineName?: string | null;
  dosage?: string | null;
  duration?: string | null;
  instructions?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  dose?: string | null;
  frequency?: string | null;
  durationDays?: number | null;
  route?: string | null;
  activeIngredient?: string | null;
  overrideAllergyConfirmation?: boolean;
};

export type ActionResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  isAllergyWarning?: boolean;
  allergyDetails?: string[];
};

/** ===== Utilities ===== */
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const normalizePrescription = (raw: unknown): Prescription => {
  const record = isRecord(raw) ? raw : {};
  const appointment = isRecord(record.appointment) ? record.appointment : undefined;
  const rawId = record.id;
  const rawAppointmentId = record.appointmentId ?? appointment?.id;
  return {
    id: typeof rawId === "number" || typeof rawId === "string" ? rawId : 0,
    medicineName: typeof record.medicineName === "string" ? record.medicineName : null,
    dosage: typeof record.dosage === "string" ? record.dosage : null,
    duration: typeof record.duration === "string" ? record.duration : null,
    instructions: typeof record.instructions === "string" ? record.instructions : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    appointmentId:
      typeof rawAppointmentId === "number" || typeof rawAppointmentId === "string"
        ? rawAppointmentId
        : undefined,
  };
};

const extractArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.data)) return data.data;
  return [];
};

const extractObject = (data: unknown): unknown =>
  isRecord(data) && "data" in data ? (data.data as unknown) : data;

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** 🔵 DOCTOR — Tạo prescription cho appointment */
export async function createPrescription(
  appointmentId: number,
  payload?: CreatePrescriptionPayload
): Promise<ActionResponse<Prescription>> {
  try {
    const body: CreatePrescriptionPayload =
      payload ?? {
        medicineName: null,
        dosage: null,
        duration: null,
        instructions: null,
      };
    const res = await http.post(`/prescriptions/create/${appointmentId}`, body);
    const prescription = normalizePrescription(extractObject(res.data));
    return { ok: true, data: prescription };
  } catch (error: unknown) {
    return { ok: false, error: toErrorMessage(error, "Failed to create prescription") };
  }
}

/** Lấy danh sách prescriptions theo appointment ID */
export async function getPrescriptionsByAppointment(
  appointmentId: number
): Promise<ActionResponse<Prescription[]>> {
  try {
    const res = await http.get(`/prescriptions/by-appointment/${appointmentId}`);
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizePrescription) };
  } catch (error: unknown) {
    return { ok: false, error: toErrorMessage(error, "Failed to fetch prescriptions") };
  }
}

/** 🔵 DOCTOR — Tạo nhiều prescriptions cho appointment cùng lúc */
export async function createPrescriptions(
  appointmentId: number,
  prescriptions: CreatePrescriptionPayload[],
  overrideAllergyConfirmation = false
): Promise<ActionResponse<Prescription[]>> {
  try {
    const res = await http.post(`/prescriptions/batch-create/${appointmentId}`, {
      prescriptions,
      overrideAllergyConfirmation,
    });
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizePrescription) };
  } catch (error: any) {
    const data = error.response?.data;
    if (data?.code === 'ALLERGY_WARNING') {
      return {
        ok: false,
        error: data.message || 'Cảnh báo dị ứng thuốc với tiền sử bệnh nhân!',
        isAllergyWarning: true,
        allergyDetails: data.conflicts || [],
      };
    }
    return { ok: false, error: toErrorMessage(error, "Failed to create prescriptions") };
  }
}

/** 🔵 DOCTOR — Cập nhật prescriptions cho appointment (chỉ khi chưa completed) */
export async function updatePrescriptions(
  appointmentId: number,
  prescriptions: CreatePrescriptionPayload[],
  overrideAllergyConfirmation = false
): Promise<ActionResponse<Prescription[]>> {
  try {
    const res = await http.put(`/prescriptions/update/${appointmentId}`, {
      prescriptions,
      overrideAllergyConfirmation,
    });
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizePrescription) };
  } catch (error: any) {
    const data = error.response?.data;
    if (data?.code === 'ALLERGY_WARNING') {
      return {
        ok: false,
        error: data.message || 'Cảnh báo dị ứng thuốc với tiền sử bệnh nhân!',
        isAllergyWarning: true,
        allergyDetails: data.conflicts || [],
      };
    }
    return { ok: false, error: toErrorMessage(error, "Failed to update prescriptions") };
  }
}
