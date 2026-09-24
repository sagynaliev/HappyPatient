import { useEffect, useState } from "react";
import { api, User } from "../lib/api";
export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    api<{ users: User[] }>("/admin/users")
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);
  return (
    <div className="page">
      <p className="eyebrow">Administration</p>
      <h1 className="page-heading">User overview</h1>
      <p className="lead">Manage the HappyPatient community.</p>
      <section className="panel admin-table">
        <h2>
          Registered users <span className="tag">{users.length}</span>
        </h2>
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
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.firstName} {u.lastName}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className="tag">{u.role}</span>
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
