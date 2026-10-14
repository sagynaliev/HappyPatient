import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorAppointments from "./DoctorAppointments";
import { authApi } from "../lib/api";

vi.mock("../lib/api", () => ({
  authApi: {
    doctorProfile: vi.fn(),
    getSchedule: vi.fn(),
    slotDetails: vi.fn(),
  },
}));

afterEach(cleanup);

describe("doctor appointment management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor: { id: "doctor-1", office: "Clinic A", category: { name: "Dentistry" }, user: { firstName: "Alex", lastName: "Doctor" } } });
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: { id: "doctor-1", office: "Clinic A", category: { name: "Dentistry" }, user: { firstName: "Alex", lastName: "Doctor" } },
      slots: [
        { id: "booked-1", startAt: "2026-10-14T04:30:00.000Z", endAt: "2026-10-14T05:00:00.000Z", status: "BOOKED", visitPurpose: "Checkup", patient: { id: "patient-1", firstName: "Jamie", lastName: "Patient" } },
        { id: "free-1", startAt: "2026-10-14T06:00:00.000Z", endAt: "2026-10-14T06:30:00.000Z", status: "FREE" },
      ],
    });
    vi.mocked(authApi.slotDetails).mockResolvedValue({ slot: { id: "booked-1", startAt: "2026-10-14T04:30:00.000Z", endAt: "2026-10-14T05:00:00.000Z", status: "BOOKED", visitPurpose: "Checkup", patient: { id: "patient-1", firstName: "Jamie", lastName: "Patient", email: "jamie@example.test" } } });
  });

  it("shows only real booked slots and loads authorized details when selected", async () => {
    render(<MemoryRouter><DoctorAppointments /></MemoryRouter>);
    expect(await screen.findByText("Jamie Patient")).toBeTruthy();
    expect(screen.queryByText("free-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Details →" }));
    await waitFor(() => expect(authApi.slotDetails).toHaveBeenCalledWith("booked-1"));
    expect(await screen.findByText("jamie@example.test")).toBeTruthy();
  });

  it("filters the real list by search text and allows reset", async () => {
    render(<MemoryRouter><DoctorAppointments /></MemoryRouter>);
    await screen.findByText("Jamie Patient");
    fireEvent.change(screen.getByLabelText("Search patient or slot ID"), { target: { value: "missing" } });
    expect(screen.getByText("No appointments found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Jamie Patient")).toBeTruthy();
  });
});
