import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, authApi, CancelledAppointment, PatientAppointment, Receipt } from "../lib/api";
import { notifyNotificationsChanged } from "../lib/notificationEvents";
import { ReceiptDialog } from "../components/ReceiptView";
import { MiniCalendar } from "../components/MiniCalendar";
import { Icon } from "../components/Icons";
import { FloatingNotice } from "../components/FloatingNotice";
import "../styles/patientAppointments.css";
import { showToast, toast } from "../lib/toast";

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

function VisitCost({ slotId, visible }: { slotId: string; visible: boolean }) {
  const [cost, setCost] = useState<{ consultationKzt: number; totalKzt: number; parking: { durationMinutes: number; amountKzt: number } | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!visible || cost || error) return;
    let active = true;
    api<typeof cost>(`/me/appointments/${encodeURIComponent(slotId)}/cost`).then((value) => { if (active) setCost(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [slotId, visible, cost, error]);
  if (!visible) return null;
  return <section className="pa-cost-breakdown" aria-label="Price breakdown">
    {!cost && !error ? <p role="status">Loading price…</p> : error ? <p className="alert error">Price breakdown unavailable.</p> : cost && <dl className="pa-price-list">
      <div><dt>Consultation fee</dt><dd>{formatFee(cost.consultationKzt)}</dd></div>
      {cost.parking && <div><dt>Parking estimate · {Math.ceil(cost.parking.durationMinutes / 60)} h</dt><dd>{formatFee(cost.parking.amountKzt)}</dd></div>}
      <div className="pa-price-total"><dt>Total</dt><dd>{formatFee(cost.totalKzt)}</dd></div>
    </dl>}
  </section>;
}

function AppointmentCard({
  appointment,
  expanded,
  onToggleDetails,
  onCancel,
  onCheckIn,
  onViewReceipt,
  busy,
  pendingCancel,
}: {
  appointment: PatientAppointment;
  expanded: boolean;
  onToggleDetails: (appointment: PatientAppointment) => void;
  onCancel: (appointment: PatientAppointment, trigger: HTMLButtonElement) => void;
  onCheckIn: (appointment: PatientAppointment) => void;
  onViewReceipt: (appointment: PatientAppointment) => void;
  busy: boolean;
  pendingCancel: boolean;
}) {
  const isFuture = Date.parse(appointment.startAt) > Date.now();
  const start = new Date(appointment.startAt);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Almaty" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Asia/Almaty" }).format(start);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Almaty" }).format(start);
  return (
    <article id={`pa-appointment-${appointment.id}`} className={`patient-appointment-card${appointment.status === "OCCUPIED" ? " is-checked-in" : ""}`}>
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
          {!expanded && <div><dt><AppointmentIcon kind="fee" /> <span className="sr-only">Consultation fee</span></dt><dd>{formatFee(appointment.doctor.consultationFee)}</dd></div>}
        </dl>

        <div className="patient-appointment-actions">
          {appointment.status === "BOOKED" && isFuture && !canCheckIn(appointment) && (
            <small className="patient-appointment-hint">Check-in opens 30 minutes before your visit</small>
          )}
          <button className="button button-outline" type="button" aria-expanded={expanded} aria-controls={`pa-details-${appointment.id}`} aria-label={`${expanded ? "Hide" : "View"} details for ${appointment.doctor.name}`} onClick={() => onToggleDetails(appointment)}>
            {expanded ? "Hide details" : "View details"}
          </button>
          {appointment.status === "BOOKED" && isFuture && appointment.doctor.id && (
            <Link className="button button-outline pa-change" to={`/doctors/${appointment.doctor.id}/schedule?reschedule=${encodeURIComponent(appointment.id)}`} aria-label={`Change booking with ${appointment.doctor.name}`}>Change booking</Link>
          )}
          {appointment.status === "BOOKED" && isFuture && (
            <button className="button button-outline pa-cancel" type="button" disabled={busy || pendingCancel} aria-label={`Cancel appointment with ${appointment.doctor.name}`} onClick={(event) => onCancel(appointment, event.currentTarget)}>{pendingCancel ? "Cancelling…" : "Cancel"}</button>
          )}
          {canCheckIn(appointment) && (
            <button className="button" type="button" disabled={busy} onClick={() => onCheckIn(appointment)}>Confirm arrival</button>
          )}
        </div>
        <section id={`pa-details-${appointment.id}`} className="pa-inline-details" hidden={!expanded} aria-label={`Details for ${appointment.doctor.name}`}>
          <dl className="pa-detail-list">
            <div><dt>Doctor</dt><dd>{appointment.doctor.name}</dd></div>
            <div><dt>Specialty</dt><dd>{appointment.doctor.specialty}</dd></div>
            <div><dt>Visit purpose</dt><dd>{appointment.visitPurpose || "Not provided"}</dd></div>
            <div><dt>Date</dt><dd>{formatDate(appointment.startAt)}</dd></div>
            <div><dt>Time · Asia/Almaty (UTC+5)</dt><dd>{formatTime(appointment.startAt)}–{formatTime(appointment.endAt)}</dd></div>
            <div><dt>Office</dt><dd>{appointment.doctor.office || "Not listed"}</dd></div>
            <div><dt>Booking ID</dt><dd>{appointment.reference || appointment.id}</dd></div>
            <div><dt>Status</dt><dd>{appointment.status === "OCCUPIED" ? "Checked in" : pendingCancel ? "Cancelling…" : "Booked"}</dd></div>
          </dl>
          <VisitCost slotId={appointment.id} visible={expanded} />
          {appointment.status === "BOOKED" && isFuture && <p className="patient-appointment-hint">Check-in opens 30 minutes before your visit.</p>}
          <div className="pa-detail-actions">
            {appointment.status === "OCCUPIED" && <button className="button" type="button" onClick={() => onViewReceipt(appointment)}>View receipt</button>}
          </div>
        </section>
      </div>
    </article>
  );
}

