import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DoctorFilters, { AvailabilityFilter, TimeFilter } from "./DoctorFilters";
import DoctorCard from "./DoctorCard";
import DoctorSearchForm from "./DoctorSearchForm";
import { api, Doctor } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const doctor: Doctor = {
  id: "doctor-1",
  office: "Cardio Clinic",
  category: { id: "category-1", name: "Cardiology" },
  user: { firstName: "Ayan", lastName: "Bekov", email: "ayan@example.test" },
  scheduleSlots: [{ id: "slot-1", startAt: "2099-05-10T09:00:00.000Z", endAt: "2099-05-10T09:30:00.000Z" }],
};

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
}

describe("doctor discovery and cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorage();
    window.localStorage.clear();
  });

  it("shows grouped, highlighted live suggestions and supports keyboard selection", async () => {
    vi.mocked(api).mockResolvedValue({ doctors: [doctor] } as never);
    const onSuggestionSelect = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

    function SearchHarness() {
      const [query, setQuery] = useState("");
      const [category, setCategory] = useState("");
      return (
        <DoctorSearchForm
          query={query}
          category={category}
          categories={[{ id: "category-1", name: "Cardiology" }]}
          onQueryChange={setQuery}
          onCategoryChange={setCategory}
          onSubmit={onSubmit}
          onSuggestionSelect={onSuggestionSelect}
        />
      );
    }
    render(<SearchHarness />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "cardio" } });
    expect(screen.getByRole("group", { name: "Specialties" }).textContent).toContain("Cardiology");
    await screen.findByRole("option", { name: /Ayan Bekov/ });
    expect(document.querySelectorAll(".suggestion-option mark").length).toBeGreaterThan(0);

    const options = screen.getAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[options.length - 1].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      kind: "doctor",
      id: "doctor-1",
      label: "Ayan Bekov",
    }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("persists favorite state and links booking to the real next free slot", () => {
    render(
      <MemoryRouter>
        <DoctorCard doctor={doctor} canBook queryString="" checkingAccess={false} />
      </MemoryRouter>,
    );

    const favorite = screen.getByRole("button", { name: "Add Dr. Ayan Bekov to favorites" });
    fireEvent.click(favorite);
    expect(screen.getByRole("button", { name: "Remove Dr. Ayan Bekov from favorites" }).getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("hp_favorite_doctors")).toBe("doctor-1");

    expect(screen.getByText(/Next available/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Book appointment" }).getAttribute("href")).toBe(
      "/doctors/doctor-1/schedule?date=2099-05-10",
    );
  });

  it("opens an accessible filter dialog, closes on Escape, and restores focus", async () => {
    function FilterHarness() {
      const [open, setOpen] = useState(false);
      const [specialty, setSpecialty] = useState("");
      const [availability, setAvailability] = useState<AvailabilityFilter>("");
      const [timeOfDay, setTimeOfDay] = useState<TimeFilter>("");
      const [office, setOffice] = useState("");
      const triggerRef = useRef<HTMLButtonElement | null>(null);
      return (
        <>
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open filters</button>
          <DoctorFilters
            open={open}
            focusTarget="specialty"
            categories={[{ id: "category-1", name: "Cardiology" }]}
            specialty={specialty}
            availability={availability}
            timeOfDay={timeOfDay}
            office={office}
            returnFocusRef={triggerRef}
            onClose={() => setOpen(false)}
            onSpecialtyChange={setSpecialty}
            onAvailabilityChange={setAvailability}
            onTimeChange={setTimeOfDay}
            onOfficeChange={setOffice}
          />
        </>
      );
    }

    render(<FilterHarness />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "All filters" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search specialty..." })));
    const close = screen.getByRole("button", { name: "Close filters" });
    screen.getByRole("button", { name: "Show doctors" }).focus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Show doctors" }), { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
