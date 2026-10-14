import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorProfilePage from "./DoctorProfilePage";
import { api, authApi, Doctor } from "../lib/api";

const authState = vi.hoisted(() => ({ user: null as null | { id: string; role: "PATIENT"; firstName: string; lastName: string; email: string; phone: string | null } }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  authApi: { getSchedule: vi.fn() },
}));

afterEach(cleanup);

const doctor: Doctor = {
  id: "doctor-1",
  office: null,
  city: "Almaty",
  clinicName: "Central Clinic",
  streetAddress: "18 Abay Avenue",
  officeNumber: "Office 101",
  consultationFee: 18000,
  category: { id: "category-1", name: "Cardiology" },
  user: { firstName: "Sam", lastName: "Doctor", email: "sam@example.test" },
  scheduleSlots: [{ id: "slot-1", startAt: "2099-05-11T05:00:00.000Z", endAt: "2099-05-11T05:30:00.000Z" }],
};

function BookingDestination() {
  const location = useLocation();
  return <output data-testid="booking-destination">{location.pathname}{location.search}</output>;
}

function renderProfile() {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/doctors/doctor-1", state: { doctor } }]}>
      <Routes>
        <Route path="/doctors/:doctorId" element={<DoctorProfilePage />} />
        <Route path="/book/:doctorId" element={<BookingDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("doctor profile and inline booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: "patient-1",
      role: "PATIENT",
      firstName: "Pat",
      lastName: "Patient",
      email: "pat@example.test",
      phone: null,
    };
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: { id: doctor.id, office: doctor.office, category: { name: doctor.category.name }, user: { firstName: "Sam", lastName: "Doctor" } },
      slots: [{ id: "slot-1", startAt: doctor.scheduleSlots[0].startAt, endAt: doctor.scheduleSlots[0].endAt, status: "FREE" }],
    });
  });

  it("shows available profile data and sends the selected real slot into booking", async () => {
    renderProfile();

    expect(await screen.findByRole("heading", { name: "Dr. Sam Doctor" })).not.toBeNull();
    expect(screen.getByText("18,000 KZT / consultation")).not.toBeNull();
    expect(screen.getByText("Almaty · Central Clinic")).not.toBeNull();
    expect(screen.getByText("18 Abay Avenue, Office 101")).not.toBeNull();
    expect(screen.getByText(/biography, qualifications, and languages are not included/i)).not.toBeNull();
    expect(screen.getByText("Reviews are not available from the current doctor service.")).not.toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "10:00–10:30, available" }));
    fireEvent.click(screen.getByRole("button", { name: "Book Appointment" }));

    expect(screen.getByTestId("booking-destination").textContent).toBe("/book/doctor-1?step=1&date=2099-05-11&slot=slot-1");
    expect(vi.mocked(api)).not.toHaveBeenCalled();
  });

  it("offers a retry when schedule availability fails", async () => {
    vi.mocked(authApi.getSchedule)
      .mockRejectedValueOnce(new Error("Schedule temporarily unavailable"))
      .mockResolvedValueOnce({
        doctor: { id: doctor.id, office: doctor.office, category: { name: doctor.category.name }, user: { firstName: "Sam", lastName: "Doctor" } },
        slots: [],
      });
    renderProfile();

    expect(await screen.findByText("Schedule temporarily unavailable")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry availability" }));
    await waitFor(() => expect(authApi.getSchedule).toHaveBeenCalledTimes(2));
  });
});
