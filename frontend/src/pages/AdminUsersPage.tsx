import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminUserRecord, authApi, Role } from "../lib/api";

const defaultForm = { firstName: "", lastName: "", email: "", phone: "", role: "PATIENT" as Role, status: "active" as "active" | "inactive" };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"ALL" | Role>("ALL");
  const [status, setStatus] = useState<"ALL" | "active" | "inactive">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await authApi.adminUsers({
        role: role === "ALL" ? undefined : role,
        status: status === "ALL" ? undefined : status,
        q: search.trim() || undefined,
      });
      setUsers(result.users);
      if (!selectedId && result.users[0]) setSelectedId(result.users[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId) ?? users[0] ?? null, [selectedId, users]);

  useEffect(() => {
    void load();
  }, [role, status]);

  useEffect(() => {
    if (!selectedUser) return;
    setDraft({
      firstName: selectedUser.firstName,
      lastName: selectedUser.lastName,
      email: selectedUser.email,
      phone: selectedUser.phone ?? "",
      role: selectedUser.role,
      status: selectedUser.status ?? "active",
    });
  }, [selectedUser]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setError("");
    try {
      await authApi.patchAdminUser(selectedUser.id, {
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email,
        phone: draft.phone || null,
        role: draft.role,
        status: draft.status,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header-panel admin-header-split">
        <div>
          <p className="admin-eyebrow">Account management</p>
          <h1>Users</h1>
        </div>
        <p className="admin-subtitle">Manage accounts and role access with clear confirmation.</p>
      </header>

      <section className="admin-panel admin-toolbar">
        <div className="admin-field admin-field-search">
          <label htmlFor="admin-user-search">Search users</label>
          <input id="admin-user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" />
        </div>
        <div className="admin-field">
          <label htmlFor="admin-role-filter">Role</label>
          <select id="admin-role-filter" value={role} onChange={(event) => setRole(event.target.value as "ALL" | Role)}>
            <option value="ALL">All roles</option>
            <option value="PATIENT">Patient</option>
            <option value="DOCTOR">Doctor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="admin-status-filter">Account status</label>
          <select id="admin-status-filter" value={status} onChange={(event) => setStatus(event.target.value as "ALL" | "active" | "inactive")}>
            <option value="ALL">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button className="admin-primary-button" type="button" onClick={() => void load()}>Apply</button>
      </section>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <section className="admin-two-column">
        <div className="admin-panel admin-table-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5}>No users found.</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} onClick={() => setSelectedId(user.id)} className={selectedUser?.id === user.id ? "is-selected" : ""}>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td><span className={`admin-status ${user.status === "inactive" ? "admin-status-muted" : "admin-status-active"}`}>{user.status ?? "active"}</span></td>
                    <td><button className="admin-link-button" type="button">View · Edit</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="admin-panel admin-inspector">
          {selectedUser ? (
            <form onSubmit={handleSubmit}>
              <div className="admin-panel-header">
                <h2>Edit user</h2>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field"><span>First name</span><input value={draft.firstName} onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                <label className="admin-field"><span>Last name</span><input value={draft.lastName} onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                <label className="admin-field"><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="admin-field"><span>Phone</span><input type="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label className="admin-field"><span>Role</span><select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Role }))}><option value="PATIENT">Patient</option><option value="DOCTOR">Doctor</option><option value="ADMIN">Admin</option></select></label>
                <label className="admin-field"><span>Account status</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              </div>
              <p className="admin-muted">Masked IIN: {selectedUser.maskedIin ?? "••••••••••42"}</p>
              <label className="admin-field admin-field-wide"><span>Change reason</span><textarea value="Validation request from account owner." readOnly /></label>
              <div className="admin-action-row">
                <button className="admin-secondary-button" type="button">Discard</button>
                <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Review changes"}</button>
              </div>
            </form>
          ) : (
            <p className="admin-muted">Select a user to review.</p>
          )}
          <div className="admin-info-banner">Role assignment updates require a documented reason and should be reviewed before change approval.</div>
        </aside>
      </section>
    </div>
  );
}
