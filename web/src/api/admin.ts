import { http } from './http';

export type AdminUser = {
  id: number;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  gender?: string;
  degree?: string;
  description?: string;
  experience?: string;
  isEnabled?: boolean; // For tracking enabled/disabled status
  userType?: string;
  role?: string;
  specialtyName?: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function pickArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    if (Array.isArray(data.items)) return data.items as T[];
    if (Array.isArray(data.data)) return data.data as T[];
  }
  return [];
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pickBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function normalizeUser(raw: unknown): AdminUser {
  if (!isRecord(raw)) {
    return {
      id: 0,
      fullName: '',
    };
  }
  return {
    id: Number(raw.id ?? 0),
    fullName: pickString(raw.fullName) ?? pickString(raw.name) ?? '',
    email: pickString(raw.email),
    phoneNumber: pickString(raw.phoneNumber),
    gender: pickString(raw.gender),
    degree: pickString(raw.degree),
    description: pickString(raw.description),
    experience: pickString(raw.experience),
    isEnabled:
      typeof raw.isEnable === "boolean"
        ? raw.isEnable
        : typeof raw.isEnabled === "boolean"
        ? raw.isEnabled
        : pickBoolean(raw.isEnabled) ?? pickBoolean(raw.isEnable) ?? true,
    userType: pickString(raw.userType) ?? pickString(raw.role),
    role: pickString(raw.userType) ?? pickString(raw.role),
    specialtyName: pickString(raw.specialtyName),
  };
}

function normalizeUserArray(list: unknown[]): AdminUser[] {
  return (list || []).map(normalizeUser);
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await http.get('/admin/users');
  return normalizeUserArray(pickArray(res.data));
}

export async function fetchAdminReceptionists(): Promise<AdminUser[]> {
  const res = await http.get('/admin/receptionists');
  return normalizeUserArray(pickArray(res.data));
}

export async function fetchAdminPatients(): Promise<AdminUser[]> {
  const res = await http.get('/admin/patients');
  return normalizeUserArray(pickArray(res.data));
}

export async function fetchAllUsersIncludingDisabled(): Promise<AdminUser[]> {
  const res = await http.get('/admin/all-including-disabled');
  return normalizeUserArray(pickArray(res.data));
}

export async function fetchDisabledUsers(): Promise<AdminUser[]> {
  const res = await http.get('/admin/disabled');
  return normalizeUserArray(pickArray(res.data));
}

// Ban user (disable / lock)
export async function banUser(userId: number): Promise<void> {
  await http.delete(`/admin/users/${userId}`);
}

// Unban user (activate / unlock)
export async function unbanUser(userId: number): Promise<void> {
  await http.post(`/admin/activate/${userId}`);
}
