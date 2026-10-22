import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ScheduleSlot } from "../lib/api";
import "../styles/slotManagementModal.css";

type SlotManagementModalProps = {
  slot: ScheduleSlot;
  busy: boolean;
  loading: boolean;
  error: string;
  message: string;
  patientId: string;
  visitPurpose: string;
  confirmingRelease: boolean;
  onClose: () => void;
  onPatientIdChange: (value: string) => void;
  onVisitPurposeChange: (value: string) => void;
  onUpdate: (status: ScheduleSlot["status"], releaseBooking?: boolean, cancellationReason?: string) => void;
  onConfirmRelease: () => void;
};

const time = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(value));

const date = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date(value));

const statusLabel: Record<ScheduleSlot["status"], string> = {
  FREE: "Free",
  BOOKED: "Booked",
  OCCUPIED: "Occupied",
};

export function SlotManagementModal({
  slot,
  busy,
  loading,
  error,
  message,
  patientId,
  visitPurpose,
  confirmingRelease,
  onClose,
  onPatientIdChange,
  onVisitPurposeChange,
  onUpdate,
  onConfirmRelease,
}: SlotManagementModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
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

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate("BOOKED");
  }

  return (
    <div
      className="slot-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="slot-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || loading}
        onKeyDown={handleKeyDown}
      >
        <header className="slot-modal-header">
          <div>
            <p className="eyebrow">Schedule slot · Asia/Almaty (UTC+5)</p>
            <h2 id={titleId}>Manage appointment slot</h2>
          </div>
          <button ref={closeButtonRef} className="slot-modal-close" type="button" aria-label="Close slot details" disabled={busy} onClick={onClose}>×</button>
        </header>

        <div className="slot-modal-content">
          <dl className="slot-modal-summary">
            <div><dt>Date</dt><dd>{date(slot.startAt)}</dd></div>
            <div><dt>Time</dt><dd>{time(slot.startAt)}–{time(slot.endAt)}</dd></div>
            <div><dt>Status</dt><dd><span className={`slot-status ${slot.status.toLowerCase()}`}>{statusLabel[slot.status]}</span></dd></div>
            {slot.status === "BOOKED" && (
              <>
                <div><dt>Patient</dt><dd>{loading ? "Loading…" : slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : "Patient details unavailable"}</dd></div>
                <div><dt>Visit reason</dt><dd>{loading ? "Loading…" : slot.visitPurpose || "Not provided"}</dd></div>
              </>
            )}
          </dl>

          {loading && <p className="slot-modal-message" role="status">Loading slot details…</p>}
          {error && <p className="slot-modal-error" role="alert">{error}</p>}
          {message && <p className="slot-modal-success" role="status">{message}</p>}

          {!loading && !error && slot.status === "FREE" && (
            <>
              <button className="button button-outline" type="button" disabled={busy} onClick={() => onUpdate("OCCUPIED")}>
                {busy ? "Updating…" : "Mark as occupied"}
              </button>
              <form className="slot-modal-booking-form" onSubmit={submitBooking}>
                <h3>Book this slot</h3>
                <label htmlFor="slot-patient-id">Patient account ID</label>
                <input id="slot-patient-id" value={patientId} onChange={(event) => onPatientIdChange(event.target.value)} required disabled={busy} />
                <label htmlFor="slot-visit-purpose">Visit reason</label>
                <input id="slot-visit-purpose" value={visitPurpose} onChange={(event) => onVisitPurposeChange(event.target.value)} maxLength={300} required disabled={busy} />
                <button className="button" type="submit" disabled={busy || !patientId.trim() || !visitPurpose.trim()}>{busy ? "Saving…" : "Book slot"}</button>
              </form>
            </>
          )}

          {!loading && !error && slot.status === "OCCUPIED" && (
            <button className="button button-outline" type="button" disabled={busy} onClick={() => onUpdate("FREE")}>
              {busy ? "Updating…" : "Mark as available"}
            </button>
          )}

          {!loading && !error && slot.status === "BOOKED" && !confirmingRelease && (
            <button className="button button-outline slot-modal-release" type="button" disabled={busy} onClick={onConfirmRelease}>
              Release appointment…
            </button>
          )}
          {!loading && !error && slot.status === "BOOKED" && confirmingRelease && (
            <ReleaseConfirmation busy={busy} onKeep={onConfirmRelease} onRelease={(reason) => onUpdate("FREE", true, reason)} />
          )}
        </div>
      </section>
    </div>
  );
}

const RELEASE_REASONS = ["Doctor is unavailable", "Emergency at the clinic", "Schedule changed"];

function ReleaseConfirmation({ busy, onKeep, onRelease }: { busy: boolean; onKeep: () => void; onRelease: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <div className="slot-modal-confirm-release" role="group" aria-label="Confirm appointment release">
      <p>This will cancel the booked visit and make the time available again. The patient will see your reason.</p>
      <div className="slot-modal-reason-chips">
        {RELEASE_REASONS.map((option) => (
          <button key={option} type="button" className={`slot-modal-chip${reason === option ? " is-selected" : ""}`} onClick={() => setReason(option)} disabled={busy}>{option}</button>
        ))}
      </div>
      <label className="slot-modal-reason">
        <span>Reason for cancelling</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={2} placeholder="Choose above or write your own reason" disabled={busy} />
      </label>
      <button className="button button-outline" type="button" disabled={busy} onClick={onKeep}>Keep appointment</button>
      <button className="button slot-modal-release" type="button" disabled={busy || trimmed.length < 3} onClick={() => onRelease(trimmed)}>
        {busy ? "Releasing…" : "Confirm release"}
      </button>
    </div>
  );
}
