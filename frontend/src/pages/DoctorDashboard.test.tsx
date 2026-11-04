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

  it("lists today's patients from the schedule and links each visit to its own page", async () => {
    render(<MemoryRouter><DoctorDashboard /></MemoryRouter>);
    const patient = await screen.findByText("Jamie Patient", { selector: "strong" });
    expect(patient.closest("a")?.getAttribute("href")).toBe("/doctor/visits/visit-1");
    expect(screen.getByText(/free slots still open today/)).toBeTruthy();
    expect(screen.queryByText("Available time")).toBeNull();
    expect(screen.getByText("Patients today")).toBeTruthy();
    expect(authApi.getSchedule).toHaveBeenCalledWith("doctor-1");
  });
  it("shows at most three of today's patients and links to the rest", async () => {
    const future = (hour: number) => new Date(Date.now() + hour * 3600e3).toISOString();
    vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor: { id: "doctor-1", office: "Clinic A", category: { name: "Dentistry" } }, slots: [1, 2, 3, 4, 5].map((n) => ({ id: `v${n}`, startAt: future(n / 10), endAt: future(n / 10 + 0.05), status: "BOOKED" as const, visitPurpose: "Visit", patient: { id: `p${n}`, firstName: "Pat", lastName: `${n}` } })) });
    render(<MemoryRouter><DoctorDashboard /></MemoryRouter>);
    await screen.findAllByText(/Pat \d/);
    const list = document.querySelector(".dw-agenda")!;
    expect(list.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /\+2 more visits today/ }).getAttribute("href")).toBe("/doctor/visits");
  });
});
