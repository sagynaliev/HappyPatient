import { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useId, useRef } from "react";

type AddAvailabilityModalProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  description?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children?: ReactNode;
  footer?: ReactNode;
};

export function AddAvailabilityModal({
  open,
  busy = false,
  onClose,
  title = "Add availability",
  subtitle = "Doctor schedule · Asia/Almaty (UTC+5)",
  description = "Choose working days and a time range for one selected week.",
  onSubmit,
  children,
  footer,
}: AddAvailabilityModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      className="availability-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="availability-dialog availability-dialog-add"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
      >
        <header className="availability-dialog-header">
          <div>
            <p className="availability-dialog-eyebrow">{subtitle}</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descId}>{description}</p>
          </div>
          <button
            ref={closeButtonRef}
            className="availability-dialog-close"
            type="button"
            aria-label="Close add availability dialog"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </header>

        <form className="availability-dialog-form availability-dialog-add-form" onSubmit={onSubmit ?? (() => undefined)}>
          {children}
          {footer ?? (
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="button" type="submit" disabled={busy}>Add availability</button>
            </footer>
          )}
        </form>
      </section>
    </div>
  );
}
