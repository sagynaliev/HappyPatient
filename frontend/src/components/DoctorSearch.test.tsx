import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DoctorFilters, { AvailabilityFilter, TimeFilter } from "./DoctorFilters";
import DoctorCard from "./DoctorCard";
import DoctorSearchForm from "./DoctorSearchForm";
import { api, Doctor } from "../lib/api";
import Search from "../pages/Search";

vi.mock("../lib/api", () => {
  const api = vi.fn();
  return { api, doctorDirectoryApi: { locations: (options: RequestInit) => api("/doctors/locations", options) } };
});
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

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
    expect(input.getAttribute("placeholder")).toBe("Search doctors or specialties...");
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
    expect(screen.queryByText(/UTC/)).toBeNull();
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

  it("applies specialty and availability filters as removable chips in the filter row", async () => {
    vi.mocked(api).mockImplementation((path) => Promise.resolve(
      (path === "/categories"
        ? { categories: [{ id: "category-1", name: "Cardiology" }] }
        : path === "/doctors/locations"
          ? { locations: [doctor.office] }
          : { doctors: [doctor] }) as never,
    ));

    render(
      <MemoryRouter initialEntries={["/search"]}>
        <Search />
      </MemoryRouter>,
    );

    await screen.findByText("1 doctor found");
    expect(screen.getByRole("button", { name: "Price filter, not available yet" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Rating filter, not available yet" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Online filter, not available yet" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Specialty" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Cardiology" }));
    expect(await screen.findByRole("button", { name: "Remove Cardiology filter" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("category=Cardiology"),
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Availability" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Today" }));
    expect(await screen.findByRole("button", { name: "Remove Today filter" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Clear all" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("availability=today"),
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(await screen.findByRole("button", { name: "Specialty" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Availability" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Cardiology filter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Today filter" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Specialty" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Cardiology" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Cardiology filter" }));
    expect(await screen.findByRole("button", { name: "Specialty" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Cardiology filter" })).toBeNull();
  });

  it("applies location through the drawer and combines it with other filters", async () => {
    vi.mocked(api).mockImplementation((path) => Promise.resolve(
      (path === "/categories"
        ? { categories: [{ id: "category-1", name: "Cardiology" }] }
        : path === "/doctors/locations"
          ? { locations: [doctor.office] }
          : { doctors: [doctor] }) as never,
    ));

    render(
      <MemoryRouter initialEntries={["/search"]}>
        <Search />
      </MemoryRouter>,
    );

    await screen.findByText("1 doctor found");
    fireEvent.click(screen.getByRole("button", { name: "All filters" }));
    const locationOption = await screen.findByRole("radio", { name: "Cardio Clinic" });
    fireEvent.click(locationOption);
    await screen.findByRole("button", { name: "Remove Cardio Clinic location filter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "All filters" }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) =>
      String(path).includes("office=Cardio+Clinic"),
    )).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Specialty" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Cardiology" }));
    fireEvent.click(screen.getByRole("button", { name: "Availability" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Today" }));
    expect(await screen.findByRole("button", { name: "Remove Cardiology filter" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Remove Today filter" })).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Clear all" })).not.toBeNull();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => {
      const request = new URL(String(path), "http://localhost");
      return request.searchParams.get("category") === "Cardiology"
        && request.searchParams.get("office") === "Cardio Clinic"
        && request.searchParams.get("availability") === "today";
    })).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Remove Cardio Clinic location filter" }));
    expect(screen.queryByRole("button", { name: "Remove Cardio Clinic location filter" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Cardiology filter" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Today filter" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "All filters" })).not.toBeNull();
  });
});
