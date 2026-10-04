import { useEffect, useState } from "react";
import { api, User } from "../lib/api";
export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api<{ users: User[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  const patientCount = users.filter((user) => user.role === 'PATIENT').length;
  const doctorCount = users.filter((user) => user.role === 'DOCTOR').length;
  const adminCount = users.filter((user) => user.role === 'ADMIN').length;

  return (
    <div className="page admin-page">
      <div className="dashboard-hero admin-hero">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Operations overview</h1>
          <p className="lead">Manage the HappyPatient community and keep your care network running smoothly.</p>
        </div>
        <div className="profile-pill">
          <div className="profile-avatar">HP</div>
          <div>
            <strong>System status</strong>
            <span>All services active</span>
          </div>
        </div>
      </div>

      <div className="metric-row admin-summary">
        <div className="metric-card">
          <span>Total users</span>
          <strong>{users.length}</strong>
          <small>Registered accounts</small>
        </div>
        <div className="metric-card">
          <span>Patients</span>
          <strong>{patientCount}</strong>
          <small>Active patient base</small>
        </div>
        <div className="metric-card">
          <span>Doctors</span>
          <strong>{doctorCount}</strong>
          <small>Care providers</small>
        </div>
        <div className="metric-card">
          <span>Admins</span>
          <strong>{adminCount}</strong>
          <small>Platform managers</small>
        </div>
      </div>

      <section className="panel admin-table">
        <div className="panel-title panel-title-spread">
          <h2>Registered users</h2>
          <span className="tag">{users.length}</span>
        </div>

        {users.length === 0 ? (
          <p className="muted">Loading users…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className="tag tag-role">{user.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
