import { createContext, useContext, useEffect, useMemo, useReducer } from "react";

export type AppointmentType = "ONSITE" | "ONLINE" | "";
export type ShiftName = "MORNING" | "AFTERNOON" | "EVENING";

export type PatientSelection = {
  patientInfoId?: number | null;
  fullName: string;
  phoneNumber: string;
  gender: "Male" | "Female" | "Other";
  dob: string;
  relationship?: string;
  reason?: string;
};

export type SelectedVoucherInfo = {
  voucherId: number;
  code: string;
  name?: string | null;
  type: "SERVICE_TICKET" | "DISCOUNT";
  discountValue?: number | null;
  expiryDate?: string | null;
};

type State = {
  step: 1 | 2 | 3 | 4;
  specialtyId: number | null;
  specialtyName?: string;
  doctorId: number | null;
  doctorFullName?: string;
  doctorDegree?: string;
  doctorExperience?: string;
  doctorAvatarUrl?: string;
  doctorDescription?: string;
  appointmentType: AppointmentType;
  dateISO: string;
  shiftId: number | null;
  shiftName?: ShiftName;
  shiftLabel?: string;
  shiftAvailableSlots?: number;
  shiftTotalSlots?: number;
  patientSelections: PatientSelection[];
  selectedVoucher: SelectedVoucherInfo | null;
};

type Action =
  | { type: "SET_STEP"; step: State["step"] }
  | { type: "SET_SPECIALTY"; id: number | null; name?: string; preserveDoctor?: boolean }
  | {
      type: "SET_DOCTOR";
      id: number | null;
      fullName?: string;
      degree?: string;
      experience?: string;
      avatarUrl?: string;
      description?: string;
      specialtyName?: string;
    }
  | {
      type: "SET_SPECIALTY_AND_DOCTOR";
      specialtyId: number | null;
      specialtyName?: string;
      doctorId: number | null;
      doctorFullName?: string;
      doctorDegree?: string;
      doctorExperience?: string;
      doctorAvatarUrl?: string;
      doctorDescription?: string;
    }
  | { type: "SET_APPOINTMENT_TYPE"; value: AppointmentType }
  | { type: "SET_DATE"; value: string }
  | {
      type: "SET_SHIFT";
      id: number | null;
      name?: string;
      start?: string;
      end?: string;
      shiftName?: ShiftName;
      availableSlots?: number;
      totalSlots?: number;
    }
  | { type: "SET_PATIENT_SELECTIONS"; value: PatientSelection[] }
  | { type: "SET_VOUCHER"; value: SelectedVoucherInfo | null }
  | { type: "RESET" };

const initial: State = {
  step: 1,
  specialtyId: null,
  doctorId: null,
  appointmentType: "",
  dateISO: "",
  shiftId: null,
  patientSelections: [],
  selectedVoucher: null,
};

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "SET_STEP":
      return { ...state, step: a.step };
    case "SET_SPECIALTY":
      // Nếu preserveDoctor = true, giữ nguyên doctor
      if (a.preserveDoctor) {
        return {
          ...state,
          specialtyId: a.id,
          specialtyName: a.name,
          appointmentType: "",
          dateISO: "",
          shiftId: null,
          shiftLabel: undefined,
          shiftName: undefined,
          shiftAvailableSlots: undefined,
          shiftTotalSlots: undefined,
          patientSelections: [],
        };
      }
      return {
        ...state,
        specialtyId: a.id,
        specialtyName: a.name,
        doctorId: null,
        doctorFullName: undefined,
        doctorDegree: undefined,
        doctorExperience: undefined,
        doctorAvatarUrl: undefined,
        doctorDescription: undefined,
        appointmentType: "",
        dateISO: "",
        shiftId: null,
        shiftLabel: undefined,
        shiftName: undefined,
        shiftAvailableSlots: undefined,
        shiftTotalSlots: undefined,
        patientSelections: [],
      };
    case "SET_SPECIALTY_AND_DOCTOR":
      return {
        ...state,
        specialtyId: a.specialtyId,
        specialtyName: a.specialtyName,
        doctorId: a.doctorId,
        doctorFullName: a.doctorFullName,
        doctorDegree: a.doctorDegree,
        doctorExperience: a.doctorExperience,
        doctorAvatarUrl: a.doctorAvatarUrl,
        doctorDescription: a.doctorDescription,
        appointmentType: "",
        dateISO: "",
        shiftId: null,
        shiftLabel: undefined,
        shiftName: undefined,
        shiftAvailableSlots: undefined,
        shiftTotalSlots: undefined,
        patientSelections: [],
      };
    case "SET_DOCTOR":
      return {
        ...state,
        doctorId: a.id,
        doctorFullName: a.fullName,
        doctorDegree: a.degree,
        doctorExperience: a.experience,
        doctorAvatarUrl: a.avatarUrl,
        doctorDescription: a.description,
        specialtyName: a.specialtyName ?? state.specialtyName,
        appointmentType: "",
        dateISO: "",
        shiftId: null,
        shiftLabel: undefined,
        shiftName: undefined,
        shiftAvailableSlots: undefined,
        shiftTotalSlots: undefined,
        patientSelections: [],
      };
    case "SET_APPOINTMENT_TYPE":
      return { ...state, appointmentType: a.value };
    case "SET_DATE":
      return {
        ...state,
        dateISO: a.value,
        shiftId: null,
        shiftName: undefined,
        shiftLabel: undefined,
        shiftAvailableSlots: undefined,
        shiftTotalSlots: undefined,
        patientSelections: [],
      };
    case "SET_SHIFT":
      return {
        ...state,
        shiftId: a.id,
        shiftName: a.shiftName ?? state.shiftName,
        shiftLabel:
          a.name ??
          (a.start && a.end ? `${a.start} - ${a.end}` : state.shiftLabel),
        shiftAvailableSlots: a.availableSlots,
        shiftTotalSlots: a.totalSlots,
        patientSelections: [],
      };
    case "SET_PATIENT_SELECTIONS":
      return { ...state, patientSelections: a.value };
    case "SET_VOUCHER":
      return { ...state, selectedVoucher: a.value };
    case "RESET":
      return initial;
    default:
      return state;
  }
}

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | undefined>(undefined);
export const useAppt = () => {
  const context = useContext(Ctx);
  if (!context) {
    throw new Error("useAppt must be used within an AppointmentProvider");
  }
  return context;
};

export function AppointmentProvider({ children }: { children: React.ReactNode }) {
  const saved = typeof window !== "undefined" ? sessionStorage.getItem("appt") : null;
  const initializer = () => {
    if (!saved) return initial;
    try {
      const parsed = JSON.parse(saved) as Partial<State>;
      return {
        ...initial,
        ...parsed,
        patientSelections: parsed?.patientSelections ?? [],
      };
    } catch {
      return initial;
    }
  };
  const [state, dispatch] = useReducer(reducer, undefined, initializer);
  useEffect(() => sessionStorage.setItem("appt", JSON.stringify(state)), [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
