import { http } from "./http";

export type ShiftType = "MORNING" | "AFTERNOON" | "EVENING";

export type DoctorShiftSlot = {
  id: number | string;
  startTime: string;
  endTime: string;
  status: string;
  slotNumber?: number;
  slotStatus?: string;
};

export type DoctorShift = {
  id: number | string;
  date: string; // ISO yyyy-mm-dd
  shift: ShiftType;
  startTime?: string;
  endTime?: string;
  maxPatients?: number;
  note?: string;
  status?: string;
  doctorId?: number | string;
  doctorName?: string;
  availableSlots?: number;
  shiftType?: ShiftType | string;
  name?: ShiftType | string;
  start?: string;
  end?: string;
  start_time?: string;
  end_time?: string;
  slots?: DoctorShiftSlot[];
};

export type AdminShift = {
  id: number;
  date: string;
  shiftType: ShiftType;
  doctorId?: number;
  doctorName?: string;
  specialtyName?: string;
};

export type CreateShiftPayload = {
  date: string; // yyyy-mm-dd
  shift: ShiftType;
  maxPatients?: number;
  note?: string;
  repeatWeekly?: boolean;
  repeatCount?: number; // 0..3
};

export type ShiftCancellationRequest = {
  id: string;
  shiftId: string;
  doctorId?: number;
  doctorName?: string;
  shiftDate: string;
  shift: ShiftType;
  reason: string;
  affectedAppointmentCount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decisionNote?: string;
  requestedAt?: string;
  decidedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    if (Array.isArray(data.data)) return data.data as T[];
    if (Array.isArray(data.items)) return data.items as T[];
  }
  return [];
}

function pickObject<T>(data: unknown): T {
  if (isRecord(data) && isRecord(data.data)) {
    return data.data as T;
  }
  return data as T;
}

export async function fetchMyShifts(
  week?: "current" | "next",
  date?: string,
): Promise<DoctorShift[]> {
  const params = new URLSearchParams();
  if (week) params.set("week", week);
  if (date) params.set("date", date);
  const query = params.toString();
  const qs = query ? `?${query}` : "";
  const res = await http.get(`/shifts/my${qs}`);
  return pickArray<DoctorShift>(res.data);
}

export async function createShift(payload: CreateShiftPayload): Promise<number | DoctorShift> {
  const res = await http.post(`/shifts/create`, payload);
  return pickObject(res.data);
}

export async function fetchMyShiftCancellationRequests(): Promise<ShiftCancellationRequest[]> {
  const res = await http.get("/shifts/cancellation-requests/my");
  return pickArray<ShiftCancellationRequest>(res.data);
}

export async function fetchPendingShiftCancellationRequests(): Promise<ShiftCancellationRequest[]> {
  const res = await http.get("/shifts/cancellation-requests/pending");
  return pickArray<ShiftCancellationRequest>(res.data);
}

export async function approveShiftCancellationRequest(
  id: number | string,
  note?: string
): Promise<ShiftCancellationRequest> {
  const res = await http.put(`/shifts/cancellation-requests/${encodeURIComponent(id)}/approve`, { note });
  return pickObject<ShiftCancellationRequest>(res.data);
}

export async function rejectShiftCancellationRequest(
  id: number | string,
  note: string
): Promise<ShiftCancellationRequest> {
  const res = await http.put(`/shifts/cancellation-requests/${encodeURIComponent(id)}/reject`, { note });
  return pickObject<ShiftCancellationRequest>(res.data);
}

export async function createShiftCancellationRequest(
  shiftId: number | string,
  reason: string,
): Promise<ShiftCancellationRequest> {
  const res = await http.post(`/shifts/${encodeURIComponent(shiftId)}/cancellation-requests`, { reason });
  return pickObject<ShiftCancellationRequest>(res.data);
}

export async function fetchShiftsInWeek(startISO: string, endISO: string): Promise<AdminShift[]> {
  const res = await http.get(`/shifts/admin/week?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
  return pickArray<AdminShift>(res.data);
}

/** GET /shifts/by-doctor/{doctorId}?date=YYYY-MM-DD */
export async function fetchShiftsByDoctorAndDate(doctorId: number | string, dateISO: string): Promise<DoctorShift[]> {
  const res = await http.get(`/shifts/by-doctor/${doctorId}?date=${encodeURIComponent(dateISO)}`);
  return pickArray<DoctorShift>(res.data);
}

/** GET /shifts/by-date?date=YYYY-MM-DD - Lấy tất cả shifts trong ngày (Receptionist/Admin) */
export async function fetchAllShiftsByDate(dateISO: string): Promise<DoctorShift[]> {
  const res = await http.get(`/shifts/by-date?date=${encodeURIComponent(dateISO)}`);
  return pickArray<DoctorShift>(res.data);
}
