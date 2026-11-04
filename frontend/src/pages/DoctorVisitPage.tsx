import { FormEvent, lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authApi, DoctorProfile, ScheduleSlot } from "../lib/api";
import { clock, dayKey, formatInClinic } from "../lib/almaty";
import { toast } from "../lib/toast";
import { Icon } from "../components/Icons";
import { patientName, slotKind } from "./DoctorSchedulePage";
import "../styles/doctorWorkspace.css";

const MedicalHistory = lazy(() => import("../components/MedicalHistory"));
const reference = (slotId: string) => `HP-${slotId.slice(-8).toUpperCase()}`;
const longDay = (value: string) => formatInClinic(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = (value: string) => formatInClinic(value, { day: "numeric", month: "short", year: "numeric" });
const statusText = { booked: "Booked", arrived: "Checked in", free: "Free", blocked: "Blocked" } as const;

/** One visit: patient, visit facts and the medical notes, opened from the schedule. */
export default function DoctorVisitPage() {
  const { slotId = "" } = useParams();
  const [slot, setSlot] = useState<ScheduleSlot | null>(null);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [history, setHistory] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ slot: details }, { doctor: profile }] = await Promise.all([authApi.slotDetails(slotId), authApi.doctorProfile()]);
      setSlot(details);
      setDoctor(profile);
      const schedule = await authApi.getSchedule(profile.id);
      setHistory(schedule.slots.filter((item) => details.patient && item.patient?.id === details.patient.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This visit could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [slotId]);

  useEffect(() => { void load(); }, [load]);

  async function cancelVisit(event: FormEvent) {
    event.preventDefault();
    if (!slot || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await authApi.updateSlot(slot.id, { status: "FREE", releaseBooking: true, cancellationReason: reason.trim() });
      toast.error("Visit cancelled", "The patient was told why and the time is free again.");
      setCancelling(false);
      setReason("");
      await load();
    } catch (caught) {
      toast.error("Visit not cancelled", caught instanceof Error ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="dw-page"><p className="dw-muted" role="status">Loading visit…</p></div>;
  if (error || !slot) {
    return (
      <div className="dw-page">
        <Link className="dw-back" to="/doctor/schedule">← Schedule</Link>
        <div className="dw-alert" role="alert"><span>{error || "Visit not found."}</span><button type="button" className="dw-mini" onClick={() => void load()}>Retry</button></div>
      </div>
    );
  }

  const kind = slotKind(slot);
  const now = Date.now();
  const started = Date.parse(slot.startAt) <= now;
  const canWriteNotes = slot.status === "OCCUPIED" && Boolean(slot.patient) && started;
  const canReadHistory = canWriteNotes || (slot.status === "BOOKED" && !started);
  const canCancel = slot.status === "BOOKED" && !started;
  const past = history.filter((item) => item.id !== slot.id && Date.parse(item.startAt) < now);
  const next = history.find((item) => item.id !== slot.id && Date.parse(item.startAt) > now);
  const initials = slot.patient ? `${slot.patient.firstName[0] ?? ""}${slot.patient.lastName[0] ?? ""}` : "—";
  const notesHint = slot.status === "BOOKED" && started
    ? "The patient has not checked in yet. Notes open once the front desk confirms arrival."
    : slot.status === "BOOKED"
      ? "You can read the history now. Notes open after the visit starts and the patient checks in."
      : "";

  return (
    <div className="dw-page">
      <Link className="dw-back" to={`/doctor/schedule?date=${dayKey(slot.startAt)}`}>← Schedule</Link>

      <header className="dw-card dw-visit-head">
        <div className="dw-visit-title">
          <span className="dw-visit-icon" aria-hidden="true"><Icon name="stethoscope" size={24} /></span>
          <div>
            <p className="dw-eyebrow">Visit · {reference(slot.id)}</p>
            <h1>{slot.patient ? patientName(slot) : "No patient"}</h1>
            <p className="dw-visit-meta">
              <span><Icon name="calendar" size={15} /> {longDay(slot.startAt)}</span>
              <span><Icon name="clock" size={15} /> {clock(slot.startAt)}–{clock(slot.endAt)}</span>
              {slot.checkedInAt && <span><Icon name="check" size={15} /> Arrived {clock(slot.checkedInAt)}</span>}
            </p>
          </div>
        </div>
        <div className="dw-visit-actions">
          <span className={`dw-pill is-${kind}`}>{statusText[kind]}</span>
          {canCancel && !cancelling && <button type="button" className="dw-mini is-danger" onClick={() => setCancelling(true)}>Cancel visit</button>}
        </div>
        {cancelling && (
          <form className="dw-cancel" onSubmit={cancelVisit}>
            <label htmlFor="dw-cancel-reason">Why are you cancelling? The patient will see this.</label>
            <textarea id="dw-cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={300} rows={2} required disabled={busy} />
            <div className="dw-cancel-actions">
              <button type="submit" className="dw-button is-danger" disabled={busy || reason.trim().length < 3}>{busy ? "Cancelling…" : "Cancel visit"}</button>
              <button type="button" className="dw-mini" onClick={() => { setCancelling(false); setReason(""); }} disabled={busy}>Keep visit</button>
            </div>
          </form>
        )}
      </header>

      <div className="dw-visit-grid">
        <aside className="dw-visit-side">
          <section className="dw-card dw-patient-card" aria-labelledby="dw-patient-title">
            <h2 id="dw-patient-title">Patient</h2>
            <div className="dw-patient-id">
              <span className="dw-avatar is-large" aria-hidden="true">{initials}</span>
              <div><strong>{slot.patient ? patientName(slot) : "Not assigned"}</strong><small>{slot.patient?.email ?? "Email not available"}</small></div>
            </div>
            <dl className="dw-facts">
              <div><dt>Visits with you</dt><dd>{history.length}</dd></div>
              <div><dt>Last visit</dt><dd>{past.length ? shortDay(past[past.length - 1].startAt) : "First visit"}</dd></div>
              <div><dt>Next visit</dt><dd>{next ? `${shortDay(next.startAt)}, ${clock(next.startAt)}` : "None booked"}</dd></div>
            </dl>
          </section>

          <section className="dw-card" aria-labelledby="dw-details-title">
            <h2 id="dw-details-title">Visit details</h2>
            <dl className="dw-facts">
              <div><dt>Reason</dt><dd>{slot.visitPurpose || "Not provided"}</dd></div>
              <div><dt>Consultation</dt><dd>{doctor?.category.name ?? "Visit"} · in person · {Math.round((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000)} min</dd></div>
              <div><dt>Office</dt><dd>{doctor?.office || "Not listed"}</dd></div>
              <div><dt>Booking ID</dt><dd>{reference(slot.id)}</dd></div>
              <div><dt>Status</dt><dd>{statusText[kind]}</dd></div>
            </dl>
          </section>
        </aside>

        <section className="dw-notes" aria-label="Medical notes">
          {notesHint && <p className="dw-notice"><Icon name="info" size={18} /> {notesHint}</p>}
          {slot.patient && canReadHistory ? (
            <Suspense fallback={<p className="dw-muted" role="status">Loading medical history…</p>}>
              <MedicalHistory key={slot.id} patientId={slot.patient.id} appointmentId={canWriteNotes ? slot.id : undefined} />
            </Suspense>
          ) : !notesHint && <p className="dw-notice"><Icon name="info" size={18} /> Medical history is available for booked and checked-in visits only.</p>}
        </section>
      </div>
    </div>
  );
}
