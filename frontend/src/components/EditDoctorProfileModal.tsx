import { ReactNode, useEffect, useId, useRef } from "react";

type EditDoctorProfileModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function EditDoctorProfileModal({
  open,
  onClose,
  title = "Edit doctor profile",
  subtitle = "Dr. Aigerim Sadykova",
  children,
  footer,
}: EditDoctorProfileModalProps) {
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
      <section className="availability-dialog provider-profile-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="availability-dialog-header">
          <div>
            <p className="availability-dialog-eyebrow">Doctor profile</p>
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button ref={closeButtonRef} className="availability-dialog-close" type="button" aria-label="Close doctor profile dialog" onClick={onClose}>×</button>
        </header>
        <div className="availability-dialog-form">{children}{footer ?? <footer className="availability-dialog-actions"><button className="button button-outline" type="button" onClick={onClose}>Cancel</button><button className="button" type="button">Save profile</button></footer>}</div>
      </section>
    </div>
  );
}
