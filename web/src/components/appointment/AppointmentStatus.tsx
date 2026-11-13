import { Badge } from "react-bootstrap";

/** ==== Public API (reuse across pages) ==== */
export type UiStatus =
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "CHECK_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "RESCHEDULED"
  | "EXPIRED"
  | "NO_SHOW";

export const STATUS_OPTIONS: UiStatus[] = [
  "PENDING_CONFIRM",
  "CONFIRMED",
  "CHECK_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "RESCHEDULED",
  "EXPIRED",
  "NO_SHOW",
];

// normalize servers' variants to UiStatus (Frontend format)
export function normStatus(s?: string): UiStatus {
  const up = (s || "").toUpperCase().trim();
  if (["PENDING_CONFIRM", "PENDING_CONFIRMATION"].includes(up)) return "PENDING_CONFIRM";
  if (["CHECK_IN", "CHECKED_IN"].includes(up)) return "CHECK_IN";
  if (["RESCHEDULED", "RESHEDULED"].includes(up)) return "RESCHEDULED";
  if (["EXPIRED"].includes(up)) return "EXPIRED";
  if (["NO_SHOW"].includes(up)) return "NO_SHOW";
  if (STATUS_OPTIONS.includes(up as UiStatus)) return up as UiStatus;
  return "PENDING_CONFIRM";
}

// convert UiStatus (Frontend format) to Backend format
export function toBackendStatus(uiStatus: UiStatus): string {
  const mapping: Record<UiStatus, string> = {
    PENDING_CONFIRM: "PENDING_CONFIRMATION",
    CONFIRMED: "CONFIRMED",
    CHECK_IN: "CHECKED_IN",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    RESCHEDULED: "RESCHEDULED",
    EXPIRED: "EXPIRED",
    NO_SHOW: "NO_SHOW",
  };
  return mapping[uiStatus] || uiStatus;
}

export const statusLabel: Record<UiStatus, string> = {
  PENDING_CONFIRM: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  CHECK_IN: "Đã có mặt",
  IN_PROGRESS: "Đang khám",
  COMPLETED: "Đã xong",
  CANCELLED: "Đã hủy",
  RESCHEDULED: "Đã đổi lịch",
  EXPIRED: "Quá hạn",
  NO_SHOW: "Không đến",
};

export type Tone = "green" | "blue" | "purple" | "teal" | "red" | "gray";
export const statusTone: Record<UiStatus, Tone> = {
  COMPLETED: "green",
  CONFIRMED: "blue",
  CHECK_IN: "purple",
  IN_PROGRESS: "teal",
  CANCELLED: "red",
  PENDING_CONFIRM: "blue",
  RESCHEDULED: "gray",
  EXPIRED: "gray",
  NO_SHOW: "red",
};

/** ==== UI Component ==== */
type Props = {
  status: UiStatus;
  /** if true, wraps label in a light Badge like the mock */
  withBadge?: boolean;
  /** extra class on container */
  className?: string;
};

export default function AppointmentStatus({ status, withBadge = true, className = "" }: Props) {
  const tone = statusTone[status];
  const label = statusLabel[status];

  const content = (
    <>
      <span className={`status-dot ${tone} me-2`} />
      <span>{label}</span>
    </>
  );

  return withBadge ? (
    <Badge bg="light" text="dark" className={className}>
      {content}
    </Badge>
  ) : (
    <span className={className}>{content}</span>
  );
}
