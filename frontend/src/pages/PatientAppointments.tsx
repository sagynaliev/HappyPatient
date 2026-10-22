import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi, CancelledAppointment, PatientAppointment, Receipt } from "../lib/api";
import { notifyNotificationsChanged } from "../lib/notificationEvents";
import { ReceiptView } from "../components/ReceiptView";
import "../styles/patientAppointments.css";

type AppointmentTab = "upcoming" | "past" | "cancelled";

function getTab(value: string | null): AppointmentTab {
  return value === "past" || value === "cancelled" ? value : "upcoming";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Almaty",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  }).format(new Date(value));
}

const CHECK_IN_OPENS_MS = 30 * 60_000;

export function canCheckIn(appointment: PatientAppointment, now = Date.now()): boolean {
  return appointment.status === "BOOKED"
    && Date.parse(appointment.startAt) - now <= CHECK_IN_OPENS_MS
    && Date.parse(appointment.endAt) > now;
}

function formatFee(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(value)} KZT`;
}

function AppointmentIcon({ kind }: { kind: "calendar" | "clock" | "location" | "fee" }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    fee: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18m-13 4h4" /></>,
  };
  return (
    <svg aria-hidden="true" className="patient-appointment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

function AppointmentCard({
  appointment,
  onViewDetails,
  onCancel,
  onCheckIn,
  onViewReceipt,
  busy,
}: {
  appointment: PatientAppointment;
  onViewDetails: (appointment: PatientAppointment) => void;
  onCancel: (appointment: PatientAppointment) => void;
  onCheckIn: (appointment: PatientAppointment) => void;
  onViewReceipt: (appointment: PatientAppointment) => void;
  busy: boolean;
}) {
  const isFuture = Date.parse(appointment.startAt) > Date.now();
  const start = new Date(appointment.startAt);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Almaty" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Asia/Almaty" }).format(start);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Almaty" }).format(start);
  return (
    <article className={`patient-appointment-card${appointment.status === "OCCUPIED" ? " is-checked-in" : ""}`}>
      <div className="pa-date" aria-hidden="true">
        <span>{month}</span>
        <strong>{day}</strong>
        <small>{weekday}</small>
      </div>

      <div className="pa-body">
        <header className="patient-appointment-card-heading">
          <div>
            <h2>{appointment.doctor.name}</h2>
            <p className="patient-appointment-specialty">{appointment.doctor.specialty}</p>
          </div>
          <span className="patient-appointment-status">{appointment.status === "OCCUPIED" ? "Checked in" : "Booked"}</span>
        </header>

        <dl className="patient-appointment-facts">
          <div>
            <dt><AppointmentIcon kind="calendar" /> <span className="sr-only">Date</span></dt>
            <dd>{formatDate(appointment.startAt)}</dd>
          </div>
          <div>
            <dt><AppointmentIcon kind="clock" /> <span className="sr-only">Time, Asia/Almaty (UTC+5)</span></dt>
            <dd>{formatTime(appointment.startAt)}–{formatTime(appointment.endAt)}</dd>
          </div>
          {appointment.doctor.office && (
            <div>
              <dt><AppointmentIcon kind="location" /> <span className="sr-only">Location</span></dt>
              <dd>{appointment.doctor.office}</dd>
            </div>
          )}
          <div>
            <dt><AppointmentIcon kind="fee" /> <span className="sr-only">Current listed consultation fee</span></dt>
            <dd>{formatFee(appointment.doctor.consultationFee)}</dd>
          </div>
        </dl>

        <div className="patient-appointment-actions">
          {appointment.status === "BOOKED" && isFuture && !canCheckIn(appointment) && (
            <small className="patient-appointment-hint">Check-in opens 30 minutes before your visit</small>
          )}
          <button className="button button-outline" type="button" onClick={() => onViewDetails(appointment)}>
            View details
          </button>
          {appointment.status === "BOOKED" && isFuture && (
            <button className="button button-outline pa-cancel" type="button" disabled={busy} onClick={() => onCancel(appointment)}>Cancel</button>
          )}
          {canCheckIn(appointment) && (
            <button className="button" type="button" disabled={busy} onClick={() => onCheckIn(appointment)}>Confirm arrival</button>
          )}
          {appointment.status === "OCCUPIED" && (
            <button className="button" type="button" onClick={() => onViewReceipt(appointment)}>View receipt</button>
          )}
        </div>
      </div>
    </article>
  );
}

const CANCEL_REASONS = ["I feel better", "Schedule conflict", "Booked by mistake", "I found another doctor"];

function CancelledCard({ item }: { item: CancelledAppointment }) {
  const start = new Date(item.startAt);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Almaty" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Asia/Almaty" }).format(start);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Almaty" }).format(start);
  const cancelledOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(item.createdAt));
  return (
    <article className="patient-appointment-card is-cancelled">
      <div className="pa-date" aria-hidden="true"><span>{month}</span><strong>{day}</strong><small>{weekday}</small></div>
      <div className="pa-body">
        <header className="patient-appointment-card-heading">
          <div>
            <h2>{item.doctor.name}</h2>
            <p className="patient-appointment-specialty">{item.doctor.specialty}</p>
          </div>
          <span className="patient-appointment-status is-cancelled">{item.cancelledBy === "PATIENT" ? "Cancelled by you" : "Cancelled by the clinic"}</span>
        </header>
        <dl className="patient-appointment-facts">
          <div><dt><AppointmentIcon kind="calendar" /> <span className="sr-only">Date</span></dt><dd>{formatDate(item.startAt)}</dd></div>
          <div><dt><AppointmentIcon kind="clock" /> <span className="sr-only">Time</span></dt><dd>{formatTime(item.startAt)}–{formatTime(item.endAt)}</dd></div>
        </dl>
        <p className="pa-cancel-reason"><strong>Reason:</strong> {item.reason}</p>
        <small className="pa-cancel-when">Cancelled on {cancelledOn}</small>
      </div>
    </article>
  );
}

function AppointmentSkeleton() {
  return (
    <div className="patient-appointment-skeleton" role="status" aria-label="Loading appointments">
      <span /><span /><span /><span />
    </div>
  );
}

export default function PatientAppointments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getTab(searchParams.get("tab"));
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<PatientAppointment | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [cancelled, setCancelled] = useState<CancelledAppointment[]>([]);
  const [cancelTarget, setCancelTarget] = useState<PatientAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelChoice, setCancelChoice] = useState("");

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { appointments: result, cancelled: cancelledResult } = await authApi.myAppointments();
      setAppointments(result);
      setCancelled(cancelledResult ?? []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const booked = appointments.filter((appointment) => appointment.status === "BOOKED" || appointment.status === "OCCUPIED");
    const isUpcoming = (appointment: PatientAppointment) => Date.parse(appointment.startAt) > now || canCheckIn(appointment, now);
    return {
      upcoming: booked.filter(isUpcoming),
      past: booked.filter((appointment) => !isUpcoming(appointment)),
    };
  }, [appointments]);

  function cancelAppointment(appointment: PatientAppointment) {
    setCancelTarget(appointment);
    setCancelChoice("");
    setCancelReason("");
  }

  const finalReason = (cancelChoice === "Other" ? cancelReason : cancelChoice).trim();

  async function confirmCancel() {
    if (!cancelTarget || finalReason.length < 3) return;
    setActionBusy(true); setActionMessage("");
    try {
      await authApi.cancelAppointment(cancelTarget.id, finalReason);
      setCancelTarget(null);
      setActionMessage("Appointment cancelled. The doctor has been told why, and the visit is now in your Cancelled tab.");
      notifyNotificationsChanged();
      await loadAppointments();
    }
    catch (cause: unknown) { setActionMessage(cause instanceof Error ? cause.message : "Cancellation failed."); }
    finally { setActionBusy(false); }
  }

  async function checkInAppointment(appointment: PatientAppointment) {
    setActionBusy(true); setActionMessage("");
    try {
      const result = await authApi.checkInAppointment(appointment.id);
      setActionMessage(`Arrival confirmed for ${result.reference}. Your status is now “Checked in”.`);
      notifyNotificationsChanged();
      await loadAppointments();
      setReceipt((await authApi.receipt(appointment.id)).receipt);
    }
    catch (cause: unknown) { setActionMessage(cause instanceof Error ? cause.message : "Check-in failed."); }
    finally { setActionBusy(false); }
  }

  async function viewReceipt(appointment: PatientAppointment) {
    try { setReceipt((await authApi.receipt(appointment.id)).receipt); }
    catch (cause: unknown) { setActionMessage(cause instanceof Error ? cause.message : "Receipt is not available."); }
  }

  const visibleAppointments = activeTab === "upcoming" ? upcoming : activeTab === "past" ? past : [];

  function selectTab(tab: AppointmentTab) {
    setSearchParams(tab === "upcoming" ? {} : { tab });
  }

  return (
    <section className="patient-appointments-page" aria-labelledby="patient-appointments-title">
      <div className="patient-appointments-container">
        <header className="patient-appointments-heading">
          <div>
            <p className="patient-appointments-eyebrow">Your care</p>
            <h1 id="patient-appointments-title">My Appointments</h1>
            <p>Keep your upcoming and previous visits organised.</p>
          </div>
          <Link className="button" to="/search">Find a doctor</Link>
        </header>

        <div className="patient-appointment-tabs" role="tablist" aria-label="Filter appointments">
          <button
            id="appointments-tab-upcoming"
            type="button"
            role="tab"
            aria-selected={activeTab === "upcoming"}
            aria-controls="appointments-panel"
            onClick={() => selectTab("upcoming")}
          >
            Upcoming <span>{upcoming.length}</span>
          </button>
          <button
            id="appointments-tab-past"
            type="button"
            role="tab"
            aria-selected={activeTab === "past"}
            aria-controls="appointments-panel"
            onClick={() => selectTab("past")}
          >
            Past <span>{past.length}</span>
          </button>
          <button
            id="appointments-tab-cancelled"
            type="button"
            role="tab"
            aria-selected={activeTab === "cancelled"}
            aria-controls="appointments-panel"
            onClick={() => selectTab("cancelled")}
          >
            Cancelled <span>{cancelled.length}</span>
          </button>
        </div>

        {actionMessage && <div className="alert success" role="status">{actionMessage}</div>}

        <div id="appointments-panel" role="tabpanel" aria-labelledby={`appointments-tab-${activeTab}`} tabIndex={0}>
          {loading ? (
            <div className="patient-appointments-grid"><AppointmentSkeleton /><AppointmentSkeleton /></div>
          ) : error ? (
            <div className="patient-appointments-message patient-appointments-error" role="alert">
              <p>Failed to load appointments. {error}</p>
              <button className="button button-outline" type="button" onClick={() => void loadAppointments()}>Retry</button>
            </div>
          ) : activeTab === "cancelled" && cancelled.length > 0 ? (
            <div className="patient-appointments-grid">
              {cancelled.map((item) => <CancelledCard key={item.id} item={item} />)}
            </div>
          ) : visibleAppointments.length > 0 ? (
            <>
            <div className="patient-appointments-grid">
              {visibleAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} onViewDetails={setSelectedAppointment} onCancel={cancelAppointment} onCheckIn={checkInAppointment} onViewReceipt={viewReceipt} busy={actionBusy} />
              ))}
            </div>
            </>
          ) : (
            <div className="patient-appointments-message">
              <span aria-hidden="true">◷</span>
              <h2>{activeTab === "cancelled" ? "No cancelled appointments" : `No ${activeTab} appointments`}</h2>
              <p>{activeTab === "cancelled"
                ? "Visits you or the clinic cancel will appear here with the reason."
                : "When you book an appointment, it will appear here."}</p>
              {activeTab !== "cancelled" && <Link className="button button-outline" to="/search">Find a doctor</Link>}
            </div>
          )}
        </div>

        <aside className="patient-appointments-policy">
          <span aria-hidden="true">ⓘ</span>
          <div>
            <h2>Need to make a change?</h2>
            <p>You can cancel an upcoming booked visit or check in when you arrive. Confirmations appear under the bell icon at the top of the page.</p>
          </div>
        </aside>
      </div>

      {cancelTarget && (
        <div className="patient-appointment-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) setCancelTarget(null);
        }}>
          <section className="patient-appointment-dialog pa-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
            <button className="patient-appointment-dialog-close" type="button" aria-label="Close cancellation" onClick={() => setCancelTarget(null)} disabled={actionBusy}>×</button>
            <h2 id="cancel-dialog-title">Cancel this appointment?</h2>
            <p className="pa-cancel-summary">{cancelTarget.doctor.name} · {formatDate(cancelTarget.startAt)}, {formatTime(cancelTarget.startAt)}</p>
            <fieldset className="pa-reason-options">
              <legend>Why are you cancelling?</legend>
              {[...CANCEL_REASONS, "Other"].map((option) => (
                <label key={option} className={cancelChoice === option ? "is-selected" : ""}>
                  <input type="radio" name="cancel-reason" value={option} checked={cancelChoice === option} onChange={() => setCancelChoice(option)} />
                  {option}
                </label>
              ))}
            </fieldset>
            {cancelChoice === "Other" && (
              <label className="pa-reason-text">
                <span>Your reason</span>
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={300} rows={3} placeholder="Tell the doctor why you are cancelling" autoFocus />
              </label>
            )}
            <p className="pa-cancel-note">The doctor will see this reason. The time slot becomes free for other patients.</p>
            <div className="pa-cancel-actions">
              <button className="button button-outline" type="button" onClick={() => setCancelTarget(null)} disabled={actionBusy}>Keep appointment</button>
              <button className="button pa-cancel-confirm" type="button" onClick={() => void confirmCancel()} disabled={actionBusy || finalReason.length < 3}>{actionBusy ? "Cancelling…" : "Cancel appointment"}</button>
            </div>
          </section>
        </div>
      )}

      {receipt && (
        <div className="patient-appointment-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReceipt(null);
        }}>
          <section className="patient-appointment-dialog patient-receipt-dialog" role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.reference}`}>
            <button className="patient-appointment-dialog-close" type="button" aria-label="Close receipt" onClick={() => setReceipt(null)}>×</button>
            <ReceiptView receipt={receipt} />
          </section>
        </div>
      )}

      {selectedAppointment && (
        <div className="patient-appointment-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedAppointment(null);
        }}>
          <section className="patient-appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
            <button className="patient-appointment-dialog-close" type="button" aria-label="Close appointment details" onClick={() => setSelectedAppointment(null)}>×</button>
            <p className="patient-appointments-eyebrow">Appointment details</p>
            <h2 id="appointment-detail-title">{selectedAppointment.doctor.name}</h2>
            <p>{selectedAppointment.doctor.specialty}</p>
            {selectedAppointment.visitPurpose && <p><strong>Visit purpose:</strong> {selectedAppointment.visitPurpose}</p>}
            <p><strong>Date:</strong> {formatDate(selectedAppointment.startAt)}</p>
            <p><strong>Time:</strong> {formatTime(selectedAppointment.startAt)}–{formatTime(selectedAppointment.endAt)} · Asia/Almaty (UTC+5)</p>
            {selectedAppointment.doctor.office && <p><strong>Location:</strong> {selectedAppointment.doctor.office}</p>}
            <button className="button" type="button" onClick={() => setSelectedAppointment(null)}>Close</button>
          </section>
        </div>
      )}
    </section>
  );
}
