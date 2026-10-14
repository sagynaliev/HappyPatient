import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi, PatientAppointment } from "../lib/api";
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
}: {
  appointment: PatientAppointment;
  onViewDetails: (appointment: PatientAppointment) => void;
}) {
  return (
    <article className="patient-appointment-card">
      <header className="patient-appointment-card-heading">
        <div>
          <p className="patient-appointments-eyebrow">Appointment details</p>
          <h2>{appointment.doctor.name}</h2>
          <p className="patient-appointment-specialty">{appointment.doctor.specialty}</p>
        </div>
        <span className="patient-appointment-status">Booked</span>
      </header>

      <dl className="patient-appointment-facts">
        <div>
          <dt><AppointmentIcon kind="calendar" /> Date</dt>
          <dd>{formatDate(appointment.startAt)}</dd>
        </div>
        <div>
          <dt><AppointmentIcon kind="clock" /> Time · Asia/Almaty (UTC+5)</dt>
          <dd>{formatTime(appointment.startAt)}–{formatTime(appointment.endAt)}</dd>
        </div>
        {appointment.doctor.office && (
          <div>
            <dt><AppointmentIcon kind="location" /> Location</dt>
            <dd>{appointment.doctor.office}</dd>
          </div>
        )}
        <div>
          <dt><AppointmentIcon kind="fee" /> Current listed consultation fee</dt>
          <dd>{formatFee(appointment.doctor.consultationFee)}</dd>
        </div>
      </dl>

      <div className="patient-appointment-actions">
        <button className="button button-outline" type="button" onClick={() => onViewDetails(appointment)}>
          View details
        </button>
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

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { appointments: result } = await authApi.myAppointments();
      setAppointments(result);
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
    const booked = appointments.filter((appointment) => appointment.status === "BOOKED");
    return {
      upcoming: booked.filter((appointment) => Date.parse(appointment.startAt) > now),
      past: booked.filter((appointment) => Date.parse(appointment.startAt) <= now),
    };
  }, [appointments]);

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
            Cancelled
          </button>
        </div>

        <div id="appointments-panel" role="tabpanel" aria-labelledby={`appointments-tab-${activeTab}`} tabIndex={0}>
          {loading ? (
            <div className="patient-appointments-grid"><AppointmentSkeleton /><AppointmentSkeleton /></div>
          ) : error ? (
            <div className="patient-appointments-message patient-appointments-error" role="alert">
              <p>Failed to load appointments. {error}</p>
              <button className="button button-outline" type="button" onClick={() => void loadAppointments()}>Retry</button>
            </div>
          ) : visibleAppointments.length > 0 ? (
            <div className="patient-appointments-grid">
              {visibleAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} onViewDetails={setSelectedAppointment} />
              ))}
            </div>
          ) : (
            <div className="patient-appointments-message">
              <span aria-hidden="true">◷</span>
              <h2>{activeTab === "cancelled" ? "Cancellation history unavailable" : `No ${activeTab} appointments`}</h2>
              <p>{activeTab === "cancelled"
                ? "This version does not store cancelled appointments, so there is no cancellation history to show."
                : "When you book an appointment, it will appear here."}</p>
              {activeTab !== "cancelled" && <Link className="button button-outline" to="/search">Find a doctor</Link>}
            </div>
          )}
        </div>

        <aside className="patient-appointments-policy">
          <span aria-hidden="true">ⓘ</span>
          <div>
            <h2>Need to make a change?</h2>
            <p>Appointment cancellation and rescheduling are not available in this version. Contact the clinic directly if you need to change a visit.</p>
          </div>
        </aside>
      </div>

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
