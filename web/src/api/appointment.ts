// src/services/appointment.ts
import { http } from "../api/http";
import type { UiStatus } from "../components/appointment/AppointmentStatus";
import { normStatus, toBackendStatus } from "../components/appointment/AppointmentStatus";
import { normalizePatientInfo, type PatientInfo } from "./patient";


type UnknownRecord = Record<string, unknown>;

/** ===== Types ===== */
export type Appointment = {
  id: number;
  appointmentDate?: string; // yyyy-mm-dd
  appointmentTime?: string; // HH:mm
  appointmentNo?: string;
  createdAt?: string;
  status: UiStatus;
  patientName?: string;
  doctorName?: string;
  doctorId?: number; // For filtering shifts by doctor during reschedule
  specialtyName?: string;
  reason?: string;
  patients?: PatientInfo[];
  type?: "ONLINE" | "OFFLINE";
  voucherId?: number;
  voucherCode?: string;
  discountAmount?: number;
  originalAmount?: number;
  finalAmount?: number;
};

export type AppointmentQuery = {
  status: UiStatus;
  date?: string; // default: today (yyyy-mm-dd)
  specialty?: string; // optional filter client-side
  search?: string; // by patient/doctor, client-side
};

export type ActionResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

/** ===== Helpers ===== */
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const pickNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
};

const trimTime = (value: string | undefined): string | undefined =>
  value ? value.slice(0, 5) : undefined;

const extractArray = (input: unknown): unknown[] => {
  if (Array.isArray(input)) return input;
  if (isRecord(input) && Array.isArray(input.data)) {
    return input.data as unknown[];
  }
  if (isRecord(input) && Array.isArray(input.items)) {
    return input.items as unknown[];
  }
  return [];
};

const extractData = (input: unknown): unknown =>
  isRecord(input) && "data" in input ? (input.data as unknown) : input;

/** ===== Utilities ===== */
export const toISODateInput = (d = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const normalizeAppointment = (raw: unknown): Appointment => {
  const record = isRecord(raw) ? raw : {};

  const patientRecord = isRecord(record.patient) ? record.patient : undefined;
  const doctorRecord = isRecord(record.doctor) ? record.doctor : undefined;
  const shiftRecord = isRecord(record.shift) ? record.shift : undefined;
  const shiftDoctorRecord =
    isRecord(shiftRecord?.doctor) ? (shiftRecord?.doctor as UnknownRecord) : undefined;
  const specialtyRecord = isRecord(record.specialty) ? record.specialty : undefined;

  const appointmentDate =
    pickString(record.appointmentDate) ?? pickString(record.date);

  const appointmentTime = trimTime(
    pickString(record.appointmentTime) ?? pickString(record.time) ?? ""
  );

  const patientName =
    pickString(record.patientName) ??
    (patientRecord && pickString(patientRecord.fullName)) ??
    (patientRecord && pickString(patientRecord.name)) ??
    (typeof record.patient === "string" ? record.patient : undefined);

  const doctorName =
    pickString(record.doctorName) ??
    (doctorRecord && pickString(doctorRecord.fullName)) ??
    (doctorRecord && pickString(doctorRecord.name)) ??
    (typeof record.doctor === "string" ? record.doctor : undefined);

  const doctorId =
    pickNumber(record.doctorId) ??
    (doctorRecord && pickNumber(doctorRecord.id)) ??
    (shiftRecord && pickNumber(shiftRecord.doctorId)) ??
    (shiftDoctorRecord && pickNumber(shiftDoctorRecord.id));

  const specialtyName =
    pickString(record.specialtyName) ??
    (specialtyRecord && pickString(specialtyRecord.name));

  const statusSource =
    pickString(record.status) ?? String(record.status ?? "");

  const patients =
    Array.isArray(record.patients) && record.patients.length > 0
      ? record.patients.map((item) => normalizePatientInfo(item))
      : undefined;

  const typeRaw = pickString(record.type) ?? pickString(record.appointmentType);
  const type = typeRaw === "ONLINE" || typeRaw === "OFFLINE" ? typeRaw : undefined;

  return {
    id: Number(record.id ?? 0),
    appointmentDate,
    appointmentTime,
    appointmentNo: pickString(record.appointmentNo),
    createdAt: pickString(record.createdAt),
    status: normStatus(statusSource),
    patientName,
    doctorName,
    doctorId,
    specialtyName,
    reason: pickString(record.reason),
    patients,
    type,
    voucherId: pickNumber(record.voucherId),
    voucherCode: pickString(record.voucherCode),
    discountAmount: pickNumber(record.discountAmount),
    originalAmount: pickNumber(record.originalAmount),
    finalAmount: pickNumber(record.finalAmount),
  };
};

/** Client-side paging helper (cho list đã tải) */
export const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

/** ===== API calls ===== */
export async function fetchByStatusAndDate(
  status: UiStatus,
  date: string = toISODateInput()
): Promise<ActionResponse<Appointment[]>> {
  try {
    const backendStatus = toBackendStatus(status);
    const res = await http.get(
      `/appointments/status/${encodeURIComponent(backendStatus)}?date=${encodeURIComponent(date)}`
    );
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizeAppointment) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch appointments";
    return { ok: false, error: message };
  }
}

