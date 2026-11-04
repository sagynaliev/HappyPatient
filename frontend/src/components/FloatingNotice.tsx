import { useEffect, useRef, useState } from "react";
import "../styles/floatingNotice.css";
import type { ToastTone } from "../lib/toast";
import { Icon, IconName } from "./Icons";

// Same look as the app toasts, with room for action buttons.
const icons: Record<ToastTone, IconName> = { neutral: "info", info: "bell", success: "check-double", warning: "warning", error: "ban" };

export type FloatingNoticeAction = { label: string; onClick: () => void; variant?: "primary" | "outline" };

export function FloatingNotice({
  title,
  message,
  actions = [],
  timeoutMs = 12_000,
  onTimeout,
  onClose,
  pauseOnInteraction = true,
  tone = "success",
}: {
  title: string;
  message?: string;
  actions?: FloatingNoticeAction[];
  timeoutMs?: number;
  onTimeout?: () => void;
  onClose?: () => void;
  pauseOnInteraction?: boolean;
  tone?: ToastTone;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(timeoutMs);
  const timerStarted = useRef(0);
  const callbacks = useRef({ onTimeout, onClose });
  callbacks.current = { onTimeout, onClose };

  useEffect(() => {
    if (paused || timeoutMs <= 0) return;
    timerStarted.current = Date.now();
    const timer = window.setTimeout(() => {
      if (callbacks.current.onTimeout) callbacks.current.onTimeout();
      else callbacks.current.onClose?.();
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - timerStarted.current));
    };
  }, [paused, timeoutMs]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      className={`floating-notice is-${tone}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => { if (pauseOnInteraction) setPaused(true); }}
      onMouseLeave={() => { if (pauseOnInteraction) setPaused(false); }}
      onFocus={() => { if (pauseOnInteraction) setPaused(true); }}
      onBlur={(event) => {
        if (pauseOnInteraction && !event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <span className="floating-notice-icon" aria-hidden="true"><Icon name={icons[tone]} size={22} /></span>
      <div className="floating-notice-copy">
        <strong>{title}</strong>
        {message && <p>{message}</p>}
      </div>
      {actions.length > 0 && <div className="floating-notice-actions">{actions.map((action) => (
        <button key={action.label} className={`floating-notice-action is-${action.variant ?? "outline"}`} type="button" onClick={action.onClick}>{action.label}</button>
      ))}</div>}
      {onClose && <button className="floating-notice-close" type="button" aria-label="Close notification" onClick={onClose}><Icon name="close" size={18} /></button>}
    </section>
  );
}
