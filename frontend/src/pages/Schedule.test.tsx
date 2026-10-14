import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Schedule from "./Schedule";
import { authApi } from "../lib/api";

afterEach(cleanup);

const authState = vi.hoisted(() => ({
  user: {
    id: "doctor-user",
    role: "DOCTOR" as "DOCTOR" | "PATIENT",
    firstName: "Sam",
    lastName: "Doctor",
    email: "sam@example.test",
    phone: "+1 555 0100",
  },
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

function BookingQuery() {
  const location = useLocation();
  return <output data-testid="booking-query">{location.search}</output>;
}

describe("doctor weekly schedule setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: "doctor-user",
      role: "DOCTOR",
      firstName: "Sam",
      lastName: "Doctor",
      email: "sam@example.test",
      phone: "+1 555 0100",
    };
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

    await screen.findByRole("heading", { name: "My Schedule" });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Availability" }));
    fireEvent.change(screen.getAllByLabelText("Week containing")[0], { target: { value: "2099-05-11" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Mon" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Wed" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(screen.getByRole("button", { name: "Add availability" }));

    await waitFor(() => expect(authApi.createWorkingDays).toHaveBeenCalledWith({
      dates: ["2099-05-12", "2099-05-14"],
      startTime: "09:00",
      endTime: "17:00",
    }));
    expect(await screen.findByText("Schedule created — 4 slots across Tue, Thu (09:00–17:00).")).not.toBeNull();
  });

  it("opens the availability dialog from the query parameter and clears it when closed", async () => {
    render(
      <MemoryRouter initialEntries={["/schedule?addAvailability=1"]}>
        <BookingQuery />
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("dialog", { name: "Add availability" })).not.toBeNull();
    expect(screen.getByTestId("booking-query").textContent).toContain("addAvailability=1");
    fireEvent.click(screen.getByRole("button", { name: "Close add availability dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("booking-query").textContent).not.toContain("addAvailability");
  });

  it("closes the availability dialog with Escape", async () => {
    render(
      <MemoryRouter initialEntries={["/schedule?addAvailability=1"]}>
        <BookingQuery />
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("dialog", { name: "Add availability" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("booking-query").textContent).not.toContain("addAvailability");
  });

  it("validates the time range and keeps the dialog open after a save error", async () => {
    vi.mocked(authApi.createWorkingDays).mockRejectedValueOnce(new Error("This schedule overlaps an existing slot."));
    render(
      <MemoryRouter initialEntries={["/schedule?addAvailability=1"]}>
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("dialog", { name: "Add availability" });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add availability" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("End time must be later than start time.");
    expect(authApi.createWorkingDays).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add availability" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This schedule overlaps an existing slot.");
    expect(screen.getByRole("dialog", { name: "Add availability" })).not.toBeNull();
  });

  it("loads doctor details when a patient opens the schedule directly", async () => {
    authState.user = {
      id: "patient-user",
      role: "PATIENT",
      firstName: "Pat",
      lastName: "Patient",
      email: "pat@example.test",
      phone: "+1 555 0101",
    };
    render(
      <MemoryRouter initialEntries={["/doctors/doctor-1/schedule"]}>
        <Routes>
          <Route path="/doctors/:doctorId/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Book your appointment" })).not.toBeNull();
    expect(screen.getByText("Dr. Sam Doctor")).not.toBeNull();
    expect(screen.getByText("Cardiology")).not.toBeNull();
    expect(screen.getAllByText("North Clinic").length).toBeGreaterThan(0);
    expect(authApi.getSchedule).toHaveBeenCalledWith("doctor-1");
  });

  it("switches the doctor calendar between day and week views and groups slots by date", async () => {
    vi.mocked(authApi.slotDetails).mockResolvedValue({
      slot: {
        id: "booked-slot",
        startAt: "2099-05-11T09:00:00.000Z",
        endAt: "2099-05-11T09:30:00.000Z",
        status: "BOOKED",
        patient: { id: "patient-1", firstName: "Pat", lastName: "Patient", email: "pat@example.test" },
      },
    });
    vi.mocked(authApi.getSchedule).mockImplementation(async (_doctorId, scheduleDate) => ({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: scheduleDate === "2099-05-11" ? [{
        id: "booked-slot",
        startAt: "2099-05-11T09:00:00.000Z",
        endAt: "2099-05-11T09:30:00.000Z",
        status: "BOOKED",
        patient: { id: "patient-1", firstName: "Pat", lastName: "Patient" },
      }] : [],
    }));

    render(
      <MemoryRouter initialEntries={["/schedule"]}>
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "My Schedule" });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Availability" }));
    expect(screen.getByRole("button", { name: "Add availability" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close add availability dialog" }));
    fireEvent.change(screen.getByLabelText("Week containing"), { target: { value: "2099-05-11" } });
    await waitFor(() => expect(authApi.getSchedule).toHaveBeenCalledWith("doctor-1", "2099-05-11"));
    expect(vi.mocked(authApi.getSchedule).mock.calls.filter(([, day]) => day !== undefined && day >= "2099-05-11" && day <= "2099-05-17")).toHaveLength(7);
    vi.mocked(authApi.getSchedule).mockClear();

    const viewControl = screen.getByRole("group", { name: "Calendar view" });
    expect(screen.getByRole("button", { name: "Week" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByRole("columnheader", { name: /Mon 11/ });
    expect(screen.getAllByText("Booked").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Upcoming appointments" })).not.toBeNull();
    expect(screen.getAllByText("Pat Patient").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Mon 11, .*Booked/ }));
    expect(await screen.findByRole("dialog", { name: "Manage appointment slot" })).not.toBeNull();
    expect(screen.getAllByText("Booked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visit reason", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Close$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close slot details" }));
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(screen.getByRole("button", { name: "Day" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Day" }).getAttribute("aria-pressed")).toBe("true");
    expect(viewControl).toBeTruthy();
  });

  it("requires explicit confirmation before releasing a booked appointment", async () => {
    vi.mocked(authApi.getSchedule).mockImplementation(async (_doctorId, scheduleDate) => ({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: scheduleDate === "2099-05-11" ? [{
        id: "booked-slot",
        startAt: "2099-05-11T09:00:00.000Z",
        endAt: "2099-05-11T09:30:00.000Z",
        status: "BOOKED",
        patient: { id: "patient-1", firstName: "Pat", lastName: "Patient" },
      }] : [],
    }));
    vi.mocked(authApi.slotDetails).mockResolvedValue({
      slot: {
        id: "booked-slot",
        startAt: "2099-05-11T09:00:00.000Z",
        endAt: "2099-05-11T09:30:00.000Z",
        status: "BOOKED",
        patient: { id: "patient-1", firstName: "Pat", lastName: "Patient" },
      },
    });
    vi.mocked(authApi.updateSlot).mockResolvedValue({
      slot: { id: "booked-slot", startAt: "2099-05-11T09:00:00.000Z", endAt: "2099-05-11T09:30:00.000Z", status: "FREE" },
    });

    render(
      <MemoryRouter initialEntries={["/schedule?date=2099-05-11"]}>
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Mon 11, .*Booked/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Release appointment…" }));
    expect(authApi.updateSlot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm release" }));
    await waitFor(() => expect(authApi.updateSlot).toHaveBeenCalledWith("booked-slot", {
      status: "FREE",
      releaseBooking: true,
    }));
    expect(await screen.findByText("Appointment released. The slot is now available.")).toBeTruthy();
  });

  it("opens a slot modal and persists an available-to-occupied change", async () => {
    const availableSlot = {
      id: "free-slot",
      startAt: "2099-05-11T09:00:00.000Z",
      endAt: "2099-05-11T09:30:00.000Z",
      status: "FREE" as const,
    };
    vi.mocked(authApi.getSchedule).mockImplementation(async (_doctorId, scheduleDate) => ({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: scheduleDate === "2099-05-11" ? [availableSlot] : [],
    }));
    vi.mocked(authApi.slotDetails).mockResolvedValue({ slot: availableSlot });
    vi.mocked(authApi.updateSlot).mockResolvedValue({ slot: { ...availableSlot, status: "OCCUPIED" } });

    render(
      <MemoryRouter initialEntries={["/schedule?date=2099-05-11"]}>
        <Routes>
          <Route path="/schedule" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Mon 11, .*Free/ }));
    expect(await screen.findByRole("dialog", { name: "Manage appointment slot" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Close$/ })).toBeNull();
    expect(screen.getByText("Monday, 11 May 2099")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark as occupied" }));
    await waitFor(() => expect(authApi.updateSlot).toHaveBeenCalledWith("free-slot", { status: "OCCUPIED" }));
    expect(await screen.findByText("Slot status updated.")).not.toBeNull();
    expect(screen.getAllByText("Occupied").length).toBeGreaterThan(0);
  });

  it("keeps the selected patient time visible and confirms only after the server responds", async () => {
    authState.user = {
      id: "patient-user",
      role: "PATIENT",
      firstName: "Pat",
      lastName: "Patient",
      email: "pat@example.test",
      phone: "+1 555 0101",
    };
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        city: "Almaty",
        clinicName: "Central Clinic",
        streetAddress: "18 Abay Avenue",
        officeNumber: "Office 101",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: [
        { id: "past-free", startAt: "2000-05-11T09:00:00.000Z", endAt: "2000-05-11T09:30:00.000Z", status: "FREE" },
        { id: "future-free", startAt: "2099-05-11T10:00:00.000Z", endAt: "2099-05-11T10:30:00.000Z", status: "FREE" },
        { id: "occupied", startAt: "2099-05-11T11:00:00.000Z", endAt: "2099-05-11T11:30:00.000Z", status: "OCCUPIED" },
      ],
    });
    let finishBooking: ((result: { slot: { id: string; startAt: string; endAt: string; status: "BOOKED" } }) => void) | undefined;
    vi.mocked(authApi.bookSlot).mockImplementation(() => new Promise((resolve) => {
      finishBooking = resolve as typeof finishBooking;
    }));

    render(
      <MemoryRouter initialEntries={["/book/doctor-1?step=1&date=2099-05-11&slot=future-free"]}>
        <BookingQuery />
        <Routes>
          <Route path="/book/:doctorId" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Book your appointment" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "2. Date & Time" })).not.toBeNull();
    expect(new URLSearchParams(screen.getByTestId("booking-query").textContent ?? "").get("step")).toBe("2");
    expect(screen.getByRole("button", { name: /15:00–15:30, selected/i }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "3. Patient Details" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Reason for visit *"), { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "These details are correct for my appointment." }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "4. Review" })).not.toBeNull();
    expect(screen.getByText("Follow-up")).not.toBeNull();
    expect(screen.getAllByText("Almaty · Central Clinic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("18 Abay Avenue, Office 101").length).toBeGreaterThan(0);

    const form = document.querySelector(".bk-action-form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(await screen.findByRole("button", { name: "Confirming…" })).not.toBeNull();
    expect(authApi.bookSlot).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Appointment Confirmed!" })).toBeNull();

    finishBooking?.({ slot: { id: "future-free", startAt: "2099-05-11T10:00:00.000Z", endAt: "2099-05-11T10:30:00.000Z", status: "BOOKED" } });
    expect(await screen.findByRole("heading", { name: "Appointment Confirmed!" })).not.toBeNull();
    expect(screen.getByText("Follow-up", { exact: false })).not.toBeNull();
  });

  it("does not allow a URL step parameter to skip booking requirements", async () => {
    authState.user = {
      id: "patient-user",
      role: "PATIENT",
      firstName: "Pat",
      lastName: "Patient",
      email: "pat@example.test",
      phone: "+1 555 0101",
    };
    vi.mocked(authApi.getSchedule).mockResolvedValue({
      doctor: {
        id: "doctor-1",
        office: "North Clinic",
        category: { name: "Cardiology" },
        user: { firstName: "Sam", lastName: "Doctor" },
      },
      slots: [{
        id: "future-free",
        startAt: "2099-05-11T10:00:00.000Z",
        endAt: "2099-05-11T10:30:00.000Z",
        status: "FREE",
      }],
    });

    render(
      <MemoryRouter initialEntries={["/book/doctor-1?step=4&date=2099-05-11&slot=future-free"]}>
        <BookingQuery />
        <Routes>
          <Route path="/book/:doctorId" element={<Schedule />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "3. Patient Details" })).not.toBeNull();
    await waitFor(() => {
      expect(new URLSearchParams(screen.getByTestId("booking-query").textContent ?? "").get("step")).toBe("3");
    });
    expect(screen.queryByRole("heading", { name: "4. Review" })).toBeNull();
  });
});
