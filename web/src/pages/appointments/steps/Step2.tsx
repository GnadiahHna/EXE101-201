import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Col, Row, Spinner } from "react-bootstrap";
import { useAppt } from "../../../contexts/AppointmentContext";
import type { ShiftName } from "../../../contexts/AppointmentContext";
import {
  fetchShiftsByDoctorAndDate,
  type DoctorShift,
  type DoctorShiftSlot,
} from "../../../api/shift";
import { getDoctorImagePathWithFallback } from "../../../utils/doctorImage";

type ShiftOption = {
  id: number;
  name: ShiftName;
  start: string;
  end: string;
  label: string;
  availableSlots: number;
  totalSlots: number;
};

type CalendarCell = {
  key: string;
  iso: string;
  label: string;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isDisabled: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISO(value: string | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

type ExtendedShift = DoctorShift & {
  availableSlots?: number;
};

function normalizeShift(source: DoctorShift): ShiftOption {
  const rawName = source.shift ?? source.name ?? source.shiftType ?? "MORNING";

  const isShiftName = (value: unknown): value is ShiftName =>
    value === "MORNING" || value === "AFTERNOON" || value === "EVENING";

  const name: ShiftName = isShiftName(rawName) ? rawName : "MORNING";

  const startRaw =
    source.startTime ??
    source.start ??
    source.start_time ??
    "";

  const endRaw =
    source.endTime ??
    source.end ??
    source.end_time ??
    "";

  const start = startRaw || "--:--";
  const end = endRaw || "--:--";
  const label =
    start !== "--:--" && end !== "--:--"
      ? `${start} - ${end}`
      : name === "MORNING"
      ? "Morning"
      : name === "AFTERNOON"
      ? "Afternoon"
      : "Evening";

  const slots = Array.isArray(source.slots)
    ? (source.slots as DoctorShiftSlot[])
    : [];

  const availableSlotsFromArray = slots.filter((slot) => {
    const status = (slot.status ?? slot.slotStatus ?? "").toUpperCase();
    return status === "AVAILABLE" || status === "FREE";
  }).length;

  const totalSlotsFromArray = slots.length;

  const rawAvailableSlots = (source as ExtendedShift).availableSlots;
  const availableSlotsFallback: number =
    typeof rawAvailableSlots === "number"
      ? rawAvailableSlots
      : typeof source.maxPatients === "number"
      ? source.maxPatients
      : 0;

  const totalSlotsFallback: number =
    typeof source.maxPatients === "number" ? source.maxPatients : totalSlotsFromArray;

  const totalSlots = totalSlotsFromArray > 0 ? totalSlotsFromArray : totalSlotsFallback;

  const availableSlots =
    totalSlotsFromArray > 0
      ? availableSlotsFromArray
      : Math.min(availableSlotsFallback, totalSlots);

  return {
    id: Number(source.id),
    name,
    start,
    end,
    label,
    availableSlots: Math.max(0, availableSlots),
    totalSlots: Math.max(totalSlots, 0),
  };
}

export default function Step2DateTime() {
  const { state, dispatch } = useAppt();
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);

  const isOnline = state.appointmentType === "ONLINE";

  useEffect(() => {
    if (!state.appointmentType) {
      dispatch({ type: "SET_APPOINTMENT_TYPE", value: "ONSITE" });
    }
  }, [dispatch, state.appointmentType]);

  useEffect(() => {
    if (state.appointmentType && !state.dateISO) {
      dispatch({ type: "SET_DATE", value: formatISO(new Date()) });
    }
  }, [dispatch, state.appointmentType, state.dateISO]);

  const initialMonth = parseISO(state.dateISO) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1)
  );

  useEffect(() => {
    if (!state.doctorId || !state.dateISO) {
      setShifts([]);
      return;
    }
    let on = true;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchShiftsByDoctorAndDate(state.doctorId!, state.dateISO);
        if (!on) return;
        setShifts(data.map(normalizeShift));
      } catch (error) {
        if (on) setShifts([]);
        console.error("Failed to load shifts", error);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [state.doctorId, state.dateISO]);

  useEffect(() => {
    const parsed = parseISO(state.dateISO);
    if (!parsed) return;
    setVisibleMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }, [state.dateISO]);

  const grouped = useMemo(
    () => ({
      MORNING: shifts.filter((s) => s.name === "MORNING"),
      AFTERNOON: shifts.filter((s) => s.name === "AFTERNOON"),
      EVENING: shifts.filter((s) => s.name === "EVENING"),
    }),
    [shifts]
  );

  const calendarWeeks = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const month = start.getMonth();
    const year = start.getFullYear();
    const firstDayIndex = start.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = formatISO(today);

    const cells: CalendarCell[] = [];

    for (let i = 0; i < 42; i += 1) {
      const dayNumber = i - firstDayIndex + 1;
      const date =
        dayNumber <= 0
          ? new Date(year, month - 1, prevMonthDays + dayNumber)
          : dayNumber > daysInMonth
          ? new Date(year, month + 1, dayNumber - daysInMonth)
          : new Date(year, month, dayNumber);

      const iso = formatISO(date);
      const isCurrentMonth = date.getMonth() === month;
      const isSelected = state.dateISO === iso;
      const isToday = iso === todayIso;
      const isDisabled = !isCurrentMonth || iso < todayIso;

      cells.push({
        key: `${iso}-${i}`,
        iso,
        label: String(date.getDate()),
        isCurrentMonth,
        isSelected,
        isToday,
        isDisabled,
      });
    }

    const weeks: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [state.dateISO, visibleMonth]);

  const canNext = Boolean(state.appointmentType && state.dateISO && state.shiftId);

  const handleSelectDate = useCallback(
    (cell: CalendarCell) => {
      if (cell.isDisabled) return;
      dispatch({ type: "SET_DATE", value: cell.iso });
    },
    [dispatch]
  );

  const handleMonthChange = useCallback(
    (offset: number) => {
      setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    },
    []
  );

  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [visibleMonth]
  );

  return (
    <div className="appt-card p-4">
      <Row className="g-4">
        <Col lg={5} xl={4}>
          <Card className="appt-inner-card h-100">
            <Card.Body>
              <div className="doctor-preview">
                <div className="doctor-preview__photo">
                  {getDoctorImagePathWithFallback(state.doctorFullName) ? (
                    <img
                      src={getDoctorImagePathWithFallback(state.doctorFullName)!}
                      alt={state.doctorFullName || "Doctor"}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const placeholder = target.parentElement?.querySelector('.doctor-preview-placeholder');
                        if (placeholder) {
                          (placeholder as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className="doctor-preview-placeholder"
                    style={{ 
                      display: getDoctorImagePathWithFallback(state.doctorFullName) ? 'none' : 'flex',
                      width: '100%',
                      height: '200px',
                      backgroundColor: '#e9ecef',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6c757d',
                      fontSize: '48px',
                      fontWeight: 'bold',
                      borderRadius: '8px'
                    }}
                  >
                    {state.doctorFullName?.charAt(0)?.toUpperCase() || 'BS'}
                  </div>
                </div>
                <div className="doctor-preview__info">
                  <div className="doctor-preview__name">
                    {state.doctorFullName}
                    {state.doctorDegree ? ` - ${state.doctorDegree}` : ""}
                  </div>
                  <div className="doctor-preview__specialty">
                    {state.specialtyName || "Chuyên khoa"}
                  </div>
                  <div className="doctor-preview__meta">
                    {state.doctorExperience || "Kinh nghiệm chưa cập nhật"}
                  </div>
                  <div className="doctor-preview__description mt-3">
                    {state.doctorDescription || "Mô tả đang cập nhật."}
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7} xl={8}>
          <Card className="appt-inner-card mb-4">
            <Card.Body>
              <div className="appt-heading mb-3">Hình thức khám bệnh</div>
              <Row className="g-3">
                {(["ONSITE", "ONLINE"] as const).map((type) => {
                  const active = state.appointmentType === type;
                  return (
                    <Col md={6} key={type}>
                      <Card
                        role="button"
                        className={`select-type ${active ? "active" : ""}`}
                        onClick={() => {
                          dispatch({ type: "SET_APPOINTMENT_TYPE", value: type });
                          dispatch({ type: "SET_SHIFT", id: null });
                        }}
                      >
                        <Card.Body className="text-center fw-medium">
                          {type === "ONSITE" ? "Khám trực tiếp" : "Khám trực tuyến"}
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </Card.Body>
          </Card>

          <Card className="appt-inner-card">
            <Card.Body>
              <div className="appt-heading mb-3">Ngày &amp; Thời gian</div>
              {isOnline && (
                <div className="appt-times__note appt-times__note--info">
                  Sau khi hoàn tất thanh toán, bạn sẽ nhận đường link phòng khám trực tuyến
                  qua email/SMS.
                </div>
              )}
              <div className="d-flex flex-column flex-xl-row gap-4">
                <div className="appt-calendar flex-grow-1">
                  <div className="appt-calendar__header">
                    <button
                      type="button"
                      className="appt-calendar__nav-btn"
                      onClick={() => handleMonthChange(-1)}
                    >
                      ‹
                    </button>
                    <div className="appt-calendar__month">{monthLabel}</div>
                    <button
                      type="button"
                      className="appt-calendar__nav-btn"
                      onClick={() => handleMonthChange(1)}
                    >
                      ›
                    </button>
                  </div>
                  <div className="appt-calendar__weekdays">
                    {WEEKDAY_LABELS.map((day) => (
                      <div key={day} className="appt-calendar__weekday">
                        {day}
                      </div>
                    ))}
                  </div>
                  {calendarWeeks.map((week, index) => (
                    <div key={`week-${index}`} className="appt-calendar__week">
                      {week.map((cell) => (
                        <button
                          key={cell.key}
                          type="button"
                          className={[
                            "appt-calendar__cell",
                            !cell.isCurrentMonth ? "muted" : "",
                            cell.isSelected ? "selected" : "",
                            cell.isToday ? "today" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => handleSelectDate(cell)}
                          disabled={cell.isDisabled}
                        >
                          {cell.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="appt-times">
                  {loading && (
                    <div className="appt-times__note">
                      <Spinner size="sm" /> Đang tải ca khám…
                    </div>
                  )}
                  {!loading && !state.dateISO && (
                    <div className="appt-times__note">
                      Vui lòng chọn ngày để xem ca khám trống.
                    </div>
                  )}
                  {!loading && state.dateISO && shifts.length === 0 && (
                    <div className="appt-times__note">
                      Không có ca làm việc cho ngày này.
                    </div>
                  )}
                  {!loading && shifts.length > 0 && (
                    <div className="appt-time-groups">
                      {(["MORNING", "AFTERNOON", "EVENING"] as const).map((group) => {
                        const items = grouped[group];
                        if (items.length === 0) {
                          return (
                            <div className="appt-time-group" key={group}>
                              <div className="appt-time-group__title">
                                {group === "MORNING"
                                  ? "Morning"
                                  : group === "AFTERNOON"
                                  ? "Afternoon"
                                  : "Evening"}
                              </div>
                              <div className="appt-time-empty">Không có ca trống.</div>
                            </div>
                          );
                        }
                        return (
                          <div className="appt-time-group" key={group}>
                            <div className="appt-time-group__title">
                              {group === "MORNING"
                                ? "Morning"
                                : group === "AFTERNOON"
                                ? "Afternoon"
                                : "Evening"}
                            </div>
                            <div className="appt-time-chip-group">
                              {items.map((slot) => {
                                const active = state.shiftId === slot.id;
                                const disabled = slot.availableSlots <= 0;
                                return (
                                  <button
                                    key={slot.id}
                                    className={[
                                      "slot-chip",
                                      active ? "active" : "",
                                      disabled ? "disabled" : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    disabled={disabled}
                                    onClick={() => {
                                      if (disabled) return;
                                      dispatch({
                                        type: "SET_SHIFT",
                                        id: slot.id,
                                        name: slot.label,
                                        start: slot.start !== "--:--" ? slot.start : undefined,
                                        end: slot.end !== "--:--" ? slot.end : undefined,
                                        shiftName: slot.name,
                                        availableSlots: slot.availableSlots,
                                        totalSlots: slot.totalSlots,
                                      });
                                    }}
                                  >
                                    <div>{slot.label}</div>
                                    <small>
                                      {slot.availableSlots}/{slot.totalSlots} chỗ trống
                                    </small>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="appt-bottom">
        <button className="btn-back" onClick={() => dispatch({ type: "SET_STEP", step: 1 })}>
          Quay lại
        </button>
        <button
          className="btn-next"
          disabled={!canNext}
          onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
        >
          Tiếp tục
        </button>
      </div>
    </div>
  );
}