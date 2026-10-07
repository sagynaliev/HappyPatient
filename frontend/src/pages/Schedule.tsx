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
  const doctorMeta = (location.state as { doctorName?: string; specialty?: string; office?: string } | null) ?? null;
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
  const [bookingSuccess, setBookingSuccess] = useState<{ doctorName: string; date: string; time: string; purpose: string } | null>(null);
  const statusLabel = (status: ScheduleSlot["status"]) => {
    switch (status) {
      case "FREE": return "Free";
      case "BOOKED": return "Booked";
      case "OCCUPIED": return "Occupied";
      default: return status;
    }
  };

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
      const scheduleDate = new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      setMessage(`Schedule created — ${result.created} slots created for ${scheduleDate} (${startTime}–${endTime}).`);
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
      const chosenTime = `${displayTime(selected.startAt)} – ${displayTime(selected.endAt)}`;
      setBookingSuccess({
        doctorName: doctorName,
        date: new Date(`${date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        time: chosenTime,
        purpose: visitPurpose.trim(),
      });
      setSelected(null);
      setMessage("Appointment booked.");
      setVisitPurpose("");
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

  const doctorName = doctorMeta?.doctorName || "Doctor";
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="page schedule-page">
      <p className="eyebrow">{isDoctor ? "Doctor calendar" : "Doctor availability"}</p>
      <h1 className="page-heading">{isDoctor ? "Work schedule" : `${doctorName} schedule`}</h1>
      <p className="lead">Appointment times are shown in UTC.</p>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className={`alert success${bookingSuccess ? " success-panel" : ""}`} role="status">
          {bookingSuccess ? (
            <>
              <strong>Appointment confirmed.</strong>
              <span>{bookingSuccess.doctorName}</span>
              <span>{bookingSuccess.date} · {bookingSuccess.time}</span>
              {bookingSuccess.purpose && <small>{bookingSuccess.purpose}</small>}
            </>
          ) : (
            <span>{message}</span>
          )}
        </div>
      )}

      {!isDoctor && doctorMeta && (
        <section className="doctor-profile-sheet" aria-label="Doctor profile summary">
          <div className="doctor-profile-header">
            <div>
              <p className="eyebrow mini-eyebrow">Doctor profile</p>
              <h2>{doctorName}</h2>
            </div>
            <span className="availability-pill">Open schedule</span>
          </div>

          <div className="doctor-profile-meta">
            <span>{doctorMeta.specialty || "Specialty available on request"}</span>
            <span>{doctorMeta.office || "Location available on request"}</span>
          </div>

          <div className="doctor-profile-grid">
            <div className="detail-item">
              <strong>Selected day</strong>
              <span>{formattedDate}</span>
            </div>
            <div className="detail-item">
              <strong>Care focus</strong>
              <span>{doctorMeta.specialty || "General care"}</span>
            </div>
          </div>
        </section>
      )}

      <div className="status-legend" aria-label="Appointment status legend">
        <span className="legend-item"><span className="legend-dot available" />Free</span>
        <span className="legend-item"><span className="legend-dot booked" />Booked</span>
        <span className="legend-item"><span className="legend-dot occupied" />Occupied</span>
      </div>

      {isDoctor && (
        <div className="schedule-setup">
          <form className="schedule-office" onSubmit={saveOffice}>
            <label className="schedule-label">
              Office / location
              <input value={office} onChange={(event) => setOffice(event.target.value)} maxLength={200} required placeholder="Clinic, city, or address" />
            </label>
            <button className="button" disabled={busy}>Save location</button>
          </form>

          <form className="schedule-create" onSubmit={createSchedule}>
            <label className="schedule-label">
              Date
              <input type="date" value={date} min={today()} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="schedule-label">
              Start
              <input type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
            </label>
            <label className="schedule-label">
              End
              <input type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
            </label>
            <button className="button" disabled={busy}>Create 30-minute slots</button>
          </form>
        </div>
      )}

      <div className="schedule-toolbar">
        <label className="schedule-label">
          Schedule date
          <input type="date" value={date} min={!isDoctor ? today() : undefined} onChange={(event) => setDate(event.target.value)} />
        </label>
        <span>
          {slots.length} {slots.length === 1 ? "slot" : "slots"}
        </span>
      </div>

      {loading ? (
        <p className="schedule-state" role="status">
          Loading schedule…
        </p>
      ) : slots.length === 0 ? (
        <div className="empty schedule-state">
          <h2>Schedule not available yet.</h2>
          <p>{isDoctor ? "This doctor has not added working hours yet." : "This doctor has not added working hours yet."}</p>
        </div>
      ) : (
        <div className="schedule-layout">
          <div className="schedule-list" aria-label="Appointment slots">
            {slots.map((slot) => (
              <article className={`schedule-slot slot-${slot.status.toLowerCase()}`} key={slot.id}>
                <div className="schedule-slot-header">
                  <div className="time-stack">
                    <strong>{displayTime(slot.startAt)}</strong>
                    <small>– {displayTime(slot.endAt)}</small>
                  </div>
                  <span className={`slot-status ${slot.status.toLowerCase()}`}>{statusLabel(slot.status)}</span>
                </div>

                <div className="schedule-slot-body">
                  <div className="slot-summary">
                    {slot.patient ? (
                      <span>
                        {slot.patient.firstName} {slot.patient.lastName}
                      </span>
                    ) : (
                      <span>{slot.status === "FREE" ? "Open appointment" : "No patient assigned"}</span>
                    )}
                    {slot.visitPurpose && <small>{slot.visitPurpose}</small>}
                  </div>

                  {isDoctor ? (
                    <div className="slot-actions">
                      <button className="text-link" onClick={() => void openDetails(slot)}>Details</button>
                      {slot.status === "FREE" && (
                        <button className="text-link" onClick={() => void updateSlot(slot, "OCCUPIED")}>Mark occupied</button>
                      )}
                      {slot.status !== "FREE" && (
                        <button className="text-link" onClick={() => void updateSlot(slot, "FREE")}>Mark free</button>
                      )}
                    </div>
                  ) : slot.status === "FREE" ? (
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => {
                        setSelected(slot);
                        setVisitPurpose("");
                      }}
                    >
                      Book this slot
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {isDoctor && selected && (
            <aside className="slot-detail" aria-live="polite">
              <div className="panel-title">
                <h2>Slot details</h2>
                <button className="text-link" onClick={() => setSelected(null)} aria-label="Close slot details">Close</button>
              </div>

              <p>
                <strong>
                  {displayTime(selected.startAt)} – {displayTime(selected.endAt)}
                </strong>
              </p>
              <p>
                Status: <span className={`slot-status ${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span>
              </p>

              {selected.patient ? (
                <p>
                  Patient: {selected.patient.firstName} {selected.patient.lastName}
                  <br />
                  {selected.patient.email}
                </p>
              ) : (
                <p>No patient assigned.</p>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void updateSlot(selected, "BOOKED", { patientId, visitPurpose });
                }}
              >
                <label className="schedule-label">
                  Patient account ID
                  <input value={patientId} onChange={(event) => setPatientId(event.target.value)} required />
                </label>
                <label className="schedule-label">
                  Visit purpose
                  <input value={visitPurpose} onChange={(event) => setVisitPurpose(event.target.value)} maxLength={300} required />
                </label>
                <button className="button" disabled={busy}>Save as booked</button>
              </form>
            </aside>
          )}

          {!isDoctor && selected && (
            <aside className="slot-detail" aria-live="polite">
              <div className="panel-title">
                <h2>Book appointment</h2>
                <button className="text-link" onClick={() => setSelected(null)} aria-label="Close booking form">Close</button>
              </div>

              <div className="booking-summary">
                <div className="booking-summary-row">
                  <span>Doctor</span>
                  <strong>{doctorName}</strong>
                </div>
                <div className="booking-summary-row">
                  <span>Date</span>
                  <strong>{formattedDate}</strong>
                </div>
                <div className="booking-summary-row">
                  <span>Time</span>
                  <strong>{displayTime(selected.startAt)} – {displayTime(selected.endAt)} UTC</strong>
                </div>
              </div>

              <form onSubmit={bookSelectedSlot}>
                <label className="schedule-label">
                  Visit purpose
                  <input value={visitPurpose} onChange={(event) => setVisitPurpose(event.target.value)} maxLength={300} required />
                </label>
                <button className="button" disabled={busy}>Confirm appointment</button>
              </form>
            </aside>
          )}
        </div>
      )}

      {!isDoctor && (
        <p className="schedule-back">
          <Link to="/search">Back to doctor search</Link>
        </p>
      )}
    </div>
  );
}