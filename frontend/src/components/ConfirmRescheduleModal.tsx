import { ReactNode, useEffect, useId, useRef } from "react";

type ConfirmRescheduleModalProps = {
  open: boolean;
  onClose: () => void;
  originalTitle?: string;
  notice?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function ConfirmRescheduleModal({
  open,
  onClose,
  originalTitle = "Confirm reschedule and remove block?",
  notice = "The visit will be moved to 23 Oct, 11:00 and marked pending confirmation. Available slot on 22 Oct will be removed.",
  children,
  footer,
}: ConfirmRescheduleModalProps) {
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
            <h2 id={titleId}>{originalTitle}</h2>
          </div>
          <button ref={closeButtonRef} className="availability-dialog-close" type="button" aria-label="Close reschedule confirmation dialog" onClick={onClose}>×</button>
        </header>

        <div className="availability-dialog-form">
          <div className="provider-summary-box">22 Oct · 10:30–11:00 · UTC+5 · Dr. Aigerim Sadykova · Qamqor Dental · 18,000 KZT</div>
          {children ?? (
            <label className="provider-checkbox-row">
              <input type="checkbox" defaultChecked />
              <span>Send notification option for patient confirmation.</span>
            </label>
          )}
          <div className="provider-info-banner">{notice}</div>
          {footer ?? (
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={onClose}>Go back</button>
              <button className="button" type="button">Confirm &amp; Remove Block</button>
            </footer>
          )}
        </div>
      </section>
    </div>
  );
}
