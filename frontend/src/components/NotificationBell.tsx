import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotification, authApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { NotificationItem } from "./NotificationItem";
import { onNotificationsChanged } from "../lib/notificationEvents";
import "../styles/notificationBell.css";

const POLL_MS = 15_000;

export function NotificationBell() {
  const { user } = useAuth();
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

  async function markOneRead(id: string) {
    try { await authApi.markNotificationRead(id); const now = new Date().toISOString(); setNotifications(items => items.map(item => item.id === id ? { ...item, readAt: item.readAt ?? now } : item)); setUnreadCount(count => Math.max(0, count - (notifications.some(item => item.id === id && !item.readAt) ? 1 : 0))); } catch { /* preserve the unread state */ }
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
                <NotificationItem key={item.id} item={item} role={user?.role ?? "PATIENT"} onMarkRead={(id) => { void markOneRead(id); setOpen(false); }} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
