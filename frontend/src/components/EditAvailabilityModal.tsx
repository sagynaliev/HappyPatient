import { ReactNode, useEffect, useId, useRef } from "react";

type EditAvailabilityModalProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  warning?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
};

export function EditAvailabilityModal({
  open,
  busy = false,
  onClose,
  title = "Edit availability",
  subtitle = "Doctor schedule · Asia/Almaty (UTC+5)",
  warning,
  children,
  footer,
}: EditAvailabilityModalProps) {
  const titleId = useId();
  const descId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return (
    <div className="availability-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="availability-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <header className="availability-dialog-header">
          <div>
            <p className="availability-dialog-eyebrow">{subtitle}</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descId}>Update the selected working block and review any conflicts before saving.</p>
          </div>
          <button ref={closeButtonRef} className="availability-dialog-close" type="button" aria-label="Close edit availability dialog" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="availability-dialog-form">
          {warning && (
            <div className="provider-warning-banner" role="alert">
              <span aria-hidden="true">⚠</span>
              <div>{warning}</div>
            </div>
          )}
          {children}
          {footer ?? (
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="button" type="button" disabled={busy}>Save changes</button>
            </footer>
          )}
        </div>
      </section>
    </div>
  );
}
