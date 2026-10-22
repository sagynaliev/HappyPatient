import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminDoctorRecord, AdminMetrics, authApi } from "../lib/api";
import { Icon, IconName } from "../components/Icons";

type AdminAppointment = { id: string; patient: string; doctor: string; specialty: string; date: string; status: string; purpose?: string | null };

const TZ = "Asia/Almaty";
const dateLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const dayShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const timeShort = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const weekdayOf = (value: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TZ }).format(new Date(value));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const initials = (name: string) => name.replace(/^Dr\.\s*/, "").split(" ").map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();

function Stat({ icon, tone, label, value, note }: { icon: IconName; tone: string; label: string; value: string | number; note: string }) {
  return (
    <article className="admin-metric-card ad-stat">
      <span className={`ad-stat-icon ${tone}`}><Icon name={icon} /></span>
      <span className="ad-stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [doctors, setDoctors] = useState<AdminDoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const [metricResult, appointmentResult, doctorResult] = await Promise.all([
          authApi.adminMetrics(),
          authApi.adminAppointments().catch(() => ({ appointments: [] })),
          authApi.adminDoctors().catch(() => ({ doctors: [] })),
        ]);
        setMetrics(metricResult);
        setAppointments(appointmentResult.appointments);
        setDoctors(doctorResult.doctors);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load platform metrics.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const perWeekday = useMemo(() => {
    const counts = new Map(WEEKDAYS.map((day) => [day, 0]));
    appointments.forEach((item) => counts.set(weekdayOf(item.date), (counts.get(weekdayOf(item.date)) ?? 0) + 1));
    return WEEKDAYS.map((day) => ({ day, value: counts.get(day) ?? 0 }));
  }, [appointments]);
  const maxPerDay = Math.max(1, ...perWeekday.map((item) => item.value));
  const todayLabel = weekdayOf(new Date().toISOString());
  const verifiedDoctors = doctors.filter((doctor) => doctor.status === "verified").length;

  return (
    <div className="admin-page ad-page">
      <header className="ad-head">
        <div>
          <h1>Dashboard</h1>
          <p>{dateLong.format(new Date())} · here is what is happening in the clinic.</p>
        </div>
        <div className="ad-head-actions">
          <Link className="ad-button ad-button-outline" to="/admin/appointments"><Icon name="calendar" size={18} /> Appointments</Link>
          <Link className="ad-button" to="/front-desk"><Icon name="user" size={18} /> Register patient</Link>
        </div>
      </header>

      <section className="admin-metrics-grid ad-stats" aria-label="Platform metrics">
        <Stat icon="users" tone="is-blue" label="Total users" value={loading ? "—" : metrics?.totalUsers ?? 0} note={metrics ? `${metrics.patients} patients · ${metrics.admins} admins` : "Loading user totals…"} />
        <Stat icon="user" tone="is-violet" label="Patients" value={loading ? "—" : metrics?.patients ?? 0} note="Patient accounts" />
        <Stat icon="stethoscope" tone="is-green" label="Doctors" value={loading ? "—" : metrics?.doctors ?? 0} note={`${verifiedDoctors} with an office listed`} />
        <Stat icon="calendar" tone="is-pink" label="Booked visits" value={loading ? "—" : metrics?.appointments ?? 0} note="Currently booked appointments" />
      </section>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <section className="ad-grid">
        <article className="admin-panel ad-panel ad-appointments">
          <div className="admin-panel-header">
            <div><h2>Upcoming appointments</h2><p className="ad-muted">Next booked visits across all doctors</p></div>
            <Link to="/admin/appointments">View all</Link>
          </div>
          {appointments.length === 0 ? (
            <p className="ad-empty">{loading ? "Loading appointments…" : "No booked appointments yet."}</p>
          ) : (
            <ul className="ad-appointment-list">
              {appointments.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <span className="ad-avatar" aria-hidden="true">{initials(item.patient)}</span>
                  <div><strong>{item.patient}</strong><small>{item.doctor} · {item.specialty}</small></div>
                  <span className="ad-time"><Icon name="clock" size={15} /> {dayShort.format(new Date(item.date))}, {timeShort.format(new Date(item.date))}</span>
                  <span className="admin-status admin-status-active">Booked</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="admin-panel ad-panel">
          <div className="admin-panel-header"><div><h2>Bookings by weekday</h2><p className="ad-muted">Upcoming booked visits</p></div></div>
          <div className="admin-chart ad-chart" role="img" aria-label={`Booked visits per weekday: ${perWeekday.map((item) => `${item.day} ${item.value}`).join(", ")}`}>
            {perWeekday.map((item) => (
              <div key={item.day} className="admin-chart-bar-wrap">
                <span className="ad-bar-value">{item.value}</span>
                <span className="admin-chart-bar" style={{ height: `${Math.max(4, (item.value / maxPerDay) * 100)}%` }} data-active={item.day === todayLabel} />
                <small>{item.day}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="ad-grid ad-grid-even">
        <article className="admin-panel ad-panel">
          <div className="admin-panel-header"><h2>New users</h2><Link to="/admin/users">View all users</Link></div>
          <ul className="admin-list">
            {metrics?.recentUsers.length ? metrics.recentUsers.map((user) => (
              <li key={user.id}>
                <span className="ad-avatar" aria-hidden="true">{`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()}</span>
                <div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div>
                <span className="admin-status admin-status-muted">{user.role.replace("_", " ").toLowerCase()}</span>
              </li>
            )) : <li><div><strong>No users yet</strong><small>New accounts will appear here.</small></div></li>}
          </ul>
        </article>

        <article className="admin-panel ad-panel">
          <div className="admin-panel-header"><h2>Doctors</h2><Link to="/admin/doctors">Review doctors</Link></div>
          <ul className="admin-list">
            {doctors.length ? doctors.slice(0, 5).map((doctor) => (
              <li key={doctor.id}>
                <span className="ad-avatar" aria-hidden="true">{initials(doctor.name)}</span>
                <div><strong>{doctor.name}</strong><small>{doctor.specialty}{doctor.office ? ` · ${doctor.office}` : ""}</small></div>
                <span className={`admin-status ${doctor.status === "verified" ? "admin-status-active" : "admin-status-pending"}`}>{doctor.status === "verified" ? "Office listed" : "No office"}</span>
              </li>
            )) : <li><div><strong>{loading ? "Loading doctors…" : "No doctors yet"}</strong><small>Doctor accounts will appear here.</small></div></li>}
          </ul>
        </article>
      </section>
    </div>
  );
}
