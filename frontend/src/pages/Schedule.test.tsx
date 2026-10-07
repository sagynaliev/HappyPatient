import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Schedule from "./Schedule";
import { authApi } from "../lib/api";

const authState = vi.hoisted(() => ({
  user: { id: "doctor-user", role: "DOCTOR" as "DOCTOR" | "PATIENT" },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
}));

vi.mock("../lib/api", () => ({
  authApi: {
    doctorProfile: vi.fn(),
    getSchedule: vi.fn(),
    updateOffice: vi.fn(),
    createWorkingDays: vi.fn(),
    createSchedule: vi.fn(),
    slotDetails: vi.fn(),
    bookSlot: vi.fn(),
    updateSlot: vi.fn(),
  },
}));

describe("doctor weekly schedule setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "doctor-user", role: "DOCTOR" };
    vi.mocked(authApi.doctorProfile).mockResolvedValue({
      doctor: { id: "doctor-1", office: "North Clinic", category: { name: "Cardiology" } },
    });
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: [],
    });
    vi.mocked(authApi.createWorkingDays).mockResolvedValue({
      created: 4,
      dates: ["2099-05-12", "2099-05-14"],
    });
  });

  it("creates 30-minute availability for selected weekdays in the chosen week", async () => {
    render(
      <MemoryRouter initialEntries={["/schedule"]}>
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Work schedule" });
    fireEvent.change(screen.getByLabelText("Week containing"), { target: { value: "2099-05-11" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Wednesday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Friday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save working days" }));

    await waitFor(() => expect(authApi.createWorkingDays).toHaveBeenCalledWith({
      dates: ["2099-05-12", "2099-05-14"],
      startTime: "09:00",
      endTime: "17:00",
    }));
    expect(await screen.findByText("Schedule created — 4 slots across Tue, Thu (09:00–17:00).")).not.toBeNull();
  });

  it("loads doctor details when a patient opens the schedule directly", async () => {
    authState.user = { id: "patient-user", role: "PATIENT" };
    render(
      <MemoryRouter initialEntries={["/doctors/doctor-1/schedule"]}>
        <Routes>
          <Route path="/doctors/:doctorId/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dr. Sam Doctor schedule" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Doctor profile summary" })).not.toBeNull();
    expect(screen.getByText("Cardiology")).not.toBeNull();
    expect(screen.getByText("North Clinic")).not.toBeNull();
  });
});
