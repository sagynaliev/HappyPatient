import { ReactNode, useEffect, useId, useRef } from "react";

type AddTimeOffModalProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function AddTimeOffModal({
  open,
  busy = false,
  onClose,
  title = "Add time off",
  subtitle = "Doctor schedule · UTC+5",
  children,
  footer,
}: AddTimeOffModalProps) {
  const titleId = useId();
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
      <section className="availability-dialog provider-dialog-compact" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="availability-dialog-header">
          <div>
            <p className="availability-dialog-eyebrow">{subtitle}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button ref={closeButtonRef} className="availability-dialog-close" type="button" aria-label="Close add time off dialog" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="availability-dialog-form">
          {children}
          <div className="provider-info-banner"><span aria-hidden="true">ⓘ</span> 1 recurring block affected. 2 available slots on 25–27 October. These pages will show unavailable for new bookings.</div>
          <label className="provider-checkbox-row"><input type="checkbox" defaultChecked /> <span>Hide these dates from patient search.</span></label>
          {footer ?? (
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="button" type="button" disabled={busy}>Save time off</button>
            </footer>
          )}
        </div>
      </section>
    </div>
  );
}
