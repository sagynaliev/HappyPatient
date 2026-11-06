import { useEffect, useMemo, useState } from "react";
import { authApi } from "../lib/api";
import { Icon } from "../components/Icons";
import "../styles/adminOperations.css";

type Appointment = { id: string; patient: string; doctor: string; specialty: string; date: string; status: string; purpose?: string | null };
type SortKey = "patient" | "doctor" | "specialty" | "date" | "status";
const columns: Array<{ key: SortKey; label: string }> = [
  { key: "patient", label: "Patient" },
  { key: "doctor", label: "Doctor" },
  { key: "specialty", label: "Specialty" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
];
const dateText = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "Booked" | "Checked in">("all");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

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

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const now = Date.now();
    return appointments
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => when === "all" || (when === "upcoming" ? Date.parse(item.date) >= now : Date.parse(item.date) < now))
      .filter((item) => !needle || [item.patient, item.doctor, item.specialty, item.purpose ?? ""].some((field) => field.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const result = sort.key === "date" ? Date.parse(a.date) - Date.parse(b.date) : String(a[sort.key]).localeCompare(String(b[sort.key]));
        return sort.dir === "asc" ? result : -result;
      });
  }, [appointments, search, status, when, sort]);

  const toggleSort = (key: SortKey) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  const filtered = Boolean(search.trim()) || status !== "all" || when !== "all";

  return (
    <div className="admin-page">
      <header className="admin-header-panel">
        <div>
          <p className="admin-eyebrow">Care activity</p>
          <h1>Appointments</h1>
        </div>
      </header>

      <section className="admin-panel admin-table-panel">
        <div className="ad-appts-toolbar" role="search" aria-label="Find appointments">
          <label className="ad-appts-search"><Icon name="search" size={16} /><span className="sr-only">Search appointments</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, doctor, specialty or purpose" /></label>
          <label className="ad-appts-select"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="Booked">Booked</option><option value="Checked in">Checked in</option></select></label>
          <label className="ad-appts-select"><span className="sr-only">When</span><select value={when} onChange={(event) => setWhen(event.target.value as typeof when)}><option value="all">Any date</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select></label>
          <span className="ad-appts-count" aria-live="polite">{loading ? "" : filtered ? `${visible.length} of ${appointments.length}` : `${appointments.length} appointments`}</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} aria-sort={sort.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className={`ad-sort${sort.key === column.key ? " is-active" : ""}`} onClick={() => toggleSort(column.key)}>
                    {column.label}<span aria-hidden="true">{sort.key === column.key ? (sort.dir === "asc" ? " ↑" : " ↓") : " ↕"}</span>
                  </button>
                </th>
              ))}
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
            ) : visible.length === 0 ? (
              <tr><td colSpan={6}>No appointments match these filters.</td></tr>
            ) : (
              visible.map((item) => (
                <tr key={item.id}>
                  <td>{item.patient}</td>
                  <td>{item.doctor}</td>
                  <td>{item.specialty}</td>
                  <td>{dateText(item.date)}</td>
                  <td><span className={`admin-status ${item.status === "Checked in" ? "admin-status-active" : "admin-status-booked"}`}>{item.status}</span></td>
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
