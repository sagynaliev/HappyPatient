import { useEffect, useState } from "react";
import { authApi } from "../lib/api";

export default function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<Array<{ id: string; patient: string; doctor: string; specialty: string; date: string; status: string; purpose?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const result = await authApi.adminAppointments();
        setAppointments(result.appointments);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load appointment activity.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header-panel">
        <div>
          <p className="admin-eyebrow">Care activity</p>
          <h1>Appointments</h1>
        </div>
      </header>

      <section className="admin-panel admin-table-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Specialty</th>
              <th>Date</th>
              <th>Status</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading appointments…</td></tr>
            ) : error ? (
              <tr><td colSpan={6}>{error}</td></tr>
            ) : appointments.length === 0 ? (
              <tr><td colSpan={6}>No appointments have been booked yet.</td></tr>
            ) : (
              appointments.map((item) => (
                <tr key={item.id}>
                  <td>{item.patient}</td>
                  <td>{item.doctor}</td>
                  <td>{item.specialty}</td>
                  <td>{new Date(item.date).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className="admin-status admin-status-active">{item.status}</span></td>
                  <td>{item.purpose || "General consultation"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
