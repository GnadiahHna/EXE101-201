import { http } from "./http";

export type VoucherType = "SERVICE_TICKET" | "DISCOUNT";

export type VoucherItem = {
  id: number;
  code: string;
  name?: string | null;
  discountValue?: number | null;
  type: VoucherType;
  enable: boolean;
  expiryDate?: string | null;
};

export type VoucherPayload = {
  code: string;
  name?: string | null;
  discountValue?: number | null;
  type: VoucherType;
  enable: boolean;
  expiryDate?: string | null; // format dd/MM/yyyy HH:mm
};

export type UserVoucher = {
  id: number;
  voucherId: number;
  voucherCode: string;
  voucherName?: string | null;
  discountValue?: number | null;
  type: VoucherType;
  expiryDate?: string | null;
  issuedAt?: string | null;
  used: boolean;
  userId?: number | null;
  userFullName?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
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

const normalizeVoucher = (raw: unknown): VoucherItem => {
  const record = isRecord(raw) ? raw : {};
  const typeValue = pickString(record.type);
  const type: VoucherType =
    typeValue === "DISCOUNT" ? "DISCOUNT" : "SERVICE_TICKET";

  return {
    id: Number(record.id ?? 0),
    code: pickString(record.code) ?? "",
    name: pickString(record.name),
    discountValue: pickNumber(record.discountValue),
    type,
    enable: typeof record.enable === "boolean" ? record.enable : Boolean(record.enable ?? true),
    expiryDate: pickString(record.expiryDate),
  };
};

const normalizeUserVoucher = (raw: unknown): UserVoucher => {
  const record = isRecord(raw) ? raw : {};
  const typeValue = pickString(record.type);
  const type: VoucherType =
    typeValue === "DISCOUNT" ? "DISCOUNT" : "SERVICE_TICKET";

  return {
    id: Number(record.id ?? 0),
    voucherId: Number(record.voucherId ?? record.id ?? 0),
    voucherCode: pickString(record.voucherCode) ?? "",
    voucherName: pickString(record.voucherName),
    discountValue: pickNumber(record.discountValue),
    type,
    expiryDate: pickString(record.expiryDate),
    issuedAt: pickString(record.issuedAt),
    used: Boolean(record.used),
    userId: pickNumber(record.userId),
    userFullName: pickString(record.userFullName),
  };
};

const extractArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.data)) return data.data;
  return [];
};

const extractObject = (data: unknown): unknown =>
  isRecord(data) && "data" in data ? (data.data as unknown) : data;

export async function fetchVouchers(): Promise<VoucherItem[]> {
  const res = await http.get("/vouchers/all");
  return extractArray(res.data).map(normalizeVoucher);
}

export async function fetchPublicVouchers(): Promise<VoucherItem[]> {
  const res = await http.get("/vouchers/public");
  return extractArray(res.data).map(normalizeVoucher);
}

export async function claimVoucher(voucherId: number): Promise<UserVoucher> {
  const res = await http.post(`/vouchers/${voucherId}/claim`);
  return normalizeUserVoucher(extractObject(res.data));
}

export async function fetchVoucherById(id: number): Promise<VoucherItem> {
  const res = await http.get(`/vouchers/${id}`);
  return normalizeVoucher(extractObject(res.data));
}

export async function createVoucher(payload: VoucherPayload): Promise<VoucherItem> {
  const res = await http.post("/vouchers/create", payload);
  return normalizeVoucher(extractObject(res.data));
}

export async function updateVoucher(id: number, payload: VoucherPayload): Promise<VoucherItem> {
  const res = await http.put(`/vouchers/update/${id}`, payload);
  return normalizeVoucher(extractObject(res.data));
}

export async function deleteVoucher(id: number): Promise<void> {
  await http.delete(`/vouchers/delete/${id}`);
}

export async function fetchMyVouchers(): Promise<UserVoucher[]> {
  const res = await http.get("/vouchers/my");
  return extractArray(res.data).map(normalizeUserVoucher);
}

export async function fetchVoucherOwners(voucherId: number): Promise<UserVoucher[]> {
  const res = await http.get(`/vouchers/${voucherId}/owners`);
  return extractArray(res.data).map(normalizeUserVoucher);
}

export async function useVoucherForUser(voucherId: number, userId: number): Promise<UserVoucher> {
  const res = await http.post(`/vouchers/${voucherId}/use`, undefined, {
    params: { userId },
  });
  return normalizeUserVoucher(extractObject(res.data));
}


