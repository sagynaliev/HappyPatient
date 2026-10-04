import { Link } from "react-router-dom";
import { useAuth, roleLabel } from "../context/AuthContext";
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const initials = `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase();
  const isDoctor = user.role === "DOCTOR";
  const isPatient = user.role === "PATIENT";

  return (
    <div className="page dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Your dashboard</p>
          <h1>Good to see you, {user.firstName}.</h1>
          <p className="lead">
            {isDoctor
              ? "Manage your patients, access today’s schedule, and keep care moving." 
              : isPatient
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
          <strong>{isDoctor ? "Today’s schedule" : isPatient ? "Find a doctor" : "Review overview"}</strong>
          <small>{isDoctor ? "Check your upcoming patients" : "Discover the right specialist"}</small>
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
            <h2>{isDoctor ? "Today’s care" : isPatient ? "Upcoming appointment" : "Operational snapshot"}</h2>
            <span>{isDoctor ? "◷" : isPatient ? "✓" : "◎"}</span>
          </div>

          <div className="appointment-card empty-appointment-card">
            <div className="appointment-meta">
              <span className="status-pill success">
                {isDoctor ? "Ready" : isPatient ? "No upcoming visit" : "Stable"}
              </span>
              <span>{isDoctor ? "Next patient" : isPatient ? "Care plan" : "System view"}</span>
            </div>
            <h3>{isDoctor ? "No patient booked yet" : isPatient ? "No upcoming visit yet" : "Operations are running normally"}</h3>
            <p>
              {isDoctor
                ? "Your schedule will fill as patients book available time slots."
                : isPatient
                  ? "Your care plan will appear here once you book an appointment."
                  : "No platform alerts require attention right now."}
            </p>
            <div className="appointment-footer">
              <span>
                {isDoctor ? "Schedule updates will appear here" : isPatient ? "Find a doctor to get started" : "Platform overview"}
              </span>
              <Link className="button button-outline small" to={isDoctor ? "/doctor/schedule" : "/search"}>
                {isDoctor ? "Open schedule" : "Find care"}
              </Link>
            </div>
          </div>
        </section>

        <div className="sidebar-stack">
          <section className="panel soft">
            <div className="panel-title">
              <h2>Quick actions</h2>
              <span>↗</span>
            </div>
            <div className="action-list">
              <Link className="action-item" to={isDoctor ? "/doctor/schedule" : "/search"}>
                <span>{isDoctor ? "Manage schedule" : "Find a doctor"}</span>
                <b>→</b>
              </Link>
              <Link className="action-item" to={isDoctor ? "/doctor/schedule" : "/search"}>
                <span>{isDoctor ? "Review today" : "Book a visit"}</span>
                <b>→</b>
              </Link>
              <Link className="action-item" to="/dashboard">
                <span>{isDoctor ? "Open dashboard" : "Review profile"}</span>
                <b>→</b>
              </Link>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2>{isDoctor ? "Availability" : "Profile details"}</h2>
              <span>◎</span>
            </div>
            <p>
              {isDoctor
                ? "Your office schedule is ready for booking and follow-up visits."
                : `${user.email} · ${user.phone || "Add a phone number to your profile"}`}
            </p>
            <Link className="button button-outline" to={isDoctor ? "/doctor/schedule" : "/search"}>
              {isDoctor ? "Update schedule" : "Edit profile"}
            </Link>
          </section>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-card">
          <span>Care access</span>
          <strong>{isDoctor ? "Open" : isPatient ? "Ready" : "Active"}</strong>
          <small>{isDoctor ? "Schedule available" : isPatient ? "Booking ready" : "Operations status"}</small>
        </div>
        <div className="metric-card">
          <span>Care team</span>
          <strong>{isDoctor ? "Live" : isPatient ? "Available" : "Healthy"}</strong>
          <small>{isDoctor ? "Patients can book" : isPatient ? "Doctors available" : "Platform steady"}</small>
        </div>
        <div className="metric-card">
          <span>Health record</span>
          <strong>{isDoctor ? "Private" : isPatient ? "Secure" : "Tracked"}</strong>
          <small>{isDoctor ? "Patient records protected" : isPatient ? "Your records stay private" : "Data under review"}</small>
        </div>
      </div>
    </div>
  );
}
