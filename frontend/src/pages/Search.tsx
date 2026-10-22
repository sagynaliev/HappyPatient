import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DoctorCard, { DoctorCardSkeleton } from "../components/DoctorCard";
import FindDoctorFilters from "../components/FindDoctorFilters";
import DoctorSearchForm from "../components/DoctorSearchForm";
import { AvailabilityFilter, TimeFilter } from "../components/DoctorFilters";
import { useAuth } from "../context/AuthContext";
import { api, Doctor, doctorDirectoryApi } from "../lib/api";
import "../styles/findDoctor.css";

type Category = { id: string; name: string };
type SortOption = "recommended" | "name" | "price-low" | "price-high" | "availability";
type RemovableFilter = "category" | "city" | "availability" | "timeOfDay" | "maxPrice";

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

function parseSort(value: string | null): SortOption {
  return value === "name" || value === "price-low" || value === "price-high" || value === "availability"
    ? value
    : "recommended";
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>;
}

function FilterIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5.5 10h9M8 15h4" /><circle cx="7" cy="5" r="1.5" /><circle cx="12.5" cy="10" r="1.5" /><circle cx="10" cy="15" r="1.5" /></svg>;
}

export default function Search() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedQuery = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const availability = parseAvailability(searchParams.get("availability"));
  const timeOfDay = parseTime(searchParams.get("timeOfDay"));
  const city = searchParams.get("city") || "";
  const maximumPrice = searchParams.get("maxPrice") || "";
  const sort = parseSort(searchParams.get("sort"));
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [query, setQuery] = useState(appliedQuery);
  const [location, setLocation] = useState(city);
  const [draftSpecialty, setDraftSpecialty] = useState(category);
  const [draftAvailability, setDraftAvailability] = useState<AvailabilityFilter>(availability);
  const [draftTimeOfDay, setDraftTimeOfDay] = useState<TimeFilter>(timeOfDay);
  const [draftMaximumPrice, setDraftMaximumPrice] = useState(maximumPrice);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [locationsError, setLocationsError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [categoriesRetryCount, setCategoriesRetryCount] = useState(0);
  const [locationsRetryCount, setLocationsRetryCount] = useState(0);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setQuery(appliedQuery), [appliedQuery]);
  useEffect(() => setLocation(city), [city]);
  useEffect(() => {
    setDraftSpecialty(category);
    setDraftAvailability(availability);
    setDraftTimeOfDay(timeOfDay);
    setDraftMaximumPrice(maximumPrice);
  }, [availability, category, maximumPrice, timeOfDay]);

  useEffect(() => {
    const controller = new AbortController();
    setCategoriesError("");
    api<{ categories: Category[] }>("/categories", { signal: controller.signal })
      .then((result) => setCategories(result.categories))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setCategoriesError(cause instanceof Error ? cause.message : "Unable to load specialties.");
      });
    return () => controller.abort();
  }, [categoriesRetryCount]);

  useEffect(() => {
    const controller = new AbortController();
    setLocationsError("");
    doctorDirectoryApi.cities({ signal: controller.signal })
      .then((result) => setLocations(result.cities))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLocationsError(cause instanceof Error ? cause.message : "Unable to load locations.");
      });
    return () => controller.abort();
  }, [locationsRetryCount]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const filters = new URLSearchParams();
    if (appliedQuery) filters.set("q", appliedQuery);
    if (category) filters.set("category", category);
    if (city) filters.set("city", city);
    if (availability) filters.set("availability", availability);
    if (timeOfDay) filters.set("timeOfDay", timeOfDay);
    filters.set("timeZone", "Asia/Almaty");

    const timer = window.setTimeout(() => {
      api<{ doctors: Doctor[] }>(`/doctors?${filters.toString()}`, { signal: controller.signal })
        .then((result) => setDoctors(result.doctors))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load doctors.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [appliedQuery, availability, category, city, retryCount, timeOfDay]);

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!("page" in updates)) next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ q: query.trim(), city: location });
  }

  function closeFilters() {
    setFiltersOpen(false);
    window.requestAnimationFrame(() => filterTriggerRef.current?.focus());
  }

  function applyFilters() {
    updateParams({
      category: draftSpecialty,
      availability: draftAvailability,
      timeOfDay: draftTimeOfDay,
      maxPrice: draftMaximumPrice.trim(),
    });
    closeFilters();
  }

  function resetAll() {
    setQuery("");
    setLocation("");
    setDraftSpecialty("");
    setDraftAvailability("");
    setDraftTimeOfDay("");
    setDraftMaximumPrice("");
    updateParams({ q: "", category: "", city: "", availability: "", timeOfDay: "", maxPrice: "", sort: "" });
    closeFilters();
  }

  function removeFilter(key: RemovableFilter) {
    updateParams({ [key]: "" });
  }

  const activeFilterCount = Number(Boolean(category))
    + Number(Boolean(city))
    + Number(Boolean(availability))
    + Number(Boolean(timeOfDay))
    + Number(Boolean(maximumPrice));

  const filteredDoctors = useMemo(() => {
    const maximum = Number(maximumPrice);
    const hasMaximumPrice = maximumPrice.trim() !== "" && Number.isFinite(maximum) && maximum >= 0;
    const filtered = hasMaximumPrice
      ? doctors.filter((doctor) => doctor.consultationFee <= maximum)
      : doctors.slice();

    switch (sort) {
      case "name":
        filtered.sort((a, b) => `${a.user.lastName} ${a.user.firstName}`.localeCompare(`${b.user.lastName} ${b.user.firstName}`));
        break;
      case "price-low":
        filtered.sort((a, b) => a.consultationFee - b.consultationFee);
        break;
      case "price-high":
        filtered.sort((a, b) => b.consultationFee - a.consultationFee);
        break;
      case "availability":
        filtered.sort((a, b) => (a.scheduleSlots[0]?.startAt || "9999").localeCompare(b.scheduleSlots[0]?.startAt || "9999"));
        break;
    }
    return filtered;
  }, [doctors, maximumPrice, sort]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredDoctors.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visiblePageCount = Math.min(pageCount, 5);
  const firstVisiblePage = Math.max(1, Math.min(currentPage - Math.floor(visiblePageCount / 2), pageCount - visiblePageCount + 1));
  const visiblePages = Array.from({ length: visiblePageCount }, (_, index) => firstVisiblePage + index);
  const pageDoctors = filteredDoctors.slice(pageStart, pageStart + pageSize);
  const rangeStart = filteredDoctors.length ? pageStart + 1 : 0;
  const rangeEnd = Math.min(pageStart + pageSize, filteredDoctors.length);
  const sortedBy = (value: SortOption) => updateParams({ sort: value === "recommended" ? "" : value });
  const goToPage = (value: number) => updateParams({ page: value > 1 ? String(value) : "" });

  const chips: Array<{ key: RemovableFilter; label: string }> = [];
  if (category) chips.push({ key: "category", label: category });
  if (city) chips.push({ key: "city", label: city });
  if (availability) chips.push({ key: "availability", label: `Available ${availabilityLabels[availability].toLocaleLowerCase()}` });
  if (timeOfDay) chips.push({ key: "timeOfDay", label: timeLabels[timeOfDay] });
  if (maximumPrice) chips.push({ key: "maxPrice", label: `Up to ${Number(maximumPrice).toLocaleString("en-US")} KZT` });

  return (
    <div className="fd-page">
      <div className="fd-container">
        <header className="fd-title-block">
          <h1>Find Your Doctor</h1>
          <p>Care that fits your needs, your location and your schedule.</p>
        </header>

        <section className="fd-search" aria-label="Find a doctor">
          <DoctorSearchForm
            query={query}
            category={category}
            office={location}
            categories={categories}
            locations={locations}
            onQueryChange={setQuery}
            onCategoryChange={setDraftSpecialty}
            onOfficeChange={setLocation}
            onSubmit={submitSearch}
            onSuggestionSelect={(suggestion) => {
              if (suggestion.kind === "specialty") updateParams({ category: suggestion.label });
              else if (suggestion.kind === "clinic") updateParams({ q: suggestion.label, city: "" });
              else updateParams({ q: suggestion.label });
            }}
            onClear={() => {
              setQuery("");
              updateParams({ q: "" });
            }}
            doctorFieldLabel="Name or specialty"
            buttonLabel="Search"
            showSubmit
            showLocation
            bare
          />
          {locationsError && (
            <p className="fd-inline-error" role="alert">
              Locations could not be loaded. <button type="button" onClick={() => setLocationsRetryCount((count) => count + 1)}>Try again</button>
            </p>
          )}
        </section>

        <section className="fd-results" aria-label={`${filteredDoctors.length} doctors found`}>
          <div className="fd-results-toolbar">
            <h2 id="fd-results-title" aria-live="polite">
              {loading ? "Finding doctors…" : `${filteredDoctors.length} ${filteredDoctors.length === 1 ? "doctor" : "doctors"} found`}
            </h2>
            <div className="fd-toolbar-actions">
              <button
                className="fd-toolbar-button"
                type="button"
                onClick={() => setFiltersOpen(true)}
                ref={filterTriggerRef}
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
              >
                <FilterIcon /> Filters ({activeFilterCount})
              </button>
              <label className="fd-sort-control">
                <span>Sort</span>
                <select aria-label="Sort doctors" value={sort} onChange={(event) => sortedBy(event.target.value as SortOption)}>
                  <option value="recommended">Recommended</option>
                  <option value="availability">Earliest available</option>
                  <option value="price-low">Lowest price</option>
                  <option value="price-high">Highest price</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="fd-active-filters" aria-label="Active filters">
              {chips.map(({ key, label }) => (
                <span className="active-filter-chip" key={key}>
                  {label}
                  <button type="button" aria-label={`Remove filter: ${label}`} onClick={() => removeFilter(key)}>×</button>
                </span>
              ))}
              <button className="clear-filters-link" type="button" onClick={resetAll}>Clear all</button>
            </div>
          )}

          {categoriesError && (
            <div className="fd-alert" role="alert">
              <span>Specialties could not be loaded.</span>
              <button type="button" onClick={() => setCategoriesRetryCount((count) => count + 1)}>Try again</button>
            </div>
          )}

          {error ? (
            <div className="fd-state fd-error-state" role="alert">
              <h3>Failed to load doctors</h3>
              <p>{error}</p>
              <button className="button" type="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
            </div>
          ) : loading ? (
            <div className="fd-grid" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => <DoctorCardSkeleton key={index} />)}
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="fd-state fd-empty-state">
              <span className="fd-empty-icon" aria-hidden="true"><SearchIcon /></span>
              <h3>No doctors found matching your criteria</h3>
              <p>Try changing your search or removing some filters.</p>
              <button className="button button-outline" type="button" onClick={resetAll}>Reset filters</button>
            </div>
          ) : (
            <>
              <div className="fd-grid">
                {pageDoctors.map((doctor) => (
                  <DoctorCard
                    key={doctor.id}
                    doctor={doctor}
                    canBook={user?.role === "PATIENT"}
                    checkingAccess={authLoading}
                    role={user?.role}
                    queryString={searchParams.toString()}
                  />
                ))}
              </div>
              <nav className="fd-pagination" aria-label="Doctor results pages">
                <span>Showing {rangeStart}–{rangeEnd} of {filteredDoctors.length}</span>
                <div className="fd-pagination-buttons">
                  <button type="button" disabled={currentPage === 1} onClick={() => goToPage(Math.max(1, currentPage - 1))}>Previous</button>
                  {visiblePages.map((pageNumber) => (
                    <button
                      type="button"
                      className={pageNumber === currentPage ? "is-current" : ""}
                      aria-current={pageNumber === currentPage ? "page" : undefined}
                      aria-label={`Page ${pageNumber}`}
                      key={pageNumber}
                      onClick={() => goToPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button type="button" disabled={currentPage === pageCount} onClick={() => goToPage(Math.min(pageCount, currentPage + 1))}>Next</button>
                </div>
              </nav>
            </>
          )}
        </section>
      </div>
      <FindDoctorFilters
        open={filtersOpen}
        categories={categories}
        specialty={draftSpecialty}
        availability={draftAvailability}
        timeOfDay={draftTimeOfDay}
        maximumPrice={draftMaximumPrice}
        onSpecialtyChange={setDraftSpecialty}
        onAvailabilityChange={setDraftAvailability}
        onTimeOfDayChange={setDraftTimeOfDay}
        onMaximumPriceChange={setDraftMaximumPrice}
        onApply={applyFilters}
        onReset={resetAll}
        onClose={closeFilters}
      />
    </div>
  );
}
