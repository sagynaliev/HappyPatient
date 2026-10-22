import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotification, authApi } from "../lib/api";
import { onNotificationsChanged } from "../lib/notificationEvents";
import "../styles/notificationBell.css";

const POLL_MS = 15_000;

function relativeTime(value: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(value)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(value));
}

type Kind = "booked" | "cancelled" | "checked-in" | "system" | "security";
function kindOf(type: string): Kind {
  if (type === "BOOKED") return "booked";
  if (type === "CANCELLED" || type === "APPOINTMENT_RELEASED") return "cancelled";
  if (type === "CHECKED_IN") return "checked-in";
  if (type === "PASSWORD_CHANGED") return "security";
  return "system";
}

const KIND_ICON: Record<Kind, string> = { booked: "✓", cancelled: "✕", "checked-in": "➜", system: "i", security: "!" };

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (): Promise<AppNotification[] | null> => {
    try {
      const result = await authApi.notifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount ?? result.notifications.filter((item) => !item.readAt).length);
      return result.notifications;
    } catch {
      return null; // the bell stays quiet if notifications cannot be loaded
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const unsubscribe = onNotificationsChanged(() => {
      void load();
      // notifications are recorded right after the action, so check again shortly
      window.setTimeout(() => void load(), 1500);
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  async function markAllRead() {
    try {
      await authApi.markNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
    } catch { /* keep the unread state if the request fails */ }
  }

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="notification-bell" ref={rootRef}>
      <button type="button" className="notification-bell-button" aria-label={label} aria-haspopup="true" aria-expanded={open} onClick={() => void toggle()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && <span className="notification-bell-badge" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel" role="dialog" aria-label="Notifications">
          <header className="notification-panel-header">
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-read" onClick={() => void markAllRead()}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 13 4 4 8-9M10 15l2 2 8-9" /></svg>
                Mark all as read
              </button>
            )}
          </header>
          {notifications.length === 0 ? (
            <p className="notification-panel-empty">No notifications yet. Booking, cancellation and check-in confirmations will appear here.</p>
          ) : (
            <ul className="notification-panel-list">
              {notifications.slice(0, 20).map((item) => (
                <li key={item.id} className={`notification-item notification-item--${kindOf(item.type)}${item.readAt ? "" : " is-unread"}`}>
                  <span className="notification-item-icon" aria-hidden="true">{KIND_ICON[kindOf(item.type)]}</span>
                  <div>
                    <strong>{item.subject}</strong>
                    <p>{item.message}</p>
                    <small>{relativeTime(item.createdAt)} · {item.channel === "email" ? (item.status === "DELIVERED" ? "Sent by email" : "Email failed") : "In-app"}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
