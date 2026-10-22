import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DoctorFilters, { AvailabilityFilter, TimeFilter } from "./DoctorFilters";
import DoctorCard from "./DoctorCard";
import DoctorSearchForm from "./DoctorSearchForm";
import { api, Doctor } from "../lib/api";
import Search from "../pages/Search";

vi.mock("../lib/api", () => {
  const api = vi.fn();
  return { api, doctorDirectoryApi: { cities: (options: RequestInit) => api("/doctors/locations", options) } };
});
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

const doctor: Doctor = {
  id: "doctor-1",
  office: "Cardio Clinic",
  city: "Almaty",
  clinicName: "Cardio Clinic",
  streetAddress: "18 Abay Avenue",
  officeNumber: "Office 101",
  consultationFee: 18000,
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

function CurrentSearchParameters() {
  const location = useLocation();
  return <output aria-label="Current search parameters">{location.search}</output>;
}

describe("doctor discovery and cards", () => {
  beforeEach(() => {
    cleanup();
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
    expect(input.getAttribute("placeholder")).toBe("Doctor name or specialty");
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

  it("shows real availability and links booking and profile actions to their routes", () => {
    render(
      <MemoryRouter>
        <DoctorCard doctor={doctor} canBook queryString="" checkingAccess={false} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Next: 10 May · 14:00 · UTC\+5/)).not.toBeNull();
    expect(screen.getByText("Almaty · Cardio Clinic")).not.toBeNull();
    expect(screen.getByText("18 Abay Avenue, Office 101")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Book Appointment" }).getAttribute("href")).toBe(
      "/doctors/doctor-1/schedule?date=2099-05-10",
    );
    expect(screen.getByRole("link", { name: "View Profile" }).getAttribute("href")).toBe("/doctors/doctor-1");
  });

  it("keeps pagination compact for large doctor directories", async () => {
    const doctors = Array.from({ length: 72 }, (_, index) => ({
      ...doctor,
      id: `doctor-${index + 1}`,
      user: { ...doctor.user, firstName: `Ayan${index + 1}` },
    }));
    vi.mocked(api).mockImplementation((path) => Promise.resolve(
      (path === "/categories"
        ? { categories: [{ id: "category-1", name: "Cardiology" }] }
        : path === "/doctors/locations"
          ? { cities: ["Almaty", "Astana"] }
          : { doctors }) as never,
    ));

    render(
      <MemoryRouter initialEntries={["/search"]}>
        <>
          <Search />
          <CurrentSearchParameters />
        </>
      </MemoryRouter>,
    );

    await screen.findByText("72 doctors found");
    expect(screen.getAllByRole("button", { name: /^Page \d+$/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Current search parameters").textContent).toBe("?page=2");
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
            locations={[doctor.office!]}
            locationsLoading={false}
            locationsError=""
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
            onRetryLocations={vi.fn()}
            onClearAll={vi.fn()}
            onShowDoctors={() => setOpen(false)}
            activeFilterCount={0}
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

  it("applies supported drawer filters and removes them as chips", async () => {
    vi.mocked(api).mockImplementation((path) => Promise.resolve(
      (path === "/categories"
        ? { categories: [{ id: "category-1", name: "Cardiology" }] }
        : path === "/doctors/locations"
          ? { cities: ["Almaty", "Astana"] }
          : { doctors: [doctor] }) as never,
    ));

    render(
      <MemoryRouter initialEntries={["/search"]}>
        <Search />
      </MemoryRouter>,
    );

    await screen.findByText("1 doctor found");
    const filtersButton = screen.getByRole("button", { name: "Filters (0)" });
    expect(filtersButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(filtersButton);
    expect(screen.getByRole("button", { name: "Filters (0)" }).getAttribute("aria-expanded")).toBe("true");
    await screen.findByRole("dialog", { name: "Filters" });
    fireEvent.click(screen.getByRole("radio", { name: "Cardiology" }));
    fireEvent.click(screen.getByRole("radio", { name: "Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.getByRole("button", { name: "Filters (2)" }).getAttribute("aria-expanded")).toBe("false");
    expect(await screen.findByRole("button", { name: "Remove filter: Cardiology" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("category=Cardiology"),
    )).toBe(true));

    expect(await screen.findByRole("button", { name: "Remove filter: Available today" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Clear all" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("availability=today"),
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("button", { name: "Remove filter: Cardiology" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove filter: Available today" })).toBeNull();
  });

  it("combines directory location from search with drawer filters", async () => {
    vi.mocked(api).mockImplementation((path) => Promise.resolve(
      (path === "/categories"
        ? { categories: [{ id: "category-1", name: "Cardiology" }] }
        : path === "/doctors/locations"
          ? { cities: ["Almaty", "Astana", "Shymkent"] }
          : { doctors: [doctor] }) as never,
    ));

    render(
      <MemoryRouter initialEntries={["/search"]}>
        <Search />
      </MemoryRouter>,
    );

    await screen.findByText("1 doctor found");
    await screen.findByRole("option", { name: "Almaty" });
    expect(screen.queryByRole("option", { name: "Office 101" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Almaty" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("button", { name: "Remove filter: Almaty" });
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("city=Almaty"),
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    await screen.findByRole("dialog", { name: "Filters" });
    fireEvent.click(screen.getByRole("radio", { name: "Cardiology" }));
    fireEvent.click(screen.getByRole("radio", { name: "Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(await screen.findByRole("button", { name: "Remove filter: Cardiology" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Remove filter: Available today" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Clear all" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => {
      const request = new URL(String(path), "http://localhost");
      return request.searchParams.get("category") === "Cardiology"
        && request.searchParams.get("city") === "Almaty"
        && request.searchParams.get("availability") === "today";
    })).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Almaty" }));
    expect(screen.getByRole("button", { name: "Remove filter: Cardiology" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove filter: Available today" })).not.toBeNull();
  });
});
