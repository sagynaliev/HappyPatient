import { ScheduleSlot } from "../lib/api";
import "../styles/scheduleMatrix.css";

const almatyDate = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const almatyTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Almaty",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(new Date(value));

const weekDateLabel = (value: string, includeYear = false) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  ...(includeYear ? { day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric" }),
}).format(new Date(`${value}T12:00:00Z`));

const weekRangeLabel = (start: string, end: string) => {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const startMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" }).format(startDate);
  const endMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" }).format(endDate);
  const endYear = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", year: "numeric" }).format(endDate);
  return startMonth === endMonth
    ? `${startDate.getUTCDate()}–${endDate.getUTCDate()} ${endMonth} ${endYear}`
    : `${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(startDate)}–${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(endDate)}`;
};

type ScheduleMatrixProps = {
  dates: string[];
  slots: ScheduleSlot[];
  selectedSlotId?: string;
  loading: boolean;
  onSelectSlot: (slot: ScheduleSlot) => void;
  onAddAvailability: () => void;
};

export default function ScheduleMatrix({
  dates,
  slots,
  selectedSlotId,
  loading,
  onSelectSlot,
  onAddAvailability,
}: ScheduleMatrixProps) {
  const dateSet = new Set(dates);
  const weekSlots = slots.filter((slot) => dateSet.has(almatyDate(slot.startAt)));
  const times = Array.from(new Set(weekSlots.map((slot) => almatyTime(slot.startAt)))).sort();
  const slotsByCell = new Map(weekSlots.map((slot) => [`${almatyDate(slot.startAt)}|${almatyTime(slot.startAt)}`, slot]));
  const today = almatyDate(new Date().toISOString());

  return (
    <section className="schedule-matrix-card" aria-labelledby="schedule-matrix-title">
      <header className="schedule-matrix-header">
        <div>
          <h2 id="schedule-matrix-title">{dates.length ? weekRangeLabel(dates[0], dates[dates.length - 1]) : "Weekly schedule"}</h2>
          <p>Asia/Almaty (UTC+5) · 30-minute consultations</p>
        </div>
      </header>

      <div className="schedule-matrix-legend" aria-label="Schedule status legend">
        <span className="schedule-matrix-pill available">Free <span className="sr-only">(FREE)</span></span>
        <span className="schedule-matrix-pill booked">Booked</span>
        <span className="schedule-matrix-pill occupied">Occupied</span>
      </div>

      {loading ? (
        <div className="schedule-matrix-scroll" role="status" aria-label="Loading weekly schedule">
          <div className="schedule-matrix-skeleton">{Array.from({ length: 7 * 4 }, (_, index) => <span key={index} />)}</div>
        </div>
      ) : !weekSlots.length ? (
        <div className="schedule-matrix-empty">
          <h3>No availability configured for this week</h3>
          <p>Add working hours to start building your weekly schedule.</p>
          <button className="button" type="button" aria-label="Add working hours for this week" onClick={onAddAvailability}>+ Add Availability</button>
        </div>
      ) : (
        <div className="schedule-matrix-scroll" tabIndex={0} role="region" aria-label="Weekly schedule matrix. Scroll horizontally to see all days.">
          <table className="schedule-matrix-table">
            <thead><tr>
              <th scope="col">Time</th>
              {dates.map((day) => (
                <th className={day === today ? "is-today" : ""} scope="col" key={day}>
                  <span className="sr-only">{weekDateLabel(day)}{day === today ? ", today" : ""}</span>
                  <span className="schedule-matrix-day" aria-hidden="true">
                    <span className="schedule-matrix-dow">{weekDateLabel(day).split(" ")[0]}</span>
                    <span className="schedule-matrix-daynum">{weekDateLabel(day).split(" ")[1]}</span>
                  </span>
                </th>
              ))}
            </tr></thead>
            <tbody>
            {times.map((time) => (
              <tr key={time}>
                <th className="schedule-matrix-time" scope="row"><time>{time}</time></th>
                {dates.map((day) => {
                  const slot = slotsByCell.get(`${day}|${time}`);
                  if (!slot) return <td className="schedule-matrix-cell schedule-matrix-cell-empty" key={day}><span aria-hidden="true">—</span><span className="sr-only">No slot scheduled</span></td>;
                  const status = slot.status === "FREE" ? "available" : slot.status === "BOOKED" ? "booked" : "occupied";
                  const statusName = slot.status === "FREE" ? "Free" : slot.status === "BOOKED" ? "Booked" : "Occupied";
                  const patientName = slot.patient ? `${slot.patient.firstName} ${slot.patient.lastName}` : "";
                  const detail = slot.status === "BOOKED" ? patientName || "Booked appointment" : slot.status === "OCCUPIED" ? "Unavailable" : "Open appointment";
                  const selected = slot.id === selectedSlotId;
                  return (
                    <td className="schedule-matrix-cell" key={day}>
                      <button
                        type="button"
                        className={`schedule-matrix-slot ${status}${selected ? " is-selected" : ""}`}
                        aria-label={`${weekDateLabel(day)}, ${time}, ${statusName}${patientName ? `, ${patientName}` : ""}${slot.visitPurpose ? `, ${slot.visitPurpose}` : ""}`}
                        aria-pressed={selected}
                        onClick={() => onSelectSlot(slot)}
                      >
                        <strong>{slot.status === "FREE" ? statusName : patientName || statusName}</strong>
                        <span className="schedule-matrix-slot-time">{time}–{almatyTime(slot.endAt)}</span>
                        <span className="schedule-matrix-slot-tag">{slot.status === "FREE" ? detail : slot.status === "BOOKED" ? (slot.visitPurpose || "Booked") : "Checked in"}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="schedule-matrix-footnote">Availability and booking status are written on each slot, not communicated through colour alone.</p>
    </section>
  );
}
