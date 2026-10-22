import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientAppointments, { canCheckIn } from "./PatientAppointments";
import { authApi, PatientAppointment } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    authApi: { ...actual.authApi, myAppointments: vi.fn(), checkInAppointment: vi.fn(), receipt: vi.fn(), cancelAppointment: vi.fn() },
  };
});

afterEach(cleanup);

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const appointment = (overrides: Partial<PatientAppointment>): PatientAppointment => ({
  id: "slot-1",
  startAt: minutesFromNow(10),
  endAt: minutesFromNow(40),
  status: "BOOKED",
  doctor: { name: "Dr. Sam Doctor", specialty: "Cardiology", office: "Central Clinic", consultationFee: 18000 },
  ...overrides,
});

describe("Sprint 3 check-in window (US16)", () => {
  it("opens 30 minutes before the visit and closes when it ends", () => {
    expect(canCheckIn(appointment({ startAt: minutesFromNow(10), endAt: minutesFromNow(40) }))).toBe(true);
    expect(canCheckIn(appointment({ startAt: minutesFromNow(-10), endAt: minutesFromNow(20) }))).toBe(true);
    expect(canCheckIn(appointment({ startAt: minutesFromNow(120), endAt: minutesFromNow(150) }))).toBe(false);
    expect(canCheckIn(appointment({ startAt: minutesFromNow(-60), endAt: minutesFromNow(-30) }))).toBe(false);
    expect(canCheckIn(appointment({ status: "OCCUPIED" }))).toBe(false);
  });
});

describe("Sprint 3 patient check-in and receipt (US16, US18)", () => {
  beforeEach(() => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [appointment({})] });
    vi.mocked(authApi.checkInAppointment).mockResolvedValue({ checkedIn: true, reference: "HP-SLOT1", receipt: { id: "r1" } });
    vi.mocked(authApi.receipt).mockResolvedValue({
      receipt: { id: "r1", reference: "HP-SLOT1", status: "OCCUPIED", patientDisplayName: "Casey Patient", doctor: "Dr. Sam Doctor", startAt: minutesFromNow(10), endAt: minutesFromNow(40), checkedInAt: new Date().toISOString() },
    });
  });

  it("confirms arrival and shows the registration receipt", async () => {
    render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm arrival" }));
    await waitFor(() => expect(authApi.checkInAppointment).toHaveBeenCalledWith("slot-1"));
    expect(await screen.findByRole("dialog", { name: "Receipt HP-SLOT1" })).toBeInTheDocument();
    expect(screen.getAllByText("VISIT REGISTRATION RECEIPT").length).toBeGreaterThan(0);
    expect(screen.getByText(/Arrival confirmed for HP-SLOT1/)).toBeInTheDocument();
  });

  it("asks for a reason before cancelling and sends it", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [appointment({ startAt: minutesFromNow(24 * 60), endAt: minutesFromNow(24 * 60 + 30) })] });
    vi.mocked(authApi.cancelAppointment).mockResolvedValue({ cancelled: true, reference: "HP-1" });
    render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Cancel this appointment?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel appointment" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Schedule conflict"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    await waitFor(() => expect(authApi.cancelAppointment).toHaveBeenCalledWith("slot-1", "Schedule conflict"));
  });
});
