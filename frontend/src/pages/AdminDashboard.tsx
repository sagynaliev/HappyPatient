import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminMetrics, authApi } from "../lib/api";

const chartDays = [
  { label: "Mon", value: 12 },
  { label: "Tue", value: 16 },
  { label: "Wed", value: 10 },
  { label: "Thu", value: 18 },
  { label: "Fri", value: 14 },
  { label: "Sat", value: 9 },
  { label: "Sun", value: 13 },
];

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError("");
        const result = await authApi.adminMetrics();
        setMetrics(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load platform metrics.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header-panel">
        <div>
          <p className="admin-eyebrow">Platform overview</p>
          <h1>Admin Dashboard</h1>
        </div>
        <p className="admin-subtitle">Thursday, 22 October 2026</p>
      </header>

      <section className="admin-metrics-grid" aria-label="Platform metrics">
        <article className="admin-metric-card">
          <span>Total Users</span>
          <strong>{loading ? "—" : metrics?.totalUsers ?? 0}</strong>
          <small>{metrics ? `${metrics.patients} patients · ${metrics.doctors} doctors · ${metrics.admins} admins` : "Loading user totals…"}</small>
        </article>
        <article className="admin-metric-card">
          <span>Patients</span>
          <strong>{loading ? "—" : metrics?.patients ?? 0}</strong>
          <small>Patient accounts</small>
        </article>
        <article className="admin-metric-card">
          <span>Doctors</span>
          <strong>{loading ? "—" : metrics?.doctors ?? 0}</strong>
          <small>{metrics ? `${metrics.pendingReviews} pending review` : "Waiting on review"}</small>
        </article>
        <article className="admin-metric-card">
          <span>Appointments</span>
          <strong>{loading ? "—" : metrics?.appointments ?? 0}</strong>
          <small>All-time scheduled visits</small>
        </article>
      </section>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <section className="admin-content-grid">
        <article className="admin-panel admin-chart-panel">
          <div className="admin-panel-header">
            <h2>Appointment activity</h2>
          </div>
          <div className="admin-chart" aria-label="Weekly appointment activity chart">
            {chartDays.map((day) => (
              <div key={day.label} className="admin-chart-bar-wrap">
                <span className="admin-chart-bar" style={{ height: `${(day.value / 18) * 100}%` }} data-active={day.label === "Thu"} />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
          <p className="admin-caption">8 pending · 54 confirmed · 26 completed · 4 cancelled</p>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent activity</h2>
          </div>
          <ul className="admin-feed">
            <li><span>10:12</span><strong>Appointment confirmed</strong><em>HP-261022-1042</em></li>
            <li><span>09:48</span><strong>Doctor review submitted</strong><em>Dr. Timur Akhmetov</em></li>
            <li><span>09:15</span><strong>Patient account created</strong><em>Ayana A.</em></li>
          </ul>
        </article>
      </section>

      <section className="admin-content-grid lower-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <h2>Users summary</h2>
            <Link to="/admin/users">View all users</Link>
          </div>
          <ul className="admin-list">
            {metrics?.recentUsers.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.firstName} {user.lastName}</strong>
                  <small>{user.email}</small>
                </div>
                <span className="admin-status admin-status-active">{user.role}</span>
              </li>
            )) ?? [
              <li key="empty"><div><strong>No users</strong><small>No recent user activity</small></div></li>,
            ]}
          </ul>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <h2>Doctors summary</h2>
            <Link to="/admin/doctors">Review doctors</Link>
          </div>
          <ul className="admin-list">
            <li><div><strong>Dr. Timur Akhmetov</strong><small>Cardiologist · Almaty</small></div><span className="admin-status admin-status-pending">Pending</span></li>
            <li><div><strong>Dr. Anna Zhumabekova</strong><small>Neurologist · Astana</small></div><span className="admin-status admin-status-verified">Verified</span></li>
            <li><div><strong>Dr. Farid Tulegen</strong><small>Orthodontist · Almaty</small></div><span className="admin-status admin-status-amber">Needs info</span></li>
          </ul>
        </article>
      </section>
    </div>
  );
}
