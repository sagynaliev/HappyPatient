import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ScheduleSlot } from "../lib/api";

const timeZone = "Asia/Almaty";
const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

function dateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function slotDateInAlmaty(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDateInAlmaty(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(new Date(`${value}T12:00:00Z`));
}

export function formatTimeInAlmaty(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

type AvailabilityCalendarProps = {
  slots: ScheduleSlot[];
  selectedDate: string;
  displayDate?: string;
  onDateChange: (date: string) => void;
  compact?: boolean;
};

export default function AvailabilityCalendar({
  slots,
  selectedDate,
  displayDate,
  onDateChange,
  compact = false,
}: AvailabilityCalendarProps) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const calendarDate = selectedDate || displayDate || slotDateInAlmaty(new Date().toISOString());
  const calendarParts = calendarDate.split("-").map(Number);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(Date.UTC(calendarParts[0], calendarParts[1] - 1, 1)));
  useEffect(() => {
    const [year, month] = (selectedDate || displayDate || slotDateInAlmaty(new Date().toISOString())).split("-").map(Number);
    setVisibleMonth(new Date(Date.UTC(year, month - 1, 1)));
  }, [displayDate, selectedDate]);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(visibleMonth);
  const availableDays = useMemo(() => new Set(
    slots
      .filter((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > Date.now())
      .map((slot) => slotDateInAlmaty(slot.startAt)),
  ), [slots]);

  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstWeekday = (visibleMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day < 1 || day > daysInMonth
      ? null
      : dateKey(new Date(Date.UTC(year, month, day)));
  });

  function changeMonth(delta: number) {
    setVisibleMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)));
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentDate: string) {
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      changeMonth(event.key === "PageUp" ? -1 : 1);
      return;
    }
    const movement: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = movement[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = new Date(`${currentDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    const nextDate = dateKey(next);
    if (availableDays.has(nextDate)) {
      onDateChange(nextDate);
      window.requestAnimationFrame(() => {
        calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextDate}"]`)?.focus();
      });
    }
  }

  return (
    <section className={`bk-calendar${compact ? " bk-calendar--compact" : ""}`} aria-label="Appointment availability">
      <div className="bk-calendar-header">
        <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" /></svg>
        </button>
        <h3>{monthLabel}</h3>
        <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" /></svg>
        </button>
      </div>
      <div className="bk-calendar-weekdays" aria-hidden="true">
        {weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
      <div className="bk-calendar-grid" role="grid" ref={calendarRef} aria-label={monthLabel}>
        {cells.map((value, index) => {
          if (!value) return <span className="bk-calendar-empty" role="gridcell" aria-hidden="true" key={`empty-${index}`} />;
          const day = Number(value.slice(-2));
          const available = availableDays.has(value);
          const selected = Boolean(selectedDate) && selectedDate === value;
          const label = formatDateInAlmaty(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          return (
            <div role="gridcell" aria-selected={selected} key={value}>
              <button
                className={`bk-calendar-day${available ? " is-available" : ""}${selected ? " is-selected" : ""}`}
                type="button"
                disabled={!available}
                aria-label={`${label}${available ? ", appointments available" : ", unavailable"}`}
                aria-pressed={selected}
                data-date={value}
                onClick={() => onDateChange(value)}
                onKeyDown={(event) => onGridKeyDown(event, value)}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type TimeSlotGridProps = {
  slots: ScheduleSlot[];
  selectedSlotId?: string;
  onSelect: (slot: ScheduleSlot) => void;
  compact?: boolean;
  disabled?: boolean;
};

export function TimeSlotGrid({ slots, selectedSlotId, onSelect, compact = false, disabled = false }: TimeSlotGridProps) {
  if (!slots.length) return <p className="bk-no-slots">No appointment times are listed for this date.</p>;
  return (
    <div className={`bk-slot-grid${compact ? " bk-slot-grid--compact" : ""}`} role="group" aria-label="Appointment times">
      {slots.map((slot) => {
        const available = slot.status === "FREE" && Date.parse(slot.startAt) > Date.now();
        const selected = selectedSlotId === slot.id;
        const start = formatTimeInAlmaty(slot.startAt);
        const end = formatTimeInAlmaty(slot.endAt);
        return (
          <button
            className={`bk-slot${selected ? " is-selected" : ""}${available ? "" : " is-unavailable"}`}
            type="button"
            key={slot.id}
            disabled={!available || disabled}
            aria-pressed={selected}
            aria-label={`${start}–${end}, ${selected ? "selected" : available ? "available" : "unavailable"}`}
            onClick={() => onSelect(slot)}
          >
            {compact ? (
              <>
                <span>{start}–{end}</span>
                <span className="bk-slot-status">{selected ? "selected" : available ? "available" : "unavailable"}</span>
              </>
            ) : (
              `${start}–${end} · ${selected ? "selected" : available ? "available" : "unavailable"}`
            )}
          </button>
        );
      })}
    </div>
  );
}
