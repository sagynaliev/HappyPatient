import { KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from "react";

export type AvailabilityFilter = "" | "today" | "tomorrow" | "this-week";
export type TimeFilter = "" | "morning" | "afternoon" | "evening";
export type FilterFocus = "specialty" | "availability";

type Category = { id: string; name: string };

type DoctorFiltersProps = {
  open: boolean;
  focusTarget: FilterFocus;
  categories: Category[];
  locations: string[];
  locationsLoading: boolean;
  locationsError: string;
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
  onRetryLocations: () => void;
  onClearAll: () => void;
  onShowDoctors: () => void;
  activeFilterCount: number;
};

const availabilityOptions: Array<{ value: AvailabilityFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This week" },
];

const timeOptions: Array<{ value: TimeFilter; label: string; range: string }> = [
  { value: "morning", label: "Morning", range: "6 AM–12 PM" },
  { value: "afternoon", label: "Afternoon", range: "12 PM–5 PM" },
  { value: "evening", label: "Evening", range: "5 PM–12 AM" },
];

export default function DoctorFilters({
  open,
  focusTarget,
  categories,
  locations,
  locationsLoading,
  locationsError,
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
  onRetryLocations,
  onClearAll,
  onShowDoctors,
  activeFilterCount,
}: DoctorFiltersProps) {
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSelectorOpen, setLocationSelectorOpen] = useState(false);
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set(["1"]));
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLElement>(null);
  const searchId = useId();
  const locationSearchId = useId();

  useEffect(() => {
    if (!open) return;
    setSpecialtyQuery("");
    setLocationQuery("");
    setLocationSelectorOpen(false);
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
      const activeFilter = focusTarget === "specialty"
        ? "category"
        : focusTarget === "availability" ? "availability" : undefined;
      const fallback = activeFilter
        ? document.querySelector<HTMLButtonElement>(`[data-active-filter="${activeFilter}"]`)
        : null;
      (returnFocusRef.current?.isConnected ? returnFocusRef.current : fallback)?.focus();
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
  const normalizedLocationQuery = locationQuery.trim().toLocaleLowerCase();
  const floorQuery = /^(?:floor\s*)?(\d+)$/i.exec(normalizedLocationQuery)?.[1];
  const matchingLocations = locations.filter((location) =>
    location.toLocaleLowerCase().includes(normalizedLocationQuery)
      || (floorQuery !== undefined && /^office\s+\d+$/i.test(location)
        && String(Math.floor(Number(location.match(/\d+/)?.[0]) / 100)) === floorQuery),
  );
  const officesByFloor = new Map<string, string[]>();
  const otherLocations: string[] = [];
  matchingLocations.forEach((location) => {
    const officeNumber = /^office\s+(\d+)$/i.exec(location)?.[1];
    const floor = officeNumber ? String(Math.floor(Number(officeNumber) / 100)) : "";
    if (!floor || Number(floor) < 1) {
      otherLocations.push(location);
      return;
    }
    officesByFloor.set(floor, [...(officesByFloor.get(floor) ?? []), location]);
  });
  const floorGroups = [...officesByFloor.entries()].sort(([floorA], [floorB]) => Number(floorA) - Number(floorB));
  floorGroups.forEach(([, offices]) => offices.sort((officeA, officeB) => officeA.localeCompare(officeB, undefined, { numeric: true })));

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
            <label className="sr-only" htmlFor={searchId}>Search specialty...</label>
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
                    onChange={() => {
                      onAvailabilityChange(option.value);
                      onClose();
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-section">
            <legend>Time of day</legend>
            <div className="filter-choice-list">
              {timeOptions.map((option) => (
                <label className="filter-radio" key={option.value}>
                  <input
                    type="radio"
                    name="doctor-time"
                    checked={timeOfDay === option.value}
                    onChange={() => {
                      onTimeChange(option.value);
                      onClose();
                    }}
                  />
                  <span className="filter-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.range}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-section">
            <legend>Location</legend>
            <div className="location-selector">
              <button
                className="location-trigger"
                type="button"
                aria-expanded={locationSelectorOpen}
                aria-controls="location-selector-panel"
                onClick={() => setLocationSelectorOpen((isOpen) => !isOpen)}
              >
                <span>{office || "Any location"}</span>
                <span className="location-chevron" aria-hidden="true" />
              </button>
              {locationSelectorOpen && (
                <div className="location-panel" id="location-selector-panel" aria-label="Choose a location">
                  <label className="sr-only" htmlFor={locationSearchId}>Search office or location</label>
                  <input
                    id={locationSearchId}
                    className="location-search"
                    type="search"
                    placeholder="Search office or location..."
                    value={locationQuery}
                    onChange={(event) => {
                      setLocationQuery(event.target.value);
                      setCollapsedFloors(new Set());
                    }}
                  />
                  <button
                    className={`location-any${office ? "" : " is-selected"}`}
                    type="button"
                    aria-pressed={!office}
                    onClick={() => {
                      onOfficeChange("");
                      setLocationSelectorOpen(false);
                      onClose();
                    }}
                  >
                    Any location
                    {!office && <span aria-hidden="true">Selected</span>}
                  </button>
                  <div className="location-hierarchy" aria-busy={locationsLoading}>
                    {locationsLoading && <p className="location-state" role="status">Loading locations...</p>}
                    {!locationsLoading && locationsError && (
                      <div className="location-state" role="alert">
                        <p>Locations could not be loaded.</p>
                        <button className="text-link" type="button" onClick={onRetryLocations}>Try again</button>
                      </div>
                    )}
                    {!locationsLoading && !locationsError && locations.length === 0 && (
                      <p className="location-state">No clinic locations are available.</p>
                    )}
                    {!locationsLoading && !locationsError && locations.length > 0 && matchingLocations.length === 0 && (
                      <p className="location-state" role="status">No results found</p>
                    )}
                    {!locationsLoading && !locationsError && matchingLocations.length > 0 && (
                      <>
                        <p className="location-city">Astana</p>
                        {floorGroups.map(([floor, offices]) => {
                          const expanded = expandedFloors.has(floor)
                            || (normalizedLocationQuery.length > 0 && !collapsedFloors.has(floor));
                          return (
                            <section className="location-floor" key={floor}>
                              <button
                                className="location-floor-toggle"
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => {
                                  setExpandedFloors((current) => {
                                  const next = new Set(current);
                                  if (expanded) next.delete(floor);
                                  else next.add(floor);
                                  return next;
                                  });
                                  setCollapsedFloors((current) => {
                                    const next = new Set(current);
                                    if (expanded) next.add(floor);
                                    else next.delete(floor);
                                    return next;
                                  });
                                }}
                              >
                                <span className="location-floor-chevron" aria-hidden="true" />
                                <span>Floor {floor}</span>
                                <small>{offices.length}</small>
                              </button>
                              {expanded && (
                                <div className="location-office-grid">
                                  {offices.map((location) => (
                                    <button
                                      className={`location-office${office === location ? " is-selected" : ""}`}
                                      type="button"
                                      key={location}
                                      aria-pressed={office === location}
                                      onClick={() => {
                                        onOfficeChange(location);
                                        setLocationSelectorOpen(false);
                                        onClose();
                                      }}
                                    >
                                      {location}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </section>
                          );
                        })}
                        {otherLocations.length > 0 && (
                          <section className="location-floor">
                            <p className="location-city">Other locations</p>
                            <div className="location-office-grid">
                              {otherLocations.map((location) => (
                                <button
                                  className={`location-office${office === location ? " is-selected" : ""}`}
                                  type="button"
                                  key={location}
                                  aria-pressed={office === location}
                                  onClick={() => {
                                    onOfficeChange(location);
                                    setLocationSelectorOpen(false);
                                    onClose();
                                  }}
                                >
                                  {location}
                                </button>
                              ))}
                            </div>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        </div>

        <footer className="filter-drawer-footer">
          {activeFilterCount > 0 && (
            <button className="clear-filters-link" type="button" onClick={onClearAll}>Clear all</button>
          )}
          <button className="button" data-show-doctors type="button" onClick={onShowDoctors}>Show doctors</button>
        </footer>
      </section>
    </div>
  );
}
