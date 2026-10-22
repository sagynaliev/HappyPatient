import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientAppointments from "./PatientAppointments";
import { authApi, PatientAppointment } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, authApi: { ...actual.authApi, myAppointments: vi.fn() } };
});

afterEach(cleanup);

const appointments: PatientAppointment[] = [
  {
    id: "upcoming-1",
    startAt: "2099-05-10T09:00:00.000Z",
    endAt: "2099-05-10T09:30:00.000Z",
    status: "BOOKED",
    visitPurpose: "Annual checkup",
    doctor: { name: "Dr. Sam Doctor", specialty: "Cardiology", office: "Central Clinic", consultationFee: 18000 },
  },
  {
    id: "past-1",
    startAt: "2000-05-10T09:00:00.000Z",
    endAt: "2000-05-10T09:30:00.000Z",
    status: "BOOKED",
    doctor: { name: "Dr. Past Doctor", specialty: "Dentistry", office: null, consultationFee: 12000 },
  },
];

function renderPage(initialEntry = "/appointments") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/appointments" element={<PatientAppointments />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("patient appointments dashboard", () => {
  beforeEach(() => {
    vi.mocked(authApi.myAppointments).mockReset();
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments });
  });

  it("loads patient-specific appointment data and displays real record details", async () => {
    renderPage();

    expect(await screen.findByText("Dr. Sam Doctor")).toBeTruthy();
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText("Central Clinic")).toBeTruthy();
    expect(screen.getByText("18,000 KZT")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Upcoming 1" }).getAttribute("aria-selected")).toBe("true");
    expect(authApi.myAppointments).toHaveBeenCalledOnce();
    expect(screen.queryByText(/HP-/)).toBeNull();
  });

  it("filters past appointments and opens a details view", async () => {
    renderPage();

    expect(await screen.findByText("Dr. Sam Doctor")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Past 1" }));
    expect(await screen.findByText("Dr. Past Doctor")).toBeTruthy();
    expect(screen.queryByText("Dr. Sam Doctor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("dialog", { name: "Dr. Past Doctor" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close appointment details" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows cancelled visits with who cancelled and the reason", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({
      appointments,
      cancelled: [{ id: "c1", startAt: "2099-06-01T09:00:00.000Z", endAt: "2099-06-01T09:30:00.000Z", reason: "Doctor is unavailable", cancelledBy: "CLINIC", createdAt: "2099-05-20T09:00:00.000Z", doctor: { name: "Dr. Gone Doctor", specialty: "Neurology", office: null, consultationFee: 9000 } }],
    });
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: "Cancelled 1" }));
    expect(await screen.findByText("Dr. Gone Doctor")).toBeTruthy();
    expect(screen.getByText("Cancelled by the clinic")).toBeTruthy();
    expect(screen.getByText("Doctor is unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^cancel$|reschedule/i })).toBeNull();
  });

  it("shows an empty cancelled tab when nothing was cancelled", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Cancelled 0" }));
    expect(await screen.findByText("No cancelled appointments")).toBeTruthy();
  });

  it("shows an empty state when there are no appointments", async () => {
    vi.mocked(authApi.myAppointments).mockResolvedValue({ appointments: [] });
    renderPage();

    expect(await screen.findByText("No upcoming appointments")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Find a doctor" }).length).toBeGreaterThan(0);
  });

  it("shows a retry action when loading fails", async () => {
    vi.mocked(authApi.myAppointments)
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce({ appointments });
    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Dr. Sam Doctor")).toBeTruthy();
    expect(authApi.myAppointments).toHaveBeenCalledTimes(2);
  });
});
