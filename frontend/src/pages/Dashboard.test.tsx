import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { authApi } from "../lib/api";

const session = vi.hoisted(() => ({
  user: { id: "patient-1", email: "patient@example.test", firstName: "Casey", lastName: "Patient", role: "PATIENT" as const },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: session.user }),
  roleLabel: (role: string) => role,
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, authApi: { ...actual.authApi, myAppointments: vi.fn(), receipt: vi.fn(), notifications: vi.fn() } };
});

afterEach(cleanup);

describe("patient dashboard appointments", () => {
  beforeEach(() => {
    vi.mocked(authApi.myAppointments).mockReset();
    vi.mocked(authApi.receipt).mockReset();
    vi.mocked(authApi.notifications).mockResolvedValue({ notifications: [], unreadCount: 0 });
  });

  it("shows the next appointment loaded for the signed-in patient", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({
      appointments: [{
        id: "slot-1",
        startAt: "2099-05-10T09:00:00.000Z",
        endAt: "2099-05-10T09:30:00.000Z",
        status: "BOOKED",
        doctor: { name: "Dr. Sam Doctor", specialty: "Cardiology", office: null, consultationFee: 18000 },
      }],
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText("Dr. Sam Doctor")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("Booked")).toBeTruthy();
  });

  it("shows the latest checked-in receipt from the existing receipt endpoint", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [{
      id: "checked-in-slot", startAt: "2026-10-30T05:00:00.000Z", endAt: "2026-10-30T05:30:00.000Z", status: "OCCUPIED", reference: "HP-RECEIPT-1",
      doctor: { name: "Dr. Sam Doctor", specialty: "Cardiology", office: "Central Clinic", consultationFee: 18000 },
    }] });
    vi.mocked(authApi.receipt).mockResolvedValue({ receipt: {
      id: "receipt-1", reference: "HP-RECEIPT-1", status: "OCCUPIED", patientDisplayName: "Casey Patient", doctor: "Dr. Sam Doctor", specialty: "Cardiology",
      startAt: "2026-10-30T05:00:00.000Z", endAt: "2026-10-30T05:30:00.000Z", consultationFee: 18000,
    } });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText("Latest receipt")).toBeInTheDocument();
    expect(await screen.findByText("HP-RECEIPT-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(authApi.receipt).toHaveBeenCalledWith("checked-in-slot");
  });

  it("shows an empty state when the patient has no appointments", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [] });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText("No upcoming visit yet")).toBeTruthy();
  });
});
