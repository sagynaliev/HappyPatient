import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { AvailabilityFilter, TimeFilter } from "./DoctorFilters";

type Category = { id: string; name: string };

type FindDoctorFiltersProps = {
  open: boolean;
  categories: Category[];
  specialty: string;
  availability: AvailabilityFilter;
  timeOfDay: TimeFilter;
  maximumPrice: string;
  onSpecialtyChange: (value: string) => void;
  onAvailabilityChange: (value: AvailabilityFilter) => void;
  onTimeOfDayChange: (value: TimeFilter) => void;
  onMaximumPriceChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
};

export default function FindDoctorFilters({
  open,
  categories,
  specialty,
  availability,
  timeOfDay,
  maximumPrice,
  onSpecialtyChange,
  onAvailabilityChange,
  onTimeOfDayChange,
  onMaximumPriceChange,
  onApply,
  onReset,
  onClose,
}: FindDoctorFiltersProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const matchingCategories = categories.filter((category) =>
    category.name.toLocaleLowerCase().includes(specialtyQuery.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    ));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply();
  }

  if (!open) return null;
  return (
    <div className="filter-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="filter-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-filter-title"
        onKeyDown={handleKeyDown}
      >
        <header className="filter-drawer-header">
          <div>
            <p className="eyebrow">Refine your search</p>
            <h2 id="find-filter-title">Filters</h2>
          </div>
          <button className="filter-close" type="button" onClick={onClose} aria-label="Close filters">×</button>
        </header>

        <form className="filter-drawer-content fd-filter-content" onSubmit={submit}>
          <fieldset className="filter-section">
            <legend>Specialty</legend>
            <label className="sr-only" htmlFor="find-filter-specialty-search">Search specialty</label>
            <input
              id="find-filter-specialty-search"
              type="search"
              value={specialtyQuery}
              onChange={(event) => setSpecialtyQuery(event.target.value)}
              placeholder="Search specialty"
            />
            <div className="filter-radio-list fd-specialty-list">
              <label className="filter-radio">
                <input type="radio" name="doctor-specialty" checked={!specialty} onChange={() => onSpecialtyChange("")} />
                <span>All specialties</span>
              </label>
              {matchingCategories.map((category) => (
                <label className="filter-radio" key={category.id}>
                  <input
                    type="radio"
                    name="doctor-specialty"
                    value={category.name}
                    checked={specialty === category.name}
                    onChange={() => onSpecialtyChange(category.name)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
              {!matchingCategories.length && <p className="filter-hint">No specialties found.</p>}
            </div>
          </fieldset>

          <fieldset className="filter-section">
            <legend>Availability</legend>
            <div className="filter-radio-list">
              {([
                ["", "Any date"],
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["this-week", "This week"],
              ] as Array<[AvailabilityFilter, string]>).map(([value, label]) => (
                <label className="filter-radio" key={value || "any-date"}>
                  <input type="radio" name="doctor-availability" checked={availability === value} onChange={() => onAvailabilityChange(value)} />
                  <span>{label}</span>
                  {availability === value && <small aria-hidden="true">Selected</small>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-section">
            <legend>Time of day</legend>
            <div className="filter-radio-list">
              {([
                ["", "Any time"],
                ["morning", "Morning"],
                ["afternoon", "Afternoon"],
                ["evening", "Evening"],
              ] as Array<[TimeFilter, string]>).map(([value, label]) => (
                <label className="filter-radio" key={value || "any-time"}>
                  <input type="radio" name="doctor-time" checked={timeOfDay === value} onChange={() => onTimeOfDayChange(value)} />
                  <span>{label}</span>
                  {timeOfDay === value && <small aria-hidden="true">Selected</small>}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="filter-section fd-price-filter">
            <span>Maximum price <small>(KZT)</small></span>
            <input
              type="number"
              min="0"
              step="500"
              value={maximumPrice}
              onChange={(event) => onMaximumPriceChange(event.target.value)}
              placeholder="Any price"
              inputMode="numeric"
            />
          </label>

          <div className="filter-drawer-footer">
            <button className="clear-filters-link" type="button" onClick={onReset}>Reset All</button>
            <button className="button" type="submit">Apply Filters</button>
          </div>
        </form>
      </section>
    </div>
  );
}
