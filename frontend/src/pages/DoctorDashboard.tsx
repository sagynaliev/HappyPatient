import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DoctorProfile, ScheduleSlot, authApi } from "../lib/api";
import { addDays, clock, dayKey, formatDayKey, formatInClinic, weekOf } from "../lib/almaty";
import { Icon } from "../components/Icons";
import { patientName, slotKind } from "./DoctorSchedulePage";
import "../styles/patientDashboard.css";
import "../styles/doctorWorkspace.css";

function greeting() {
  const hour = Number(formatInClinic(new Date(), { hour: "numeric", hourCycle: "h23" }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
const kindLabel = { free: "Available time", booked: "Booked", arrived: "Checked in", blocked: "Blocked" } as const;

/** Doctor overview in the patient-dashboard style: today's patients, week load and alerts. */
export default function DoctorDashboard() {
  const { user } = useAuth();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const profile = await authApi.doctorProfile();
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

  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);

  const today = dayKey(new Date());
  const now = Date.now();
  const week = weekOf(today);
  const todaySlots = useMemo(() => slots.filter((slot) => dayKey(slot.startAt) === today), [slots, today]);
  const todayVisits = todaySlots.filter((slot) => slot.patient);
  // Keep the card short: the next three visits (or the last three once the day is over), the rest are on the Visits page.
  const firstUpcoming = Math.max(0, todayVisits.findIndex((slot) => Date.parse(slot.endAt) > now));
  const startIndex = todayVisits.some((slot) => Date.parse(slot.endAt) > now) ? Math.min(firstUpcoming, Math.max(0, todayVisits.length - 3)) : Math.max(0, todayVisits.length - 3);
  const shownToday = todayVisits.slice(startIndex, startIndex + 3);
  const hiddenToday = todayVisits.length - shownToday.length;
  const remaining = todayVisits.filter((slot) => Date.parse(slot.endAt) > now && slot.status === "BOOKED");
  const nextVisit = slots.find((slot) => slot.patient && slot.status === "BOOKED" && Date.parse(slot.endAt) > now);
  const weekVisits = slots.filter((slot) => slot.patient && week.includes(dayKey(slot.startAt)));
  const freeWeek = slots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > now && week.includes(dayKey(slot.startAt))).length;
  const arrivedToday = todayVisits.filter((slot) => slot.status === "OCCUPIED").length;
  const perDay = week.map((key) => ({ key, visits: slots.filter((slot) => slot.patient && dayKey(slot.startAt) === key).length }));
  const maxPerDay = Math.max(1, ...perDay.map((item) => item.visits));
  const upcomingVisits = slots.filter((slot) => slot.patient && slot.status === "BOOKED" && Date.parse(slot.startAt) > now && dayKey(slot.startAt) <= addDays(today, 7)).length;

  const firstName = doctor?.user?.firstName || user?.firstName || "Doctor";
  const fullName = doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : `Dr. ${firstName}`;
  const initials = `${doctor?.user?.firstName[0] ?? user?.firstName?.[0] ?? ""}${doctor?.user?.lastName[0] ?? user?.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="pt-page dw-dashboard" aria-label="Doctor dashboard">
      {error && <div className="dw-alert" role="alert"><span>{error}</span><button type="button" className="dw-mini" onClick={() => void load()}>Retry</button></div>}
      {/* Banner and profile share one row and end at the same line; everything below spans the full width. */}
      <div className="dw-dash-top">
        <section className="pt-banner">
            <div className="pt-banner-copy">
              <span className="pt-date-chip"><Icon name="calendar" size={16} /> {formatInClinic(new Date(), { weekday: "long", day: "numeric", month: "long" })}</span>
              <h1>{greeting()}, Dr. {doctor?.user?.lastName ?? firstName}!</h1>
              <p>{loading ? "Loading your day…" : remaining.length ? `You have ${remaining.length} ${remaining.length === 1 ? "patient" : "patients"} left today${nextVisit && dayKey(nextVisit.startAt) === today ? `. Next: ${patientName(nextVisit)} at ${clock(nextVisit.startAt)}.` : "."}` : todayVisits.length ? "All of today’s patients have been seen or checked in." : "No patients booked for today."}</p>
              <Link className="pt-banner-button" to="/doctor/schedule"><Icon name="calendar" size={18} /> Open schedule</Link>
            </div>
            <div className="pt-banner-art" aria-hidden="true">
              <span className="pt-orb pt-orb-1" />
              <span className="pt-orb pt-orb-2" />
              <span className="pt-art-card"><Icon name="stethoscope" size={54} /></span>
              <span className="pt-art-pill pt-art-pill-1"><Icon name="users" size={14} /> {todayVisits.length} today</span>
              <span className="pt-art-pill pt-art-pill-2"><Icon name="check" size={14} /> {arrivedToday} checked in</span>
            </div>
          </section>
          <section className="pt-card pt-profile">
            <header className="pt-profile-head"><h2>My profile</h2><Link to="/profile" className="pt-round" aria-label="Edit profile"><Icon name="file" size={16} /></Link></header>
            <div className="pt-profile-body">
              <span className="pt-avatar">{initials}</span>
              <div><strong>{fullName}</strong><span>{doctor?.category.name ?? "Doctor"}</span></div>
            </div>
            <dl className="pt-profile-facts">
              <div><dt>Office</dt><dd>{doctor?.office || "Not listed"}</dd></div>
              <div><dt>Next patient</dt><dd>{nextVisit ? `${patientName(nextVisit)} · ${dayKey(nextVisit.startAt) === today ? "" : `${formatInClinic(nextVisit.startAt, { day: "numeric", month: "short" })}, `}${clock(nextVisit.startAt)}` : "None booked"}</dd></div>
            </dl>
          </section>
      </div>
          <div className="pt-stats dw-stats-4">
            <div className="pt-card pt-stat"><span className="pt-stat-icon is-blue"><Icon name="users" /></span><div><strong>{loading ? "–" : todayVisits.length}</strong><span>Patients today</span></div></div>
            <div className="pt-card pt-stat"><span className="pt-stat-icon is-violet"><Icon name="calendar" /></span><div><strong>{loading ? "–" : weekVisits.length}</strong><span>Visits this week</span></div></div>
            <div className="pt-card pt-stat"><span className="pt-stat-icon is-green"><Icon name="clock" /></span><div><strong>{loading ? "–" : freeWeek}</strong><span>Free slots this week</span></div></div>
            <div className="pt-card pt-stat"><span className="pt-stat-icon is-pink"><Icon name="check" /></span><div><strong>{loading ? "–" : arrivedToday}</strong><span>Checked in today</span></div></div>
          </div>
          <div className="dw-dash-grid">
            <section className="pt-card dw-today" aria-labelledby="dw-today-title">
              <header className="pt-section-head"><h2 id="dw-today-title">Today’s appointments</h2><Link to="/doctor/visits" className="pt-link">All visits</Link></header>
              {!loading && todayVisits.length > 0 && <p className="dw-muted dw-today-note">{todaySlots.filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > now).length} free slots still open today</p>}
              {loading ? <div className="pt-empty" role="status">Loading today’s schedule…</div> : todayVisits.length === 0 ? (
                todaySlots.length === 0
                  ? <div className="pt-empty"><span className="pt-empty-icon"><Icon name="calendar" size={26} /></span><h3>No working hours today</h3><p>Add availability so patients can book you.</p><Link className="button small" to="/doctor/schedule?addAvailability=1">Add availability</Link></div>
                  : <div className="pt-empty"><span className="pt-empty-icon"><Icon name="users" size={26} /></span><h3>No patients yet today</h3><p>{todaySlots.filter((slot) => slot.status === "FREE").length} free slots are open for booking.</p></div>
              ) : (
                <ol className="dw-agenda">
                  {shownToday.map((slot) => {
                    const kind = slotKind(slot);
                    const content = <>
                      <time dateTime={slot.startAt}>{clock(slot.startAt)}</time>
                      {slot.patient ? <span className="dw-avatar" aria-hidden="true">{`${slot.patient.firstName[0]}${slot.patient.lastName[0]}`}</span> : <span className="dw-avatar is-empty" aria-hidden="true"><Icon name="clock" size={16} /></span>}
                      <span className="dw-patient-copy"><strong>{slot.patient ? patientName(slot) : kindLabel[kind]}</strong><small>{slot.patient ? slot.visitPurpose || "Consultation" : kind === "free" ? "Open for booking" : "Not bookable"}</small></span>
                      <span className={`dw-pill is-${kind}`}>{kind === "free" ? "Free" : kindLabel[kind]}</span>
                    </>;
                    return <li key={slot.id} className={Date.parse(slot.endAt) <= now ? "is-past" : ""}>{slot.patient ? <Link to={`/doctor/visits/${encodeURIComponent(slot.id)}`} className="dw-agenda-row">{content}</Link> : <div className="dw-agenda-row">{content}</div>}</li>;
                  })}
                </ol>
              )}
              {!loading && hiddenToday > 0 && <Link className="dw-more" to="/doctor/visits">+{hiddenToday} more {hiddenToday === 1 ? "visit" : "visits"} today <Icon name="arrow-right" size={15} /></Link>}
            </section>

            <section className="pt-card dw-week" aria-labelledby="dw-week-title">
              <header className="pt-section-head"><h2 id="dw-week-title">This week</h2><span className="dw-muted">{formatDayKey(week[0], { day: "numeric", month: "short" })} – {formatDayKey(week[6], { day: "numeric", month: "short" })}</span></header>
              <div className="dw-week-bars" role="img" aria-label={`Visits per day: ${perDay.map((item) => `${formatDayKey(item.key, { weekday: "short" })} ${item.visits}`).join(", ")}`}>
                {perDay.map((item) => (
                  <div key={item.key} className={`dw-week-col${item.key === today ? " is-today" : ""}`}>
                    <span className="dw-week-value">{item.visits}</span>
                    <span className="dw-week-track"><span style={{ height: `${(item.visits / maxPerDay) * 100}%` }} /></span>
                    <span className="dw-week-label">{formatDayKey(item.key, { weekday: "short" })}</span>
                  </div>
                ))}
              </div>
              <p className="dw-muted">{upcomingVisits} upcoming {upcomingVisits === 1 ? "visit" : "visits"} in the next 7 days, today included.</p>
            </section>
          </div>
    </div>
  );
}
