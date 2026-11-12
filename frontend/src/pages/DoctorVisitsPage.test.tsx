import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorVisitsPage from "./DoctorVisitsPage";
import { authApi } from "../lib/api";

vi.mock("../lib/api", () => ({ authApi: { doctorProfile: vi.fn(), getSchedule: vi.fn(), doctorMissedVisits: vi.fn() } }));
afterEach(cleanup);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const later = new Date(Date.now() + 3 * 864e5).toISOString();
const doctor = { id: "doctor-1", office: null, category: { name: "Pediatrics" } };

describe("doctor visits list", () => {
  beforeEach(() => {
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor });
    vi.mocked(authApi.doctorMissedVisits).mockResolvedValue({ missed: [] });
    vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor, slots: [
      { id: "today-1", startAt: `${today}T05:00:00.000Z`, endAt: `${today}T05:30:00.000Z`, status: "BOOKED", visitPurpose: "Check-up", patient: { id: "p1", firstName: "Jamie", lastName: "Patient" } },
      { id: "later-1", startAt: later, endAt: later, status: "BOOKED", visitPurpose: "Follow-up", patient: { id: "p2", firstName: "Dana", lastName: "Later" } },
      { id: "free-1", startAt: `${today}T06:00:00.000Z`, endAt: `${today}T06:30:00.000Z`, status: "FREE" },
    ] });
  });

  it("lists only visits with patients, by tab, linking to the visit page", async () => {
    render(<MemoryRouter><DoctorVisitsPage /></MemoryRouter>);
    expect((await screen.findByText("Jamie Patient")).closest("a")?.getAttribute("href")).toBe("/doctor/visits/today-1");
    expect(screen.queryByText("Dana Later")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Upcoming/ }));
    expect(screen.getByText("Dana Later")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search patient or reason"), { target: { value: "zzz" } });
    expect(screen.getByText("No matching visits")).toBeTruthy();
  });

  it("shows a visit released for no check-in as Missed in Past on the same day, alongside a new booking for the slot", async () => {
    vi.mocked(authApi.doctorMissedVisits).mockResolvedValue({ missed: [{ id: "exp-1", slotId: "today-1", startAt: `${today}T03:00:00.000Z`, endAt: `${today}T03:30:00.000Z`, releasedAt: `${today}T03:10:00.000Z`, patientName: "Noel Absent" }] });
    render(<MemoryRouter><DoctorVisitsPage /></MemoryRouter>);
    expect(await screen.findByText("Jamie Patient")).toBeTruthy();
    expect(screen.queryByText("Noel Absent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Past\s*1/ }));
    const name = await screen.findByText("Noel Absent");
    const row = name.closest("li")!;
    expect(row.textContent).toContain("Missed");
    expect(row.textContent).toContain("Not checked in — time released");
    // The time was given up, so there is no visit page to open.
    expect(name.closest("a")).toBeNull();
    expect(screen.getByRole("button", { name: /Today\s*1/ })).toBeTruthy();
  });

  it("still lists visits when missed visits cannot be loaded", async () => {
    vi.mocked(authApi.doctorMissedVisits).mockRejectedValue(new Error("down"));
    render(<MemoryRouter><DoctorVisitsPage /></MemoryRouter>);
    expect(await screen.findByText("Jamie Patient")).toBeTruthy();
  });
});
