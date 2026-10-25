import { useState } from "react";
import "../styles/patientDashboard.css";

const TZ = "Asia/Almaty";
const dayKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));

/** Month calendar that marks days with a booked visit (shared by the dashboard and My Appointments). */
export function MiniCalendar({ marked }: { marked: Set<string> }) {
  const today = dayKey(new Date());
  const [cursor, setCursor] = useState(() => { const [y, m] = today.split("-").map(Number); return { y, m }; });
  const first = new Date(Date.UTC(cursor.y, cursor.m - 1, 1));
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: offset + daysInMonth }, (_, index) => (index < offset ? null : index - offset + 1));
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const move = (delta: number) => setCursor(({ y, m }) => { const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; });
  const monthVisits = [...marked].filter((key) => key.startsWith(`${cursor.y}-${String(cursor.m).padStart(2, "0")}`)).length;

  return (
    <section className="pt-card pt-calendar" aria-label="Visit calendar">
      <header className="pt-calendar-head">
        <h2>{label}</h2>
        <div>
          <button type="button" className="pt-round" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
          <button type="button" className="pt-round" aria-label="Next month" onClick={() => move(1)}>›</button>
        </div>
      </header>
      <div className="pt-calendar-grid" role="grid">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span className="pt-dow" key={d} role="columnheader">{d}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`e${index}`} />;
          const key = `${cursor.y}-${String(cursor.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const classes = ["pt-day", key === today ? "is-today" : "", marked.has(key) ? "has-visit" : ""].filter(Boolean).join(" ");
          return <span key={key} className={classes} role="gridcell" aria-label={marked.has(key) ? `${day}, visit booked` : undefined}>{day}</span>;
        })}
      </div>
      <p className="pt-calendar-foot"><span className="pt-dot" aria-hidden="true" /> {monthVisits ? `${monthVisits} visit day${monthVisits > 1 ? "s" : ""} this month` : "No visits this month"}</p>
    </section>
  );
}

