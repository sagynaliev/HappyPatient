import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, DoctorProfile, ScheduleSlot } from "../lib/api";
import { addDays, clinicMinutes, clock, dayKey, formatDayKey, weekOf } from "../lib/almaty";
import { toast } from "../lib/toast";
import { Icon } from "../components/Icons";
import { MiniCalendar } from "../components/MiniCalendar";
import { AddAvailabilityModal } from "../components/AddAvailabilityModal";
import { SlotManagementModal } from "../components/SlotManagementModal";
import "../styles/providerAvailabilityDialog.css";
import "../styles/doctorWorkspace.css";

const ROW_MINUTES = 30;
const ROW_HEIGHT = 56;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const patientName = (slot: ScheduleSlot) => (slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : "");
/** A slot with a patient is a visit; OCCUPIED without a patient is time the doctor blocked. */
export const slotKind = (slot: ScheduleSlot) =>
  slot.status === "FREE" ? "free" : slot.patient ? (slot.status === "OCCUPIED" ? "arrived" : "booked") : "blocked";
const kindLabel = { free: "Free", booked: "Booked", arrived: "Checked in", blocked: "Blocked" } as const;

/** One place for the week calendar, the day's patients and availability; a visit opens on its own page. */
export default function DoctorSchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = dayKey(new Date());
  const [selectedDay, setSelectedDay] = useState(() => searchParams.get("date") ?? today);
  const [view, setView] = useState<"week" | "day">(() => (window.matchMedia?.("(max-width: 700px)").matches ? "day" : "week"));
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Free / blocked slot management (booked visits open the visit page instead).
  const [managed, setManaged] = useState<ScheduleSlot | null>(null);
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slotMessage, setSlotMessage] = useState("");
  const [patientId, setPatientId] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  // Add availability
  const availabilityOpen = searchParams.get("addAvailability") === "1";
  const [scheduleWeek, setScheduleWeek] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [workingDays, setWorkingDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [availabilityError, setAvailabilityError] = useState("");

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const { doctor: profile } = await authApi.doctorProfile();
      const result = await authApi.getSchedule(profile.id);
      if (id !== request.current) return;
      setDoctor(result.doctor ?? profile);
      setSlots(result.slots.slice().sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)));
    } catch (caught) {
      if (id === request.current) setError(caught instanceof Error ? caught.message : "Unable to load your schedule.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);

  const days = view === "week" ? weekOf(selectedDay) : [selectedDay];
  const visible = useMemo(() => slots.filter((slot) => days.includes(dayKey(slot.startAt))), [slots, days.join()]);
  const visitDays = useMemo(() => new Set(slots.filter((slot) => slot.patient).map((slot) => dayKey(slot.startAt))), [slots]);
  const dayVisits = useMemo(() => slots.filter((slot) => slot.patient && dayKey(slot.startAt) === selectedDay), [slots, selectedDay]);
  const week = weekOf(today);
  const summary = {
    today: slots.filter((slot) => slot.patient && dayKey(slot.startAt) === today).length,
    week: slots.filter((slot) => slot.patient && week.includes(dayKey(slot.startAt))).length,
    free: slots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > now && week.includes(dayKey(slot.startAt))).length,
  };

  // Hours shown: the visible slots' range, at least 08:00–18:00.
  const startMinute = Math.min(8 * 60, ...visible.map((slot) => Math.floor(clinicMinutes(slot.startAt) / 60) * 60));
  const endMinute = Math.max(18 * 60, ...visible.map((slot) => Math.ceil((clinicMinutes(slot.startAt) + (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000) / 60) * 60));
  const rows = Array.from({ length: (endMinute - startMinute) / ROW_MINUTES }, (_, index) => startMinute + index * ROW_MINUTES);
  const top = (minute: number) => ((minute - startMinute) / ROW_MINUTES) * ROW_HEIGHT;
  // Open at working hours: the first visit of the shown days, otherwise 08:00 or the first slot after it.
  const firstVisit = visible.find((slot) => slot.patient);
  const firstAfterEight = visible.map((slot) => clinicMinutes(slot.startAt)).filter((minute) => minute >= 8 * 60).sort((a, b) => a - b)[0];
  const focusMinute = Math.max(startMinute, (firstVisit ? clinicMinutes(firstVisit.startAt) : firstAfterEight ?? 8 * 60) - 30);
  useEffect(() => {
    if (!loading && gridRef.current) gridRef.current.scrollTop = Math.max(0, top(focusMinute) - 8);
  }, [loading, view, days[0], focusMinute]);

  function selectDay(key: string) {
    setSelectedDay(key);
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("date", key); return next; }, { replace: true });
  }
  const step = view === "week" ? 7 : 1;
  const rangeLabel = view === "week"
    ? `${formatDayKey(days[0], { day: "numeric", month: "short" })} – ${formatDayKey(days[6], { day: "numeric", month: "short", year: "numeric" })}`
    : formatDayKey(selectedDay, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  async function openSlot(slot: ScheduleSlot) {
    if (slot.patient) { navigate(`/doctor/visits/${encodeURIComponent(slot.id)}`); return; }
    setManaged(slot);
    setSlotError("");
    setSlotMessage("");
    setConfirmingRelease(false);
    setPatientId("");
    setVisitPurpose("");
    setSlotLoading(true);
    try { setManaged((await authApi.slotDetails(slot.id)).slot); }
    catch (caught) { setSlotError(caught instanceof Error ? caught.message : "Unable to load this slot."); }
    finally { setSlotLoading(false); }
  }

  async function updateSlot(status: ScheduleSlot["status"], releaseBooking = false, cancellationReason?: string) {
    if (!managed || busy) return;
    setBusy(true);
    setSlotError("");
    try {
      const result = await authApi.updateSlot(managed.id, { status, ...(status === "BOOKED" ? { patientId, visitPurpose } : {}), ...(releaseBooking ? { releaseBooking: true, cancellationReason } : {}) });
      setSlots((current) => current.map((item) => (item.id === managed.id ? { ...item, ...result.slot } : item)));
      setManaged({ ...managed, ...result.slot });
      setSlotMessage("Slot updated.");
      toast.success(status === "FREE" ? "Time is open for booking" : status === "OCCUPIED" ? "Time blocked" : "Slot updated");
    } catch (caught) {
      setSlotError(caught instanceof Error ? caught.message : "Unable to update this slot.");
    } finally {
      setBusy(false);
    }
  }

  function setAvailabilityOpen(open: boolean) {
    if (!open && busy) return;
    setAvailabilityError("");
    setSearchParams((current) => { const next = new URLSearchParams(current); if (open) next.set("addAvailability", "1"); else next.delete("addAvailability"); return next; });
  }

  async function createAvailability(event: FormEvent) {
    event.preventDefault();
    setAvailabilityError("");
    const dates = weekOf(scheduleWeek).filter((key, index) => workingDays.includes(index) && key >= today);
    if (!dates.length) { setAvailabilityError("Choose at least one future working day in this week."); return; }
    if (startTime >= endTime) { setAvailabilityError("End time must be later than start time."); return; }
    setBusy(true);
    try {
      const result = await authApi.createWorkingDays({ dates, startTime, endTime });
      toast.success("Schedule published", `${result.created} slots · ${dates.map((key) => formatDayKey(key, { weekday: "short" })).join(", ")} · ${startTime}–${endTime}${result.skippedSummary ? ` · skipped ${result.skippedSummary}` : ""}`);
      setBusy(false);
      setAvailabilityOpen(false);
      selectDay(dates[0]);
      await load();
    } catch (caught) {
      setAvailabilityError(caught instanceof Error ? caught.message : "Unable to create this schedule.");
      setBusy(false);
    }
  }

  const doctorName = doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : "Your schedule";
  const nowMinute = clinicMinutes(new Date(now));

  return (
    <div className="dw-page">
      <header className="dw-head">
        <div>
          <h1>Schedule</h1>
          <p>{doctorName}{doctor ? ` · ${doctor.category.name}` : ""}{doctor?.office ? ` · ${doctor.office}` : ""} · Asia/Almaty</p>
        </div>
        <div className="dw-head-actions">
          <button className="dw-button" type="button" onClick={() => setAvailabilityOpen(true)}><Icon name="calendar" size={18} /> Add availability</button>
        </div>
      </header>

      <section className="dw-summary" aria-label="Schedule summary">
        <div><span className="dw-summary-icon is-blue"><Icon name="users" size={20} /></span><strong>{loading ? "—" : summary.today}</strong><small>Patients today</small></div>
        <div><span className="dw-summary-icon is-violet"><Icon name="calendar" size={20} /></span><strong>{loading ? "—" : summary.week}</strong><small>Visits this week</small></div>
        <div><span className="dw-summary-icon is-green"><Icon name="clock" size={20} /></span><strong>{loading ? "—" : summary.free}</strong><small>Free slots left this week</small></div>
      </section>

      {error && <div className="dw-alert" role="alert"><span>{error}</span><button type="button" className="dw-mini" onClick={() => void load()}>Retry</button></div>}

      <div className="dw-layout">
        <aside className="dw-side">
          <MiniCalendar marked={visitDays} selected={selectedDay} onSelect={selectDay} />
          <section className="dw-card dw-day-list" aria-labelledby="dw-day-title">
            <header><h2 id="dw-day-title">{selectedDay === today ? "Today’s patients" : formatDayKey(selectedDay, { weekday: "short", day: "numeric", month: "short" })}</h2><span className="dw-count">{dayVisits.length}</span></header>
            {loading ? <p className="dw-muted" role="status">Loading…</p> : dayVisits.length === 0 ? <p className="dw-muted">No patients booked for this day.</p> : (
              <ul>
                {dayVisits.map((slot) => (
                  <li key={slot.id}>
                    <Link to={`/doctor/visits/${encodeURIComponent(slot.id)}`} className="dw-patient-row">
                      <span className="dw-avatar" aria-hidden="true">{`${slot.patient?.firstName[0] ?? ""}${slot.patient?.lastName[0] ?? ""}`}</span>
                      <span className="dw-patient-copy"><strong>{patientName(slot)}</strong><small>{clock(slot.startAt)}–{clock(slot.endAt)}{slot.visitPurpose ? ` · ${slot.visitPurpose}` : ""}</small></span>
                      <span className={`dw-pill is-${slotKind(slot)}`}>{kindLabel[slotKind(slot)]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="dw-card dw-calendar" aria-label="Schedule calendar">
          <header className="dw-calendar-head">
            <div className="dw-nav">
              <button type="button" className="dw-mini" onClick={() => selectDay(today)}>Today</button>
              <button type="button" className="dw-round" aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => selectDay(addDays(selectedDay, -step))}>‹</button>
              <button type="button" className="dw-round" aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => selectDay(addDays(selectedDay, step))}>›</button>
              <h2>{rangeLabel}</h2>
            </div>
            <div className="dw-nav">
              <ul className="dw-legend" aria-label="Legend">
                <li><span className="is-free" />Free</li><li><span className="is-booked" />Booked</li><li><span className="is-arrived" />Checked in</li>
              </ul>
              <div className="dw-segment" role="group" aria-label="Calendar view">
                <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>Day</button>
                <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
              </div>
            </div>
          </header>

          {loading ? <div className="dw-grid-loading" role="status">Loading schedule…</div> : (
            <div className="dw-grid-scroll" ref={gridRef}>
              <div className="dw-grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(${view === "week" ? 104 : 180}px, 1fr))` }}>
                <div className="dw-corner" />
                {days.map((key, index) => (
                  <button type="button" key={key} className={`dw-day-head${key === today ? " is-today" : ""}${key === selectedDay ? " is-selected" : ""}`} onClick={() => selectDay(key)}>
                    <span>{WEEKDAYS[view === "week" ? index : (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7]}</span><strong>{formatDayKey(key, { day: "numeric" })}</strong>
                  </button>
                ))}
                <div className="dw-times" style={{ height: rows.length * ROW_HEIGHT }}>
                  {rows.map((minute) => minute % 60 === 0 && <span key={minute} style={{ top: top(minute) }}>{`${String(minute / 60).padStart(2, "0")}:00`}</span>)}
                </div>
                {days.map((key) => {
                  const daySlots = visible.filter((slot) => dayKey(slot.startAt) === key);
                  return (
                    <div key={key} className={`dw-column${key === today ? " is-today" : ""}`} style={{ height: rows.length * ROW_HEIGHT }}>
                      {rows.map((minute) => <span key={minute} className={`dw-line${minute % 60 === 0 ? " is-hour" : ""}`} style={{ top: top(minute) }} />)}
                      {key === today && nowMinute >= startMinute && nowMinute <= endMinute && <span className="dw-now" style={{ top: top(nowMinute) }} aria-hidden="true" />}
                      {daySlots.length === 0 && <span className="dw-column-empty">No slots</span>}
                      {daySlots.map((slot) => {
                        const kind = slotKind(slot);
                        const minutes = (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000;
                        const past = Date.parse(slot.endAt) <= now;
                        return (
                          <button
                            type="button"
                            key={slot.id}
                            className={`dw-event is-${kind}${past ? " is-past" : ""}`}
                            style={{ top: top(clinicMinutes(slot.startAt)) + 2, height: (minutes / ROW_MINUTES) * ROW_HEIGHT - 4 }}
                            onClick={() => void openSlot(slot)}
                            aria-label={`${kindLabel[kind]} ${clock(slot.startAt)}–${clock(slot.endAt)}${slot.patient ? `, ${patientName(slot)}` : ""}`}
                          >
                            <strong>{slot.patient ? patientName(slot) : kindLabel[kind]}</strong>
                            <small>{clock(slot.startAt)}–{clock(slot.endAt)}{slot.patient && slot.visitPurpose ? ` · ${slot.visitPurpose}` : ""}</small>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="dw-empty-cta"><p>No working hours in this {view}.</p><button type="button" className="dw-button" onClick={() => setAvailabilityOpen(true)}>Add availability</button></div>
          )}
        </section>
      </div>

      {managed && (
        <SlotManagementModal
          slot={managed}
          busy={busy}
          loading={slotLoading}
          error={slotError}
          message={slotMessage}
          patientId={patientId}
          visitPurpose={visitPurpose}
          confirmingRelease={confirmingRelease}
          onClose={() => setManaged(null)}
          onPatientIdChange={setPatientId}
          onVisitPurposeChange={setVisitPurpose}
          onUpdate={(status, release, reason) => void updateSlot(status, release, reason)}
          onConfirmRelease={() => setConfirmingRelease(true)}
        />
      )}

      {availabilityOpen && (
        <AddAvailabilityModal
          open
          busy={busy}
          onClose={() => setAvailabilityOpen(false)}
          onSubmit={createAvailability}
          footer={(
            <footer className="availability-dialog-actions">
              <button className="button button-outline" type="button" onClick={() => setAvailabilityOpen(false)} disabled={busy}>Cancel</button>
              <button className="button" type="submit" disabled={busy || workingDays.length === 0}>{busy ? "Saving…" : "Add availability"}</button>
            </footer>
          )}
        >
          <div className="availability-dialog-fields">
            <label className="schedule-label" htmlFor="dw-week">Week containing<input id="dw-week" type="date" value={scheduleWeek} min={today} onChange={(event) => setScheduleWeek(event.target.value)} required disabled={busy} /></label>
            <div className="availability-time-fields">
              <label className="schedule-label" htmlFor="dw-start">Start time<input id="dw-start" type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} required disabled={busy} /></label>
              <label className="schedule-label" htmlFor="dw-end">End time<input id="dw-end" type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} required disabled={busy} /></label>
            </div>
          </div>
          <fieldset className="schedule-working-days availability-working-days" disabled={busy}>
            <legend>Working days</legend>
            <p>Select one or more days to add this time range.</p>
            <div className="schedule-weekday-options">
              {WEEKDAYS.map((label, index) => (
                <label className="schedule-weekday-option" key={label}>
                  <input type="checkbox" checked={workingDays.includes(index)} onChange={(event) => setWorkingDays((current) => (event.target.checked ? [...current, index] : current.filter((day) => day !== index)))} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="availability-dialog-note"><span aria-hidden="true">ⓘ</span><p>Slots are created in 30-minute steps in Asia/Almaty time. Existing visits are not changed.</p></div>
          {availabilityError && <p className="availability-dialog-error" role="alert">{availabilityError}</p>}
        </AddAvailabilityModal>
      )}
    </div>
  );
}
