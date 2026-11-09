import { http } from "./http";
import type { UserVoucher } from "./voucher";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const pickArray = <T = unknown>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    if (Array.isArray(data.items)) return data.items as T[];
    if (Array.isArray(data.data)) return data.data as T[];
  }
  return [];
};

const pickObject = <T = unknown>(data: unknown): T => {
  if (isRecord(data) && isRecord(data.data)) return data.data as T;
  return data as T;
};

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const pickNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
};

// ===== Receptionist management (admin use) =====
export type Receptionist = {
  id: number;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  gender?: "Male" | "Female" | "Other";
};

export type CreateReceptionistPayload = {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  gender: "Male" | "Female" | "Other";
};

export type UpdateReceptionistPayload = {
  fullName?: string;
  phoneNumber?: string;
  gender?: "Male" | "Female" | "Other";
};

const normalizeReceptionist = (raw: unknown): Receptionist => {
  const record = isRecord(raw) ? raw : {};
  const genderValue = pickString(record.gender);
  const gender: Receptionist["gender"] | undefined =
    genderValue === "Male" || genderValue === "Female" || genderValue === "Other"
      ? genderValue
      : undefined;

  return {
    id: Number(record.id ?? 0),
    fullName: pickString(record.fullName) ?? pickString(record.name) ?? "",
    email: pickString(record.email),
    phoneNumber: pickString(record.phoneNumber),
    gender,
  };
};

export async function fetchReceptionistsAll(): Promise<Receptionist[]> {
  const res = await http.get("/receptionists/all");
  return pickArray(res.data).map(normalizeReceptionist);
}

export async function fetchReceptionistById(id: number): Promise<Receptionist> {
  const res = await http.get(`/receptionists/${id}`);
  return normalizeReceptionist(pickObject(res.data));
}

export async function createReceptionist(payload: CreateReceptionistPayload): Promise<Receptionist> {
  const res = await http.post("/admin/create-user", {
    ...payload,
    userType: "Receptionist",
  });
  return pickObject<Receptionist>(res.data);
}

export async function updateReceptionist(id: number, payload: UpdateReceptionistPayload): Promise<Receptionist> {
  const res = await http.put(`/receptionists/update/${id}`, payload);
  return normalizeReceptionist(pickObject(res.data));
}

// ===== Receptionist event/voucher management =====
export type ReceptionEventParticipant = {
  id: number;
  userId: number;
  userFullName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  status: string;
  registeredAt?: string | null;
};

export type ReceptionEventItem = {
  id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  enabled: boolean;
  voucherId?: number | null;
  voucherCode?: string | null;
  voucherName?: string | null;
  registrations: ReceptionEventParticipant[];
};

const normalizeParticipant = (raw: unknown): ReceptionEventParticipant => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: Number(record.id ?? record.userEventId ?? 0),
    userId: Number(record.userId ?? 0),
    userFullName: pickString(record.userFullName),
    userEmail: pickString(record.userEmail),
    userPhone: pickString(record.userPhone),
    status: pickString(record.status) ?? "PENDING",
    registeredAt: pickString(record.registeredAt),
  };
};

export type UserSearchResult = {
  id: number;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
};

const normalizeUserSearch = (raw: unknown): UserSearchResult => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: Number(record.id ?? 0),
    fullName: pickString(record.fullName) ?? pickString(record.name),
    email: pickString(record.email),
    phone: pickString(record.phone) ?? pickString(record.phoneNumber),
  };
};

const normalizeReceptionEvent = (raw: unknown): ReceptionEventItem => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: Number(record.id ?? record.eventId ?? 0),
    title: pickString(record.title) ?? pickString(record.eventName) ?? "",
    description: pickString(record.description),
    location: pickString(record.location),
    startDate: pickString(record.startDate) ?? pickString(record.eventStart),
    endDate: pickString(record.endDate) ?? pickString(record.eventEnd),
    enabled: typeof record.enabled === "boolean" ? record.enabled : Boolean(record.enabled ?? true),
    voucherId: pickNumber(record.voucherId),
    voucherCode: pickString(record.voucherCode),
    voucherName: pickString(record.voucherName),
    registrations: pickArray(record.registrations).map(normalizeParticipant),
  };
};

const normalizeUserVoucher = (raw: unknown): UserVoucher => {
  const record = isRecord(raw) ? raw : {};
  return {
    id: Number(record.id ?? 0),
    voucherId: Number(record.voucherId ?? record.id ?? 0),
    voucherCode: pickString(record.voucherCode) ?? "",
    voucherName: pickString(record.voucherName),
    discountValue: pickNumber(record.discountValue),
    type: (record.type === "DISCOUNT" ? "DISCOUNT" : "SERVICE_TICKET") as UserVoucher["type"],
    expiryDate: pickString(record.expiryDate),
    issuedAt: pickString(record.issuedAt),
    used: Boolean(record.used),
    userId: pickNumber(record.userId),
    userFullName: pickString(record.userFullName),
    userEmail: pickString(record.userEmail),
    userPhone: pickString(record.userPhone),
  };
};

export async function fetchReceptionEvents(): Promise<ReceptionEventItem[]> {
  const res = await http.get("/reception/events");
  return pickArray(res.data).map(normalizeReceptionEvent);
}

export async function confirmEventAttendance(eventId: number, userId: number): Promise<ReceptionEventParticipant> {
  const res = await http.post(`/reception/events/${eventId}/confirm/${userId}`);
  return normalizeParticipant(pickObject(res.data));
}

export async function searchUsersForReception(keyword: string): Promise<UserSearchResult[]> {
  const res = await http.get("/users/search", { params: { keyword } });
  return pickArray(res.data).map(normalizeUserSearch);
}

export async function fetchVoucherOwnersForReception(voucherId: number): Promise<UserVoucher[]> { //fix phần này
  const res = await http.get(`/vouchers/${voucherId}/owners`);
  return pickArray(res.data).map(normalizeUserVoucher);
}

export async function fetchAllUserVouchersForReception(): Promise<UserVoucher[]> {
  const res = await http.get('/vouchers/all-owners');
  return pickArray(res.data).map(normalizeUserVoucher);
}

export async function fetchUserVouchersForReception(userId: number): Promise<UserVoucher[]> {
  const res = await http.get(`/vouchers/user/${userId}`);
  return pickArray(res.data).map(normalizeUserVoucher);
}

export async function useVoucherForUserReception(voucherId: number, userId: number): Promise<UserVoucher> {
  const res = await http.post(`/vouchers/${voucherId}/use`, undefined, { params: { userId } });
  return normalizeUserVoucher(pickObject(res.data));
}