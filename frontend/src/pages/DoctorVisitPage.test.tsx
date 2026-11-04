import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoctorVisitPage from "./DoctorVisitPage";
import { authApi } from "../lib/api";

vi.mock("../lib/api", () => ({ authApi: { doctorProfile: vi.fn(), getSchedule: vi.fn(), slotDetails: vi.fn(), updateSlot: vi.fn() }, api: vi.fn(() => Promise.resolve({ entries: [], hasMore: false, counts: {} })) }));
afterEach(cleanup);

const doctor = { id: "doctor-1", office: "Office 102", category: { name: "Pediatrics" }, user: { firstName: "Arman", lastName: "Akhmetov" } };
const future = new Date(Date.now() + 2 * 864e5);
const visit = { id: "slot-abcdefgh", startAt: future.toISOString(), endAt: new Date(future.getTime() + 18e5).toISOString(), status: "BOOKED" as const, visitPurpose: "Headache", patient: { id: "p1", firstName: "Jamie", lastName: "Patient", email: "jamie@example.test" } };
const renderPage = () => render(<MemoryRouter initialEntries={["/doctor/visits/slot-abcdefgh"]}><Routes><Route path="/doctor/visits/:slotId" element={<DoctorVisitPage />} /></Routes></MemoryRouter>);

describe("doctor visit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.doctorProfile).mockResolvedValue({ doctor });
    vi.mocked(authApi.slotDetails).mockResolvedValue({ slot: visit });
    vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor, slots: [visit] });
  });

  it("shows patient and visit details with notes locked until check-in", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Jamie Patient", level: 1 })).toBeTruthy();
    expect(screen.getByText("Visit · HP-ABCDEFGH")).toBeTruthy();
    expect(screen.getByText("jamie@example.test")).toBeTruthy();
    expect(screen.getByText("Headache")).toBeTruthy();
    expect(screen.getByText(/Notes open after the visit starts/)).toBeTruthy();
  });

  it("cancels a future visit only with a reason", async () => {
    vi.mocked(authApi.updateSlot).mockResolvedValue({ slot: { ...visit, status: "FREE", patient: null } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel visit" }));
    const buttons = screen.getAllByRole("button", { name: "Cancel visit" });
    const submit = buttons[buttons.length - 1];
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why are you cancelling/), { target: { value: "Doctor unavailable" } });
    fireEvent.click(submit);
    await waitFor(() => expect(authApi.updateSlot).toHaveBeenCalledWith("slot-abcdefgh", { status: "FREE", releaseBooking: true, cancellationReason: "Doctor unavailable" }));
  });
});
