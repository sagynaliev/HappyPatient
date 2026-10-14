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
  return { ...actual, authApi: { ...actual.authApi, myAppointments: vi.fn() } };
});

afterEach(cleanup);

describe("patient dashboard appointments", () => {
  beforeEach(() => {
    vi.mocked(authApi.myAppointments).mockReset();
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

  it("shows an empty state when the patient has no appointments", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [] });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText("No upcoming visit yet")).toBeTruthy();
  });
});
