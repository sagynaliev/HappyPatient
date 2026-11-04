import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatInClinic } from "../lib/almaty";
import { toast } from "../lib/toast";
import { AdminStat } from "../components/AdminStat";
import { Icon } from "../components/Icons";
import { formatOffset } from "../components/DemoTimeBadge";
import "../styles/adminOperations.css";

type TimeState = { now: string; realNow: string; offsetMinutes: number; enabled: boolean };
type TimeResult = TimeState & { released: number; reminders: number };

const steps = [
  { label: "+10 min", minutes: 10, hint: "Auto-release after a missed check-in" },
  { label: "+30 min", minutes: 30, hint: "Check-in window, walk-in rule" },
  { label: "+1 hour", minutes: 60, hint: "" },
  { label: "+2 hours", minutes: 120, hint: "2-hour reminder" },
  { label: "+1 day", minutes: 1440, hint: "24-hour reminder, next day's visits" },
  { label: "−1 hour", minutes: -60, hint: "" },
];
const show = (value: string) => formatInClinic(value, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** datetime-local value in Asia/Almaty (UTC+5, no daylight saving). */
const toLocalInput = (iso: string) => new Date(Date.parse(iso) + 5 * 3600e3).toISOString().slice(0, 16);

/** Moves the whole platform's "now" so time-based rules can be demonstrated without waiting. */
export default function AdminTimePage() {
  const [state, setState] = useState<TimeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [exact, setExact] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<TimeState>("/time").then((value) => { setState(value); setExact(toLocalInput(value.now)); }).catch(() => setError("Could not read the server time."));
  }, []);

  async function apply(body: { offsetMinutes: number } | { at: string }, label: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<TimeResult>("/admin/time", { method: "POST", body: JSON.stringify(body) });
      setState(result);
      const effects = [result.released && `${result.released} unconfirmed ${result.released === 1 ? "booking" : "bookings"} released`, result.reminders && `${result.reminders} ${result.reminders === 1 ? "reminder" : "reminders"} sent`].filter(Boolean).join(" · ");
      toast.success(label, effects || `Platform time is now ${show(result.now)}.`);
      // Reload so every screen (and this browser's clock) uses the new time.
      window.setTimeout(() => window.location.reload(), 1400);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The time could not be changed.");
      setBusy(false);
    }
  }

  function setExactTime(event: FormEvent) {
    event.preventDefault();
    if (!exact) return;
    void apply({ at: new Date(`${exact}:00+05:00`).toISOString() }, "Time set");
  }

  const offset = state?.offsetMinutes ?? 0;
  return (
    <div className="admin-page ad-page ad-ops">
      <header className="ad-head">
        <div><h1>Demo time</h1><p>Move the platform clock to show time-based rules in class without waiting. Everyone sees the same time; a restart of the server returns to real time.</p></div>
        <div className="ad-head-actions">
          <button className="ad-button ad-button-outline" type="button" disabled={busy || !offset} onClick={() => void apply({ offsetMinutes: 0 }, "Back to real time")}><Icon name="clock" size={18} /> Reset to real time</button>
        </div>
      </header>
      {error && <div className="admin-alert ad-ops-alert" role="alert"><span>{error}</span></div>}
      {state && !state.enabled && <div className="admin-alert ad-ops-alert" role="alert"><span>Time control is turned off on this server (TIME_CONTROL=off).</span></div>}

      <section className="admin-metrics-grid ad-stats ad-stats-3" aria-label="Clock">
        <AdminStat icon="clock" tone={offset ? "is-amber" : "is-green"} label="Platform time" value={state ? formatInClinic(state.now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—"} note={state ? formatInClinic(state.now, { weekday: "long", day: "numeric", month: "long" }) : "Loading…"} />
        <AdminStat icon="calendar" tone="is-blue" label="Real time" value={state ? formatInClinic(state.realNow, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—"} note={state ? formatInClinic(state.realNow, { weekday: "long", day: "numeric", month: "long" }) : "Asia/Almaty"} />
        <AdminStat icon="spark" tone="is-violet" label="Shift" value={offset ? formatOffset(offset) : "None"} note={offset ? "Demo time is on" : "Using real time"} />
      </section>

      <section className="admin-panel ad-panel">
        <div className="admin-panel-header"><div><h2>Move time forward</h2><p className="ad-muted">Each step adds to the current shift. Due bookings are released and reminders are sent right away.</p></div></div>
        <div className="ad-time-steps">
          {steps.map((step) => (
            <button key={step.label} type="button" className="ad-time-step" disabled={busy || !state?.enabled} onClick={() => void apply({ offsetMinutes: offset + step.minutes }, `Time moved ${step.label}`)}>
              <strong>{step.label}</strong>{step.hint && <small>{step.hint}</small>}
            </button>
          ))}
        </div>
      </section>

      <form className="admin-panel ad-panel ad-form" onSubmit={setExactTime}>
        <div className="admin-panel-header"><div><h2>Set an exact time</h2><p className="ad-muted">Asia/Almaty. For example 10 minutes after a booked visit starts.</p></div></div>
        <div className="ad-form-grid"><label>Date and time<input type="datetime-local" value={exact} onChange={(event) => setExact(event.target.value)} required /></label></div>
        <div className="ad-form-actions"><button className="ad-button" type="submit" disabled={busy || !state?.enabled}>Set time</button></div>
      </form>

      <section className="admin-panel ad-panel">
        <div className="admin-panel-header"><div><h2>What to show</h2></div></div>
        <ul className="ad-audit-list">
          <li><span className="ad-audit-date">Auto-release</span><span>Book a visit, don’t check in, then set the time to 10 minutes after it starts. The slot becomes free again.</span></li>
          <li><span className="ad-audit-date">Reminders</span><span>Book a visit for tomorrow, then move the time so it is less than 24 hours (or 2 hours) away. The reminder appears under the bell.</span></li>
          <li><span className="ad-audit-date">Check-in</span><span>Move the time to 30 minutes before a visit: the Check in button opens for the patient and the front desk.</span></li>
          <li><span className="ad-audit-date">Notes</span><span>After check-in, move past the visit start: the doctor can write medical notes.</span></li>
        </ul>
      </section>
    </div>
  );
}
