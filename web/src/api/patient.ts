// src/api/patient.ts
import { http } from "./http";

type UnknownRecord = Record<string, unknown>;

export type PatientInfo = {
  id: number;
  fullName: string;
  gender?: string;
  phoneNumber?: string;
  dob?: string;
  relationship?: string;
  allergies?: string[];
  medicalHistory?: string[];
  weightKg?: number | null;
  heightCm?: number | null;
  slotId?: number;
  appointmentTime?: string;
  slotStartTime?: string;
  slotEndTime?: string;
};

export type CreatePatientInfoPayload = {
  fullName: string;
  gender?: string;
  phoneNumber?: string;
  dob?: string;
  relationship: string;
};

export type UpdatePatientInfoPayload = Partial<CreatePatientInfoPayload>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

function pickArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    if (Array.isArray(data.items)) return data.items as T[];
    if (Array.isArray(data.data)) return data.data as T[];
  }
  return [];
}

const pickString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export function normalizePatientInfo(raw: unknown): PatientInfo {
  const record = isRecord(raw) ? raw : {};
  return {
    id: Number(record.id ?? 0),
    fullName: pickString(record.fullName) ?? pickString(record.name) ?? "",
    gender: pickString(record.gender) ?? pickString(record.sex),
    phoneNumber: pickString(record.phoneNumber) ?? pickString(record.phone),
    dob: pickString(record.dob) ?? pickString(record.dateOfBirth),
    relationship: pickString(record.relationship),
    allergies: Array.isArray(record.allergies) ? (record.allergies as string[]) : undefined,
    medicalHistory: Array.isArray(record.medicalHistory) ? (record.medicalHistory as string[]) : undefined,
    weightKg: typeof record.weightKg === "number" ? record.weightKg : null,
    heightCm: typeof record.heightCm === "number" ? record.heightCm : null,
    slotId: typeof record.slotId === "number" ? record.slotId : undefined,
    appointmentTime: pickString(record.appointmentTime) ?? pickString(record.time),
    slotStartTime: pickString(record.slotStartTime),
    slotEndTime: pickString(record.slotEndTime),
  };
}

export async function fetchMyPatients(): Promise<PatientInfo[]> {
  const res = await http.get("/patients-info/my");
  return pickArray(res.data).map(normalizePatientInfo);
}

export async function fetchPatientInfoById(id: number): Promise<PatientInfo> {
  const res = await http.get(`/patients-info/${id}`);
  const payload = res.data?.data ?? res.data;
  if (Array.isArray(payload)) {
    const [first] = payload;
    return normalizePatientInfo(first);
  }
  return normalizePatientInfo(payload);
}

export async function createPatientInfo(
  payload: CreatePatientInfoPayload
): Promise<PatientInfo> {
  const res = await http.post("/patients-info/create", payload);
  const data = res.data?.data ?? res.data;
  return normalizePatientInfo(data);
}

export async function updatePatientInfo(
  id: number,
  payload: UpdatePatientInfoPayload
): Promise<PatientInfo> {
  const res = await http.put(`/patients-info/update/${id}`, payload);
  const data = res.data?.data ?? res.data;
  return normalizePatientInfo(data);
}

export async function deletePatientInfo(id: number): Promise<void> {
  await http.delete(`/patients-info/delete/${id}`);
}

