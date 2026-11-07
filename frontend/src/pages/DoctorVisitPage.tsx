import { FormEvent, ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { authApi, DoctorProfile, ScheduleSlot } from "../lib/api";
import { clock, formatInClinic } from "../lib/almaty";
import { toast } from "../lib/toast";
import { Icon } from "../components/Icons";
import { patientName, slotKind } from "./DoctorSchedulePage";
import MedicalHistory, { MedicalEntry, MedicalNoteForm } from "../components/MedicalHistory";
import "../styles/medicalHistory.css";
import "../styles/doctorWorkspace.css";

// Same limit as the API: notes up to 24 hours after the visit ends.
const NOTE_WINDOW_MS = 24 * 60 * 60_000;
const reference = (slotId: string) => `HP-${slotId.slice(-8).toUpperCase()}`;
const shortWeekday = (value: string) => formatInClinic(value, { weekday: "short", day: "numeric", month: "short" });
const shortDay = (value: string) => formatInClinic(value, { day: "numeric", month: "short", year: "numeric" });
const statusText = { booked: "Booked", arrived: "Checked in", free: "Free", blocked: "Blocked" } as const;

/** One visit: patient and visit facts on top, the timeline below, and notes written in a pop-up. */
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
  const [notesTab, setNotesTab] = useState<"visit" | "earlier">("visit");
  const [earlierVisit, setEarlierVisit] = useState<string>("all");
  const [highlightId, setHighlightId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalEntry | null>(null);
  const [highlightLabel, setHighlightLabel] = useState("Just added");

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
        <div className="dw-alert" role="alert"><span>{error || "Visit not found."}</span><button type="button" className="dw-mini" onClick={() => void load()}>Retry</button></div>
      </div>
    );
  }

  const kind = slotKind(slot);
  const now = Date.now();
  const started = Date.parse(slot.startAt) <= now;
  const notesClosed = Date.parse(slot.endAt) < now - NOTE_WINDOW_MS;
  const canWriteNotes = slot.status === "OCCUPIED" && Boolean(slot.patient) && started && !notesClosed;
  const canReadHistory = canWriteNotes || (slot.status === "OCCUPIED" && Boolean(slot.patient)) || (slot.status === "BOOKED" && !started);
  const canCancel = slot.status === "BOOKED" && !started;
  const past = history.filter((item) => item.id !== slot.id && Date.parse(item.startAt) < now);
  // The visit on screen counts as the next one while it is still ahead.
  const next = history.filter((item) => item.status === "BOOKED" || item.status === "OCCUPIED").find((item) => Date.parse(item.startAt) > now);
  const initials = slot.patient ? `${slot.patient.firstName[0] ?? ""}${slot.patient.lastName[0] ?? ""}` : "—";
  const notesHint = notesClosed && slot.status === "OCCUPIED"
    ? "Notes for this visit closed 24 hours after it ended, so records are never backdated. Earlier notes stay readable."
    : slot.status === "BOOKED" && started
    ? "The patient has not checked in yet. Notes open once the front desk confirms arrival."
    : slot.status === "BOOKED"
      ? "Notes for this visit open after it starts and the patient checks in. Earlier records are under Earlier visits."
      : "";

  return (
    <div className="dw-page dw-visit-page">
      <header className="dw-card dw-visit-header">
        <div className="dw-visit-top">
          <span className="dw-avatar is-large" aria-hidden="true">{initials}</span>
          <div className="dw-visit-who">
            <p className="dw-eyebrow">Visit · {reference(slot.id)}</p>
            <h1>{slot.patient ? patientName(slot) : "No patient"}</h1>
            <span>{slot.patient?.email ?? "Email not available"}</span>
          </div>
        <div className="dw-visit-actions">
          <span className={`dw-pill is-${kind}`}>{statusText[kind]}</span>
          {canCancel && !cancelling && <button type="button" className="dw-mini is-danger" onClick={() => setCancelling(true)}>Cancel visit</button>}
        </div>
        </div>
        <div className="dw-visit-info">
          <section className="dw-info-group" aria-label="This visit">
            <h2>This visit</h2>
            <dl>
              <div><Icon name="calendar" size={18} /><dt>Date and time</dt><dd>{shortWeekday(slot.startAt)} · {clock(slot.startAt)}–{clock(slot.endAt)}{slot.checkedInAt && <small>Arrived {clock(slot.checkedInAt)}</small>}</dd></div>
              <div><Icon name="file" size={18} /><dt>Reason</dt><dd>{slot.visitPurpose || "Not provided"}</dd></div>
              <div><Icon name="stethoscope" size={18} /><dt>Consultation</dt><dd>{doctor?.category.name ?? "Visit"} · {Math.round((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000)} min</dd></div>
              <div><Icon name="pin" size={18} /><dt>Office</dt><dd>{doctor?.office || "Not listed"}</dd></div>
            </dl>
          </section>
          <section className="dw-info-group is-history" aria-label="With you">
            <h2>With you</h2>
            <dl>
              <div><Icon name="users" size={18} /><dt>Visits</dt><dd>{history.length}</dd></div>
              <div><Icon name="clock" size={18} /><dt>Last visit</dt><dd>{past.length ? shortDay(past[past.length - 1].startAt) : "First visit"}</dd></div>
              <div><Icon name="calendar" size={18} /><dt>Next visit</dt><dd>{next ? `${next.id === slot.id ? "This visit · " : ""}${shortDay(next.startAt)}, ${clock(next.startAt)}` : "None booked"}</dd></div>
            </dl>
          </section>
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

      <div className="dw-visit-work">
        <section className="dw-notes" aria-label="Medical notes">
          {slot.patient && canReadHistory ? <>
            <div className="dw-notes-bar">
              <div className="dw-segment" role="tablist" aria-label="Notes">
                <button type="button" role="tab" aria-selected={notesTab === "visit"} aria-pressed={notesTab === "visit"} onClick={() => setNotesTab("visit")}>This visit</button>
                <button type="button" role="tab" aria-selected={notesTab === "earlier"} aria-pressed={notesTab === "earlier"} onClick={() => setNotesTab("earlier")}>Earlier visits{past.length ? ` (${past.length})` : ""}</button>
              </div>
              {notesTab === "earlier" && (
                <label className="dw-earlier-select">
                  <span className="sr-only">Choose an earlier visit</span>
                  <select value={earlierVisit} onChange={(event) => setEarlierVisit(event.target.value)}>
                    <option value="all">All earlier records</option>
                    {past.slice().reverse().map((item) => <option key={item.id} value={item.id}>{shortDay(item.startAt)}, {clock(item.startAt)} · {item.visitPurpose || "Visit"}</option>)}
                  </select>
                </label>
              )}
            </div>
            {notesTab === "visit" && notesHint && <p className="dw-notice"><Icon name="info" size={18} /> {notesHint}</p>}
            {notesTab === "earlier" && <p className="dw-notice"><Icon name="info" size={18} /> Read-only. {earlierVisit === "all" ? "All records from earlier visits, including other doctors’ notes." : "Notes written during the selected visit."}</p>}
            <Suspense fallback={<p className="dw-muted" role="status">Loading medical history…</p>}>
              {notesTab === "visit"
                ? <MedicalHistory key={`visit-${slot.id}`} compact onAddNote={canWriteNotes ? () => setComposerOpen(true) : undefined} onEditEntry={canWriteNotes ? setEditing : undefined} highlightLabel={highlightLabel} patientId={slot.patient.id} scope={{ only: slot.id }} refreshKey={refresh} highlightId={highlightId} emptyText={{ title: "No notes for this visit yet", body: canWriteNotes ? "Use Add note to record tests, anamnesis or a conclusion." : "Notes written during this visit will appear here." }} />
                : <MedicalHistory key={`earlier-${earlierVisit}`} compact patientId={slot.patient.id} scope={earlierVisit === "all" ? { except: slot.id } : { only: earlierVisit }} emptyText={{ title: "No earlier records", body: earlierVisit === "all" ? "This patient has no notes from earlier visits." : "No notes were written during that visit." }} />}
            </Suspense>
          </> : (
            <div className="mh-card dw-notes-locked">
              <header className="mh-heading"><h2>Timeline</h2></header>
              <div className="mh-empty">
                <span className="mh-empty-icon"><Icon name="file" size={26} /></span>
                <h3>{slot.status === "BOOKED" ? "Waiting for check-in" : "Notes are not available"}</h3>
                <p>{notesHint || "Medical history is available for booked and checked-in visits only."}</p>
              </div>
            </div>
          )}
        </section>
      </div>
      {composerOpen && slot.patient && (
        <NoteDialog
          title={`New note · ${patientName(slot)}`}
          subtitle={`${shortWeekday(slot.startAt)}, ${clock(slot.startAt)} · ${slot.visitPurpose || "Visit"}`}
          onClose={() => setComposerOpen(false)}
        >
          <MedicalNoteForm
            appointmentId={slot.id}
            chips
            onCancel={() => setComposerOpen(false)}
            onSave={(entry) => {
              setComposerOpen(false);
              setNotesTab("visit");
              setHighlightLabel("Just added");
              setHighlightId(entry.id);
              setRefresh((value) => value + 1);
              toast.success("Medical note saved", "It is highlighted in the timeline.");
            }}
          />
        </NoteDialog>
      )}
      {editing && slot.patient && (
        <NoteDialog
          title={`Edit note · ${patientName(slot)}`}
          subtitle={`${shortWeekday(slot.startAt)}, ${clock(slot.startAt)} · ${slot.visitPurpose || "Visit"}`}
          onClose={() => setEditing(null)}
        >
          <MedicalNoteForm
            key={editing.id}
            appointmentId={slot.id}
            entry={editing}
            chips
            onCancel={() => setEditing(null)}
            onSave={(entry) => {
              setEditing(null);
              setHighlightLabel("Updated");
              setHighlightId(entry.id);
              setRefresh((value) => value + 1);
              toast.success("Note updated", "The change is highlighted in the timeline.");
            }}
          />
        </NoteDialog>
      )}
    </div>
  );
}

/** Centered pop-up for writing a note; Escape or the backdrop closes it and the page behind does not scroll. */
function NoteDialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return createPortal(
    <div className="dw-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dw-dialog" role="dialog" aria-modal="true" aria-labelledby="dw-dialog-title">
        <header className="dw-dialog-head">
          <div><h2 id="dw-dialog-title">{title}</h2><p>{subtitle}</p></div>
          <button type="button" className="dw-dialog-close" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
