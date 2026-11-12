import { Link } from "react-router-dom";
import { AppNotification, Role } from "../lib/api";

export type NotificationKind = "booked" | "cancelled" | "checked-in" | "system" | "security";
export function kindOf(type: string): NotificationKind {
  if (type === "BOOKED") return "booked";
  if (type === "CANCELLED" || type === "APPOINTMENT_RELEASED") return "cancelled";
  if (type === "CHECKED_IN") return "checked-in";
  if (type === "PASSWORD_CHANGED") return "security";
  return "system";
}

const KIND_ICON: Record<NotificationKind, string> = { booked: "✓", cancelled: "✕", "checked-in": "➜", system: "i", security: "!" };
const destinationFor = (item: AppNotification, role: Role) => {
  if (role === "PATIENT" && item.type === "VISIT_MISSED") return "/appointments?tab=past";
  if (!item.slotId) return "/profile";
  if (role === "DOCTOR") return `/doctor/visits/${encodeURIComponent(item.slotId)}`;
  if (role === "FRONT_DESK") return "/front-desk";
  if (role === "ADMIN") return "/admin/appointments";
  return `/appointments?appointmentId=${encodeURIComponent(item.slotId)}`;
};
const relativeTime = (value: string) => {
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(value));
};

export function NotificationItem({ item, role, onMarkRead }: { item: AppNotification; role: Role; onMarkRead?: (id: string) => void }) {
  const kind = kindOf(item.type);
  const destination = destinationFor(item, role);
  const target = role === "PATIENT" && item.type === "VISIT_MISSED" ? "past appointments" : item.slotId ? "appointment" : "profile";
  const accessibleName = `${item.subject}. ${item.message}. Open ${target}.`;
  return (
    <li className={`notification-item notification-item--${kind}${item.readAt ? "" : " is-unread"}`}>
      <Link className="notification-item-link" to={destination} aria-label={accessibleName} onClick={() => onMarkRead?.(item.id)}>
        <span className="notification-item-icon" aria-hidden="true">{KIND_ICON[kind]}</span>
        <span className="notification-item-copy">
          <strong>{item.subject}</strong>
          <span>{item.message}</span>
          <small>{relativeTime(item.createdAt)} · {item.channel === "email" ? (item.status === "DELIVERED" ? "Sent by email" : "Email failed") : "In-app"}</small>
        </span>
      </Link>
      {!item.readAt && onMarkRead && <button type="button" className="notification-mark-read" onClick={() => onMarkRead(item.id)}>Mark as read</button>}
    </li>
  );
}