const CANCEL_REASONS = ["I feel better", "Schedule conflict", "Booked by mistake", "I found another doctor"];

function CancelledCard({ item, expanded, onToggle }: { item: CancelledAppointment; expanded: boolean; onToggle: () => void }) {
  const start = new Date(item.startAt);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Almaty" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Asia/Almaty" }).format(start);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Almaty" }).format(start);
  const cancelledOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(item.createdAt));
  return (
    <article id={`pa-appointment-${item.slotId}`} className="patient-appointment-card is-cancelled">
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
        <button className="button button-outline" type="button" aria-expanded={expanded} aria-controls={`pa-details-${item.slotId}`} onClick={onToggle}>{expanded ? "Hide details" : "View details"}</button>
        <section id={`pa-details-${item.slotId}`} className="pa-inline-details" hidden={!expanded} aria-label={`Cancelled visit details for ${item.doctor.name}`}>
          <dl className="pa-detail-list"><div><dt>Visit purpose</dt><dd>{item.visitPurpose || "Not provided"}</dd></div><div><dt>Date</dt><dd>{formatDate(item.startAt)}</dd></div><div><dt>Time · Asia/Almaty (UTC+5)</dt><dd>{formatTime(item.startAt)}–{formatTime(item.endAt)}</dd></div><div><dt>Office</dt><dd>{item.doctor.office || "Not listed"}</dd></div><div><dt>Booking ID</dt><dd>{item.reference || item.slotId}</dd></div><div><dt>Status</dt><dd>Cancelled</dd></div></dl>
        </section>
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
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [cancelTarget, setCancelTarget] = useState<PatientAppointment | null>(null);
  const [cancelPhase, setCancelPhase] = useState<"reason" | "confirm">("reason");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelChoice, setCancelChoice] = useState("");
  const [expandedCancelledId, setExpandedCancelledId] = useState<string | null>(null);
  const [pendingCancellation, setPendingCancellation] = useState<{ appointment: PatientAppointment; reason: string } | null>(null);
  const cancelDialogRef = useRef<HTMLElement>(null);
  const keepAppointmentRef = useRef<HTMLButtonElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    const appointmentId=searchParams.get("appointmentId");
    if (loading || !appointmentId) return;
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (appointment) {
      const tab: AppointmentTab = Date.parse(appointment.startAt) > Date.now() || canCheckIn(appointment) ? "upcoming" : "past";
      if (activeTab !== tab) setSearchParams((current) => { const next = new URLSearchParams(current); next.set("tab", tab); return next; }, { replace: true });
      setSelectedAppointment(appointment);
      requestAnimationFrame(() => document.getElementById(`pa-appointment-${appointment.id}`)?.scrollIntoView?.({ behavior: (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false) ? "auto" : "smooth", block: "center" }));
      return;
    }
    const cancelledAppointment = cancelled.find((item) => item.slotId === appointmentId);
    if (cancelledAppointment) {
      if (activeTab !== "cancelled") setSearchParams((current) => { const next = new URLSearchParams(current); next.set("tab", "cancelled"); return next; }, { replace: true });
      setExpandedCancelledId(cancelledAppointment.slotId);
      requestAnimationFrame(() => document.getElementById(`pa-appointment-${cancelledAppointment.slotId}`)?.scrollIntoView?.({ behavior: (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false) ? "auto" : "smooth", block: "center" }));
    }
  }, [activeTab, appointments, cancelled, loading, searchParams, setSearchParams]);

  function closeAppointmentDetails() {
    setSelectedAppointment(null);
    if(searchParams.has("appointmentId"))setSearchParams(current=>{const next=new URLSearchParams(current);next.delete("appointmentId");return next;},{replace:true});
  }

  function toggleAppointmentDetails(appointment: PatientAppointment) {
    if (selectedAppointment?.id === appointment.id) { closeAppointmentDetails(); return; }
    setSelectedAppointment(appointment);
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("appointmentId", appointment.id); return next; }, { replace: true });
  }

  useEffect(() => {
    api<{ categories: Array<{ name: string }> }>("/categories")
      .then((result) => setSpecialties((result?.categories ?? []).map((item) => item.name).slice(0, 8)))
      .catch(() => setSpecialties([]));
  }, []);

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
    setCancelPhase("reason");
    setCancelChoice("");
    setCancelReason("");
  }

  const finalReason = (cancelChoice === "Other" ? cancelReason : cancelChoice).trim();

  function closeCancellation() {
    setCancelTarget(null);
    setCancelPhase("reason");
    requestAnimationFrame(() => cancelTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!cancelTarget || cancelPhase !== "confirm") return;
    keepAppointmentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeCancellation(); return; }
      if (event.key !== "Tab" || !cancelDialogRef.current) return;
      const focusable = [...cancelDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelTarget, cancelPhase]);

  async function commitCancellation(pending: { appointment: PatientAppointment; reason: string }) {
    setPendingCancellation(null);
    setActionBusy(true); setActionMessage("");
    try {
      await authApi.cancelAppointment(pending.appointment.id, pending.reason);
      setActionMessage("Appointment cancelled. The doctor has been told why, and the visit is now in your Cancelled tab.");
      showToast({ tone: "error", title: "Appointment cancelled", message: "The time is free for other patients. Find it in the Cancelled tab.", durationMs: 5000 });
      notifyNotificationsChanged();
      await loadAppointments();
    }
    catch (cause: unknown) { setActionMessage(cause instanceof Error ? cause.message : "Cancellation failed."); toast.error("Cancellation failed", cause instanceof Error ? cause.message : undefined); }
    finally { setActionBusy(false); }
  }

  function queueCancellation() {
    if (!cancelTarget || finalReason.length < 3) return;
    const pending = { appointment: cancelTarget, reason: finalReason };
    setPendingCancellation(pending);
    setCancelTarget(null);
    setCancelPhase("reason");
  }

  function undoCancellation() {
    if (!pendingCancellation) return;
    // Cancellation is intentionally deferred in this page only; closing or navigating away unmounts the timer, so no request is sent.
    setPendingCancellation(null);
    setActionMessage("Cancellation undone. Your appointment remains booked.");
    toast.info("Cancellation undone", "Your appointment remains booked.");
  }

  function beginCancellation(appointment: PatientAppointment, trigger: HTMLButtonElement) {
    cancelTriggerRef.current = trigger;
    cancelAppointment(appointment);
  }

  async function checkInAppointment(appointment: PatientAppointment) {
    setActionBusy(true); setActionMessage("");
    try {
      const result = await authApi.checkInAppointment(appointment.id);
      setActionMessage(`Arrival confirmed for ${result.reference}. Your status is now “Checked in”.`);
      toast.success("You’re checked in", `${result.reference} · your receipt is ready.`);
      notifyNotificationsChanged();
      await loadAppointments();
      setReceipt((await authApi.receipt(appointment.id)).receipt);
    }
    catch (cause: unknown) { setActionMessage(cause instanceof Error ? cause.message : "Check-in failed."); toast.error("Check-in failed", cause instanceof Error ? cause.message : undefined); }
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
            <h1 id="patient-appointments-title">My appointments</h1>
            <p>Keep your upcoming and previous visits organised.</p>
          </div>
          <Link className="button" to="/search">Find a doctor</Link>
        </header>

        <div className="pa-layout">
        <div className="pa-main">
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
              {cancelled.map((item) => <CancelledCard key={item.id} item={item} expanded={expandedCancelledId === item.slotId} onToggle={() => setExpandedCancelledId((current) => current === item.slotId ? null : item.slotId)} />)}
            </div>
          ) : visibleAppointments.length > 0 ? (
            <>
            <div className="patient-appointments-grid">
              {visibleAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} expanded={selectedAppointment?.id === appointment.id} onToggleDetails={toggleAppointmentDetails} onCancel={beginCancellation} onCheckIn={checkInAppointment} onViewReceipt={viewReceipt} busy={actionBusy} pendingCancel={pendingCancellation?.appointment.id === appointment.id} />
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
              {specialties.length > 0 && (
                <div className="pa-empty-specialties">
                  <p>Or start from a specialty</p>
                  <div>
                    {specialties.map((name) => <Link key={name} to={`/search?category=${encodeURIComponent(name)}`}>{name}</Link>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        </div>

        <aside className="pa-side" aria-label="Visit overview">
          <section className="pa-next">
            <p className="pa-side-label">Next visit</p>
            {upcoming[0] ? (
              <>
                <strong>{formatDate(upcoming[0].startAt)}</strong>
                <span className="pa-next-time"><Icon name="clock" size={15} /> {formatTime(upcoming[0].startAt)}–{formatTime(upcoming[0].endAt)}</span>
                <span className="pa-next-doctor">{upcoming[0].doctor.name} · {upcoming[0].doctor.specialty}</span>
              </>
            ) : (
              <>
                <strong>Nothing planned yet</strong>
                <span className="pa-next-doctor">Pick a doctor and a free time — it takes about a minute.</span>
                <Link className="pa-next-action" to="/search">Book a visit</Link>
              </>
            )}
          </section>
          <MiniCalendar marked={new Set(appointments.filter((item) => item.status !== "FREE").map((item) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date(item.startAt))))} />
          <section className="pa-help">
            <h2><Icon name="shield" size={18} /> Need to make a change?</h2>
            <ul>
              <li><Icon name="calendar" size={16} /> Cancel a booked visit and tell the doctor why.</li>
              <li><Icon name="check" size={16} /> Check in from 30 minutes before your visit.</li>
              <li><Icon name="file" size={16} /> Get your receipt after check-in.</li>
            </ul>
          </section>
        </aside>
        </div>
      </div>

      {cancelTarget && (
        <div className="patient-appointment-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) closeCancellation();
        }}>
          <section ref={cancelDialogRef} className="patient-appointment-dialog pa-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
            <button className="patient-appointment-dialog-close" type="button" aria-label="Close cancellation" onClick={closeCancellation} disabled={actionBusy}>×</button>
            {cancelPhase === "reason" ? <>
              <h2 id="cancel-dialog-title">Why are you cancelling?</h2>
              <p className="pa-cancel-summary">{cancelTarget.doctor.name} · {formatDate(cancelTarget.startAt)}, {formatTime(cancelTarget.startAt)}</p>
              <fieldset className="pa-reason-options">
                <legend>Choose a reason</legend>
                {[...CANCEL_REASONS, "Other"].map((option) => (
                  <label key={option} className={cancelChoice === option ? "is-selected" : ""}>
                    <input type="radio" name="cancel-reason" value={option} checked={cancelChoice === option} onChange={() => setCancelChoice(option)} />
                    {option}
                  </label>
                ))}
              </fieldset>
              {cancelChoice === "Other" && <label className="pa-reason-text"><span>Your reason</span><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={300} rows={3} placeholder="Tell the doctor why you are cancelling" autoFocus /></label>}
              <p className="pa-cancel-note">The doctor will see this reason.</p>
              <div className="pa-cancel-actions">
                <button className="button button-outline" type="button" onClick={closeCancellation} disabled={actionBusy}>Keep appointment</button>
                <button className="button" type="button" onClick={() => setCancelPhase("confirm")} disabled={actionBusy || finalReason.length < 3}>Continue</button>
              </div>
            </> : <>
              <h2 id="cancel-dialog-title">Confirm cancellation</h2>
              <p className="pa-cancel-summary">Cancel your visit with {cancelTarget.doctor.name} on {formatDate(cancelTarget.startAt)} at {formatTime(cancelTarget.startAt)}? The time will be released for other patients.</p>
              <p className="pa-cancel-note">Reason: {finalReason}</p>
              <div className="pa-cancel-actions">
                <button ref={keepAppointmentRef} className="button" type="button" onClick={closeCancellation} disabled={actionBusy}>Keep appointment</button>
                <button className="button pa-cancel-confirm" type="button" onClick={queueCancellation} disabled={actionBusy}>Cancel appointment</button>
              </div>
            </>}
          </section>
        </div>
      )}

      {pendingCancellation && <FloatingNotice title="Appointment cancelled." actions={[{ label: "Undo", variant: "primary", onClick: undoCancellation }]} timeoutMs={10_000} pauseOnInteraction={false} onTimeout={() => { void commitCancellation(pendingCancellation); }} />}

      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </section>
  );
}
