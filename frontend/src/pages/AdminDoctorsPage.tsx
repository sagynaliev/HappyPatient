import { useEffect, useState } from "react";
import { AdminDoctorRecord, authApi } from "../lib/api";

export default function AdminDoctorsPage() {
  const [doctors, setDoctors] = useState<AdminDoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await authApi.adminDoctors();
        setDoctors(result.doctors);
        if (result.doctors[0]) setSelectedId(result.doctors[0].id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load doctor verification queue.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedId) ?? doctors[0] ?? null;

  async function decision(action: "approve" | "reject") {
    if (!selectedDoctor) return;
    try {
      if (action === "approve") {
        await authApi.adminApproveDoctor(selectedDoctor.id, "Document matches the submitted identity and specialty.");
      } else {
        await authApi.adminRejectDoctor(selectedDoctor.id, "Please provide a valid professional license. The submitted document has expired.");
      }
      setDoctors((current) => current.map((doctor) => doctor.id === selectedDoctor.id ? ({ ...doctor, status: action === "approve" ? "verified" : "rejected" }) : doctor));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update verification status.");
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header-panel">
        <div>
          <p className="admin-eyebrow">Doctor review</p>
          <h1>Doctors</h1>
        </div>
      </header>

      <section className="admin-two-column admin-approval-layout">
        <div className="admin-panel admin-table-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialty</th>
                <th>Status</th>
                <th>Office</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}>Loading doctor queue…</td></tr>
              ) : error ? (
                <tr><td colSpan={4}>{error}</td></tr>
              ) : doctors.length === 0 ? (
                <tr><td colSpan={4}>No doctor applications found.</td></tr>
              ) : (
                doctors.map((doctor) => (
                  <tr key={doctor.id} onClick={() => setSelectedId(doctor.id)} className={selectedDoctor?.id === doctor.id ? "is-selected" : ""}>
                    <td>{doctor.name}</td>
                    <td>{doctor.specialty}</td>
                    <td><span className={`admin-status ${doctor.status === "verified" ? "admin-status-active" : doctor.status === "rejected" ? "admin-status-danger" : "admin-status-pending"}`}>{doctor.status}</span></td>
                    <td>{doctor.office ?? "Not set"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="admin-panel admin-inspector">
          {selectedDoctor ? (
            <>
              <div className="admin-panel-header">
                <h2>Verification review</h2>
              </div>
              <div className="admin-doctor-meta">
                <h3>{selectedDoctor.name}</h3>
                <p>{selectedDoctor.specialty} · {selectedDoctor.office || "Almaty"}</p>
                <small>License KZ-MDR-DEMO-0241 · expires 31 Dec 2027</small>
              </div>

              <div className="admin-doc-card">
                <strong>Professional license.pdf</strong>
                <button className="admin-link-button" type="button">Open document preview</button>
              </div>

              <div className="admin-checklist">
                <label><input type="checkbox" checked readOnly /> Identity matches verification request</label>
                <label><input type="checkbox" checked readOnly /> License and specialty validated</label>
              </div>

              <label className="admin-field admin-field-wide">
                <span>Internal decision note</span>
                <textarea readOnly value="Document matches the submitted identity and specialty." />
              </label>

              <div className="admin-action-row admin-action-row-spread">
                <button className="admin-primary-button" type="button" onClick={() => void decision("approve")}>Approve</button>
                <button className="admin-danger-button" type="button" onClick={() => void decision("reject")}>Reject</button>
                <button className="admin-secondary-button" type="button">Request Info</button>
              </div>
            </>
          ) : <p className="admin-muted">Select a doctor record.</p>}
        </aside>
      </section>
    </div>
  );
}
