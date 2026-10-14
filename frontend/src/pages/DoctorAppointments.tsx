import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ScheduleSlot, DoctorProfile, authApi } from "../lib/api";
import "../styles/doctorAppointments.css";

type View = "today" | "upcoming" | "past" | "all";
const TIME_ZONE = "Asia/Almaty";

function dateKey(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function startOfAlmatyWeek(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function personName(slot: ScheduleSlot) {
  return slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : "Patient details unavailable";
}

export default function DoctorAppointments() {
  const [searchParams] = useSearchParams();
  const requestedSlotId = searchParams.get("slotId");
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selected, setSelected] = useState<ScheduleSlot | null>(null);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [view, setView] = useState<View>("today");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const { doctor: profile } = await authApi.doctorProfile();
      if (id !== requestId.current) return;
      const result = await authApi.getSchedule(profile.id);
      if (id !== requestId.current) return;
      setDoctor(result.doctor ?? profile);
      setSlots(result.slots.filter((slot) => slot.status === "BOOKED").sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)));
      setSelected((current) => current ? result.slots.find((slot) => slot.id === current.id) ?? null : null);
    } catch (caught) {
      if (id === requestId.current) setError(caught instanceof Error ? caught.message : "Unable to load appointments.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!loading && requestedSlotId) {
      const requested = slots.find((slot) => slot.id === requestedSlotId);
      if (requested) {
        setView("all");
        void showDetails(requested);
      }
    }
  }, [loading, requestedSlotId, slots]);

  const todayKey = dateKey(new Date());
  const weekStart = startOfAlmatyWeek(todayKey);
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const counts = useMemo(() => {
    const now = Date.now();
    const today = slots.filter((slot) => dateKey(slot.startAt) === todayKey);
    return {
      today: today.length,
      upcoming: slots.filter((slot) => Date.parse(slot.startAt) >= now).length,
      past: slots.filter((slot) => Date.parse(slot.startAt) < now).length,
      week: slots.filter((slot) => dateKey(slot.startAt) >= weekStart && dateKey(slot.startAt) < weekEnd).length,
      all: slots.length,
    };
  }, [slots, todayKey, weekStart, weekEnd]);

  const visibleSlots = useMemo(() => {
    const now = Date.now();
    const needle = query.trim().toLowerCase();
    return slots.filter((slot) => {
      const time = Date.parse(slot.startAt);
      const isToday = dateKey(slot.startAt) === todayKey;
      const matchesView = view === "all" || (view === "today" ? isToday : view === "upcoming" ? time >= now : time < now);
      const matchesQuery = !needle || `${personName(slot)} ${slot.id} ${slot.visitPurpose ?? ""}`.toLowerCase().includes(needle);
      const matchesDate = !dateFilter || dateKey(slot.startAt) === dateFilter;
      return matchesView && matchesQuery && matchesDate;
    });
  }, [slots, query, dateFilter, view, todayKey]);

  async function showDetails(slot: ScheduleSlot) {
    setSelected(slot);
    setDetailLoading(true);
    try {
      const { slot: details } = await authApi.slotDetails(slot.id);
      setSelected(details);
    } catch {
      // The list already contains the permitted details available from the schedule endpoint.
    } finally {
      setDetailLoading(false);
    }
  }

  const doctorName = doctor?.user ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : "Your appointments";

  return (
    <div className="doctor-appointments">
      <header className="da-heading">
        <div>
          <p className="da-eyebrow">Provider workspace</p>
          <h1>Appointment management</h1>
          <p>Booked visits for {doctorName} · {TIME_ZONE} (UTC+5)</p>
        </div>
        <Link className="da-button da-button-outline" to="/doctor/schedule">View my schedule</Link>
      </header>

      {error && <div className="da-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}

      <section className="da-metrics" aria-label="Appointment summary">
        <article className="da-metric"><span>Today’s booked visits</span><strong>{loading ? "—" : counts.today}</strong><small>{formatDay(new Date().toISOString())} · confirmed bookings</small></article>
        <article className="da-metric"><span>Upcoming booked visits</span><strong>{loading ? "—" : counts.upcoming}</strong><small>Future booked slots</small></article>
        <article className="da-metric"><span>This week</span><strong>{loading ? "—" : counts.week}</strong><small>{weekStart} – {new Date(`${weekEnd}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}</small></article>
      </section>

      <section className="da-filters" aria-label="Filter appointments">
        <label className="da-search">Search patient or slot ID<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or slot ID" /></label>
        <label>Date<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
        <p className="da-filter-note">Showing booked visits only</p>
        <button className="da-reset" type="button" onClick={() => { setQuery(""); setDateFilter(""); setView("today"); }}>Reset</button>
      </section>

      <nav className="da-tabs" aria-label="Appointment time range">
        {(["today", "upcoming", "past", "all"] as View[]).map((tab) => <button key={tab} type="button" className={view === tab ? "is-active" : ""} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab[0].toUpperCase() + tab.slice(1)} <span>{loading ? "—" : counts[tab]}</span></button>)}
      </nav>

      <div className="da-workspace">
        <section className="da-panel da-list-panel" aria-labelledby="da-list-heading">
          <div className="da-panel-heading"><div><h2 id="da-list-heading">{view === "today" ? "Today’s appointments" : `${view[0].toUpperCase()}${view.slice(1)} appointments`}</h2><p>{visibleSlots.length} booked {visibleSlots.length === 1 ? "visit" : "visits"}</p></div><button className="da-icon-button" type="button" aria-label="Refresh appointments" onClick={() => void load()} disabled={loading}>↻</button></div>
          {loading ? <div className="da-loading" role="status">Loading appointments…</div> : visibleSlots.length === 0 ? <div className="da-empty"><strong>No appointments found</strong><p>Try another date or clear your search.</p><button className="da-button da-button-outline" type="button" onClick={() => { setQuery(""); setDateFilter(""); setView("all"); }}>Clear filters</button></div> : (
            <div className="da-table-wrap" tabIndex={0} role="region" aria-label="Appointments table">
              <table className="da-table"><thead><tr><th scope="col">Patient</th><th scope="col">Date &amp; time · UTC+5</th><th scope="col">Visit reason</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
                <tbody>{visibleSlots.map((slot) => <tr key={slot.id} className={selected?.id === slot.id ? "is-selected" : ""}>
                  <td><strong>{personName(slot)}</strong><small>{slot.id}</small></td>
                  <td>{formatDay(slot.startAt)}<small>{formatTime(slot.startAt)}–{formatTime(slot.endAt)}</small></td>
                  <td>{slot.visitPurpose || "Not provided"}</td><td><span className="da-status">Booked</span></td>
                  <td><button className="da-link" type="button" aria-pressed={selected?.id === slot.id} onClick={() => void showDetails(slot)}>{selected?.id === slot.id ? "Selected" : "Details →"}</button></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="da-privacy">Patient information is visible to the treating doctor through authorized appointment details.</p>
        </section>

        <aside className="da-panel da-inspector" aria-labelledby="da-details-heading">
          <div className="da-panel-heading"><h2 id="da-details-heading">Appointment details</h2>{selected && <span className="da-status">Booked</span>}</div>
          {!selected ? <div className="da-empty da-empty-compact"><strong>Select a booked visit</strong><p>Appointment details will appear here.</p></div> : <>
            {detailLoading && <p className="da-detail-loading" role="status">Loading authorized details…</p>}
            <h3>{personName(selected)}</h3><p className="da-reference">Slot · {selected.id}</p>
            <dl className="da-details">
              <div><dt>Date &amp; time</dt><dd>{formatDay(selected.startAt)} · {formatTime(selected.startAt)}–{formatTime(selected.endAt)} · UTC+5</dd></div>
              <div><dt>Consultation</dt><dd>{doctor?.category.name || "Provider visit"}</dd></div>
              <div><dt>Location</dt><dd>{doctor?.office || "Not provided in profile"}</dd></div>
              <div><dt>Patient email</dt><dd>{selected.patient?.email || "Not available"}</dd></div>
              <div><dt>Reason for visit</dt><dd>{selected.visitPurpose || "Not provided"}</dd></div>
            </dl>
          </>}
        </aside>
      </div>
      <aside className="da-protected">Protected patient information. This view uses the existing doctor-only schedule access rules.</aside>
    </div>
  );
}
