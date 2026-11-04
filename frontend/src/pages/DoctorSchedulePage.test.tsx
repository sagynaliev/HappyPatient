import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorSchedulePage from "./DoctorSchedulePage";
import { authApi } from "../lib/api";

vi.mock("../lib/api", () => ({ authApi: { doctorProfile: vi.fn(), getSchedule: vi.fn(), slotDetails: vi.fn(), updateSlot: vi.fn(), createWorkingDays: vi.fn() } }));
afterEach(cleanup);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const doctor = { id: "doctor-1", office: "Office 102", category: { name: "Pediatrics" }, user: { firstName: "Arman", lastName: "Akhmetov" } };

describe("doctor schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor });
    vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor, slots: [
      { id: "visit-1", startAt: `${today}T05:00:00.000Z`, endAt: `${today}T05:30:00.000Z`, status: "BOOKED", visitPurpose: "Check-up", patient: { id: "p1", firstName: "Jamie", lastName: "Patient" } },
      { id: "free-1", startAt: `${today}T06:00:00.000Z`, endAt: `${today}T06:30:00.000Z`, status: "FREE" },
    ] });
    vi.mocked(authApi.slotDetails).mockResolvedValue({ slot: { id: "free-1", startAt: `${today}T06:00:00.000Z`, endAt: `${today}T06:30:00.000Z`, status: "FREE" } });
  });

  it("shows booked and free slots in one calendar and today's patient list", async () => {
    render(<MemoryRouter><DoctorSchedulePage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Booked 10:00–10:30, Jamie Patient/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Free 11:00–11:30/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Jamie Patient/ }).getAttribute("href")).toBe("/doctor/visits/visit-1");
  });

  it("opens a booked visit on its own page and manages free time in place", async () => {
    render(<MemoryRouter initialEntries={["/doctor/schedule"]}><Routes><Route path="/doctor/schedule" element={<DoctorSchedulePage />} /><Route path="/doctor/visits/:slotId" element={<p>Visit page</p>} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Free 11:00–11:30/ }));
    expect(authApi.slotDetails).toHaveBeenCalledWith("free-1");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Booked 10:00–10:30, Jamie Patient/ }));
    expect(await screen.findByText("Visit page")).toBeTruthy();
  });
});
