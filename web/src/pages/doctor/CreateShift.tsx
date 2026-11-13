import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { createShift, fetchMyShifts, type CreateShiftPayload, type DoctorShift, type ShiftType } from "../../api/shift";

const slotOrder: ShiftType[] = ["MORNING", "AFTERNOON", "EVENING"];
const shiftDisplayNames: Record<ShiftType, string> = {
  MORNING: "SÁNG",
  AFTERNOON: "CHIỀU",
  EVENING: "TỐI",
};
const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

function getISOWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
function formatDM(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export default function CreateShift() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Week picker
  const [dateStr, setDateStr] = useState<string>(toISO(new Date()));
  const monday = useMemo(() => getISOWeekStart(new Date(dateStr + "T00:00:00")), [dateStr]);
  const headers = useMemo(() => {
    const list: { iso: string; label: string; isPast: boolean }[] = [];
    const todayISO = toISO(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISO(d);
      list.push({ iso, label: `${days[i]} ${formatDM(d)}`, isPast: iso < todayISO });
    }
    return list;
  }, [monday]);

  // existing shifts to prevent duplicate registration
  const [existing, setExisting] = useState<Record<string, DoctorShift>>({});
  useEffect(() => {
    let alive = true;
    fetchMyShifts(undefined)
      .then((arr) => {
        if (!alive) return;
        const map: Record<string, DoctorShift> = {};
        for (const it of arr) {
          if (it.status === "CANCELLED") continue; // Cho phép đăng ký lại nếu ca đã bị hủy
          map[`${it.date}|${it.shift}`] = it;
        }
        setExisting(map);
      })
      .catch(() => {})
  ;
    return () => { alive = false; };
  }, []);

  // selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Tính số lượng tối đa cho phép dựa trên các ca được chọn:
  // Nếu chỉ chọn ca EVENING thì max là 9, ngược lại (chỉ MORNING/AFTERNOON hoặc hỗn hợp) là 12
  const maxAllowedForSelection = useMemo(() => {
    if (selected.size === 0) return 12;
    const shiftTypes = Array.from(selected).map((k) => k.split("|")[1] as ShiftType);
    const hasOnlyEvening = shiftTypes.every((s) => s === "EVENING");
    return hasOnlyEvening ? 9 : 12;
  }, [selected]);

  // common fields applied to all selected slots (mặc định 12)
  const [maxPatients, setMaxPatients] = useState<number>(12);
  const [note, setNote] = useState<string>("");
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false);
  const [repeatCount, setRepeatCount] = useState<number>(0); // 0..3

  // Tự động điều chỉnh khi thay đổi lựa chọn ca
  const toggleCell = (iso: string, shift: ShiftType, disabled: boolean) => {
    if (disabled) return;
    setSelected((prev) => {
      const key = `${iso}|${shift}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);

      // Cập nhật maxPatients phù hợp: nếu chỉ còn ca tối -> 9, nếu có ca sáng/chiều -> 12
      if (next.size > 0) {
        const types = Array.from(next).map((k) => k.split("|")[1]);
        const onlyEvening = types.every((t) => t === "EVENING");
        setMaxPatients((current) => {
          if (onlyEvening) return Math.min(current, 9);
          return current;
        });
      }
      return next;
    });
  };

  const weekRangeLabel = useMemo(() => {
    const start = new Date(monday);
    const end = new Date(monday);
    end.setDate(monday.getDate() + 6);
    return `${formatDM(start)} - ${formatDM(end)}`;
  }, [monday]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (selected.size === 0) {
      setError("Vui lòng chọn ít nhất 1 ca làm việc trong tuần này");
      return;
    }
    setSaving(true);
    try {
      for (const key of selected) {
        const [iso, s] = key.split("|");
        // Ca tối giới hạn max 9, ca sáng/chiều giới hạn max 12
        const slotShift = s as ShiftType;
        const effectiveMax = slotShift === "EVENING" ? Math.min(maxPatients, 9) : Math.min(maxPatients, 12);
        const payload: CreateShiftPayload = {
          date: iso,
          shift: slotShift,
          maxPatients: effectiveMax,
          note: note || undefined,
          repeatWeekly,
          repeatCount: repeatWeekly ? Math.max(0, Math.min(3, repeatCount)) : 0,
        };
        await createShift(payload);
      }
      navigate("/doctor/shifts", { replace: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h5 className="mb-3">Đăng ký lịch làm việc</h5>
      <Row className="align-items-center mb-3">
        <Col className="d-flex align-items-center gap-2">
          <Form.Control type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={{ maxWidth: 170 }} />
          <span className="text-muted small">({weekRangeLabel})</span>
        </Col>
        <Col className="text-end text-muted small">
          Không thể đăng ký cho ngày đã qua; ca đã có sẽ bị khóa.
        </Col>
      </Row>
      {error && <Card body className="border-danger-subtle text-danger mb-3">{error}</Card>}

      <Form onSubmit={onSubmit}>
        <div className="table-responsive mb-3">
          <table className="table table-bordered align-middle">
            <thead>
              <tr>
                <th style={{width: 120}}>Ca khám</th>
                {headers.map((h) => (
                  <th key={h.iso}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotOrder.map((slot) => (
                <tr key={slot}>
                  <td className="fw-semibold">{shiftDisplayNames[slot]}</td>
                  {headers.map((h) => {
                    const key = `${h.iso}|${slot}`;
                    const isExisting = Boolean(existing[key]);
                    const isDisabled = h.isPast || isExisting;
                    const isSelected = selected.has(key);
                    return (
                      <td key={h.iso} style={{height: 72}}>
                        {isExisting ? (
                          <span className="badge text-bg-secondary">Đã có</span>
                        ) : (
                          <Form.Check
                            type="checkbox"
                            id={key}
                            disabled={isDisabled}
                            checked={isSelected}
                            onChange={() => toggleCell(h.iso, slot, isDisabled)}
                            label={isDisabled ? "" : "Chọn"}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Row className="g-3">
          <Col md={4}>
            <Form.Group controlId="sMax">
              <Form.Label>
                Số bệnh nhân tối đa{" "}
                <span className="text-muted small">
                  (Mặc định & tối đa: {maxAllowedForSelection} lượt)
                </span>
              </Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={maxAllowedForSelection}
                value={maxPatients}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > maxAllowedForSelection) {
                    setMaxPatients(maxAllowedForSelection);
                  } else {
                    setMaxPatients(val);
                  }
                }}
              />
            </Form.Group>
          </Col>
          <Col md={8}>
            <Form.Group controlId="sNote">
              <Form.Label>Ghi chú</Form.Label>
              <Form.Control as="textarea" rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú áp dụng cho các ca đã chọn (tuỳ chọn)" />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Check
              type="checkbox"
              id="sRepeat"
              label="Áp dụng các ca đã chọn cho các tuần tiếp theo"
              checked={repeatWeekly}
              onChange={(e) => setRepeatWeekly(e.target.checked)}
            />
          </Col>
          {repeatWeekly && (
            <Col md={4}>
              <Form.Group controlId="sRepeatCount">
                <Form.Label>Số tuần áp dụng tiếp theo</Form.Label>
                <Form.Select value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))}>
                  <option value={0}>0 tuần</option>
                  <option value={1}>1 tuần</option>
                  <option value={2}>2 tuần</option>
                  <option value={3}>3 tuần</option>
                </Form.Select>
              </Form.Group>
            </Col>
          )}
        </Row>

        <div className="d-flex justify-content-end gap-2 mt-4">
          <Button variant="outline-secondary" onClick={() => navigate(-1)} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving || selected.size === 0}>{saving ? "Đang lưu..." : "Đăng ký"}</Button>
        </div>
      </Form>
    </>
  );
}
