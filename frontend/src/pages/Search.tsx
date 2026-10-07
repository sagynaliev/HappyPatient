import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DoctorCard, { DoctorCardSkeleton } from "../components/DoctorCard";
import DoctorFilters, {
  AvailabilityFilter,
  FilterFocus,
  TimeFilter,
} from "../components/DoctorFilters";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { useAuth } from "../context/AuthContext";
import { api, Doctor, doctorDirectoryApi } from "../lib/api";

type Category = { id: string; name: string };
type Suggestion = { kind: "specialty" | "doctor" | "clinic"; label: string };

const availabilityLabels: Record<Exclude<AvailabilityFilter, "">, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  "this-week": "This week",
};

const timeLabels: Record<Exclude<TimeFilter, "">, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

function parseAvailability(value: string | null): AvailabilityFilter {
  return value === "today" || value === "tomorrow" || value === "this-week" ? value : "";
}

function parseTime(value: string | null): TimeFilter {
  return value === "morning" || value === "afternoon" || value === "evening" ? value : "";
}

export default function Search() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedQuery = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const availability = parseAvailability(searchParams.get("availability"));
  const timeOfDay = parseTime(searchParams.get("timeOfDay"));
  const office = searchParams.get("office") || "";
  const [query, setQuery] = useState(appliedQuery);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState("");
  const [sort, setSort] = useState<"recommended" | "name">("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FilterFocus>("specialty");
  const [retryCount, setRetryCount] = useState(0);
  const [categoriesRetryCount, setCategoriesRetryCount] = useState(0);
  const [locationsRetryCount, setLocationsRetryCount] = useState(0);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setQuery(appliedQuery);
  }, [appliedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setCategoriesError("");
    api<{ categories: Category[] }>("/categories", { signal: controller.signal })
      .then((result) => setCategories(result.categories || []))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setCategoriesError(err instanceof Error ? err.message : "Unable to load specialties.");
      });
    return () => controller.abort();
  }, [categoriesRetryCount]);

  useEffect(() => {
    const controller = new AbortController();
    setLocationsLoading(true);
    setLocationsError("");
    doctorDirectoryApi.locations({ signal: controller.signal })
      .then((result) => setLocations(result.locations))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLocationsError(err instanceof Error ? err.message : "Unable to load clinic locations.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoading(false);
      });
    return () => controller.abort();
  }, [locationsRetryCount]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const filters = new URLSearchParams();
      filters.set("q", appliedQuery);
      filters.set("category", category);
      filters.set("office", office);
      filters.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (availability) filters.set("availability", availability);
      if (timeOfDay) filters.set("timeOfDay", timeOfDay);

      api<{ doctors: Doctor[] }>(`/doctors?${filters.toString()}`, { signal: controller.signal })
        .then((result) => setDoctors(result.doctors || []))
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            setError(err instanceof Error ? err.message : "Unable to load doctors.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [appliedQuery, availability, category, office, retryCount, timeOfDay]);

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next, { replace: true });
  }

  function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    updateParams({ q: query.trim() });
  }

  function selectSuggestion(suggestion: Suggestion) {
    if (suggestion.kind === "specialty") {
      setQuery("");
      updateParams({ q: "", category: suggestion.label });
    } else if (suggestion.kind === "clinic") {
      setQuery("");
      updateParams({ q: "", office: suggestion.label });
    } else {
      setQuery(suggestion.label);
      updateParams({ q: suggestion.label });
    }
  }

  function openFilters(event: MouseEvent<HTMLButtonElement>, target: FilterFocus) {
    returnFocusRef.current = event.currentTarget;
    setFocusTarget(target);
    setFiltersOpen(true);
  }

  function clearFilters() {
    updateParams({ category: "", availability: "", timeOfDay: "", office: "" });
    window.requestAnimationFrame(() => {
      if (filtersOpen) {
        document.querySelector<HTMLButtonElement>("[data-show-doctors]")?.focus();
      } else {
        document.querySelector<HTMLButtonElement>('[data-filter-trigger="specialty"]')?.focus();
      }
    });
  }

  function removeFilter(key: "category" | "availability" | "timeOfDay" | "office") {
    updateParams({ [key]: "" });
    const trigger = key === "category"
      ? "specialty"
      : key === "availability"
          ? "availability"
          : "all-filters";
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-filter-trigger="${trigger}"]`)?.focus();
    });
  }

  const sortedDoctors = useMemo(() => {
    if (sort === "recommended") return doctors;
    return [...doctors].sort((a, b) => {
      const nameA = `${a.user.firstName} ${a.user.lastName}`;
      const nameB = `${b.user.firstName} ${b.user.lastName}`;
      return nameA.localeCompare(nameB);
    });
  }, [doctors, sort]);

  const activeFilterCount = Number(Boolean(category))
    + Number(Boolean(availability))
    + Number(Boolean(timeOfDay))
    + Number(Boolean(office));
  const queryString = searchParams.toString();
  const hasSearch = Boolean(appliedQuery || activeFilterCount);

  return (
    <div className="search-page">
      <section className="search-hero">
        <div>
          <p className="eyebrow eyebrow-light">Your care, on your terms</p>
          <h1>
            Find the right<br />
            <em>doctor for you.</em>
          </h1>
          <p>Search a growing network of specialists ready to listen, understand, and help.</p>
        </div>
        <div className="search-hero-orb" aria-hidden="true"><span>+</span></div>
      </section>

      <div className="search-content">
        <DoctorSearchForm
          query={query}
          category={category}
          office={office}
          categories={categories}
          onQueryChange={setQuery}
          onCategoryChange={(value) => updateParams({ category: value })}
          onOfficeChange={(value) => updateParams({ office: value })}
          onSubmit={submitSearch}
          onSuggestionSelect={selectSuggestion}
          onClear={() => updateParams({ q: "" })}
        />

        <section className="results-section" aria-labelledby="results-title">
          <div className="results-heading-row">
            <div>
              <p className="eyebrow">Care directory</p>
              <h2 id="results-title">Doctors</h2>
              <p className="results-count" aria-live="polite">
                {loading ? "Finding available care…" : `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} found`}
              </p>
            </div>
            <label className="sort-control">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as "recommended" | "name")}>
                <option value="recommended">Recommended</option>
                <option value="name">Name, A to Z</option>
              </select>
            </label>
          </div>

          <div className="filter-chip-row" aria-label="Doctor filters">
            {category ? (
              <button className="filter-chip is-active" data-active-filter="category" type="button" aria-label={`Remove ${category} filter`} onClick={() => removeFilter("category")}>
                {category}<span aria-hidden="true">×</span>
              </button>
            ) : (
              <button className="filter-chip" data-filter-trigger="specialty" type="button" onClick={(event) => openFilters(event, "specialty")}>Specialty</button>
            )}
            {availability ? (
              <button className="filter-chip is-active" data-active-filter="availability" type="button" aria-label={`Remove ${availabilityLabels[availability]} filter`} onClick={() => removeFilter("availability")}>
                {availabilityLabels[availability]}<span aria-hidden="true">×</span>
              </button>
            ) : (
              <button className="filter-chip" data-filter-trigger="availability" type="button" onClick={(event) => openFilters(event, "availability")}>Availability</button>
            )}
            {timeOfDay && (
              <button className="filter-chip is-active" data-active-filter="timeOfDay" type="button" aria-label={`Remove ${timeLabels[timeOfDay]} filter`} onClick={() => removeFilter("timeOfDay")}>
                {timeLabels[timeOfDay]}<span aria-hidden="true">×</span>
              </button>
            )}
            {office && (
              <button className="filter-chip is-active" data-active-filter="office" type="button" aria-label={`Remove ${office} location filter`} onClick={() => removeFilter("office")}>
                {office}<span aria-hidden="true">×</span>
              </button>
            )}
            <button className="filter-chip" type="button" disabled aria-label="Price filter, not available yet" title="This filter is not available yet">Price</button>
            <button className="filter-chip" type="button" disabled aria-label="Rating filter, not available yet" title="This filter is not available yet">Rating</button>
            <button className="filter-chip" type="button" disabled aria-label="Online filter, not available yet" title="This filter is not available yet">Online</button>
            <button className="filter-chip filter-chip-all" data-filter-trigger="all-filters" type="button" onClick={(event) => openFilters(event, "specialty")}>All filters</button>
            {activeFilterCount > 1 && (
              <button className="clear-filters-link" type="button" onClick={clearFilters}>Clear all</button>
            )}
          </div>

          {categoriesError && (
            <div className="alert error" role="alert">
              <strong>Specialties could not be loaded.</strong>
              <span>{categoriesError}</span>
              <button className="text-link" type="button" onClick={() => setCategoriesRetryCount((value) => value + 1)}>Try again</button>
            </div>
          )}

          {error && (
            <div className="search-state search-error" role="alert">
              <span className="search-state-icon" aria-hidden="true">!</span>
              <h3>Something went wrong</h3>
              <p>{error}</p>
              <button className="button" type="button" onClick={() => setRetryCount((value) => value + 1)}>Try again</button>
            </div>
          )}

          {!error && (
            <div className="doctor-list" aria-busy={loading}>
              {loading ? (
                Array.from({ length: 3 }, (_, index) => <DoctorCardSkeleton key={index} />)
              ) : sortedDoctors.length ? (
                sortedDoctors.map((doctor) => (
                  <DoctorCard
                    key={doctor.id}
                    doctor={doctor}
                    canBook={user?.role === "PATIENT"}
                    checkingAccess={authLoading}
                    role={user?.role}
                    queryString={queryString}
                  />
                ))
              ) : (
                <div className="search-state">
                  <span className="search-state-icon" aria-hidden="true">⌕</span>
                  <h3>No doctors found</h3>
                  <p>{hasSearch ? "Try adjusting your search or clearing the filters to see more results." : "There are no doctors to show right now. Please check back later."}</p>
                  {hasSearch && <button className="button" type="button" onClick={() => { setQuery(""); updateParams({ q: "", category: "", availability: "", timeOfDay: "", office: "" }); }}>Clear filters</button>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <DoctorFilters
        open={filtersOpen}
        focusTarget={focusTarget}
        categories={categories}
        locations={locations}
        locationsLoading={locationsLoading}
        locationsError={locationsError}
        specialty={category}
        availability={availability}
        timeOfDay={timeOfDay}
        office={office}
        returnFocusRef={returnFocusRef}
        onClose={() => setFiltersOpen(false)}
        onSpecialtyChange={(value) => updateParams({ category: value })}
        onAvailabilityChange={(value) => updateParams({ availability: value })}
        onTimeChange={(value) => updateParams({ timeOfDay: value })}
        onOfficeChange={(value) => updateParams({ office: value })}
        onRetryLocations={() => setLocationsRetryCount((value) => value + 1)}
        onClearAll={clearFilters}
        onShowDoctors={() => setFiltersOpen(false)}
        activeFilterCount={activeFilterCount}
      />
    </div>
  );
}
