import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorDashboard from "./DoctorDashboard";
import { authApi } from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "doctor-user", role: "DOCTOR", firstName: "Alex", lastName: "Doctor", email: "alex@example.test" } }),
}));
vi.mock("../lib/api", () => ({ authApi: { doctorProfile: vi.fn(), getSchedule: vi.fn() } }));
afterEach(cleanup);

describe("provider dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor: { id: "doctor-1", office: "Clinic A", category: { name: "Dentistry" }, user: { firstName: "Alex", lastName: "Doctor" } } });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: { id: "doctor-1", office: "Clinic A", category: { name: "Dentistry" }, user: { firstName: "Alex", lastName: "Doctor" } },
      slots: [
        { id: "visit-1", startAt: `${today}T05:00:00.000Z`, endAt: `${today}T05:30:00.000Z`, status: "BOOKED", visitPurpose: "Consultation", patient: { id: "patient-1", firstName: "Jamie", lastName: "Patient" } },
        { id: "free-1", startAt: `${today}T06:00:00.000Z`, endAt: `${today}T06:30:00.000Z`, status: "FREE" },
      ],
    });
  });

  it("derives the agenda and booking tabs from real schedule slots", async () => {
    render(<MemoryRouter><DoctorDashboard /></MemoryRouter>);
    expect((await screen.findAllByText("Jamie Patient")).length).toBeGreaterThan(0);
    expect(screen.getByText("Available time")).toBeTruthy();
    expect(screen.getByText("Completed consultations")).toBeTruthy();
    expect(screen.getByText("Completion status is not tracked by the schedule API")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /All/ }));
    expect(screen.getByRole("link", { name: "Details →" }).getAttribute("href")).toContain("slotId=visit-1");
    expect(authApi.getSchedule).toHaveBeenCalledWith("doctor-1");
  });
});
