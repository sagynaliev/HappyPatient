import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DoctorProfile, ScheduleSlot, authApi } from "../lib/api";

const today = () => new Date().toISOString().slice(0, 10);
const displayTime = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

function getWeekDates(weekDate: string, selectedWeekdays: number[]) {
  const monday = new Date(`${weekDate}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return selectedWeekdays
    .map((weekday) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + ((weekday + 6) % 7));
      return date.toISOString().slice(0, 10);
    })
    .sort();
}

export default function Schedule() {
  const { user } = useAuth();
  const location = useLocation();
  const { doctorId } = useParams();
  const isDoctor = user?.role === "DOCTOR";
  const routeState = location.state as { doctorName?: string; specialty?: string; office?: string; selectedSlotId?: string } | null;
  const searchParams = new URLSearchParams(location.search);
  const doctorMeta = routeState ?? null;
  const selectedSlotId = routeState?.selectedSlotId || searchParams.get("slot") || undefined;
  const requestedDate = searchParams.get("date");
  const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [office, setOffice] = useState("");
  const [date, setDate] = useState(initialDate);
  const [scheduleWeek, setScheduleWeek] = useState(today());
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
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
  const refreshRequest = useRef(0);
  const statusLabel = (status: ScheduleSlot["status"]) => {
    switch (status) {
      case "FREE": return "Free";
      case "BOOKED": return "Booked";
      case "OCCUPIED": return "Occupied";
      default: return status;
    }
  };

  async function refresh() {
    const requestId = ++refreshRequest.current;
    setLoading(true);
    setError("");
    if (!selectedSlotId) setSelected(null);
    try {
      let targetDoctorId = doctorId;
      if (isDoctor) {
        const result = await authApi.doctorProfile();
        if (requestId !== refreshRequest.current) return;
        setDoctor(result.doctor);
        setOffice(result.doctor.office || "");
        targetDoctorId = result.doctor.id;
      }
      if (!targetDoctorId) throw new Error("Doctor schedule is unavailable.");
      const result = await authApi.getSchedule(targetDoctorId, date);
      if (requestId !== refreshRequest.current) return;
      if (!isDoctor) setDoctor(result.doctor);
      setSlots(result.slots);
      if (selectedSlotId) {
        const requestedSlot = result.slots.find((slot) => slot.id === selectedSlotId);
        setSelected(
          requestedSlot?.status === "FREE" && Date.parse(requestedSlot.startAt) > Date.now()
            ? requestedSlot
            : null,
        );
      }
    } catch (err) {
      if (requestId === refreshRequest.current) {
        setError(err instanceof Error ? err.message : "Unable to load this schedule.");
      }
    } finally {
      if (requestId === refreshRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) setDate(requestedDate);
  }, [requestedDate]);

  useEffect(() => {
    void refresh();
    return () => { refreshRequest.current += 1; };
  }, [date, doctorId, isDoctor, selectedSlotId]);

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
    const selectedDates = getWeekDates(scheduleWeek, workingDays).filter((workingDate) => workingDate >= today());
    if (!selectedDates.length) {
      setError("Choose at least one future working day in this week.");
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.createWorkingDays({ dates: selectedDates, startTime, endTime });
      const selectedDayNames = selectedDates.map((workingDate) =>
        new Date(`${workingDate}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      );
      setMessage(`Schedule created — ${result.created} slots across ${selectedDayNames.join(", ")} (${startTime}–${endTime}).`);
      const firstDate = selectedDates[0];
      setDate(firstDate);
      if (firstDate === date) await refresh();
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
        date: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
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

  const doctorName = doctorMeta?.doctorName
    || (doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : "Doctor");
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const freeSlotCount = slots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > Date.now()).length;
  const workingHours = slots.length
    ? `${displayTime(slots[0].startAt)}–${displayTime(slots[slots.length - 1].endAt)}`
    : "Not published";

  return (
    <div className="page schedule-page">
      <p className="eyebrow">{isDoctor ? "Doctor calendar" : "Doctor availability"}</p>
      <h1 className="page-heading">{isDoctor ? "Work schedule" : `${doctorName} schedule`}</h1>
      <p className="lead">{isDoctor ? "Set working days, hours, and appointment availability." : "Choose a date to view available appointment times."}</p>

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

      {!isDoctor && doctor && (
        <section className="doctor-profile-sheet" aria-label="Doctor profile summary">
          <div className="doctor-profile-header">
            <div>
              <p className="eyebrow mini-eyebrow">Doctor profile</p>
              <h2>{doctorName}</h2>
            </div>
            <span className="availability-pill">Open schedule</span>
          </div>

          <div className="doctor-profile-meta">
            <span>{doctorMeta?.specialty || doctor.category.name}</span>
            <span>{doctorMeta?.office || doctor.office || "Location available on request"}</span>
          </div>

          <div className="doctor-profile-grid">
            <div className="detail-item">
              <strong>Selected day</strong>
              <span>{formattedDate}</span>
            </div>
            <div className="detail-item">
              <strong>Working hours</strong>
              <span>{workingHours}</span>
            </div>
            <div className="detail-item">
              <strong>Available appointments</strong>
              <span>{freeSlotCount}</span>
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
              Week containing
              <input type="date" value={scheduleWeek} min={today()} onChange={(event) => setScheduleWeek(event.target.value)} required />
            </label>
            <label className="schedule-label">
              Start
              <input type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
            </label>
            <label className="schedule-label">
              End
              <input type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
            </label>
            <fieldset className="schedule-working-days">
              <legend>Working days</legend>
              <div className="schedule-weekday-options">
                {weekdays.map((weekday) => (
                  <label className="schedule-weekday-option" key={weekday.value}>
                    <input
                      type="checkbox"
                      checked={workingDays.includes(weekday.value)}
                      onChange={(event) => setWorkingDays((current) =>
                        event.target.checked
                          ? [...current, weekday.value]
                          : current.filter((day) => day !== weekday.value),
                      )}
                    />
                    <span>{weekday.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="schedule-setup-hint">Selected days in the chosen week are added. Past days are skipped. Each slot is 30 minutes.</p>
            <button className="button" disabled={busy}>{busy ? "Saving schedule…" : "Save working days"}</button>
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
                  <strong>{displayTime(selected.startAt)} – {displayTime(selected.endAt)}</strong>
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