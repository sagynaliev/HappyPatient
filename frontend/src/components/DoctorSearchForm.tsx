import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, Doctor } from "../lib/api";

type Category = { id: string; name: string };
type Suggestion = { kind: "specialty" | "doctor" | "clinic"; id: string; label: string; detail?: string };

type DoctorSearchFormProps = {
  query: string;
  category: string;
  office?: string;
  categories: Category[];
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onOfficeChange?: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSuggestionSelect?: (suggestion: Suggestion) => void;
  buttonLabel?: string;
  doctorFieldLabel?: string;
  bare?: boolean;
};

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0 || !query) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

export default function DoctorSearchForm({
  query,
  category,
  office = "",
  categories,
  onQueryChange,
  onCategoryChange,
  onOfficeChange,
  onSubmit,
  onSuggestionSelect,
  doctorFieldLabel = "Find a doctor",
  bare = false,
}: DoctorSearchFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doctorResults, setDoctorResults] = useState<{ query: string; doctors: Doctor[] }>({ query: "", doctors: [] });
  const [activeIndex, setActiveIndex] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();
  const normalizedQuery = query.trim();

  useEffect(() => {
    setLoading(Boolean(normalizedQuery));
    if (!normalizedQuery) {
      setDoctorResults({ query: "", doctors: [] });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<{ doctors: Doctor[] }>(`/doctors?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
      })
        .then((result) => setDoctorResults({ query: normalizedQuery, doctors: result.doctors || [] }))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setDoctorResults({ query: normalizedQuery, doctors: [] });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);
  const suggestionDoctors = doctorResults.query === normalizedQuery ? doctorResults.doctors : [];

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!normalizedQuery) return [];
    const matchingCategories = categories
      .filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()))
      .slice(0, 4)
      .map((item) => ({ kind: "specialty" as const, id: item.id, label: item.name }));
    const matchingDoctors = suggestionDoctors
      .slice(0, 5)
      .map((doctor) => ({
        kind: "doctor" as const,
        id: doctor.id,
        label: `${doctor.user.firstName} ${doctor.user.lastName}`,
        detail: doctor.category.name,
      }));
    const matchingClinics = Array.from(new Set(
      suggestionDoctors
        .map((doctor) => doctor.office?.trim())
        .filter((office): office is string => Boolean(office))
        .filter((office) => office.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())),
    ))
      .slice(0, 3)
      .map((clinic) => ({ kind: "clinic" as const, id: clinic, label: clinic }));

    return [...matchingCategories, ...matchingDoctors, ...matchingClinics];
  }, [categories, normalizedQuery, suggestionDoctors]);

  function selectSuggestion(suggestion: Suggestion) {
    setOpen(false);
    setActiveIndex(-1);
    if (onSuggestionSelect) {
      onSuggestionSelect(suggestion);
      return;
    }

    if (suggestion.kind === "specialty") {
      onQueryChange("");
      onCategoryChange(suggestion.label);
    } else if (suggestion.kind === "clinic") {
      onQueryChange("");
      onOfficeChange?.(suggestion.label);
    } else {
      onQueryChange(suggestion.label);
    }
    formRef.current?.requestSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || !suggestions.length) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        index < 0
          ? direction > 0 ? 0 : suggestions.length - 1
          : (index + direction + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  }

  const groups: Array<{ kind: Suggestion["kind"]; title: string }> = [
    { kind: "specialty", title: "Specialties" },
    { kind: "doctor", title: "Doctors" },
    { kind: "clinic", title: "Clinics" },
  ];
  let nextOptionIndex = 0;
  const groupedSuggestions = groups
    .map((group) => ({
      ...group,
      suggestions: suggestions
        .filter((suggestion) => suggestion.kind === group.kind)
        .map((suggestion) => ({ suggestion, index: nextOptionIndex++ })),
    }))
    .filter((group) => group.suggestions.length > 0);

  return (
    <div className={`discovery-bar${bare ? " discovery-bar-bare" : ""}`} ref={wrapperRef}>
      <form
        ref={formRef}
        className="doctor-search-form"
        role="search"
        aria-label="Search doctors, specialties, and clinics"
        onSubmit={(event) => {
          setOpen(false);
          onSubmit(event);
        }}
      >
        <label htmlFor={inputId}>{doctorFieldLabel}</label>
        <div className="doctor-search-input-wrap">
          <span className="doctor-search-icon" aria-hidden="true">⌕</span>
          <input
            id={inputId}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search doctors, specialties..."
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && Boolean(normalizedQuery)}
            aria-controls={suggestions.length ? listId : undefined}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          />
          {query && (
            <button
              className="doctor-search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange("");
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              Clear
            </button>
          )}
        </div>
        {open && Boolean(normalizedQuery) && (
          <div className="search-suggestions">
            {loading && !suggestions.length ? (
              <p className="suggestion-state" role="status">Searching doctors and clinics…</p>
            ) : suggestions.length ? (
              <>
                <div id={listId} role="listbox" aria-label="Search suggestions">
                  {groupedSuggestions.map((group) => (
                    <div className="suggestion-group" key={group.kind} role="group" aria-label={group.title}>
                      <h2>{group.title}</h2>
                      {group.suggestions.map(({ suggestion, index: currentIndex }) => {
                        return (
                          <button
                            className={`suggestion-option${activeIndex === currentIndex ? " is-active" : ""}`}
                            id={`${listId}-option-${currentIndex}`}
                            key={`${suggestion.kind}-${suggestion.id}`}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={activeIndex === currentIndex}
                            onMouseEnter={() => setActiveIndex(currentIndex)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectSuggestion(suggestion)}
                          >
                            <span className="suggestion-kind-icon" aria-hidden="true">
                              {suggestion.kind === "specialty" ? "✦" : suggestion.kind === "doctor" ? "◉" : "⌖"}
                            </span>
                            <span className="suggestion-copy">
                              <span><HighlightMatch text={suggestion.label} query={normalizedQuery} /></span>
                              {suggestion.detail && <small><HighlightMatch text={suggestion.detail} query={normalizedQuery} /></small>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {loading && <p className="suggestion-loading" role="status">Searching for more matches…</p>}
                <button
                  className="suggestion-view-all"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    formRef.current?.requestSubmit();
                  }}
                >
                  View all results
                  <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <div className="suggestion-state">
                <strong>No matches yet</strong>
                <span>Try a doctor name, specialty, or clinic.</span>
              </div>
            )}
            {!loading && !suggestions.length && (
              <button
                className="suggestion-view-all"
                type="button"
                onClick={() => {
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                View all results
                <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
