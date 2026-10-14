import { ReactNode, useEffect, useId, useRef } from "react";

type ProtectConfirmedVisitModalProps = {
  open: boolean;
  onClose: () => void;
  patientName?: string;
  timeLabel?: string;
  serviceLabel?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function ProtectConfirmedVisitModal({
  open,
  onClose,
  patientName = "Amina N.",
  timeLabel = "10:30–11:00",
  serviceLabel = "Dental consultation · 18,000 KZT",
  children,
  footer,
}: ProtectConfirmedVisitModalProps) {
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
      <section className="availability-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="availability-dialog-header">
          <div>
            <p className="availability-dialog-eyebrow">Protected booking</p>
            <h2 id={titleId}>This time contains a confirmed visit</h2>
          </div>
          <button ref={closeButtonRef} className="availability-dialog-close" type="button" aria-label="Close protected booking dialog" onClick={onClose}>×</button>
        </header>

        <div className="availability-dialog-form">
          <div className="provider-warning-banner provider-warning-amber" role="alert">
            <span aria-hidden="true">⚠</span>
            <div>A confirmed booking is scheduled. Deleting availability does not cancel confirmed visits. Choose how to handle the affected visit.</div>
          </div>

          <div className="provider-booking-info">
            <div className="provider-booking-primary">
              <strong>{patientName}</strong>
              <span>{timeLabel}</span>
            </div>
            <span className="provider-status-badge">Confirmed</span>
            <p>{serviceLabel}</p>
          </div>

          {children}

          {footer ?? (
            <div className="provider-cta-stack">
              <button className="button" type="button">Reschedule &amp; Remove</button>
              <div className="provider-inline-actions">
                <button className="button button-outline" type="button" onClick={onClose}>Keep availability</button>
                <button className="button button-outline" type="button">Delete availability</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
