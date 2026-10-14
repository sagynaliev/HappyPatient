import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DoctorProfile, ScheduleSlot, authApi } from "../lib/api";
import "../styles/doctorDashboard.css";

type BookingTab = "today" | "upcoming" | "past" | "all";
const ZONE = "Asia/Almaty";

function localDate(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (part: string) => parts.find((item) => item.type === part)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function localTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, ...options }).format(new Date(value));
}
function slotName(slot: ScheduleSlot) {
  return slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : slot.status === "FREE" ? "Available time" : "Patient details unavailable";
}
function statusTitle(slot: ScheduleSlot) {
  return slot.status === "BOOKED" ? "Booked" : slot.status === "OCCUPIED" ? "Occupied" : "Free";
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<BookingTab>("today");
  const [page, setPage] = useState(1);
  const request = useRef(0);
  const today = localDate(new Date());
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const weekStartKey = weekStart.toISOString().slice(0, 10);
  const weekEndDate = new Date(`${weekStartKey}T00:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const nextWeek = new Date(`${today}T00:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekKey = nextWeek.toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const profile = await authApi.doctorProfile();
      if (current !== request.current) return;
      const result = await authApi.getSchedule(profile.doctor.id);
      if (current !== request.current) return;
      setDoctor(result.doctor ?? profile.doctor);
      setSlots(result.slots.slice().sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)));
    } catch (caught) {
      if (current === request.current) setError(caught instanceof Error ? caught.message : "Failed to load dashboard data. Please try again.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  const booked = useMemo(() => slots.filter((slot) => slot.status === "BOOKED"), [slots]);
  const todaySlots = useMemo(() => slots.filter((slot) => localDate(slot.startAt) === today), [slots, today]);
  const upcomingCount = booked.filter((slot) => localDate(slot.startAt) >= today && localDate(slot.startAt) < nextWeekKey).length;
  const availableWeekCount = slots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) >= Date.now() && localDate(slot.startAt) >= weekStartKey && localDate(slot.startAt) < weekEnd).length;

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      today: booked.filter((slot) => localDate(slot.startAt) === today).length,
      upcoming: booked.filter((slot) => Date.parse(slot.startAt) >= now).length,
      past: booked.filter((slot) => Date.parse(slot.startAt) < now).length,
      all: booked.length,
    };
  }, [booked, today]);
  const filteredBookings = useMemo(() => {
    const now = Date.now();
    return booked.filter((slot) => {
      const starts = Date.parse(slot.startAt);
      return tab === "all" || (tab === "today" ? localDate(slot.startAt) === today : tab === "upcoming" ? starts >= now : starts < now);
    });
  }, [booked, tab, today]);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const visibleBookings = filteredBookings.slice((page - 1) * pageSize, page * pageSize);

  function selectTab(next: BookingTab) {
    setTab(next);
    setPage(1);
  }

  const firstName = user?.firstName || doctor?.user?.firstName || "Doctor";
  const fullName = doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : `Dr. ${firstName}`;

  return (
    <div className="provider-dashboard">
      <header className="pd-heading">
        <div><p className="pd-eyebrow">Provider overview</p><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {fullName}.</h1><p>{formatDate(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {ZONE} (UTC+5)</p></div>
        <Link className="pd-button pd-button-outline" to="/doctor/schedule"><span aria-hidden="true">▦</span> Manage Schedule</Link>
      </header>

      {error && <div className="pd-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}

      <section className="pd-metrics" aria-label="Schedule metrics">
        <article className="pd-metric"><span>Today’s appointments</span><strong>{loading ? "—" : booked.filter((slot) => localDate(slot.startAt) === today).length}</strong><small>Booked visits for today</small></article>
        <article className="pd-metric"><span>Upcoming appointments</span><strong>{loading ? "—" : upcomingCount}</strong><small>Next 7 days</small></article>
        <article className="pd-metric"><span>Available time slots</span><strong>{loading ? "—" : availableWeekCount}</strong><small>This week</small></article>
        <article className="pd-metric"><span>Completed consultations</span><strong aria-label="Not available">—</strong><small>Completion status is not tracked by the schedule API</small></article>
      </section>

      <section className="pd-main-grid">
        <article className="pd-card pd-timeline">
          <div className="pd-card-heading"><div><h2>Today’s timeline</h2><p>{doctor?.office || "Office not listed"} · Schedule status in {ZONE}</p></div><Link to="/doctor/schedule">Open schedule →</Link></div>
          {loading ? <div className="pd-loading" role="status">Loading today’s schedule…</div> : todaySlots.length === 0 ? <div className="pd-empty">No schedule slots found for today.</div> : <ol className="pd-timeline-list">{todaySlots.map((slot) => <li key={slot.id} className={`pd-agenda pd-agenda-${slot.status.toLowerCase()}`}>
            <time dateTime={slot.startAt}>{localTime(slot.startAt)}</time><div className="pd-agenda-copy"><strong>{slot.status === "FREE" ? "Available time" : slotName(slot)}</strong><span>{slot.visitPurpose || (slot.status === "FREE" ? "Open for booking" : doctor?.category.name || "Scheduled visit")} · {Math.round((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000)} min</span></div><span className={`pd-state pd-state-${slot.status.toLowerCase()}`}>{statusTitle(slot)}</span>
          </li>)}</ol>}
        </article>

        <aside className="pd-side-stack">
          <section className="pd-card pd-actions"><h2>Quick actions</h2><Link className="pd-button pd-button-primary" to="/doctor/schedule?addAvailability=1">+ Add availability</Link><Link className="pd-button pd-button-outline" to="/doctor/appointments">Review bookings</Link><Link className="pd-button pd-button-outline" to="/profile">Edit my profile</Link></section>
          <section className="pd-card pd-notifications"><h2>Notifications</h2><div className="pd-notification-empty"><span aria-hidden="true">♧</span><p>No provider notification data is available.</p></div></section>
        </aside>
      </section>

      <section className="pd-bookings pd-card" aria-labelledby="pd-booking-title">
        <div className="pd-bookings-header"><div><h2 id="pd-booking-title">Upcoming bookings</h2><p>Booked visits from your schedule</p></div><Link to="/doctor/appointments">Manage appointments →</Link></div>
        <div className="pd-tabs" role="tablist" aria-label="Filter bookings">{(["today", "upcoming", "past", "all"] as BookingTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => selectTab(item)}>{item[0].toUpperCase() + item.slice(1)} <span>{loading ? "—" : counts[item]}</span></button>)}</div>
        {loading ? <div className="pd-loading" role="status">Loading bookings…</div> : visibleBookings.length === 0 ? <div className="pd-empty">No booked visits in this view.</div> : <div className="pd-table-wrap" tabIndex={0} role="region" aria-label="Upcoming bookings table"><table className="pd-table"><thead><tr><th scope="col">Patient</th><th scope="col">Date &amp; time · UTC+5</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Visit reason</th><th scope="col">Action</th></tr></thead><tbody>{visibleBookings.map((slot) => <tr key={slot.id}><td><strong>{slotName(slot)}</strong></td><td>{formatDate(slot.startAt)}<small>{localTime(slot.startAt)}–{localTime(slot.endAt)}</small></td><td>Not recorded</td><td><span className="pd-state pd-state-booked">Booked</span></td><td>{slot.visitPurpose || "Not provided"}</td><td><Link className="pd-details-link" to={`/doctor/appointments?slotId=${encodeURIComponent(slot.id)}`}>Details →</Link></td></tr>)}</tbody></table></div>}
        <footer className="pd-pagination"><span>Showing {filteredBookings.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredBookings.length)} of {filteredBookings.length}</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button><span aria-current="page">{page} / {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next</button></div></footer>
      </section>

      <aside className="pd-disclaimer">Patient information is shown only through the existing doctor-authorized schedule endpoints. Appointment state is reported as booked or available.</aside>
    </div>
  );
}
