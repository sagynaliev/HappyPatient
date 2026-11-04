import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorVisitsPage from "./DoctorVisitsPage";
import { authApi } from "../lib/api";

vi.mock("../lib/api", () => ({ authApi: { doctorProfile: vi.fn(), getSchedule: vi.fn() } }));
afterEach(cleanup);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const later = new Date(Date.now() + 3 * 864e5).toISOString();
const doctor = { id: "doctor-1", office: null, category: { name: "Pediatrics" } };

describe("doctor visits list", () => {
  beforeEach(() => {
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor });
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
});
