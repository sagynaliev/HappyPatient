import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PatientBookingFlow from "../components/PatientBookingFlow";
import DoctorLocation from "../components/DoctorLocation";
import ScheduleMatrix from "../components/ScheduleMatrix";
import { SlotManagementModal } from "../components/SlotManagementModal";
import { DoctorProfile, ScheduleSlot, authApi } from "../lib/api";
import { notifyNotificationsChanged } from "../lib/notificationEvents";
import { AddAvailabilityModal } from "../components/AddAvailabilityModal";
import "../styles/providerAvailabilityDialog.css";

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const displayTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(value));
const displayDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date(value));
const almatyDateTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(value));
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { doctorId } = useParams();
  const isDoctor = user?.role === "DOCTOR";
  const routeState = location.state as {
    doctorName?: string;
    specialty?: string;
    office?: string;
    city?: string | null;
    clinicName?: string | null;
    streetAddress?: string | null;
    officeNumber?: string | null;
    selectedSlotId?: string;
    consultationFee?: number;
  } | null;
  const doctorMeta = routeState ?? null;
  const selectedSlotId = routeState?.selectedSlotId || searchParams.get("slot") || undefined;
  const requestedDate = searchParams.get("date");
  const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [office, setOffice] = useState("");
  const [date, setDate] = useState(initialDate);
  const [scheduleView, setScheduleView] = useState<"day" | "week">(user?.role === "DOCTOR" ? "week" : "day");
  const [scheduleWeek, setScheduleWeek] = useState(today());
  const [availabilityFormOpen, setAvailabilityFormOpen] = useState(searchParams.get("addAvailability") === "1");
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selected, setSelected] = useState<ScheduleSlot | null>(null);
  const [patientId, setPatientId] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [slotDetailsLoading, setSlotDetailsLoading] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slotMessage, setSlotMessage] = useState("");
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState<{
    doctorName: string;
    date: string;
    time: string;
    purpose: string;
    slot: ScheduleSlot;
  } | null>(null);
  const refreshRequest = useRef(0);
  const slotDetailsRequest = useRef(0);
  const availabilityTriggerRef = useRef<HTMLButtonElement>(null);
  const bookingInFlight = useRef(false);
  const initialSelectionApplied = useRef(false);
  const statusLabel = (status: ScheduleSlot["status"]) => {
    switch (status) {
      case "FREE": return "Free";
      case "BOOKED": return "Booked";
      case "OCCUPIED": return "Occupied";
      default: return status;
    }
  };
  function clearSlotSelection() {
    slotDetailsRequest.current += 1;
    setSelected(null);
    setSlotDetailsLoading(false);
    setConfirmingRelease(false);
  }

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequest.current;
    setLoading(true);
    setError("");
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
      const scheduleDates = isDoctor && scheduleView === "week"
        ? getWeekDates(date, weekdays.map(({ value }) => value))
        : [date];
      const results = isDoctor
        ? await Promise.all(scheduleDates.map((scheduleDate) => authApi.getSchedule(targetDoctorId!, scheduleDate)))
        : [await authApi.getSchedule(targetDoctorId!)];
      if (requestId !== refreshRequest.current) return;
      if (!isDoctor) setDoctor(results[0].doctor);
      setSlots(results.flatMap((result) => result.slots).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)));
      if (selectedSlotId && !initialSelectionApplied.current) {
        const requestedSlot = results.flatMap((result) => result.slots).find((slot) => slot.id === selectedSlotId);
        setSelected(
          requestedSlot?.status === "FREE" && Date.parse(requestedSlot.startAt) > Date.now()
            ? requestedSlot
            : null,
        );
        initialSelectionApplied.current = true;
      }
    } catch (err) {
      if (requestId === refreshRequest.current) {
        setError(err instanceof Error ? err.message : "Unable to load this schedule.");
      }
    } finally {
      if (requestId === refreshRequest.current) setLoading(false);
    }
  }, [date, doctorId, isDoctor, scheduleView, selectedSlotId]);

  useEffect(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setDate(requestedDate);
      if (isDoctor) setScheduleWeek(requestedDate);
    }
  }, [isDoctor, requestedDate]);

  useEffect(() => {
    setAvailabilityFormOpen(searchParams.get("addAvailability") === "1");
  }, [searchParams]);

  useEffect(() => {
    initialSelectionApplied.current = false;
    clearSlotSelection();
  }, [doctorId]);

  useEffect(() => {
    void refresh();
    return () => { refreshRequest.current += 1; };
  }, [refresh]);

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
    setAvailabilityError("");
    setMessage("");
    const selectedDates = getWeekDates(scheduleWeek, workingDays).filter((workingDate) => workingDate >= today());
    if (!selectedDates.length) {
      setAvailabilityError("Choose at least one future working day in this week.");
      return;
    }
    if (startTime >= endTime) {
      setAvailabilityError("End time must be later than start time.");
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
      closeAvailabilityDialog();
      if (firstDate === date) await refresh();
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : "Unable to create this schedule.");
    } finally { setBusy(false); }
  }

  function openAvailabilityDialog() {
    setAvailabilityError("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("addAvailability", "1");
      return next;
    });
  }

  function closeAvailabilityDialog() {
    if (busy) return;
    setAvailabilityFormOpen(false);
    setAvailabilityError("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("addAvailability");
      return next;
    });
  }

  async function openDetails(slot: ScheduleSlot) {
    const requestId = ++slotDetailsRequest.current;
    setSelected(slot);
    setSlotError("");
    setSlotMessage("");
    setConfirmingRelease(false);
    setSlotDetailsLoading(true);
    setPatientId("");
    setVisitPurpose("");
    try {
      const result = await authApi.slotDetails(slot.id);
      if (requestId !== slotDetailsRequest.current) return;
      setSelected(result.slot);
      setPatientId(result.slot.patient?.id || "");
      setVisitPurpose(result.slot.visitPurpose || "");
    } catch (err) {
      if (requestId === slotDetailsRequest.current) {
        setSlotError(err instanceof Error ? err.message : "Unable to load slot details.");
      }
    } finally {
      if (requestId === slotDetailsRequest.current) setSlotDetailsLoading(false);
    }
  }

  function closeSlotModal() {
    if (busy) return;
    clearSlotSelection();
    setSlotError("");
    setSlotMessage("");
    setConfirmingRelease(false);
  }

  async function bookSelectedSlot(event: FormEvent) {
    event.preventDefault();
    if (bookingInFlight.current || !doctorId || !selected) return;
    if (selected.status !== "FREE" || Date.parse(selected.startAt) <= Date.now()) {
      setError("That time is no longer available. Choose another available time.");
      clearSlotSelection();
      return;
    }
    setError("");
    setMessage("");
    setBookingSuccess(null);
    bookingInFlight.current = true;
    setBusy(true);
    try {
      const result = await authApi.bookSlot(doctorId, selected.id, visitPurpose);
      notifyNotificationsChanged();
      setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, ...result.slot } : slot));
      const chosenTime = `${displayTime(selected.startAt)} – ${displayTime(selected.endAt)}`;
      setBookingSuccess({
        doctorName: doctorName,
        date: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: chosenTime,
        purpose: visitPurpose.trim(),
        slot: result.slot,
      });
      clearSlotSelection();
      setMessage("Appointment booked.");
      setVisitPurpose("");
    } catch (err) {
      if (typeof err === "object" && err !== null && "status" in err && err.status === 409) {
        setError("That time is no longer available. Choose another available time.");
        clearSlotSelection();
      } else {
        setError(err instanceof Error ? err.message : "Unable to book this slot.");
      }
    } finally {
      bookingInFlight.current = false;
      setBusy(false);
    }
  }

  async function updateSlot(slot: ScheduleSlot, status: ScheduleSlot["status"], releaseBooking = false, cancellationReason?: string) {
    if (busy) return;
    setSlotError("");
    setSlotMessage("");
    setBusy(true);
    try {
      const result = await authApi.updateSlot(slot.id, {
        status,
        ...(status === "BOOKED" ? { patientId, visitPurpose } : {}),
        ...(releaseBooking ? { releaseBooking: true, cancellationReason } : {}),
      });
      setSlots((current) => current.map((item) => item.id === slot.id ? { ...item, ...result.slot } : item));
      if (selected?.id === slot.id) setSelected({ ...selected, ...result.slot });
      setSlotMessage(status === "FREE" && releaseBooking ? "Appointment released. The slot is now available." : "Slot status updated.");
      setConfirmingRelease(false);
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : "Unable to update this slot.");
    } finally {
      setBusy(false);
    }
  }

  function moveScheduleDate(days: number) {
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    const next = nextDate.toISOString().slice(0, 10);
    setDate(next);
    setScheduleWeek(next);
    clearSlotSelection();
    setSlotError("");
    setSlotMessage("");
  }

  const doctorName = doctorMeta?.doctorName
    || (doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : "Doctor");
  const refreshAvailability = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (!isDoctor && user && doctorId && doctor) {
    return (
      <PatientBookingFlow
        doctor={doctor}
        doctorName={doctorName}
        consultationFee={routeState?.consultationFee}
        patient={user}
        date={date}
        onDateChange={(nextDate) => {
          setDate(nextDate);
          clearSlotSelection();
          initialSelectionApplied.current = true;
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("date", nextDate);
            next.delete("slot");
            return next;
          });
        }}
        slots={slots}
        refreshing={loading}
        selectedSlot={selected}
        onSelectSlot={(slot) => {
          setSelected(slot);
          setError("");
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("slot", slot.id);
            return next;
          });
        }}
        visitPurpose={visitPurpose}
        onVisitPurposeChange={setVisitPurpose}
        busy={busy}
        error={error}
        bookingSuccess={bookingSuccess}
        onConfirm={bookSelectedSlot}
        onSlotTaken={refreshAvailability}
      />
    );
  }

  if (!isDoctor && user && doctorId && !doctor) {
    return (
      <main className="bk-page">
        <div className="bk-container">
          {loading ? (
            <section className="bk-card bk-load-state" role="status" aria-live="polite">
              <span className="bk-loading-mark" aria-hidden="true" />
              <h1>Loading appointment details</h1>
              <p>Retrieving the doctor’s schedule and available appointment times.</p>
            </section>
          ) : (
            <section className="bk-card bk-load-state" role="alert">
              <h1>Booking details unavailable</h1>
              <p>{error || "Unable to load this doctor’s appointment schedule."}</p>
              <button className="button" type="button" onClick={refreshAvailability}>Try again</button>
            </section>
          )}
        </div>
      </main>
    );
  }

  const formattedDate = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const freeSlotCount = slots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > Date.now()).length;
  const workingHours = slots.length
    ? `${displayTime(slots[0].startAt)}–${displayTime(slots[slots.length - 1].endAt)}`
    : "Not published";
  const slotsByDate = new Map<string, ScheduleSlot[]>();
  const weekDates = getWeekDates(date, weekdays.map(({ value }) => value));
  slots.forEach((slot) => {
    const slotDate = slot.startAt.slice(0, 10);
    slotsByDate.set(slotDate, [...(slotsByDate.get(slotDate) ?? []), slot]);
  });

  function renderSlot(slot: ScheduleSlot) {
    return (
      <article
        className={`schedule-slot slot-${slot.status.toLowerCase()}${selected?.id === slot.id ? ` is-selected${isDoctor ? "" : " is-booking-selection"}` : ""}`}
        key={slot.id}
        {...(isDoctor ? {
          role: "button",
          tabIndex: 0,
          "aria-label": `Manage ${statusLabel(slot.status).toLowerCase()} slot ${displayDate(slot.startAt)}, ${displayTime(slot.startAt)} to ${displayTime(slot.endAt)}`,
          onClick: () => void openDetails(slot),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void openDetails(slot);
            }
          },
        } : {})}
      >
        <div className="schedule-slot-header">
          <div className="time-stack">
            {isDoctor && scheduleView === "week" && <small className="slot-date">{new Date(slot.startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</small>}
            <strong>{displayTime(slot.startAt)}</strong>
            <small>– {displayTime(slot.endAt)}</small>
          </div>
          <span className={`slot-status ${slot.status.toLowerCase()}`}>{statusLabel(slot.status)}</span>
        </div>

        <div className="schedule-slot-body">
          <div className="slot-summary">
            {slot.patient ? <span>{slot.patient.firstName} {slot.patient.lastName}</span> : <span>{slot.status === "FREE" ? "Open appointment" : "No patient assigned"}</span>}
            {slot.visitPurpose && <small>{slot.visitPurpose}</small>}
          </div>

          {!isDoctor && slot.status === "FREE" && Date.parse(slot.startAt) > Date.now() ? (
            <button
              className={`button button-outline${selected?.id === slot.id ? " is-selected" : ""}`}
              type="button"
              disabled={busy}
              aria-pressed={selected?.id === slot.id}
              onClick={() => {
                setSelected(slot);
                setVisitPurpose("");
                setError("");
                setMessage("");
                setBookingSuccess(null);
              }}
            >
              {selected?.id === slot.id ? "Selected · review booking" : "Select this time"}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <div className="page schedule-page">
      {isDoctor ? (
        <header className="schedule-page-heading">
          <div>
            <p className="eyebrow">Doctor portal</p>
            <h1 className="page-heading">My Schedule</h1>
            <p className="lead">Manage your availability without changing confirmed visits.</p>
          </div>
          <button ref={availabilityTriggerRef} className="button schedule-add-availability" type="button" aria-expanded={availabilityFormOpen} aria-controls="schedule-create-form" onClick={openAvailabilityDialog}>
            + Add Availability
          </button>
        </header>
      ) : (
        <>
          <p className="eyebrow">Doctor availability</p>
          <h1 className="page-heading">{doctorName} schedule</h1>
          <p className="lead">Choose a date to view available appointment times.</p>
        </>
      )}

      {error && (
        <div className="alert error" role="alert">
          {error}
          {isDoctor && <button className="text-link" type="button" onClick={() => void refresh()}>Retry</button>}
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
            <span>
              <DoctorLocation
                city={doctor.city ?? doctorMeta?.city}
                clinicName={doctor.clinicName ?? doctorMeta?.clinicName}
                streetAddress={doctor.streetAddress ?? doctorMeta?.streetAddress}
                officeNumber={doctor.officeNumber ?? doctorMeta?.officeNumber}
                office={doctorMeta?.office || doctor.office}
                emptyText="Location available on request"
              />
            </span>
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

      {isDoctor && (
        <div className="schedule-setup">
          <form className="schedule-office" onSubmit={saveOffice}>
            <label className="schedule-label">
              Office / location
              <input value={office} onChange={(event) => setOffice(event.target.value)} maxLength={200} required placeholder="Clinic, city, or address" />
            </label>
            <button className="button" disabled={busy}>Save location</button>
          </form>

        </div>
      )}

      {isDoctor && availabilityFormOpen && (
        <AddAvailabilityModal
          open={availabilityFormOpen}
          busy={busy}
          onClose={closeAvailabilityDialog}
          onSubmit={createSchedule}
          description="Choose working days and a time range for one selected week."
          footer={(
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={closeAvailabilityDialog} disabled={busy}>Cancel</button>
              <button className="button" type="submit" disabled={busy || workingDays.length === 0}>
                {busy ? <><span className="availability-spinner" aria-hidden="true" />Saving…</> : "Add availability"}
              </button>
            </footer>
          )}
        >
          <div className="availability-dialog-fields">
            <label className="schedule-label" htmlFor="availability-week">
              Week containing
              <input id="availability-week" type="date" value={scheduleWeek} min={today()} onChange={(event) => setScheduleWeek(event.target.value)} required disabled={busy} />
            </label>
            <div className="availability-time-fields">
              <label className="schedule-label" htmlFor="availability-start">
                Start time
                <input id="availability-start" type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} required disabled={busy} />
              </label>
              <label className="schedule-label" htmlFor="availability-end">
                End time
                <input id="availability-end" type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} required disabled={busy} />
              </label>
            </div>
          </div>
          <fieldset className="schedule-working-days availability-working-days" disabled={busy}>
            <legend>Working days</legend>
            <p>Select one or more days to add this time range.</p>
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
                  <span>{weekday.label.slice(0, 3)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="availability-dialog-note">
            <span aria-hidden="true">ⓘ</span>
            <p>Slots are created in 30-minute increments for the selected days. Existing confirmed visits are not changed.</p>
          </div>
          {availabilityError && <p className="availability-dialog-error" role="alert">{availabilityError}</p>}
        </AddAvailabilityModal>
      )}

      <div className={`schedule-toolbar${isDoctor ? " is-doctor-toolbar" : ""}`}>
        {isDoctor && <div className="schedule-date-controls" aria-label="Schedule date navigation">
          <button className="button button-outline" type="button" aria-label={scheduleView === "week" ? "Previous week" : "Previous day"} onClick={() => moveScheduleDate(scheduleView === "week" ? -7 : -1)}>‹ <span>Previous</span></button>
          <button className="button button-outline" type="button" onClick={() => { setDate(today()); setScheduleWeek(today()); clearSlotSelection(); }}>Today</button>
          <button className="button button-outline" type="button" aria-label={scheduleView === "week" ? "Next week" : "Next day"} onClick={() => moveScheduleDate(scheduleView === "week" ? 7 : 1)}><span>Next</span> ›</button>
        </div>}
        <label className="schedule-label">
          {isDoctor && scheduleView === "week" ? "Week containing" : "Schedule date"}
          <input type="date" value={date} min={!isDoctor ? today() : undefined} onChange={(event) => {
            setDate(event.target.value);
            if (isDoctor) setScheduleWeek(event.target.value);
            clearSlotSelection();
          }} />
        </label>
        <div className="schedule-toolbar-meta">
          {isDoctor && (
            <div className="schedule-view-toggle" role="group" aria-label="Calendar view">
              <button type="button" className={scheduleView === "day" ? "is-active" : ""} aria-pressed={scheduleView === "day"} onClick={() => setScheduleView("day")}>Day</button>
              <button type="button" className={scheduleView === "week" ? "is-active" : ""} aria-pressed={scheduleView === "week"} onClick={() => setScheduleView("week")}>Week</button>
            </div>
          )}
          <span aria-live="polite">{isDoctor && scheduleView === "week" ? `${weekDates.length} days · ` : `${formattedDate} · `}{slots.length} {slots.length === 1 ? "slot" : "slots"}</span>
        </div>
      </div>

      {loading && !(isDoctor && scheduleView === "week") ? (
        isDoctor ? <div className="schedule-week-grid schedule-loading-grid" role="status" aria-label="Loading schedule">
          {Array.from({ length: 1 }, (_, index) => <div className="schedule-skeleton-day" key={index}><span /><span /><span /></div>)}
        </div> : <p className="schedule-state" role="status">Loading schedule…</p>
      ) : slots.length === 0 && !(isDoctor && scheduleView === "week") ? (
        <div className="empty schedule-state">
          {isDoctor ? (
            <>
              <h2>No availability configured for this day</h2>
              <p>Add working hours to make appointment slots available in your schedule.</p>
              <button className="button" type="button" onClick={openAvailabilityDialog}>+ Add Availability</button>
            </>
          ) : (
            <>
              <h2>Schedule not available yet.</h2>
              <p>This doctor has not added working hours yet.</p>
            </>
          )}
        </div>
      ) : (
        <div className="schedule-layout">
          {isDoctor && scheduleView === "week" ? (
            <ScheduleMatrix
              dates={weekDates}
              slots={slots}
              selectedSlotId={selected?.id}
              loading={loading}
              onSelectSlot={(slot) => void openDetails(slot)}
              onAddAvailability={() => {
                setAvailabilityError("");
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("addAvailability", "1");
                  return next;
                });
              }}
            />
          ) : (
            <div className="schedule-list" aria-label="Appointment slots">{slots.map(renderSlot)}</div>
          )}

          {!isDoctor && selected && (
            <aside className="slot-detail" aria-live="polite">
              <div className="panel-title">
                <h2>Book appointment</h2>
                <button className="text-link" onClick={clearSlotSelection} aria-label="Close booking form">Close</button>
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
                <button className="button" disabled={busy || !visitPurpose.trim()}>{busy ? "Booking appointment…" : "Confirm appointment"}</button>
              </form>
            </aside>
          )}
        </div>
      )}

      {isDoctor && selected && (
        <SlotManagementModal
          slot={selected}
          busy={busy}
          loading={slotDetailsLoading}
          error={slotError}
          message={slotMessage}
          patientId={patientId}
          visitPurpose={visitPurpose}
          confirmingRelease={confirmingRelease}
          onClose={closeSlotModal}
          onPatientIdChange={setPatientId}
          onVisitPurposeChange={setVisitPurpose}
          onUpdate={(status, releaseBooking, reason) => void updateSlot(selected, status, releaseBooking, reason)}
          onConfirmRelease={() => setConfirmingRelease((current) => !current)}
        />
      )}

      {isDoctor && <section className="schedule-appointments-card" aria-labelledby="upcoming-appointments-title">
        <h2 id="upcoming-appointments-title">Upcoming appointments</h2>
        {loading ? (
          <div className="schedule-table-skeleton" role="status" aria-label="Loading upcoming appointments"><span /><span /><span /></div>
        ) : slots.filter((slot) => slot.status === "BOOKED" && Date.parse(slot.startAt) > Date.now()).length === 0 ? (
          <p className="schedule-appointments-empty">No upcoming booked appointments in this date range.</p>
        ) : (
          <div className="schedule-table-scroll" tabIndex={0} role="region" aria-label="Upcoming appointments">
            <table className="schedule-appointments-table">
              <thead><tr><th scope="col">Patient</th><th scope="col">Date &amp; time · UTC+5</th><th scope="col">Status</th><th scope="col">Visit reason</th><th scope="col">Action</th></tr></thead>
              <tbody>{slots.filter((slot) => slot.status === "BOOKED" && Date.parse(slot.startAt) > Date.now()).map((slot) => (
                <tr key={slot.id}>
                  <td data-label="Patient">{slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : "Patient"}</td>
                  <td data-label="Date & time · UTC+5">{almatyDateTime(slot.startAt)}</td>
                  <td data-label="Status"><span className="slot-status booked">Booked</span></td>
                  <td data-label="Visit reason">{slot.visitPurpose || "Not provided"}</td>
                  <td data-label="Action"><button className="text-link" type="button" onClick={() => void openDetails(slot)}>Details →</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>}

      {!isDoctor && (
        <p className="schedule-back">
          <Link to="/search">Back to doctor search</Link>
        </p>
      )}
    </div>
  );
}
