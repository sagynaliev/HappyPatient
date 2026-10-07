import { KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from "react";

export type AvailabilityFilter = "" | "today" | "tomorrow" | "this-week";
export type TimeFilter = "" | "morning" | "afternoon" | "evening";
export type FilterFocus = "specialty" | "availability" | "appointment" | "more";

type Category = { id: string; name: string };

type DoctorFiltersProps = {
  open: boolean;
  focusTarget: FilterFocus;
  categories: Category[];
  specialty: string;
  availability: AvailabilityFilter;
  timeOfDay: TimeFilter;
  office: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSpecialtyChange: (value: string) => void;
  onAvailabilityChange: (value: AvailabilityFilter) => void;
  onTimeChange: (value: TimeFilter) => void;
  onOfficeChange: (value: string) => void;
};

const availabilityOptions: Array<{ value: AvailabilityFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This week" },
];

const timeOptions: Array<{ value: TimeFilter; label: string }> = [
  { value: "morning", label: "Morning · 6 AM–12 PM UTC" },
  { value: "afternoon", label: "Afternoon · 12–5 PM UTC" },
  { value: "evening", label: "Evening · 5 PM–12 AM UTC" },
];

export default function DoctorFilters({
  open,
  focusTarget,
  categories,
  specialty,
  availability,
  timeOfDay,
  office,
  returnFocusRef,
  onClose,
  onSpecialtyChange,
  onAvailabilityChange,
  onTimeChange,
  onOfficeChange,
}: DoctorFiltersProps) {
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const searchId = useId();
  const officeId = useId();

  useEffect(() => {
    if (!open) return;
    setSpecialtyQuery("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(`[data-filter-focus="${focusTarget}"]`);
      if (target && focusTarget !== "specialty") {
        target.focus();
        return;
      }
      const searchInput = dialogRef.current?.querySelector<HTMLElement>('input[type="search"]:not(:disabled)');
      (searchInput ?? dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [focusTarget, open, returnFocusRef]);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  const matchingCategories = categories.filter((item) =>
    item.name.toLocaleLowerCase().includes(specialtyQuery.trim().toLocaleLowerCase()),
  );

  return (
    <div className="filter-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="filter-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-filters-title"
        onKeyDown={trapFocus}
      >
        <header className="filter-drawer-header">
          <div>
            <p className="eyebrow">Refine your search</p>
            <h2 id="doctor-filters-title">All filters</h2>
          </div>
          <button className="filter-close" type="button" onClick={onClose} aria-label="Close filters">×</button>
        </header>

        <div className="filter-drawer-content">
          <fieldset className="filter-section" data-filter-focus="specialty" tabIndex={-1}>
            <legend>Specialty</legend>
            <label className="filter-search" htmlFor={searchId}>Search specialty...</label>
            <input
              id={searchId}
              type="search"
              value={specialtyQuery}
              onChange={(event) => setSpecialtyQuery(event.target.value)}
              placeholder="Search specialty..."
            />
            <div className="filter-radio-list">
              <label className="filter-radio">
                <input
                  type="radio"
                  name="doctor-specialty"
                  checked={!specialty}
                  onChange={() => {
                    onSpecialtyChange("");
                    onClose();
                  }}
                />
                <span>Any specialty</span>
              </label>
              {matchingCategories.map((item) => (
                <label className="filter-radio" key={item.id}>
                  <input
                    type="radio"
                    name="doctor-specialty"
                    value={item.name}
                    checked={specialty === item.name}
                    onChange={() => {
                      onSpecialtyChange(item.name);
                      onClose();
                    }}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
              {!matchingCategories.length && <p className="filter-hint">No specialties match that search.</p>}
            </div>
          </fieldset>

          <fieldset className="filter-section" data-filter-focus="availability" tabIndex={-1}>
            <legend>Availability</legend>
            <div className="filter-choice-list">
              {availabilityOptions.map((option) => (
                <label className="filter-radio" key={option.value}>
                  <input
                    type="radio"
                    name="doctor-availability"
                    checked={availability === option.value}
                    onChange={() => onAvailabilityChange(availability === option.value ? "" : option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="filter-hint">Availability uses published free appointment times in UTC.</p>
          </fieldset>

          <fieldset className="filter-section" data-filter-focus="time" tabIndex={-1}>
            <legend>Time of day</legend>
            <div className="filter-choice-list">
              {timeOptions.map((option) => (
                <label className="filter-radio" key={option.value}>
                  <input
                    type="radio"
                    name="doctor-time"
                    checked={timeOfDay === option.value}
                    onChange={() => onTimeChange(timeOfDay === option.value ? "" : option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="filter-section">
            <label className="filter-section-title" htmlFor={officeId}>Location</label>
            <input
              id={officeId}
              type="search"
              value={office}
              onChange={(event) => onOfficeChange(event.target.value)}
              placeholder="Search by clinic or location"
            />
          </div>

          <fieldset className="filter-section" data-filter-focus="appointment" tabIndex={-1}>
            <legend>Appointment type</legend>
            <p className="filter-hint">Online and in-person visit types are not listed in doctor profiles yet.</p>
          </fieldset>

          <fieldset className="filter-section" data-filter-focus="more" tabIndex={-1}>
            <legend>More filters</legend>
            <p className="filter-hint">Price, rating, experience, and language details are not listed in doctor profiles yet.</p>
          </fieldset>
        </div>

        <footer className="filter-drawer-footer">
          <button className="button" type="button" onClick={onClose}>Show doctors</button>
        </footer>
      </section>
    </div>
  );
}
