import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DoctorProfile, ScheduleSlot, authApi } from "../lib/api";

const today = () => new Date().toISOString().slice(0, 10);
const displayTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default function Schedule() {
  const { user } = useAuth();
  const location = useLocation();
  const { doctorId } = useParams();
  const isDoctor = user?.role === "DOCTOR";
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [office, setOffice] = useState("");
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selected, setSelected] = useState<ScheduleSlot | null>(null);
  const [patientId, setPatientId] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      let targetDoctorId = doctorId;
      if (isDoctor) {
        const result = await authApi.doctorProfile();
        setDoctor(result.doctor);
        setOffice(result.doctor.office || "");
        targetDoctorId = result.doctor.id;
      }
      if (!targetDoctorId) throw new Error("Doctor schedule is unavailable.");
      const result = await authApi.getSchedule(targetDoctorId, date);
      setSlots(result.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [date, doctorId, isDoctor]);

  async function saveOffice(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await authApi.updateOffice(office);
      setDoctor(result.doctor);
      setMessage("Office location saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save office location.");
    } finally { setBusy(false); }
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await authApi.createSchedule({ date, startTime, endTime });
      setMessage(`${result.created} 30-minute slots added.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create this schedule.");
    } finally { setBusy(false); }
  }

  async function openDetails(slot: ScheduleSlot) {
    setError("");
    try {
      const result = await authApi.slotDetails(slot.id);
      setSelected(result.slot);
      setPatientId(result.slot.patient?.id || "");
      setVisitPurpose(result.slot.visitPurpose || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load slot details.");
    }
  }

  async function bookSelectedSlot(event: FormEvent) {
    event.preventDefault();
    if (!doctorId || !selected) return;
    setError("");
    setBusy(true);
    try {
      const result = await authApi.bookSlot(doctorId, selected.id, visitPurpose);
      setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, ...result.slot } : slot));
      setSelected(null);
      setMessage("Appointment booked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to book this slot.");
    } finally { setBusy(false); }
  }

  async function updateSlot(slot: ScheduleSlot, status: ScheduleSlot["status"], booking?: { patientId: string; visitPurpose: string }) {
    setError("");
    setMessage("");
    try {
      const result = await authApi.updateSlot(slot.id, { status, ...booking });
      setSlots((current) => current.map((item) => item.id === slot.id ? { ...item, ...result.slot } : item));
      if (selected?.id === slot.id) setSelected({ ...selected, ...result.slot });
      setMessage("Slot status updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update this slot.");
    }
  }

  const doctorName = (location.state as { doctorName?: string } | null)?.doctorName || "Doctor";
  return <div className="page schedule-page">
    <p className="eyebrow">{isDoctor ? "Doctor calendar" : "Doctor availability"}</p>
    <h1 className="page-heading">{isDoctor ? "Work schedule" : `${doctorName} schedule`}</h1>
    <p className="lead">Appointment times are shown in UTC.</p>
    {error && <div className="alert error" role="alert">{error}</div>}
    {message && <div className="alert success" role="status">{message}</div>}

    {isDoctor && <div className="schedule-setup">
      <form className="schedule-office" onSubmit={saveOffice}>
        <label className="schedule-label">Office / location<input value={office} onChange={(event) => setOffice(event.target.value)} maxLength={200} required placeholder="Clinic, city, or address" /></label>
        <button className="button" disabled={busy}>Save location</button>
      </form>
      <form className="schedule-create" onSubmit={createSchedule}>
        <label className="schedule-label">Date<input type="date" value={date} min={today()} onChange={(event) => setDate(event.target.value)} required /></label>
        <label className="schedule-label">Start<input type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
        <label className="schedule-label">End<input type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
        <button className="button" disabled={busy}>Create 30-minute slots</button>
      </form>
    </div>}

    <div className="schedule-toolbar">
      <label className="schedule-label">Schedule date<input type="date" value={date} min={!isDoctor ? today() : undefined} onChange={(event) => setDate(event.target.value)} /></label>
      <span>{slots.length} {slots.length === 1 ? "slot" : "slots"}</span>
    </div>
    {loading ? <p className="schedule-state" role="status">Loading schedule…</p> : slots.length === 0 ? <div className="empty schedule-state"><h2>No schedule published</h2><p>{isDoctor ? "Create availability for this date to get started." : "There are no available times for this date."}</p></div> : <div className="schedule-layout">
      <div className="schedule-list" aria-label="Appointment slots">{slots.map((slot) => <article className="schedule-slot" key={slot.id}>
        <div><strong>{displayTime(slot.startAt)} – {displayTime(slot.endAt)}</strong><span className={`slot-status ${slot.status.toLowerCase()}`}>{slot.status.toLowerCase()}</span></div>
        {isDoctor ? <div className="slot-actions"><button className="text-link" onClick={() => void openDetails(slot)}>Details</button>{slot.status === "FREE" && <button className="text-link" onClick={() => void updateSlot(slot, "OCCUPIED")}>Mark occupied</button>}{slot.status !== "FREE" && <button className="text-link" onClick={() => void updateSlot(slot, "FREE")}>Mark free</button>}</div> : slot.status === "FREE" ? <button className="button button-outline" disabled={busy} onClick={() => { setSelected(slot); setVisitPurpose(""); }}>Book this slot</button> : null}
      </article>)}</div>
      {isDoctor && selected && <aside className="slot-detail" aria-live="polite"><div className="panel-title"><h2>Slot details</h2><button className="text-link" onClick={() => setSelected(null)} aria-label="Close slot details">Close</button></div><p><strong>{displayTime(selected.startAt)} – {displayTime(selected.endAt)}</strong></p><p>Status: <span className={`slot-status ${selected.status.toLowerCase()}`}>{selected.status.toLowerCase()}</span></p>{selected.patient ? <p>Patient: {selected.patient.firstName} {selected.patient.lastName}<br />{selected.patient.email}</p> : <p>No patient assigned.</p>}
        <form onSubmit={(event) => { event.preventDefault(); void updateSlot(selected, "BOOKED", { patientId, visitPurpose }); }}>
          <label className="schedule-label">Patient account ID<input value={patientId} onChange={(event) => setPatientId(event.target.value)} required /></label>
          <label className="schedule-label">Visit purpose<input value={visitPurpose} onChange={(event) => setVisitPurpose(event.target.value)} maxLength={300} required /></label>
          <button className="button" disabled={busy}>Save as booked</button>
        </form>
      </aside>}
      {!isDoctor && selected && <aside className="slot-detail" aria-live="polite"><div className="panel-title"><h2>Book appointment</h2><button className="text-link" onClick={() => setSelected(null)} aria-label="Close booking form">Close</button></div><p>{displayTime(selected.startAt)} – {displayTime(selected.endAt)} UTC</p><form onSubmit={bookSelectedSlot}><label className="schedule-label">Visit purpose<input value={visitPurpose} onChange={(event) => setVisitPurpose(event.target.value)} maxLength={300} required /></label><button className="button" disabled={busy}>Confirm appointment</button></form></aside>}
    </div>}
    {!isDoctor && <p className="schedule-back"><Link to="/search">Back to doctor search</Link></p>}
  </div>;
}