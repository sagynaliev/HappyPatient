import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { authApi, ScheduleSlot } from "../lib/api";
import { clock, dayKey, formatDayKey } from "../lib/almaty";
import { Icon } from "../components/Icons";
import { patientName, slotKind } from "./DoctorSchedulePage";
import "../styles/doctorWorkspace.css";

type Tab = "today" | "upcoming" | "past";
const kindLabel = { free: "Free", booked: "Booked", arrived: "Checked in", blocked: "Blocked" } as const;

/** Every visit with a patient, grouped by day; each row opens the visit page. */
export default function DoctorVisitsPage() {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const { doctor } = await authApi.doctorProfile();
      const result = await authApi.getSchedule(doctor.id);
      if (id !== request.current) return;
      setSlots(result.slots.filter((slot) => slot.patient).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)));
    } catch (caught) {
      if (id === request.current) setError(caught instanceof Error ? caught.message : "Unable to load visits.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);

  const today = dayKey(new Date());
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inTab = slots.filter((slot) => {
      const key = dayKey(slot.startAt);
      const matchesTab = tab === "today" ? key === today : tab === "upcoming" ? key > today : key < today;
      return matchesTab && (!needle || `${patientName(slot)} ${slot.visitPurpose ?? ""}`.toLowerCase().includes(needle));
    });
    const ordered = tab === "past" ? inTab.slice().reverse() : inTab;
    const byDay = new Map<string, ScheduleSlot[]>();
    for (const slot of ordered) byDay.set(dayKey(slot.startAt), [...(byDay.get(dayKey(slot.startAt)) ?? []), slot]);
    return [...byDay.entries()];
  }, [slots, tab, query, today]);
  const counts = {
    today: slots.filter((slot) => dayKey(slot.startAt) === today).length,
    upcoming: slots.filter((slot) => dayKey(slot.startAt) > today).length,
    past: slots.filter((slot) => dayKey(slot.startAt) < today).length,
  };
  const now = Date.now();

  return (
    <div className="dw-page">
      <header className="dw-head">
        <div><h1>Visits</h1><p>Your patients by day. Open a visit to see details and write notes.</p></div>
        <div className="dw-head-actions"><Link className="dw-mini" to="/doctor/schedule"><Icon name="calendar" size={16} /> Open schedule</Link></div>
      </header>

      {error && <div className="dw-alert" role="alert"><span>{error}</span><button type="button" className="dw-mini" onClick={() => void load()}>Retry</button></div>}

      <section className="dw-card dw-visits" aria-label="Visits">
        <div className="dw-visits-toolbar">
          <div className="dw-segment" role="group" aria-label="Visit range">
            {(["today", "upcoming", "past"] as Tab[]).map((item) => (
              <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)} <span className="dw-count">{loading ? "–" : counts[item]}</span></button>
            ))}
          </div>
          <label className="dw-search"><Icon name="search" size={16} /><span className="sr-only">Search visits</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or reason" /></label>
        </div>

        {loading ? <div className="pt-empty" role="status">Loading visits…</div> : groups.length === 0 ? (
          <div className="pt-empty">
            <span className="pt-empty-icon"><Icon name="users" size={26} /></span>
            <h3>{query ? "No matching visits" : tab === "today" ? "No patients today" : tab === "upcoming" ? "No upcoming visits" : "No past visits"}</h3>
            <p>{query ? "Try another name or reason." : "Visits appear here when patients book your time."}</p>
          </div>
        ) : groups.map(([key, items]) => (
          <section key={key} className="dw-visit-day" aria-label={formatDayKey(key, { weekday: "long", day: "numeric", month: "long" })}>
            {tab !== "today" && <h2 className="dw-visit-day-title">{formatDayKey(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>}
            <ol className="dw-agenda">
              {items.map((slot) => {
                const kind = slotKind(slot);
                return (
                  <li key={slot.id} className={Date.parse(slot.endAt) <= now && kind !== "booked" ? "is-past" : ""}>
                    <Link to={`/doctor/visits/${encodeURIComponent(slot.id)}`} className="dw-agenda-row">
                      <time dateTime={slot.startAt}>{clock(slot.startAt)}</time>
                      <span className="dw-avatar" aria-hidden="true">{`${slot.patient?.firstName[0] ?? ""}${slot.patient?.lastName[0] ?? ""}`}</span>
                      <span className="dw-patient-copy"><strong>{patientName(slot)}</strong><small>{slot.visitPurpose || "Consultation"} · {clock(slot.startAt)}–{clock(slot.endAt)}</small></span>
                      <span className={`dw-pill is-${kind}`}>{kindLabel[kind]}</span>
                      <Icon name="arrow-right" size={16} className="dw-row-arrow" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </section>
    </div>
  );
}
