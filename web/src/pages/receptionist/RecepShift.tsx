import { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Spinner } from "react-bootstrap";
import { http } from "../../api/http";
import { fetchDoctorsAll, type Doctor } from "../../api/doctor";
import { fetchByShift } from "../../api/appointment";
import type { Appointment } from "../../api/appointment";
import "../../styles/shift.css";

type ShiftType = "MORNING" | "AFTERNOON" | "EVENING" | string;
type UnknownRecord = Record<string, unknown>;

type ShiftItem = {
  id: number;
  date: string; // yyyy-mm-dd
  shift: ShiftType;
  doctorId: number;
  doctorName: string;
  specialtyName?: string;
};

type DoctorInShift = {
  shiftId: number;
  doctorId?: number;
  doctorName: string;
};

type TableRow = {
  key: string;
  shiftLabel: string;
  shiftType: string;
  shiftDate: string;
  specialtyName: string;
  doctor: DoctorInShift;
  showShiftCell: boolean;
  shiftRowSpan: number;
  showSpecialtyCell: boolean;
  specialtyRowSpan: number;
};

const SHIFT_LABEL: Record<string, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};

function toISODateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export default function RecepShift() {
  const [date, setDate] = useState<string>(() => toISODateInput(new Date()));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [shiftAppointments, setShiftAppointments] = useState<Record<number, Appointment[]>>({});

  async function loadAllByDate(targetDate: string) {
    setLoading(true);
    setError("");
    try {
      const res = await http.get(`/shifts/by-date?date=${encodeURIComponent(targetDate)}`);
      const raw = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      const data = Array.isArray(raw) ? (raw as unknown[]) : [];
      const normalized = data.map(normalizeShiftItem);
      setShifts(normalized);
      // Load appointments for all shifts
      await loadAppointmentsForShifts(normalized);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load shifts";
      setError(message);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadByDoctor(doctorId: number, targetDate: string) {
    setLoading(true);
    setError("");
    try {
      const res = await http.get(`/shifts/by-doctor/${doctorId}?date=${encodeURIComponent(targetDate)}`);
      const raw = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      const data = Array.isArray(raw) ? (raw as unknown[]) : [];
      const normalized = data.map(normalizeShiftItem);
      setShifts(normalized);
      // Load appointments for all shifts
      await loadAppointmentsForShifts(normalized);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load shifts by doctor";
      setError(message);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAppointmentsForShifts(shiftsList: ShiftItem[]) {
    const appointmentsMap: Record<number, Appointment[]> = {};
    try {
      const results = await Promise.all(
        shiftsList.map(async (shift) => {
          try {
            const res = await fetchByShift(shift.id);
            return { shiftId: shift.id, appointments: res.ok && res.data ? res.data : [] };
          } catch {
            return { shiftId: shift.id, appointments: [] };
          }
        })
      );
      results.forEach(({ shiftId, appointments }) => {
        appointmentsMap[shiftId] = appointments;
      });
      setShiftAppointments(appointmentsMap);
    } catch (e: unknown) {
      console.error("Failed to load appointments:", e);
    }
  }

  function normalizeShiftItem(raw: unknown): ShiftItem {
    const source = isRecord(raw) ? raw : {};
    const doctorSource = isRecord(source.doctor) ? source.doctor : undefined;
    const specialtySource = isRecord(source.specialty) ? source.specialty : undefined;
    const specialtyName =
      (typeof source.specialtyName === "string" && source.specialtyName) ||
      (specialtySource && typeof specialtySource["name"] === "string" && (specialtySource["name"] as string)) ||
      (doctorSource && typeof doctorSource["specialtyName"] === "string" && (doctorSource["specialtyName"] as string)) ||
      undefined;

    return {
      id: Number(source.id ?? 0),
      date:
        (typeof source.date === "string" && source.date) ||
        (typeof source.shiftDate === "string" && source.shiftDate) ||
        "",
      shift:
        (typeof source.shift === "string" && source.shift) ||
        (typeof source.shiftType === "string" && source.shiftType) ||
        (typeof source.type === "string" && source.type) ||
        "",
      doctorId: Number(
        typeof source.doctorId === "number"
          ? source.doctorId
          : doctorSource && typeof doctorSource["id"] === "number"
          ? (doctorSource["id"] as number)
          : 0
      ),
      doctorName:
        (typeof source.doctorName === "string" && source.doctorName) ||
        (doctorSource && typeof doctorSource["fullName"] === "string" && (doctorSource["fullName"] as string)) ||
        (doctorSource && typeof doctorSource["name"] === "string" && (doctorSource["name"] as string)) ||
        "",
      specialtyName,
    };
  }

  // Load doctors and initial data
  useEffect(() => {
    fetchDoctorsAll().then(setDoctors).catch(() => {});
    loadAllByDate(date);
  }, []);

  // Auto-filter when date changes
  useEffect(() => {
    if (selectedDoctorId) {
      loadByDoctor(Number(selectedDoctorId), date);
    } else {
      loadAllByDate(date);
    }
  }, [date]);

  // Auto-filter when doctor selection changes
  useEffect(() => {
    if (selectedDoctorId) {
      loadByDoctor(Number(selectedDoctorId), date);
    } else {
      loadAllByDate(date);
    }
  }, [selectedDoctorId]);

  const onClearDoctorFilter = () => {
    setSelectedDoctorId("");
    // This will trigger the useEffect to reload all
  };

  const tableRows = useMemo(() => {
    type SpecialtyGroup = { name: string; doctors: DoctorInShift[] };
    type ShiftGroup = {
      key: string;
      shiftType: string;
      shiftLabel: string;
      date: string;
      specialties: Map<string, SpecialtyGroup>;
    };

    const shiftMap = new Map<string, ShiftGroup>();

    shifts.forEach((shift) => {
      const shiftType = shift.shift || "UNKNOWN";
      const key = `${shift.date || ""}__${shiftType}`;
      let shiftGroup = shiftMap.get(key);
      if (!shiftGroup) {
        shiftGroup = {
          key,
          shiftType,
          shiftLabel: SHIFT_LABEL[shiftType] ?? shiftType,
          date: shift.date,
          specialties: new Map<string, SpecialtyGroup>(),
        };
        shiftMap.set(key, shiftGroup);
      }

      const specialtyName = shift.specialtyName || "—";
      let specialtyGroup = shiftGroup.specialties.get(specialtyName);
      if (!specialtyGroup) {
        specialtyGroup = { name: specialtyName, doctors: [] };
        shiftGroup.specialties.set(specialtyName, specialtyGroup);
      }

      specialtyGroup.doctors.push({
        shiftId: shift.id,
        doctorId: shift.doctorId,
        doctorName: shift.doctorName || "—",
      });
    });

    const rows: TableRow[] = [];

    shiftMap.forEach((group) => {
      const specialties = Array.from(group.specialties.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const totalDoctorRows =
        specialties.reduce((sum, spec) => sum + Math.max(spec.doctors.length, 1), 0) || 1;

      let isFirstRowOfShift = true;

      specialties.forEach((spec) => {
        const doctors = spec.doctors.length
          ? spec.doctors
          : [{ shiftId: -1, doctorName: "—", appointments: [] }];
        const specialtyRowSpan = Math.max(doctors.length, 1);
        let isFirstDoctorOfSpec = true;

        doctors.forEach((doctor, index) => {
          rows.push({
            key: `${group.key}-${spec.name}-${doctor.shiftId}-${index}`,
            shiftLabel: group.shiftLabel,
            shiftType: group.shiftType,
            shiftDate: group.date,
            specialtyName: spec.name,
            doctor,
            showShiftCell: isFirstRowOfShift,
            shiftRowSpan: isFirstRowOfShift ? totalDoctorRows : 0,
            showSpecialtyCell: isFirstDoctorOfSpec,
            specialtyRowSpan: isFirstDoctorOfSpec ? specialtyRowSpan : 0,
          });

          isFirstRowOfShift = false;
          isFirstDoctorOfSpec = false;
        });
      });
    });

    return rows;
  }, [shifts, shiftAppointments]);

  return (
    <div className="shift-wrap">
      {/* Filter Bar */}
      <div className="shift-filterbar">
        <div className="left">
          <h5 className="title">Daily Shifts</h5>
        </div>

        <div className="right">
          <Form.Control
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-input"
          />

          <Form.Select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
          >
            <option value="">-- All doctors --</option>
            {doctors.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.fullName} {d.specialtyName ? `- ${d.specialtyName}` : ""}
              </option>
            ))}
          </Form.Select>

          <Button variant="outline-secondary" onClick={onClearDoctorFilter} disabled={loading}>
            Reset
          </Button>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <Card body className="border-danger-subtle text-danger mb-3">
          {error}
        </Card>
      )}
      {loading ? (
        <div className="loading-inline">
          <Spinner animation="border" size="sm" />
          <span>Đang tải…</span>
        </div>
      ) : (
        <div className="shift-table-responsive">
          <table className="shift-table table table-bordered align-middle">
            <thead>
              <tr>
                <th className="col-shift">Shift</th>
                <th className="col-spec">Specialty</th>
                <th className="col-doctor">Doctor</th>
                <th className="col-day">Appointments</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center">
                    {loading ? "Loading..." : "No data"}
                  </td>
                </tr>
              )}
              {tableRows.map((row) => {
                const appointmentsForDoctor = (shiftAppointments[row.doctor.shiftId] || []).filter(
                  (appt) => appt.status !== "CANCELLED"
                );
                const sortedAppointments = [...appointmentsForDoctor].sort((a, b) => {
                  const timeA = a.appointmentTime || "";
                  const timeB = b.appointmentTime || "";
                  return timeA.localeCompare(timeB);
                });
                return (
                  <tr key={row.key}>
                    {row.showShiftCell && (
                      <td rowSpan={row.shiftRowSpan} className="align-middle">
                        <div className="fw-semibold text-uppercase">{row.shiftLabel}</div>
                        <div className="text-muted small">{row.shiftDate}</div>
                      </td>
                    )}
                    {row.showSpecialtyCell && (
                      <td rowSpan={row.specialtyRowSpan} className="align-middle">
                        {row.specialtyName}
                      </td>
                    )}
                    <td className="fw-semibold">{row.doctor.doctorName}</td>
                    <td className="cell">
                      {sortedAppointments.length > 0 ? (
                        <div className="cell-inner">
                          <div className="appt-list">
                            {sortedAppointments.map((appt) => (
                              <AppointmentChip
                                key={appt.id}
                                time={appt.appointmentTime}
                                patient={appt.patientName}
                                status={appt.status}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="cell-empty">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** ====== Appointment Chip Component ====== */
function AppointmentChip({
  time,
  patient,
  status,
}: {
  time?: string;
  patient?: string;
  status?: string;
}) {
  const s = String(status || "").toLowerCase().replace(/_/g, "-");
  const cls = s ? `appt appt-${s}` : "appt appt-default";
  return (
    <div className={cls} title={status || ""}>
      <span className="appt-left">
        <span className="time">{(time || "--:--").slice(0, 5)}</span>
        <span className="patient">{patient || "Patient"}</span>
      </span>
      <span className="status">{status || "-"}</span>
    </div>
  );
}