export async function fetchAllByDate(
  date: string = toISODateInput()
): Promise<ActionResponse<Appointment[]>> {
  try {
    const res = await http.get(`/appointments/by-date?date=${encodeURIComponent(date)}`);
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizeAppointment) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch all appointments";
    return { ok: false, error: message };
  }
}

export async function fetchDetail(id: number): Promise<ActionResponse<Appointment>> {
  try {
    const res = await http.get(`/appointments/${id}`);
    const payload = extractData(res.data);
    const normalized = normalizeAppointment(payload);
    
    return { ok: true, data: normalized };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch detail";
    return { ok: false, error: message };
  }
}

export async function fetchMyUpcomingAppointments(): Promise<ActionResponse<Appointment[]>> {
  try {
    const res = await http.get("/appointments/my-upcoming");
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizeAppointment) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch upcoming appointments";
    return { ok: false, error: message };
  }
}

export async function fetchMyHistoryAppointments(): Promise<ActionResponse<Appointment[]>> {
  try {
    const res = await http.get("/appointments/my-completed");
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizeAppointment) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch appointment history";
    return { ok: false, error: message };
  }
}

export async function confirmAppointment(id: number): Promise<ActionResponse> {
  try {
    await http.put(`/appointments/confirm/${id}`);
    return { ok: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to confirm appointment";
    return { ok: false, error: message };
  }
}

export async function checkinAppointment(id: number): Promise<ActionResponse> {
  try {
    await http.put(`/appointments/checkin/${id}`);
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check-in";
    return { ok: false, error: message };
  }
}

export async function cancelAppointment(id: number): Promise<ActionResponse> {
  try {
    await http.put(`/appointments/cancel/${id}`);
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel";
    return { ok: false, error: message };
  }
}

export type BookAppointmentPatientPayload = {
  id?: number | null;
  fullName?: string;
  gender?: string;
  phoneNumber?: string;
  dob?: string;
  relationship?: string;
};

export type BookAppointmentPayload = {
  appointment?: {
    reason?: string;
    type?: "ONLINE" | "OFFLINE";
  };
  patients?: BookAppointmentPatientPayload[];
  shiftId?: number | null;
  voucherId?: number | null;
  voucherCode?: string | null;
};

export async function bookAppointment(
  payload: BookAppointmentPayload,
  opts: { specialtyId: number; doctorId?: number | null }
): Promise<ActionResponse<Appointment>> {
  try {
    const params = new URLSearchParams({ specialtyId: String(opts.specialtyId) });
    if (opts.doctorId) params.append("doctorId", String(opts.doctorId));
    const res = await http.post(`/appointments/create?${params.toString()}`, payload);
    const data = extractData(res.data);
    return { ok: true, data: normalizeAppointment(data) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to book appointment";
    return { ok: false, error: message };
  }
}

export async function rescheduleAppointment(
  id: number,
  newShiftId: number
): Promise<ActionResponse> {
  try {
    await http.put(
      `/appointments/reschedule/${id}?newShiftId=${encodeURIComponent(newShiftId)}`
    );
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reschedule";
    return { ok: false, error: message };
  }
}

export async function fetchByShift(
  shiftId: number | string
): Promise<ActionResponse<Appointment[]>> {
  try {
    const res = await http.get(`/appointments/by-shift/${shiftId}`);
    const payload = extractArray(res.data);
    return { ok: true, data: payload.map(normalizeAppointment) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch appointments by shift";
    return { ok: false, error: message };
  }
}

export async function fetchByShifts(
  shiftIds: Array<number | string>
): Promise<ActionResponse<Appointment[]>> {
  try {
    const results = await Promise.all(shiftIds.map((id) => fetchByShift(id)));
    const all: Appointment[] = [];
    for (const res of results) {
      if (res.ok && res.data) {
        all.push(...res.data);
      }
    }
    return { ok: true, data: all };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch appointments by shifts";
    return { ok: false, error: message };
  }
}

export async function startAppointment(
  id: number
): Promise<ActionResponse<Appointment>> {
  try {
    const res = await http.put(`/appointments/start/${id}`);
    return { ok: true, data: normalizeAppointment(extractData(res.data)) };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to start appointment";
    return { ok: false, error: message };
  }
}

export async function completeAppointment(id: number): Promise<ActionResponse> {
  try {
    await http.put(`/appointments/complete/${id}`);
    return { ok: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to complete appointment";
    return { ok: false, error: message };
  }
}

/** ===== Client-side filtering helpers ===== */
export function deriveSpecialties(list: Appointment[]): string[] {
  return [...new Set(list.map((item) => item.specialtyName).filter(Boolean) as string[])];
}

export function applyClientFilters(
  list: Appointment[],
  opts: { specialty?: string; search?: string }
): Appointment[] {
  let out = [...list];
  if (opts.specialty && opts.specialty !== "ALL") {
    out = out.filter((item) => item.specialtyName === opts.specialty);
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (item) =>
        (item.patientName || "").toLowerCase().includes(q) ||
        (item.doctorName || "").toLowerCase().includes(q)
    );
  }
  return out;
}
