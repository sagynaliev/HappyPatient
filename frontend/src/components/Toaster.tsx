import { useEffect, useRef, useState } from "react";
import { dismissToast, subscribeToasts, Toast } from "../lib/toast";
import { Icon, IconName } from "./Icons";
import "../styles/toast.css";

const icons: Record<Toast["tone"], IconName> = { neutral: "info", info: "bell", success: "check-double", warning: "warning", error: "ban" };

function ToastItem({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dismissToast(toast.id), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [paused, toast.id]);
  const urgent = toast.tone === "error" || toast.tone === "warning";
  return (
    <div
      className={`hp-toast is-${toast.tone}`}
      role={urgent ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    >
      <span className="hp-toast-icon" aria-hidden="true"><Icon name={icons[toast.tone]} size={22} /></span>
      <div className="hp-toast-copy">
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
      </div>
      <button className="hp-toast-close" type="button" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}><Icon name="close" size={18} /></button>
    </div>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  return (
    <div className="hp-toaster" aria-live="polite">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
    </div>
  );
}
