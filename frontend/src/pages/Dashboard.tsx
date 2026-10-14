import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, roleLabel } from "../context/AuthContext";
import { authApi, PatientAppointment } from "../lib/api";
import DoctorDashboard from "./DoctorDashboard";

const appointmentDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Almaty",
}).format(new Date(value));

export default function Dashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");

  useEffect(() => {
    if (user?.role !== "PATIENT") return;
    let active = true;
    setAppointmentsLoading(true);
    setAppointmentsError("");
    authApi.myAppointments()
      .then(({ appointments: result }) => {
        if (active) setAppointments(result);
      })
      .catch((error: unknown) => {
        if (active) setAppointmentsError(error instanceof Error ? error.message : "Unable to load your appointments.");
      })
      .finally(() => {
        if (active) setAppointmentsLoading(false);
      });
    return () => { active = false; };
  }, [user?.role]);

  if (!user) return null;
  if (user.role === "DOCTOR") return <DoctorDashboard />;

  const initials = `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase();
  const isPatient = user.role === "PATIENT";
  const now = Date.now();
  const upcomingAppointment = appointments.find((appointment) => appointment.status === "BOOKED" && new Date(appointment.startAt).getTime() > now);
  const pastAppointments = appointments.filter((appointment) => appointment.status === "BOOKED" && new Date(appointment.startAt).getTime() <= now);

  return (
    <div className="page dashboard-page" aria-label={`${roleLabel(user.role)} dashboard`}>
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Your dashboard</p>
          <h1>Good to see you, {user.firstName}.</h1>
          <p className="lead">
            {isPatient
                ? "Your care journey is in one place — find care, book visits, and stay on top of follow-ups." 
                : "Monitor the platform and keep operations running smoothly."}
          </p>
        </div>
        <div className="profile-pill">
          <div className="profile-avatar">{initials}</div>
          <div>
            <strong>{user.firstName} {user.lastName}</strong>
            <span>{roleLabel(user.role)}</span>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Account type</span>
          <strong>{roleLabel(user.role)}</strong>
          <small>Active profile</small>
        </div>
        <div className="stat">
          <span>Next step</span>
              <strong>{isPatient ? "Find a doctor" : "Review overview"}</strong>
          <small>{isPatient ? "Discover the right specialist" : "Platform overview"}</small>
        </div>
        <div className="stat">
          <span>Support</span>
          <strong>{user.email}</strong>
          <small>{user.phone || "Add a phone number to your profile"}</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel panel-feature">
          <div className="panel-title">
            <h2>{isPatient ? "Upcoming appointment" : "Operational snapshot"}</h2>
            <span>{isPatient ? "✓" : "◎"}</span>
          </div>

          {isPatient && appointmentsLoading ? (
            <div className="appointment-card empty-appointment-card" role="status">Loading your appointments…</div>
          ) : isPatient && appointmentsError ? (
            <div className="appointment-card empty-appointment-card" role="alert">
              <p>{appointmentsError}</p>
              <button className="button button-outline small" type="button" onClick={() => {
                setAppointmentsError("");
                setAppointmentsLoading(true);
                authApi.myAppointments()
                  .then(({ appointments: result }) => setAppointments(result))
                  .catch((error: unknown) => setAppointmentsError(error instanceof Error ? error.message : "Unable to load your appointments."))
                  .finally(() => setAppointmentsLoading(false));
              }}>Try again</button>
            </div>
          ) : upcomingAppointment ? (
            <div className="appointment-card">
              <div className="appointment-meta">
                <span className="status-pill success">Booked</span>
                <span>{upcomingAppointment.doctor.specialty}</span>
              </div>
              <h3>{upcomingAppointment.doctor.name}</h3>
              <p>{appointmentDate(upcomingAppointment.startAt)} – {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(upcomingAppointment.endAt))} · UTC+5</p>
              <div className="appointment-footer">
                <span>Upcoming appointment</span>
              </div>
            </div>
          ) : (
          <div className="appointment-card empty-appointment-card">
            <div className="appointment-meta">
              <span className="status-pill success">
                {isPatient ? "No upcoming visit" : "Stable"}
              </span>
              <span>{isPatient ? "Care plan" : "System view"}</span>
            </div>
            <h3>{isPatient ? "No upcoming visit yet" : "Operations are running normally"}</h3>
            <p>
              {isPatient
                  ? "Your care plan will appear here once you book an appointment."
                  : "No platform alerts require attention right now."}
            </p>
            <div className="appointment-footer">
              <span>
                {isPatient ? "Find a doctor to get started" : "Platform overview"}
              </span>
              {isPatient && <Link className="button button-outline small" to="/search">Find care</Link>}
            </div>
          </div>
          )}
        </section>

        <div className="sidebar-stack">
          <section className="panel soft">
            <div className="panel-title">
              <h2>Quick actions</h2>
              <span>↗</span>
            </div>
            <div className="action-list">
              {isPatient ? (
                <>
                  <Link className="action-item" to="/search"><span>Find a doctor</span><b>→</b></Link>
                  <Link className="action-item" to="/search"><span>Book a visit</span><b>→</b></Link>
                  <Link className="action-item" to="/appointments"><span>Manage appointments</span><b>→</b></Link>
                  <Link className="action-item" to="/profile"><span>Review profile</span><b>→</b></Link>
                </>
              ) : (
                <>
                  <Link className="action-item" to="/admin/doctors"><span>Review doctors</span><b>→</b></Link>
                  <Link className="action-item" to="/admin/appointments"><span>Review appointments</span><b>→</b></Link>
                  <Link className="action-item" to="/admin/users"><span>Manage users</span><b>→</b></Link>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2>Profile details</h2>
              <span>◎</span>
            </div>
            <p>
              {`${user.email} · ${user.phone || "Add a phone number to your profile"}`}
            </p>
            <Link className="button button-outline" to="/profile">
              Edit profile
            </Link>
          </section>
        </div>
      </div>

      {isPatient && pastAppointments.length > 0 && (
        <section className="panel" aria-labelledby="past-appointments-heading">
          <div className="panel-title"><h2 id="past-appointments-heading">Past appointments</h2></div>
          <ul className="dashboard-appointment-list">
            {pastAppointments.map((appointment) => (
              <li key={appointment.id}>
                <strong>{appointment.doctor.name}</strong>
                <span>{appointment.doctor.specialty} · {appointmentDate(appointment.startAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="metric-row">
        <div className="metric-card">
          <span>Care access</span>
            <strong>{isPatient ? "Ready" : "Active"}</strong>
            <small>{isPatient ? "Booking ready" : "Operations status"}</small>
        </div>
        <div className="metric-card">
          <span>Care team</span>
            <strong>{isPatient ? "Available" : "Healthy"}</strong>
            <small>{isPatient ? "Doctors available" : "Platform steady"}</small>
        </div>
        <div className="metric-card">
          <span>Health record</span>
            <strong>{isPatient ? "Secure" : "Tracked"}</strong>
            <small>{isPatient ? "Your records stay private" : "Data under review"}</small>
        </div>
      </div>
    </div>
  );
}
