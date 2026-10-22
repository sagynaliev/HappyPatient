import { useEffect, useMemo, useState } from "react";
import { api, authApi, AvailabilityDoctor } from "../lib/api";
import { Icon } from "./Icons";

const TZ = "Asia/Almaty";
const dayKey = (offset = 0) => {
  const date = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
};
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(value));
const initials = (name: string) => name.replace(/^Dr\.\s*/, "").split(" ").map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
const VISIBLE_TIMES = 8;

export type PickedSlot = { doctorId: string; slotId: string; doctorName: string; specialty: string; office: string | null; startAt: string; endAt: string };

type Props = {
  value: PickedSlot | null;
  onChange: (value: PickedSlot | null) => void;
  refreshKey?: number;
  disabled?: boolean;
};

/**
 * Front-desk picker for walk-ins: choose a day and specialty, then tap a free time.
 * Only doctors with free time on that day are listed, soonest first.
 */
export default function WalkInSlotPicker({ value, onChange, refreshKey = 0, disabled = false }: Props) {
  const [day, setDay] = useState(dayKey());
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<AvailabilityDoctor[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ categories: Array<{ name: string }> }>("/categories")
      .then((result) => setCategories(result.categories.map((item) => item.name)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    authApi.frontDeskAvailability({ date: day, category, q: debouncedQuery })
      .then((result) => { if (active) setDoctors(result.doctors); })
      .catch((cause: unknown) => { if (active) { setDoctors([]); setError(cause instanceof Error ? cause.message : "Free times could not be loaded."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [day, category, debouncedQuery, refreshKey]);

  // Drop a selection that is no longer offered (taken, or filtered away).
  useEffect(() => {
    if (!value || loading) return;
    const stillFree = doctors.some((doctor) => doctor.id === value.doctorId && doctor.slots.some((slot) => slot.id === value.slotId));
    if (!stillFree) onChange(null);
  }, [doctors, loading, value, onChange]);

  const totalSlots = useMemo(() => doctors.reduce((sum, doctor) => sum + doctor.slots.length, 0), [doctors]);
  const isToday = day === dayKey();
  const isTomorrow = day === dayKey(1);

  return (
    <div className="wi-picker">
      <div className="wi-row">
        <div className="wi-days" role="group" aria-label="Day">
          <button type="button" className={isToday ? "is-active" : ""} aria-pressed={isToday} onClick={() => setDay(dayKey())} disabled={disabled}>Today</button>
          <button type="button" className={isTomorrow ? "is-active" : ""} aria-pressed={isTomorrow} onClick={() => setDay(dayKey(1))} disabled={disabled}>Tomorrow</button>
          <label className={`wi-date${!isToday && !isTomorrow ? " is-active" : ""}`}>
            <span className="sr-only">Other date</span>
            <input type="date" value={day} min={dayKey()} onChange={(event) => event.target.value && setDay(event.target.value)} disabled={disabled} />
          </label>
        </div>
        <label className="wi-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search doctor by name</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Doctor name" disabled={disabled} />
        </label>
      </div>

      <div className="wi-chips" role="group" aria-label="Specialty">
        {["", ...categories].map((name) => (
          <button key={name || "all"} type="button" className={category === name ? "is-active" : ""} aria-pressed={category === name} onClick={() => setCategory(name)} disabled={disabled}>
            {name || "All specialties"}
          </button>
        ))}
      </div>

      <div className="wi-results" aria-live="polite" aria-busy={loading}>
        <p className="wi-count">
          {loading ? "Finding free times…" : error ? error : doctors.length ? `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} · ${totalSlots} free ${totalSlots === 1 ? "time" : "times"}` : "No free times for this day. Try another day or specialty."}
        </p>
        <ul className="wi-doctors">
          {doctors.map((doctor) => {
            const open = expanded.has(doctor.id);
            const shown = open ? doctor.slots : doctor.slots.slice(0, VISIBLE_TIMES);
            const hidden = doctor.slots.length - shown.length;
            return (
              <li key={doctor.id} className={value?.doctorId === doctor.id ? "is-selected" : ""}>
                <div className="wi-doctor">
                  <span className="wi-avatar" aria-hidden="true">{initials(doctor.name)}</span>
                  <div>
                    <strong>{doctor.name}</strong>
                    <small>{doctor.specialty}{doctor.office ? ` · ${doctor.office}` : ""}</small>
                  </div>
                  <span className="wi-next">Next {time(doctor.slots[0].startAt)}</span>
                </div>
                <div className="wi-times" role="group" aria-label={`Free times with ${doctor.name}`}>
                  {shown.map((slot) => {
                    const selected = value?.slotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        className={selected ? "is-selected" : ""}
                        aria-pressed={selected}
                        aria-label={`${doctor.name}, ${time(slot.startAt)}`}
                        disabled={disabled}
                        onClick={() => onChange(selected ? null : { doctorId: doctor.id, slotId: slot.id, doctorName: doctor.name, specialty: doctor.specialty, office: doctor.office, startAt: slot.startAt, endAt: slot.endAt })}
                      >
                        {time(slot.startAt)}
                      </button>
                    );
                  })}
                  {hidden > 0 && (
                    <button type="button" className="wi-more" onClick={() => setExpanded((current) => new Set(current).add(doctor.id))} disabled={disabled}>+{hidden} more</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
